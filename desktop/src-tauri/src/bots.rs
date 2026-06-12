#![allow(dead_code)]
use crate::state::WsCommand;
use crate::state::{active_session, AppState};
use crate::types::BotInfo;
use tauri::State;

#[tauri::command]
pub(crate) async fn list_bots(state: State<'_, AppState>) -> Result<Vec<BotInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client
        .get(format!("{hub_url}/bots"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
pub(crate) async fn create_bot(
    name: String,
    state: State<'_, AppState>,
) -> Result<BotInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/bots"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "name": name }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        let msg = resp.text().await.unwrap_or_default();
        return Err(msg);
    }
    resp.json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
pub(crate) async fn delete_bot(
    public_key: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/bots/{public_key}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        let msg = resp.text().await.unwrap_or_default();
        return Err(msg);
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn rotate_bot_token(
    public_key: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/bots/{public_key}/rotate-token"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        let msg = resp.text().await.unwrap_or_default();
        return Err(msg);
    }
    let v: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))?;
    v["token"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or("Missing token in response".to_string())
}

// ---------------------------------------------------------------------------
// Admin bot management
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct BotAdminInfo {
    pub public_key: String,
    pub display_name: String,
    pub created_by: String,
    pub created_at: i64,
    pub webhook_url: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct BotCreatedResult {
    pub public_key: String,
    pub display_name: String,
    pub created_by: String,
    pub created_at: i64,
    pub token: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct BotSlashCommandInfo {
    pub command: String,
    pub description: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct BotDetailInfo {
    pub public_key: String,
    pub display_name: String,
    pub created_by: String,
    pub created_at: i64,
    pub webhook_url: Option<String>,
    pub commands: Vec<BotSlashCommandInfo>,
}

#[tauri::command]
pub(crate) async fn admin_list_bots(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Vec<BotAdminInfo>, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/admin/bots"))
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
pub(crate) async fn admin_create_bot(
    hub_url: String,
    display_name: String,
    state: State<'_, AppState>,
) -> Result<BotCreatedResult, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/admin/bots"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "display_name": display_name }))
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
pub(crate) async fn admin_delete_bot(
    hub_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .delete(format!("{base}/admin/bots/{pubkey}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn admin_set_bot_webhook(
    hub_url: String,
    pubkey: String,
    webhook_url: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .put(format!("{base}/admin/bots/{pubkey}/webhook"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "webhook_url": webhook_url }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn admin_get_bot_detail(
    hub_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<BotDetailInfo, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/admin/bots/{pubkey}"))
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
// Bot profile
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct BotCommandDef {
    pub name: String,
    pub description: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct BotProfileResult {
    pub pubkey: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub description: Option<String>,
    pub commands: Vec<BotCommandDef>,
}

#[tauri::command]
pub(crate) async fn get_bot_profile(
    hub_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<BotProfileResult, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/bots/{pubkey}"))
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
// External bots
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct ExternalBotRow {
    pub public_key: String,
    pub display_name: Option<String>,
    pub local_note: Option<String>,
    pub approval_status: String,
    pub last_seen_at: Option<i64>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct ExternalBotInviteResult {
    pub bot_invite_token: String,
    pub pubkey: String,
}

#[tauri::command]
pub(crate) async fn admin_list_external_bots(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Vec<ExternalBotRow>, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/admin/bots/external"))
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
pub(crate) async fn admin_add_external_bot(
    hub_url: String,
    pubkey: String,
    local_note: Option<String>,
    state: State<'_, AppState>,
) -> Result<ExternalBotInviteResult, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/admin/bots/external"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "pubkey": pubkey, "local_note": local_note }))
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
pub(crate) async fn admin_remove_external_bot(
    hub_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .delete(format!("{base}/admin/bots/external/{pubkey}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn admin_set_bot_channel_scope(
    hub_url: String,
    pubkey: String,
    channel_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .put(format!("{base}/admin/bots/{pubkey}/channels"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "channel_ids": channel_ids }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
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
