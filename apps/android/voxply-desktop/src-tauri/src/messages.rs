use crate::state::{active_session, active_ws_tx, AppState, WsCommand};
use serde::{Deserialize, Serialize};
use tauri::State;

// --- DTOs ---

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct AttachmentInfo {
    pub(crate) name: String,
    pub(crate) mime: String,
    pub(crate) data_b64: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ReactionInfo {
    pub(crate) emoji: String,
    pub(crate) count: i64,
    pub(crate) me: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ReplyContextInfo {
    pub(crate) message_id: String,
    pub(crate) sender: String,
    pub(crate) sender_name: Option<String>,
    pub(crate) content_preview: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct MessageInfo {
    pub(crate) id: String,
    pub(crate) channel_id: String,
    pub(crate) sender: String,
    pub(crate) sender_name: Option<String>,
    pub(crate) content: String,
    pub(crate) created_at: i64,
    #[serde(default)]
    pub(crate) edited_at: Option<i64>,
    #[serde(default)]
    pub(crate) attachments: Vec<AttachmentInfo>,
    #[serde(default)]
    pub(crate) reactions: Vec<ReactionInfo>,
    #[serde(default)]
    pub(crate) reply_to: Option<ReplyContextInfo>,
}

// --- Helpers ---

/// Minimal percent-encoder for emoji path segments. We can't add a new
/// crate dep just for this; this hand-rolled version covers the chars
/// that appear in real emoji strings.
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

// --- Tauri commands ---

#[tauri::command]
pub(crate) async fn get_messages(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<MessageInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let mut messages: Vec<MessageInfo> = client
        .get(format!("{hub_url}/channels/{channel_id}/messages"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))?;

    messages.reverse();
    Ok(messages)
}

#[tauri::command]
pub(crate) async fn add_reaction(
    channel_id: String,
    message_id: String,
    emoji: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!(
            "{hub_url}/channels/{channel_id}/messages/{message_id}/reactions"
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "emoji": emoji }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn remove_reaction(
    channel_id: String,
    message_id: String,
    emoji: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    // URL-encoding emoji is important since some are multi-byte and can
    // include reserved chars (variation selectors, etc.).
    let encoded = urlencoding_emoji(&emoji);
    let resp = client
        .delete(format!(
            "{hub_url}/channels/{channel_id}/messages/{message_id}/reactions/{encoded}"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
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
    let client = state.http_client.clone();
    // Server returns newest-first; we keep that order for the results panel
    // since users scanning search hits expect recent matches at the top.
    let messages: Vec<MessageInfo> = client
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
pub(crate) async fn send_message(
    channel_id: String,
    content: String,
    attachments: Option<Vec<AttachmentInfo>>,
    reply_to: Option<String>,
    state: State<'_, AppState>,
) -> Result<MessageInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let body = serde_json::json!({
        "content": content,
        "attachments": attachments.unwrap_or_default(),
        "reply_to": reply_to,
    });
    let resp = client
        .post(format!("{hub_url}/channels/{channel_id}/messages"))
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn edit_message(
    channel_id: String,
    message_id: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<MessageInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .patch(format!(
            "{hub_url}/channels/{channel_id}/messages/{message_id}"
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "content": content }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn delete_message(
    channel_id: String,
    message_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!(
            "{hub_url}/channels/{channel_id}/messages/{message_id}"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn set_dm_typing(
    conversation_id: String,
    typing: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let tx = active_ws_tx(&state)?;
    let _ = tx.send(WsCommand::DmTyping {
        conversation_id,
        typing,
    });
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
