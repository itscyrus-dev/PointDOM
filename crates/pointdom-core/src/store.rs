//! Single-writer JSON storage with private files, durable atomic replacement and backups.
use crate::{Error, Result, model::*};
use fs2::FileExt;
use serde::{Serialize, de::DeserializeOwned};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use uuid::Uuid;
pub struct Store {
    pub directory: PathBuf,
    pub config: Config,
    pub jobs: Vec<Job>,
    pub bindings: BTreeMap<String, Binding>,
    _lock: File,
}
pub fn private_file(path: &Path) -> std::io::Result<File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)
}
pub fn atomic<T: Serialize>(directory: &Path, name: &str, value: &T) -> Result<()> {
    let data = serde_json::to_vec_pretty(value)?;
    atomic_bytes(directory, name, &data)
}
pub fn atomic_bytes(directory: &Path, name: &str, data: &[u8]) -> Result<()> {
    let temp = directory.join(format!(".{name}.{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut file = private_file(&temp)?;
        file.write_all(data)?;
        file.sync_all()?;
        fs::rename(&temp, directory.join(name))?;
        #[cfg(unix)]
        File::open(directory)?.sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}
fn read<T: DeserializeOwned>(directory: &Path, name: &str) -> Result<T> {
    Ok(serde_json::from_slice(&fs::read(directory.join(name))?)?)
}
impl Store {
    pub fn open(directory: PathBuf) -> Result<Self> {
        fs::create_dir_all(&directory)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))?;
        }
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let lock = options.open(directory.join("native.lock"))?;
        lock.try_lock_exclusive()
            .map_err(|_| Error::Conflict("SERVICE_ALREADY_RUNNING"))?;
        // Keep an untouched, private migration snapshot before changing any legacy records.
        if !directory.join("native-migration-v1").exists() {
            let backup = directory.join(format!(".migration-{}", Uuid::new_v4()));
            fs::create_dir(&backup)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&backup, fs::Permissions::from_mode(0o700))?;
            }
            for name in ["config.json", "jobs.json", "wakeup-bindings.json"] {
                let path = directory.join(name);
                if path.exists() {
                    let bytes = fs::read(path)?;
                    atomic_bytes(&backup, name, &bytes)?;
                }
            }
            fs::rename(&backup, directory.join("native-migration-v1"))?;
            #[cfg(unix)]
            File::open(&directory)?.sync_all()?;
        }
        let mut config: Config = if directory.join("config.json").exists() {
            read(&directory, "config.json")?
        } else {
            Config {
                version: 1,
                token: format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple()),
                clients: vec![],
                projects: vec![],
                threads: BTreeMap::new(),
                default_executor: mcp(),
                extra: Default::default(),
            }
        };
        if config.version != 1 || config.token.len() < 32 {
            return Err(Error::Invalid("INVALID_CONFIG"));
        }
        config.default_executor = mcp();
        let mut jobs: Vec<Job> = if directory.join("jobs.json").exists() {
            read(&directory, "jobs.json")?
        } else {
            vec![]
        };
        for job in &mut jobs {
            if !job.status.terminal()
                && !(job.executor == "mcp"
                    && job.status == Status::Queued
                    && job.client_notification.is_none())
            {
                job.finish(Status::Interrupted);
                job.error = Some("SERVICE_RESTARTED_REVIEW_BEFORE_RETRY".into());
                job.extra.remove("approval");
            }
        }
        let bindings = if directory.join("wakeup-bindings.json").exists() {
            read(&directory, "wakeup-bindings.json")?
        } else {
            BTreeMap::new()
        };
        let store = Self {
            directory,
            config,
            jobs,
            bindings,
            _lock: lock,
        };
        store.save_config()?;
        store.save_jobs()?;
        Ok(store)
    }
    pub fn save_config(&self) -> Result<()> {
        atomic(&self.directory, "config.json", &self.config)
    }
    pub fn save_jobs(&self) -> Result<()> {
        atomic(&self.directory, "jobs.json", &self.jobs)
    }
    pub fn save_bindings(&self) -> Result<()> {
        atomic(&self.directory, "wakeup-bindings.json", &self.bindings)
    }
}
pub fn user_home() -> Result<PathBuf> {
    dirs::home_dir().ok_or(Error::Invalid("HOME_UNAVAILABLE"))
}
pub fn home() -> Result<PathBuf> {
    std::env::var_os("PAGEPATCH_HOME")
        .map(PathBuf::from)
        .or_else(|| user_home().ok().map(|h| h.join(".pagepatch")))
        .ok_or(Error::Invalid("HOME_UNAVAILABLE"))
}
