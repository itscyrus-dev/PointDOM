//! Native MCP configuration installer. Existing comments and unrelated settings survive.
use crate::{
    Error, Result,
    store::{atomic_bytes, private_file},
};
use std::{fs, io::Write, path::Path};
use toml_edit::{Array, DocumentMut, Item, Table, value};
pub fn configure_codex(file: &Path, binary: &Path, state: &Path) -> Result<()> {
    let original = if file.exists() {
        Some(fs::read_to_string(file)?)
    } else {
        None
    };
    let mut document = original
        .as_deref()
        .unwrap_or("")
        .parse::<DocumentMut>()
        .map_err(|_| Error::Invalid("INVALID_CODEX_CONFIG"))?;
    if document.get("mcp_servers").is_none() {
        document["mcp_servers"] = Item::Table(Table::new());
    }
    let servers = document["mcp_servers"]
        .as_table_mut()
        .ok_or(Error::Invalid("INVALID_CODEX_CONFIG"))?;
    if servers.get("pointdom").is_none() {
        servers["pointdom"] = Item::Table(Table::new());
    }
    let server = servers["pointdom"]
        .as_table_mut()
        .ok_or(Error::Invalid("INVALID_CODEX_CONFIG"))?;
    if server.contains_key("url") {
        return Err(Error::Conflict("REMOTE_MCP_CONFIG_EXISTS"));
    }
    server["command"] = value(binary.to_str().ok_or(Error::Invalid("INVALID_PATH"))?);
    let mut args = Array::new();
    args.push("mcp");
    server["args"] = value(args);
    server["enabled"] = value(true);
    if !server.contains_key("env") {
        server["env"] = Item::Table(Table::new());
    }
    if !server["env"].is_table() && !server["env"].is_inline_table() {
        return Err(Error::Invalid("INVALID_CODEX_ENV"));
    }
    server["env"]["PAGEPATCH_HOME"] = value(state.to_str().ok_or(Error::Invalid("INVALID_PATH"))?);
    let output = document.to_string();
    if original.as_ref() == Some(&output) {
        return Ok(());
    }
    let parent = file.parent().ok_or(Error::Invalid("INVALID_PATH"))?;
    fs::create_dir_all(parent)?;
    if (if file.exists() {
        Some(fs::read_to_string(file)?)
    } else {
        None
    }) != original
    {
        return Err(Error::Conflict("CONFIG_CHANGED"));
    }
    if let Some(text) = original {
        let mut backup = private_file(
            &parent.join(format!("config.toml.pointdom-{}.bak", uuid::Uuid::new_v4())),
        )?;
        backup.write_all(text.as_bytes())?;
        backup.sync_all()?;
    }
    atomic_bytes(
        parent,
        file.file_name()
            .and_then(|s| s.to_str())
            .ok_or(Error::Invalid("INVALID_PATH"))?,
        output.as_bytes(),
    )
}
