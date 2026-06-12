use crate::state::WsCommand;
use crate::state::{active_session, active_ws_tx, AppState};
use tauri::State;

#[tauri::command]
pub(crate) async fn game_create_session(
    game_id: String,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .post(format!("{hub_url}/games/{game_id}/sessions"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "channel_id": channel_id }))
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
pub(crate) async fn game_join_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .post(format!("{hub_url}/games/sessions/{session_id}/join"))
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
pub(crate) async fn game_leave_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .post(format!("{hub_url}/games/sessions/{session_id}/leave"))
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
pub(crate) async fn game_get_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .get(format!("{hub_url}/games/sessions/{session_id}"))
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
pub(crate) async fn game_list_sessions(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .get(format!("{hub_url}/games/sessions"))
        .query(&[("channel_id", channel_id.as_str())])
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
pub(crate) fn game_send_move(
    session_id: String,
    payload: serde_json::Value,
    to: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let tx = active_ws_tx(&state)?;
    tx.send(WsCommand::GameSend {
        session_id,
        payload,
        to,
    })
    .map_err(|_| "WS closed".to_string())
}

#[tauri::command]
pub(crate) fn game_start_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let tx = active_ws_tx(&state)?;
    tx.send(WsCommand::GameSetStatus {
        session_id,
        status: "in_progress".to_string(),
    })
    .map_err(|_| "WS closed".to_string())
}

#[tauri::command]
pub(crate) fn game_snapshot(
    session_id: String,
    blob: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let tx = active_ws_tx(&state)?;
    tx.send(WsCommand::GameSnapshot { session_id, blob })
        .map_err(|_| "WS closed".to_string())
}

#[tauri::command]
pub(crate) fn game_end_session(
    session_id: String,
    result: Option<serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let tx = active_ws_tx(&state)?;
    tx.send(WsCommand::GameEnd { session_id, result })
        .map_err(|_| "WS closed".to_string())
}

#[tauri::command]
pub(crate) fn game_set_join_policy(
    session_id: String,
    join_during_play: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let tx = active_ws_tx(&state)?;
    let payload = serde_json::json!({
        "type": "game_set_join_policy",
        "session_id": session_id,
        "join_during_play": join_during_play,
    });
    tx.send(WsCommand::Raw(payload.to_string()))
        .map_err(|_| "WS closed".to_string())
}

#[tauri::command]
pub(crate) async fn game_shared_kv_get(
    session_id: String,
    key: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .get(format!(
            "{hub_url}/games/sessions/{session_id}/shared-kv/{key}"
        ))
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
pub(crate) async fn game_shared_kv_set(
    session_id: String,
    key: String,
    value: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .put(format!(
            "{hub_url}/games/sessions/{session_id}/shared-kv/{key}"
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "value": value }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn game_list_channel_users(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .get(format!(
            "{}/channels/{}/members",
            hub_url.trim_end_matches('/'),
            channel_id
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    let users: Vec<serde_json::Value> = res.json().await.map_err(|e| e.to_string())?;
    Ok(users
        .into_iter()
        .map(|u| {
            serde_json::json!({
                "pubkey": u["public_key"],
                "display_name": u["display_name"],
            })
        })
        .collect())
}

#[tauri::command]
pub(crate) async fn game_post_message(
    channel_id: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .post(format!(
            "{}/channels/{}/messages",
            hub_url.trim_end_matches('/'),
            channel_id
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "content": content }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn game_get_recent_messages(
    channel_id: String,
    limit: u32,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let res = state
        .http_client
        .get(format!(
            "{}/channels/{}/messages?limit={}",
            hub_url.trim_end_matches('/'),
            channel_id,
            limit
        ))
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

fn game_kv_path(game_id: &str) -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home
        .join(".voxply")
        .join(format!("game_kv_{}.json", game_id)))
}

#[tauri::command]
pub(crate) fn game_kv_get(game_id: String, key: String) -> Result<Option<String>, String> {
    let path = game_kv_path(&game_id)?;
    if !path.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let map: std::collections::HashMap<String, String> =
        serde_json::from_str(&text).unwrap_or_default();
    Ok(map.get(&key).cloned())
}

#[tauri::command]
pub(crate) fn game_kv_set(game_id: String, key: String, value: String) -> Result<(), String> {
    let path = game_kv_path(&game_id)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let mut map: std::collections::HashMap<String, String> = if path.exists() {
        let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&text).unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };
    map.insert(key, value);
    let text = serde_json::to_string(&map).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())
}

// --- Game admin (install/manage) ---

#[tauri::command]
pub(crate) async fn list_admin_games(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let res = state
        .http_client
        .get(format!("{}/admin/games", hub_url.trim_end_matches('/')))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let games = body["games"].as_array().cloned().unwrap_or_default();
    Ok(games
        .into_iter()
        .map(|g| {
            serde_json::json!({
                "id": g["id"],
                "name": g["name"],
                "entry_url": g["entry_url"],
                "description": g["description"],
                "thumbnail_url": g["thumbnail_url"],
                "author": g["author"],
                "version": g["version"],
                "channel_ids": g["channel_scope"],
                "permissions": g["capabilities"].as_array().cloned().unwrap_or_default(),
            })
        })
        .collect())
}

#[tauri::command]
pub(crate) async fn fetch_game_manifest(
    manifest_url: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let res = state
        .http_client
        .get(&manifest_url)
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
pub(crate) async fn install_game(
    hub_url: String,
    name: String,
    entry_url: Option<String>,
    manifest_url: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let resolved_entry_url = if let Some(ref murl) = manifest_url {
        let mres = state
            .http_client
            .get(murl)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let manifest: serde_json::Value = mres.json().await.map_err(|e| e.to_string())?;
        manifest["entry_url"]
            .as_str()
            .ok_or("Manifest missing entry_url")?
            .to_string()
    } else {
        entry_url.ok_or("entry_url or manifest_url required")?
    };
    let res = state
        .http_client
        .post(format!("{}/admin/games", hub_url.trim_end_matches('/')))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "name": name, "entry_url": resolved_entry_url }))
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
pub(crate) async fn uninstall_game(
    hub_url: String,
    game_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let res = state
        .http_client
        .delete(format!(
            "{}/games/{}/enable",
            hub_url.trim_end_matches('/'),
            game_id
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
pub(crate) async fn set_game_permissions(
    hub_url: String,
    game_id: String,
    permissions: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let res = state
        .http_client
        .put(format!(
            "{}/admin/games/{}/permissions",
            hub_url.trim_end_matches('/'),
            game_id
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "capabilities": permissions }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn set_game_channels(
    hub_url: String,
    game_id: String,
    channel_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let res = state
        .http_client
        .put(format!(
            "{}/admin/games/{}/channels",
            hub_url.trim_end_matches('/'),
            game_id
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "channel_ids": channel_ids }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    Ok(())
}
