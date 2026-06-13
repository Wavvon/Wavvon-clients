use crate::prefs::{load_voice_settings, save_voice_settings_to_disk};
use crate::state::{
    active_session, AppState, AudioDeviceList, StoredVoiceSettings, VoiceSession, WsCommand,
};
use tauri::{AppHandle, Emitter, State};

// --- Tauri commands ---

#[tauri::command]
pub(crate) async fn voice_populations(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, u32>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/voice/populations"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

/// Returns voice participants grouped by channel id, with display_name
/// populated from the local users table on the hub. Lets the sidebar render
/// participant names nested under each voice-active channel rather than just
/// a count. Reuses the existing VoiceParticipantInfo struct.
#[tauri::command]
pub(crate) async fn voice_channel_participants(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, Vec<crate::ws::VoiceParticipantInfo>>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/voice/participants"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn voice_active_users(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/voice/active-users"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn voice_join(
    channel_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if state.voice.lock().unwrap().is_some() {
        return Err("Already in a voice channel".to_string());
    }

    let (active_id, hub_url, ws_tx) = {
        let active_id = state
            .active_hub
            .lock()
            .unwrap()
            .clone()
            .ok_or("No active hub")?;
        let hubs = state.hubs.lock().unwrap();
        let s = hubs.get(&active_id).ok_or("Hub not connected")?;
        (active_id, s.hub_url.clone(), s.ws_tx.clone())
    };

    let host = hub_url
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("127.0.0.1")
        .to_string();

    // Resolve the hostname (works for both "localhost" and raw IPs).
    let hub_addr = tokio::net::lookup_host(format!("{host}:3001"))
        .await
        .map_err(|e| format!("Cannot resolve {host}: {e}"))?
        .next()
        .ok_or_else(|| format!("No addresses for {host}"))?;

    type VoiceReady = Result<
        (
            u16,
            std::sync::Arc<std::sync::atomic::AtomicBool>,
            std::sync::Arc<std::sync::atomic::AtomicBool>,
        ),
        String,
    >;
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<VoiceReady>();
    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();

    let speaking_ws = ws_tx.clone();
    let speaking_channel_id = channel_id.clone();
    let speaking_app = app.clone();

    std::thread::spawn(move || {
        let rt = match tokio::runtime::Runtime::new() {
            Ok(r) => r,
            Err(e) => {
                let _ = ready_tx.send(Err(format!("Runtime: {e}")));
                return;
            }
        };

        rt.block_on(async move {
            let saved = load_voice_settings();
            let vsettings = voxply_voice::VoiceSettings {
                input_device: saved.input_device,
                output_device: saved.output_device,
                vad_threshold: saved.vad_threshold,
                ..voxply_voice::VoiceSettings::default()
            };
            let mut pipeline =
                match voxply_voice::AudioPipeline::start_p2p_with_settings(0, hub_addr, vsettings)
                    .await
                {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = ready_tx.send(Err(format!("Audio: {e}")));
                        return;
                    }
                };

            let local_port = pipeline.local_udp_port;
            let muted_arc = pipeline.muted.clone();
            let deafened_arc = pipeline.deafened.clone();
            let _ = ready_tx.send(Ok((local_port, muted_arc, deafened_arc)));

            // Forward speaking state from the VAD to the hub WS and emit a
            // local Tauri event so the current user's own chip can pulse too.
            let speaking_rx = pipeline.speaking_rx.take();
            let speaking_task = tokio::spawn(async move {
                let Some(mut rx) = speaking_rx else { return };
                while let Some(speaking) = rx.recv().await {
                    let _ = speaking_ws.send(WsCommand::VoiceSpeaking {
                        channel_id: speaking_channel_id.clone(),
                        speaking,
                    });
                    let _ = speaking_app.emit(
                        "voice-self-speaking",
                        serde_json::json!({ "speaking": speaking }),
                    );
                }
            });

            // Forward live mic RMS level so the UI can draw a level meter.
            let level_rx = pipeline.level_rx.take();
            let level_app = app.clone();
            let level_task = tokio::spawn(async move {
                let Some(mut rx) = level_rx else { return };
                while let Some(level) = rx.recv().await {
                    let _ = level_app.emit("mic-level", level);
                }
            });

            let _ = tokio::task::spawn_blocking(move || stop_rx.recv()).await;
            speaking_task.abort();
            level_task.abort();
            pipeline.stop().await;
        });
    });

    let (local_port, muted, deafened) = ready_rx
        .recv()
        .map_err(|_| "Voice thread died".to_string())??;

    ws_tx
        .send(WsCommand::VoiceJoin {
            channel_id: channel_id.clone(),
            udp_port: local_port,
        })
        .map_err(|_| "WS closed".to_string())?;

    *state.voice.lock().unwrap() = Some(VoiceSession {
        channel_id,
        hub_id: active_id,
        stop_tx,
        muted,
        deafened,
    });

    Ok(())
}

#[tauri::command]
pub(crate) fn voice_set_muted(muted: bool, state: State<'_, AppState>) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    if let Some(s) = state.voice.lock().unwrap().as_ref() {
        s.muted.store(muted, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn voice_set_deafened(deafened: bool, state: State<'_, AppState>) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    if let Some(s) = state.voice.lock().unwrap().as_ref() {
        // Deafen also mutes -- you can't talk over a one-way wall. Storing
        // both lets the user un-deafen back to whatever mute state they had.
        s.deafened.store(deafened, Ordering::Relaxed);
        if deafened {
            s.muted.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn voice_leave(state: State<'_, AppState>) -> Result<(), String> {
    let session = state.voice.lock().unwrap().take();
    if let Some(s) = session {
        let _ = s.stop_tx.send(());
        let hubs = state.hubs.lock().unwrap();
        if let Some(hub) = hubs.get(&s.hub_id) {
            let _ = hub.ws_tx.send(WsCommand::VoiceLeave {
                channel_id: s.channel_id,
            });
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn list_audio_devices() -> Result<AudioDeviceList, String> {
    let inputs = voxply_voice::devices::list_input_devices().map_err(|e| format!("inputs: {e}"))?;
    let outputs =
        voxply_voice::devices::list_output_devices().map_err(|e| format!("outputs: {e}"))?;
    Ok(AudioDeviceList { inputs, outputs })
}

#[tauri::command]
pub(crate) fn get_voice_settings() -> StoredVoiceSettings {
    load_voice_settings()
}

#[tauri::command]
pub(crate) fn save_voice_settings(settings: StoredVoiceSettings) -> Result<(), String> {
    save_voice_settings_to_disk(&settings)
}

#[tauri::command]
pub(crate) fn mic_test_start(state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    // Reuse the voice session slot so we don't collide with an in-progress call.
    if state.voice.lock().unwrap().is_some() {
        return Err("Leave the voice channel before testing the mic".to_string());
    }

    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
    let level_app = app.clone();

    std::thread::spawn(move || {
        let rt = match tokio::runtime::Runtime::new() {
            Ok(r) => r,
            Err(e) => {
                let _ = ready_tx.send(Err(format!("Runtime: {e}")));
                return;
            }
        };
        rt.block_on(async move {
            let saved = load_voice_settings();
            let vsettings = voxply_voice::VoiceSettings {
                input_device: saved.input_device,
                output_device: saved.output_device,
                vad_threshold: saved.vad_threshold,
                ..voxply_voice::VoiceSettings::default()
            };
            let mut pipeline =
                match voxply_voice::AudioPipeline::start_loopback_with_settings(vsettings).await {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = ready_tx.send(Err(format!("Audio: {e}")));
                        return;
                    }
                };
            let _ = ready_tx.send(Ok(()));

            let level_rx = pipeline.level_rx.take();
            let level_task = tokio::spawn(async move {
                let Some(mut rx) = level_rx else { return };
                while let Some(level) = rx.recv().await {
                    let _ = level_app.emit("mic-level", level);
                }
            });

            let _ = tokio::task::spawn_blocking(move || stop_rx.recv()).await;
            level_task.abort();
            pipeline.stop().await;
        });
    });

    ready_rx
        .recv()
        .map_err(|_| "Mic test thread died".to_string())??;

    // Stash the stop channel inside a dummy VoiceSession so mic_test_stop can close it.
    *state.voice.lock().unwrap() = Some(VoiceSession {
        channel_id: "__mic_test__".to_string(),
        hub_id: String::new(),
        stop_tx,
        muted: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        deafened: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    });

    Ok(())
}

#[tauri::command]
pub(crate) fn mic_test_stop(state: State<'_, AppState>) -> Result<(), String> {
    let session = state.voice.lock().unwrap().take();
    if let Some(s) = session {
        if s.channel_id == "__mic_test__" {
            let _ = s.stop_tx.send(());
            return Ok(());
        } else {
            // Put it back if it wasn't a mic test.
            *state.voice.lock().unwrap() = Some(s);
            return Err("No mic test in progress".to_string());
        }
    }
    Ok(())
}
