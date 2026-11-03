use tauri::{AppHandle, Manager};

#[tauri::command]
pub(crate) async fn open_pip_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("screen-share-pip") {
        w.show().ok();
        w.set_focus().ok();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        "screen-share-pip",
        tauri::WebviewUrl::App("pip.html".into()),
    )
    .title("Wavvon \u{2014} stream")
    .inner_size(320.0, 180.0)
    .min_inner_size(160.0, 90.0)
    .always_on_top(true)
    .decorations(false)
    .resizable(true)
    .build()
    .map_err(|e| format!("Failed to open PiP: {e}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn close_pip_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("screen-share-pip") {
        w.close().map_err(|e| format!("{e}"))?;
    }
    Ok(())
}
