use crate::local_store::load_voice_gains;
use crate::state::{AppState, WsCommand, ZoneInfo};
use crate::types::{AttenuationConfigInfo, WsServerMessage};
use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message as WsMessage;

pub(crate) async fn spawn_ws_task(
    hub_id: String,
    hub_url: String,
    token: String,
    app: AppHandle,
) -> Result<(mpsc::UnboundedSender<WsCommand>, JoinHandle<()>), String> {
    let ws_url = hub_url
        .replace("http://", "ws://")
        .replace("https://", "wss://");
    let url = format!("{ws_url}/ws?token={token}");

    let (ws_stream, _) = tokio_tungstenite::connect_async(&url)
        .await
        .map_err(|e| format!("WebSocket connect failed: {e}"))?;

    let (mut ws_tx, mut ws_rx) = ws_stream.split();
    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<WsCommand>();
    let hub_id_for_task = hub_id.clone();

    let _ = app.emit(
        "hub-ws-status",
        serde_json::json!({ "hub_id": hub_id_for_task, "connected": true }),
    );

    let status_app = app.clone();
    let status_hub_id = hub_id_for_task.clone();
    let task = tokio::spawn(async move {
        loop {
            tokio::select! {
                maybe_msg = ws_rx.next() => {
                    match maybe_msg {
                        Some(Ok(WsMessage::Text(text))) => {
                            if let Ok(server_msg) = serde_json::from_str::<WsServerMessage>(&text) {
                                match server_msg {
                                    WsServerMessage::ChatMessage { channel_id, message } => {
                                        let _ = app.emit("chat-message", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "message": message,
                                        }));
                                    }
                                    WsServerMessage::MessageEdited { channel_id, message } => {
                                        let _ = app.emit("chat-message-edited", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "message": message,
                                        }));
                                    }
                                    WsServerMessage::MessageDeleted { channel_id, message_id } => {
                                        let _ = app.emit("chat-message-deleted", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "message_id": message_id,
                                        }));
                                    }
                                    WsServerMessage::ReactionsUpdated { channel_id, message_id, reactions } => {
                                        let _ = app.emit("chat-reactions-updated", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "message_id": message_id,
                                            "reactions": reactions,
                                        }));
                                    }
                                    WsServerMessage::Typing { channel_id, public_key, display_name, typing } => {
                                        let _ = app.emit("chat-typing", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "public_key": public_key,
                                            "display_name": display_name,
                                            "typing": typing,
                                        }));
                                    }
                                    WsServerMessage::MemberStatus { public_key, status, custom } => {
                                        let _ = app.emit("member-status", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "public_key": public_key,
                                            "status": status,
                                            "custom": custom,
                                        }));
                                    }
                                    WsServerMessage::VoiceMove { target_channel_id, target_channel_name, source_channel_id, event_id, auto } => {
                                        let _ = app.emit("voice-move", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "target_channel_id": target_channel_id,
                                            "target_channel_name": target_channel_name,
                                            "source_channel_id": source_channel_id,
                                            "event_id": event_id,
                                            "auto": auto,
                                        }));
                                    }
                                    WsServerMessage::VoiceJoined { channel_id, hub_udp_port, participants, udp_register_token } => {
                                        // If the hub sent a registration token, hand it to the
                                        // running pipeline so the VXRG loop can begin. The pipeline
                                        // lives in AppState::voice; we grab just the Arc we need.
                                        if let Some(token) = udp_register_token {
                                            let token_arc = {
                                                let app_state = app.state::<AppState>();
                                                let lock = app_state.voice.lock().unwrap();
                                                lock.as_ref().map(|s| s.udp_reg_token.clone())
                                            };
                                            if let Some(arc) = token_arc {
                                                *arc.lock().unwrap() = Some(token);
                                            }
                                        }
                                        let _ = app.emit("voice-joined", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "hub_udp_port": hub_udp_port,
                                            "participants": participants,
                                        }));
                                    }
                                    WsServerMessage::VoiceParticipantJoined { channel_id, participant } => {
                                        let _ = app.emit("voice-participant-joined", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "participant": participant,
                                        }));
                                    }
                                    WsServerMessage::VoiceParticipantLeft { channel_id, public_key } => {
                                        let _ = app.emit("voice-participant-left", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "public_key": public_key,
                                        }));
                                    }
                                    WsServerMessage::VoiceParticipantSpeaking { channel_id, public_key, speaking } => {
                                        let _ = app.emit("voice-participant-speaking", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "public_key": public_key,
                                            "speaking": speaking,
                                        }));
                                    }
                                    WsServerMessage::Error { context, message } => {
                                        let _ = app.emit("hub-error", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "context": context,
                                            "message": message,
                                        }));
                                    }
                                    WsServerMessage::DirectMessage { conversation_id, sender, sender_name, content, timestamp } => {
                                        let _ = app.emit("dm", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "conversation_id": conversation_id,
                                            "sender": sender,
                                            "sender_name": sender_name,
                                            "content": content,
                                            "timestamp": timestamp,
                                        }));
                                    }
                                    WsServerMessage::DmTyping { conversation_id, sender, sender_name, typing } => {
                                        let _ = app.emit("dm-typing", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "conversation_id": conversation_id,
                                            "sender": sender,
                                            "sender_name": sender_name,
                                            "typing": typing,
                                        }));
                                    }
                                    WsServerMessage::DmMemberChanged { conversation_id, added, removed } => {
                                        let _ = app.emit("dm-member-changed", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "conversation_id": conversation_id,
                                            "added": added,
                                            "removed": removed,
                                        }));
                                    }
                                    WsServerMessage::VoiceRosterUpdate { channel_id, participants } => {
                                        let maps: crate::state::VoiceRosterMaps = {
                                            let app_state = app.state::<AppState>();
                                            let lock = app_state.voice.lock().unwrap();
                                            lock.as_ref()
                                                .filter(|s| s.channel_id == channel_id)
                                                .map(|s| (s.gain_map.clone(), s.roster_map.clone()))
                                        };
                                        if let Some((gain_map, roster_map)) = maps {
                                            let stored_gains = load_voice_gains();
                                            let participants_clone = participants.clone();
                                            tokio::spawn(async move {
                                                let mut rm = roster_map.write().await;
                                                let mut gm = gain_map.write().await;
                                                rm.clear();
                                                for p in &participants_clone {
                                                    rm.insert(p.sender_id, p.public_key.clone());
                                                    let gain = stored_gains
                                                        .get(&p.public_key)
                                                        .copied()
                                                        .unwrap_or(1.0);
                                                    gm.entry(p.sender_id).or_insert(gain);
                                                }
                                            });
                                        }
                                        let _ = app.emit("voice-roster-update", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "participants": participants,
                                        }));
                                    }
                                    WsServerMessage::VoiceZoneState { zones, .. } => {
                                        let session_data = {
                                            let app_state = app.state::<AppState>();
                                            let lock = app_state.voice.lock().unwrap();
                                            lock.as_ref().map(|s| (
                                                s.voice_zones.clone(),
                                                s.my_position.clone(),
                                                s.roster_map.clone(),
                                                s.gain_map.clone(),
                                            ))
                                        };
                                        if let Some((voice_zones, my_pos, roster_map, gain_map)) = session_data {
                                            {
                                                let mut zmap = voice_zones.lock().unwrap();
                                                zmap.clear();
                                                for z in &zones {
                                                    zmap.insert(z.zone_id.clone(), ZoneInfo {
                                                        zone_id: z.zone_id.clone(),
                                                        coordinate_system: z.coordinate_system.clone(),
                                                        attenuation: z.attenuation.clone(),
                                                        positions: z.positions.clone(),
                                                    });
                                                }
                                            }
                                            recompute_proximity_gains(&voice_zones, &my_pos, &roster_map, &gain_map, &load_voice_gains());
                                        }
                                        let _ = app.emit("voice-zone-state", serde_json::json!({ "hub_id": hub_id_for_task, "zones": zones }));
                                    }
                                    WsServerMessage::VoiceZoneCreated { zone_id, coordinate_system, attenuation, .. } => {
                                        let session_data = {
                                            let app_state = app.state::<AppState>();
                                            let lock = app_state.voice.lock().unwrap();
                                            lock.as_ref().map(|s| s.voice_zones.clone())
                                        };
                                        if let Some(voice_zones) = session_data {
                                            voice_zones.lock().unwrap().insert(zone_id.clone(), ZoneInfo {
                                                zone_id: zone_id.clone(),
                                                coordinate_system: coordinate_system.clone(),
                                                attenuation: attenuation.clone(),
                                                positions: std::collections::HashMap::new(),
                                            });
                                        }
                                        let _ = app.emit("voice-zone-created", serde_json::json!({ "hub_id": hub_id_for_task, "zone_id": zone_id }));
                                    }
                                    WsServerMessage::VoiceZoneDestroyed { zone_id, .. } => {
                                        let session_data = {
                                            let app_state = app.state::<AppState>();
                                            let lock = app_state.voice.lock().unwrap();
                                            lock.as_ref().map(|s| (
                                                s.voice_zones.clone(),
                                                s.my_position.clone(),
                                                s.roster_map.clone(),
                                                s.gain_map.clone(),
                                            ))
                                        };
                                        if let Some((voice_zones, my_pos, roster_map, gain_map)) = session_data {
                                            voice_zones.lock().unwrap().remove(&zone_id);
                                            recompute_proximity_gains(&voice_zones, &my_pos, &roster_map, &gain_map, &load_voice_gains());
                                        }
                                        let _ = app.emit("voice-zone-destroyed", serde_json::json!({ "hub_id": hub_id_for_task, "zone_id": zone_id }));
                                    }
                                    WsServerMessage::VoicePositionUpdated { zone_id, pubkey, position, .. } => {
                                        let session_data = {
                                            let app_state = app.state::<AppState>();
                                            let lock = app_state.voice.lock().unwrap();
                                            lock.as_ref().map(|s| (
                                                s.voice_zones.clone(),
                                                s.my_position.clone(),
                                                s.roster_map.clone(),
                                                s.gain_map.clone(),
                                            ))
                                        };
                                        if let Some((voice_zones, my_pos, roster_map, gain_map)) = session_data {
                                            {
                                                let mut zmap = voice_zones.lock().unwrap();
                                                if let Some(zone) = zmap.get_mut(&zone_id) {
                                                    zone.positions.insert(pubkey.clone(), position.clone());
                                                }
                                            }
                                            recompute_proximity_gains(&voice_zones, &my_pos, &roster_map, &gain_map, &load_voice_gains());
                                        }
                                        let _ = app.emit("voice-position-updated", serde_json::json!({
                                            "zone_id": zone_id,
                                            "pubkey": pubkey,
                                            "position": position,
                                        }));
                                    }
                                    WsServerMessage::VideoParticipantEnabled { channel_id, pubkey } => {
                                        let _ = app.emit("video-participant-enabled", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "pubkey": pubkey,
                                        }));
                                    }
                                    WsServerMessage::VideoParticipantDisabled { channel_id, pubkey } => {
                                        let _ = app.emit("video-participant-disabled", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "pubkey": pubkey,
                                        }));
                                    }
                                    WsServerMessage::VideoParticipants { channel_id, pubkeys } => {
                                        let _ = app.emit("video-participants", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "pubkeys": pubkeys,
                                        }));
                                    }
                                    WsServerMessage::VideoOfferIn { channel_id, from_pubkey, to_pubkey, sdp } => {
                                        let _ = app.emit("video-offer-in", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "from_pubkey": from_pubkey,
                                            "to_pubkey": to_pubkey,
                                            "sdp": sdp,
                                        }));
                                    }
                                    WsServerMessage::VideoAnswerIn { channel_id, from_pubkey, to_pubkey, sdp } => {
                                        let _ = app.emit("video-answer-in", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "from_pubkey": from_pubkey,
                                            "to_pubkey": to_pubkey,
                                            "sdp": sdp,
                                        }));
                                    }
                                    WsServerMessage::VideoIceIn { channel_id, from_pubkey, to_pubkey, candidate } => {
                                        let _ = app.emit("video-ice-in", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "from_pubkey": from_pubkey,
                                            "to_pubkey": to_pubkey,
                                            "candidate": candidate,
                                        }));
                                    }
                                    WsServerMessage::PollVoteUpdated { channel_id, poll_id, totals } => {
                                        let _ = app.emit("poll-vote-updated", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "poll_id": poll_id,
                                            "totals": totals,
                                        }));
                                    }
                                    WsServerMessage::VoiceWhisperStarted { sender_pubkey } => {
                                        let _ = app.emit("voice-whisper-started", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "sender_pubkey": sender_pubkey,
                                        }));
                                    }
                                    WsServerMessage::VoiceWhisperStopped { sender_pubkey } => {
                                        let _ = app.emit("voice-whisper-stopped", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "sender_pubkey": sender_pubkey,
                                        }));
                                    }
                                    WsServerMessage::BotAppLaunch { bot_id, title, description, channel_id } => {
                                        let _ = app.emit("bot-app-launch", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "type": "bot_app_launch",
                                            "bot_id": bot_id,
                                            "title": title,
                                            "description": description,
                                            "channel_id": channel_id,
                                        }));
                                    }
                                    WsServerMessage::BotAppOpen { bot_id, channel_id, mini_app_url, session_token } => {
                                        let _ = app.emit("bot-app-open", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "type": "bot_app_open",
                                            "bot_id": bot_id,
                                            "channel_id": channel_id,
                                            "mini_app_url": mini_app_url,
                                            "session_token": session_token,
                                        }));
                                    }
                                    WsServerMessage::BotAppClose { bot_id, channel_id } => {
                                        let _ = app.emit("bot-app-close", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "type": "bot_app_close",
                                            "bot_id": bot_id,
                                            "channel_id": channel_id,
                                        }));
                                    }
                                    WsServerMessage::Other => {}
                                }
                            }
                        }
                        Some(Ok(WsMessage::Close(_))) | None => break,
                        Some(Err(e)) => {
                            eprintln!("WS recv error: {e}");
                            break;
                        }
                        _ => {}
                    }
                }
                Some(cmd) = cmd_rx.recv() => {
                    let json = match cmd {
                        WsCommand::Subscribe(channel_id) => {
                            serde_json::json!({ "type": "subscribe", "channel_id": channel_id })
                        }
                        WsCommand::Unsubscribe(channel_id) => {
                            serde_json::json!({ "type": "unsubscribe", "channel_id": channel_id })
                        }
                        WsCommand::VoiceJoin { channel_id, udp_port } => {
                            serde_json::json!({ "type": "voice_join", "channel_id": channel_id, "udp_port": udp_port })
                        }
                        WsCommand::VoiceLeave { channel_id } => {
                            serde_json::json!({ "type": "voice_leave", "channel_id": channel_id })
                        }
                        WsCommand::VoiceSpeaking { channel_id, speaking } => {
                            serde_json::json!({
                                "type": "voice_speaking",
                                "channel_id": channel_id,
                                "speaking": speaking,
                            })
                        }
                        WsCommand::Typing { channel_id, typing } => {
                            serde_json::json!({
                                "type": "typing",
                                "channel_id": channel_id,
                                "typing": typing,
                            })
                        }
                        WsCommand::DmTyping { conversation_id, typing } => {
                            serde_json::json!({
                                "type": "dm_typing",
                                "conversation_id": conversation_id,
                                "typing": typing,
                            })
                        }
                        WsCommand::Raw(raw_json) => {
                            if ws_tx.send(WsMessage::Text(raw_json)).await.is_err() {
                                break;
                            }
                            continue;
                        }
                    };
                    if ws_tx.send(WsMessage::Text(json.to_string())).await.is_err() {
                        break;
                    }
                }
            }
        }
        let _ = status_app.emit(
            "hub-ws-status",
            serde_json::json!({ "hub_id": status_hub_id, "connected": false }),
        );
    });

    Ok((cmd_tx, task))
}

pub(crate) async fn reauth_session(
    state: &State<'_, AppState>,
    app: &AppHandle,
    hub_id: &str,
) -> Result<String, String> {
    let hub_url = {
        let hubs = state.hubs.lock().unwrap();
        let s = hubs.get(hub_id).ok_or("Hub not connected")?;
        s.hub_url.clone()
    };

    let creds = crate::auth_creds::load_active_credentials()?;
    let client = state.http_client.clone();
    let info: crate::types::InfoResponse = client
        .get(format!("{hub_url}/info"))
        .send()
        .await
        .map_err(|e| format!("reauth info fetch: {e}"))?
        .json()
        .await
        .map_err(|e| format!("reauth info decode: {e}"))?;
    let auth_url = info.farm_url.as_deref().unwrap_or(&hub_url).to_string();
    let new_token = creds.authenticate(&auth_url, &client, None).await?;

    let (old_task, hub_id_clone) = {
        let mut hubs = state.hubs.lock().unwrap();
        let session = hubs.get_mut(hub_id).ok_or("Hub vanished mid-reauth")?;
        session.token = new_token.clone();
        let old_task = std::mem::replace(&mut session.ws_task, tokio::spawn(async {}));
        (old_task, session.hub_id.clone())
    };
    old_task.abort();

    let (new_cmd_tx, new_task) = spawn_ws_task(
        hub_id_clone.clone(),
        hub_url,
        new_token.clone(),
        app.clone(),
    )
    .await
    .map_err(|e| format!("ws reconnect: {e}"))?;

    {
        let mut hubs = state.hubs.lock().unwrap();
        if let Some(session) = hubs.get_mut(hub_id) {
            session.ws_tx = new_cmd_tx;
            session.ws_task = new_task;
        }
    }

    println!("Re-authenticated with hub {}", &hub_id_clone[..16]);
    Ok(new_token)
}

pub(crate) fn recompute_proximity_gains(
    voice_zones: &std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, ZoneInfo>>>,
    my_position: &std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, Vec<f64>>>>,
    roster_map: &std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<u16, String>>>,
    gain_map: &std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<u16, f32>>>,
    manual_gains: &std::collections::HashMap<String, f32>,
) {
    let zmap = voice_zones.lock().unwrap();
    let my_pos_map = my_position.lock().unwrap();

    let mut pubkey_proximity: std::collections::HashMap<String, f32> =
        std::collections::HashMap::new();

    for (zone_id, zone) in zmap.iter() {
        let my_pos = match my_pos_map.get(zone_id) {
            Some(p) => p,
            None => continue,
        };
        for (pk, their_pos) in &zone.positions {
            let d = euclidean_distance(my_pos, their_pos);
            let gain = evaluate_attenuation(&zone.attenuation, d) as f32;
            let entry = pubkey_proximity.entry(pk.clone()).or_insert(1.0);
            *entry *= gain;
        }
    }
    drop(zmap);
    drop(my_pos_map);

    let roster_clone = match roster_map.try_read() {
        Ok(rm) => rm.clone(),
        Err(_) => return,
    };

    let manual_gains = manual_gains.clone();
    let pubkey_proximity = pubkey_proximity.clone();
    let gain_map = gain_map.clone();

    tokio::spawn(async move {
        let mut gm = gain_map.write().await;
        for (&sid, pubkey) in &roster_clone {
            let manual = manual_gains.get(pubkey).copied().unwrap_or(1.0);
            let proximity = pubkey_proximity.get(pubkey).copied().unwrap_or(1.0);
            gm.insert(sid, manual * proximity);
        }
    });
}

pub(crate) fn euclidean_distance(a: &[f64], b: &[f64]) -> f64 {
    a.iter()
        .zip(b.iter())
        .map(|(x, y)| (x - y).powi(2))
        .sum::<f64>()
        .sqrt()
}

pub(crate) fn evaluate_attenuation(cfg: &AttenuationConfigInfo, d: f64) -> f64 {
    if d <= 0.0 {
        return 1.0;
    }
    match cfg.model.as_str() {
        "inverse_square" => {
            let ref_d = cfg.ref_dist.max(0.001);
            ((ref_d / d.max(ref_d)).powi(2)).clamp(0.0, 1.0)
        }
        "step" => {
            let inner = cfg.ref_dist;
            let outer = cfg.max_radius;
            if d <= inner {
                1.0
            } else if d >= outer {
                0.0
            } else {
                1.0 - (d - inner) / (outer - inner)
            }
        }
        "exponential" => {
            let k = cfg.rolloff / cfg.ref_dist.max(0.001);
            (-k * d).exp().clamp(0.0, 1.0)
        }
        _ => (1.0 - d / cfg.max_radius.max(0.001)).clamp(0.0, 1.0),
    }
}
