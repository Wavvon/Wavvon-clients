#![allow(dead_code)]
use crate::state::AppState;
use tauri::State;

// =============================================================================
// Farm management structs
// =============================================================================

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct FarmPublicInfo {
    pub kind: Option<String>,
    pub name: String,
    pub description: String,
    pub creation_policy: String,
    pub hub_count: u32,
    pub max_hubs_total: u32,
    pub allow_discovery_listing: bool,
    pub country: String,
    pub region: String,
    pub languages: Vec<String>,
    pub tags: Vec<String>,
    pub icon: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct FarmHubQuota {
    pub hubs_owned_by_user: u32,
    pub max_hubs_per_user: u32,
    pub total_hubs: u32,
    pub max_hubs_total: u32,
    pub can_create: bool,
    pub reason: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct FarmSettings {
    pub name: String,
    pub description: String,
    pub creation_policy: String,
    pub max_hubs_per_user: u32,
    pub max_hubs_total: u32,
    pub allow_discovery_listing: bool,
    pub directory_public: bool,
    pub languages: Vec<String>,
    pub tags: Vec<String>,
    pub country: String,
    pub region: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct CreatedFarmHub {
    pub id: String,
    pub url: String,
    pub hub_pubkey: String,
    pub name: String,
    pub visibility: String,
    pub created_at: i64,
}

// =============================================================================
// Farm commands
// =============================================================================

/// `GET {hub_url}/info` — no auth.
#[tauri::command]
pub(crate) async fn get_hub_info(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/info"))
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

/// `GET {farm_url}/farm/info` — no auth.
#[tauri::command]
pub(crate) async fn get_farm_info(
    farm_url: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/farm/info"))
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

/// `GET {farm_url}/farm/public-info` — no auth.
#[tauri::command]
pub(crate) async fn probe_farm(
    farm_url: String,
    state: State<'_, AppState>,
) -> Result<FarmPublicInfo, String> {
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/farm/public-info"))
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

/// `GET {farm_url}/farm/me/hub-quota` — requires farm session token.
#[tauri::command]
pub(crate) async fn get_farm_hub_quota(
    farm_url: String,
    state: State<'_, AppState>,
) -> Result<FarmHubQuota, String> {
    let token = crate::state::session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/farm/me/hub-quota"))
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

/// `GET {farm_url}/farm/settings` — requires farm session token.
#[tauri::command]
pub(crate) async fn get_farm_settings(
    farm_url: String,
    state: State<'_, AppState>,
) -> Result<FarmSettings, String> {
    let token = crate::state::session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/farm/settings"))
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

/// `PATCH {farm_url}/farm/settings` — requires farm session token.
#[tauri::command]
pub(crate) async fn patch_farm_settings(
    farm_url: String,
    settings: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<FarmSettings, String> {
    let token = crate::state::session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .patch(format!("{base}/farm/settings"))
        .bearer_auth(&token)
        .json(&settings)
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

/// `GET {farm_url}/farm/hubs` — requires farm session token.
#[tauri::command]
pub(crate) async fn get_farm_hubs_admin(
    farm_url: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/farm/hubs"))
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

/// Suspend or unsuspend a farm hub.
#[tauri::command]
pub(crate) async fn suspend_farm_hub(
    farm_url: String,
    hub_id: String,
    suspended: bool,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = if suspended {
        state
            .http_client
            .patch(format!("{base}/farm/hubs/{hub_id}/suspend"))
            .bearer_auth(&token)
            .json(&serde_json::json!({ "reason": reason }))
            .send()
            .await
            .map_err(|e| format!("Request failed: {e}"))?
    } else {
        state
            .http_client
            .patch(format!("{base}/farm/hubs/{hub_id}/unsuspend"))
            .bearer_auth(&token)
            .json(&serde_json::json!({}))
            .send()
            .await
            .map_err(|e| format!("Request failed: {e}"))?
    };
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

/// `DELETE {farm_url}/farm/hubs/{hub_id}`.
#[tauri::command]
pub(crate) async fn delete_farm_hub(
    farm_url: String,
    hub_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .delete(format!("{base}/farm/hubs/{hub_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

/// `GET {farm_url}/farm/users?limit={limit}&page={page}`.
#[tauri::command]
pub(crate) async fn get_farm_users(
    farm_url: String,
    page: Option<u32>,
    limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let mut req = state
        .http_client
        .get(format!("{base}/farm/users"))
        .bearer_auth(&token);
    if let Some(p) = page {
        req = req.query(&[("page", p.to_string())]);
    }
    if let Some(l) = limit {
        req = req.query(&[("limit", l.to_string())]);
    }
    let resp = req
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

/// `POST {farm_url}/farm/users/{pubkey}/revoke-sessions`.
#[tauri::command]
pub(crate) async fn revoke_farm_user_sessions(
    farm_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/farm/users/{pubkey}/revoke-sessions"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

/// `POST {farm_url}/farm/hubs`.
#[tauri::command]
pub(crate) async fn create_hub_on_farm(
    farm_url: String,
    name: String,
    description: Option<String>,
    visibility: String,
    state: State<'_, AppState>,
) -> Result<CreatedFarmHub, String> {
    let token = crate::state::session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/farm/hubs"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "name": name,
            "description": description,
            "visibility": visibility,
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

/// GET /farm/admin/servers
#[tauri::command]
pub(crate) async fn get_farm_servers(
    farm_url: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/farm/admin/servers"))
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

/// POST /farm/admin/server-token
#[tauri::command]
pub(crate) async fn generate_farm_server_token(
    farm_url: String,
    name: String,
    region: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/farm/admin/server-token"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "name": name, "region": region }))
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

/// POST /farm/admin/totp/setup
#[tauri::command]
pub(crate) async fn farm_totp_setup(
    farm_url: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/farm/admin/totp/setup"))
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

/// POST /farm/admin/totp/confirm
#[tauri::command]
pub(crate) async fn farm_totp_confirm(
    farm_url: String,
    secret: String,
    code: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/farm/admin/totp/confirm"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "secret": secret, "code": code }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

/// POST /farm/admin/totp/disable
#[tauri::command]
pub(crate) async fn farm_totp_disable(
    farm_url: String,
    code: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/farm/admin/totp/disable"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "code": code }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

// =============================================================================
// Recovery contacts + key rotation
// =============================================================================

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct RecoveryContactEntry {
    pub pubkey: String,
    pub added_at: i64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct RecoveryContactsResponse {
    pub owner_pubkey: String,
    pub contacts: Vec<RecoveryContactEntry>,
    pub threshold: u32,
}

/// Mirrors the hub's `RotationRequestBundle` (GET
/// /recovery/rotation-request/:id) — the shape both the requester (status
/// polling) and a reviewing contact (bundle to sign) need.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct RotationRequestBundle {
    pub id: String,
    pub hub_pubkey: String,
    pub old_pubkey: String,
    pub new_pubkey: String,
    pub nonce: String,
    pub status: String,
    pub attestation_count: i64,
    pub threshold: i64,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct SetContactsPayload {
    contacts: Vec<String>,
    threshold: u32,
}

/// `GET /recovery/contacts` — the full owner designation (threshold +
/// contact list) in one shot, matching the shared `RecoveryContactsSection`
/// UI's bulk-textarea-and-threshold editing model.
#[tauri::command]
pub(crate) async fn get_recovery_contacts(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<RecoveryContactsResponse, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/recovery/contacts"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

/// `PUT /recovery/contacts` — replaces the whole contact list + threshold.
#[tauri::command]
pub(crate) async fn set_recovery_contacts(
    hub_url: String,
    threshold: u32,
    contacts: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .put(format!("{base}/recovery/contacts"))
        .bearer_auth(&token)
        .json(&SetContactsPayload {
            contacts,
            threshold,
        })
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn remove_recovery_contact(
    hub_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .delete(format!("{base}/recovery/contacts/{pubkey}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

/// `GET {base}/info`, no auth — used to bind the recovery signing bundle to
/// this hub (recovery-attestation.md: `hub_pubkey` blocks cross-hub replay).
async fn get_hub_pubkey(state: &AppState, base: &str) -> Result<String, String> {
    let resp = state
        .http_client
        .get(format!("{base}/info"))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    let info: serde_json::Value = resp.json().await.map_err(|e| format!("Invalid: {e}"))?;
    info["public_key"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Hub /info response missing public_key".to_string())
}

async fn fetch_rotation_bundle(
    state: &AppState,
    base: &str,
    id: &str,
) -> Result<RotationRequestBundle, String> {
    let resp = state
        .http_client
        .get(format!("{base}/recovery/rotation-request/{id}"))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

// The hub knows a user (and records their designated recovery contacts) by
// the pubkey they authenticate with — the identity key, NOT the derived
// multi-device master. Signing recovery envelopes with the master produced
// pubkeys the hub had never seen (attester rejected, wrong "new key"), so
// recovery operations use the active identity itself.
fn active_recovery_identity() -> Result<crate::identity::Identity, String> {
    let path =
        crate::identity::Identity::default_path().map_err(|e| format!("Identity path: {e}"))?;
    crate::identity::Identity::load(&path).map_err(|e| format!("Load identity: {e}"))
}

/// `POST /recovery/rotate-key` — this device's active identity is always the
/// **new** key (identity-recovery.md: "O-new opens a rotation request").
/// `old_pubkey` is the lost identity the caller remembers/enters; unlike the
/// old inline-attestations shape, the hub now requires a `new_key_signature`
/// proof and rejects a non-empty `attestations` field outright.
#[tauri::command]
pub(crate) async fn submit_rotation_request(
    hub_url: String,
    old_pubkey: String,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<RotationRequestBundle, String> {
    let identity = active_recovery_identity()?;
    let new_pubkey = identity.public_key_hex();

    let base = hub_url.trim_end_matches('/').to_string();
    let hub_pubkey = get_hub_pubkey(&state, &base).await?;

    let proof_bytes =
        crate::identity::recovery_request_signing_bytes(&hub_pubkey, &old_pubkey, &new_pubkey);
    let new_key_signature = hex::encode(identity.sign(&proof_bytes).to_bytes());

    let resp = state
        .http_client
        .post(format!("{base}/recovery/rotate-key"))
        .json(&serde_json::json!({
            "old_pubkey": old_pubkey,
            "new_pubkey": new_pubkey,
            "reason": reason,
            "new_key_signature": new_key_signature,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    let created: serde_json::Value = resp.json().await.map_err(|e| format!("Invalid: {e}"))?;
    let id = created["id"].as_str().unwrap_or("").to_string();
    fetch_rotation_bundle(&state, &base, &id).await
}

/// `GET /recovery/rotation-request/:id` — no auth. Used both by the
/// requester (status polling) and by a contact reviewing a pasted-in id.
#[tauri::command]
pub(crate) async fn get_rotation_request_bundle(
    hub_url: String,
    id: String,
    state: State<'_, AppState>,
) -> Result<RotationRequestBundle, String> {
    let base = hub_url.trim_end_matches('/');
    fetch_rotation_bundle(&state, base, &id).await
}

/// `POST /recovery/rotation-request/:id/attest` — this device's active
/// identity signs the bundle as the attesting contact. Crypto stays in Rust
/// (the master seed never enters the renderer).
#[tauri::command]
pub(crate) async fn attest_rotation_request(
    hub_url: String,
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let base = hub_url.trim_end_matches('/');
    let bundle = fetch_rotation_bundle(&state, base, &id).await?;

    let identity = active_recovery_identity()?;
    let attester = identity.public_key_hex();
    let bytes = crate::identity::recovery_attestation_signing_bytes(
        &bundle.hub_pubkey,
        &bundle.old_pubkey,
        &bundle.new_pubkey,
        &bundle.nonce,
    );
    let signature = hex::encode(identity.sign(&bytes).to_bytes());

    let resp = state
        .http_client
        .post(format!("{base}/recovery/rotation-request/{id}/attest"))
        .json(&serde_json::json!({ "attester": attester, "signature": signature }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}
