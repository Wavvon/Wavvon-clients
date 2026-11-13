//! Sticker routes (stickers.md section 5). One pass-through command for the
//! JSON routes instead of a command per route: the shared admin UI speaks the
//! hub's own shapes, so the shell only adds the session's token and refuses
//! anything that is not a sticker route.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use tauri::State;

use crate::state::{active_session, AppState};

/// The only routes the pass-through will call. `/hub/settings` and `PATCH
/// /hub` carry the `stickers_*` settings.
fn allowed(method: &str, path: &str) -> bool {
    let path = path.split('?').next().unwrap_or(path);
    if path.contains("..") || !path.starts_with('/') {
        return false;
    }
    let segs: Vec<&str> = path.trim_matches('/').split('/').collect();
    match (method, segs.as_slice()) {
        (_, ["stickers", "packs", ..]) | (_, ["admin", "stickers", ..]) => true,
        ("POST", ["channels", id, "stickers"]) => !id.is_empty(),
        ("GET", ["hub", "settings"]) | ("PATCH", ["hub"]) => true,
        ("GET" | "PUT", ["admin", "settings", "widget"]) => true,
        _ => false,
    }
}

/// Errors read `<status>:<body>` so the shared UI can map a status to a
/// sentence; a transport failure has no status and no prefix.
fn status_error(status: reqwest::StatusCode, body: String) -> String {
    format!("{}:{}", status.as_u16(), body)
}

#[tauri::command]
pub(crate) async fn sticker_api(
    method: String,
    path: String,
    body: Option<serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let method = method.to_uppercase();
    if !allowed(&method, &path) {
        return Err(format!("not a sticker route: {method} {path}"));
    }
    let (hub_url, token) = active_session(&state)?;
    let verb = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
    let mut req = state
        .http_client
        .request(verb, format!("{hub_url}{path}"))
        .bearer_auth(&token);
    if let Some(b) = body {
        req = req.json(&b);
    }
    let resp = req.send().await.map_err(|e| format!("Failed: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(status_error(status, text));
    }
    if text.is_empty() {
        return Ok(serde_json::Value::Null);
    }
    serde_json::from_str(&text).map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn sticker_upload(
    pack_id: String,
    name: String,
    file_b64: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    if pack_id.is_empty() || pack_id.contains('/') {
        return Err("bad pack id".to_string());
    }
    let (hub_url, token) = active_session(&state)?;
    let bytes = B64
        .decode(file_b64)
        .map_err(|e| format!("Bad file data: {e}"))?;
    let part = reqwest::multipart::Part::bytes(bytes).file_name("sticker");
    let form = reqwest::multipart::Form::new()
        .text("name", name)
        .part("file", part);
    let resp = state
        .http_client
        .post(format!("{hub_url}/stickers/packs/{pack_id}/stickers"))
        .bearer_auth(&token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(status_error(status, text));
    }
    serde_json::from_str(&text).map_err(|e| format!("Invalid: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_sticker_routes_and_nothing_else() {
        assert!(allowed("GET", "/stickers/packs"));
        assert!(allowed("DELETE", "/stickers/packs/p1/stickers/s1"));
        assert!(allowed("GET", "/admin/stickers?sort=used&limit=50"));
        assert!(allowed("DELETE", "/admin/stickers/s1?block=true"));
        assert!(allowed("POST", "/channels/c1/stickers"));
        assert!(allowed("PATCH", "/hub"));
        assert!(!allowed("DELETE", "/hub"));
        assert!(!allowed("GET", "/channels/c1/messages"));
        assert!(!allowed("DELETE", "/channels/c1/stickers"));
        assert!(!allowed("GET", "/stickers/packs/../../admin/users"));
        assert!(!allowed("GET", "stickers/packs"));
    }

    #[test]
    fn status_errors_carry_the_status_first() {
        assert_eq!(
            status_error(reqwest::StatusCode::CONFLICT, "pack_full".into()),
            "409:pack_full"
        );
    }
}
