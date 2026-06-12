#![allow(dead_code)]
use tauri::{AppHandle, Manager};

#[derive(serde::Serialize)]
pub struct CaptureSource {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub thumbnail_b64: String,
}

#[tauri::command]
pub(crate) async fn list_capture_sources() -> Result<Vec<CaptureSource>, String> {
    use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
    use image::{imageops, DynamicImage, ImageFormat};

    let mut sources = Vec::new();

    // Screens
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    for (idx, monitor) in monitors.iter().enumerate() {
        let rgba = monitor.capture_image().map_err(|e| e.to_string())?;
        let thumb = imageops::thumbnail(&rgba, 160, 90);
        let dyn_img = DynamicImage::ImageRgba8(thumb);
        let mut buf = Vec::new();
        dyn_img
            .write_to(&mut std::io::Cursor::new(&mut buf), ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        sources.push(CaptureSource {
            id: format!("screen:{}:0", idx),
            name: monitor.name().to_string(),
            kind: "screen".to_string(),
            thumbnail_b64: B64.encode(&buf),
        });
    }

    // Windows
    let windows = xcap::Window::all().map_err(|e| e.to_string())?;
    for win in windows {
        if win.is_minimized() {
            continue;
        }
        let title = win.title().to_string();
        if title.is_empty() {
            continue;
        }
        let rgba = match win.capture_image() {
            Ok(i) => i,
            Err(_) => continue,
        };
        if rgba.width() < 100 || rgba.height() < 100 {
            continue;
        }
        let thumb = imageops::thumbnail(&rgba, 160, 90);
        let dyn_img = DynamicImage::ImageRgba8(thumb);
        let mut buf = Vec::new();
        dyn_img
            .write_to(&mut std::io::Cursor::new(&mut buf), ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        sources.push(CaptureSource {
            id: format!("window:{}", win.id()),
            name: title,
            kind: "window".to_string(),
            thumbnail_b64: B64.encode(&buf),
        });
    }

    Ok(sources)
}

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
    .title("Voxply \u{2014} stream")
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
