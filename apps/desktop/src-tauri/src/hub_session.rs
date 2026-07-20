use crate::local_store::{
    load_active_hub_id, load_profile, load_saved_hubs, save_active_hub_id, save_hubs_list,
};
use crate::state::{AppState, HubSession};
use crate::types::{HubInfo, InfoResponse, SavedHub};
use crate::ws::spawn_ws_task;
use tauri::{AppHandle, State};

#[tauri::command]
pub(crate) async fn add_hub(
    hub_url: String,
    invite_code: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<HubInfo, String> {
    let creds = crate::auth_creds::load_active_credentials()?;

    let client = state.http_client.clone();

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

    let token = creds
        .authenticate(&auth_url, &client, invite_code.as_deref())
        .await?;

    let profile = load_profile();
    if let Some(default_profile) = profile.default_profile.clone() {
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

    let (cmd_tx, ws_task) =
        spawn_ws_task(hub_id.clone(), hub_url.clone(), token.clone(), app.clone()).await?;

    let session = HubSession {
        hub_id: hub_id.clone(),
        hub_name: hub_name.clone(),
        hub_url: hub_url.clone(),
        hub_icon: hub_icon.clone(),
        token,
        ws_tx: cmd_tx,
        ws_task,
    };

    {
        let mut hubs = state.hubs.lock().unwrap();
        hubs.insert(hub_id.clone(), session);
    }

    {
        let mut active = state.active_hub.lock().unwrap();
        if active.is_none() {
            *active = Some(hub_id.clone());
        }
    }

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
    drop(hubs);
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

    if let Some(persisted) = load_active_hub_id() {
        let hubs = state.hubs.lock().unwrap();
        if hubs.contains_key(&persisted) {
            drop(hubs);
            *state.active_hub.lock().unwrap() = Some(persisted);
        }
    }

    Ok(list_hubs(state))
}

#[tauri::command]
pub(crate) async fn reconnect_hub(
    hub_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    crate::ws::reauth_session(&state, &app, &hub_id).await?;
    Ok(())
}

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
    for h in &saved {
        if !seen.contains(&h.hub_id) {
            next.push(h.clone());
        }
    }
    save_hubs_list(&next)
}

#[tauri::command]
pub(crate) async fn add_hub_by_url(
    hub_url: String,
    invite_code: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<HubInfo, String> {
    add_hub(hub_url, invite_code, state, app).await
}

#[tauri::command]
pub(crate) async fn get_hub_ws_info(
    hub_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let hubs = state.hubs.lock().unwrap();
    let s = hubs.get(&hub_id).ok_or("Hub not connected")?;
    Ok(serde_json::json!({
        "hub_id": s.hub_id,
        "hub_name": s.hub_name,
        "hub_url": s.hub_url,
        "hub_icon": s.hub_icon,
    }))
}
