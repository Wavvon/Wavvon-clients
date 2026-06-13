use crate::state::{active_session, AppState};
use serde::{Deserialize, Serialize};
use tauri::State;

// --- DTOs ---

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct RoleInfo {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) permissions: Vec<String>,
    pub(crate) priority: i64,
    #[serde(default)]
    pub(crate) display_separately: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct MeInfo {
    pub(crate) public_key: String,
    pub(crate) display_name: Option<String>,
    #[serde(default)]
    pub(crate) avatar: Option<String>,
    /// Either "approved" or "pending". The hub server defaults missing
    /// rows to "approved", so for unmoderated hubs this is just always
    /// "approved".
    #[serde(default = "default_approval_status")]
    pub(crate) approval_status: String,
    pub(crate) roles: Vec<RoleInfo>,
}

pub(crate) fn default_approval_status() -> String {
    "approved".to_string()
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct HubBranding {
    pub(crate) name: String,
    pub(crate) description: Option<String>,
    pub(crate) icon: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct HubSettings {
    pub(crate) require_approval: bool,
    pub(crate) invite_only: bool,
    pub(crate) min_security_level: u32,
    pub(crate) max_channel_depth: u32,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct PendingUser {
    pub(crate) public_key: String,
    pub(crate) display_name: Option<String>,
    pub(crate) first_seen_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct UserInfo {
    pub(crate) public_key: String,
    pub(crate) display_name: Option<String>,
    #[serde(default)]
    pub(crate) avatar: Option<String>,
    pub(crate) online: bool,
    #[serde(default)]
    pub(crate) group_role: Option<String>,
    #[serde(default)]
    pub(crate) is_bot: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BotInfo {
    pub public_key: String,
    pub display_name: String,
    pub created_by: String,
    pub created_at: i64,
    pub token: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct HubIcon {
    pub id: String,
    pub name: String,
    pub svg_content: String,
    pub uploaded_by: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct BanInfo {
    pub(crate) target_public_key: String,
    pub(crate) banned_by: String,
    pub(crate) reason: Option<String>,
    pub(crate) created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct MemberAdminInfo {
    pub(crate) public_key: String,
    pub(crate) display_name: Option<String>,
    pub(crate) online: bool,
    pub(crate) first_seen_at: i64,
    pub(crate) last_seen_at: i64,
    pub(crate) roles: Vec<RoleInfo>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ChannelBanInfo {
    pub(crate) channel_id: String,
    pub(crate) target_public_key: String,
    pub(crate) banned_by: String,
    pub(crate) reason: Option<String>,
    pub(crate) created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct VoiceMuteInfo {
    pub(crate) target_public_key: String,
    pub(crate) muted_by: String,
    pub(crate) reason: Option<String>,
    pub(crate) created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct TalkPowerInfo {
    pub(crate) channel_id: String,
    pub(crate) min_talk_power: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct InviteInfo {
    pub(crate) code: String,
    pub(crate) created_by: String,
    pub(crate) max_uses: Option<i64>,
    pub(crate) uses: i64,
    pub(crate) expires_at: Option<i64>,
    pub(crate) created_at: i64,
}

// --- Helpers ---

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

// --- Tauri commands: user management ---

#[tauri::command]
pub(crate) async fn list_users(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<UserInfo>, String> {
    use tauri::Emitter;
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/users"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;

    // On 401 the session token is stale (hub restarted, kicked, etc). Try to
    // re-authenticate transparently. Only if re-auth itself fails do we treat
    // this as a terminal session loss and notify the UI.
    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        let active_id = state.active_hub.lock().unwrap().clone();
        if let Some(hub_id) = active_id {
            match crate::hubs::reauth_session(&state, &app, &hub_id).await {
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
                    // Auth refused — likely banned, or the hub identity changed.
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
    // Empty string clears the avatar on this hub.
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

// --- Hub settings & branding ---

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
pub(crate) async fn get_hub_branding(state: State<'_, AppState>) -> Result<HubBranding, String> {
    let (hub_url, _) = active_session(&state)?;
    let client = state.http_client.clone();
    let info: crate::state::InfoResponse = client
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

    // Update the in-memory branding in the active session so list_hubs reflects it.
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

// --- Hub icons ---

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

// --- Member management ---

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

// --- Moderation ---

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

// --- Roles ---

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

// --- Bans ---

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

// --- Invites ---

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

// --- Public profile ---

/// Input type for one hub entry when publishing a public hub profile.
#[derive(Serialize, Deserialize)]
pub(crate) struct PublicHubEntryInput {
    pub(crate) hub_url: String,
    pub(crate) hub_name: String,
    pub(crate) joined_at: u64,
}

/// Publish or update the signed public hub profile for the current identity.
/// Signs with the local identity key and PUTs to the active hub.
#[tauri::command]
pub(crate) async fn save_public_profile(
    entries: Vec<PublicHubEntryInput>,
    display_name: String,
    avatar: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    use crate::identity::{PublicHubEntry, PublicHubProfile};

    let identity_path =
        crate::identity::Identity::default_path().map_err(|e| format!("Identity path: {e}"))?;
    let identity = crate::identity::Identity::load(&identity_path)
        .map_err(|e| format!("Load identity: {e}"))?;
    let pubkey = identity.public_key_hex();

    let issued_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let public_hubs: Vec<PublicHubEntry> = entries
        .into_iter()
        .map(|e| PublicHubEntry {
            hub_url: e.hub_url,
            hub_name: e.hub_name,
            joined_at: e.joined_at,
        })
        .collect();

    let signing_bytes = PublicHubProfile::signing_bytes(&pubkey, &public_hubs, issued_at);
    let signature = hex::encode(identity.sign(&signing_bytes).to_bytes());

    let profile = PublicHubProfile {
        pubkey: pubkey.clone(),
        display_name,
        avatar,
        public_hubs,
        issued_at,
        signature,
    };

    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .put(format!("{hub_url}/profile/{pubkey}"))
        .bearer_auth(&token)
        .json(&profile)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Hub rejected profile update: {}",
            resp.text().await.unwrap_or_default()
        ));
    }

    Ok(())
}

/// Fetch the public hub profile for any user from any hub.
/// Returns None if the profile is not found (404), or Err on other failures.
#[tauri::command]
pub(crate) async fn fetch_public_profile(
    hub_url: String,
    pubkey: String,
) -> Result<Option<serde_json::Value>, String> {
    let client = reqwest::Client::new();
    let hub_url = hub_url.trim_end_matches('/');
    let resp = client
        .get(format!("{hub_url}/profile/{pubkey}"))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    if !resp.status().is_success() {
        return Err(format!(
            "Hub returned error: {}",
            resp.text().await.unwrap_or_default()
        ));
    }

    let v: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse response: {e}"))?;
    Ok(Some(v))
}

/// Sign a directory listing with the hub's private key and submit it to the
/// Voxply discovery directory. The hub must be the active session.
#[tauri::command]
pub(crate) async fn submit_to_directory(
    directory_url: String,
    tags: Vec<String>,
    language: String,
    bio: String,
    invite_code: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();

    // Step 1: ask the hub to sign the canonical payload
    let sign_resp = client
        .post(format!("{hub_url}/admin/directory-sign"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "hub_url": hub_url,
            "tags": tags,
            "language": language,
            "bio": bio,
            "invite_code": invite_code,
        }))
        .send()
        .await
        .map_err(|e| format!("Sign request failed: {e}"))?;

    if !sign_resp.status().is_success() {
        return Err(format!(
            "Hub refused to sign: {}",
            sign_resp.text().await.unwrap_or_default()
        ));
    }

    let signed: serde_json::Value = sign_resp
        .json()
        .await
        .map_err(|e| format!("Sign response decode: {e}"))?;

    // Step 2: submit the signed payload to the directory
    let dir_base = directory_url.trim_end_matches('/');
    let submit_resp = client
        .post(format!("{dir_base}/api/hubs"))
        .json(&serde_json::json!({
            "hub_url": hub_url,
            "tags": tags,
            "language": language,
            "bio": bio,
            "invite_code": invite_code,
            "canonical_payload": signed["canonical_payload"],
            "hub_pubkey": signed["hub_pubkey"],
            "signature": signed["signature"],
        }))
        .send()
        .await
        .map_err(|e| format!("Directory submit failed: {e}"))?;

    if !submit_resp.status().is_success() {
        return Err(format!(
            "Directory rejected submission: {}",
            submit_resp.text().await.unwrap_or_default()
        ));
    }

    Ok(())
}
