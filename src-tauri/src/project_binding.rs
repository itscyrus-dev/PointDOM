//! A browser may suggest an origin, but only native user actions select and bind source.
use crate::{Desktop, discovery::Candidate, open_main};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tokio::sync::Mutex;
static BINDING: Mutex<()> = Mutex::const_new(());

pub fn conversation_project(link: &str) -> Option<String> {
    if link.len() > 2048 {
        return None;
    }
    let link = url::Url::parse(link).ok()?;
    let pairs: Vec<_> = link.query_pairs().collect();
    (link.scheme() == "pointdom"
        && link.host_str() == Some("conversation")
        && link.path().is_empty()
        && link.username().is_empty()
        && link.password().is_none()
        && link.port().is_none()
        && link.fragment().is_none()
        && pairs.len() == 1
        && pairs[0].0 == "projectId"
        && pointdom_core::service::uuid(&pairs[0].1).is_ok())
    .then(|| pairs[0].1.to_string())
}

pub fn origin(link: &str) -> Option<String> {
    if link.len() > 2048 {
        return None;
    }
    let link = url::Url::parse(link).ok()?;
    if link.scheme() != "pointdom"
        || link.host_str() != Some("bind")
        || !link.path().is_empty()
        || link.fragment().is_some()
        || !link.username().is_empty()
        || link.password().is_some()
        || link.port().is_some()
    {
        return None;
    }
    let pairs: Vec<_> = link.query_pairs().collect();
    if pairs.len() != 1 || pairs[0].0 != "origin" {
        return None;
    }
    let origin = url::Url::parse(&pairs[0].1).ok()?;
    if !matches!(origin.scheme(), "http" | "https")
        || origin.host_str().is_none()
        || !origin.username().is_empty()
        || origin.password().is_some()
        || origin.path() != "/"
        || origin.query().is_some()
        || origin.fragment().is_some()
    {
        return None;
    }
    Some(origin.origin().ascii_serialization())
}

fn automatic_candidate<'a>(candidates: &'a [Candidate], origin: &str) -> Option<&'a Candidate> {
    if !pointdom_core::discovery::local_origin(origin) {
        return None;
    }
    let mut matches = candidates
        .iter()
        .filter(|candidate| candidate.origins.iter().any(|value| value == origin));
    let candidate = matches.next()?;
    matches.next().is_none().then_some(candidate)
}

pub async fn bind(app: AppHandle, origin: String) {
    let Ok(_guard) = BINDING.try_lock() else {
        return;
    };
    let desktop = app.state::<Arc<Desktop>>();
    let language = desktop.preferences.lock().await.language();
    let _ = open_main(app.clone(), None);
    let service = desktop.service.lock().await.clone();
    let Some(service) = service else {
        app.dialog()
            .message(language.text(
                "服务未连接，请在 PointDOM 中重新连接后重试。",
                "Service offline. Reconnect in PointDOM, then retry.",
            ))
            .buttons(MessageDialogButtons::OkCustom(
                language.text("确定", "OK").into(),
            ))
            .show(|_| {});
        return;
    };
    if pointdom_core::discovery::local_origin(&origin) {
        desktop.discovery.refresh(&service).await;
    }
    let view = desktop.discovery.view().await;
    let candidate = automatic_candidate(&view.candidates, &origin).cloned();
    let path = if let Some(candidate) = &candidate {
        PathBuf::from(&candidate.cwd).canonicalize().ok()
    } else {
        let dialog = app.clone();
        let title = format!("{} · {origin}", language.text("选择源码", "Choose source"));
        tauri::async_runtime::spawn_blocking(move || {
            dialog
                .dialog()
                .file()
                .set_title(title)
                .blocking_pick_folder()
                .and_then(|path| path.into_path().ok())
        })
        .await
        .ok()
        .flatten()
        .and_then(|path| path.canonicalize().ok())
    };
    let Some(path) = path else {
        return;
    };
    let name = {
        let state = service.inner.lock().await;
        state
            .store
            .config
            .projects
            .iter()
            .find(|project| Path::new(&project.cwd) == path)
            .map(|project| project.name.clone())
            .or_else(|| {
                path.file_name()
                    .and_then(|value| value.to_str())
                    .map(str::to_owned)
            })
    };
    let Some(name) = name else {
        return;
    };
    let dialog = app.clone();
    let message = format!(
        "{name}\n{}\n→ {origin}\n\n{}",
        path.display(),
        language.text(
            "绑定此项目，并自动配置 Codex MCP。之后选择接收批注的对话并授权连接。",
            "Bind this project and configure Codex MCP automatically. Then choose and authorize the conversation that will receive annotations."
        )
    );
    let approved = tauri::async_runtime::spawn_blocking(move || {
        dialog
            .dialog()
            .message(message)
            .title(language.text("绑定项目", "Bind project"))
            .buttons(MessageDialogButtons::OkCancelCustom(
                language
                    .text("绑定并配置 Codex", "Bind and configure Codex")
                    .into(),
                language.text("取消", "Cancel").into(),
            ))
            .blocking_show()
    })
    .await
    .unwrap_or(false);
    if !approved {
        return;
    }
    let result = if let Some(candidate) = candidate {
        desktop.discovery.confirm(&service, &candidate.id).await
    } else {
        service
            .add_project(&path, &name, &origin)
            .await
            .map_err(|error| error.to_string())
    };
    match result {
        Ok(project) => {
            let codex_setup = match crate::configure_codex(&desktop).await {
                Ok(true) => "ready",
                Ok(false) => "saved",
                Err(_) => "failed",
            };
            let _ = app.emit(
                "project-bound",
                serde_json::json!({"project": project, "codexSetup": codex_setup}),
            );
        }
        Err(error) => {
            let message = if error == "DEVELOPMENT_SERVER_CHANGED" {
                language.text(
                    "开发服务已变化，请重新绑定。",
                    "The development server changed. Bind again.",
                )
            } else {
                language.text(
                    "绑定失败，请检查服务和文件夹后重试。",
                    "Binding failed. Check the service and source folder, then retry.",
                )
            };
            app.dialog()
                .message(message)
                .buttons(MessageDialogButtons::OkCustom(
                    language.text("确定", "OK").into(),
                ))
                .show(|_| {});
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn conversation_link_only_opens_a_project_chooser_and_cannot_authorize_a_thread() {
        let id = "00000000-0000-4000-a000-000000000001";
        let link = format!("pointdom://conversation?projectId={id}");
        assert_eq!(conversation_project(&link).as_deref(), Some(id));
        for invalid in [
            format!("{link}&threadId={id}"),
            format!("{link}&projectId={id}"),
            format!("{link}#fragment"),
            "pointdom://conversation?projectId=invalid".into(),
            format!("pointdom://conversation/path?projectId={id}"),
        ] {
            assert!(conversation_project(&invalid).is_none());
        }
    }
    #[test]
    fn automatic_binding_requires_one_verified_exact_local_origin() {
        let candidate = Candidate {
            id: "fixture".into(),
            cwd: "/fixture/source".into(),
            name: "Fixture".into(),
            origins: vec![
                "http://localhost:5173".into(),
                "https://online.example".into(),
            ],
        };
        let candidates = vec![candidate.clone()];
        assert_eq!(
            automatic_candidate(&candidates, "http://localhost:5173")
                .map(|value| value.id.as_str()),
            Some("fixture")
        );
        for origin in [
            "http://localhost:5174",
            "http://localhost.evil.example:5173",
            "https://online.example",
        ] {
            assert!(automatic_candidate(&candidates, origin).is_none());
        }
        assert!(automatic_candidate(&[], "http://localhost:5173").is_none());
        assert!(
            automatic_candidate(&[candidate.clone(), candidate], "http://localhost:5173").is_none()
        );
    }

    #[test]
    fn accepts_only_an_origin_proposal() {
        assert_eq!(
            origin("pointdom://bind?origin=http%3A%2F%2Flocalhost%3A5173"),
            Some("http://localhost:5173".into())
        );
        for input in [
            "pointdom://bind?origin=file%3A%2F%2F%2Ftmp",
            "pointdom://bind?origin=https%3A%2F%2Fu%3Ap%40example.com",
            "pointdom://bind?origin=https%3A%2F%2Fexample.com%2Fsecret",
            "pointdom://bind?origin=https%3A%2F%2Fexample.com%3Fx%3Dsecret",
            "pointdom://bind?origin=https%3A%2F%2Fexample.com&cwd=/tmp",
            "pointdom://bind?origin=https%3A%2F%2Fexample.com&origin=https%3A%2F%2Fother.com",
            "pointdom://bind?origin=https%3A%2F%2Fexample.com#secret",
            "pointdom://bind/path?origin=https%3A%2F%2Fexample.com",
        ] {
            assert_eq!(origin(input), None);
        }
    }
}
