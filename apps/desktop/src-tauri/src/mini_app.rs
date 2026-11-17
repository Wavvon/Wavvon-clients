use std::collections::HashMap;
use std::sync::Mutex;
use tauri::ipc::CapabilityBuilder;
use tauri::webview::PageLoadEvent;
use tauri::{
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};

// window.parent is the window itself here, so a frame's postMessage lands on
// this listener. Replies come back through mini_app_post.
const VOICE_BRIDGE_SCRIPT: &str = "window.addEventListener('message', function (e) {     if (e.source !== window || e.origin !== window.location.origin) return;     var d = e.data;     if (!d || typeof d.type !== 'string' || d.type.indexOf('wavvon:') !== 0) return;     if (d.type === 'wavvon:setVoicePosition') {         window.__TAURI_INTERNALS__.invoke('mini_app_voice_position', { message: d }).catch(function () {});     } else if (d.type !== 'wavvon:voiceState' && d.type !== 'wavvon:voicePositionRefused') {         console.warn('ignoring unknown mini-app message', d.type);     } });";

/// What the shell opened each mini-app window for. The channel a frame's voice
/// request is judged against comes from here, never from the frame.
struct OpenApp {
    channel_id: String,
    app_id: String,
    origin: String,
}

#[derive(Default)]
pub(crate) struct MiniAppRegistry(Mutex<HashMap<String, OpenApp>>);

// A Tauri command's arguments are its JSON wire shape, so grouping them into a
// struct to satisfy the lint would change what the frontend sends.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub(crate) fn open_mini_app(
    app: AppHandle,
    registry: State<'_, MiniAppRegistry>,
    label: String,
    url: String,
    hub_url: String,
    token: String,
    channel_id: String,
    app_id: String,
    requires_camera: bool,
) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(&label) {
        existing.show().ok();
        existing.set_focus().ok();
        return Ok(());
    }

    let init_script = format!(
        "window.__WAVVON_HUB__ = {:?}; \
         window.__WAVVON_TOKEN__ = {:?}; \
         window.__WAVVON_CHANNEL__ = {:?}; \
         window.__WAVVON_APP_ID__ = {:?}; \
         window.__WAVVON_REQUIRES_CAMERA__ = {};          {}",
        hub_url, token, channel_id, app_id, requires_camera, VOICE_BRIDGE_SCRIPT
    );

    let url: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    // The window has no address bar, so its title is where the user sees whose
    // page this is.
    let title = format!("Mini App - {}", url.host_str().unwrap_or_default());
    let origin = url.origin().ascii_serialization();

    // The injected listener forwards a frame's voice request to one command.
    // Only this window, and only while it is on the app's own origin, may call it.
    if let Err(e) = app.add_capability(
        CapabilityBuilder::new(format!("mini-app-voice-{label}"))
            .local(false)
            .remote(format!("{origin}/*"))
            .window(label.clone())
            .permission("allow-mini-app-voice-position"),
    ) {
        eprintln!("mini-app voice bridge unavailable for {label}: {e}");
    }

    registry.0.lock().unwrap().insert(
        label.clone(),
        OpenApp {
            channel_id: channel_id.clone(),
            app_id: app_id.clone(),
            origin,
        },
    );

    let loaded = (channel_id, app_id);
    let window = WebviewWindowBuilder::new(&app, label.clone(), WebviewUrl::External(url))
        .title(title)
        .inner_size(800.0, 600.0)
        .initialization_script(&init_script)
        .on_page_load(move |w, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = w.app_handle().emit_to(
                    "main",
                    "mini-app-loaded",
                    serde_json::json!({ "label": w.label(), "channelId": loaded.0, "appId": loaded.1 }),
                );
            }
        })
        .build()
        .map_err(|e| e.to_string())?;

    let closed = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            closed
                .state::<MiniAppRegistry>()
                .0
                .lock()
                .unwrap()
                .remove(&label);
            let _ = closed.emit_to("main", "mini-app-closed", &label);
        }
    });

    Ok(())
}

#[tauri::command]
pub(crate) fn close_mini_app(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// A frame's `wavvon:setVoicePosition`, relayed by the script this module
/// injects. The checks that need voice state run in the main window; this only
/// vouches for which app and channel the sender is.
#[tauri::command]
pub(crate) fn mini_app_voice_position(
    window: WebviewWindow,
    registry: State<'_, MiniAppRegistry>,
    message: serde_json::Value,
) -> Result<(), String> {
    let (channel_id, app_id) = {
        let open = registry.0.lock().unwrap();
        let app = open.get(window.label()).ok_or("not a mini-app window")?;
        let current = window.url().map_err(|e| e.to_string())?;
        if current.origin().ascii_serialization() != app.origin {
            return Err("frame left the app origin".into());
        }
        (app.channel_id.clone(), app.app_id.clone())
    };
    window
        .app_handle()
        .emit_to(
            "main",
            "mini-app-voice-position",
            serde_json::json!({
                "label": window.label(),
                "channelId": channel_id,
                "appId": app_id,
                "message": message,
            }),
        )
        .map_err(|e| e.to_string())
}

/// Posts a client-to-frame message into a mini-app window.
#[tauri::command]
pub(crate) fn mini_app_post(
    app: AppHandle,
    registry: State<'_, MiniAppRegistry>,
    label: String,
    message: serde_json::Value,
) -> Result<(), String> {
    if !registry.0.lock().unwrap().contains_key(&label) {
        return Ok(());
    }
    if let Some(window) = app.get_webview_window(&label) {
        let json = serde_json::to_string(&message).map_err(|e| e.to_string())?;
        window
            .eval(format!(
                "window.postMessage({json}, window.location.origin)"
            ))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
