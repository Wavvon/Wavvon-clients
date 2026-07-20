use crate::state::{active_session, AppState};
use tauri::State;

// =============================================================================
// Events
// =============================================================================

#[tauri::command]
pub(crate) async fn list_events(
    upcoming: bool,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let url = if upcoming {
        format!("{hub_url}/events?upcoming=true&limit=20")
    } else {
        format!("{hub_url}/events?limit=20")
    };
    let res = state
        .http_client
        .get(url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    res.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn rsvp_event(
    event_id: String,
    status: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    state
        .http_client
        .post(format!("{hub_url}/events/{event_id}/rsvp"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "status": status }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn create_event(
    channel_id: String,
    title: String,
    description: String,
    starts_at: i64,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .post(format!("{hub_url}/events"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "channel_id": channel_id,
            "title": title,
            "description": description,
            "starts_at": starts_at,
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    res.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn delete_event(
    hub_url: String,
    event_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let url = format!("{}/events/{}", hub_url.trim_end_matches('/'), event_id);
    state
        .http_client
        .delete(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn get_hub_events(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let url = format!(
        "{}/events?upcoming=true&limit=50",
        hub_url.trim_end_matches('/')
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

#[tauri::command]
pub(crate) async fn rsvp_event_hub(
    hub_url: String,
    event_id: String,
    status: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    state
        .http_client
        .post(format!(
            "{}/events/{}/rsvp",
            hub_url.trim_end_matches('/'),
            event_id
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "status": status }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) async fn create_event_hub(
    hub_url: String,
    title: String,
    description: String,
    starts_at: i64,
    ends_at: Option<i64>,
    channel_id: Option<String>,
    location: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let mut body = serde_json::json!({
        "title": title,
        "description": description,
        "starts_at": starts_at,
    });
    if let Some(ts) = ends_at {
        body["ends_at"] = serde_json::Value::Number(ts.into());
    }
    if let Some(ch) = channel_id {
        body["channel_id"] = serde_json::Value::String(ch);
    }
    if let Some(loc) = location {
        body["location"] = serde_json::Value::String(loc);
    }
    let res = state
        .http_client
        .post(format!("{}/events", hub_url.trim_end_matches('/')))
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    res.json().await.map_err(|e| e.to_string())
}

// =============================================================================
// Polls
// =============================================================================

#[tauri::command]
pub(crate) async fn vote_poll(
    poll_id: String,
    option_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    state
        .http_client
        .post(format!("{hub_url}/polls/{poll_id}/vote"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "option_ids": option_ids }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn create_poll(
    hub_url: String,
    channel_id: String,
    question: String,
    options: Vec<String>,
    closes_at: Option<i64>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    // Route is channel-scoped (hub/src/routes/polls.rs: POST
    // /channels/{channel_id}/polls — there is no bare /polls create route),
    // and the hub's CreatePollRequest wants `{id, text}` option objects plus
    // `ends_at`, not a bare string array / `closes_at`.
    let url = format!(
        "{}/channels/{}/polls",
        hub_url.trim_end_matches('/'),
        channel_id
    );
    let option_objects: Vec<serde_json::Value> = options
        .iter()
        .enumerate()
        .map(|(i, text)| serde_json::json!({ "id": i.to_string(), "text": text }))
        .collect();
    let mut body = serde_json::json!({
        "question": question,
        "options": option_objects,
    });
    if let Some(ts) = closes_at {
        body["ends_at"] = serde_json::Value::Number(ts.into());
    }
    let res = state
        .http_client
        .post(&url)
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    res.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn get_channel_polls(
    hub_url: String,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let url = format!(
        "{}/polls?channel_id={}",
        hub_url.trim_end_matches('/'),
        channel_id
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

#[tauri::command]
pub(crate) async fn delete_poll(
    hub_url: String,
    poll_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let url = format!("{}/polls/{}", hub_url.trim_end_matches('/'), poll_id);
    state
        .http_client
        .delete(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
