#![allow(clippy::unwrap_used)] // Test setup and assertions must fail immediately.
//! Real domain and loopback-boundary tests. Never use user state or paid model sessions.
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use pointdom_core::{
    Service,
    model::{Status, connection_id, hash},
    store::Store,
};
use serde_json::{Value, json};
use std::path::PathBuf;
use tempfile::TempDir;
use tower::ServiceExt;
use uuid::Uuid;
struct Fixture {
    _home: TempDir,
    source: TempDir,
    service: Service,
    project: String,
    claim: String,
    recipient: String,
}
impl Fixture {
    async fn new() -> Self {
        let home = TempDir::new().unwrap();
        let source = TempDir::new().unwrap();
        let service = Service::open(
            home.path().to_path_buf(),
            14318,
            PathBuf::from("/test/pointdom"),
        )
        .unwrap();
        let p = service
            .add_project(source.path(), "Fixture", "http://127.0.0.1:5173/path")
            .await
            .unwrap();
        let claim = Uuid::new_v4().to_string();
        let r=service.register(&json!({"projectId":p.id,"claim":claim,"client":{"name":"test-agent","version":"1"}}),&claim).await.unwrap();
        let recipient = r["connection"]["id"].as_str().unwrap().to_owned();
        service
            .inner
            .lock()
            .await
            .connections
            .get_mut(&recipient)
            .unwrap()
            .listening = true;
        Self {
            _home: home,
            source,
            service,
            project: p.id,
            claim,
            recipient,
        }
    }
    fn input(&self) -> Value {
        json!({"id":Uuid::new_v4(),"projectId":self.project,"executor":"mcp","recipientId":self.recipient,"instruction":"Change the heading","selection":{"url":"http://127.0.0.1:5173/","title":"Fixture","selector":"h1","label":"Heading","tag":"h1","viewport":{"width":800,"height":600},"rect":{"x":0,"y":0,"width":100,"height":20},"styles":{}}})
    }
    async fn submit(&self) -> String {
        let input = self.input();
        self.service.submit(input.clone()).await.unwrap();
        input["id"].as_str().unwrap().into()
    }
    async fn claim(&self, id: &str) -> pointdom_core::Result<Value> {
        self.service
            .task(
                id,
                &self.project,
                &self.claim,
                "claim",
                &json!({"agent":"test-agent"}),
            )
            .await
    }
}
#[tokio::test]
async fn task_claim_is_exclusive_and_project_work_is_serialized() {
    let f = Fixture::new().await;
    let a = f.submit().await;
    let b = f.submit().await;
    f.claim(&a).await.unwrap();
    assert!(f.claim(&b).await.is_err());
}
#[tokio::test]
async fn foreign_session_cannot_read_or_claim_an_assigned_task() {
    let f = Fixture::new().await;
    let id = f.submit().await;
    let other = Uuid::new_v4().to_string();
    f.service
        .register(
            &json!({"projectId":f.project,"claim":other,"client":{"name":"other","version":"1"}}),
            &other,
        )
        .await
        .unwrap();
    assert!(
        f.service
            .task(&id, &f.project, &other, "read", &json!({}))
            .await
            .is_err()
    );
    assert!(
        f.service
            .task(&id, &f.project, &other, "claim", &json!({"agent":"other"}))
            .await
            .is_err()
    );
}
#[tokio::test]
async fn duplicate_submission_is_idempotent_but_conflicting_content_is_rejected() {
    let f = Fixture::new().await;
    let input = f.input();
    f.service.submit(input.clone()).await.unwrap();
    f.service.submit(input.clone()).await.unwrap();
    let mut changed = input;
    changed["instruction"] = json!("Different");
    assert!(f.service.submit(changed).await.is_err());
    assert_eq!(f.service.inner.lock().await.store.jobs.len(), 1);
}
#[tokio::test]
async fn cli_and_execution_overrides_are_rejected() {
    let f = Fixture::new().await;
    for value in ["codex", "claude", "opencode", "trae", "codex-session"] {
        let mut input = f.input();
        input["executor"] = json!(value);
        assert!(f.service.submit(input).await.is_err());
    }
    let mut input = f.input();
    input["execution"] = json!({"approvalPolicy":"never"});
    assert!(f.service.submit(input).await.is_err());
}
#[tokio::test]
async fn forged_origin_and_oversized_context_are_rejected() {
    let f = Fixture::new().await;
    let mut input = f.input();
    input["selection"]["url"] = json!("https://attacker.invalid");
    assert!(f.service.submit(input).await.is_err());
    let mut input = f.input();
    input["selection"]["label"] = json!("x".repeat(501));
    assert!(f.service.submit(input).await.is_err());
}
#[tokio::test]
async fn cancelled_task_cannot_claim_progress_or_report() {
    let f = Fixture::new().await;
    let id = f.submit().await;
    f.claim(&id).await.unwrap();
    f.service
        .inner
        .lock()
        .await
        .store
        .jobs
        .iter_mut()
        .find(|job| job.id == id)
        .unwrap()
        .client_notification = Some(true);
    f.service.cancel(&id).await.unwrap();
    f.service.cancel(&id).await.unwrap();
    assert_eq!(
        f.service
            .inner
            .lock()
            .await
            .store
            .jobs
            .iter()
            .find(|job| job.id == id)
            .unwrap()
            .status,
        Status::Cancelled
    );
    let persisted: Value =
        serde_json::from_slice(&std::fs::read(f._home.path().join("jobs.json")).unwrap()).unwrap();
    assert_eq!(persisted[0]["status"], "cancelled");
    assert!(f.claim(&id).await.is_err());
    assert!(
        f.service
            .task(
                &id,
                &f.project,
                &f.claim,
                "progress",
                &json!({"stepId":"read","message":"Read source"})
            )
            .await
            .is_err()
    );
    assert!(
        f.service
            .task(&id, &f.project, &f.claim, "report", &report())
            .await
            .is_err()
    );
}
fn report() -> Value {
    json!({"outcome":"completed","summary":"Updated heading","files":["src/page.tsx"],"verification":"Tests passed"})
}
#[tokio::test]
async fn progress_and_report_retries_do_not_duplicate_events() {
    let f = Fixture::new().await;
    let id = f.submit().await;
    f.claim(&id).await.unwrap();
    let progress = json!({"stepId":"read","message":"Read source"});
    for _ in 0..2 {
        f.service
            .task(&id, &f.project, &f.claim, "progress", &progress)
            .await
            .unwrap();
    }
    let conflict = json!({"stepId":"read","message":"Different"});
    assert!(
        f.service
            .task(&id, &f.project, &f.claim, "progress", &conflict)
            .await
            .is_err()
    );
    for _ in 0..2 {
        f.service
            .task(&id, &f.project, &f.claim, "report", &report())
            .await
            .unwrap();
    }
    let s = f.service.inner.lock().await;
    assert_eq!(s.store.jobs[0].events.len(), 3);
    assert_eq!(s.store.jobs[0].status, Status::Completed);
    assert!(s.store.jobs[0].finished_at.is_some());
}
#[tokio::test]
async fn restart_preserves_history_and_interrupts_running_without_replay() {
    let f = Fixture::new().await;
    let id = f.submit().await;
    f.claim(&id).await.unwrap();
    let directory = f._home.path().to_path_buf();
    f.service.shutdown().await.unwrap();
    drop(f.service);
    let store = Store::open(directory.clone()).unwrap();
    assert_eq!(store.jobs[0].status, Status::Interrupted);
    assert!(directory.join("native-migration-v1").is_dir());
}
#[tokio::test]
async fn public_snapshots_never_expose_claims_or_tokens() {
    let f = Fixture::new().await;
    let id = f.submit().await;
    f.claim(&id).await.unwrap();
    let snapshot = f.service.snapshot().await.to_string();
    let token = f.service.inner.lock().await.store.config.token.clone();
    assert!(!snapshot.contains(&token));
    assert!(!snapshot.contains(&hash(&f.claim)));
}
#[tokio::test]
async fn storage_failure_does_not_acknowledge_or_mutate_tasks() {
    let f = Fixture::new().await;
    let directory = f._home.path().to_path_buf();
    std::fs::rename(
        directory.join("jobs.json"),
        directory.join("original-jobs.json"),
    )
    .unwrap();
    std::fs::create_dir(directory.join("jobs.json")).unwrap();
    assert!(f.service.submit(f.input()).await.is_err());
    assert!(f.service.inner.lock().await.store.jobs.is_empty());
}
#[tokio::test]
async fn storage_is_single_writer() {
    let f = Fixture::new().await;
    assert!(Store::open(f._home.path().to_path_buf()).is_err());
}
#[tokio::test]
async fn project_linking_normalizes_origins_and_deduplicates_directories() {
    let f = Fixture::new().await;
    let project = f
        .service
        .add_project(f.source.path(), "Renamed", "http://127.0.0.1:5173/other")
        .await
        .unwrap();
    assert_eq!(project.id, f.project);
    assert_eq!(project.origins, vec!["http://127.0.0.1:5173"]);
}
#[tokio::test]
async fn removing_project_keeps_history_and_source_but_revokes_access_across_restart() {
    let f = Fixture::new().await;
    let id = f.submit().await;
    assert_eq!(
        f.service
            .remove_project(&f.project)
            .await
            .unwrap_err()
            .to_string(),
        "PROJECT_HAS_ACTIVE_TASKS"
    );
    f.service.cancel(&id).await.unwrap();
    f.service.remove_project(&f.project).await.unwrap();
    assert!(f.source.path().is_dir());
    assert!(f.service.project(&f.project).await.is_err());
    assert!(f.service.register(&json!({"projectId":f.project,"claim":f.claim,"client":{"name":"test-agent","version":"1"}}), &f.claim).await.is_err());
    let snapshot = f.service.snapshot().await;
    assert_eq!(snapshot["projects"], json!([]));
    assert_eq!(snapshot["agents"], json!([]));
    assert_eq!(snapshot["jobs"][0]["id"], id);
    assert_eq!(snapshot["jobs"][0]["status"], "cancelled");
    let Fixture {
        service,
        _home: home,
        source,
        project,
        ..
    } = f;
    drop(service);
    let restarted =
        Service::open(home.path().into(), 14318, PathBuf::from("/test/pointdom")).unwrap();
    assert!(restarted.project(&project).await.is_err());
    restarted
        .observe_local(std::collections::BTreeMap::from([(
            source
                .path()
                .canonicalize()
                .unwrap()
                .to_str()
                .unwrap()
                .into(),
            vec!["http://127.0.0.1:5174".into()],
        )]))
        .await;
    assert_eq!(restarted.snapshot().await["projects"], json!([]));
    let reconnected = restarted.confirm_local(source.path()).await.unwrap();
    assert_ne!(reconnected.id, project);
    assert_eq!(
        restarted.inner.lock().await.store.jobs[0].project_id,
        project
    );
}

#[tokio::test]
async fn manually_adding_removed_directory_creates_fresh_identity_and_preserves_history() {
    let f = Fixture::new().await;
    let task = f.submit().await;
    f.service.cancel(&task).await.unwrap();
    f.service.remove_project(&f.project).await.unwrap();
    let added = f
        .service
        .add_project(f.source.path(), "Reconnected", "http://localhost:5174/page")
        .await
        .unwrap();
    assert_ne!(added.id, f.project);
    assert_eq!(added.origins, vec!["http://localhost:5174"]);
    drop(f.service);
    let restarted = Service::open(
        f._home.path().into(),
        14318,
        PathBuf::from("/test/pointdom"),
    )
    .unwrap();
    let snapshot = restarted.snapshot().await;
    assert_eq!(snapshot["projects"].as_array().unwrap().len(), 1);
    assert_eq!(snapshot["projects"][0]["id"], added.id);
    assert_eq!(snapshot["jobs"][0]["projectId"], f.project);
    assert!(restarted.project(&f.project).await.is_err());
    assert!(f.source.path().is_dir());
}

#[tokio::test]
async fn failed_project_removal_keeps_binding_and_connections() {
    let f = Fixture::new().await;
    let directory = f._home.path().join("missing");
    f.service.inner.lock().await.store.directory = directory;
    assert!(f.service.remove_project(&f.project).await.is_err());
    assert!(f.service.project(&f.project).await.is_ok());
    assert!(
        f.service
            .inner
            .lock()
            .await
            .connections
            .contains_key(&f.recipient)
    );
}
#[test]
fn connection_ids_match_the_legacy_private_session_algorithm() {
    let id = connection_id("project", "claim");
    let h = hash("pointdom-session:project:claim");
    assert_eq!(
        id,
        format!(
            "{}-{}-4{}-a{}-{}",
            &h[..8],
            &h[8..12],
            &h[13..16],
            &h[17..20],
            &h[20..32]
        )
    );
}
#[tokio::test]
async fn host_origin_and_native_header_boundaries_are_enforced() {
    let f = Fixture::new().await;
    let router = pointdom_core::http::router(f.service.clone());
    let token = f.service.inner.lock().await.store.config.token.clone();
    for (host, origin, local) in [
        ("localhost:14318", None, "1"),
        ("127.0.0.1:14318", Some("https://attacker.invalid"), "1"),
        ("127.0.0.1:14318", None, "0"),
    ] {
        let mut request = Request::builder()
            .uri("/api/local/status")
            .header("host", host)
            .header("authorization", format!("Bearer {token}"))
            .header("x-pagepatch-local", local);
        if let Some(origin) = origin {
            request = request.header("origin", origin);
        }
        let response = router
            .clone()
            .oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
    let response = router
        .oneshot(
            Request::builder()
                .uri("/api/local/status")
                .header("host", "127.0.0.1:14318")
                .header("authorization", format!("Bearer {token}"))
                .header("x-pagepatch-local", "1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}
#[tokio::test]
async fn forged_private_claim_header_is_rejected() {
    let f = Fixture::new().await;
    let token = f.service.inner.lock().await.store.config.token.clone();
    let body = json!({"projectId":f.project,"claim":Uuid::new_v4(),"client":{"name":"forged","version":"1"}});
    let response = pointdom_core::http::router(f.service)
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/mcp/connections")
                .header("host", "127.0.0.1:14318")
                .header("authorization", format!("Bearer {token}"))
                .header("x-pagepatch-mcp", "1")
                .header("x-pointdom-session", Uuid::new_v4().to_string())
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}
#[test]
fn native_config_preserves_comments_and_refuses_remote_collision() {
    let home = TempDir::new().unwrap();
    let config = home.path().join("config.toml");
    std::fs::write(&config, "# My preferences\nmodel = 'user-model'\n").unwrap();
    pointdom_core::config::configure_codex(
        &config,
        std::path::Path::new("/app/pointdom"),
        home.path(),
    )
    .unwrap();
    let text = std::fs::read_to_string(&config).unwrap();
    assert!(text.contains("# My preferences"));
    assert!(text.contains("user-model"));
    assert!(text.contains("mcp"));
    std::fs::write(
        &config,
        "[mcp_servers.pointdom]\nurl = 'https://remote.invalid'\n",
    )
    .unwrap();
    assert!(
        pointdom_core::config::configure_codex(
            &config,
            std::path::Path::new("/app/pointdom"),
            home.path()
        )
        .is_err()
    );
}

#[tokio::test]
async fn extension_discovery_requires_exact_native_approval_before_exposing_token() {
    let f = Fixture::new().await;
    let id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let nonce = "1".repeat(64);
    let request = || {
        Request::builder()
            .method("POST")
            .uri("/api/bootstrap")
            .header("host", "127.0.0.1:14318")
            .header("origin", format!("chrome-extension://{id}"))
            .header("content-type", "application/json")
            .body(Body::from(json!({"nonce":nonce}).to_string()))
            .unwrap()
    };
    let app = pointdom_core::http::router(f.service.clone());
    let response = app.clone().oneshot(request()).await.unwrap();
    let body: Value = serde_json::from_slice(
        &axum::body::to_bytes(response.into_body(), 4096)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(body["authorized"], false);
    assert!(body.get("token").is_none());
    assert!(
        f.service
            .approve_extension(id, &hash("wrong"))
            .await
            .is_err()
    );
    f.service
        .approve_extension(id, &hash(&nonce))
        .await
        .unwrap();
    assert!(
        f.service
            .approve_extension(id, &hash(&nonce))
            .await
            .is_err()
    );
    let response = app.oneshot(request()).await.unwrap();
    let body: Value = serde_json::from_slice(
        &axum::body::to_bytes(response.into_body(), 4096)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(body["authorized"], true);
    assert!(body["token"].as_str().is_some_and(|s| s.len() >= 32));
    assert!(f.service.snapshot().await.get("pairingRequests").is_none());
}

#[tokio::test]
async fn discovery_confirmation_keeps_identity_and_revokes_old_or_reused_ports() {
    use std::collections::BTreeMap;
    let f = Fixture::new().await;
    let cwd = f
        .source
        .path()
        .canonicalize()
        .unwrap()
        .to_str()
        .unwrap()
        .to_owned();
    assert!(f.service.confirm_local(f.source.path()).await.is_err());
    let observe = |origin: &str| BTreeMap::from([(cwd.clone(), vec![origin.to_owned()])]);
    f.service
        .observe_local(observe("http://127.0.0.1:5173"))
        .await;
    let confirmed = f.service.confirm_local(f.source.path()).await.unwrap();
    assert_eq!(confirmed.id, f.project);
    assert_eq!(confirmed.name, "Fixture");
    assert_eq!(confirmed.origins, ["http://127.0.0.1:5173"]);
    let config: Value =
        serde_json::from_slice(&std::fs::read(f._home.path().join("config.json")).unwrap())
            .unwrap();
    assert_eq!(config["projects"][0]["origins"], json!([]));
    assert_eq!(config["projects"][0]["localDiscovery"], true);
    f.service
        .observe_local(observe("http://127.0.0.1:5174"))
        .await;
    assert!(f.service.submit(f.input()).await.is_err());
    let mut input = f.input();
    input["selection"]["url"] = json!("http://127.0.0.1:5174/page");
    f.service.submit(input).await.unwrap();
    assert_eq!(
        f.service.project(&f.project).await.unwrap().origins,
        ["http://127.0.0.1:5174"]
    );
    let other = TempDir::new().unwrap();
    f.service
        .observe_local(BTreeMap::from([(
            other.path().to_str().unwrap().to_owned(),
            vec!["http://127.0.0.1:5174".into()],
        )]))
        .await;
    assert!(
        f.service
            .project(&f.project)
            .await
            .unwrap()
            .origins
            .is_empty()
    );
    f.service
        .observe_local(observe("http://127.0.0.1:5175"))
        .await;
    f.service
        .inner
        .lock()
        .await
        .local_origins
        .get_mut(&cwd)
        .unwrap()
        .1 = std::time::Instant::now();
    assert!(
        f.service
            .project(&f.project)
            .await
            .unwrap()
            .origins
            .is_empty()
    );
    let id = f.project.clone();
    let Fixture {
        service,
        _home,
        source: _source,
        ..
    } = f;
    service.shutdown().await.unwrap();
    drop(service);
    let restarted = Service::open(
        _home.path().to_path_buf(),
        14318,
        PathBuf::from("/fixture/mcp"),
    )
    .unwrap();
    assert_eq!(restarted.project(&id).await.unwrap().id, id);
    assert!(restarted.project(&id).await.unwrap().origins.is_empty());
}

#[tokio::test]
async fn ambiguous_discovery_and_untrusted_hosts_never_authorize_a_page() {
    use pointdom_core::discovery::local_origin;
    for url in [
        "http://localhost.evil:5173",
        "http://127.0.0.1.evil",
        "https://user:pass@localhost",
        "file:///tmp",
        "http://192.168.1.1",
        "http://localhost:5173/private",
    ] {
        assert!(!local_origin(url));
    }
    assert!(local_origin("http://localhost:5173"));
    assert!(local_origin("http://[::1]:5173"));
    let f = Fixture::new().await;
    let cwd = f
        .source
        .path()
        .canonicalize()
        .unwrap()
        .to_str()
        .unwrap()
        .to_owned();
    let mut values =
        std::collections::BTreeMap::from([(cwd.clone(), vec!["http://localhost:5173".into()])]);
    f.service.observe_local(values.clone()).await;
    f.service.confirm_local(f.source.path()).await.unwrap();
    values.insert(
        "/fixture/other-source".into(),
        vec!["http://localhost:5173".into()],
    );
    f.service.observe_local(values).await;
    assert!(
        f.service
            .project(&f.project)
            .await
            .unwrap()
            .origins
            .is_empty()
    );
}
