//! Native service/MCP and local setup commands. No model execution or shell forwarding.
use pointdom_core::{Error, Result, Service, model::Config, store};
use serde_json::{Value, json};
use std::{path::PathBuf, time::Duration};
#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
fn config() -> Result<Config> {
    let mut config: Config =
        serde_json::from_slice(&std::fs::read(store::home()?.join("config.json"))?)?;
    config.projects.retain(|p| !p.removed());
    Ok(config)
}
async fn request(port: u16, path: &str, body: Option<Value>) -> Result<Value> {
    let config = config()?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|_| Error::Client)?;
    let url = format!("http://127.0.0.1:{port}/api/local{path}");
    let request = if let Some(body) = body {
        client.post(url).json(&body)
    } else {
        client.get(url)
    };
    let response = request
        .bearer_auth(config.token)
        .header("X-PagePatch-Local", "1")
        .send()
        .await
        .map_err(|_| Error::Conflict("SERVICE_UNAVAILABLE"))?;
    if !response.status().is_success() {
        return Err(Error::Conflict("SERVICE_REJECTED_REQUEST"));
    }
    response
        .json()
        .await
        .map_err(|_| Error::Invalid("INVALID_SERVICE_RESPONSE"))
}
async fn shutdown_signal() {
    #[cfg(unix)]
    {
        if let Ok(mut term) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            tokio::select! {_=tokio::signal::ctrl_c()=>{},_=term.recv()=>{}}
            return;
        }
    }
    let _ = tokio::signal::ctrl_c().await;
}
async fn run() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let port = std::env::var("POINTDOM_PORT")
        .ok()
        .map(|s| s.parse::<u16>())
        .transpose()
        .map_err(|_| Error::Invalid("INVALID_PORT"))?
        .unwrap_or(4318);
    match args.get(1).map(String::as_str).unwrap_or("help") {
        "mcp" => pointdom_core::mcp::serve(store::home()?, port).await,
        "serve" => {
            // Acquiring the port precedes storage migration; never touch a live legacy service.
            let listener =
                tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await?;
            let service = Service::open(store::home()?, port, std::env::current_exe()?)?;
            let notifications =
                tokio::spawn(pointdom_core::clients::notifications(service.clone()));
            let shutdown = service.clone();
            pointdom_core::http::serve(listener, service, async move {
                shutdown_signal().await;
                let _ = shutdown.shutdown().await;
            })
            .await?;
            notifications.abort();
            Ok(())
        }
        "link" => {
            let origin = args
                .windows(2)
                .find(|pair| pair[0] == "--origin")
                .map(|pair| pair[1].as_str())
                .ok_or(Error::Invalid("ORIGIN_REQUIRED"))?;
            let cwd = std::env::current_dir()?;
            let name = args
                .windows(2)
                .find(|pair| pair[0] == "--name")
                .map(|pair| pair[1].clone())
                .or_else(|| cwd.file_name().map(|s| s.to_string_lossy().into_owned()))
                .ok_or(Error::Invalid("NAME_REQUIRED"))?;
            let response = request(
                port,
                "/projects",
                Some(json!({"path":cwd,"name":name,"origin":origin})),
            )
            .await?;
            println!("{}", serde_json::to_string_pretty(&response)?);
            Ok(())
        }
        "status" => {
            println!("{}", request(port, "/status", None).await?);
            Ok(())
        }
        "projects" => {
            println!("{}", serde_json::to_string_pretty(&config()?.projects)?);
            Ok(())
        }
        "pair" => {
            println!("{}", config()?.token);
            Ok(())
        }
        "connect" => {
            println!(
                "{}",
                serde_json::to_string_pretty(
                    &json!({"mcpServers":{"pointdom":{"command":std::env::current_exe()?,"args":["mcp"],"env":{"PAGEPATCH_HOME":store::home()?,"POINTDOM_PORT":port.to_string()}}}})
                )?
            );
            Ok(())
        }
        "extension" => {
            let executable = std::env::current_exe()?;
            let directory = if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../dist/extension")
            } else {
                let parent = executable.parent().ok_or(Error::Invalid("INVALID_PATH"))?;
                let sibling = parent.join("extension");
                if sibling.is_dir() {
                    sibling
                } else {
                    parent
                        .parent()
                        .ok_or(Error::Invalid("INVALID_PATH"))?
                        .join("extension")
                }
            };
            println!("{}", directory.display());
            Ok(())
        }
        "version" | "--version" => {
            println!("{}", env!("CARGO_PKG_VERSION"));
            Ok(())
        }
        _ => {
            println!(
                "PointDOM native\n  pointdom serve              Start the loopback service\n  pointdom mcp                MCP stdio connection\n  pointdom link --origin URL  Register this source directory\n  pointdom pair              Show your local pairing code\n  pointdom projects          List registered projects\n  pointdom connect --json    Print MCP configuration\n  pointdom status            Check the local service\n  pointdom extension --path  Show the packaged extension directory\n  pointdom version           Show version"
            );
            Ok(())
        }
    }
}
