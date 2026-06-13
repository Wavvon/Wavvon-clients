use crate::state::{active_session, AppState};
use serde::{Deserialize, Serialize};
use tauri::State;

// --- DTOs ---

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct FriendInfo {
    pub(crate) public_key: String,
    pub(crate) display_name: Option<String>,
    pub(crate) since: i64,
}

// --- Tauri commands ---

#[tauri::command]
pub(crate) async fn list_friends(state: State<'_, AppState>) -> Result<Vec<FriendInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client
        .get(format!("{hub_url}/friends"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn list_pending_friends(
    state: State<'_, AppState>,
) -> Result<Vec<FriendInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client
        .get(format!("{hub_url}/friends/pending"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn send_friend_request(
    target_public_key: String,
    friend_hub_url: Option<String>,
    display_name: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/friends"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "target_public_key": target_public_key,
            "hub_url": friend_hub_url,
            "display_name": display_name,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn accept_friend(
    from_public_key: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/friends/{from_public_key}/accept"))
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
pub(crate) async fn remove_friend(
    target_public_key: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/friends/{target_public_key}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}
