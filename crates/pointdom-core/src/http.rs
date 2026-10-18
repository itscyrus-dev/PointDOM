//! Authenticated loopback API compatible with the browser extension and MCP bridge.
use crate::{Error, Result, Service, model::*, service::*};
use axum::{
    Json, Router,
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, Request, State},
    http::{HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::any,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};
use subtle::ConstantTimeEq;
pub fn router(service: Service) -> Router {
    Router::new()
        .fallback(any(dispatch))
        .layer(DefaultBodyLimit::max(256 * 1024))
        .layer(middleware::from_fn_with_state(service.clone(), authorize))
        .with_state(service)
}
fn header<'a>(request: &'a Request, name: &str) -> &'a str {
    request
        .headers()
        .get(name)
        .and_then(|s| s.to_str().ok())
        .unwrap_or("")
}
fn extension(origin: &str) -> bool {
    origin
        .strip_prefix("chrome-extension://")
        .is_some_and(|id| id.len() == 32 && id.bytes().all(|c| (b'a'..=b'p').contains(&c)))
}
async fn authorize(State(service): State<Service>, request: Request, next: Next) -> Response {
    let path = request.uri().path();
    if header(&request, "host") != format!("127.0.0.1:{}", service.port) {
        return Error::Forbidden.into_response();
    }
    let local = path.starts_with("/api/local/");
    let mcp = path.starts_with("/api/mcp/");
    let origin = if header(&request, "origin").is_empty() {
        format!(
            "chrome-extension://{}",
            header(&request, "x-pagepatch-client")
        )
    } else {
        header(&request, "origin").into()
    };
    let authorized = {
        let s = service.inner.lock().await;
        let token = format!("Bearer {}", s.store.config.token);
        bool::from(
            header(&request, "authorization")
                .as_bytes()
                .ct_eq(token.as_bytes()),
        )
    };
    if local || mcp {
        if !header(&request, "origin").is_empty()
            || !header(&request, "x-pagepatch-client").is_empty()
            || header(
                &request,
                if local {
                    "x-pagepatch-local"
                } else {
                    "x-pagepatch-mcp"
                },
            ) != "1"
            || !authorized
        {
            return Error::Forbidden.into_response();
        }
    } else {
        if !extension(&origin) {
            return Error::Forbidden.into_response();
        }
        if request.method() != Method::OPTIONS && path != "/api/bootstrap" {
            if !authorized {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(json!({"error":"PAIRING_REQUIRED"})),
                )
                    .into_response();
            }
            if path != "/api/pair"
                && !service
                    .inner
                    .lock()
                    .await
                    .store
                    .config
                    .clients
                    .contains(&origin)
            {
                return Error::Forbidden.into_response();
            }
        }
    }
    let preflight = request.method() == Method::OPTIONS;
    let mut response = if preflight {
        StatusCode::NO_CONTENT.into_response()
    } else {
        next.run(request).await
    };
    let headers = response.headers_mut();
    headers.insert("cache-control", HeaderValue::from_static("no-store"));
    if !local && !mcp {
        if let Ok(v) = HeaderValue::from_str(&origin) {
            headers.insert("access-control-allow-origin", v);
        }
        headers.insert("vary", HeaderValue::from_static("Origin"));
        headers.insert(
            "access-control-allow-headers",
            HeaderValue::from_static("Authorization, Content-Type, X-PagePatch-Client"),
        );
        headers.insert(
            "access-control-allow-methods",
            HeaderValue::from_static("GET, POST, OPTIONS"),
        );
    }
    response
}
async fn dispatch(State(service): State<Service>, request: Request<Body>) -> Result<Response> {
    let method = request.method().clone();
    let path = request.uri().path().to_owned();
    let query: HashMap<String, String> = request
        .uri()
        .query()
        .map(|q| {
            url::form_urlencoded::parse(q.as_bytes())
                .into_owned()
                .collect()
        })
        .unwrap_or_default();
    let claim = header(&request, "x-pointdom-session").to_owned();
    let origin = if header(&request, "origin").is_empty() {
        format!(
            "chrome-extension://{}",
            header(&request, "x-pagepatch-client")
        )
    } else {
        header(&request, "origin").into()
    };
    let bytes = axum::body::to_bytes(request.into_body(), 256 * 1024)
        .await
        .map_err(|_| Error::Invalid("BODY_TOO_LARGE"))?;
    let input = if bytes.is_empty() {
        json!({})
    } else {
        parse_body(&bytes)?
    };
    let value = if path.starts_with("/api/mcp/") {
        mcp(&service, &method, &path, &query, &claim, &input).await?
    } else {
        browser(&service, &method, &path, &query, &origin, input).await?
    };
    let status = if (path == "/api/jobs" && method == Method::POST)
        || (path == "/api/bootstrap" && value["authorized"] == false)
    {
        StatusCode::ACCEPTED
    } else {
        StatusCode::OK
    };
    Ok((status, Json(value)).into_response())
}
fn parse_body(bytes: &Bytes) -> Result<Value> {
    serde_json::from_slice(bytes).map_err(|_| Error::Invalid("INVALID_JSON"))
}
async fn browser(
    service: &Service,
    method: &Method,
    path: &str,
    q: &HashMap<String, String>,
    origin: &str,
    input: Value,
) -> Result<Value> {
    match (method.as_str(), path) {
        ("GET", "/api/local/status") => Ok(
            json!({"connected":true,"pid":std::process::id(),"engine":"rust","bootstrap":true,"defaultExecutor":"mcp","transport":"mcp","automaticDelivery":false,"automaticCommits":false}),
        ),
        ("GET", "/api/local/snapshot") => Ok(service.snapshot().await),
        ("GET", "/api/projects") => {
            let s = service.inner.lock().await;
            Ok(
                json!({"projects":s.projects(),"agentSettings":{"defaultExecutor":"mcp","traeAutoSend":false}}),
            )
        }
        ("GET", "/api/settings") => Ok(json!({"defaultExecutor":"mcp","traeAutoSend":false})),
        ("POST", "/api/settings") | ("POST", "/api/local/defaults") => {
            if input.get("executor").is_some_and(|v| v != "mcp") {
                return Err(Error::Invalid("MCP_ONLY"));
            }
            Ok(json!({"defaultExecutor":"mcp","traeAutoSend":false}))
        }
        ("POST", "/api/pair") => {
            let mut s = service.inner.lock().await;
            let mut config = s.store.config.clone();
            if !config.clients.contains(&origin.into()) {
                config.clients.push(origin.into());
                crate::store::atomic(&s.store.directory, "config.json", &config)?;
                s.store.config = config;
            }
            Ok(
                json!({"connected":true,"version":env!("CARGO_PKG_VERSION"),"defaultExecutor":"mcp"}),
            )
        }
        ("POST", "/api/local/projects") => Ok(
            json!({"project":service.add_project(std::path::Path::new(text(&input,"path")?),text(&input,"name")?,text(&input,"origin")?).await?}),
        ),
        ("GET", "/api/mcp-config") => {
            let s = service.inner.lock().await;
            Ok(
                json!({"mcpServers":{"pointdom":{"command":service.mcp_binary,"args":["mcp"],"env":{"PAGEPATCH_HOME":s.store.directory}}}}),
            )
        }
        ("POST", "/api/local/bootstrap") => {
            let id = text(&input, "extensionId")?;
            let challenge = text(&input, "challenge")?;
            if !extension(&format!("chrome-extension://{id}"))
                || challenge.len() != 64
                || !challenge
                    .bytes()
                    .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
            {
                return Err(Error::Invalid("INVALID_CHALLENGE"));
            }
            let mut s = service.inner.lock().await;
            s.prune();
            if !s.grants.contains_key(id) && s.grants.len() >= 32 {
                return Err(Error::Conflict("TOO_MANY_CONNECTIONS"));
            }
            s.grants.insert(
                id.into(),
                (challenge.into(), Instant::now() + Duration::from_secs(900)),
            );
            Ok(json!({"authorized":true}))
        }
        ("POST", "/api/bootstrap") => {
            let nonce = text(&input, "nonce")?;
            if nonce.len() != 64
                || !nonce
                    .bytes()
                    .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
            {
                return Err(Error::Invalid("INVALID_CHALLENGE"));
            }
            let mut s = service.inner.lock().await;
            s.prune();
            let allowed = s
                .grants
                .get(origin.trim_start_matches("chrome-extension://"))
                .is_some_and(|(expected, _)| {
                    bool::from(expected.as_bytes().ct_eq(hash(nonce).as_bytes()))
                });
            if !allowed {
                let id = origin.trim_start_matches("chrome-extension://");
                if !s.pairing_requests.contains_key(id) && s.pairing_requests.len() >= 32 {
                    return Err(Error::Conflict("TOO_MANY_CONNECTIONS"));
                }
                s.pairing_requests.insert(
                    id.into(),
                    (hash(nonce), Instant::now() + Duration::from_secs(900)),
                );
            }
            Ok(if allowed {
                json!({"available":true,"authorized":true,"token":s.store.config.token})
            } else {
                json!({"available":true,"authorized":false})
            })
        }
        ("GET", "/api/agents") => {
            let project = q
                .get("projectId")
                .ok_or(Error::Invalid("PROJECT_REQUIRED"))?;
            service.project(project).await?;
            let mut s = service.inner.lock().await;
            s.prune();
            Ok(
                json!({"agents":s.connections.values().filter(|c|c.project_id==*project).collect::<Vec<_>>()}),
            )
        }
        ("GET", "/api/jobs") => {
            let s = service.inner.lock().await;
            if let Some(id) = q.get("projectId")
                && !s.store.config.projects.iter().any(|p| p.id == *id)
            {
                return Err(Error::NotFound);
            }
            Ok(
                json!({"jobs":s.store.jobs.iter().rev().filter(|j|q.get("projectId").is_none_or(|id|j.project_id==*id)).take(100).map(Job::public).collect::<Vec<_>>()}),
            )
        }
        ("POST", "/api/jobs") => service.submit(input).await,
        _ => {
            let parts: Vec<_> = path.split('/').collect();
            if parts.len() >= 4 && parts[2] == "jobs" {
                let id = parts[3];
                if method == Method::GET && parts.len() == 4 {
                    let s = service.inner.lock().await;
                    return s
                        .store
                        .jobs
                        .iter()
                        .find(|j| j.id == id)
                        .map(|j| json!({"job":j.public()}))
                        .ok_or(Error::NotFound);
                }
                if method == Method::POST && parts.get(4) == Some(&"cancel") {
                    return service.cancel(id).await;
                }
                if method == Method::POST && parts.get(4) == Some(&"recipient") {
                    let mut s = service.inner.lock().await;
                    s.prune();
                    let i = s
                        .store
                        .jobs
                        .iter()
                        .position(|j| j.id == id && j.executor == "mcp")
                        .ok_or(Error::NotFound)?;
                    let j = &s.store.jobs[i];
                    if j.status != Status::Queued || j.client_notification == Some(true) {
                        return Err(Error::Conflict("TASK_ALREADY_DISPATCHED"));
                    }
                    let recipient = s
                        .connections
                        .get(text(&input, "recipientId")?)
                        .filter(|c| c.project_id == j.project_id)
                        .ok_or(Error::Conflict("MCP_NOT_CONNECTED"))?
                        .clone();
                    if j.recipient.as_ref().map(|r| r.id.as_str())
                        != input["expectedRecipientId"].as_str()
                    {
                        return Err(Error::Conflict("RECIPIENT_CHANGED"));
                    }
                    let mut jobs = s.store.jobs.clone();
                    jobs[i]
                        .extra
                        .insert("recipientId".into(), json!(recipient.id));
                    jobs[i].recipient = Some(Recipient {
                        id: recipient.id,
                        name: recipient.name,
                    });
                    jobs[i].client_notification = recipient.thread.as_ref().map(|_| false);
                    jobs[i].thread_id = recipient.thread;
                    s.persist_jobs(jobs)?;
                    service.changed.notify_one();
                    return Ok(json!({"job":s.store.jobs[i].public()}));
                }
            }
            Err(Error::NotFound)
        }
    }
}
async fn mcp(
    service: &Service,
    method: &Method,
    path: &str,
    q: &HashMap<String, String>,
    claim: &str,
    input: &Value,
) -> Result<Value> {
    if method == Method::POST && text(input, "claim")? != claim {
        return Err(Error::Forbidden);
    }
    let project = if method == Method::GET {
        q.get("projectId")
            .map(String::as_str)
            .ok_or(Error::Invalid("PROJECT_REQUIRED"))?
    } else {
        text(input, "projectId")?
    };
    service.project(project).await?;
    match (method.as_str(), path) {
        ("POST", "/api/mcp/connections") => service.register(input, claim).await,
        ("POST", "/api/mcp/connections/wakeup") => {
            service
                .wakeup(
                    project,
                    claim,
                    text(input, "threadId")?,
                    input.get("notificationToken").and_then(Value::as_str),
                )
                .await
        }
        ("POST", "/api/mcp/connections/disconnect" | "/api/mcp/connections/detach") => {
            let mut s = service.inner.lock().await;
            s.detach(project, claim, path.ends_with("/disconnect"))?;
            service.changed.notify_waiters();
            Ok(json!({"ok":true}))
        }
        ("GET", "/api/mcp/tasks") => {
            let mut s = service.inner.lock().await;
            let c = s.session(project, claim)?.clone();
            let p = s.store.config.projects.iter().find(|p| p.id == project);
            Ok(
                json!({"project":p,"connection":{"id":c.id,"name":c.name},"tasks":s.store.jobs.iter().rev().filter(|j|j.project_id==project&&j.executor=="mcp"&&j.recipient.as_ref().is_some_and(|r|r.id==c.id)).take(100).map(|j|json!({"id":j.id,"instruction":j.instruction,"status":j.status,"recipient":j.recipient,"createdAt":j.created_at})).collect::<Vec<_>>()}),
            )
        }
        ("POST", "/api/mcp/wait") => {
            wait(
                service,
                project,
                claim,
                input["timeoutMs"]
                    .as_u64()
                    .filter(|t| (100..=25000).contains(t))
                    .ok_or(Error::Invalid("INVALID_TIMEOUT"))?,
            )
            .await
        }
        _ => {
            let parts: Vec<_> = path.split('/').collect();
            if parts.len() >= 5 && parts[3] == "tasks" {
                let id = parts[4];
                uuid(id)?;
                let action = if method == Method::GET && parts.len() == 5 {
                    "read"
                } else if method == Method::POST && parts.len() == 6 {
                    parts[5]
                } else {
                    return Err(Error::NotFound);
                };
                service.task(id, project, claim, action, input).await
            } else {
                Err(Error::NotFound)
            }
        }
    }
}
struct WaitGuard {
    service: Service,
    id: String,
    lease: String,
}
impl Drop for WaitGuard {
    fn drop(&mut self) {
        let service = self.service.clone();
        let id = self.id.clone();
        let lease = self.lease.clone();
        tokio::spawn(async move {
            let mut s = service.inner.lock().await;
            if let Some(c) = s.connections.get_mut(&id)
                && c.waiting.as_ref() == Some(&lease)
            {
                c.listening = false;
                c.waiting = None;
            }
        });
    }
}
async fn wait(service: &Service, project: &str, claim: &str, millis: u64) -> Result<Value> {
    let lease = uuid::Uuid::new_v4().to_string();
    let id = {
        let mut s = service.inner.lock().await;
        let c = s.session(project, claim)?;
        if c.waiting.is_some() {
            return Err(Error::Conflict("WAIT_ALREADY_ACTIVE"));
        }
        c.waiting = Some(lease.clone());
        c.listening = true;
        c.id.clone()
    };
    let _guard = WaitGuard {
        service: service.clone(),
        id: id.clone(),
        lease,
    };
    let deadline = Instant::now() + Duration::from_millis(millis);
    loop {
        let task = {
            let mut s = service.inner.lock().await;
            s.session(project, claim)?;
            let busy = s.store.jobs.iter().any(|j| {
                j.project_id == project && matches!(j.status, Status::Running | Status::Waiting)
            });
            if busy {
                None
            } else {
                s.store
                    .jobs
                    .iter()
                    .find(|j| {
                        j.project_id == project
                            && j.status == Status::Queued
                            && j.recipient.as_ref().is_some_and(|r| r.id == id)
                    })
                    .map(|j| j.id.clone())
            }
        };
        if task.is_some() || Instant::now() >= deadline {
            return Ok(json!({"taskId":task,"connectionId":id,"timedOut":task.is_none()}));
        }
        tokio::select! {_=service.stop.cancelled()=>return Err(Error::Conflict("SERVICE_STOPPED")),_=service.changed.notified()=>{},_=tokio::time::sleep(Duration::from_millis(200))=>{}}
    }
}
/// Run an already-bound loopback listener until the owner's shutdown signal resolves.
pub async fn serve(
    listener: tokio::net::TcpListener,
    service: Service,
    shutdown: impl std::future::Future<Output = ()> + Send + 'static,
) -> Result<()> {
    axum::serve(listener, router(service))
        .with_graceful_shutdown(shutdown)
        .await?;
    Ok(())
}
