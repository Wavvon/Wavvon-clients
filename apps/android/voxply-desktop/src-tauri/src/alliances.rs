use crate::state::{active_session, AppState};
use serde::{Deserialize, Serialize};
use tauri::State;

// --- DTOs ---

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct AllianceInfo {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) created_by: String,
    pub(crate) created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct AllianceMemberInfo {
    pub(crate) hub_public_key: String,
    pub(crate) hub_name: String,
    pub(crate) hub_url: String,
    pub(crate) joined_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct AllianceDetail {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) created_by: String,
    pub(crate) created_at: i64,
    pub(crate) members: Vec<AllianceMemberInfo>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct AllianceInvite {
    pub(crate) token: String,
    pub(crate) alliance_id: String,
    pub(crate) alliance_name: String,
    pub(crate) hub_url: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct AllianceSharedChannel {
    pub(crate) channel_id: String,
    pub(crate) channel_name: String,
    pub(crate) hub_public_key: String,
    pub(crate) hub_name: String,
}

/// Mirror of the hub's `PendingAllianceInviteRow`.
#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct PendingAllianceInvite {
    pub(crate) id: String,
    pub(crate) alliance_id: String,
    pub(crate) alliance_name: String,
    pub(crate) from_hub_url: String,
    pub(crate) from_hub_name: String,
    pub(crate) from_hub_public_key: String,
    pub(crate) invite_token: String,
    pub(crate) created_at: i64,
    pub(crate) message: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ProxiedMessage {
    pub(crate) id: String,
    pub(crate) channel_id: String,
    pub(crate) sender: String,
    pub(crate) sender_name: Option<String>,
    pub(crate) content: String,
    pub(crate) created_at: i64,
    pub(crate) edited_at: Option<i64>,
    #[serde(default)]
    pub(crate) attachments: Vec<crate::messages::AttachmentInfo>,
}

// --- Tauri commands ---

#[tauri::command]
pub(crate) async fn list_alliances(
    state: State<'_, AppState>,
) -> Result<Vec<AllianceInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/alliances"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn create_alliance(
    name: String,
    state: State<'_, AppState>,
) -> Result<AllianceInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/alliances"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "name": name }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn get_alliance(
    alliance_id: String,
    state: State<'_, AppState>,
) -> Result<AllianceDetail, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/alliances/{alliance_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn create_alliance_invite(
    alliance_id: String,
    state: State<'_, AppState>,
) -> Result<AllianceInvite, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/alliances/{alliance_id}/invite"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn join_alliance(
    inviter_hub_url: String,
    alliance_id: String,
    invite_token: String,
    own_hub_public_url: String,
    state: State<'_, AppState>,
) -> Result<AllianceDetail, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    // The join endpoint runs on OUR hub; our hub then talks to the inviter
    // and mirrors the alliance into our local DB so it shows up in our list.
    let resp = client
        .post(format!("{hub_url}/alliances/join"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "inviter_hub_url": inviter_hub_url,
            "alliance_id": alliance_id,
            "invite_token": invite_token,
            "own_hub_url": own_hub_public_url,
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
pub(crate) async fn leave_alliance(
    alliance_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/alliances/{alliance_id}/leave"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

/// Tell our own hub to push a direct invite to another hub.
#[tauri::command]
pub(crate) async fn send_alliance_push_invite(
    alliance_id: String,
    target_hub_url: String,
    own_hub_url: String,
    message: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/alliances/{alliance_id}/push-invite"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "target_hub_url": target_hub_url,
            "own_hub_url": own_hub_url,
            "message": message,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

/// List pending push invites received by our hub.
#[tauri::command]
pub(crate) async fn list_pending_alliance_invites(
    state: State<'_, AppState>,
) -> Result<Vec<PendingAllianceInvite>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/alliances/pending-invites"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

/// Accept or decline a pending push invite.
/// `own_hub_url` is required when accepting — the hub needs to pass it to the
/// inviter so the inviter can call back to verify identity.
#[tauri::command]
pub(crate) async fn respond_to_alliance_invite(
    invite_id: String,
    accept: bool,
    own_hub_url: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    if accept {
        let url_val = own_hub_url.unwrap_or_default();
        let resp = client
            .post(format!(
                "{hub_url}/alliances/pending-invites/{invite_id}/accept"
            ))
            .bearer_auth(&token)
            .json(&serde_json::json!({ "own_hub_url": url_val }))
            .send()
            .await
            .map_err(|e| format!("Failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(resp.text().await.unwrap_or_default());
        }
    } else {
        let resp = client
            .delete(format!("{hub_url}/alliances/pending-invites/{invite_id}"))
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| format!("Failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(resp.text().await.unwrap_or_default());
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn get_alliance_channel_messages(
    alliance_id: String,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ProxiedMessage>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!(
            "{hub_url}/alliances/{alliance_id}/channels/{channel_id}/messages"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn send_alliance_channel_message(
    alliance_id: String,
    channel_id: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!(
            "{hub_url}/alliances/{alliance_id}/channels/{channel_id}/messages"
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "content": content }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn list_alliance_shared_channels(
    alliance_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<AllianceSharedChannel>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/alliances/{alliance_id}/channels"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn share_channel_with_alliance(
    alliance_id: String,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/alliances/{alliance_id}/channels"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "channel_id": channel_id }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn unshare_channel_from_alliance(
    alliance_id: String,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!(
            "{hub_url}/alliances/{alliance_id}/channels/{channel_id}"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}
