use crate::state::{active_session, AppState};
use serde::Deserialize;
use tauri::State;

// =============================================================================
// Events
// =============================================================================

/// A role-slot sign-up bucket on event creation (events.md §2), matching the
/// hub's `CreateSlotRequest` / web's `CreateEventSlotInput`.
#[derive(Deserialize)]
pub(crate) struct EventSlotInput {
    name: String,
    #[serde(default)]
    capacity: Option<i64>,
}

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
    slot_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    state
        .http_client
        .post(format!("{hub_url}/events/{event_id}/rsvp"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "status": status, "slot_id": slot_id }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) async fn create_event(
    channel_id: String,
    title: String,
    description: String,
    starts_at: i64,
    ends_at: Option<i64>,
    location: Option<String>,
    reminder_minutes: Option<i64>,
    slots: Option<Vec<EventSlotInput>>,
    hub_wide: Option<bool>,
    propagate_to_children: Option<bool>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let slots_json: Vec<serde_json::Value> = slots
        .unwrap_or_default()
        .into_iter()
        .map(|s| serde_json::json!({ "name": s.name, "capacity": s.capacity }))
        .collect();
    let res = state
        .http_client
        .post(format!("{hub_url}/events"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "channel_id": channel_id,
            "title": title,
            "description": description,
            "starts_at": starts_at,
            "ends_at": ends_at,
            "location": location,
            "reminder_minutes": reminder_minutes,
            "slots": slots_json,
            "hub_wide": hub_wide.unwrap_or(false),
            "propagate_to_children": propagate_to_children.unwrap_or(false),
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
    slot_id: Option<String>,
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
        .json(&serde_json::json!({ "status": status, "slot_id": slot_id }))
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
    reminder_minutes: Option<i64>,
    slots: Option<Vec<EventSlotInput>>,
    hub_wide: Option<bool>,
    propagate_to_children: Option<bool>,
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
    if let Some(rm) = reminder_minutes {
        body["reminder_minutes"] = serde_json::Value::Number(rm.into());
    }
    if let Some(slots) = slots {
        body["slots"] = serde_json::Value::Array(
            slots
                .into_iter()
                .map(|s| serde_json::json!({ "name": s.name, "capacity": s.capacity }))
                .collect(),
        );
    }
    if let Some(hw) = hub_wide {
        body["hub_wide"] = serde_json::Value::Bool(hw);
    }
    if let Some(p) = propagate_to_children {
        body["propagate_to_children"] = serde_json::Value::Bool(p);
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

#[tauri::command]
pub(crate) async fn get_event(
    hub_url: String,
    event_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let url = format!("{}/events/{}", hub_url.trim_end_matches('/'), event_id);
    let res = state
        .http_client
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    res.json().await.map_err(|e| e.to_string())
}

/// GET /events/:id/assignments — staging-panel data surface (events.md
/// §7.5). Organizer/mover only; the hub 404s/403s as appropriate.
#[tauri::command]
pub(crate) async fn get_event_assignments(
    hub_url: String,
    event_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let url = format!(
        "{}/events/{}/assignments",
        hub_url.trim_end_matches('/'),
        event_id
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

/// GET /events/:id/rsvps — full RSVP list (events.md §7.5 "Unassigned"
/// group), not just counts.
#[tauri::command]
pub(crate) async fn get_event_rsvps(
    hub_url: String,
    event_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let url = format!(
        "{}/events/{}/rsvps",
        hub_url.trim_end_matches('/'),
        event_id
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

/// POST /events/:id/squad-rooms — auto-spawned squad channels (events.md
/// §7.5 Phase 3), organizer-only.
#[tauri::command]
pub(crate) async fn create_event_squad_rooms(
    hub_url: String,
    event_id: String,
    count: i64,
    name_prefix: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let url = format!(
        "{}/events/{}/squad-rooms",
        hub_url.trim_end_matches('/'),
        event_id
    );
    let res = state
        .http_client
        .post(&url)
        .bearer_auth(&token)
        .json(&serde_json::json!({ "count": count, "name_prefix": name_prefix }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_default());
    }
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
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    state
        .http_client
        .post(format!("{hub_url}/polls/{poll_id}/vote"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "option_ids": option_ids }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // The vote endpoint returns 204 with no body, but MessageRowActions'
    // `votePoll` needs the updated `Poll` back for optimistic UI (same
    // contract as web's `votePoll` in platform/commands/polls.ts). Re-fetch
    // via GET /polls/:poll_id (PollWithTotals: `poll` has `options` as a
    // JSON-encoded string, plus separate `totals`/`your_vote`) and reshape
    // into the flat `Poll` client type.
    let res = state
        .http_client
        .get(format!("{hub_url}/polls/{poll_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let raw: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    let poll = raw.get("poll").cloned().unwrap_or(serde_json::json!({}));
    let raw_options: Vec<serde_json::Value> = match poll.get("options") {
        Some(serde_json::Value::String(s)) => serde_json::from_str(s).unwrap_or_default(),
        Some(serde_json::Value::Array(a)) => a.clone(),
        _ => Vec::new(),
    };
    let totals = raw
        .get("totals")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let your_vote: Vec<String> = raw
        .get("your_vote")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    let total_votes: i64 = totals.values().filter_map(|v| v.as_i64()).sum();

    let options: Vec<serde_json::Value> = raw_options
        .into_iter()
        .map(|o| {
            let id = o
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let vote_count = totals.get(&id).and_then(|v| v.as_i64()).unwrap_or(0);
            serde_json::json!({
                "id": id,
                "text": o.get("text").and_then(|v| v.as_str()).unwrap_or(""),
                "vote_count": vote_count,
                "voted": your_vote.contains(&id),
            })
        })
        .collect();

    Ok(serde_json::json!({
        "id": poll.get("id").cloned().unwrap_or(serde_json::Value::Null),
        "channel_id": poll.get("channel_id").cloned().unwrap_or(serde_json::Value::Null),
        "question": poll.get("question").cloned().unwrap_or(serde_json::Value::Null),
        "options": options,
        "total_votes": total_votes,
        "created_by": poll.get("creator_pubkey").cloned().unwrap_or(serde_json::Value::Null),
        "created_at": poll.get("created_at").cloned().unwrap_or(serde_json::Value::Null),
        "ends_at": poll.get("ends_at").cloned().unwrap_or(serde_json::Value::Null),
        "is_deleted": false,
    }))
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
    // Route is channel-scoped (hub/src/routes/polls.rs: GET
    // /channels/{channel_id}/polls) — there is no bare /polls?channel_id=
    // listing route. The response shape (PollListItem) already matches the
    // client's flat `Poll`/`PollOption` types field-for-field.
    let url = format!(
        "{}/channels/{}/polls",
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
