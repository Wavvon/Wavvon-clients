use crate::state::{session_for_url, AppState};
use serde::{Deserialize, Serialize};
use tauri::State;

// --- DTOs ---

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct RecoveryContactEntry {
    pub(crate) pubkey: String,
    pub(crate) added_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct RecoveryContactsResponse {
    pub(crate) owner_pubkey: String,
    pub(crate) contacts: Vec<RecoveryContactEntry>,
    pub(crate) threshold: u32,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SetContactsPayload {
    pub(crate) contacts: Vec<String>,
    pub(crate) threshold: u32,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct RecoveryContactOut {
    pub(crate) pubkey: String,
    pub(crate) added_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct AdminRotationRequest {
    pub(crate) id: String,
    pub(crate) old_pubkey: String,
    pub(crate) new_pubkey: String,
    pub(crate) reason: Option<String>,
    pub(crate) status: String,
    pub(crate) created_at: i64,
    pub(crate) attestation_count: i64,
}

// --- Tauri commands ---

#[tauri::command]
pub(crate) async fn list_recovery_contacts(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<RecoveryContactsResponse, String> {
    let token = session_for_url(&state, &hub_url)?;
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

#[tauri::command]
pub(crate) async fn set_recovery_contacts(
    hub_url: String,
    threshold: u32,
    contacts: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = session_for_url(&state, &hub_url)?;
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
    let token = session_for_url(&state, &hub_url)?;
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

#[tauri::command]
pub(crate) async fn list_admin_recovery_requests(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Vec<AdminRotationRequest>, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/admin/recovery/pending"))
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
pub(crate) async fn approve_recovery_request(
    hub_url: String,
    request_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/admin/recovery/{request_id}/approve"))
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
pub(crate) async fn deny_recovery_request(
    hub_url: String,
    request_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/admin/recovery/{request_id}/deny"))
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
pub(crate) async fn update_dm_blocks(
    hub_url: String,
    blocked: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    #[derive(serde::Serialize)]
    struct Payload {
        blocked_pubkeys: Vec<String>,
    }
    let resp = state
        .http_client
        .put(format!("{base}/identity/dm-blocks"))
        .bearer_auth(&token)
        .json(&Payload {
            blocked_pubkeys: blocked,
        })
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}
