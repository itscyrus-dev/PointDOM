//! Native appearance preferences, separate from project and task storage.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, fs, io::ErrorKind, path::Path};

const FILE: &str = "desktop-settings.json";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum Language {
    #[default]
    #[serde(rename = "zh-CN")]
    Chinese,
    #[serde(rename = "en")]
    English,
}
impl Language {
    pub fn text(self, chinese: &'static str, english: &'static str) -> &'static str {
        match self {
            Self::Chinese => chinese,
            Self::English => english,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    #[serde(default = "visible_by_default")]
    pub show_menu_bar_icon: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<Language>,
    #[serde(flatten)]
    extra: BTreeMap<String, Value>,
}
fn visible_by_default() -> bool {
    true
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            show_menu_bar_icon: true,
            language: None,
            extra: BTreeMap::new(),
        }
    }
}
impl Preferences {
    pub fn language(&self) -> Language {
        self.language.unwrap_or_default()
    }
    pub fn load(directory: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        match fs::read(directory.join(FILE)) {
            Ok(bytes) => Ok(serde_json::from_slice(&bytes)?),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(Self::default()),
            Err(error) => Err(error.into()),
        }
    }
    pub fn save(&self, directory: &Path) -> pointdom_core::Result<()> {
        let mut builder = fs::DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(directory)?;
        pointdom_core::store::atomic(directory, FILE, self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_preferences_do_not_write_on_read() -> Result<(), Box<dyn std::error::Error>> {
        let directory = tempfile::tempdir()?;
        assert!(Preferences::load(directory.path())?.show_menu_bar_icon);
        assert_eq!(fs::read_dir(directory.path())?.count(), 0);
        Ok(())
    }

    #[test]
    fn menu_bar_visibility_survives_restart_and_preserves_unknown_fields()
    -> Result<(), Box<dyn std::error::Error>> {
        let directory = tempfile::tempdir()?;
        fs::write(directory.path().join(FILE), br#"{"future":{"value":1}}"#)?;
        let mut preferences = Preferences::load(directory.path())?;
        preferences.show_menu_bar_icon = false;
        preferences.save(directory.path())?;
        let restored = Preferences::load(directory.path())?;
        assert!(!restored.show_menu_bar_icon);
        assert_eq!(restored.extra["future"], serde_json::json!({"value":1}));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(directory.path().join(FILE))?
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        Ok(())
    }

    #[test]
    fn retired_dock_preference_does_not_hide_menu_bar() -> Result<(), Box<dyn std::error::Error>> {
        let directory = tempfile::tempdir()?;
        fs::write(directory.path().join(FILE), br#"{"showDockIcon":false}"#)?;
        assert!(Preferences::load(directory.path())?.show_menu_bar_icon);
        Ok(())
    }

    #[test]
    fn language_survives_restart_without_losing_other_preferences()
    -> Result<(), Box<dyn std::error::Error>> {
        let directory = tempfile::tempdir()?;
        fs::write(
            directory.path().join(FILE),
            br#"{"showMenuBarIcon":false,"future":1}"#,
        )?;
        let mut preferences = Preferences::load(directory.path())?;
        assert_eq!(preferences.language, None);
        for language in [Language::English, Language::Chinese] {
            preferences.language = Some(language);
            preferences.save(directory.path())?;
            let restored = Preferences::load(directory.path())?;
            assert_eq!(restored.language(), language);
            assert!(!restored.show_menu_bar_icon);
            assert_eq!(restored.extra["future"], 1);
        }
        assert!(serde_json::from_str::<Language>("\"other\"").is_err());
        Ok(())
    }

    #[test]
    fn malformed_preferences_are_not_overwritten() -> Result<(), Box<dyn std::error::Error>> {
        let directory = tempfile::tempdir()?;
        fs::write(directory.path().join(FILE), b"invalid")?;
        assert!(Preferences::load(directory.path()).is_err());
        assert_eq!(fs::read(directory.path().join(FILE))?, b"invalid");
        Ok(())
    }
}
