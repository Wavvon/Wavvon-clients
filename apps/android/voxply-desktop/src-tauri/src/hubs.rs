use crate::prefs::load_profile;
use crate::state::{active_session, AppState, InfoResponse};
use crate::ws::spawn_ws_task;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

// --- DTOs ---

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct HubInfo {
    pub(crate) hub_id: String,
    pub(crate) hub_name: String,
    pub(crate) hub_url: String,
    pub(crate) hub_icon: Option<String>,
    pub(crate) is_active: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SavedHub {
    pub(crate) hub_id: String,
    pub(crate) hub_name: String,
    pub(crate) hub_url: String,
}

// --- Persistence: saved hubs file ---

pub(crate) fn saved_hubs_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("hubs.json"))
}

pub(crate) fn active_hub_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("active_hub"))
}

pub(crate) fn load_saved_hubs() -> Vec<SavedHub> {
    if let Ok(path) = saved_hubs_path() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(hubs) = serde_json::from_str(&data) {
                return hubs;
            }
        }
    }
    Vec::new()
}

pub(crate) fn save_hubs_list(hubs: &[SavedHub]) -> Result<(), String> {
    let path = saved_hubs_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Mkdir failed: {e}"))?;
    }
    let json = serde_json::to_string_pretty(hubs).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Write failed: {e}"))?;
    Ok(())
}

pub(crate) fn load_active_hub_id() -> Option<String> {
    let path = active_hub_path().ok()?;
    let data = std::fs::read_to_string(&path).ok()?;
    let trimmed = data.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(crate) fn save_active_hub_id(hub_id: Option<&str>) {
    let Ok(path) = active_hub_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, hub_id.unwrap_or(""));
}

// --- Re-authentication ---

/// Re-authenticate the identity against the hub_id's url and, on success,
/// swap in the fresh session token + restart the WS subscription so real-time
/// events keep flowing. Returns the new token.
pub(crate) async fn reauth_session(
    state: &State<'_, AppState>,
    app: &AppHandle,
    hub_id: &str,
) -> Result<String, String> {
    let hub_url = {
        let hubs = state.hubs.lock().unwrap();
        let s = hubs.get(hub_id).ok_or("Hub not connected")?;
        s.hub_url.clone()
    };

    let creds = crate::auth_creds::load_active_credentials()?;
    let client = state.http_client.clone();
    let info: InfoResponse = client
        .get(format!("{hub_url}/info"))
        .send()
        .await
        .map_err(|e| format!("reauth info fetch: {e}"))?
        .json()
        .await
        .map_err(|e| format!("reauth info decode: {e}"))?;
    let auth_url = info.farm_url.as_deref().unwrap_or(&hub_url).to_string();
    let new_token = creds.authenticate(&auth_url, &client, None).await?;

    // Restart the WS task with the new token. Abort the stale one first.
    let (old_task, hub_id_clone) = {
        let mut hubs = state.hubs.lock().unwrap();
        let session = hubs.get_mut(hub_id).ok_or("Hub vanished mid-reauth")?;
        session.token = new_token.clone();
        let old_task = std::mem::replace(&mut session.ws_task, tokio::spawn(async {}));
        (old_task, session.hub_id.clone())
    };
    old_task.abort();

    let (new_cmd_tx, new_task) = spawn_ws_task(
        hub_id_clone.clone(),
        hub_url,
        new_token.clone(),
        app.clone(),
    )
    .await
    .map_err(|e| format!("ws reconnect: {e}"))?;

    {
        let mut hubs = state.hubs.lock().unwrap();
        if let Some(session) = hubs.get_mut(hub_id) {
            session.ws_tx = new_cmd_tx;
            session.ws_task = new_task;
        }
    }

    println!("Re-authenticated with hub {}", &hub_id_clone[..16]);
    Ok(new_token)
}

// --- Tauri commands ---

/// Connect to a hub by URL. Adds it to the saved list.
#[tauri::command]
pub(crate) async fn add_hub(
    hub_url: String,
    invite_code: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<HubInfo, String> {
    let creds = crate::auth_creds::load_active_credentials()?;

    let client = state.http_client.clone();

    // Get hub info first (gives us hub_id and name)
    let info: InfoResponse = client
        .get(format!("{hub_url}/info"))
        .send()
        .await
        .map_err(|e| format!("Failed to reach hub: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid info response: {e}"))?;

    let hub_id = info.public_key.clone();
    let hub_name = info.name.clone();
    let hub_icon = info.icon.clone();
    let auth_url = info.farm_url.as_deref().unwrap_or(&hub_url).to_string();

    // Authenticate — paired-device clients include the master cert,
    // legacy clients use the single-key flow unchanged.
    let token = creds
        .authenticate(&auth_url, &client, invite_code.as_deref())
        .await?;

    // Auto-apply the user's default profile to this hub whenever the hub
    // doesn't already have a value for the field. Lets a new hub inherit
    // your identity instead of showing your pubkey.
    let profile = load_profile();
    if let Some(default_profile) = profile.default_profile().cloned() {
        if let Ok(me_resp) = client
            .get(format!("{hub_url}/me"))
            .bearer_auth(&token)
            .send()
            .await
        {
            if let Ok(me) = me_resp.json::<serde_json::Value>().await {
                let mut patch = serde_json::Map::new();
                let has_name = me
                    .get("display_name")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false);
                if !has_name && !default_profile.display_name.trim().is_empty() {
                    patch.insert(
                        "display_name".to_string(),
                        serde_json::Value::String(default_profile.display_name.clone()),
                    );
                }
                let has_avatar = me
                    .get("avatar")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false);
                if !has_avatar {
                    if let Some(a) = default_profile.avatar.as_deref() {
                        if !a.is_empty() {
                            patch.insert(
                                "avatar".to_string(),
                                serde_json::Value::String(a.to_string()),
                            );
                        }
                    }
                }
                if !patch.is_empty() {
                    let _ = client
                        .patch(format!("{hub_url}/me"))
                        .bearer_auth(&token)
                        .json(&serde_json::Value::Object(patch))
                        .send()
                        .await;
                }
            }
        }
    }

    // Spawn WS task with hub_id tagging
    let (cmd_tx, ws_task) =
        spawn_ws_task(hub_id.clone(), hub_url.clone(), token.clone(), app.clone()).await?;

    let session = crate::ws::make_hub_session(
        hub_id.clone(),
        hub_name.clone(),
        hub_url.clone(),
        hub_icon.clone(),
        token,
        cmd_tx,
        ws_task,
    );

    {
        let mut hubs = state.hubs.lock().unwrap();
        hubs.insert(hub_id.clone(), session);
    }

    // Auto-set as active if no active hub yet
    {
        let mut active = state.active_hub.lock().unwrap();
        if active.is_none() {
            *active = Some(hub_id.clone());
        }
    }

    // Persist to disk
    let mut saved = load_saved_hubs();
    if !saved.iter().any(|h| h.hub_id == hub_id) {
        saved.push(SavedHub {
            hub_id: hub_id.clone(),
            hub_name: hub_name.clone(),
            hub_url: hub_url.clone(),
        });
        let _ = save_hubs_list(&saved);
    }

    let active = state.active_hub.lock().unwrap().clone();
    Ok(HubInfo {
        hub_id: hub_id.clone(),
        hub_name,
        hub_url,
        hub_icon,
        is_active: active.as_deref() == Some(hub_id.as_str()),
    })
}

#[tauri::command]
pub(crate) async fn ping_hub(hub_id: String, state: State<'_, AppState>) -> Result<u64, String> {
    let hub_url = {
        let hubs = state.hubs.lock().unwrap();
        hubs.get(&hub_id).map(|s| s.hub_url.clone())
    }
    .ok_or("Hub not connected")?;

    let client = state.http_client.clone();
    let start = std::time::Instant::now();
    let resp = client
        .get(format!("{hub_url}/health"))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    Ok(start.elapsed().as_millis() as u64)
}

#[tauri::command]
pub(crate) fn list_hubs(state: State<'_, AppState>) -> Vec<HubInfo> {
    let hubs = state.hubs.lock().unwrap();
    let active = state.active_hub.lock().unwrap().clone();
    hubs.values()
        .map(|s| HubInfo {
            hub_id: s.hub_id.clone(),
            hub_name: s.hub_name.clone(),
            hub_url: s.hub_url.clone(),
            hub_icon: s.hub_icon.clone(),
            is_active: active.as_deref() == Some(s.hub_id.as_str()),
        })
        .collect()
}

#[tauri::command]
pub(crate) fn set_active_hub(hub_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let hubs = state.hubs.lock().unwrap();
    if !hubs.contains_key(&hub_id) {
        return Err("Hub not connected".to_string());
    }
    *state.active_hub.lock().unwrap() = Some(hub_id.clone());
    save_active_hub_id(Some(&hub_id));
    Ok(())
}

#[tauri::command]
pub(crate) fn remove_hub(hub_id: String, state: State<'_, AppState>) -> Result<(), String> {
    if let Some(session) = state.hubs.lock().unwrap().remove(&hub_id) {
        session.ws_task.abort();
    }
    {
        let mut active = state.active_hub.lock().unwrap();
        if active.as_deref() == Some(hub_id.as_str()) {
            *active = None;
            save_active_hub_id(None);
        }
    }
    let mut saved = load_saved_hubs();
    saved.retain(|h| h.hub_id != hub_id);
    let _ = save_hubs_list(&saved);
    Ok(())
}

#[tauri::command]
pub(crate) async fn auto_connect_saved(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<HubInfo>, String> {
    let saved = load_saved_hubs();
    for hub in &saved {
        let _ = add_hub(hub.hub_url.clone(), None, state.clone(), app.clone()).await;
    }

    // Restore the previously-active hub if it successfully reconnected.
    if let Some(persisted) = load_active_hub_id() {
        let hubs = state.hubs.lock().unwrap();
        if hubs.contains_key(&persisted) {
            drop(hubs);
            *state.active_hub.lock().unwrap() = Some(persisted);
        }
    }

    Ok(list_hubs(state))
}

/// User-triggered re-auth + WS restart for a specific hub. Useful when the
/// connection silently dropped and the "Reconnecting…" banner is showing.
#[tauri::command]
pub(crate) async fn reconnect_hub(
    hub_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    reauth_session(&state, &app, &hub_id).await?;
    Ok(())
}

/// Fetch /info from any hub URL without an active session. Used by the
/// add-hub dialog to preview a hub's name + icon + description before
/// committing. Trims trailing slash so users can paste either form.
#[tauri::command]
pub(crate) async fn preview_hub_info(url: String) -> Result<InfoResponse, String> {
    let base = url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Empty URL".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| format!("client: {e}"))?;
    let resp = client
        .get(format!("{base}/info"))
        .send()
        .await
        .map_err(|e| format!("Cannot reach hub: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Hub returned {}", resp.status()));
    }
    resp.json().await.map_err(|e| format!("Invalid /info: {e}"))
}

/// Persist a new hub ordering. The provided list should be the desired
/// order of hub_ids; any saved hub not in the list keeps its relative
/// position at the end (defensive against partial drags).
#[tauri::command]
pub(crate) fn reorder_hubs(hub_ids: Vec<String>) -> Result<(), String> {
    let saved = load_saved_hubs();
    let by_id: std::collections::HashMap<String, SavedHub> = saved
        .iter()
        .map(|h| (h.hub_id.clone(), h.clone()))
        .collect();

    let mut next: Vec<SavedHub> = Vec::with_capacity(saved.len());
    let mut seen = std::collections::HashSet::new();
    for id in &hub_ids {
        if let Some(h) = by_id.get(id) {
            next.push(h.clone());
            seen.insert(id.clone());
        }
    }
    // Append anything the caller didn't mention so we never silently lose
    // a hub from the saved list.
    for h in &saved {
        if !seen.contains(&h.hub_id) {
            next.push(h.clone());
        }
    }
    save_hubs_list(&next)
}

#[tauri::command]
pub(crate) async fn get_hub_ws_info(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    Ok(serde_json::json!({ "hub_url": hub_url, "token": token }))
}

/// Returns the `voxply://` URL that launched the app (if any) and clears it.
/// The frontend calls this on mount to detect deep-link launches.
#[tauri::command]
pub(crate) fn get_pending_deep_link(
    state: State<'_, crate::state::PendingDeepLink>,
) -> Option<String> {
    state.url.lock().unwrap().take()
}
