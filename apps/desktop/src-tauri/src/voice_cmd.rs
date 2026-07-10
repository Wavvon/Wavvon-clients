use crate::local_store::{load_voice_gains, load_voice_settings, save_voice_gains_to_disk};
use crate::state::{active_ws_tx, AppState, VoiceSession, WsCommand, ZoneInfo};
use crate::types::AudioDeviceList;
use crate::ws::recompute_proximity_gains;
use tauri::{AppHandle, Emitter, State};

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
            std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<u16, f32>>>,
            std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<u16, String>>>,
            std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, ZoneInfo>>>,
            std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, Vec<f64>>>>,
            std::sync::Arc<std::sync::Mutex<Option<String>>>,
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
            let vsettings = wavvon_voice::VoiceSettings {
                input_device: saved.input_device,
                output_device: saved.output_device,
                vad_threshold: saved.vad_threshold,
                audio_profile: match saved.audio_profile.as_deref() {
                    Some("music") => wavvon_voice::AudioProfile::Music,
                    Some("custom") => wavvon_voice::AudioProfile::Custom,
                    _ => wavvon_voice::AudioProfile::Standard,
                },
                custom_bitrate: saved.custom_bitrate,
                custom_app: saved.custom_app,
                custom_noise_suppress: saved.custom_noise_suppress,
                custom_vad: saved.custom_vad,
                custom_vad_threshold: saved.custom_vad_threshold,
                custom_channels: saved.custom_channels,
                custom_frame_ms: saved.custom_frame_ms,
                custom_complexity: saved.custom_complexity,
            };
            let mut pipeline =
                match wavvon_voice::AudioPipeline::start_p2p_with_settings(0, hub_addr, vsettings)
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
            let gain_map = pipeline.gain_map.clone();
            let roster_map = pipeline.roster_map.clone();
            let udp_reg_token = pipeline.udp_reg_token.clone();
            let voice_zones =
                std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::<
                    String,
                    ZoneInfo,
                >::new()));
            let my_position =
                std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::<
                    String,
                    Vec<f64>,
                >::new()));
            let _ = ready_tx.send(Ok((
                local_port,
                muted_arc,
                deafened_arc,
                gain_map,
                roster_map,
                voice_zones,
                my_position,
                udp_reg_token,
            )));

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

            let level_rx = pipeline.level_rx.take();
            let level_app = app.clone();
            let level_task = tokio::spawn(async move {
                let Some(mut rx) = level_rx else { return };
                while let Some(level) = rx.recv().await {
                    let _ = level_app.emit("mic-level", level);
                }
            });

            let whisper_rx = pipeline.whisper_rx.take();
            let whisper_app = app.clone();
            let whisper_roster = pipeline.roster_map.clone();
            let whisper_task = tokio::spawn(async move {
                let Some(mut rx) = whisper_rx else { return };
                while let Some((sender_id, is_whisper)) = rx.recv().await {
                    let pubkey = {
                        let rm = whisper_roster.read().await;
                        rm.get(&sender_id).cloned().unwrap_or_default()
                    };
                    if !pubkey.is_empty() {
                        let _ = whisper_app.emit(
                            "voice-whisper-receiving",
                            serde_json::json!({
                                "sender_pubkey": pubkey,
                                "is_whisper": is_whisper,
                            }),
                        );
                    }
                }
            });

            let _ = tokio::task::spawn_blocking(move || stop_rx.recv()).await;
            speaking_task.abort();
            level_task.abort();
            whisper_task.abort();
            pipeline.stop().await;
        });
    });

    let (
        local_port,
        muted,
        deafened,
        gain_map,
        roster_map,
        voice_zones,
        my_position,
        udp_reg_token,
    ) = ready_rx
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
        gain_map,
        roster_map,
        voice_zones,
        my_position,
        udp_reg_token,
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
    let inputs = wavvon_voice::devices::list_input_devices().map_err(|e| format!("inputs: {e}"))?;
    let outputs =
        wavvon_voice::devices::list_output_devices().map_err(|e| format!("outputs: {e}"))?;
    Ok(AudioDeviceList { inputs, outputs })
}

#[tauri::command]
pub(crate) fn set_voice_gain(
    public_key: String,
    gain: f32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let gain = gain.clamp(0.0, 2.0);
    let mut stored = load_voice_gains();
    if (gain - 1.0f32).abs() < 0.001 {
        stored.remove(&public_key);
    } else {
        stored.insert(public_key.clone(), gain);
    }
    save_voice_gains_to_disk(&stored);

    let session_data = {
        let lock = state.voice.lock().unwrap();
        lock.as_ref()
            .map(|s| (s.roster_map.clone(), s.gain_map.clone()))
    };
    if let Some((roster_map, gain_map)) = session_data {
        let pk = public_key.clone();
        tokio::spawn(async move {
            let rm = roster_map.read().await;
            for (&sid, pubkey) in rm.iter() {
                if pubkey == &pk {
                    let mut gm = gain_map.write().await;
                    gm.insert(sid, gain);
                    break;
                }
            }
        });
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn set_voice_position(
    zone_id: String,
    position: Vec<f64>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let session_data = state.voice.lock().unwrap().as_ref().map(|s| {
        (
            s.voice_zones.clone(),
            s.my_position.clone(),
            s.roster_map.clone(),
            s.gain_map.clone(),
        )
    });
    if let Some((voice_zones, my_pos, roster_map, gain_map)) = session_data {
        my_pos
            .lock()
            .unwrap()
            .insert(zone_id.clone(), position.clone());
        recompute_proximity_gains(
            &voice_zones,
            &my_pos,
            &roster_map,
            &gain_map,
            &load_voice_gains(),
        );
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn send_hub_ws_raw(payload: String, state: State<'_, AppState>) -> Result<(), String> {
    let tx = active_ws_tx(&state)?;
    tx.send(WsCommand::Raw(payload))
        .map_err(|_| "WS closed".to_string())
}

/// Send a raw WS payload to one specific hub session (not the active one) —
/// used to re-apply presence to a hub that just (re)connected.
#[tauri::command]
pub(crate) fn send_hub_ws_raw_to(
    hub_id: String,
    payload: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let tx = {
        let hubs = state.hubs.lock().unwrap();
        let s = hubs.get(&hub_id).ok_or("Hub not connected")?;
        s.ws_tx.clone()
    };
    tx.send(WsCommand::Raw(payload))
        .map_err(|_| "WS closed".to_string())
}

/// Send a raw WS payload to every connected hub session — presence is
/// global across hubs, so the status picker broadcasts.
#[tauri::command]
pub(crate) fn send_all_hubs_ws_raw(
    payload: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let txs: Vec<_> = {
        let hubs = state.hubs.lock().unwrap();
        hubs.values().map(|s| s.ws_tx.clone()).collect()
    };
    for tx in txs {
        // A closed session shouldn't stop the rest — its task is ending anyway.
        let _ = tx.send(WsCommand::Raw(payload.clone()));
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn mic_test_start(state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
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
            let vsettings = wavvon_voice::VoiceSettings {
                input_device: saved.input_device,
                output_device: saved.output_device,
                vad_threshold: saved.vad_threshold,
                audio_profile: match saved.audio_profile.as_deref() {
                    Some("music") => wavvon_voice::AudioProfile::Music,
                    Some("custom") => wavvon_voice::AudioProfile::Custom,
                    _ => wavvon_voice::AudioProfile::Standard,
                },
                custom_bitrate: saved.custom_bitrate,
                custom_app: saved.custom_app,
                custom_noise_suppress: saved.custom_noise_suppress,
                custom_vad: saved.custom_vad,
                custom_vad_threshold: saved.custom_vad_threshold,
                custom_channels: saved.custom_channels,
                custom_frame_ms: saved.custom_frame_ms,
                custom_complexity: saved.custom_complexity,
            };
            let mut pipeline =
                match wavvon_voice::AudioPipeline::start_loopback_with_settings(vsettings).await {
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

    *state.voice.lock().unwrap() = Some(VoiceSession {
        channel_id: "__mic_test__".to_string(),
        hub_id: String::new(),
        stop_tx,
        muted: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        deafened: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        gain_map: std::sync::Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new())),
        roster_map: std::sync::Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new())),
        voice_zones: std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        my_position: std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        udp_reg_token: std::sync::Arc::new(std::sync::Mutex::new(None)),
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
            *state.voice.lock().unwrap() = Some(s);
            return Err("No mic test in progress".to_string());
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn voice_populations(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, u32>, String> {
    let (hub_url, token) = crate::state::active_session(&state)?;
    let resp = state
        .http_client
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

#[tauri::command]
pub(crate) async fn voice_channel_participants(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, Vec<crate::types::VoiceParticipantInfo>>, String> {
    let (hub_url, token) = crate::state::active_session(&state)?;
    let resp = state
        .http_client
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
    let (hub_url, token) = crate::state::active_session(&state)?;
    let resp = state
        .http_client
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

// ---------------------------------------------------------------------------
// Whisper lists
// ---------------------------------------------------------------------------

fn whisper_lists_path(hub_id: &str) -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home
        .join(".wavvon")
        .join(format!("whisper_lists_{hub_id}.json")))
}

#[derive(serde::Deserialize)]
pub(crate) struct WhisperTargetParam {
    #[serde(rename = "type")]
    target_type: String,
    id: String,
}

#[tauri::command]
pub(crate) fn start_whisper(
    targets: Vec<WhisperTargetParam>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let payload = serde_json::json!({
        "type": "voice_whisper_start",
        "targets": targets.iter().map(|t| serde_json::json!({ "type": t.target_type, "id": t.id })).collect::<Vec<_>>(),
    });
    let tx = active_ws_tx(&state)?;
    let _ = tx.send(WsCommand::Raw(serde_json::to_string(&payload).unwrap()));
    Ok(())
}

#[tauri::command]
pub(crate) fn stop_whisper(state: State<'_, AppState>) -> Result<(), String> {
    let tx = active_ws_tx(&state)?;
    let _ = tx.send(WsCommand::Raw(
        r#"{"type":"voice_whisper_stop"}"#.to_string(),
    ));
    Ok(())
}

#[tauri::command]
pub(crate) fn load_whisper_lists(hub_id: String) -> Result<serde_json::Value, String> {
    let path = whisper_lists_path(&hub_id)?;
    if !path.exists() {
        return Ok(serde_json::json!([]));
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn save_whisper_lists(hub_id: String, lists: serde_json::Value) -> Result<(), String> {
    let path = whisper_lists_path(&hub_id)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let text = serde_json::to_string(&lists).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())
}
