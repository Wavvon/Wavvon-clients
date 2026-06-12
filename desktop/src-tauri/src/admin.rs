#![allow(dead_code)]
use crate::state::{active_session, AppState};
use crate::types::{
    HubBranding, HubIcon, HubSettings, InfoResponse, MeInfo, PendingUser, RoleInfo, UserInfo,
};
use tauri::{AppHandle, Emitter, State};

// ---------------------------------------------------------------------------
// User list — with transparent reauth on 401
// ---------------------------------------------------------------------------

#[tauri::command]
pub(crate) async fn list_users(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<UserInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/users"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        let active_id = state.active_hub.lock().unwrap().clone();
        if let Some(hub_id) = active_id {
            match crate::ws::reauth_session(&state, &app, &hub_id).await {
                Ok(new_token) => {
                    let retry = client
                        .get(format!("{hub_url}/users"))
                        .bearer_auth(&new_token)
                        .send()
                        .await
                        .map_err(|e| format!("Failed: {e}"))?;
                    return retry.json().await.map_err(|e| format!("Invalid: {e}"));
                }
                Err(e) => {
                    let hubs = state.hubs.lock().unwrap();
                    if let Some(session) = hubs.get(&hub_id) {
                        let _ = app.emit(
                            "hub-session-lost",
                            serde_json::json!({
                                "hub_id": session.hub_id,
                                "hub_name": session.hub_name,
                            }),
                        );
                    }
                    return Err(format!("Session lost: {e}"));
                }
            }
        }
        return Err("Session lost".to_string());
    }

    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

// ---------------------------------------------------------------------------
// Profile / me
// ---------------------------------------------------------------------------

#[tauri::command]
pub(crate) async fn update_display_name(
    display_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .patch(format!("{hub_url}/me"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "display_name": display_name }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn update_avatar(
    avatar: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .patch(format!("{hub_url}/me"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "avatar": avatar }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn get_me(state: State<'_, AppState>) -> Result<MeInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client
        .get(format!("{hub_url}/me"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))
}

// ---------------------------------------------------------------------------
// Hub branding
// ---------------------------------------------------------------------------

#[tauri::command]
pub(crate) async fn get_hub_branding(state: State<'_, AppState>) -> Result<HubBranding, String> {
    let (hub_url, _) = active_session(&state)?;
    let client = state.http_client.clone();
    let info: InfoResponse = client
        .get(format!("{hub_url}/info"))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))?;
    Ok(HubBranding {
        name: info.name,
        description: info.description,
        icon: info.icon,
    })
}

#[tauri::command]
pub(crate) async fn update_hub_branding(
    name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    require_approval: Option<bool>,
    min_security_level: Option<u32>,
    max_channel_depth: Option<u32>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .patch(format!("{hub_url}/hub"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "name": name,
            "description": description,
            "icon": icon,
            "require_approval": require_approval,
            "min_security_level": min_security_level,
            "max_channel_depth": max_channel_depth,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }

    if let Some(active_id) = state.active_hub.lock().unwrap().clone() {
        if let Some(s) = state.hubs.lock().unwrap().get_mut(&active_id) {
            if let Some(new_name) = name {
                s.hub_name = new_name;
            }
            if let Some(new_icon) = icon {
                s.hub_icon = if new_icon.is_empty() {
                    None
                } else {
                    Some(new_icon)
                };
            }
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

#[tauri::command]
pub(crate) async fn list_roles(state: State<'_, AppState>) -> Result<Vec<RoleInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client
        .get(format!("{hub_url}/roles"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn create_role(
    name: String,
    permissions: Vec<String>,
    priority: i64,
    display_separately: Option<bool>,
    state: State<'_, AppState>,
) -> Result<RoleInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/roles"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "name": name,
            "permissions": permissions,
            "priority": priority,
            "display_separately": display_separately.unwrap_or(false),
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
pub(crate) async fn update_role(
    role_id: String,
    name: Option<String>,
    permissions: Option<Vec<String>>,
    priority: Option<i64>,
    display_separately: Option<bool>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .patch(format!("{hub_url}/roles/{role_id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "name": name,
            "permissions": permissions,
            "priority": priority,
            "display_separately": display_separately,
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
pub(crate) async fn delete_role(role_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/roles/{role_id}"))
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
pub(crate) async fn assign_role(
    target_public_key: String,
    role_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .put(format!(
            "{hub_url}/users/{target_public_key}/roles/{role_id}"
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

#[tauri::command]
pub(crate) async fn unassign_role(
    target_public_key: String,
    role_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!(
            "{hub_url}/users/{target_public_key}/roles/{role_id}"
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

// ---------------------------------------------------------------------------
// Hub settings / members / icons
// ---------------------------------------------------------------------------

#[tauri::command]
pub(crate) async fn get_hub_settings(state: State<'_, AppState>) -> Result<HubSettings, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/hub/settings"))
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
pub(crate) async fn list_pending_members(
    state: State<'_, AppState>,
) -> Result<Vec<PendingUser>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/hub/pending"))
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
pub(crate) async fn approve_member(
    target_public_key: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/hub/pending/{target_public_key}/approve"))
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
pub(crate) async fn list_hub_icons(state: State<'_, AppState>) -> Result<Vec<HubIcon>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/hub/icons"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json::<Vec<HubIcon>>()
        .await
        .map_err(|e| format!("Parse error: {e}"))
}

#[tauri::command]
pub(crate) async fn create_hub_icon(
    name: String,
    svg_content: String,
    state: State<'_, AppState>,
) -> Result<HubIcon, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/hub/icons"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "name": name, "svg_content": svg_content }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json::<HubIcon>()
        .await
        .map_err(|e| format!("Parse error: {e}"))
}

#[tauri::command]
pub(crate) async fn rename_hub_icon(
    icon_id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .patch(format!("{hub_url}/hub/icons/{icon_id}"))
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
pub(crate) async fn delete_hub_icon(
    icon_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/hub/icons/{icon_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Member admin structs + moderation
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct MemberAdminInfo {
    pub public_key: String,
    pub display_name: Option<String>,
    pub online: bool,
    pub first_seen_at: i64,
    pub last_seen_at: i64,
    pub roles: Vec<RoleInfo>,
}

#[tauri::command]
pub(crate) async fn list_hub_members(
    state: State<'_, AppState>,
) -> Result<Vec<MemberAdminInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/hub/members"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

pub(crate) async fn post_moderation(
    state: &State<'_, AppState>,
    path: &str,
    body: serde_json::Value,
) -> Result<(), String> {
    let (hub_url, token) = active_session(state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/{path}"))
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
pub(crate) async fn kick_user_cmd(
    target_public_key: String,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    post_moderation(
        &state,
        "moderation/kick",
        serde_json::json!({
            "target_public_key": target_public_key,
            "reason": reason,
        }),
    )
    .await
}

#[tauri::command]
pub(crate) async fn ban_user_cmd(
    target_public_key: String,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    post_moderation(
        &state,
        "moderation/bans",
        serde_json::json!({
            "target_public_key": target_public_key,
            "reason": reason,
        }),
    )
    .await
}

#[tauri::command]
pub(crate) async fn mute_user_cmd(
    target_public_key: String,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    post_moderation(
        &state,
        "moderation/mutes",
        serde_json::json!({
            "target_public_key": target_public_key,
            "reason": reason,
        }),
    )
    .await
}

#[tauri::command]
pub(crate) async fn timeout_user_cmd(
    target_public_key: String,
    duration_seconds: u64,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    post_moderation(
        &state,
        "moderation/timeout",
        serde_json::json!({
            "target_public_key": target_public_key,
            "duration_seconds": duration_seconds,
            "reason": reason,
        }),
    )
    .await
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct ChannelBanInfo {
    pub channel_id: String,
    pub target_public_key: String,
    pub banned_by: String,
    pub reason: Option<String>,
    pub created_at: i64,
}

#[tauri::command]
pub(crate) async fn channel_ban_user(
    channel_id: String,
    target_public_key: String,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/moderation/channels/{channel_id}/bans"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "target_public_key": target_public_key,
            "reason": reason,
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
pub(crate) async fn channel_unban_user(
    channel_id: String,
    target_public_key: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!(
            "{hub_url}/moderation/channels/{channel_id}/bans/{target_public_key}"
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

#[tauri::command]
pub(crate) async fn list_channel_bans(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ChannelBanInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/moderation/channels/{channel_id}/bans"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct VoiceMuteInfo {
    pub target_public_key: String,
    pub muted_by: String,
    pub reason: Option<String>,
    pub created_at: i64,
}

#[tauri::command]
pub(crate) async fn voice_mute_user_cmd(
    target_public_key: String,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    post_moderation(
        &state,
        "moderation/voice-mutes",
        serde_json::json!({
            "target_public_key": target_public_key,
            "reason": reason,
        }),
    )
    .await
}

#[tauri::command]
pub(crate) async fn voice_unmute_user_cmd(
    target_public_key: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!(
            "{hub_url}/moderation/voice-mutes/{target_public_key}"
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

#[tauri::command]
pub(crate) async fn list_voice_mutes(
    state: State<'_, AppState>,
) -> Result<Vec<VoiceMuteInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/moderation/voice-mutes"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct TalkPowerInfo {
    pub channel_id: String,
    pub min_talk_power: i64,
}

#[tauri::command]
pub(crate) async fn get_talk_power(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<TalkPowerInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/channels/{channel_id}/talk-power"))
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
pub(crate) async fn set_talk_power_cmd(
    channel_id: String,
    min_talk_power: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/channels/{channel_id}/talk-power"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "min_talk_power": min_talk_power }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Bans + invites
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct BanInfo {
    pub target_public_key: String,
    pub banned_by: String,
    pub reason: Option<String>,
    pub created_at: i64,
}

#[tauri::command]
pub(crate) async fn list_bans(state: State<'_, AppState>) -> Result<Vec<BanInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/moderation/bans"))
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
pub(crate) async fn unban_user(
    target_public_key: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/moderation/bans/{target_public_key}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct InviteInfo {
    pub code: String,
    pub created_by: String,
    pub max_uses: Option<i64>,
    pub uses: i64,
    pub expires_at: Option<i64>,
    pub created_at: i64,
}

#[tauri::command]
pub(crate) async fn list_invites(state: State<'_, AppState>) -> Result<Vec<InviteInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/invites"))
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
pub(crate) async fn create_invite(
    max_uses: Option<i64>,
    expires_in_seconds: Option<i64>,
    state: State<'_, AppState>,
) -> Result<InviteInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/invites"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "max_uses": max_uses,
            "expires_in_seconds": expires_in_seconds,
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
pub(crate) async fn revoke_invite(code: String, state: State<'_, AppState>) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/invites/{code}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// User profile card (hub_url parameterized)
// ---------------------------------------------------------------------------

#[tauri::command]
pub(crate) async fn get_user_profile(
    hub_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let url = format!(
        "{}/members/{}/profile",
        hub_url.trim_end_matches('/'),
        pubkey
    );
    let res = state
        .http_client
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    res.json().await.map_err(|e| e.to_string())
}
