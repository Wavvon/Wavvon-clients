#![allow(dead_code)]
use crate::state::{active_session, AppState};
use tauri::State;

#[tauri::command]
pub(crate) async fn get_discovery_settings(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .get(format!(
            "{}/admin/settings/tags",
            hub_url.trim_end_matches('/')
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let tags = body["tags"].clone();
    let nsfw = body["nsfw"].as_bool().unwrap_or(false);
    Ok(serde_json::json!({ "self_tags": tags, "nsfw": nsfw }))
}

#[tauri::command]
pub(crate) async fn set_discovery_tags(
    tags: Vec<String>,
    nsfw: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .patch(format!(
            "{}/admin/settings/tags",
            hub_url.trim_end_matches('/')
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "tags": tags, "nsfw": nsfw }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    Ok(())
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub(crate) struct LinkPreviewInfo {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
}

#[tauri::command]
pub(crate) async fn fetch_link_preview(
    hub_url: String,
    url: String,
    state: State<'_, AppState>,
) -> Result<LinkPreviewInfo, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let encoded = crate::messages::urlencoding_emoji(&url);
    let resp = state
        .http_client
        .get(format!(
            "{}/preview?url={}",
            hub_url.trim_end_matches('/'),
            encoded
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.json::<LinkPreviewInfo>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn set_hub_listed(
    hub_url: String,
    listed: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let res = state
        .http_client
        .patch(format!(
            "{}/admin/settings/listing",
            hub_url.trim_end_matches('/')
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "listed": listed }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

#[tauri::command]
pub(crate) async fn list_badges(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .get(format!("{}/badges", hub_url.trim_end_matches('/')))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    res.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn list_pending_badges(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .get(format!("{}/badges/pending", hub_url.trim_end_matches('/')))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    res.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn accept_badge(
    badge_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .post(format!(
            "{}/badges/pending/{}/accept",
            hub_url.trim_end_matches('/'),
            badge_id
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn decline_badge(
    badge_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .post(format!(
            "{}/badges/pending/{}/decline",
            hub_url.trim_end_matches('/'),
            badge_id
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn remove_badge(
    badge_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .delete(format!(
            "{}/badges/{}",
            hub_url.trim_end_matches('/'),
            badge_id
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn grant_badge(
    target_hub_url: String,
    label: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .post(format!(
            "{}/admin/badges/issue",
            hub_url.trim_end_matches('/')
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "recipient_hub_url": target_hub_url, "label": label }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    Ok(())
}
