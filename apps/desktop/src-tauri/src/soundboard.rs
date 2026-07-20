//! Soundboard: hub clip library proxy + mixing a clip into the active voice
//! session's outbound stream (soundboard.md §1). The actual decode/mix logic
//! lives in the `wavvon_voice::soundboard` module -- this file only proxies
//! the hub's HTTP routes and hands decoded PCM to whatever voice session is
//! currently running.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use tauri::State;

use crate::state::AppState;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct SoundboardClipInfo {
    pub id: String,
    pub name: String,
    pub emoji: Option<String>,
    pub uploader: String,
    pub size_bytes: i64,
    pub duration_ms: i64,
    pub created_at: i64,
}

#[tauri::command]
pub(crate) async fn soundboard_list_clips(
    state: State<'_, AppState>,
) -> Result<Vec<SoundboardClipInfo>, String> {
    let (hub_url, token) = crate::state::active_session(&state)?;
    let resp = state
        .http_client
        .get(format!("{hub_url}/soundboard"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

/// Fetches a clip's raw audio bytes as base64 -- used only by the admin
/// panel's preview player (a real `<audio>` element playing the file
/// as-is). The play-into-voice path (`soundboard_play_clip`) fetches and
/// decodes the same bytes itself; it never needs to hand them back to JS.
#[tauri::command]
pub(crate) async fn soundboard_fetch_audio(
    state: State<'_, AppState>,
    clip_id: String,
) -> Result<String, String> {
    let bytes = fetch_clip_bytes(&state, &clip_id).await?;
    Ok(B64.encode(bytes))
}

#[tauri::command]
pub(crate) async fn soundboard_upload_clip(
    state: State<'_, AppState>,
    name: String,
    emoji: Option<String>,
    audio_b64: String,
) -> Result<SoundboardClipInfo, String> {
    let (hub_url, token) = crate::state::active_session(&state)?;
    let bytes = B64
        .decode(audio_b64)
        .map_err(|e| format!("Bad audio data: {e}"))?;

    let mut form = reqwest::multipart::Form::new().text("name", name);
    if let Some(e) = emoji {
        form = form.text("emoji", e);
    }
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name("clip.ogg")
        .mime_str("audio/ogg")
        .map_err(|e| e.to_string())?;
    form = form.part("audio", part);

    let resp = state
        .http_client
        .post(format!("{hub_url}/soundboard"))
        .bearer_auth(&token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn soundboard_delete_clip(
    state: State<'_, AppState>,
    clip_id: String,
) -> Result<(), String> {
    let (hub_url, token) = crate::state::active_session(&state)?;
    let resp = state
        .http_client
        .delete(format!("{hub_url}/soundboard/{clip_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

async fn fetch_clip_bytes(state: &State<'_, AppState>, clip_id: &str) -> Result<Vec<u8>, String> {
    let (hub_url, token) = crate::state::active_session(state)?;
    let resp = state
        .http_client
        .get(format!("{hub_url}/soundboard/{clip_id}/audio"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    let bytes = resp.bytes().await.map_err(|e| format!("Read error: {e}"))?;
    Ok(bytes.to_vec())
}

/// Fetches, decodes, and mixes a clip into the active voice session's
/// outbound stream. Requires an active voice session (mirrors the web
/// client's rule that soundboard playback only makes sense while your mic
/// is live going out to a channel) -- errors clearly instead of silently
/// no-opping if there isn't one.
#[tauri::command]
pub(crate) async fn soundboard_play_clip(
    state: State<'_, AppState>,
    clip_id: String,
    channel_id: String,
) -> Result<(), String> {
    let (active_clip_slot, opus_rate) = {
        let voice = state.voice.lock().unwrap();
        let session = voice.as_ref().ok_or("Not in a voice channel")?;
        (session.active_clip.clone(), session.opus_rate)
    };

    let bytes = fetch_clip_bytes(&state, &clip_id).await?;
    let pcm_48k =
        tokio::task::spawn_blocking(move || wavvon_voice::soundboard::decode_ogg_opus_clip(&bytes))
            .await
            .map_err(|e| format!("Decode task panicked: {e}"))?
            .map_err(|e| format!("Failed to decode clip audio: {e}"))?;
    let resampled = wavvon_voice::soundboard::resample_linear(&pcm_48k, 48_000, opus_rate);

    *active_clip_slot.lock().unwrap() = Some(wavvon_voice::soundboard::ActiveClip {
        samples: resampled,
        pos: 0,
    });

    // Attribution event only (soundboard.md §1) -- best-effort, mirrors the
    // web client not blocking playback on it.
    let (hub_url, token) = crate::state::active_session(&state)?;
    let _ = state
        .http_client
        .post(format!("{hub_url}/soundboard/{clip_id}/played"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "channel_id": channel_id }))
        .send()
        .await;

    Ok(())
}

/// Stops whatever soundboard clip is currently mixing into the outbound
/// stream, if any. A no-op (not an error) when nothing is playing or there
/// is no active voice session.
#[tauri::command]
pub(crate) fn soundboard_stop(state: State<'_, AppState>) -> Result<(), String> {
    if let Some(session) = state.voice.lock().unwrap().as_ref() {
        *session.active_clip.lock().unwrap() = None;
    }
    Ok(())
}
