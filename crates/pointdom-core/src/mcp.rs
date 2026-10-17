//! Newline-delimited JSON-RPC stdio server. Stdout is reserved exclusively for MCP.
use crate::{
    Error, Result,
    model::Config,
    service::{text, uuid},
};
use futures_util::StreamExt;
use serde_json::{Value, json};
use std::{collections::BTreeSet, path::PathBuf, sync::Arc, time::Duration};
use tokio::{
    io::AsyncWriteExt,
    sync::{Mutex, RwLock, mpsc},
    task::JoinSet,
};
use tokio_util::{
    codec::{FramedRead, LinesCodec},
    sync::CancellationToken,
};
use uuid::Uuid;
#[derive(Clone)]
struct Session {
    directory: PathBuf,
    claim: String,
    client: Arc<RwLock<Value>>,
    bound: Arc<Mutex<BTreeSet<String>>>,
    http: reqwest::Client,
    base: String,
    stop: CancellationToken,
}
impl Session {
    fn config(&self) -> Result<Config> {
        let mut config: Config =
            serde_json::from_slice(&std::fs::read(self.directory.join("config.json"))?)?;
        config.projects.retain(|p| !p.removed());
        Ok(config)
    }
    async fn request(&self, path: &str, body: Option<Value>) -> Result<Value> {
        let config = self.config()?;
        let url = format!("{}{path}", self.base);
        let mut request = if let Some(body) = body {
            self.http.post(url).json(&body)
        } else {
            self.http.get(url)
        };
        request = request
            .bearer_auth(config.token)
            .header("X-PagePatch-MCP", "1")
            .header("X-PointDOM-Session", &self.claim);
        let response = request
            .send()
            .await
            .map_err(|_| Error::Conflict("SERVICE_UNAVAILABLE"))?;
        let success = response.status().is_success();
        let value: Value = response
            .json()
            .await
            .map_err(|_| Error::Invalid("INVALID_SERVICE_RESPONSE"))?;
        if !success {
            return Err(match value["error"].as_str() {
                Some("MCP_RECONNECT_REQUIRED") => Error::Conflict("MCP_RECONNECT_REQUIRED"),
                Some("TASK_ENDED") => Error::Conflict("TASK_ENDED"),
                Some("PROJECT_BUSY") => Error::Conflict("PROJECT_BUSY"),
                Some("CLIENT_PROJECT_MISMATCH") => Error::Conflict("CLIENT_PROJECT_MISMATCH"),
                Some("CLIENT_PROJECT_MOVED") => Error::Conflict("CLIENT_PROJECT_MOVED"),
                Some("CLIENT_WAKEUP_UNSUPPORTED") => Error::Invalid("CLIENT_WAKEUP_UNSUPPORTED"),
                Some("CLIENT_TIMEOUT") => Error::Invalid("CLIENT_TIMEOUT"),
                Some("CLIENT_UNAVAILABLE") => Error::Client,
                _ => Error::Conflict("SERVICE_REJECTED_REQUEST"),
            });
        }
        Ok(value)
    }
    async fn register(&self, project: &str) -> Result<()> {
        self.request(
            "/connections",
            Some(
                json!({"projectId":project,"claim":self.claim,"client":*self.client.read().await}),
            ),
        )
        .await?;
        Ok(())
    }
    async fn call(&self, name: &str, args: Value) -> Result<Value> {
        let name = name.replace("pagepatch_", "pointdom_");
        if name == "pointdom_list_projects" {
            return Ok(json!({"projects":self.config()?.projects}));
        }
        if name == "pointdom_bind_project" {
            let path = PathBuf::from(text(&args, "path")?);
            if !path.is_absolute() {
                return Err(Error::Invalid("ABSOLUTE_WORKSPACE_REQUIRED"));
            }
            let actual = path.canonicalize()?;
            let config = self.config()?;
            let project = config
                .projects
                .iter()
                .find(|p| {
                    std::path::Path::new(&p.cwd)
                        .canonicalize()
                        .is_ok_and(|registered| registered == actual)
                })
                .ok_or(Error::NotFound)?;
            self.register(&project.id).await?;
            self.bound.lock().await.insert(project.id.clone());
            return self
                .request(&format!("/tasks?projectId={}", project.id), None)
                .await;
        }
        let project = text(&args, "projectId")?;
        uuid(project)?;
        if !self.bound.lock().await.contains(project) {
            return Err(Error::Forbidden);
        }
        self.register(project).await?;
        let mut body = args.clone();
        body["claim"] = json!(self.claim);
        body.as_object_mut()
            .ok_or(Error::Invalid("INVALID_ARGUMENTS"))?
            .remove("taskId");
        match name.as_str() {
            "pointdom_list_tasks" => {
                self.request(&format!("/tasks?projectId={project}"), None)
                    .await
            }
            "pointdom_enable_wakeup" => self.request("/connections/wakeup", Some(body)).await,
            "pointdom_wait_for_task" => {
                body.as_object_mut()
                    .ok_or(Error::Invalid("INVALID_ARGUMENTS"))?
                    .remove("timeoutSeconds");
                body["timeoutMs"] = json!(args["timeoutSeconds"].as_u64().unwrap_or(25) * 1000);
                self.request("/wait", Some(body)).await
            }
            _ => {
                let id = text(&args, "taskId")?;
                uuid(id)?;
                let action = match name.as_str() {
                    "pointdom_get_task" => "",
                    "pointdom_claim_task" => "/claim",
                    "pointdom_progress_task" => "/progress",
                    "pointdom_report_task" => "/report",
                    _ => return Err(Error::NotFound),
                };
                if action.is_empty() {
                    self.request(&format!("/tasks/{id}?projectId={project}"), None)
                        .await
                } else {
                    self.request(&format!("/tasks/{id}{action}"), Some(body))
                        .await
                }
            }
        }
    }
}
pub fn tools() -> Result<Vec<Value>> {
    Ok(serde_json::from_str(include_str!(
        "../contracts/tools.json"
    ))?)
}
/// Serve a single native MCP connection until stdin closes. The process owns its private claim.
pub async fn serve(directory: PathBuf, port: u16) -> Result<()> {
    let session = Session {
        directory,
        claim: Uuid::new_v4().to_string(),
        client: Arc::new(RwLock::new(
            json!({"name":"mcp-client","version":"unknown"}),
        )),
        bound: Arc::new(Mutex::new(BTreeSet::new())),
        http: reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|_| Error::Client)?,
        base: format!("http://127.0.0.1:{port}/api/mcp"),
        stop: CancellationToken::new(),
    };
    let heartbeat = session.clone();
    let heartbeat = tokio::spawn(async move {
        loop {
            tokio::select! {_=heartbeat.stop.cancelled()=>break,_=tokio::time::sleep(Duration::from_secs(15))=>{let projects=heartbeat.bound.lock().await.clone();for p in projects {let _=heartbeat.register(&p).await;}}}
        }
    });
    let (tx, mut rx) = mpsc::channel::<Value>(32);
    let writer = tokio::spawn(async move {
        let mut stdout = tokio::io::stdout();
        while let Some(value) = rx.recv().await {
            stdout.write_all(format!("{value}\n").as_bytes()).await?;
            stdout.flush().await?;
        }
        std::io::Result::Ok(())
    });
    let mut lines = FramedRead::new(
        tokio::io::stdin(),
        LinesCodec::new_with_max_length(256 * 1024),
    );
    let mut workers = JoinSet::new();
    let mut initialized = false;
    let mut active = std::collections::HashMap::<String, CancellationToken>::new();
    loop {
        tokio::select! {
            _=tokio::signal::ctrl_c()=>break,
            completed=workers.join_next(),if !workers.is_empty()=>{if let Some(Ok(key))=completed{active.remove(&key);}},
            line=lines.next()=>{
                let Some(Ok(line))=line else{break;};let msg:Value=match serde_json::from_str(&line){Ok(msg)=>msg,Err(_)=>{let _=tx.send(json!({"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}})).await;continue;}};
                let id=msg.get("id").cloned();let method=msg["method"].as_str().unwrap_or("");
                if method=="notifications/cancelled" {if let Some(token)=active.get(&msg["params"]["requestId"].to_string()){token.cancel();}continue;}
                let Some(id)=id else{continue;};
                if msg["jsonrpc"]!="2.0" {let _=tx.send(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32600,"message":"Invalid request"}})).await;continue;}
                let result=match method {
                    "initialize" if !initialized=>{initialized=true;let info=&msg["params"]["clientInfo"];*session.client.write().await=json!({"name":info["name"].as_str().unwrap_or("mcp-client"),"version":info["version"].as_str().unwrap_or("unknown")});Some(Ok(json!({"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"pointdom","version":env!("CARGO_PKG_VERSION")}})))},
                    "ping"=>Some(Ok(json!({}))),
                    "tools/list" if initialized=>Some(tools().map(|tools|json!({"tools":tools}))),
                    "tools/call" if initialized=>{
                        if workers.len()>=32 {Some(Err(Error::Conflict("TOO_MANY_REQUESTS")))}else{
                            let key=id.to_string();if active.contains_key(&key){Some(Err(Error::Invalid("DUPLICATE_REQUEST_ID")))}else{
                                let cancellation=CancellationToken::new();active.insert(key.clone(),cancellation.clone());let tx=tx.clone();let session=session.clone();let params=msg["params"].clone();
                                let response_id=id.clone();
                                workers.spawn(async move{
                                    let call=async {let name=text(&params,"name")?;let args=params.get("arguments").cloned().unwrap_or_else(||json!({}));let definitions=tools()?;let canonical=name.replace("pagepatch_","pointdom_");let tool=definitions.iter().find(|t|t["name"]==canonical).ok_or(Error::NotFound)?;let validator=jsonschema::options().should_validate_formats(true).build(&tool["inputSchema"]).map_err(|_|Error::Invalid("INVALID_CONTRACT"))?;if !validator.is_valid(&args){return Err(Error::Invalid("INVALID_ARGUMENTS"));}session.call(name,args).await};
                                    let result=tokio::select!{r=call=>r,_=cancellation.cancelled()=>Err(Error::Conflict("REQUEST_CANCELLED"))};
                                    let content=match result {Ok(v)=>json!({"content":[{"type":"text","text":serde_json::to_string_pretty(&v).unwrap_or_default()}]}),Err(e)=>json!({"content":[{"type":"text","text":e.to_string()}],"isError":true})};
                                    let _=tx.send(json!({"jsonrpc":"2.0","id":response_id,"result":content})).await;key
                                });None
                            }
                        }
                    },
                    _=>Some(Err(Error::Invalid("METHOD_NOT_FOUND")))
                };
                if let Some(result)=result {let response=match result{Ok(value)=>json!({"jsonrpc":"2.0","id":id,"result":value}),Err(e)=>json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":e.to_string()}})};if tx.send(response).await.is_err(){break;}}
            }
        }
    }
    session.stop.cancel();
    heartbeat.abort();
    workers.abort_all();
    while workers.join_next().await.is_some() {}
    let projects = session.bound.lock().await.clone();
    for p in projects {
        let _ = session
            .request(
                "/connections/disconnect",
                Some(json!({"projectId":p,"claim":session.claim})),
            )
            .await;
    }
    drop(tx);
    writer.await.map_err(|_| Error::Client)??;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn removed_projects_are_not_listed_or_bindable() -> Result<()> {
        let home = tempfile::tempdir()?;
        let source = tempfile::tempdir()?;
        let service =
            crate::Service::open(home.path().into(), 14318, PathBuf::from("/test/pointdom"))?;
        let old = service
            .add_project(source.path(), "Fixture", "http://localhost:3000")
            .await?;
        service.remove_project(&old.id).await?;
        let session = Session {
            directory: home.path().into(),
            claim: Uuid::new_v4().to_string(),
            client: Arc::new(RwLock::new(json!({"name":"fixture","version":"1"}))),
            bound: Arc::new(Mutex::new(BTreeSet::new())),
            http: reqwest::Client::new(),
            base: "http://127.0.0.1:1/api/mcp".into(),
            stop: CancellationToken::new(),
        };
        assert_eq!(
            session.call("pointdom_list_projects", json!({})).await?,
            json!({"projects":[]})
        );
        assert!(matches!(
            session
                .call("pointdom_bind_project", json!({"path":source.path()}))
                .await,
            Err(Error::NotFound)
        ));
        let fresh = service
            .add_project(source.path(), "Fixture", "http://localhost:3000")
            .await?;
        let listed = session.call("pointdom_list_projects", json!({})).await?;
        assert_eq!(listed["projects"].as_array().map(Vec::len), Some(1));
        assert_eq!(listed["projects"][0]["id"], fresh.id);
        assert_ne!(fresh.id, old.id);
        Ok(())
    }
}
