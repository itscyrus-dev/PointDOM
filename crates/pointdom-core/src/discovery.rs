//! Confirmed source identity is durable; observed loopback addresses are short-lived leases.
use crate::{Error, Result, Service, model::Project, service::State};
use std::{
    collections::BTreeMap,
    path::Path,
    time::{Duration, Instant},
};

pub fn local_origin(value: &str) -> bool {
    url::Url::parse(value).is_ok_and(|url| {
        matches!(url.scheme(), "http" | "https")
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
            && url.username().is_empty()
            && url.password().is_none()
            && url.path() == "/"
            && url.query().is_none()
            && url.fragment().is_none()
    })
}

impl Service {
    /// Called only by the native observer, never from browser or MCP arguments.
    pub async fn observe_local(&self, servers: BTreeMap<String, Vec<String>>) {
        let mut state = self.inner.lock().await;
        state.local_origins = servers
            .into_iter()
            .filter_map(|(cwd, origins)| {
                let origins: Vec<_> = origins.into_iter().filter(|o| local_origin(o)).collect();
                (!origins.is_empty())
                    .then_some((cwd, (origins, Instant::now() + Duration::from_secs(12))))
            })
            .collect();
    }

    pub async fn confirm_local(&self, cwd: &Path) -> Result<Project> {
        let cwd = cwd.canonicalize()?;
        if cwd.parent().is_none()
            || crate::store::user_home()
                .ok()
                .and_then(|p| p.canonicalize().ok())
                .is_some_and(|home| home == cwd)
        {
            return Err(Error::Invalid("INVALID_PROJECT"));
        }
        let key = cwd.to_str().ok_or(Error::Invalid("INVALID_PATH"))?;
        let mut state = self.inner.lock().await;
        if !state
            .local_origins
            .get(key)
            .is_some_and(|(_, expires)| *expires > Instant::now())
        {
            return Err(Error::Conflict("DEVELOPMENT_SERVER_STOPPED"));
        }
        let mut config = state.store.config.clone();
        let index = if let Some(index) = config
            .projects
            .iter()
            .position(|p| !p.removed() && Path::new(&p.cwd) == cwd)
        {
            index
        } else {
            let name = cwd
                .file_name()
                .and_then(|s| s.to_str())
                .filter(|s| !s.is_empty())
                .ok_or(Error::Invalid("INVALID_PROJECT"))?;
            config.projects.push(Project {
                id: uuid::Uuid::new_v4().to_string(),
                name: name.chars().take(80).collect(),
                cwd: key.into(),
                origins: Vec::new(),
                extra: Default::default(),
            });
            config.projects.len() - 1
        };
        let project = &mut config.projects[index];
        project.origins.retain(|origin| !local_origin(origin));
        project.extra.insert("localDiscovery".into(), true.into());
        crate::store::atomic(&state.store.directory, "config.json", &config)?;
        state.store.config = config;
        state
            .projects()
            .into_iter()
            .find(|p| p.cwd == key)
            .ok_or(Error::NotFound)
    }
}

impl State {
    /// Runtime addresses never enter config.json, so restarts cannot restore a stale port.
    pub fn projects(&self) -> Vec<Project> {
        self.store
            .config
            .projects
            .iter()
            .filter(|p| !p.removed())
            .cloned()
            .map(|mut project| {
                if project
                    .extra
                    .get("localDiscovery")
                    .and_then(|v| v.as_bool())
                    == Some(true)
                    && let Some((origins, expires)) = self.local_origins.get(&project.cwd)
                    && *expires > Instant::now()
                {
                    for origin in origins {
                        let owners = self
                            .local_origins
                            .values()
                            .filter(|(values, until)| {
                                *until > Instant::now() && values.contains(origin)
                            })
                            .count();
                        if owners == 1 && !project.origins.contains(origin) {
                            project.origins.push(origin.clone());
                        }
                    }
                }
                project
            })
            .collect()
    }
}
