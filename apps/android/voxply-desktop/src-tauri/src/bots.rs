use crate::state::{active_session, session_for_url, AppState};
use tauri::State;

// --- DTOs (bot management for hub owners) ---

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct BotAdminInfo {
    pub(crate) public_key: String,
    pub(crate) display_name: String,
    pub(crate) created_by: String,
    pub(crate) created_at: i64,
    pub(crate) webhook_url: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct BotCreatedResult {
    pub(crate) public_key: String,
    pub(crate) display_name: String,
    pub(crate) created_by: String,
    pub(crate) created_at: i64,
    pub(crate) token: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct BotSlashCommandInfo {
    pub(crate) command: String,
    pub(crate) description: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct BotDetailInfo {
    pub(crate) public_key: String,
    pub(crate) display_name: String,
    pub(crate) created_by: String,
    pub(crate) created_at: i64,
    pub(crate) webhook_url: Option<String>,
    pub(crate) commands: Vec<BotSlashCommandInfo>,
}

// --- Tauri commands: user-facing bot management ---

#[tauri::command]
pub(crate) async fn list_bots(
    state: State<'_, AppState>,
) -> Result<Vec<crate::admin::BotInfo>, String> {
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
) -> Result<crate::admin::BotInfo, String> {
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

// --- Tauri commands: admin bot management ---

#[tauri::command]
pub(crate) async fn admin_list_bots(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Vec<BotAdminInfo>, String> {
    let token = session_for_url(&state, &hub_url)?;
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
    let token = session_for_url(&state, &hub_url)?;
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
    let token = session_for_url(&state, &hub_url)?;
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
    let token = session_for_url(&state, &hub_url)?;
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
    let token = session_for_url(&state, &hub_url)?;
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
