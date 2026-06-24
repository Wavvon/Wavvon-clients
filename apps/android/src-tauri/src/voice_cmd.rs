use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

pub(crate) struct VoiceSession {
    channel_id: String,
    stop_tx: std::sync::mpsc::Sender<()>,
    muted: Arc<AtomicBool>,
    deafened: Arc<AtomicBool>,
    gain_map: Arc<tokio::sync::RwLock<HashMap<u16, f32>>>,
    roster_map: Arc<tokio::sync::RwLock<HashMap<u16, String>>>,
    udp_reg_token: Arc<Mutex<Option<String>>>,
}

pub(crate) struct VoiceState {
    pub session: Mutex<Option<VoiceSession>>,
}

impl VoiceState {
    pub fn new() -> Self {
        Self {
            session: Mutex::new(None),
        }
    }
}

#[derive(serde::Serialize)]
pub(crate) struct AudioDeviceList {
    inputs: Vec<String>,
    outputs: Vec<String>,
}

/// Start the audio pipeline. Returns the local UDP port so TypeScript can
/// send the `voice_join` WS message with the correct port.
#[tauri::command]
pub(crate) async fn voice_join(
    hub_addr: String,
    channel_id: String,
    state: State<'_, VoiceState>,
    app: AppHandle,
) -> Result<u16, String> {
    if state.session.lock().unwrap().is_some() {
        return Err("Already in a voice channel".to_string());
    }

    let addr: std::net::SocketAddr = tokio::net::lookup_host(&hub_addr)
        .await
        .map_err(|e| format!("Cannot resolve {hub_addr}: {e}"))?
        .next()
        .ok_or_else(|| format!("No addresses for {hub_addr}"))?;

    type VoiceReady = Result<
        (
            u16,
            Arc<AtomicBool>,
            Arc<AtomicBool>,
            Arc<tokio::sync::RwLock<HashMap<u16, f32>>>,
            Arc<tokio::sync::RwLock<HashMap<u16, String>>>,
            Arc<Mutex<Option<String>>>,
        ),
        String,
    >;
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<VoiceReady>();
    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();

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
            let vsettings = voxply_voice::VoiceSettings::default();
            let mut pipeline = match voxply_voice::AudioPipeline::start_p2p_with_settings(
                0, addr, vsettings,
            )
            .await
            {
                Ok(p) => p,
                Err(e) => {
                    let _ = ready_tx.send(Err(format!("Audio: {e}")));
                    return;
                }
            };

            let local_port = pipeline.local_udp_port;
            let muted = pipeline.muted.clone();
            let deafened = pipeline.deafened.clone();
            let gain_map = pipeline.gain_map.clone();
            let roster_map = pipeline.roster_map.clone();
            let udp_reg_token = pipeline.udp_reg_token.clone();
            let _ = ready_tx.send(Ok((
                local_port,
                muted,
                deafened,
                gain_map,
                roster_map,
                udp_reg_token,
            )));

            let speaking_rx = pipeline.speaking_rx.take();
            let speaking_task = tokio::spawn(async move {
                let Some(mut rx) = speaking_rx else { return };
                while let Some(speaking) = rx.recv().await {
                    let _ = speaking_app.emit(
                        "voice-self-speaking",
                        serde_json::json!({
                            "speaking": speaking,
                            "channel_id": speaking_channel_id,
                        }),
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

            let _ = tokio::task::spawn_blocking(move || stop_rx.recv()).await;
            speaking_task.abort();
            level_task.abort();
            pipeline.stop().await;
        });
    });

    let (local_port, muted, deafened, gain_map, roster_map, udp_reg_token) = ready_rx
        .recv()
        .map_err(|_| "Voice thread died".to_string())??;

    *state.session.lock().unwrap() = Some(VoiceSession {
        channel_id,
        stop_tx,
        muted,
        deafened,
        gain_map,
        roster_map,
        udp_reg_token,
    });

    Ok(local_port)
}

/// Called by TypeScript when the hub sends a `voice_joined` WS event with
/// `udp_register_token`. The pipeline's registration loop picks this up and
/// starts sending VXRG packets.
#[tauri::command]
pub(crate) fn voice_set_reg_token(
    token: String,
    state: State<'_, VoiceState>,
) -> Result<(), String> {
    if let Some(s) = state.session.lock().unwrap().as_ref() {
        *s.udp_reg_token.lock().unwrap() = Some(token);
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn voice_leave(state: State<'_, VoiceState>) -> Result<(), String> {
    let session = state.session.lock().unwrap().take();
    if let Some(s) = session {
        let _ = s.stop_tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn voice_set_muted(muted: bool, state: State<'_, VoiceState>) -> Result<(), String> {
    if let Some(s) = state.session.lock().unwrap().as_ref() {
        s.muted.store(muted, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn voice_set_deafened(
    deafened: bool,
    state: State<'_, VoiceState>,
) -> Result<(), String> {
    if let Some(s) = state.session.lock().unwrap().as_ref() {
        s.deafened.store(deafened, Ordering::Relaxed);
        if deafened {
            s.muted.store(true, Ordering::Relaxed);
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
pub(crate) fn mic_test_start(state: State<'_, VoiceState>, app: AppHandle) -> Result<(), String> {
    if state.session.lock().unwrap().is_some() {
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
            let vsettings = voxply_voice::VoiceSettings::default();
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

    *state.session.lock().unwrap() = Some(VoiceSession {
        channel_id: "__mic_test__".to_string(),
        stop_tx,
        muted: Arc::new(AtomicBool::new(false)),
        deafened: Arc::new(AtomicBool::new(false)),
        gain_map: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
        roster_map: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
        udp_reg_token: Arc::new(Mutex::new(None)),
    });

    Ok(())
}

#[tauri::command]
pub(crate) fn mic_test_stop(state: State<'_, VoiceState>) -> Result<(), String> {
    let mut lock = state.session.lock().unwrap();
    if let Some(s) = lock.as_ref() {
        if s.channel_id == "__mic_test__" {
            let session = lock.take().unwrap();
            let _ = session.stop_tx.send(());
            return Ok(());
        }
        return Err("No mic test in progress".to_string());
    }
    Ok(())
}
