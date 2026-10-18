//! Native desktop shell. Loopback service and menu bar live independently of window visibility.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod discovery;
mod preferences;
mod project_binding;
use pointdom_core::{Service, model::Status};
use preferences::{Language, Preferences};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, RunEvent, State, WebviewWindow, WindowEvent,
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Mutex;
struct Desktop {
    discovery: discovery::Discovery,
    service: Mutex<Option<Service>>,
    error: Mutex<Option<String>>,
    folder: Mutex<Option<PathBuf>>,
    preferences: Mutex<Preferences>,
    directory: PathBuf,
    port: u16,
    binary: PathBuf,
    extension: PathBuf,
    reduced: AtomicBool,
    quitting: AtomicBool,
    confirming_quit: AtomicBool,
}
fn tray_labels(language: Language) -> [(&'static str, &'static str); 7] {
    [
        ("open", language.text("打开 PointDOM", "Open PointDOM")),
        ("tasks", language.text("任务", "Tasks")),
        ("projects", language.text("项目", "Projects")),
        ("clients", language.text("客户端", "Clients")),
        ("settings", language.text("设置", "Settings")),
        ("about", language.text("关于", "About")),
        ("quit", language.text("退出", "Quit")),
    ]
}
fn tray_menu(app: &AppHandle, language: Language) -> tauri::Result<Menu<tauri::Wry>> {
    let items = tray_labels(language)
        .into_iter()
        .map(|(id, label)| MenuItem::with_id(app, id, label, true, None::<&str>))
        .collect::<tauri::Result<Vec<_>>>()?;
    let navigation = PredefinedMenuItem::separator(app)?;
    let exit = PredefinedMenuItem::separator(app)?;
    Menu::with_items(
        app,
        &[
            &items[0],
            &navigation,
            &items[1],
            &items[2],
            &items[3],
            &items[4],
            &items[5],
            &exit,
            &items[6],
        ],
    )
}
#[tauri::command]
async fn set_language(
    window: WebviewWindow,
    app: AppHandle,
    desktop: State<'_, Arc<Desktop>>,
    language: Language,
) -> Result<(), String> {
    main_only(&window)?;
    let mut preferences = desktop.preferences.lock().await;
    if preferences.language == Some(language) {
        return Ok(());
    }
    let mut next = preferences.clone();
    next.language = Some(language);
    let tray = app.tray_by_id("pointdom").ok_or("TRAY_UNAVAILABLE")?;
    let menu = tray_menu(&app, language).map_err(|_| "TRAY_UPDATE_FAILED")?;
    tray.set_menu(Some(menu))
        .map_err(|_| "TRAY_UPDATE_FAILED")?;
    if next.save(&desktop.directory).is_err() {
        let menu = tray_menu(&app, preferences.language()).map_err(|_| "TRAY_RESTORE_FAILED")?;
        tray.set_menu(Some(menu))
            .map_err(|_| "TRAY_RESTORE_FAILED")?;
        return Err("PREFERENCES_SAVE_FAILED".into());
    }
    *preferences = next;
    drop(preferences);
    let _ = app.emit("language-changed", language);
    Ok(())
}
fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("FORBIDDEN".into());
    }
    Ok(())
}
async fn start(desktop: &Desktop) -> Result<(), String> {
    let mut slot = desktop.service.lock().await;
    if slot.is_some() {
        return Ok(());
    }
    // Bind before reading/migrating state. Never replace a live legacy service or its files.
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, desktop.port))
        .await
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AddrInUse {
                format!("PORT_IN_USE:{}", desktop.port)
            } else {
                "SERVICE_BIND_FAILED".to_owned()
            }
        })?;
    let service = Service::open(
        desktop.directory.clone(),
        desktop.port,
        desktop.binary.clone(),
    )
    .map_err(|e| e.to_string())?;
    let stop = service.stop.clone();
    let serving = service.clone();
    tauri::async_runtime::spawn(async move {
        if pointdom_core::http::serve(
            listener,
            serving.clone(),
            async move { stop.cancelled().await },
        )
        .await
        .is_err()
        {
            let _ = serving.shutdown().await;
        }
    });
    tauri::async_runtime::spawn(pointdom_core::clients::notifications(service.clone()));
    *slot = Some(service);
    *desktop.error.lock().await = None;
    Ok(())
}
#[tauri::command]
async fn snapshot(
    window: WebviewWindow,
    desktop: State<'_, Arc<Desktop>>,
) -> Result<Value, String> {
    let service = desktop.service.lock().await.clone();
    let mut state = if let Some(s) = &service {
        let mut snapshot = s.snapshot().await;
        snapshot["projectNames"] = json!(
            s.inner
                .lock()
                .await
                .store
                .config
                .projects
                .iter()
                .map(|p| (p.id.clone(), p.name.clone()))
                .collect::<std::collections::BTreeMap<_, _>>()
        );
        if window.label() == "main" {
            let mut state = s.inner.lock().await;
            state.prune();
            snapshot["pairingRequests"] = json!(
                state
                    .pairing_requests
                    .iter()
                    .map(|(id, (challenge, _))| json!({"id":id,"challenge":challenge}))
                    .collect::<Vec<_>>()
            );
        }
        snapshot
    } else {
        json!({"connected":false,"engine":"rust","paired":false,"projects":[],"jobs":[],"agents":[],"pending":0,"capabilities":[]})
    };
    if window.label() == "main" {
        let mut discovery = desktop.discovery.view().await;
        if let Some(service) = &service {
            let s = service.inner.lock().await;
            discovery.candidates.retain(|candidate| {
                !s.store
                    .config
                    .projects
                    .iter()
                    .any(|p| p.cwd == candidate.cwd && p.removed())
                    || s.store
                        .config
                        .projects
                        .iter()
                        .any(|p| p.cwd == candidate.cwd && !p.removed())
            });
        }
        state["discovery"] = json!(discovery);
    }
    state["error"] = json!(*desktop.error.lock().await);
    state["appVersion"] = json!(env!("CARGO_PKG_VERSION"));
    state["servicePort"] = json!(desktop.port);
    let preferences = desktop.preferences.lock().await;
    state["appSettings"] = json!({
        "showMenuBarIcon": preferences.show_menu_bar_icon,
        "language": preferences.language,
    });
    Ok(state)
}
/// Fit the main window's content height within the current monitor's work area.
#[tauri::command]
fn fit_main_window(window: WebviewWindow, height: f64, viewport_height: f64) -> Result<(), String> {
    main_only(&window)?;
    if !height.is_finite()
        || height <= 0.0
        || !viewport_height.is_finite()
        || viewport_height <= 0.0
    {
        return Err("INVALID_HEIGHT".into());
    }
    if window.is_maximized().map_err(|_| "WINDOW_FAILED")?
        || window.is_fullscreen().map_err(|_| "WINDOW_FAILED")?
    {
        return Ok(());
    }
    let monitor = window
        .current_monitor()
        .map_err(|_| "WINDOW_FAILED")?
        .ok_or("MONITOR_UNAVAILABLE")?;
    let scale = window.scale_factor().map_err(|_| "WINDOW_FAILED")?;
    let inner = window.inner_size().map_err(|_| "WINDOW_FAILED")?;
    let outer = window.outer_size().map_err(|_| "WINDOW_FAILED")?;
    let frame = outer.height.saturating_sub(inner.height);
    let area = monitor.work_area();
    let maximum = ((f64::from(area.size.height) - f64::from(frame)) / scale - 16.0).max(1.0);
    // The WebKit viewport can exclude native title-bar space even when Tauri's
    // inner/outer size APIs agree. Resize by the measured content delta.
    let height = (f64::from(inner.height) / scale + height - viewport_height)
        .clamp(480.0_f64.min(maximum), maximum);
    if (f64::from(inner.height) / scale - height).abs() > 1.0 {
        window
            .set_size(tauri::LogicalSize::new(
                f64::from(inner.width) / scale,
                height,
            ))
            .map_err(|_| "WINDOW_FAILED")?;
        let position = window.outer_position().map_err(|_| "WINDOW_FAILED")?;
        let top = f64::from(area.position.y) + 8.0 * scale;
        let bottom = f64::from(area.position.y) + f64::from(area.size.height) - 8.0 * scale;
        let y =
            f64::from(position.y).clamp(top, (bottom - height * scale - f64::from(frame)).max(top));
        window
            .set_position(PhysicalPosition::new(position.x, y.round() as i32))
            .map_err(|_| "WINDOW_FAILED")?;
    }
    Ok(())
}
/// Menu-bar visibility is an explicit main-window preference.
#[tauri::command]
async fn set_menu_bar_visibility(
    window: WebviewWindow,
    app: AppHandle,
    desktop: State<'_, Arc<Desktop>>,
    visible: bool,
) -> Result<(), String> {
    main_only(&window)?;
    let tray = app.tray_by_id("pointdom").ok_or("TRAY_UNAVAILABLE")?;
    let service = desktop.service.lock().await.clone();
    let active = if let Some(service) = service {
        service
            .inner
            .lock()
            .await
            .store
            .jobs
            .iter()
            .any(|job| job.status == Status::Running)
    } else {
        false
    };
    let mut preferences = desktop.preferences.lock().await;
    let mut next = preferences.clone();
    next.show_menu_bar_icon = visible;
    tray.set_visible(visible)
        .map_err(|_| "TRAY_UPDATE_FAILED")?;
    if visible {
        set_tray_image(&tray, 0, active).map_err(|_| "TRAY_UPDATE_FAILED")?;
    }
    if next.save(&desktop.directory).is_err() {
        tray.set_visible(preferences.show_menu_bar_icon)
            .map_err(|_| "TRAY_RESTORE_FAILED")?;
        if preferences.show_menu_bar_icon {
            set_tray_image(&tray, 0, active).map_err(|_| "TRAY_RESTORE_FAILED")?;
        }
        return Err("PREFERENCES_SAVE_FAILED".into());
    }
    *preferences = next;
    if !visible && let Some(panel) = app.get_webview_window("tasks") {
        let _ = panel.hide();
    }
    Ok(())
}
#[tauri::command]
async fn retry_service(
    window: WebviewWindow,
    desktop: State<'_, Arc<Desktop>>,
) -> Result<(), String> {
    main_only(&window)?;
    match start(&desktop).await {
        Ok(()) => Ok(()),
        Err(e) => {
            *desktop.error.lock().await = Some(e.clone());
            Err(e)
        }
    }
}
#[tauri::command]
async fn choose_folder(
    window: WebviewWindow,
    app: AppHandle,
    desktop: State<'_, Arc<Desktop>>,
) -> Result<Option<String>, String> {
    main_only(&window)?;
    let language = desktop.preferences.lock().await.language();
    let path = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title(language.text("选择项目源码", "Choose project source"))
            .blocking_pick_folder()
    })
    .await
    .map_err(|_| "DIALOG_FAILED")?;
    let path = path
        .map(|p| p.into_path())
        .transpose()
        .map_err(|_| "INVALID_PATH")?;
    *desktop.folder.lock().await = path.clone();
    Ok(path.map(|p| p.to_string_lossy().into_owned()))
}
#[tauri::command]
async fn add_project(
    window: WebviewWindow,
    desktop: State<'_, Arc<Desktop>>,
    name: String,
    origin: String,
) -> Result<(), String> {
    main_only(&window)?;
    let path = desktop
        .folder
        .lock()
        .await
        .clone()
        .ok_or("CHOOSE_FOLDER_FIRST")?;
    let service = desktop
        .service
        .lock()
        .await
        .clone()
        .ok_or("SERVICE_OFFLINE")?;
    service
        .add_project(&path, &name, &origin)
        .await
        .map_err(|e| e.to_string())?;
    *desktop.folder.lock().await = None;
    Ok(())
}
fn open_chrome(app: &AppHandle, url: &str) -> Result<(), String> {
    let program = if cfg!(target_os = "macos") {
        "Google Chrome"
    } else if cfg!(target_os = "windows") {
        "chrome"
    } else {
        "google-chrome"
    };
    app.opener()
        .open_url(url, Some(program))
        .map_err(|_| "OPEN_FAILED".into())
}
#[tauri::command]
async fn remove_project(
    window: WebviewWindow,
    app: AppHandle,
    desktop: State<'_, Arc<Desktop>>,
    id: String,
) -> Result<bool, String> {
    main_only(&window)?;
    let service = desktop
        .service
        .lock()
        .await
        .clone()
        .ok_or("SERVICE_OFFLINE")?;
    let project = service.project(&id).await.map_err(|e| e.to_string())?;
    let language = desktop.preferences.lock().await.language();
    let approved = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(format!(
                "{}\n\n{}",
                project.name,
                language.text(
                    "移除此项目的连接？源码和历史任务会保留。",
                    "Remove this project connection? Source files and task history are kept."
                )
            ))
            .title(language.text("移除项目", "Remove project"))
            .parent(&window)
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(
                language.text("移除", "Remove").into(),
                language.text("取消", "Cancel").into(),
            ))
            .blocking_show()
    })
    .await
    .map_err(|_| "DIALOG_FAILED")?;
    if approved {
        service
            .remove_project(&id)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(approved)
}
/// Only the main window can open these fixed public project resources.
#[tauri::command]
fn open_resource(window: WebviewWindow, app: AppHandle, resource: String) -> Result<(), String> {
    main_only(&window)?;
    let url = match resource.as_str() {
        "repository" => "https://github.com/itscyrus-dev/PointDOM",
        "releases" => "https://github.com/itscyrus-dev/PointDOM/releases",
        "feedback" => "https://github.com/itscyrus-dev/PointDOM/issues",
        _ => return Err("INVALID_RESOURCE".into()),
    };
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| "OPEN_FAILED".into())
}
#[tauri::command]
async fn confirm_discovery(
    window: WebviewWindow,
    desktop: State<'_, Arc<Desktop>>,
    id: String,
) -> Result<(), String> {
    main_only(&window)?;
    let service = desktop
        .service
        .lock()
        .await
        .clone()
        .ok_or("SERVICE_OFFLINE")?;
    desktop.discovery.confirm(&service, &id).await.map(|_| ())
}
#[tauri::command]
async fn approve_extension(
    window: WebviewWindow,
    desktop: State<'_, Arc<Desktop>>,
    id: String,
    challenge: String,
) -> Result<(), String> {
    main_only(&window)?;
    let service = desktop
        .service
        .lock()
        .await
        .clone()
        .ok_or("SERVICE_OFFLINE")?;
    service
        .approve_extension(&id, &challenge)
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn open_project(
    window: WebviewWindow,
    app: AppHandle,
    desktop: State<'_, Arc<Desktop>>,
    id: String,
) -> Result<(), String> {
    main_only(&window)?;
    let service = desktop
        .service
        .lock()
        .await
        .clone()
        .ok_or("SERVICE_OFFLINE")?;
    let project = service.project(&id).await.map_err(|e| e.to_string())?;
    let automatic = project
        .extra
        .get("localDiscovery")
        .and_then(|value| value.as_bool())
        == Some(true);
    let origin = if automatic {
        project
            .origins
            .iter()
            .find(|origin| pointdom_core::discovery::local_origin(origin))
            .ok_or("DEVELOPMENT_SERVER_STOPPED")?
    } else {
        project.origins.first().ok_or("PROJECT_ORIGIN_REQUIRED")?
    };
    let origin = pointdom_core::service::project_origin(origin).map_err(|e| e.to_string())?;
    open_chrome(&app, &origin)
}
#[tauri::command]
fn open_extensions(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    main_only(&window)?;
    open_chrome(&app, "chrome://extensions/")
}
#[tauri::command]
fn reveal_extension(
    window: WebviewWindow,
    app: AppHandle,
    desktop: State<'_, Arc<Desktop>>,
) -> Result<(), String> {
    main_only(&window)?;
    app.opener()
        .open_path(
            desktop.extension.to_str().ok_or("INVALID_PATH")?,
            None::<&str>,
        )
        .map_err(|_| "OPEN_FAILED".into())
}
#[tauri::command]
async fn connect_codex(
    window: WebviewWindow,
    desktop: State<'_, Arc<Desktop>>,
) -> Result<bool, String> {
    main_only(&window)?;
    configure_codex(&desktop).await
}
async fn configure_codex(desktop: &Desktop) -> Result<bool, String> {
    let home = pointdom_core::store::user_home().map_err(|e| e.to_string())?;
    let directory = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".codex"));
    pointdom_core::config::configure_codex(
        &directory.join("config.toml"),
        &desktop.binary,
        &desktop.directory,
    )
    .map_err(|e| e.to_string())?;
    Ok(pointdom_core::clients::reload_codex_mcp().await.is_ok())
}
#[tauri::command]
async fn codex_conversations(
    window: WebviewWindow,
    desktop: State<'_, Arc<Desktop>>,
    project_id: String,
    cursor: Option<String>,
) -> Result<Value, String> {
    main_only(&window)?;
    let service = desktop
        .service
        .lock()
        .await
        .clone()
        .ok_or("SERVICE_OFFLINE")?;
    let project = service
        .project(&project_id)
        .await
        .map_err(|e| e.to_string())?;
    pointdom_core::clients::conversations(&project, cursor.as_deref())
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn authorize_codex_conversation(
    window: WebviewWindow,
    app: AppHandle,
    desktop: State<'_, Arc<Desktop>>,
    project_id: String,
    thread_id: String,
) -> Result<Option<Value>, String> {
    main_only(&window)?;
    let service = desktop
        .service
        .lock()
        .await
        .clone()
        .ok_or("SERVICE_OFFLINE")?;
    let project = service
        .project(&project_id)
        .await
        .map_err(|e| e.to_string())?;
    let conversation = pointdom_core::clients::conversation(&thread_id, &project)
        .await
        .map_err(|e| e.to_string())?;
    let language = desktop.preferences.lock().await.language();
    let message = format!("{}\n{}\n\n{} · {}\n\n{}",
        project.name, project.cwd, conversation.title, thread_id,
        language.text(
            "配置 PointDOM MCP，将此项目的新批注发送到这个 Codex 对话，并在有任务时自动唤醒。此选择也会同步到插件。",
            "Configure PointDOM MCP, send this project’s new annotations to this Codex conversation and wake it when needed. This choice also updates the extension."
        ));
    let approved = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(message)
            .title(language.text("连接 Codex 对话", "Connect Codex conversation"))
            .buttons(MessageDialogButtons::OkCancelCustom(
                language.text("授权连接", "Authorize connection").into(),
                language.text("取消", "Cancel").into(),
            ))
            .blocking_show()
    })
    .await
    .map_err(|_| "DIALOG_FAILED")?;
    if !approved {
        return Ok(None);
    }
    let reloaded = configure_codex(&desktop).await?;
    let mut result = service
        .authorize_codex(&project_id, &thread_id)
        .await
        .map_err(|e| e.to_string())?;
    result["mcpReloaded"] = json!(reloaded);
    Ok(Some(result))
}
#[tauri::command]
fn mcp_configuration(
    window: WebviewWindow,
    desktop: State<'_, Arc<Desktop>>,
) -> Result<String, String> {
    main_only(&window)?;
    Ok(json!({"mcpServers":{"pointdom":{"command":desktop.binary,"args":["mcp"],"env":{"PAGEPATCH_HOME":desktop.directory,"POINTDOM_PORT":desktop.port.to_string()}}}}).to_string())
}
#[tauri::command]
async fn cancel_job(desktop: State<'_, Arc<Desktop>>, id: String) -> Result<Value, String> {
    let service = desktop
        .service
        .lock()
        .await
        .clone()
        .ok_or("SERVICE_OFFLINE")?;
    service.cancel(&id).await.map_err(|e| e.to_string())
}
#[tauri::command]
fn set_reduced_motion(desktop: State<'_, Arc<Desktop>>, reduced: bool) {
    desktop.reduced.store(reduced, Ordering::Relaxed);
}
#[tauri::command]
fn open_main(app: AppHandle, id: Option<String>) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        w.unminimize().map_err(|_| "WINDOW_FAILED")?;
        w.show().map_err(|_| "WINDOW_FAILED")?;
        w.set_focus().map_err(|_| "WINDOW_FAILED")?;
        if let Some(id) = id {
            w.emit("open-task", id).map_err(|_| "EVENT_FAILED")?;
        }
    }
    if let Some(w) = app.get_webview_window("tasks") {
        let _ = w.hide();
    }
    Ok(())
}
fn tray_image(frame: usize, active: bool, dark: bool) -> Image<'static> {
    // A 22pt Logo at 2x; color is retained so only the running point turns blue.
    let size = 44;
    let mut rgba = vec![0u8; size * size * 4];
    let pulse = if active {
        (1.0 - (frame as f64 * std::f64::consts::TAU / 60.0).cos()) / 2.0
    } else {
        0.0
    };
    let dot_radius = (3.5 + 0.5 * pulse) * 22.0 / 32.0;
    for y in 0..size {
        for x in 0..size {
            let mut coverage = 0u16;
            let mut color = [0u16; 3];
            for sy in 0..4 {
                for sx in 0..4 {
                    let tx = (x as f64 + (sx as f64 + 0.5) / 4.0) / 2.0;
                    let ty = (y as f64 + (sy as f64 + 0.5) / 4.0) / 2.0;
                    // Match logoFrame in src/extension/brand.ts at its original 32px scale.
                    let px = tx * 32.0 / 22.0;
                    let py = ty * 32.0 / 22.0;
                    let top_left_arc =
                        px <= 9.0 && py <= 9.0 && ((px - 9.0).hypot(py - 9.0) - 1.5).abs() < 1.375;
                    let bottom_right_arc = px >= 23.0
                        && py >= 23.0
                        && ((px - 23.0).hypot(py - 23.0) - 1.5).abs() < 1.375;
                    let bracket = top_left_arc
                        || bottom_right_arc
                        || (px - px.clamp(9.0, 13.0)).hypot(py - 7.5) < 1.375
                        || (px - 7.5).hypot(py - py.clamp(9.0, 13.0)) < 1.375
                        || (px - px.clamp(19.0, 23.0)).hypot(py - 24.5) < 1.375
                        || (px - 24.5).hypot(py - py.clamp(19.0, 23.0)) < 1.375;
                    let dot = (tx - 11.0).hypot(ty - 11.0) < dot_radius;
                    let tile = (px - px.clamp(8.0, 24.0)).hypot(py - py.clamp(8.0, 24.0)) <= 7.0;
                    if !tile {
                        continue;
                    }
                    let foreground = if dark { [0, 0, 0] } else { [255, 255, 255] };
                    let background = if dark { [255, 255, 255] } else { [0, 0, 0] };
                    let sample = if dot && active {
                        [0, 144, 255]
                    } else if bracket || dot {
                        foreground
                    } else {
                        background
                    };
                    for channel in 0..3 {
                        color[channel] += sample[channel];
                    }
                    coverage += 1;
                }
            }
            let i = (y * size + x) * 4;
            for channel in 0..3 {
                rgba[i + channel] = color[channel].checked_div(coverage).unwrap_or(0) as u8;
            }
            rgba[i + 3] = (coverage * 255 / 16) as u8;
        }
    }
    Image::new_owned(rgba, size as u32, size as u32)
}
#[cfg(target_os = "macos")]
fn native_tray_image(frame: usize, active: bool) -> objc2::rc::Retained<objc2_app_kit::NSImage> {
    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_app_kit::{NSAppearance, NSBezierPath, NSColor, NSImage, NSLineCapStyle};
    use objc2_foundation::{NSArray, NSPoint, NSRect, NSSize, NSString};
    let draw = RcBlock::new(move |_: NSRect| {
        let light = NSString::from_str("NSAppearanceNameAqua");
        let dark = NSString::from_str("NSAppearanceNameDarkAqua");
        let dark = NSAppearance::currentDrawingAppearance()
            .bestMatchFromAppearancesWithNames(&NSArray::from_slice(&[&*light, &*dark]))
            .is_some_and(|name| name == dark);
        let black = NSColor::blackColor();
        let white = NSColor::whiteColor();
        let (background, foreground) = if dark {
            (&white, &black)
        } else {
            (&black, &white)
        };
        let scale = 18.0 / 32.0;
        let point = |x, y| NSPoint::new(x * scale, y * scale);
        let rect = |x, y, w, h| NSRect::new(point(x, y), NSSize::new(w * scale, h * scale));
        background.setFill();
        NSBezierPath::bezierPathWithRoundedRect_xRadius_yRadius(
            rect(1.0, 1.0, 30.0, 30.0),
            7.0 * scale,
            7.0 * scale,
        )
        .fill();
        // The same 32px logoFrame path as src/extension/brand.ts, with circular elbows.
        foreground.setStroke();
        let path = NSBezierPath::bezierPath();
        path.setLineWidth(2.75 * scale);
        path.setLineCapStyle(NSLineCapStyle::Round);
        path.moveToPoint(point(7.5, 13.0));
        path.lineToPoint(point(7.5, 9.0));
        path.curveToPoint_controlPoint1_controlPoint2(
            point(9.0, 7.5),
            point(7.5, 8.171573),
            point(8.171573, 7.5),
        );
        path.lineToPoint(point(13.0, 7.5));
        path.moveToPoint(point(19.0, 24.5));
        path.lineToPoint(point(23.0, 24.5));
        path.curveToPoint_controlPoint1_controlPoint2(
            point(24.5, 23.0),
            point(23.828427, 24.5),
            point(24.5, 23.828427),
        );
        path.lineToPoint(point(24.5, 19.0));
        path.stroke();
        let pulse = if active {
            (1.0 - (frame as f64 * std::f64::consts::TAU / 60.0).cos()) / 2.0
        } else {
            0.0
        };
        let radius = 3.5 + 0.5 * pulse;
        if active {
            NSColor::colorWithSRGBRed_green_blue_alpha(0.0, 144.0 / 255.0, 1.0, 1.0).setFill();
        } else {
            foreground.setFill();
        }
        NSBezierPath::bezierPathWithOvalInRect(rect(
            16.0 - radius,
            16.0 - radius,
            radius * 2.0,
            radius * 2.0,
        ))
        .fill();
        Bool::YES
    });
    // Keep AppKit’s default cache so repainting does not discard completed image frames.
    let image = NSImage::imageWithSize_flipped_drawingHandler(NSSize::new(18.0, 18.0), true, &draw);
    image.setTemplate(false);
    image
}
fn set_tray_image(tray: &tauri::tray::TrayIcon, frame: usize, active: bool) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        tray.with_inner_tray_icon(move |inner| {
            if let Some(button) =
                objc2::MainThreadMarker::new().and_then(|mtm| inner.ns_status_item()?.button(mtm))
            {
                button.setImage(Some(&native_tray_image(frame, active)));
            }
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        tray.set_icon_with_as_template(Some(tray_image(frame, active, false)), false)
    }
}
async fn animate(app: AppHandle, desktop: Arc<Desktop>) {
    let mut frame = 0;
    let mut last_image = None;
    loop {
        let service = desktop.service.lock().await.clone();
        let (running, pending) = if let Some(service) = service {
            let s = service.inner.lock().await;
            (
                s.store
                    .jobs
                    .iter()
                    .filter(|j| j.status == Status::Running)
                    .count(),
                s.store.jobs.iter().filter(|j| !j.status.terminal()).count(),
            )
        } else {
            (0, 0)
        };
        let language = desktop.preferences.lock().await.language();
        if let Some(tray) = app.tray_by_id("pointdom") {
            let active = running > 0;
            let animated = active && !desktop.reduced.load(Ordering::Relaxed);
            let image_state = (if animated { frame } else { 0 }, active);
            if last_image != Some(image_state)
                && set_tray_image(&tray, image_state.0, image_state.1).is_ok()
            {
                last_image = Some(image_state);
            }
            let _ = tray.set_tooltip(Some(format!(
                "PointDOM · {running} {} · {pending} {}",
                language.text("执行中", "running"),
                language.text("待处理", "pending"),
            )));
        }
        frame = (frame + 1) % 60;
        if desktop.quitting.load(Ordering::Relaxed) {
            break;
        }
        let animated = running > 0 && !desktop.reduced.load(Ordering::Relaxed);
        tokio::time::sleep(Duration::from_millis(if animated { 40 } else { 1000 })).await;
    }
}
fn connection(app: AppHandle, url: String) {
    tauri::async_runtime::spawn(async move {
        if let Some(origin) = project_binding::origin(&url) {
            project_binding::bind(app, origin).await;
            return;
        }
        if let Some(project_id) = project_binding::conversation_project(&url) {
            let desktop = app.state::<Arc<Desktop>>();
            let Some(service) = desktop.service.lock().await.clone() else {
                return;
            };
            if service.project(&project_id).await.is_ok() {
                let _ = open_main(app.clone(), None);
                let _ = app.emit("choose-conversation", project_id);
            }
            return;
        }
        let parsed = match url::Url::parse(&url) {
            Ok(url)
                if url.scheme() == "pointdom"
                    && url.host_str() == Some("connect")
                    && url.path().is_empty()
                    && url.query_pairs().count() == 2
                    && url.fragment().is_none()
                    && url.username().is_empty()
                    && url.password().is_none()
                    && url.port().is_none() =>
            {
                url
            }
            _ => return,
        };
        let pairs: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
        let (Some(id), Some(challenge)) = (pairs.get("extensionId"), pairs.get("challenge")) else {
            return;
        };
        if id.len() != 32
            || !id.bytes().all(|c| (b'a'..=b'p').contains(&c))
            || challenge.len() != 64
            || !challenge
                .bytes()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        {
            return;
        }
        let id = id.clone();
        let challenge = challenge.clone();
        let dialog = app.clone();
        let _ = open_main(app.clone(), None);
        let language = app
            .state::<Arc<Desktop>>()
            .preferences
            .lock()
            .await
            .language();
        let approved = tauri::async_runtime::spawn_blocking(move || {
            dialog
                .dialog()
                .message(format!(
                    "{}\n\n{}: {id}",
                    language.text(
                        "仅批准刚在 Chrome 中发起的连接。",
                        "Approve only a connection you just requested."
                    ),
                    language.text("扩展", "Extension")
                ))
                .title(language.text("连接 PointDOM", "Connect PointDOM"))
                .kind(MessageDialogKind::Warning)
                .buttons(MessageDialogButtons::OkCancelCustom(
                    language.text("允许", "Allow").into(),
                    language.text("取消", "Cancel").into(),
                ))
                .blocking_show()
        })
        .await
        .unwrap_or(false);
        if !approved {
            return;
        }
        let desktop = app.state::<Arc<Desktop>>();
        let service = desktop.service.lock().await.clone();
        if let Some(service) = service {
            let mut s = service.inner.lock().await;
            if let Some(id) = pairs.get("extensionId") {
                s.grants.insert(
                    id.clone(),
                    (
                        challenge,
                        std::time::Instant::now() + Duration::from_secs(900),
                    ),
                );
            }
        }
    });
}
fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = open_main(app.clone(), None);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            snapshot,
            retry_service,
            choose_folder,
            add_project,
            remove_project,
            open_extensions,
            approve_extension,
            confirm_discovery,
            open_project,
            open_resource,
            reveal_extension,
            connect_codex,
            codex_conversations,
            authorize_codex_conversation,
            mcp_configuration,
            cancel_job,
            set_reduced_motion,
            set_menu_bar_visibility,
            set_language,
            fit_main_window,
            open_main
        ])
        .setup(|app| {
            let resources = app.path().resource_dir()?;
            let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .ok_or("Invalid build path")?
                .to_path_buf();
            let directory = pointdom_core::store::home()?;
            let preferences = Preferences::load(&directory)?;
            let show_menu_bar_icon = preferences.show_menu_bar_icon;
            let language = preferences.language();
            let desktop = Arc::new(Desktop {
                discovery: Default::default(),
                service: Mutex::new(None),
                error: Mutex::new(None),
                folder: Mutex::new(None),
                preferences: Mutex::new(preferences),
                directory,
                port: std::env::var("POINTDOM_PORT")
                    .ok()
                    .map(|s| s.parse::<u16>())
                    .transpose()?
                    .unwrap_or(4318),
                binary: if cfg!(debug_assertions) {
                    root.join(format!(
                        "target/debug/pointdom{}",
                        std::env::consts::EXE_SUFFIX
                    ))
                } else {
                    resources.join(format!("bin/pointdom{}", std::env::consts::EXE_SUFFIX))
                },
                extension: if cfg!(debug_assertions) {
                    root.join("dist/extension")
                } else {
                    resources.join("extension")
                },
                reduced: AtomicBool::new(false),
                quitting: AtomicBool::new(false),
                confirming_quit: AtomicBool::new(false),
            });
            app.manage(desktop.clone());
            let observer = desktop.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    let service = observer.service.lock().await.clone();
                    if let Some(service) = service {
                        if service.stop.is_cancelled() {
                            break;
                        }
                        observer.discovery.refresh(&service).await;
                    }
                    tokio::time::sleep(Duration::from_secs(3)).await;
                }
            });
            let handle = app.handle().clone();
            let starting = desktop.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start(&starting).await {
                    *starting.error.lock().await = Some(e);
                }
            });
            let menu = tray_menu(app.handle(), language)?;
            let tray = TrayIconBuilder::with_id("pointdom")
                .icon(tray_image(0, false, false))
                .icon_as_template(false)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        let _ = open_main(app.clone(), None);
                    }
                    screen @ ("tasks" | "projects" | "clients" | "settings" | "about") => {
                        let _ = open_main(app.clone(), None);
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("open-screen", screen);
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("tasks") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let scale = w.scale_factor().unwrap_or(1.0);
                                let position = rect.position.to_physical::<f64>(scale);
                                let mut x = position.x - 340.0 * scale;
                                let mut y = position.y + 28.0 * scale;
                                if let Ok(Some(monitor)) =
                                    w.monitor_from_point(position.x, position.y)
                                {
                                    let area = monitor.work_area();
                                    let size = w.outer_size().unwrap_or(tauri::PhysicalSize::new(
                                        (380.0 * scale) as u32,
                                        (520.0 * scale) as u32,
                                    ));
                                    let left = f64::from(area.position.x);
                                    let top = f64::from(area.position.y);
                                    x = x.clamp(
                                        left,
                                        (left + f64::from(area.size.width) - f64::from(size.width))
                                            .max(left),
                                    );
                                    y = y.clamp(
                                        top,
                                        (top + f64::from(area.size.height)
                                            - f64::from(size.height))
                                        .max(top),
                                    );
                                }
                                let _ = w.set_position(PhysicalPosition::new(x, y));
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;
            set_tray_image(&tray, 0, false)?;
            tray.set_visible(show_menu_bar_icon)?;
            tauri::async_runtime::spawn(animate(handle.clone(), desktop));
            let links = handle.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    connection(links.clone(), url.to_string());
                }
            });
            if let Some(urls) = app.deep_link().get_current()? {
                for url in urls {
                    connection(handle.clone(), url.to_string());
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Focused(false) if window.label() == "tasks" => {
                let _ = window.hide();
            }
            _ => {}
        });
    let app = match builder.build(tauri::generate_context!()) {
        Ok(app) => app,
        Err(_) => {
            eprintln!("POINTDOM_DESKTOP_START_FAILED");
            std::process::exit(1);
        }
    };
    app.run(|app, event| {
        let RunEvent::ExitRequested { api, .. } = event else {
            return;
        };
        let desktop = app.state::<Arc<Desktop>>().inner().clone();
        if desktop.quitting.load(Ordering::Relaxed) {
            return;
        }
        api.prevent_exit();
        if desktop.confirming_quit.swap(true, Ordering::Relaxed) {
            return;
        }
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let service = desktop.service.lock().await.clone();
            let pending = if let Some(service) = &service {
                service
                    .inner
                    .lock()
                    .await
                    .store
                    .jobs
                    .iter()
                    .any(|job| !job.status.terminal())
            } else {
                false
            };
            if pending {
                let dialog = handle.clone();
                let language = desktop.preferences.lock().await.language();
                let approved = tauri::async_runtime::spawn_blocking(move || {
                    dialog
                        .dialog()
                        .message(language.text(
                            "仍有待处理任务。退出会中断当前连接。",
                            "Tasks are pending. Quit and interrupt them?",
                        ))
                        .buttons(MessageDialogButtons::OkCancelCustom(
                            language.text("退出", "Quit").into(),
                            language.text("取消", "Cancel").into(),
                        ))
                        .blocking_show()
                })
                .await
                .unwrap_or(false);
                if !approved {
                    desktop.confirming_quit.store(false, Ordering::Relaxed);
                    return;
                }
            }
            desktop.quitting.store(true, Ordering::Relaxed);
            if let Some(service) = service {
                let _ = service.shutdown().await;
            }
            handle.exit(0);
        });
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_menu_uses_only_the_selected_language() {
        assert_eq!(
            tray_labels(Language::Chinese).map(|(_, label)| label),
            [
                "打开 PointDOM",
                "任务",
                "项目",
                "客户端",
                "设置",
                "关于",
                "退出"
            ]
        );
        assert_eq!(
            tray_labels(Language::English).map(|(_, label)| label),
            [
                "Open PointDOM",
                "Tasks",
                "Projects",
                "Clients",
                "Settings",
                "About",
                "Quit"
            ]
        );
        assert_eq!(
            tray_labels(Language::English).map(|(id, _)| id),
            tray_labels(Language::Chinese).map(|(id, _)| id)
        );
    }

    #[test]
    fn tray_logo_inverts_tile_and_mark_but_only_running_point_is_blue() {
        let pixel = |image: &Image<'_>, x: usize, y: usize| {
            image.rgba()[(y * 44 + x) * 4..(y * 44 + x) * 4 + 4].to_vec()
        };
        for dark in [false, true] {
            let idle = tray_image(0, false, dark);
            let running = tray_image(0, true, dark);
            let foreground = if dark {
                vec![0, 0, 0, 255]
            } else {
                vec![255, 255, 255, 255]
            };
            let background = if dark {
                vec![255, 255, 255, 255]
            } else {
                vec![0, 0, 0, 255]
            };
            assert_eq!((idle.width(), idle.height()), (44, 44));
            assert_eq!(pixel(&idle, 22, 22), foreground);
            assert_eq!(pixel(&idle, 15, 10), foreground);
            assert_eq!(pixel(&idle, 22, 10), background);
            assert_eq!(pixel(&idle, 37, 7), background);
            assert_eq!(pixel(&idle, 20, 10), background);
            assert_eq!(pixel(&idle, 0, 0), vec![0, 0, 0, 0]);
            assert_eq!(pixel(&running, 22, 22), vec![0, 144, 255, 255]);
            assert_eq!(pixel(&running, 15, 10), foreground);
            assert_eq!(pixel(&running, 22, 10), background);
            assert!(idle.rgba().chunks_exact(4).any(|p| p[3] > 0 && p[3] < 255));
            for frame in 0..60 {
                assert_eq!(tray_image(frame, false, dark).rgba(), idle.rgba());
                let animated = tray_image(frame, true, dark);
                for y in 0..44 {
                    for x in 0..44 {
                        if (x as f64 - 21.5).hypot(y as f64 - 21.5) > 8.0 {
                            assert_eq!(pixel(&animated, x, y), pixel(&running, x, y));
                        }
                    }
                }
            }
            assert_ne!(running.rgba(), tray_image(30, true, dark).rgba());
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[expect(
        clippy::unwrap_used,
        reason = "Test fixtures must fail if AppKit cannot produce the requested native image or pixel"
    )]
    fn native_tray_redraws_the_same_image_in_each_appearance_without_a_timer() {
        use block2::RcBlock;
        use objc2_app_kit::{NSAppearance, NSBitmapImageRep, NSImageCacheMode};
        use objc2_foundation::NSString;
        objc2::rc::autoreleasepool(|_| {
            for active in [false, true] {
                let image = native_tray_image(0, active);
                assert_eq!(image.cacheMode(), NSImageCacheMode::Default);
                assert_eq!(image.size(), objc2_foundation::NSSize::new(18.0, 18.0));
                for dark in [false, false, true, true, false, true] {
                    let appearance = NSAppearance::appearanceNamed(&NSString::from_str(if dark {
                        "NSAppearanceNameDarkAqua"
                    } else {
                        "NSAppearanceNameAqua"
                    }))
                    .unwrap();
                    appearance.performAsCurrentDrawingAppearance(&RcBlock::new(|| {
                        // Render the same source into fresh contexts: TIFF serialization itself caches data.
                        let source = image.clone();
                        let surface = objc2_app_kit::NSImage::imageWithSize_flipped_drawingHandler(
                            image.size(),
                            false,
                            &RcBlock::new(move |rect: objc2_foundation::NSRect| {
                                source.drawInRect(rect);
                                objc2::runtime::Bool::YES
                            }),
                        );
                        let data = surface.TIFFRepresentation().unwrap();
                        let bitmap = NSBitmapImageRep::imageRepWithData(&data).unwrap();
                        let center = bitmap
                            .colorAtX_y(bitmap.pixelsWide() / 2, bitmap.pixelsHigh() / 2)
                            .unwrap();
                        assert_eq!(center.alphaComponent(), 1.0);
                        if active {
                            assert!(center.blueComponent() > 0.95);
                            assert!(center.redComponent() < 0.05);
                        } else {
                            assert!(
                                (center.redComponent() - if dark { 0.0 } else { 1.0 }).abs() < 0.05
                            );
                        }
                        let bracket = bitmap
                            .colorAtX_y(bitmap.pixelsWide() / 4, bitmap.pixelsHigh() / 4)
                            .unwrap();
                        assert!(
                            (bracket.redComponent() - if dark { 0.0 } else { 1.0 }).abs() < 0.05
                        );
                        let tile = bitmap
                            .colorAtX_y(bitmap.pixelsWide() / 2, bitmap.pixelsHigh() / 8)
                            .unwrap();
                        assert!((tile.redComponent() - if dark { 1.0 } else { 0.0 }).abs() < 0.05);
                        assert_eq!(tile.alphaComponent(), 1.0);
                        assert_eq!(bracket.alphaComponent(), 1.0);
                        assert_eq!(bitmap.colorAtX_y(0, 0).unwrap().alphaComponent(), 0.0);
                    }));
                }
            }
        });
    }

    #[tokio::test]
    async fn retry_starts_service_after_port_is_released_without_touching_state_while_occupied()
    -> Result<(), Box<dyn std::error::Error>> {
        let directory = tempfile::tempdir()?;
        let occupied = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await?;
        let port = occupied.local_addr()?.port();
        let desktop = Desktop {
            discovery: Default::default(),
            service: Mutex::new(None),
            error: Mutex::new(None),
            folder: Mutex::new(None),
            preferences: Mutex::new(Preferences::default()),
            directory: directory.path().join("state"),
            port,
            binary: directory.path().join("fixture-mcp"),
            extension: directory.path().join("extension"),
            reduced: AtomicBool::new(true),
            quitting: AtomicBool::new(false),
            confirming_quit: AtomicBool::new(false),
        };
        let conflict = format!("PORT_IN_USE:{port}");
        assert_eq!(start(&desktop).await, Err(conflict.clone()));
        assert!(!desktop.directory.exists());
        assert!(desktop.service.lock().await.is_none());
        *desktop.error.lock().await = Some(conflict);
        drop(occupied);
        start(&desktop).await?;
        assert!(desktop.error.lock().await.is_none());
        let socket = tokio::net::TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, port)).await?;
        drop(socket);
        let service = desktop
            .service
            .lock()
            .await
            .take()
            .ok_or("SERVICE_MISSING")?;
        assert_eq!(service.snapshot().await["connected"], true);
        service.shutdown().await?;
        Ok(())
    }
}
