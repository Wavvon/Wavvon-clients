use tauri::{AppHandle, Emitter, Manager};

/// One floating window per watched stream, so several can sit over a game at
/// once. The key becomes part of a window label and an event name, so only
/// characters both accept get through.
fn pip_label(key: &str) -> Result<String, String> {
    if key.is_empty()
        || key.len() > 64
        || !key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("invalid stream key".to_string());
    }
    Ok(format!("screen-share-pip-{key}"))
}

#[tauri::command]
pub(crate) async fn open_pip_window(app: AppHandle, key: String) -> Result<(), String> {
    let label = pip_label(&key)?;
    if let Some(w) = app.get_webview_window(&label) {
        w.show().ok();
        w.set_focus().ok();
        return Ok(());
    }
    let builder = tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App(format!("pip.html?key={key}").into()),
    )
    .title("Wavvon \u{2014} stream")
    .inner_size(320.0, 180.0)
    .min_inner_size(160.0, 90.0)
    .always_on_top(true)
    .decorations(false)
    .resizable(true);
    // Transparency is what makes the opacity setting see-through. On macOS it
    // needs the private-API feature, so there the window only dims.
    #[cfg(not(target_os = "macos"))]
    let builder = builder.transparent(true);
    builder
        .build()
        .map_err(|e| format!("Failed to open PiP: {e}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn close_pip_window(app: AppHandle, key: String) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(&pip_label(&key)?) {
        w.close().map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

/// Click-through: the window lets the mouse fall to the game under it. It
/// can then not be clicked to undo that, so the main window offers the way
/// back as well.
#[tauri::command]
pub(crate) async fn set_pip_click_through(
    app: AppHandle,
    key: String,
    on: bool,
) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(&pip_label(&key)?) {
        w.set_ignore_cursor_events(on).map_err(|e| format!("{e}"))?;
        w.emit(&format!("pip-click-through-{key}"), on).ok();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::pip_label;

    #[test]
    fn keys_are_confined_to_label_safe_characters() {
        assert_eq!(pip_label("ab-1_c").unwrap(), "screen-share-pip-ab-1_c");
        assert!(pip_label("").is_err());
        assert!(pip_label("a/b").is_err());
        assert!(pip_label("a?b=c").is_err());
        assert!(pip_label(&"a".repeat(65)).is_err());
    }
}
