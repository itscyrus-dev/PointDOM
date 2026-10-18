//! Domain operations. Every mutation is serialized and persisted before acknowledgement.
use crate::{Error, Result, model::*, store::Store};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{Mutex, Notify};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;
pub struct State {
    pub store: Store,
    pub connections: BTreeMap<String, Connection>,
    sessions: BTreeMap<String, String>,
    pub grants: BTreeMap<String, (String, Instant)>,
    pub local_origins: BTreeMap<String, (Vec<String>, Instant)>,
    pub pairing_requests: BTreeMap<String, (String, Instant)>,
}
#[derive(Clone)]
pub struct Service {
    pub inner: Arc<Mutex<State>>,
    pub changed: Arc<Notify>,
    pub stop: CancellationToken,
    pub port: u16,
    pub mcp_binary: PathBuf,
}
impl Service {
    pub fn open(directory: PathBuf, port: u16, mcp_binary: PathBuf) -> Result<Self> {
        let store = Store::open(directory)?;
        let connections = store
            .bindings
            .iter()
            .filter(|(_, b)| {
                store
                    .config
                    .projects
                    .iter()
                    .any(|p| !p.removed() && p.id == b.project_id && p.cwd == b.cwd)
            })
            .map(|(id, b)| {
                (
                    id.clone(),
                    Connection {
                        id: id.clone(),
                        project_id: b.project_id.clone(),
                        name: if b.name.is_empty() {
                            "codex-mcp-client".into()
                        } else {
                            b.name.clone()
                        },
                        version: b.version.clone(),
                        connected_at: now(),
                        last_seen_at: now(),
                        connected: false,
                        listening: false,
                        wakeable: true,
                        seen: Instant::now(),
                        waiting: None,
                        thread: Some(b.thread_id.clone()),
                    },
                )
            })
            .collect();
        Ok(Self {
            inner: Arc::new(Mutex::new(State {
                store,
                connections,
                sessions: BTreeMap::new(),
                grants: BTreeMap::new(),
                pairing_requests: BTreeMap::new(),
                local_origins: BTreeMap::new(),
            })),
            changed: Arc::new(Notify::new()),
            stop: CancellationToken::new(),
            port,
            mcp_binary,
        })
    }
    pub async fn approve_extension(&self, id: &str, challenge: &str) -> Result<()> {
        let mut state = self.inner.lock().await;
        state.prune();
        if !state
            .pairing_requests
            .get(id)
            .is_some_and(|(expected, _)| expected == challenge)
        {
            return Err(Error::Conflict("PAIRING_REQUEST_EXPIRED"));
        }
        if !state.grants.contains_key(id) && state.grants.len() >= 32 {
            return Err(Error::Conflict("TOO_MANY_CONNECTIONS"));
        }
        state.grants.insert(
            id.into(),
            (challenge.into(), Instant::now() + Duration::from_secs(900)),
        );
        state.pairing_requests.remove(id);
        Ok(())
    }
    pub async fn shutdown(&self) -> Result<()> {
        self.stop.cancel();
        let mut s = self.inner.lock().await;
        for j in &mut s.store.jobs {
            if !j.status.terminal()
                && (j.status != Status::Queued || j.client_notification.is_some())
            {
                j.finish(Status::Interrupted);
                j.error = Some("SERVICE_STOPPED".into());
            }
        }
        s.store.save_jobs()?;
        self.changed.notify_waiters();
        Ok(())
    }
    pub async fn add_project(&self, path: &Path, name: &str, origin: &str) -> Result<Project> {
        let cwd = path.canonicalize()?;
        let home = crate::store::user_home()
            .ok()
            .and_then(|p| p.canonicalize().ok());
        if !cwd.is_dir()
            || cwd.parent().is_none()
            || home.as_ref().is_some_and(|p| p == &cwd)
            || name.trim().is_empty()
            || name.chars().count() > 80
        {
            return Err(Error::Invalid("INVALID_PROJECT"));
        }
        let origin = project_origin(origin)?;
        let mut s = self.inner.lock().await;
        let mut config = s.store.config.clone();
        let project = if let Some(p) = config
            .projects
            .iter_mut()
            .find(|p| !p.removed() && Path::new(&p.cwd) == cwd)
        {
            p.name = name.trim().into();
            if !p.origins.contains(&origin) {
                p.origins.push(origin);
            }
            p.clone()
        } else {
            let p = Project {
                id: Uuid::new_v4().to_string(),
                cwd: cwd.to_string_lossy().into(),
                name: name.trim().into(),
                origins: vec![origin],
                extra: Default::default(),
            };
            config.projects.push(p.clone());
            p
        };
        crate::store::atomic(&s.store.directory, "config.json", &config)?;
        s.store.config = config;
        Ok(project)
    }
    pub async fn remove_project(&self, id: &str) -> Result<()> {
        let mut s = self.inner.lock().await;
        if s.store
            .jobs
            .iter()
            .any(|j| j.project_id == id && !j.status.terminal())
        {
            return Err(Error::Conflict("PROJECT_HAS_ACTIVE_TASKS"));
        }
        let mut config = s.store.config.clone();
        let project = config
            .projects
            .iter_mut()
            .find(|p| p.id == id && !p.removed())
            .ok_or(Error::NotFound)?;
        // Keep the source identity and metadata for historical tasks, but revoke the binding.
        project.extra.insert("removed".into(), true.into());
        crate::store::atomic(&s.store.directory, "config.json", &config)?;
        s.store.config = config;
        s.connections.retain(|_, c| c.project_id != id);
        self.changed.notify_waiters();
        Ok(())
    }
    pub async fn register(&self, input: &Value, claim: &str) -> Result<Value> {
        let project = text(input, "projectId")?;
        uuid(project)?;
        if text(input, "claim")? != claim {
            return Err(Error::Forbidden);
        }
        uuid(claim)?;
        let name = text(&input["client"], "name")?;
        let version = text(&input["client"], "version")?;
        if !clean(name, 160) || !clean(version, 80) {
            return Err(Error::Invalid("INVALID_CLIENT"));
        }
        let mut id = connection_id(project, claim);
        let binding = {
            let mut s = self.inner.lock().await;
            s.prune();
            id = s.sessions.get(&id).cloned().unwrap_or(id);
            if !s
                .store
                .config
                .projects
                .iter()
                .any(|p| p.id == project && !p.removed())
            {
                return Err(Error::NotFound);
            }
            if !s.connections.contains_key(&id) && s.connections.len() >= 256 {
                return Err(Error::Conflict("TOO_MANY_CONNECTIONS"));
            }
            let c = s
                .connections
                .entry(id.clone())
                .or_insert_with(|| Connection {
                    id: id.clone(),
                    project_id: project.into(),
                    name: name.into(),
                    version: version.into(),
                    connected_at: now(),
                    last_seen_at: now(),
                    connected: true,
                    listening: false,
                    wakeable: false,
                    seen: Instant::now(),
                    waiting: None,
                    thread: None,
                });
            c.connected = true;
            c.seen = Instant::now();
            c.last_seen_at = now();
            if s.connections.get(&id).is_some_and(|c| c.wakeable) {
                None
            } else {
                s.store.bindings.get(&id).cloned()
            }
        };
        if let Some(b) = binding {
            let p = self.project(project).await?;
            if b.project_id != p.id || b.cwd != p.cwd {
                return Err(Error::Conflict("CLIENT_PROJECT_MISMATCH"));
            }
            crate::clients::verify(&b.thread_id, &p).await?;
            let mut s = self.inner.lock().await;
            if let Some(c) = s.connections.get_mut(&id) {
                c.wakeable = true;
                c.thread = Some(b.thread_id);
            }
        }
        let s = self.inner.lock().await;
        Ok(json!({"connection":s.connections.get(&id)}))
    }
    pub async fn project(&self, id: &str) -> Result<Project> {
        self.inner
            .lock()
            .await
            .projects()
            .into_iter()
            .find(|p| p.id == id)
            .ok_or(Error::NotFound)
    }

    pub async fn wakeup(
        &self,
        project: &str,
        claim: &str,
        thread: &str,
        notification_token: Option<&str>,
    ) -> Result<Value> {
        uuid(thread)?;
        let p = self.project(project).await?;
        {
            let mut s = self.inner.lock().await;
            s.session(project, claim)?;
        }
        crate::clients::verify(thread, &p).await?;
        let mut s = self.inner.lock().await;
        let id = s.authorize_wakeup(&p, claim, thread, notification_token)?;
        let restored = s.session(project, claim)?.id == id;
        Ok(
            json!({"projectId":project,"connectionId":id,"threadId":thread,"wakeable":true,"listening":false,"sessionRestored":restored}),
        )
    }
    pub async fn submit(&self, input: Value) -> Result<Value> {
        let schema: Value = serde_json::from_str(include_str!("../contracts/submission.json"))?;
        let validator = jsonschema::options()
            .should_validate_formats(true)
            .build(&schema)
            .map_err(|_| Error::Invalid("INVALID_CONTRACT"))?;
        if !validator.is_valid(&input) {
            return Err(Error::Invalid("INVALID_SUBMISSION"));
        }
        let id = text(&input, "id")?;
        let project = text(&input, "projectId")?;
        let recipient = text(&input, "recipientId")?;
        let mut s = self.inner.lock().await;
        s.prune();
        let p = s
            .projects()
            .into_iter()
            .find(|p| p.id == project)
            .ok_or(Error::NotFound)?;
        let elements = input["selections"].as_array().cloned().unwrap_or_default();
        for e in std::iter::once(&input["selection"]).chain(elements.iter()) {
            if !p.origins.contains(&project_origin(text(e, "url")?)?) {
                return Err(Error::Forbidden);
            }
            if e["styles"].as_object().is_some_and(|o| o.len() > 30)
                || e.get("dom").is_some_and(|d| d.to_string().len() > 10000)
            {
                return Err(Error::Invalid("INVALID_SELECTION"));
            }
        }
        if let Some(old) = s.store.jobs.iter().find(|j| j.id == id) {
            let stored = serde_json::to_value(old)?;
            for key in [
                "projectId",
                "recipientId",
                "instruction",
                "selection",
                "selections",
                "notificationLanguage",
            ] {
                if stored.get(key) != input.get(key) {
                    return Err(Error::Conflict("TASK_ID_REUSED"));
                }
            }
            return Ok(json!({"job":old.public()}));
        }
        let c = s
            .connections
            .get(recipient)
            .filter(|c| c.project_id == project)
            .ok_or(Error::Conflict("MCP_NOT_CONNECTED"))?;
        let busy = s.store.jobs.iter().any(|j| {
            j.project_id == project
                && j.recipient.as_ref().is_some_and(|r| r.id == recipient)
                && j.status == Status::Running
        });
        if !c.listening && !c.wakeable && !busy {
            return Err(Error::Conflict("MCP_NOT_LISTENING"));
        }
        if s.store.jobs.iter().filter(|j| !j.status.terminal()).count() >= 30 {
            return Err(Error::Conflict("TOO_MANY_PENDING_TASKS"));
        }
        let mut value = input;
        value["executor"] = json!("mcp");
        value["status"] = json!("queued");
        value["createdAt"] = json!(now());
        value["updatedAt"] = value["createdAt"].clone();
        value["recipient"] = json!({"id":c.id,"name":c.name});
        if let Some(thread) = &c.thread {
            value["threadId"] = json!(thread);
            value["clientNotification"] = json!(false);
        }
        let job: Job = serde_json::from_value(value)?;
        let response = json!({"job":job.public()});
        let mut jobs = s.store.jobs.clone();
        jobs.push(job);
        s.persist_jobs(jobs)?;
        drop(s);
        self.changed.notify_waiters();
        Ok(response)
    }
    pub async fn task(
        &self,
        id: &str,
        project: &str,
        claim: &str,
        action: &str,
        input: &Value,
    ) -> Result<Value> {
        let mut s = self.inner.lock().await;
        let c = s.session(project, claim)?.clone();
        let index = s
            .store
            .jobs
            .iter()
            .position(|j| {
                j.id == id
                    && j.project_id == project
                    && j.executor == "mcp"
                    && j.recipient.as_ref().is_some_and(|r| r.id == c.id)
            })
            .ok_or(Error::NotFound)?;
        let project_value = s
            .store
            .config
            .projects
            .iter()
            .find(|p| p.id == project)
            .map(|p| json!({"id":p.id,"name":p.name,"cwd":p.cwd,"origins":p.origins}));
        if action == "read" {
            let j = &s.store.jobs[index];
            return Ok(
                json!({"project":project_value,"status":j.status,"context":j.context(),"result":j.result}),
            );
        }
        let mut jobs = s.store.jobs.clone();
        let j = &jobs[index];
        let hashed = hash(claim);
        if action == "claim" {
            if j.status == Status::Running && j.claim.as_deref() == Some(&hashed) {
                return Ok(json!({"project":project_value,"context":j.context()}));
            }
            if j.status != Status::Queued {
                return Err(Error::Conflict("TASK_NOT_QUEUED"));
            }
            if jobs.iter().any(|other| {
                other.id != id
                    && other.project_id == project
                    && (matches!(other.status, Status::Running | Status::Waiting)
                        || (other.status == Status::Queued
                            && other.client_notification == Some(true)))
            }) {
                return Err(Error::Conflict("PROJECT_BUSY"));
            }
            let j = &mut jobs[index];
            j.status = Status::Running;
            j.claim = Some(hashed);
            j.agent = Some(c.name.clone());
            j.started_at = Some(now());
            j.updated_at = now();
            j.event(format!("{} 已领取任务", c.name));
        } else {
            if j.claim.as_deref() != Some(&hashed) {
                return Err(Error::Forbidden);
            }
            if action == "progress" {
                let step = text(input, "stepId")?;
                let message = text(input, "message")?.trim();
                if !valid_step(step) || !clean(message, 1000) {
                    return Err(Error::Invalid("INVALID_PROGRESS"));
                }
                if j.status != Status::Running {
                    return Err(Error::Conflict("TASK_ENDED"));
                }
                if let Some(e) = j
                    .events
                    .iter()
                    .find(|e| e.progress_id.as_deref() == Some(step))
                {
                    return if e.text == message {
                        Ok(json!({"ok":true,"at":e.at}))
                    } else {
                        Err(Error::Conflict("PROGRESS_ID_REUSED"))
                    };
                }
                if j.events.iter().filter(|e| e.progress_id.is_some()).count() >= 200 {
                    return Err(Error::Conflict("PROGRESS_LIMIT"));
                }
                let j = &mut jobs[index];
                j.updated_at = now();
                j.events.push(Event {
                    at: j.updated_at.clone(),
                    text: message.replace(&s.store.config.token, "[REDACTED]"),
                    progress_id: Some(step.into()),
                });
            } else if action == "report" {
                let status = match text(input, "outcome")? {
                    "completed" => Status::Completed,
                    "failed" => Status::Failed,
                    _ => return Err(Error::Invalid("INVALID_OUTCOME")),
                };
                let summary = bounded(input, "summary", 16000)?;
                let verification = bounded(input, "verification", 8000)?;
                let files = input["files"]
                    .as_array()
                    .ok_or(Error::Invalid("INVALID_FILES"))?;
                if files.len() > 100
                    || files
                        .iter()
                        .any(|v| v.as_str().is_none_or(|s| s.chars().count() > 1000))
                {
                    return Err(Error::Invalid("INVALID_FILES"));
                }
                let paths = files
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join("\n");
                let result = format!(
                    "{summary}\n\n修改文件：\n{}\n\n验证：\n{verification}",
                    if paths.is_empty() {
                        "未报告文件改动"
                    } else {
                        &paths
                    }
                )
                .replace(&s.store.config.token, "[REDACTED]");
                if j.status == status && j.result == result {
                    return Ok(json!({"ok":true}));
                }
                if j.status != Status::Running {
                    return Err(Error::Conflict("TASK_ENDED"));
                }
                let j = &mut jobs[index];
                j.result = result;
                j.finish(status);
                j.event("Agent 已回报；文件和验证由执行客户端提供");
            } else {
                return Err(Error::NotFound);
            }
        }
        let output = if action == "claim" {
            json!({"project":project_value,"context":jobs[index].context()})
        } else {
            json!({"ok":true,"at":jobs[index].updated_at})
        };
        s.persist_jobs(jobs)?;
        drop(s);
        self.changed.notify_waiters();
        Ok(output)
    }
    pub async fn cancel(&self, id: &str) -> Result<Value> {
        self.cancel_with(id, crate::clients::cancel_notification)
            .await
    }
    async fn cancel_with<F, Fut>(&self, id: &str, notify: F) -> Result<Value>
    where
        F: FnOnce(Job, Project) -> Fut,
        Fut: std::future::Future<Output = Result<()>>,
    {
        let mut s = self.inner.lock().await;
        let mut jobs = s.store.jobs.clone();
        let j = jobs
            .iter_mut()
            .find(|j| j.id == id)
            .ok_or(Error::NotFound)?;
        if j.status.terminal() {
            return Ok(json!({"cancelled":j.status == Status::Cancelled,"notification":"none"}));
        }
        let active = matches!(j.status, Status::Running | Status::Waiting);
        let notified =
            j.executor == "mcp" && j.client_notification == Some(true) && j.thread_id.is_some();
        j.finish(Status::Cancelled);
        let job = j.clone();
        let project = s
            .store
            .config
            .projects
            .iter()
            .find(|p| p.id == job.project_id)
            .cloned();
        s.persist_jobs(jobs)?;
        drop(s);
        self.changed.notify_waiters();
        // Persist first. Terminal-state retries never send a second, ambiguous notification.
        let notification = if notified {
            match project {
                Some(project) => {
                    if matches!(
                        tokio::time::timeout(Duration::from_secs(8), notify(job, project)).await,
                        Ok(Ok(()))
                    ) {
                        "sent"
                    } else {
                        "unconfirmed"
                    }
                }
                None => "unconfirmed",
            }
        } else if active {
            "manual"
        } else {
            "none"
        };
        Ok(json!({"cancelled":true,"notification":notification}))
    }
    pub async fn snapshot(&self) -> Value {
        let mut s = self.inner.lock().await;
        s.prune();
        json!({"connected":!self.stop.is_cancelled(),"engine":"rust","paired":!s.store.config.clients.is_empty(),"projects":s.projects(),"jobs":s.store.jobs.iter().rev().take(100).map(Job::public).collect::<Vec<_>>(),"agents":s.connections.values().collect::<Vec<_>>(),"pending":s.store.jobs.iter().filter(|j|!j.status.terminal()).count(),"capabilities":[{"id":"mcp","name":"MCP","listening":true,"wakeup":false},{"id":"codex-desktop","name":"Codex","listening":true,"wakeup":cfg!(target_os="macos")} ]})
    }
}
impl State {
    pub fn prune(&mut self) {
        self.connections.retain(|id, c| {
            if c.seen.elapsed() >= Duration::from_secs(45) {
                c.connected = false;
                c.listening = false;
                c.waiting = None;
            }
            (c.wakeable && self.store.bindings.contains_key(id))
                || c.seen.elapsed() < Duration::from_secs(45)
        });
        self.sessions
            .retain(|_, id| self.connections.contains_key(id));
        self.grants.retain(|_, (_, until)| *until > Instant::now());
        self.pairing_requests
            .retain(|_, (_, until)| *until > Instant::now());
    }
    pub fn session(&mut self, project: &str, claim: &str) -> Result<&mut Connection> {
        self.prune();
        uuid(claim)?;
        let key = connection_id(project, claim);
        let id = self.sessions.get(&key).unwrap_or(&key);
        self.connections
            .get_mut(id)
            .ok_or(Error::Conflict("MCP_RECONNECT_REQUIRED"))
    }
    // Called only after the desktop host has verified this exact thread and project.
    fn authorize_wakeup(
        &mut self,
        project: &Project,
        claim: &str,
        thread: &str,
        notification_token: Option<&str>,
    ) -> Result<String> {
        let mut c = self.session(&project.id, claim)?.clone();
        let previous = c.id.clone();
        let existing = self
            .store
            .bindings
            .iter()
            .find(|(_, b)| {
                b.project_id == project.id && b.thread_id == thread && b.cwd == project.cwd
            })
            .map(|(id, _)| id.clone());
        let id = existing.unwrap_or_else(|| previous.clone());
        if id != previous {
            let Some(token) = notification_token else {
                // Setup can confirm an existing target, but IDs alone never grant its tasks.
                return Ok(id);
            };
            let expected = hash(token);
            if !self.store.jobs.iter().any(|j| {
                j.project_id == project.id
                    && j.status == Status::Queued
                    && j.client_notification == Some(true)
                    && j.thread_id.as_deref() == Some(thread)
                    && j.recipient.as_ref().is_some_and(|r| r.id == id)
                    && j.wakeup_token_hash.as_deref() == Some(expected.as_str())
            }) {
                return Err(Error::Conflict("INVALID_WAKEUP_TOKEN"));
            }
        }
        if id != previous
            && self.store.jobs.iter().any(|j| {
                j.recipient.as_ref().is_some_and(|r| {
                    r.id == previous && !j.status.terminal()
                        || r.id == id && matches!(j.status, Status::Running | Status::Waiting)
                })
            })
        {
            return Err(Error::Conflict("PROJECT_BUSY"));
        }
        if c.thread.as_deref().is_some_and(|old| old != thread) {
            return Err(Error::Conflict("CLIENT_CONNECTION_CHANGED"));
        }
        let mut bindings = self.store.bindings.clone();
        bindings.insert(
            id.clone(),
            Binding {
                project_id: project.id.clone(),
                thread_id: thread.into(),
                cwd: project.cwd.clone(),
                name: c.name.clone(),
                version: c.version.clone(),
                extra: bindings
                    .get(&id)
                    .map(|b| b.extra.clone())
                    .unwrap_or_default(),
            },
        );
        crate::store::atomic(&self.store.directory, "wakeup-bindings.json", &bindings)?;
        self.store.bindings = bindings;
        self.connections.remove(&previous);
        self.sessions
            .retain(|_, target| target != &id && target != &previous);
        self.sessions
            .insert(connection_id(&project.id, claim), id.clone());
        c.id = id.clone();
        c.wakeable = true;
        c.thread = Some(thread.into());
        self.connections.insert(id.clone(), c);
        Ok(id)
    }
    pub fn detach(&mut self, project: &str, claim: &str, revoke: bool) -> Result<()> {
        let id = self.session(project, claim)?.id.clone();
        if revoke {
            let mut bindings = self.store.bindings.clone();
            bindings.remove(&id);
            crate::store::atomic(&self.store.directory, "wakeup-bindings.json", &bindings)?;
            self.store.bindings = bindings;
            self.connections.remove(&id);
            self.sessions.retain(|_, target| target != &id);
        } else {
            self.sessions.remove(&connection_id(project, claim));
            if let Some(c) = self.connections.get_mut(&id) {
                c.connected = false;
                c.listening = false;
                c.waiting = None;
                if !c.wakeable {
                    self.connections.remove(&id);
                }
            }
        }
        Ok(())
    }
    pub fn persist_jobs(&mut self, jobs: Vec<Job>) -> Result<()> {
        crate::store::atomic(&self.store.directory, "jobs.json", &jobs)?;
        self.store.jobs = jobs;
        Ok(())
    }
}
pub fn text<'a>(v: &'a Value, key: &str) -> Result<&'a str> {
    v.get(key)
        .and_then(Value::as_str)
        .ok_or(Error::Invalid("INVALID_INPUT"))
}
pub fn bounded<'a>(v: &'a Value, key: &str, max: usize) -> Result<&'a str> {
    let s = text(v, key)?.trim();
    if s.is_empty() || s.chars().count() > max {
        return Err(Error::Invalid("INVALID_INPUT"));
    }
    Ok(s)
}
pub fn clean(s: &str, max: usize) -> bool {
    !s.trim().is_empty() && s.chars().count() <= max && !s.chars().any(char::is_control)
}
pub fn uuid(s: &str) -> Result<()> {
    Uuid::parse_str(s)
        .map(|_| ())
        .map_err(|_| Error::Invalid("INVALID_ID"))
}
pub fn valid_step(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 80
        && s.as_bytes()[0].is_ascii_alphanumeric()
        && s.bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._:-".contains(&c))
}
pub fn project_origin(value: &str) -> Result<String> {
    let url = url::Url::parse(value).map_err(|_| Error::Invalid("INVALID_URL"))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(Error::Invalid("INVALID_URL"));
    }
    Ok(url.origin().ascii_serialization())
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "Disposable fixture setup")]
mod cancellation_tests {
    use super::*;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    #[tokio::test]
    async fn cancellation_notifies_only_original_thread_after_persistence_and_never_retries() {
        for delivered in [true, false] {
            let home = tempfile::tempdir().unwrap();
            let service = Service::open(
                home.path().to_owned(),
                14318,
                PathBuf::from("/fixture/pointdom"),
            )
            .unwrap();
            let project = service
                .add_project(home.path(), "Fixture", "http://127.0.0.1:5173")
                .await
                .unwrap();
            let id = uuid::Uuid::new_v4().to_string();
            let thread = uuid::Uuid::new_v4().to_string();
            let job: Job = serde_json::from_value(json!({
                "id":id,"projectId":project.id,"instruction":"Fixture", "selection":{},
                "status":"running","createdAt":now(),"updatedAt":now(),
                "threadId":thread,"clientNotification":true
            }))
            .unwrap();
            service.inner.lock().await.persist_jobs(vec![job]).unwrap();
            let calls = Arc::new(AtomicUsize::new(0));
            let count = calls.clone();
            let directory = home.path().to_owned();
            let original_id = id.clone();
            let result = service
                .cancel_with(&id, move |job, target| async move {
                    count.fetch_add(1, Ordering::SeqCst);
                    assert_eq!(job.id, original_id);
                    assert_eq!(job.thread_id.as_deref(), Some(thread.as_str()));
                    assert_eq!(target.id, project.id);
                    let saved: Value = serde_json::from_slice(
                        &std::fs::read(directory.join("jobs.json")).unwrap(),
                    )
                    .unwrap();
                    assert_eq!(saved[0]["status"], "cancelled");
                    if delivered {
                        Ok(())
                    } else {
                        Err(Error::Client)
                    }
                })
                .await
                .unwrap();
            assert_eq!(
                result["notification"],
                if delivered { "sent" } else { "unconfirmed" }
            );
            let repeated = service
                .cancel_with(&id, |_, _| async { panic!("Do not resend cancellation") })
                .await
                .unwrap();
            assert_eq!(repeated["notification"], "none");
            assert_eq!(calls.load(Ordering::SeqCst), 1);
            assert_eq!(
                service.inner.lock().await.store.jobs[0].status,
                Status::Cancelled
            );
        }
    }
}

#[cfg(test)]
#[expect(
    clippy::unwrap_used,
    reason = "Fixture setup and assertions fail immediately"
)]
mod wakeup_lifecycle_tests {
    use super::*;

    async fn fixture() -> (
        tempfile::TempDir,
        tempfile::TempDir,
        Service,
        Project,
        String,
        String,
    ) {
        let home = tempfile::tempdir().unwrap();
        let source = tempfile::tempdir().unwrap();
        let service = Service::open(home.path().into(), 14318, "/test/pointdom".into()).unwrap();
        let project = service
            .add_project(source.path(), "Fixture", "http://localhost:3000")
            .await
            .unwrap();
        let claim = Uuid::new_v4().to_string();
        let id = register(&service, &project, &claim).await;
        (home, source, service, project, claim, id)
    }
    async fn register(service: &Service, project: &Project, claim: &str) -> String {
        service.register(&json!({"projectId":project.id,"claim":claim,"client":{"name":"fixture-codex","version":"1"}}), claim).await.unwrap()["connection"]["id"].as_str().unwrap().into()
    }
    fn submission(project: &Project, recipient: &str) -> Value {
        json!({"id":Uuid::new_v4(),"projectId":project.id,"recipientId":recipient,"instruction":"Fixture only","selection":{"url":"http://localhost:3000/","title":"Fixture","selector":"h1","label":"Heading","tag":"h1","viewport":{"width":800,"height":600},"rect":{"x":0,"y":0,"width":100,"height":20},"styles":{}}})
    }
    #[tokio::test]
    async fn idle_authorization_survives_detach_and_new_session_must_restore_exact_recipient() {
        let (_home, _source, service, project, claim, id) = fixture().await;
        let thread = Uuid::new_v4().to_string();
        {
            let mut s = service.inner.lock().await;
            // Host verification is replaced only in this isolated domain fixture.
            assert_eq!(
                s.authorize_wakeup(&project, &claim, &thread, None).unwrap(),
                id
            );
            s.detach(&project.id, &claim, false).unwrap();
            s.connections.get_mut(&id).unwrap().seen = Instant::now() - Duration::from_secs(120);
            s.prune();
            assert!(s.connections[&id].wakeable);
            assert!(!s.connections[&id].listening);
            assert!(!s.connections[&id].connected);
        }
        let input = submission(&project, &id);
        let task = input["id"].as_str().unwrap();
        service.submit(input.clone()).await.unwrap();
        {
            let mut s = service.inner.lock().await;
            s.store.jobs[0].client_notification = Some(true);
            s.store.jobs[0].wakeup_token_hash = Some(hash("fixture-token"));
            assert!(s.store.jobs[0].public().get("wakeupTokenHash").is_none());
        }
        let fresh = Uuid::new_v4().to_string();
        let fresh_id = register(&service, &project, &fresh).await;
        assert_ne!(fresh_id, id);
        {
            let mut s = service.inner.lock().await;
            assert_eq!(
                s.authorize_wakeup(&project, &fresh, &thread, None).unwrap(),
                id
            );
            assert_eq!(s.session(&project.id, &fresh).unwrap().id, fresh_id);
            assert!(
                s.authorize_wakeup(&project, &fresh, &thread, Some("wrong-token"))
                    .is_err()
            );
        }
        assert!(
            service
                .task(task, &project.id, &fresh, "read", &json!({}))
                .await
                .is_err()
        );
        {
            let mut s = service.inner.lock().await;
            assert_eq!(
                s.authorize_wakeup(&project, &fresh, &thread, Some("fixture-token"))
                    .unwrap(),
                id
            );
            assert!(!s.connections.contains_key(&fresh_id));
        }
        assert_eq!(register(&service, &project, &fresh).await, id);
        service
            .task(
                task,
                &project.id,
                &fresh,
                "claim",
                &json!({"agent":"fixture"}),
            )
            .await
            .unwrap();
        service.task(task, &project.id, &fresh, "report", &json!({"outcome":"completed","summary":"Fixture","files":[],"verification":"Fixture only"})).await.unwrap();
        service
            .inner
            .lock()
            .await
            .detach(&project.id, &fresh, false)
            .unwrap();
        service.submit(submission(&project, &id)).await.unwrap();
        let replay = Uuid::new_v4().to_string();
        register(&service, &project, &replay).await;
        assert!(
            service
                .inner
                .lock()
                .await
                .authorize_wakeup(&project, &replay, &thread, Some("fixture-token"))
                .is_err()
        );
        assert_eq!(service.inner.lock().await.store.jobs.len(), 2);
    }
    #[tokio::test]
    async fn restart_restores_only_authorized_target_and_explicit_revocation_is_durable() {
        let (home, _source, service, project, claim, id) = fixture().await;
        service
            .inner
            .lock()
            .await
            .authorize_wakeup(&project, &claim, &Uuid::new_v4().to_string(), None)
            .unwrap();
        drop(service);
        let restored = Service::open(home.path().into(), 14318, "/test/pointdom".into()).unwrap();
        let snapshot = restored.snapshot().await;
        assert_eq!(snapshot["agents"][0]["id"], id);
        assert_eq!(snapshot["agents"][0]["connected"], false);
        assert_eq!(snapshot["agents"][0]["listening"], false);
        assert_eq!(snapshot["agents"][0]["wakeable"], true);
        restored
            .inner
            .lock()
            .await
            .detach(&project.id, &claim, true)
            .unwrap();
        drop(restored);
        let revoked = Service::open(home.path().into(), 14318, "/test/pointdom".into()).unwrap();
        assert!(
            revoked.snapshot().await["agents"]
                .as_array()
                .unwrap()
                .is_empty()
        );
    }
    #[tokio::test]
    async fn legacy_mcp_exit_detaches_but_explicit_revoke_removes_saved_authorization() {
        use axum::{
            body::Body,
            http::{Request, StatusCode},
        };
        use tower::ServiceExt;
        let (_home, _source, service, project, claim, id) = fixture().await;
        service
            .inner
            .lock()
            .await
            .authorize_wakeup(&project, &claim, &Uuid::new_v4().to_string(), None)
            .unwrap();
        let token = service.inner.lock().await.store.config.token.clone();
        for (action, retained) in [("disconnect", true), ("revoke", false)] {
            let body = json!({"projectId":project.id,"claim":claim});
            let request = Request::builder()
                .method("POST")
                .uri(format!("/api/mcp/connections/{action}"))
                .header("host", "127.0.0.1:14318")
                .header("authorization", format!("Bearer {token}"))
                .header("x-pagepatch-mcp", "1")
                .header("x-pointdom-session", &claim)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap();
            let response = crate::http::router(service.clone())
                .oneshot(request)
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(
                service.inner.lock().await.store.bindings.contains_key(&id),
                retained
            );
        }
    }
    #[tokio::test]
    async fn another_thread_cannot_restore_an_existing_recipient_or_take_running_work() {
        let (_home, _source, service, project, claim, id) = fixture().await;
        let thread = Uuid::new_v4().to_string();
        service
            .inner
            .lock()
            .await
            .authorize_wakeup(&project, &claim, &thread, None)
            .unwrap();
        let input = submission(&project, &id);
        service.submit(input.clone()).await.unwrap();
        let other = Uuid::new_v4().to_string();
        let other_id = register(&service, &project, &other).await;
        assert_eq!(
            service
                .inner
                .lock()
                .await
                .authorize_wakeup(&project, &other, &Uuid::new_v4().to_string(), None)
                .unwrap(),
            other_id
        );
        assert!(
            service
                .task(
                    input["id"].as_str().unwrap(),
                    &project.id,
                    &other,
                    "claim",
                    &json!({"agent":"fixture"})
                )
                .await
                .is_err()
        );
        service
            .task(
                input["id"].as_str().unwrap(),
                &project.id,
                &claim,
                "claim",
                &json!({"agent":"fixture"}),
            )
            .await
            .unwrap();
        let fresh = Uuid::new_v4().to_string();
        register(&service, &project, &fresh).await;
        assert!(
            service
                .inner
                .lock()
                .await
                .authorize_wakeup(&project, &fresh, &thread, Some("fixture-token"))
                .is_err()
        );
    }
}
