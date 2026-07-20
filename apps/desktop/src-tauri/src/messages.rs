#![allow(dead_code)]
use crate::state::{active_session, AppState};
use crate::types::{map_http_status, AppError, AttachmentInfo, MessageInfo};
use tauri::State;

pub(crate) fn urlencoding_emoji(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push('%');
                out.push_str(&format!("{:02X}", b));
            }
        }
    }
    out
}

#[tauri::command]
pub(crate) async fn get_messages(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<MessageInfo>, AppError> {
    let (hub_url, token) = active_session(&state).map_err(AppError::Internal)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/channels/{channel_id}/messages"))
        .bearer_auth(&token)
        .send()
        .await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(map_http_status(status, body));
    }
    let mut messages: Vec<MessageInfo> = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    messages.reverse();
    Ok(messages)
}

#[tauri::command]
pub(crate) async fn get_thread_replies(
    channel_id: String,
    thread_root: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let (hub_url, token) = active_session(&state)?;
    state
        .http_client
        .get(format!("{hub_url}/channels/{channel_id}/messages"))
        .query(&[("thread_root", &thread_root), ("limit", &"100".to_string())])
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn add_reaction(
    channel_id: String,
    message_id: String,
    emoji: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let (hub_url, token) = active_session(&state).map_err(AppError::Internal)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!(
            "{hub_url}/channels/{channel_id}/messages/{message_id}/reactions"
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "emoji": emoji }))
        .send()
        .await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(map_http_status(status, body));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn remove_reaction(
    channel_id: String,
    message_id: String,
    emoji: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let (hub_url, token) = active_session(&state).map_err(AppError::Internal)?;
    let encoded = urlencoding_emoji(&emoji);
    let resp = state
        .http_client
        .delete(format!(
            "{hub_url}/channels/{channel_id}/messages/{message_id}/reactions/{encoded}"
        ))
        .bearer_auth(&token)
        .send()
        .await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(map_http_status(status, body));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn search_messages(
    channel_id: String,
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<MessageInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let messages: Vec<MessageInfo> = state
        .http_client
        .get(format!("{hub_url}/channels/{channel_id}/messages"))
        .query(&[("q", query.as_str())])
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))?;
    Ok(messages)
}

#[tauri::command]
pub(crate) async fn search_messages_global(
    q: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let (hub_url, token) = active_session(&state)?;
    let encoded_q = urlencoding_emoji(&q);
    let res = state
        .http_client
        .get(format!("{hub_url}/search?q={encoded_q}&limit=20"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    res.json::<Vec<serde_json::Value>>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn send_message(
    channel_id: String,
    content: String,
    attachments: Option<Vec<AttachmentInfo>>,
    reply_to: Option<String>,
    state: State<'_, AppState>,
) -> Result<MessageInfo, AppError> {
    let (hub_url, token) = active_session(&state).map_err(AppError::Internal)?;
    let body = serde_json::json!({
        "content": content,
        "attachments": attachments.unwrap_or_default(),
        "reply_to": reply_to,
    });
    let resp = state
        .http_client
        .post(format!("{hub_url}/channels/{channel_id}/messages"))
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(map_http_status(status, body));
    }
    resp.json()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))
}

#[tauri::command]
pub(crate) async fn edit_message(
    channel_id: String,
    message_id: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<MessageInfo, AppError> {
    let (hub_url, token) = active_session(&state).map_err(AppError::Internal)?;
    let resp = state
        .http_client
        .patch(format!(
            "{hub_url}/channels/{channel_id}/messages/{message_id}"
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "content": content }))
        .send()
        .await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(map_http_status(status, body));
    }
    resp.json()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))
}

#[tauri::command]
pub(crate) async fn delete_message(
    channel_id: String,
    message_id: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let (hub_url, token) = active_session(&state).map_err(AppError::Internal)?;
    let resp = state
        .http_client
        .delete(format!(
            "{hub_url}/channels/{channel_id}/messages/{message_id}"
        ))
        .bearer_auth(&token)
        .send()
        .await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(map_http_status(status, body));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn forum_list_posts(
    channel_id: String,
    cursor: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let mut req = state
        .http_client
        .get(format!("{hub_url}/channels/{channel_id}/posts"))
        .bearer_auth(&token);
    if let Some(c) = cursor {
        req = req.query(&[("cursor", c)]);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn forum_get_post(
    channel_id: String,
    post_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let resp = state
        .http_client
        .get(format!("{hub_url}/channels/{channel_id}/posts/{post_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn forum_create_post(
    channel_id: String,
    title: String,
    body: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let resp = state
        .http_client
        .post(format!("{hub_url}/channels/{channel_id}/posts"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "title": title, "body": body }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn forum_create_reply(
    channel_id: String,
    post_id: String,
    body: String,
    reply_to_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let resp = state
        .http_client
        .post(format!(
            "{hub_url}/channels/{channel_id}/posts/{post_id}/replies"
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "body": body, "reply_to_id": reply_to_id }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn forum_get_post_replies(
    channel_id: String,
    post_id: String,
    cursor: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    let mut req = state
        .http_client
        .get(format!(
            "{hub_url}/channels/{channel_id}/posts/{post_id}/replies"
        ))
        .bearer_auth(&token);
    if let Some(c) = cursor {
        req = req.query(&[("cursor", c)]);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn forum_pin_post(
    channel_id: String,
    post_id: String,
    pin: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let url = format!("{hub_url}/channels/{channel_id}/posts/{post_id}/pin");
    let resp = if pin {
        state
            .http_client
            .post(&url)
            .bearer_auth(&token)
            .body("")
            .send()
            .await
    } else {
        state
            .http_client
            .delete(&url)
            .bearer_auth(&token)
            .send()
            .await
    }
    .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn forum_lock_post(
    channel_id: String,
    post_id: String,
    lock: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let url = format!("{hub_url}/channels/{channel_id}/posts/{post_id}/lock");
    let resp = if lock {
        state
            .http_client
            .post(&url)
            .bearer_auth(&token)
            .body("")
            .send()
            .await
    } else {
        state
            .http_client
            .delete(&url)
            .bearer_auth(&token)
            .send()
            .await
    }
    .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn forum_edit_post(
    channel_id: String,
    post_id: String,
    title: Option<String>,
    body: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let resp = state
        .http_client
        .patch(format!("{hub_url}/channels/{channel_id}/posts/{post_id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "title": title, "body": body }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn forum_delete_post(
    channel_id: String,
    post_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let resp = state
        .http_client
        .delete(format!("{hub_url}/channels/{channel_id}/posts/{post_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn forum_edit_reply(
    channel_id: String,
    post_id: String,
    reply_id: String,
    body: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let resp = state
        .http_client
        .patch(format!(
            "{hub_url}/channels/{channel_id}/posts/{post_id}/replies/{reply_id}"
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "body": body }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn forum_delete_reply(
    channel_id: String,
    post_id: String,
    reply_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let resp = state
        .http_client
        .delete(format!(
            "{hub_url}/channels/{channel_id}/posts/{post_id}/replies/{reply_id}"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn forum_add_post_reaction(
    channel_id: String,
    post_id: String,
    emoji: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let resp = state
        .http_client
        .post(format!(
            "{hub_url}/channels/{channel_id}/posts/{post_id}/reactions"
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "emoji": emoji }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn forum_remove_post_reaction(
    channel_id: String,
    post_id: String,
    emoji: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let encoded = urlencoding_emoji(&emoji);
    let resp = state
        .http_client
        .delete(format!(
            "{hub_url}/channels/{channel_id}/posts/{post_id}/reactions/{encoded}"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn forum_add_reply_reaction(
    channel_id: String,
    post_id: String,
    reply_id: String,
    emoji: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let resp = state
        .http_client
        .post(format!(
            "{hub_url}/channels/{channel_id}/posts/{post_id}/replies/{reply_id}/reactions"
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "emoji": emoji }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn forum_remove_reply_reaction(
    channel_id: String,
    post_id: String,
    reply_id: String,
    emoji: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let encoded = urlencoding_emoji(&emoji);
    let resp = state
        .http_client
        .delete(format!(
            "{hub_url}/channels/{channel_id}/posts/{post_id}/replies/{reply_id}/reactions/{encoded}"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn mark_post_read(
    channel_id: String,
    post_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let resp = state
        .http_client
        .post(format!(
            "{hub_url}/channels/{channel_id}/posts/{post_id}/read"
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn pin_message(
    hub_url: String,
    channel_id: String,
    message_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let url = format!(
        "{}/channels/{}/pins/{}",
        hub_url.trim_end_matches('/'),
        channel_id,
        message_id
    );
    state
        .http_client
        .post(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn unpin_message(
    hub_url: String,
    channel_id: String,
    message_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let url = format!(
        "{}/channels/{}/pins/{}",
        hub_url.trim_end_matches('/'),
        channel_id,
        message_id
    );
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
pub(crate) async fn get_pinned_messages(
    hub_url: String,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let url = format!(
        "{}/channels/{}/pins",
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

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct UploadResult {
    pub url: String,
    pub filename: String,
    pub size_bytes: u64,
    pub mime_type: String,
    pub file_id: String,
}

#[tauri::command]
pub(crate) async fn upload_file(
    hub_url: String,
    channel_id: String,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<UploadResult, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let path = std::path::Path::new(&file_path);
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string();
    let bytes = tokio::fs::read(path).await.map_err(|e| e.to_string())?;
    let size_bytes = bytes.len() as u64;
    let mime_type = mime_guess::from_path(path)
        .first_or_octet_stream()
        .to_string();
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename.clone())
        .mime_str(&mime_type)
        .map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new().part("file", part);
    let url = format!(
        "{}/channels/{}/upload",
        hub_url.trim_end_matches('/'),
        channel_id
    );
    let res = state
        .http_client
        .post(&url)
        .bearer_auth(&token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Upload failed: HTTP {}", res.status()));
    }
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(UploadResult {
        url: json["url"].as_str().unwrap_or("").to_string(),
        filename: json["filename"].as_str().unwrap_or(&filename).to_string(),
        size_bytes: json["size_bytes"].as_u64().unwrap_or(size_bytes),
        mime_type: json["mime_type"].as_str().unwrap_or(&mime_type).to_string(),
        file_id: json["id"].as_str().unwrap_or("").to_string(),
    })
}

/// Like `upload_file`, but takes the bytes directly (base64) — for content
/// the webview holds as a browser `File` with no filesystem path (e.g. the
/// shared ChannelSettingsModal's banner picker).
#[tauri::command]
pub(crate) async fn upload_file_bytes(
    hub_url: String,
    channel_id: String,
    filename: String,
    mime_type: String,
    bytes_b64: String,
    state: State<'_, AppState>,
) -> Result<UploadResult, String> {
    use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let bytes = B64.decode(&bytes_b64).map_err(|e| e.to_string())?;
    let size_bytes = bytes.len() as u64;
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename.clone())
        .mime_str(&mime_type)
        .map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new().part("file", part);
    let url = format!(
        "{}/channels/{}/upload",
        hub_url.trim_end_matches('/'),
        channel_id
    );
    let res = state
        .http_client
        .post(&url)
        .bearer_auth(&token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Upload failed: HTTP {}", res.status()));
    }
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(UploadResult {
        url: json["url"].as_str().unwrap_or("").to_string(),
        filename: json["filename"].as_str().unwrap_or(&filename).to_string(),
        size_bytes: json["size_bytes"].as_u64().unwrap_or(size_bytes),
        mime_type: json["mime_type"].as_str().unwrap_or(&mime_type).to_string(),
        file_id: json["id"].as_str().unwrap_or("").to_string(),
    })
}
