// Passkey and trusted-device management — calls the hub REST API on behalf
// of the currently connected session. Registration happens in the browser (web
// client); the desktop only manages existing credentials and devices.

use crate::state::AppState;
use tauri::State;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct CredentialInfo {
    pub id: String,
    pub friendly_name: Option<String>,
    pub aaguid: Option<String>,
    pub created_at: i64,
    pub last_used_at: Option<i64>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DeviceInfo {
    pub id: String,
    pub device_name: Option<String>,
    pub created_at: i64,
    pub expires_at: i64,
    pub last_used_at: Option<i64>,
}

fn hub_session(hub_id: &str, state: &AppState) -> Result<(String, String), String> {
    let hubs = state.hubs.lock().unwrap();
    let s = hubs.get(hub_id).ok_or("Hub not connected")?;
    Ok((s.hub_url.clone(), s.token.clone()))
}

// --- Passkeys ---

#[tauri::command]
pub async fn passkey_list(
    hub_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<CredentialInfo>, String> {
    let (hub_url, token) = hub_session(&hub_id, &state)?;
    let resp = state
        .http_client
        .get(format!("{hub_url}/me/credentials"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.json().await.map_err(|e| format!("Parse error: {e}"))
}

#[tauri::command]
pub async fn passkey_delete(
    hub_id: String,
    credential_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = hub_session(&hub_id, &state)?;
    let resp = state
        .http_client
        .delete(format!("{hub_url}/me/credentials/{credential_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    let status = resp.status();
    if !status.is_success() && status.as_u16() != 404 {
        return Err(format!("HTTP {status}"));
    }
    Ok(())
}

#[tauri::command]
pub async fn passkey_rename(
    hub_id: String,
    credential_id: String,
    friendly_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = hub_session(&hub_id, &state)?;
    let resp = state
        .http_client
        .patch(format!("{hub_url}/me/credentials/{credential_id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "friendly_name": friendly_name }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    Ok(())
}

// --- Trusted devices ---

#[tauri::command]
pub async fn trusted_device_list(
    hub_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<DeviceInfo>, String> {
    let (hub_url, token) = hub_session(&hub_id, &state)?;
    let resp = state
        .http_client
        .get(format!("{hub_url}/me/devices"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.json().await.map_err(|e| format!("Parse error: {e}"))
}

#[tauri::command]
pub async fn trusted_device_revoke(
    hub_id: String,
    device_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = hub_session(&hub_id, &state)?;
    let resp = state
        .http_client
        .delete(format!("{hub_url}/me/devices/{device_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    let status = resp.status();
    if !status.is_success() && status.as_u16() != 404 {
        return Err(format!("HTTP {status}"));
    }
    Ok(())
}
