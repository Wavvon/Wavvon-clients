use crate::state::{active_session, active_ws_tx, AppState, WsCommand};
use serde::{Deserialize, Serialize};
use tauri::State;

// --- DTOs ---

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ChannelInfo {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) created_by: String,
    pub(crate) parent_id: Option<String>,
    pub(crate) is_category: bool,
    pub(crate) display_order: i64,
    pub(crate) description: Option<String>,
    pub(crate) icon: Option<String>,
    pub(crate) color: Option<String>,
    pub(crate) custom_icon_svg: Option<String>,
    pub(crate) created_at: i64,
}

// --- Tauri commands ---

#[tauri::command]
pub(crate) async fn list_channels(state: State<'_, AppState>) -> Result<Vec<ChannelInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client
        .get(format!("{hub_url}/channels"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn create_channel(
    name: String,
    parent_id: Option<String>,
    is_category: bool,
    description: Option<String>,
    state: State<'_, AppState>,
) -> Result<ChannelInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/channels"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "name": name,
            "parent_id": parent_id,
            "is_category": is_category,
            "description": description,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn update_channel_description(
    channel_id: String,
    description: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .patch(format!("{hub_url}/channels/{channel_id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "description": description }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn rename_channel(
    channel_id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .patch(format!("{hub_url}/channels/{channel_id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "name": name }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn move_channel(
    channel_id: String,
    parent_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    // Body always contains the parent_id key so the server treats it as a real
    // change (Option<Option<String>> tri-state).
    let body = serde_json::json!({ "parent_id": parent_id });
    let resp = client
        .patch(format!("{hub_url}/channels/{channel_id}"))
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn update_channel_appearance(
    channel_id: String,
    icon: Option<String>,
    color: Option<String>,
    custom_icon_svg: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let body =
        serde_json::json!({ "icon": icon, "color": color, "custom_icon_svg": custom_icon_svg });
    let resp = client
        .patch(format!("{hub_url}/channels/{channel_id}"))
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn reorder_channels(
    channel_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/channels/reorder"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "channel_ids": channel_ids }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn delete_channel(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/channels/{channel_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn subscribe_channel(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let tx = active_ws_tx(&state)?;
    tx.send(WsCommand::Subscribe(channel_id))
        .map_err(|_| "WS closed".to_string())
}

#[tauri::command]
pub(crate) fn unsubscribe_channel(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let tx = active_ws_tx(&state)?;
    tx.send(WsCommand::Unsubscribe(channel_id))
        .map_err(|_| "WS closed".to_string())
}

#[tauri::command]
pub(crate) fn set_typing(
    channel_id: String,
    typing: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let tx = active_ws_tx(&state)?;
    // Best-effort: if the WS is closed, the user just doesn't broadcast a
    // typing event -- not worth surfacing to the UI.
    let _ = tx.send(WsCommand::Typing { channel_id, typing });
    Ok(())
}
