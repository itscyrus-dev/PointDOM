//! Read-only macOS development-server observation. No shell, terminal output or model CLI execution.
use pointdom_core::{Service, model::Project};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
    sync::Mutex,
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub id: String,
    pub cwd: String,
    pub name: String,
    pub origins: Vec<String>,
}
#[derive(Clone, Serialize)]
pub struct View {
    pub status: &'static str,
    pub candidates: Vec<Candidate>,
}
pub struct Discovery {
    view: Mutex<View>,
    gate: Mutex<()>,
}
impl Default for Discovery {
    fn default() -> Self {
        Self {
            view: Mutex::new(View {
                status: "scanning",
                candidates: Vec::new(),
            }),
            gate: Mutex::new(()),
        }
    }
}
impl Discovery {
    pub async fn view(&self) -> View {
        self.view.lock().await.clone()
    }
    async fn update(&self, service: &Service) -> Vec<Candidate> {
        let result = if std::env::var_os("POINTDOM_DISCOVERY_DISABLED").is_some() {
            Err(())
        } else {
            let only_pid = if cfg!(debug_assertions) {
                std::env::var("POINTDOM_DISCOVERY_TEST_PID")
                    .ok()
                    .and_then(|value| value.parse().ok())
            } else {
                None
            };
            scan(only_pid).await
        };
        let (status, candidates) = match result {
            Ok(values) => ("ready", values),
            Err(()) => (
                if cfg!(target_os = "macos") {
                    "unavailable"
                } else {
                    "unsupported"
                },
                Vec::new(),
            ),
        };
        let mut addresses: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for candidate in &candidates {
            addresses
                .entry(candidate.cwd.clone())
                .or_default()
                .extend(candidate.origins.clone());
        }
        for values in addresses.values_mut() {
            values.sort();
            values.dedup();
        }
        service.observe_local(addresses).await;
        *self.view.lock().await = View {
            status,
            candidates: candidates.clone(),
        };
        candidates
    }
    pub async fn refresh(&self, service: &Service) {
        let _guard = self.gate.lock().await;
        self.update(service).await;
    }
    pub async fn confirm(&self, service: &Service, id: &str) -> Result<Project, String> {
        let _guard = self.gate.lock().await;
        // Recheck PID/start identity, source directory and socket ownership at confirmation.
        let current = self.update(service).await;
        let candidate = current
            .iter()
            .find(|c| c.id == id)
            .ok_or("DEVELOPMENT_SERVER_CHANGED")?;
        service
            .confirm_local(&PathBuf::from(&candidate.cwd))
            .await
            .map_err(|e| e.to_string())
    }
}

async fn output(binary: &str, args: &[&str]) -> Result<String, ()> {
    tokio::time::timeout(Duration::from_secs(2), async {
        let mut child = Command::new(binary)
            .args(args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|_| ())?;
        let mut bytes = Vec::new();
        child
            .stdout
            .take()
            .ok_or(())?
            .take(65537)
            .read_to_end(&mut bytes)
            .await
            .map_err(|_| ())?;
        if bytes.len() > 65536 {
            return Err(());
        }
        let status = child.wait().await.map_err(|_| ())?;
        // lsof returns 1 when any selector has no match, even with valid partial records.
        if !status.success() && !(binary.ends_with("lsof") && status.code() == Some(1)) {
            return Err(());
        }
        String::from_utf8(bytes).map_err(|_| ())
    })
    .await
    .map_err(|_| ())?
}

fn listeners(value: &str) -> BTreeMap<u32, BTreeSet<std::net::SocketAddr>> {
    let mut result = BTreeMap::new();
    let mut pid = None;
    let mut ipv6 = false;
    for line in value.lines() {
        if let Some(value) = line.strip_prefix('p') {
            pid = value.parse::<u32>().ok();
        }
        if let Some(value) = line.strip_prefix('t') {
            ipv6 = value == "IPv6";
        }
        if let (Some(pid), Some(address)) = (pid, line.strip_prefix('n')) {
            let Some((host, port)) = address.rsplit_once(':') else {
                continue;
            };
            let Ok(port) = port.parse::<u16>() else {
                continue;
            };
            let host = match host {
                "127.0.0.1" | "0.0.0.0" => "127.0.0.1",
                "[::1]" | "[::]" => "::1",
                "*" => {
                    if ipv6 {
                        "::1"
                    } else {
                        "127.0.0.1"
                    }
                }
                _ => continue,
            };
            if let Ok(ip) = host.parse() {
                result
                    .entry(pid)
                    .or_insert_with(BTreeSet::new)
                    .insert(std::net::SocketAddr::new(ip, port));
            }
        }
    }
    result
}
fn development_command(command: &str) -> bool {
    // Positive framework signatures only. Unknown Node servers stay in manual setup.
    let supported = [
        "/vite/bin/vite.js",
        "/node_modules/.bin/vite",
        "/node_modules/.bin/astro",
        "/node_modules/.bin/webpack-dev-server",
        "/webpack-dev-server/bin/webpack-dev-server.js",
        "/astro/astro.js",
        "/nuxi/bin/nuxi.mjs",
    ]
    .iter()
    .any(|entry| command.contains(entry))
        || ((command.contains("/next/dist/bin/next")
            || command.contains("/node_modules/.bin/next"))
            && command.split_whitespace().any(|arg| arg == "dev"));
    supported
        && !command.split_whitespace().any(|arg| {
            matches!(
                arg,
                "preview" | "build" | "start" | "generate" | "--root" | "--cwd" | "--prefix"
            )
        })
}
async fn http(address: std::net::SocketAddr) -> bool {
    tokio::time::timeout(Duration::from_millis(400), async {
        let mut stream = tokio::net::TcpStream::connect(address).await?;
        stream
            .write_all(
                format!("HEAD / HTTP/1.1\r\nHost: {address}\r\nConnection: close\r\n\r\n")
                    .as_bytes(),
            )
            .await?;
        let mut prefix = [0; 12];
        stream.read_exact(&mut prefix).await?;
        Ok::<_, std::io::Error>(prefix.starts_with(b"HTTP/1."))
    })
    .await
    .is_ok_and(|result| result.unwrap_or(false))
}
async fn localhost_owned(port: u16, sockets: &BTreeSet<std::net::SocketAddr>) -> bool {
    tokio::time::timeout(Duration::from_millis(500), async {
        let addresses = tokio::net::lookup_host(("localhost", port)).await.ok()?;
        let mut matched = false;
        for address in addresses.take(8) {
            if !address.ip().is_loopback() {
                return None;
            }
            if sockets.contains(&address) {
                matched = true;
                continue;
            }
            match tokio::net::TcpStream::connect(address).await {
                Err(error) if error.kind() == std::io::ErrorKind::ConnectionRefused => {}
                _ => return None, // Another listener, or ownership could not be established.
            }
        }
        matched.then_some(())
    })
    .await
    .is_ok_and(|result| result.is_some())
}
async fn cwd(pid: &str) -> Result<PathBuf, ()> {
    let value = output("/usr/sbin/lsof", &["-a", "-p", pid, "-d", "cwd", "-F0n"]).await?;
    let path = value
        .split('\0')
        .find_map(|field| field.trim_start_matches('\n').strip_prefix('n'))
        .ok_or(())?;
    PathBuf::from(path).canonicalize().map_err(|_| ())
}
async fn scan(only_pid: Option<u32>) -> Result<Vec<Candidate>, ()> {
    if !cfg!(target_os = "macos") {
        return Err(());
    }
    tokio::time::timeout(Duration::from_secs(6), async {
        let uid = output("/usr/bin/id", &["-u"]).await?;
        let uid = uid.trim();
        if !uid.bytes().all(|b| b.is_ascii_digit()) {
            return Err(());
        }
        let selection = only_pid.map(|p| p.to_string());
        let mut args = vec![
            "-nP",
            "-a",
            "-u",
            uid,
            "-c",
            "node",
            "-c",
            "next-server",
            "-iTCP",
            "-sTCP:LISTEN",
            "-Fptn",
        ];
        if let Some(pid) = &selection {
            args.extend(["-p", pid]);
        }
        let first = listeners(&output("/usr/sbin/lsof", &args).await?);
        let mut found = Vec::new();
        for (pid, sockets) in first.iter().take(32) {
            let pid = pid.to_string();
            let identity =
                match output("/bin/ps", &["-p", &pid, "-o", "lstart=", "-o", "command="]).await {
                    Ok(value) => value,
                    Err(()) => continue,
                };
            if !development_command(&identity) && !identity.contains("next-server") {
                continue;
            }
            let directory = match cwd(&pid).await {
                Ok(value) => value,
                Err(()) => continue,
            };
            let mut supported = development_command(&identity);
            if !supported
                && identity.contains("next-server")
                && let Ok(parent) = output("/bin/ps", &["-p", &pid, "-o", "ppid="]).await
            {
                let parent = parent.trim();
                if parent.parse::<u32>().is_ok()
                    && let Ok(command) = output("/bin/ps", &["-p", parent, "-o", "command="]).await
                {
                    supported = development_command(&command)
                        && cwd(parent).await.is_ok_and(|path| path == directory);
                }
            }
            if !supported
                || !directory.join("package.json").is_file()
                || directory.parent().is_none()
                || std::env::var_os("HOME")
                    .is_some_and(|home| directory == std::path::Path::new(&home))
            {
                continue;
            }
            let mut origins = Vec::new();
            for socket in sockets.iter().take(16) {
                if http(*socket).await {
                    origins.push(format!("http://{socket}"));
                    if localhost_owned(socket.port(), sockets).await {
                        origins.push(format!("http://localhost:{}", socket.port()));
                    }
                }
            }
            if origins.is_empty() {
                continue;
            }
            let latest =
                output("/bin/ps", &["-p", &pid, "-o", "lstart=", "-o", "command="]).await?;
            if latest != identity || !cwd(&pid).await.is_ok_and(|path| path == directory) {
                continue;
            }
            origins.sort();
            origins.dedup();
            let name = directory
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Project")
                .chars()
                .take(80)
                .collect();
            let cwd = directory.to_str().ok_or(())?.to_owned();
            let id = pointdom_core::model::hash(&format!("{pid}\n{identity}\n{cwd}\n{origins:?}"));
            found.push(Candidate {
                id,
                cwd,
                name,
                origins,
            });
        }
        // A socket that disappeared or changed owner during observation is not a candidate.
        let last = listeners(&output("/usr/sbin/lsof", &args).await?);
        if first != last {
            return Ok(Vec::new());
        }
        Ok(found)
    })
    .await
    .map_err(|_| ())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_only_loopback_or_local_wildcard_listeners() {
        let values = listeners(
            "p12\ntIPv4\nn127.0.0.1:5173\nn192.168.1.2:3000\np13\ntIPv6\nn[::1]:4000\nn*:5000\nnlocalhost.evil:1234\n",
        );
        assert_eq!(values.get(&12).map(BTreeSet::len), Some(1));
        assert_eq!(values.get(&13).map(BTreeSet::len), Some(2));
        assert!(development_command(
            "node /fixture/node_modules/vite/bin/vite.js"
        ));
        assert!(!development_command("node /fixture/server.js"));
        assert!(!development_command(
            "node /fixture/node_modules/vite/bin/vite.js preview"
        ));
    }
    #[cfg(target_os = "macos")]
    #[tokio::test]
    #[expect(
        clippy::unwrap_used,
        reason = "Disposable loopback socket fixture assertions"
    )]
    async fn localhost_alias_is_rejected_when_another_listener_owns_its_ipv6_address() {
        let ipv4 = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = ipv4.local_addr().unwrap();
        let ipv6_address =
            std::net::SocketAddr::new(std::net::Ipv6Addr::LOCALHOST.into(), address.port());
        let _ipv6 = tokio::net::TcpListener::bind(ipv6_address).await.unwrap();
        if tokio::net::lookup_host(("localhost", address.port()))
            .await
            .unwrap()
            .any(|address| address.is_ipv6())
        {
            assert!(!localhost_owned(address.port(), &BTreeSet::from([address])).await);
        }
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    #[expect(
        clippy::unwrap_used,
        reason = "Isolated native fixture setup and assertions"
    )]
    async fn native_fixture_discovers_source_and_changed_port_without_inspecting_other_processes() {
        struct Fixture(std::process::Child);
        impl Drop for Fixture {
            fn drop(&mut self) {
                let _ = self.0.kill();
                let _ = self.0.wait();
            }
        }
        let source = tempfile::TempDir::new().unwrap();
        let source = source.path().canonicalize().unwrap();
        let script = source.join("node_modules/vite/bin/vite.js");
        std::fs::create_dir_all(script.parent().unwrap()).unwrap();
        std::fs::write(source.join("package.json"), "{}").unwrap();
        std::fs::write(&script, "require('http').createServer((q,s)=>s.end()).listen(0,'127.0.0.1',function(){require('fs').writeFileSync(process.argv[2],String(this.address().port))})").unwrap();
        let mut previous = None;
        let mut first_port = None;
        for index in 0..2 {
            let port_file = source.join(format!("port-{index}"));
            let child = std::process::Command::new("node")
                .arg(&script)
                .arg(&port_file)
                .current_dir(&source)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .unwrap();
            let fixture = Fixture(child);
            for _ in 0..150 {
                if port_file.exists() {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
            let port = std::fs::read_to_string(port_file).unwrap();
            // Start the replacement while the old listener still holds its port.
            drop(previous.take());
            let candidates = scan(Some(fixture.0.id())).await.unwrap();
            assert_eq!(candidates.len(), 1);
            assert_eq!(candidates[0].cwd, source.to_str().unwrap());
            assert!(
                candidates[0]
                    .origins
                    .contains(&format!("http://127.0.0.1:{port}"))
            );
            if let Some(old) = first_port.as_ref() {
                assert!(
                    !candidates[0]
                        .origins
                        .contains(&format!("http://127.0.0.1:{old}"))
                );
            }
            first_port = Some(port);
            previous = Some(fixture);
        }
        let pid = previous.as_ref().unwrap().0.id();
        drop(previous);
        assert!(scan(Some(pid)).await.unwrap().is_empty());
    }
}
