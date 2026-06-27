use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub(crate) fn open_mini_app(
    app: AppHandle,
    label: String,
    url: String,
    hub_url: String,
    token: String,
    channel_id: String,
    bot_id: String,
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
         window.__WAVVON_BOT_ID__ = {:?}; \
         window.__WAVVON_REQUIRES_CAMERA__ = {};",
        hub_url, token, channel_id, bot_id, requires_camera
    );

    WebviewWindowBuilder::new(
        &app,
        label,
        WebviewUrl::External(url.parse().map_err(|e: url::ParseError| e.to_string())?),
    )
    .title("Mini App")
    .inner_size(800.0, 600.0)
    .initialization_script(&init_script)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub(crate) fn close_mini_app(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
