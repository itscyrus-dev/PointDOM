//! Client-specific notification adapter. MCP remains the only task execution transport.
use crate::{Error, Result, model::*, service::Service};
use serde_json::{Value, json};
use std::{path::PathBuf, process::Stdio, time::Duration};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, Command},
};
fn executable() -> Result<PathBuf> {
    if !cfg!(target_os = "macos") {
        return Err(Error::Invalid("CLIENT_WAKEUP_UNSUPPORTED"));
    }
    ["ChatGPT", "Codex"]
        .iter()
        .map(|app| PathBuf::from(format!(
            "/Applications/{app}.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex"
        )))
        .find(|path| path.is_file())
        .ok_or(Error::Client)
}
struct Process(Child);
impl Drop for Process {
    fn drop(&mut self) {
        let _ = self.0.start_kill();
    }
}
async fn send(child: &mut Child, value: Value) -> Result<()> {
    let input = child.stdin.as_mut().ok_or(Error::Client)?;
    input.write_all(format!("{value}\n").as_bytes()).await?;
    input.flush().await?;
    Ok(())
}
async fn run(args: &[&str], project: &Project, thread: Option<&str>) -> Result<String> {
    let mut child = Command::new(executable()?)
        .args(args)
        .current_dir(&project.cwd)
        .kill_on_drop(true)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| Error::Client)?;
    let stdout = child.stdout.take().ok_or(Error::Client)?;
    let mut process = Process(child);
    tokio::time::timeout(Duration::from_secs(15), async {
        if let Some(thread) = thread {
            send(
                &mut process.0,
                json!({
                    "id": 1, "method": "initialize",
                    "params": {"clientInfo": {"name": "pointdom_metadata", "version": "1"}}
                }),
            )
            .await?;
            let mut reader = BufReader::new(stdout.take(2 * 1024 * 1024));
            let mut line = String::new();
            loop {
                line.clear();
                if reader.read_line(&mut line).await? == 0 {
                    return Err(Error::Client);
                }
                let message: Value = serde_json::from_str(&line).map_err(|_| Error::Client)?;
                if message.get("error").is_some() {
                    return Err(Error::Client);
                }
                match message["id"].as_u64() {
                    Some(1) => {
                        send(&mut process.0, json!({"method": "initialized"})).await?;
                        send(
                            &mut process.0,
                            json!({
                                "id": 2, "method": "thread/read", "params": {"threadId": thread}
                            }),
                        )
                        .await?;
                    }
                    Some(2) => return Ok(message["result"].to_string()),
                    _ => {}
                }
            }
        } else {
            drop(process.0.stdin.take());
            let mut output = String::new();
            stdout
                .take(2 * 1024 * 1024 + 1)
                .read_to_string(&mut output)
                .await?;
            if output.len() > 2 * 1024 * 1024 || !process.0.wait().await?.success() {
                return Err(Error::Client);
            }
            Ok(output)
        }
    })
    .await
    .map_err(|_| Error::Invalid("CLIENT_TIMEOUT"))?
}

/// Ask the running desktop host to reload MCP configuration without starting a turn.
pub async fn reload_codex_mcp() -> Result<()> {
    let mut child = Command::new(executable()?)
        .args(["app-server", "proxy"])
        .kill_on_drop(true)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| Error::Client)?;
    let input = child.stdin.take().ok_or(Error::Client)?;
    let output = child.stdout.take().ok_or(Error::Client)?;
    let _process = Process(child);
    tokio::time::timeout(Duration::from_secs(8), reload_exchange(input, output))
        .await
        .map_err(|_| Error::Invalid("CLIENT_TIMEOUT"))?
}
async fn reload_exchange(
    mut input: impl tokio::io::AsyncWrite + Unpin,
    output: impl tokio::io::AsyncRead + Unpin,
) -> Result<()> {
    let mut output = BufReader::new(output.take(256 * 1024));
    for (id, method, params) in [
        (
            1,
            "initialize",
            json!({"clientInfo": {"name": "pointdom_mcp_setup", "version": "1"}}),
        ),
        (2, "config/mcpServer/reload", Value::Null),
    ] {
        input
            .write_all(
                format!(
                    "{}\n",
                    json!({"id": id, "method": method, "params": params})
                )
                .as_bytes(),
            )
            .await?;
        input.flush().await?;
        loop {
            let mut line = String::new();
            if output.read_line(&mut line).await? == 0 {
                return Err(Error::Client);
            }
            let reply: Value = serde_json::from_str(&line).map_err(|_| Error::Client)?;
            if reply["id"].as_u64() != Some(id) {
                continue;
            }
            if reply.get("error").is_some() || reply.get("result").is_none() {
                return Err(Error::Client);
            }
            break;
        }
        if id == 1 {
            input.write_all(b"{\"method\":\"initialized\"}\n").await?;
        }
    }
    Ok(())
}

// Desktop projects can attach source folders while keeping a separate thread output cwd.
// Only host-owned local project membership may authorize that additional workspace.
fn host_project_contains(state: &Value, thread: &str, actual: &std::path::Path) -> bool {
    let assignment = &state["thread-project-assignments"][thread];
    let Some(id) = assignment["projectId"].as_str() else {
        return false;
    };
    let project = &state["local-projects"][id];
    assignment["projectKind"] == "local"
        && state["thread-project-membership-host-ids"][thread] == "local"
        && project["id"] == id
        && project["rootPaths"].as_array().is_some_and(|roots| {
            roots.iter().filter_map(Value::as_str).any(|root| {
                let path = std::path::Path::new(root);
                path.is_absolute() && path.canonicalize().is_ok_and(|p| p == actual)
            })
        })
}

fn attached_workspace(thread: &str, actual: &std::path::Path) -> bool {
    let home = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| crate::store::user_home().ok().map(|p| p.join(".codex")));
    let Some(path) = home.map(|p| p.join(".codex-global-state.json")) else {
        return false;
    };
    let state = std::fs::File::open(path).ok().and_then(|file| {
        let mut bytes = Vec::new();
        std::io::Read::read_to_end(
            &mut std::io::Read::take(file, 8 * 1024 * 1024 + 1),
            &mut bytes,
        )
        .ok()?;
        (bytes.len() <= 8 * 1024 * 1024)
            .then(|| serde_json::from_slice::<Value>(&bytes).ok())
            .flatten()
    });
    state.is_some_and(|state| host_project_contains(&state, thread, actual))
}

pub async fn verify(thread: &str, project: &Project) -> Result<()> {
    crate::service::uuid(thread)?;
    let actual = std::fs::canonicalize(&project.cwd)?;
    if actual != std::path::Path::new(&project.cwd) {
        return Err(Error::Conflict("CLIENT_PROJECT_MOVED"));
    }
    let value: Value =
        serde_json::from_str(&run(&["app-server", "--stdio"], project, Some(thread)).await?)?;
    let cwd = value["thread"]["cwd"].as_str().ok_or(Error::Client)?;
    if value["thread"]["id"] != thread
        || (std::fs::canonicalize(cwd)? != actual && !attached_workspace(thread, &actual))
    {
        return Err(Error::Conflict("CLIENT_PROJECT_MISMATCH"));
    }
    let help = run(&["queue", "--help"], project, None).await?;
    if !help.contains("--thread") || !help.contains("--message") {
        return Err(Error::Invalid("CLIENT_WAKEUP_UNSUPPORTED"));
    }
    Ok(())
}
async fn notify(thread: &str, job: &Job, project: &Project) -> Result<()> {
    verify(thread, project).await?;
    let elements = job
        .selections
        .as_deref()
        .unwrap_or(std::slice::from_ref(&job.selection));
    let preview = std::iter::once(job.instruction.as_str())
        .chain(elements.iter().filter_map(|e| e["description"].as_str()))
        .collect::<Vec<_>>()
        .join("; ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let preview = preview.chars().take(160).collect::<String>();
    let message = if job
        .extra
        .get("notificationLanguage")
        .and_then(Value::as_str)
        == Some("en")
    {
        format!(
            "PointDOM: {preview}\nTask: {}. Read the full request via MCP, then finish and end this turn.",
            job.id
        )
    } else {
        format!(
            "PointDOM：{preview}\n任务：{}。通过 MCP 读取完整要求并处理，完成后结束本轮。",
            job.id
        )
    };
    run(
        &["queue", "--thread", thread, "--message", &message],
        project,
        None,
    )
    .await?;
    Ok(())
}
fn cancellation_message(job: &Job) -> String {
    if job
        .extra
        .get("notificationLanguage")
        .and_then(Value::as_str)
        == Some("en")
    {
        format!(
            "PointDOM: the user cancelled task {}. Stop work on this task, do not claim or report it, and end this task's turn. Do not affect other tasks or revert existing edits.",
            job.id
        )
    } else {
        format!(
            "PointDOM：用户已取消任务 {}。停止处理此任务，不再领取或回报，并结束该任务本轮。不要影响其他任务，不要回滚已有修改。",
            job.id
        )
    }
}

pub async fn cancel_notification(job: Job, project: Project) -> Result<()> {
    let thread = job.thread_id.as_deref().ok_or(Error::Client)?;
    verify(thread, &project).await?;
    run(
        &[
            "queue",
            "--thread",
            thread,
            "--message",
            &cancellation_message(&job),
        ],
        &project,
        None,
    )
    .await?;
    Ok(())
}

/// Event-driven notifications with a durable attempt marker; ambiguous delivery is never replayed.
pub async fn notifications(service: Service) {
    loop {
        let next = {
            let mut s = service.inner.lock().await;
            s.prune();
            let index = s.store.jobs.iter().position(|j| {
                j.executor == "mcp"
                    && j.status == Status::Queued
                    && j.client_notification == Some(false)
                    && !s.store.jobs.iter().any(|o| {
                        o.id != j.id
                            && o.project_id == j.project_id
                            && (matches!(o.status, Status::Running | Status::Waiting)
                                || (o.status == Status::Queued
                                    && o.client_notification == Some(true)))
                    })
            });
            if let Some(i) = index {
                let job = &s.store.jobs[i];
                let project = s
                    .store
                    .config
                    .projects
                    .iter()
                    .find(|p| p.id == job.project_id)
                    .cloned();
                let valid = job
                    .recipient
                    .as_ref()
                    .and_then(|r| s.connections.get(&r.id))
                    .is_some_and(|c| c.thread == job.thread_id && c.wakeable);
                let mut jobs = s.store.jobs.clone();
                jobs[i].client_notification = Some(true);
                if !valid {
                    jobs[i].finish(Status::Failed);
                    jobs[i].error = Some("CLIENT_CONNECTION_CHANGED".into());
                } else {
                    jobs[i].event("CLIENT_NOTIFYING");
                }
                let job = jobs[i].clone();
                match s.persist_jobs(jobs) {
                    Ok(()) if valid => project.map(|p| (job, p)),
                    Ok(()) => None,
                    Err(_) => {
                        service.stop.cancel();
                        None
                    }
                }
            } else {
                None
            }
        };
        if let Some((job, project)) = next {
            let service = service.clone();
            tokio::spawn(async move {
                deliver(service, job, project).await;
            });
            continue;
        }
        tokio::select! {_ = service.stop.cancelled()=>break,_=service.changed.notified()=>{},_ = tokio::time::sleep(Duration::from_secs(15))=>{}}
    }
}
async fn deliver(service: Service, job: Job, project: Project) {
    let Some(thread) = job.thread_id.as_deref() else {
        return;
    };
    let delivered = tokio::select! {r=notify(thread,&job,&project)=>r.is_ok(),_=service.stop.cancelled()=>false};
    {
        let mut s = service.inner.lock().await;
        let mut jobs = s.store.jobs.clone();
        if let Some(j) = jobs
            .iter_mut()
            .find(|j| j.id == job.id && !j.status.terminal())
        {
            if delivered {
                j.event("CLIENT_NOTIFIED");
            } else if j.status == Status::Queued {
                j.finish(Status::Failed);
                j.error = Some("CLIENT_NOTIFY_UNCONFIRMED".into());
            }
        }
        if s.persist_jobs(jobs).is_err() {
            service.stop.cancel();
            return;
        }
    }
    if delivered {
        tokio::select! {_=service.stop.cancelled()=>return,_=tokio::time::sleep(Duration::from_secs(60))=>{}}
        let mut s = service.inner.lock().await;
        let mut jobs = s.store.jobs.clone();
        if let Some(j) = jobs
            .iter_mut()
            .find(|j| j.id == job.id && j.status == Status::Queued)
        {
            j.finish(Status::Failed);
            j.error = Some("CLIENT_NOT_CLAIMED".into());
        }
        if s.persist_jobs(jobs).is_err() {
            service.stop.cancel();
        }
    }
    service.changed.notify_one();
}

#[cfg(test)]
#[expect(
    clippy::unwrap_used,
    reason = "Fixture setup and assertions fail immediately"
)]
mod reload_tests {
    use super::*;

    #[test]
    fn cancel_message_scopes_stop_to_one_task_without_reusing_page_instructions() {
        let mut job: Job = serde_json::from_value(json!({
            "id":"00000000-0000-4000-8000-000000000001", "projectId":"project",
            "instruction":"UNTRUSTED_REQUEST", "selection":{}, "status":"cancelled",
            "createdAt":now(),"updatedAt":now()
        }))
        .unwrap();
        for language in ["en", "zh-CN"] {
            job.extra
                .insert("notificationLanguage".into(), json!(language));
            let message = cancellation_message(&job);
            assert!(message.contains(&job.id));
            assert!(!message.contains("UNTRUSTED_REQUEST"));
            assert!(message.contains(if language == "en" {
                "Do not affect other tasks"
            } else {
                "不要影响其他任务"
            }));
        }
    }

    #[test]
    fn attached_source_requires_exact_local_project_membership() {
        let root = tempfile::tempdir().unwrap();
        let actual = root.path().canonicalize().unwrap();
        let state = json!({
            "thread-project-assignments": {"thread": {"projectKind": "local", "projectId": "project"}},
            "thread-project-membership-host-ids": {"thread": "local"},
            "local-projects": {"project": {"id": "project", "rootPaths": [actual]}}
        });
        assert!(host_project_contains(&state, "thread", &actual));
        assert!(!host_project_contains(&state, "other-thread", &actual));
        assert!(!host_project_contains(&json!({}), "thread", &actual));
        for (pointer, replacement) in [
            (
                "/thread-project-assignments/thread/projectKind",
                json!("chatgpt"),
            ),
            (
                "/thread-project-assignments/thread/projectId",
                json!("other-project"),
            ),
            (
                "/thread-project-membership-host-ids/thread",
                json!("remote"),
            ),
            ("/local-projects/project/id", json!("other-project")),
            (
                "/local-projects/project/rootPaths",
                json!([actual.join("child")]),
            ),
            (
                "/local-projects/project/rootPaths",
                json!([actual.parent()]),
            ),
            (
                "/local-projects/project/rootPaths",
                json!(["relative/path"]),
            ),
        ] {
            let mut changed = state.clone();
            *changed.pointer_mut(pointer).unwrap() = replacement;
            assert!(
                !host_project_contains(&changed, "thread", &actual),
                "{pointer}"
            );
        }
    }

    async fn fixture(response: Value) -> Result<()> {
        let (client, server) = tokio::io::duplex(4096);
        let server_task = tokio::spawn(async move {
            let (read, mut write) = tokio::io::split(server);
            let mut read = BufReader::new(read).lines();
            let init: Value =
                serde_json::from_str(&read.next_line().await.unwrap().unwrap()).unwrap();
            assert_eq!(init["method"], "initialize");
            write
                .write_all(b"{\"id\":1,\"result\":{}}\n")
                .await
                .unwrap();
            let ready: Value =
                serde_json::from_str(&read.next_line().await.unwrap().unwrap()).unwrap();
            assert_eq!(ready["method"], "initialized");
            let reload: Value =
                serde_json::from_str(&read.next_line().await.unwrap().unwrap()).unwrap();
            assert_eq!(
                reload,
                json!({"id":2,"method":"config/mcpServer/reload","params":null})
            );
            write
                .write_all(format!("{response}\n").as_bytes())
                .await
                .unwrap();
        });
        let (read, write) = tokio::io::split(client);
        let result = reload_exchange(write, read).await;
        server_task.await.unwrap();
        result
    }

    #[tokio::test]
    async fn refresh_requires_acknowledgement_without_starting_a_turn() {
        assert!(fixture(json!({"id":2,"result":{}})).await.is_ok());
    }
    #[tokio::test]
    async fn unsupported_refresh_is_not_success() {
        assert!(
            fixture(json!({"id":2,"error":{"code":-32601}}))
                .await
                .is_err()
        );
    }
    #[tokio::test]
    async fn unrelated_reply_is_not_refresh_confirmation() {
        assert!(fixture(json!({"id":3,"result":{}})).await.is_err());
    }
}
