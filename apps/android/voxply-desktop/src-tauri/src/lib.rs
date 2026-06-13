use crate::identity::Identity;
use tauri::{Emitter, Manager, State};

mod admin;
mod alliances;
mod auth_creds;
mod bots;
mod channels;
mod dm;
mod friends;
mod home_hub;
mod hubs;
mod identity;
mod lobby;
mod messages;
mod pairing;
mod prefs;
mod prefs_blob;
mod recovery;
mod state;
mod voice;
mod ws;

use state::{AppState, PendingDeepLink};

// ---------------------------------------------------------------------------
// Identity-related commands (identity + state together)
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_recovery_phrase() -> Result<String, String> {
    let path = Identity::default_path().map_err(|e| e.to_string())?;
    let identity = Identity::load(&path).map_err(|e| e.to_string())?;
    Ok(identity.recovery_phrase())
}

#[tauri::command]
fn recover_identity_from_phrase(
    phrase: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Validate + reconstruct first so we can fail without touching anything.
    let restored = Identity::from_recovery_phrase(phrase.trim())
        .map_err(|e| format!("Invalid recovery phrase: {e}"))?;
    let new_pubkey = restored.public_key_hex();

    let identity_path = Identity::default_path().map_err(|e| e.to_string())?;

    // Tear down every live hub session — their tokens belong to the old
    // identity and won't authenticate anymore. We drain the map first, then
    // abort outside the lock so a slow shutdown doesn't hold it.
    let drained: Vec<_> = state
        .hubs
        .lock()
        .unwrap()
        .drain()
        .map(|(_, s)| s.ws_task)
        .collect();
    for task in drained {
        task.abort();
    }
    *state.active_hub.lock().unwrap() = None;
    hubs::save_active_hub_id(None);

    // Wipe the persisted hubs list — the user will re-add hubs under the
    // restored identity. Any hub that knew the old key as a member will
    // see the new key as a stranger.
    let _ = hubs::save_hubs_list(&[]);

    restored
        .save(&identity_path)
        .map_err(|e| format!("Failed to save identity: {e}"))?;

    Ok(new_pubkey)
}

#[tauri::command]
fn get_my_public_key() -> Result<String, String> {
    let path = Identity::default_path().map_err(|e| e.to_string())?;
    let (identity, _) = Identity::load_or_create(&path).map_err(|e| e.to_string())?;
    Ok(identity.public_key_hex())
}

fn load_master_identity() -> Result<crate::identity::MasterIdentity, String> {
    let path = Identity::default_path().map_err(|e| e.to_string())?;
    let identity = Identity::load(&path).map_err(|e| e.to_string())?;
    identity.master().map_err(|e| e.to_string())
}

#[tauri::command]
async fn push_prefs_blob() -> Result<(), String> {
    let master = load_master_identity()?;
    let blob_key = prefs_blob::derive_blob_key(&master);
    let home_hubs = crate::home_hub::read_cached_designation()
        .map(|d| d.hubs)
        .unwrap_or_default();
    if home_hubs.is_empty() {
        return Err("No home hubs configured".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    prefs_blob::push_prefs_blob(&master, &blob_key, &home_hubs, &client)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn pull_and_apply_prefs_blob() -> Result<prefs_blob::LocalPrefs, String> {
    let master = load_master_identity()?;
    let blob_key = prefs_blob::derive_blob_key(&master);
    let home_hubs = crate::home_hub::read_cached_designation()
        .map(|d| d.hubs)
        .unwrap_or_default();
    if home_hubs.is_empty() {
        return Err("No home hubs configured".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let prefs =
        prefs_blob::pull_prefs_blob(&master.public_key_hex(), &home_hubs, &blob_key, &client)
            .await
            .map_err(|e| e.to_string())?;
    let _ = prefs::save_blocked_users_raw(&prefs.blocked_users);
    let _ = prefs::save_voice_settings_to_disk(&prefs.voice_settings);
    Ok(prefs)
}

// ---------------------------------------------------------------------------
// Application entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            app.manage(AppState {
                hubs: Default::default(),
                active_hub: Default::default(),
                voice: Default::default(),
                http_client: reqwest::Client::new(),
            });
            app.manage(PendingDeepLink {
                url: std::sync::Mutex::new(None),
            });

            // Handle deep link if the app was launched via a voxply:// URL
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    for url in &urls {
                        let raw = url.as_str();
                        if raw.starts_with("voxply://") {
                            *app.state::<PendingDeepLink>().url.lock().unwrap() =
                                Some(raw.to_string());
                            break;
                        }
                    }
                }
                // Also handle deep links while the app is already running
                let handle = app.handle().clone();
                let _listener_id = app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        let raw = url.as_str();
                        if raw.starts_with("voxply://") {
                            if let Some(state) = handle.try_state::<PendingDeepLink>() {
                                *state.url.lock().unwrap() = Some(raw.to_string());
                            }
                            let _ = handle.emit("join-hub-requested", raw.to_string());
                            break;
                        }
                    }
                });
            }

            // Kick off a background update check — best-effort, never blocks startup.
            let update_handle = app.handle().clone();
            tauri::async_runtime::spawn(prefs::check_for_updates(update_handle));

            // System tray: a "Show Voxply" / "Quit" menu plus left-click to
            // focus the main window. Tooltip carries the unread count, kept
            // in sync by the frontend via set_tray_unread.
            let show = MenuItem::with_id(app, "show", "Show Voxply", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let _tray = TrayIconBuilder::with_id("main")
                .tooltip("Voxply")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    use tauri::tray::TrayIconEvent;
                    if let TrayIconEvent::Click {
                        button,
                        button_state,
                        ..
                    } = event
                    {
                        if button == tauri::tray::MouseButton::Left
                            && button_state == tauri::tray::MouseButtonState::Up
                        {
                            if let Some(w) = tray.app_handle().get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hubs::add_hub,
            hubs::list_hubs,
            hubs::ping_hub,
            hubs::set_active_hub,
            hubs::remove_hub,
            hubs::auto_connect_saved,
            channels::list_channels,
            channels::create_channel,
            channels::update_channel_description,
            channels::rename_channel,
            channels::move_channel,
            channels::update_channel_appearance,
            channels::delete_channel,
            channels::reorder_channels,
            admin::list_users,
            messages::get_messages,
            messages::search_messages,
            voice::voice_populations,
            voice::voice_active_users,
            voice::voice_channel_participants,
            messages::add_reaction,
            messages::remove_reaction,
            messages::send_message,
            messages::edit_message,
            messages::delete_message,
            channels::subscribe_channel,
            channels::unsubscribe_channel,
            channels::set_typing,
            messages::set_dm_typing,
            hubs::reconnect_hub,
            hubs::reorder_hubs,
            hubs::preview_hub_info,
            hubs::get_pending_deep_link,
            prefs::clear_local_data,
            voice::voice_join,
            voice::voice_leave,
            voice::voice_set_muted,
            voice::voice_set_deafened,
            voice::list_audio_devices,
            voice::get_voice_settings,
            voice::save_voice_settings,
            voice::mic_test_start,
            voice::mic_test_stop,
            admin::update_display_name,
            admin::update_avatar,
            prefs::get_profile,
            prefs::save_profile,
            get_recovery_phrase,
            recover_identity_from_phrase,
            get_my_public_key,
            admin::get_me,
            admin::get_hub_branding,
            admin::update_hub_branding,
            admin::list_roles,
            admin::create_role,
            admin::update_role,
            admin::delete_role,
            admin::get_hub_settings,
            admin::list_pending_members,
            admin::approve_member,
            admin::list_hub_icons,
            admin::create_hub_icon,
            admin::rename_hub_icon,
            admin::delete_hub_icon,
            admin::list_hub_members,
            admin::kick_user_cmd,
            admin::ban_user_cmd,
            admin::mute_user_cmd,
            admin::timeout_user_cmd,
            admin::voice_mute_user_cmd,
            admin::voice_unmute_user_cmd,
            admin::list_voice_mutes,
            admin::channel_ban_user,
            admin::channel_unban_user,
            admin::list_channel_bans,
            prefs::set_tray_unread,
            prefs::load_unread_state,
            prefs::save_unread_state,
            prefs::load_notification_mutes,
            prefs::save_notification_mutes,
            prefs::load_pinned_channels,
            prefs::save_pinned_channels,
            prefs::load_collapsed_categories,
            prefs::save_collapsed_categories,
            prefs::load_blocked_users,
            prefs::save_blocked_users,
            admin::get_talk_power,
            admin::set_talk_power_cmd,
            admin::assign_role,
            admin::unassign_role,
            admin::list_bans,
            admin::unban_user,
            admin::list_invites,
            admin::create_invite,
            admin::revoke_invite,
            alliances::list_alliances,
            alliances::create_alliance,
            alliances::get_alliance,
            alliances::create_alliance_invite,
            alliances::join_alliance,
            alliances::leave_alliance,
            alliances::send_alliance_push_invite,
            alliances::list_pending_alliance_invites,
            alliances::respond_to_alliance_invite,
            alliances::list_alliance_shared_channels,
            alliances::get_alliance_channel_messages,
            alliances::send_alliance_channel_message,
            alliances::share_channel_with_alliance,
            alliances::unshare_channel_from_alliance,
            admin::submit_to_directory,
            friends::list_friends,
            friends::list_pending_friends,
            friends::send_friend_request,
            friends::accept_friend,
            friends::remove_friend,
            dm::list_conversations,
            dm::create_conversation,
            dm::get_dm_messages,
            dm::send_dm,
            home_hub::set_home_hub_list,
            home_hub::get_home_hub_list,
            pairing::start_pairing_offer,
            pairing::poll_pairing_status,
            pairing::complete_pairing,
            pairing::home_hubs_from_offer,
            pairing::fingerprint_pubkey,
            pairing::parse_pairing_offer,
            pairing::claim_pairing_offer,
            pairing::save_paired_identity,
            pairing::get_paired_identity,
            push_prefs_blob,
            pull_and_apply_prefs_blob,
            admin::save_public_profile,
            admin::fetch_public_profile,
            hubs::get_hub_ws_info,
            dm::publish_dh_key,
            dm::fetch_dh_key,
            dm::encrypt_dm,
            dm::decrypt_dm,
            bots::list_bots,
            bots::create_bot,
            bots::delete_bot,
            bots::rotate_bot_token,
            bots::admin_list_bots,
            bots::admin_create_bot,
            bots::admin_delete_bot,
            bots::admin_set_bot_webhook,
            bots::admin_get_bot_detail,
            lobby::lobby_status,
            lobby::lobby_submit_proof,
            lobby::lobby_get_welcome,
            lobby::set_lobby_settings,
            lobby::challenge_fetch,
            lobby::challenge_submit,
            lobby::set_challenge_settings,
            lobby::survey_current,
            lobby::survey_submit,
            lobby::survey_admin_get,
            lobby::survey_admin_put,
            lobby::survey_admin_responses,
            recovery::list_recovery_contacts,
            recovery::set_recovery_contacts,
            recovery::remove_recovery_contact,
            recovery::list_admin_recovery_requests,
            recovery::approve_recovery_request,
            recovery::deny_recovery_request,
            recovery::update_dm_blocks,
            prefs::load_appearance,
            prefs::save_appearance,
            messages::mark_post_read,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ---------------------------------------------------------------------------
// Tests — pure helpers that don't need AppHandle / State / running runtime.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;
    use prefs::{LocalProfile, NamedProfile};
    use state::StoredVoiceSettings;

    #[test]
    fn urlencoding_emoji_passes_unreserved_chars_through() {
        use messages::urlencoding_emoji;
        assert_eq!(urlencoding_emoji(""), "");
        assert_eq!(urlencoding_emoji("hello"), "hello");
        assert_eq!(urlencoding_emoji("a-b_c.d~e"), "a-b_c.d~e");
        assert_eq!(urlencoding_emoji("0123456789"), "0123456789");
    }

    #[test]
    fn urlencoding_emoji_percent_encodes_reserved_and_unicode() {
        use messages::urlencoding_emoji;
        // ASCII reserved
        assert_eq!(urlencoding_emoji(" "), "%20");
        assert_eq!(urlencoding_emoji("a/b"), "a%2Fb");
        assert_eq!(urlencoding_emoji("?&="), "%3F%26%3D");
        // Multi-byte UTF-8: thumbs-up emoji is 4 bytes (F0 9F 91 8D), each
        // gets percent-encoded individually.
        assert_eq!(urlencoding_emoji("👍"), "%F0%9F%91%8D");
        // Heart emoji (U+2764) is 3 bytes (E2 9D A4).
        assert_eq!(urlencoding_emoji("❤"), "%E2%9D%A4");
    }

    #[test]
    fn default_approval_status_is_approved() {
        // The default kicks in when a hub's /me response omits the field
        // (older hubs that don't know about the approval queue).
        assert_eq!(admin::default_approval_status(), "approved");
    }

    #[test]
    fn local_profile_default_is_empty_with_no_theme() {
        let p = LocalProfile::default();
        assert!(p.profiles.is_empty());
        assert!(p.default_profile_id.is_none());
        assert!(p.theme.is_none());
        assert!(p.default_profile().is_none());
    }

    #[test]
    fn local_profile_default_profile_falls_back_to_first_when_id_stale() {
        let a = NamedProfile {
            id: "id-a".to_string(),
            label: "Profile A".to_string(),
            display_name: "Alice".to_string(),
            avatar: None,
        };
        let b = NamedProfile {
            id: "id-b".to_string(),
            label: "Profile B".to_string(),
            display_name: "Bob".to_string(),
            avatar: None,
        };
        let p = LocalProfile {
            profiles: vec![a.clone(), b.clone()],
            // ID points at a profile that no longer exists — should fall
            // back to the first profile rather than returning None.
            default_profile_id: Some("vanished".to_string()),
            theme: None,
        };
        assert_eq!(p.default_profile().unwrap().id, "id-a");
    }

    #[test]
    fn local_profile_default_profile_honors_explicit_id() {
        let a = NamedProfile {
            id: "id-a".to_string(),
            label: "Profile A".to_string(),
            display_name: "Alice".to_string(),
            avatar: None,
        };
        let b = NamedProfile {
            id: "id-b".to_string(),
            label: "Profile B".to_string(),
            display_name: "Bob".to_string(),
            avatar: None,
        };
        let p = LocalProfile {
            profiles: vec![a, b.clone()],
            default_profile_id: Some("id-b".to_string()),
            theme: None,
        };
        assert_eq!(p.default_profile().unwrap().id, "id-b");
    }

    #[test]
    fn saved_hub_round_trips_through_json() {
        use hubs::SavedHub;
        let original = SavedHub {
            hub_id: "h1".to_string(),
            hub_name: "Hub One".to_string(),
            hub_url: "https://hub.example".to_string(),
        };
        let json = serde_json::to_string(&original).unwrap();
        let decoded: SavedHub = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.hub_id, original.hub_id);
        assert_eq!(decoded.hub_name, original.hub_name);
        assert_eq!(decoded.hub_url, original.hub_url);
    }

    #[test]
    fn stored_voice_settings_decodes_with_missing_fields() {
        // A prefs file from before we added voice_mode/ptt_key should still
        // load — that's why both fields are #[serde(default)].
        let old: StoredVoiceSettings =
            serde_json::from_str(r#"{"input_device":"mic","vad_threshold":0.05}"#).unwrap();
        assert_eq!(old.input_device.as_deref(), Some("mic"));
        assert_eq!(old.vad_threshold, Some(0.05));
        assert!(old.voice_mode.is_none());
        assert!(old.ptt_key.is_none());
    }

    #[test]
    fn stored_voice_settings_round_trips_full_payload() {
        let s = StoredVoiceSettings {
            input_device: Some("USB Mic".to_string()),
            output_device: Some("Speakers".to_string()),
            vad_threshold: Some(0.02),
            voice_mode: Some("ptt".to_string()),
            ptt_key: Some("Space".to_string()),
        };
        let json = serde_json::to_string(&s).unwrap();
        let back: StoredVoiceSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.input_device, s.input_device);
        assert_eq!(back.output_device, s.output_device);
        assert_eq!(back.vad_threshold, s.vad_threshold);
        assert_eq!(back.voice_mode, s.voice_mode);
        assert_eq!(back.ptt_key, s.ptt_key);
    }

    #[test]
    fn local_profile_decodes_with_missing_theme() {
        // Old prefs files predate the theme field; theme should default to None.
        let old: LocalProfile = serde_json::from_str(r#"{"profiles":[]}"#).unwrap();
        assert!(old.profiles.is_empty());
        assert!(old.theme.is_none());
        assert!(old.default_profile_id.is_none());
    }
}
