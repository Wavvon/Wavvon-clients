// wavvon:// links (issue #377). The installers register the scheme from
// tauri.conf.json; a link clicked while the app runs reaches on_open_url
// (on Windows and Linux via the single-instance plugin), and the link that
// launched the app is read once by the frontend through
// get_pending_deep_link. Both feed the add-hub flow in useAddHubFlow.ts.
// A deep link carries public data only (hub, channel, invite code).

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

static LAUNCH_LINK_TAKEN: AtomicBool = AtomicBool::new(false);

pub fn focus_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

pub fn setup(app: &tauri::App) {
    // The installers register the scheme on Windows and Linux too, but a dev
    // build and a bare AppImage are never installed.
    #[cfg(any(windows, target_os = "linux"))]
    if let Err(e) = app.deep_link().register_all() {
        tracing::warn!("could not register wavvon:// links: {e}");
    }
    let handle = app.handle().clone();
    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            let _ = handle.emit("join-hub-requested", url.to_string());
        }
        focus_main(&handle);
    });
}

// Taken once: the frontend asks on every mount (an account switch remounts
// it), and the launch link must not reopen the dialog each time.
#[tauri::command]
pub fn get_pending_deep_link(app: AppHandle) -> Result<Option<String>, String> {
    if LAUNCH_LINK_TAKEN.swap(true, Ordering::SeqCst) {
        return Ok(None);
    }
    let urls = app.deep_link().get_current().map_err(|e| e.to_string())?;
    Ok(urls
        .and_then(|u| u.into_iter().next())
        .map(|u| u.to_string()))
}
