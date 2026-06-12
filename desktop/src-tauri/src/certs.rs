#![allow(dead_code)]
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
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let res = state
        .http_client
        .get(format!(
            "{}/admin/audit-log?limit=100",
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
    let res = state
        .http_client
        .get(format!("{}/admin/certs", hub_url.trim_end_matches('/')))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    let rows: Vec<serde_json::Value> = res.json().await.map_err(|e| e.to_string())?;
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
    let cert_auto_issue = settings["cert_auto_issue"].as_bool().map(|b| {
        if b {
            "true".to_string()
        } else {
            "false".to_string()
        }
    });
    let cert_standing_days = settings["cert_min_age_days"]
        .as_i64()
        .map(|n| n.to_string());
    let cert_validity_days = settings["cert_validity_days"]
        .as_i64()
        .map(|n| n.to_string());
    let cert_mode = settings["cert_mode"].as_str().map(|s| s.to_string());
    let cert_trusted_issuers = settings.get("cert_trusted_issuers").cloned();
    let mut body = serde_json::Map::new();
    if let Some(v) = cert_auto_issue {
        body.insert("cert_auto_issue".into(), v.into());
    }
    if let Some(v) = cert_standing_days {
        body.insert("cert_standing_days".into(), v.into());
    }
    if let Some(v) = cert_validity_days {
        body.insert("cert_validity_days".into(), v.into());
    }
    if let Some(v) = cert_mode {
        body.insert("cert_mode".into(), v.into());
    }
    if let Some(v) = cert_trusted_issuers {
        body.insert("cert_trusted_issuers".into(), v);
    }
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
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let res = state
        .http_client
        .post(format!(
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
        .post(format!(
            "{}/admin/certs/{}/revoke",
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
pub(crate) async fn fetch_my_certs(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let pubkey = crate::identity_cmd::get_my_public_key()?;
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
