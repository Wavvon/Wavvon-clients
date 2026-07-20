use crate::state::{active_session, active_ws_tx, AppState, WsCommand};
use crate::types::ChannelInfo;
use tauri::State;

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
pub(crate) async fn list_hub_emojis(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let (hub_url, token) = active_session(&state)?;
    state
        .http_client
        .get(format!("{hub_url}/emojis"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) async fn create_channel(
    name: String,
    parent_id: Option<String>,
    is_category: bool,
    description: Option<String>,
    channel_type: Option<String>,
    banner_url: Option<String>,
    spawner_name_template: Option<String>,
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
            "channel_type": channel_type,
            "banner_url": banner_url,
            "spawner_name_template": spawner_name_template,
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
    let resp = state
        .http_client
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
    let resp = state
        .http_client
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
    let body = serde_json::json!({ "parent_id": parent_id });
    let resp = state
        .http_client
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
    let body =
        serde_json::json!({ "icon": icon, "color": color, "custom_icon_svg": custom_icon_svg });
    let resp = state
        .http_client
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
    let resp = state
        .http_client
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
    let resp = state
        .http_client
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
    let _ = tx.send(WsCommand::Typing { channel_id, typing });
    Ok(())
}

#[tauri::command]
pub(crate) fn set_dm_typing(
    conversation_id: String,
    typing: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let tx = active_ws_tx(&state)?;
    let _ = tx.send(WsCommand::DmTyping {
        conversation_id,
        typing,
    });
    Ok(())
}

#[tauri::command]
pub(crate) async fn patch_channel_banner_file(
    channel_id: String,
    banner_file_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let resp = state
        .http_client
        .patch(format!("{hub_url}/channels/{channel_id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "banner_file_id": banner_file_id }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn patch_channel_banner_url(
    channel_id: String,
    banner_url: Option<String>,
    banner_file_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    // Only Some fields go in the body — the hub clears the other banner
    // source column when one is set, so sending an absent field as null
    // would wipe it (same omitted-vs-null trap as update_role).
    let mut body = serde_json::Map::new();
    if let Some(u) = banner_url {
        body.insert("banner_url".into(), serde_json::Value::String(u));
    }
    if let Some(id) = banner_file_id {
        body.insert("banner_file_id".into(), serde_json::Value::String(id));
    }
    let resp = state
        .http_client
        .patch(format!("{hub_url}/channels/{channel_id}"))
        .bearer_auth(&token)
        .json(&serde_json::Value::Object(body))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}
