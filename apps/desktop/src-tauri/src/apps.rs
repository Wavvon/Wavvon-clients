use crate::state::{AppState, WsCommand};
use tauri::State;

/// GET /apps -- the apps registered on this hub, with the slash commands
/// each one answers. Readable by any member; registering is the gated act.
#[tauri::command]
pub(crate) async fn list_apps(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Vec<AppProfileResult>, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/apps"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))
}

// ---------------------------------------------------------------------------
// Component interactions
// ---------------------------------------------------------------------------

#[tauri::command]
pub(crate) async fn send_component_interaction(
    hub_url: String,
    message_id: String,
    custom_id: String,
    values: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let hubs = state.hubs.lock().unwrap();
    let session = hubs
        .values()
        .find(|s| s.hub_url.trim_end_matches('/') == hub_url.trim_end_matches('/'))
        .ok_or_else(|| format!("No active session for hub: {hub_url}"))?;
    let tx = session.ws_tx.clone();
    drop(hubs);
    let payload = serde_json::json!({
        "type": "component_interaction",
        "message_id": message_id,
        "custom_id": custom_id,
        "values": values,
    });
    tx.send(WsCommand::Raw(payload.to_string()))
        .map_err(|_| "WS closed".to_string())
}


// ---------------------------------------------------------------------------
// App profile
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct AppCommandDef {
    pub name: String,
    pub description: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct AppProfileResult {
    pub pubkey: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub description: Option<String>,
    pub commands: Vec<AppCommandDef>,
}


// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct WebhookInfo {
    pub id: String,
    pub display_name: String,
    pub channel_id: String,
    pub channel_name: Option<String>,
    pub webhook_url: String,
    pub created_by: String,
    pub created_at: i64,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct WebhookCreatedResult {
    pub id: String,
    pub webhook_url: String,
}

#[tauri::command]
pub(crate) async fn admin_list_webhooks(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Vec<WebhookInfo>, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/admin/webhooks"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
pub(crate) async fn admin_create_webhook(
    hub_url: String,
    channel_id: String,
    display_name: String,
    avatar_url: Option<String>,
    state: State<'_, AppState>,
) -> Result<WebhookCreatedResult, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/admin/webhooks"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "channel_id": channel_id,
            "display_name": display_name,
            "avatar_url": avatar_url,
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
pub(crate) async fn admin_regenerate_webhook(
    hub_url: String,
    webhook_id: String,
    state: State<'_, AppState>,
) -> Result<WebhookCreatedResult, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .patch(format!("{base}/admin/webhooks/{webhook_id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
pub(crate) async fn admin_delete_webhook(
    hub_url: String,
    webhook_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .delete(format!("{base}/admin/webhooks/{webhook_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}