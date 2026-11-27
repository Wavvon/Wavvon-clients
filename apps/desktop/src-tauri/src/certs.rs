use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub(crate) async fn get_cert_settings(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let res = state
        .http_client
        .get(format!(
            "{}/admin/settings/certs",
            hub_url.trim_end_matches('/')
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
pub(crate) async fn get_audit_log(
    hub_url: String,
    cursor: Option<i64>,
    limit: Option<i64>,
    event_type: Option<String>,
    actor: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let mut query = format!("limit={}", limit.unwrap_or(50));
    if let Some(c) = cursor {
        query.push_str(&format!("&cursor={c}"));
    }
    // Both are hex keys or dotted event names, so they need no escaping.
    if let Some(e) = event_type {
        query.push_str(&format!("&event_type={e}"));
    }
    if let Some(a) = actor {
        query.push_str(&format!("&actor={a}"));
    }
    let res = state
        .http_client
        .get(format!(
            "{}/admin/audit-log?{query}",
            hub_url.trim_end_matches('/')
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
pub(crate) async fn list_issued_certs(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let rows: Vec<serde_json::Value> = crate::paging::walk_pages(
        &state.http_client,
        &token,
        &format!("{}/admin/certs", hub_url.trim_end_matches('/')),
        &[],
        |r: &serde_json::Value| r["id"].as_str().map(str::to_string),
        "list_issued_certs",
    )
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| {
            serde_json::json!({
                "id": r["id"],
                "subject_pubkey": r["subject_pubkey"],
                "subject_display": serde_json::Value::Null,
                "issued_at": r["issued_at"],
                "expires_at": r["expires_at"],
                "standing": r["standing"],
                "revoked_at": r["revoked_at"],
                "payload": r["payload"],
            })
        })
        .collect())
}

#[tauri::command]
pub(crate) async fn save_cert_settings(
    hub_url: String,
    settings: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    // The settings go through whole, as the web client sends them: picking
    // fields one by one is how the issuer URLs were dropped here unseen.
    let body = settings;
    let res = state
        .http_client
        .patch(format!(
            "{}/admin/settings/certs",
            hub_url.trim_end_matches('/')
        ))
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn issue_cert(
    hub_url: String,
    subject_pubkey: String,
    cert_type: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let mut req = state
        .http_client
        .post(format!(
            "{}/admin/certs/{}",
            hub_url.trim_end_matches('/'),
            subject_pubkey
        ))
        .bearer_auth(&token);
    if let Some(t) = cert_type {
        req = req.json(&serde_json::json!({ "cert_type": t }));
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    let cert: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let p = &cert["payload"];
    Ok(serde_json::json!({
        "id": p["subject_pubkey"],
        "subject_pubkey": p["subject_pubkey"],
        "subject_display": serde_json::Value::Null,
        "issued_at": p["issued_at"],
        "expires_at": p["expires_at"],
        "standing": p["standing"],
    }))
}

#[tauri::command]
pub(crate) async fn revoke_cert(
    hub_url: String,
    subject_pubkey: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let res = state
        .http_client
        .delete(format!(
            "{}/admin/certs/{}",
            hub_url.trim_end_matches('/'),
            subject_pubkey
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
pub(crate) async fn grant_user_badge(
    hub_url: String,
    subject_pubkey: String,
    label: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let res = state
        .http_client
        .post(format!(
            "{}/admin/certs/{}/badge",
            hub_url.trim_end_matches('/'),
            subject_pubkey
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "label": label }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn fetch_my_certs(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let pubkey = crate::identity_cmd::device_public_key()?;
    let sessions: Vec<(String, String)> = {
        let hubs = state.hubs.lock().unwrap();
        hubs.values()
            .map(|s| (s.hub_url.clone(), s.token.clone()))
            .collect()
    };
    let mut all_certs = Vec::new();
    for (hub_url, token) in sessions {
        if let Ok(res) = state
            .http_client
            .get(format!(
                "{}/identity/{}/certs",
                hub_url.trim_end_matches('/'),
                pubkey
            ))
            .bearer_auth(&token)
            .send()
            .await
        {
            if res.status().is_success() {
                if let Ok(certs) = res.json::<Vec<serde_json::Value>>().await {
                    all_certs.extend(certs);
                }
            }
        }
    }
    Ok(all_certs)
}

/// A hub's certificate catalogue; public, so any hub's URL works.
#[tauri::command]
pub(crate) async fn list_cert_types(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let res = state
        .http_client
        .get(format!("{}/certs/types", hub_url.trim_end_matches('/')))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    res.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn create_cert_type(
    hub_url: String,
    name: String,
    description: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let res = state
        .http_client
        .post(format!(
            "{}/admin/cert-types",
            hub_url.trim_end_matches('/')
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "name": name, "description": description }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn delete_cert_type(
    hub_url: String,
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let res = state
        .http_client
        .delete(format!(
            "{}/admin/cert-types/{id}",
            hub_url.trim_end_matches('/')
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

async fn badge_request(
    state: &AppState,
    hub_url: &str,
    method: reqwest::Method,
    path: &str,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(state, hub_url)?;
    let mut req = state
        .http_client
        .request(method, format!("{}{}", hub_url.trim_end_matches('/'), path))
        .bearer_auth(&token);
    if let Some(b) = body {
        req = req.json(&b);
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    let text = res.text().await.map_err(|e| e.to_string())?;
    if text.is_empty() {
        return Ok(serde_json::Value::Null);
    }
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn list_badge_defs(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    badge_request(&state, &hub_url, reqwest::Method::GET, "/badges/defs", None).await
}

#[tauri::command]
pub(crate) async fn preview_badge_def(
    hub_url: String,
    request: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    badge_request(
        &state,
        &hub_url,
        reqwest::Method::POST,
        "/admin/badge-defs/preview",
        Some(request),
    )
    .await
}

#[tauri::command]
pub(crate) async fn create_badge_def(
    hub_url: String,
    request: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    badge_request(
        &state,
        &hub_url,
        reqwest::Method::POST,
        "/admin/badge-defs",
        Some(request),
    )
    .await
}

#[tauri::command]
pub(crate) async fn set_badge_def_hidden(
    hub_url: String,
    id: String,
    hidden: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    badge_request(
        &state,
        &hub_url,
        reqwest::Method::PATCH,
        &format!("/admin/badge-defs/{id}"),
        Some(serde_json::json!({ "hidden": hidden })),
    )
    .await
    .map(|_| ())
}

#[tauri::command]
pub(crate) async fn delete_badge_def(
    hub_url: String,
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    badge_request(
        &state,
        &hub_url,
        reqwest::Method::DELETE,
        &format!("/admin/badge-defs/{id}"),
        None,
    )
    .await
    .map(|_| ())
}

#[tauri::command]
pub(crate) async fn list_badge_awards(
    hub_url: String,
    id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    badge_request(
        &state,
        &hub_url,
        reqwest::Method::GET,
        &format!("/admin/badge-defs/{id}/awards"),
        None,
    )
    .await
}

#[tauri::command]
pub(crate) async fn grant_badge_def(
    hub_url: String,
    id: String,
    subjects: Vec<String>,
    level: Option<i64>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    badge_request(
        &state,
        &hub_url,
        reqwest::Method::POST,
        &format!("/admin/badge-defs/{id}/grant"),
        Some(serde_json::json!({ "subjects": subjects, "level": level })),
    )
    .await
    .map(|_| ())
}

#[tauri::command]
pub(crate) async fn revoke_badge_award(
    hub_url: String,
    id: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    badge_request(
        &state,
        &hub_url,
        reqwest::Method::DELETE,
        &format!("/admin/badge-defs/{id}/awards/{pubkey}"),
        None,
    )
    .await
    .map(|_| ())
}
