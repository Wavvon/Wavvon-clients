use crate::state::{AppState, WsCommand};
use tauri::State;

/// GET /bots -- the member-facing bot directory (bots.md §2). The hub has no
/// bot-creation route at all: a bot is an external Ed25519 identity an admin
/// invites by pubkey, so listing is the only member-level bot call there is.
#[tauri::command]
pub(crate) async fn list_bots(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Vec<BotProfileResult>, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/bots"))
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

/// The hub exposes no single-bot route -- `/bots/{pubkey}` is DELETE only --
/// so the profile card is filtered out of the directory list, as the web
/// client does.
#[tauri::command]
pub(crate) async fn get_bot_profile(
    hub_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<BotProfileResult, String> {
    list_bots(hub_url, state)
        .await?
        .into_iter()
        .find(|b| b.pubkey == pubkey)
        .ok_or_else(|| "Bot not found".to_string())
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
        .post(format!("{base}/bots"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "pubkey": pubkey, "note": local_note }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    #[derive(serde::Deserialize)]
    struct InviteBotResponse {
        invite_token: String,
    }
    let body: InviteBotResponse = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))?;
    Ok(ExternalBotInviteResult {
        bot_invite_token: body.invite_token,
        pubkey,
    })
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
        .delete(format!("{base}/bots/{pubkey}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct BotChannelScopeResult {
    pub channel_ids: Vec<String>,
}

#[tauri::command]
pub(crate) async fn admin_get_bot_channel_scope(
    hub_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/admin/bots/{pubkey}/channels"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    let parsed: BotChannelScopeResult = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))?;
    Ok(parsed.channel_ids)
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

/// GET /admin/bots/:pubkey/capabilities — the requested, granted and effective
/// sets for one bot (bot-capability-layer.md §1).
#[tauri::command]
pub(crate) async fn admin_get_bot_capabilities(
    hub_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/admin/bots/{pubkey}/capabilities"))
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

/// PUT /admin/bots/:pubkey/capabilities — replaces the granted set atomically.
#[tauri::command]
pub(crate) async fn admin_set_bot_capabilities(
    hub_url: String,
    pubkey: String,
    capabilities: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .put(format!("{base}/admin/bots/{pubkey}/capabilities"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "capabilities": capabilities }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}
