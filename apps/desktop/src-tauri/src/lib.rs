// Wavvon desktop Tauri shell — composition root.
// All domain logic lives in the modules below. This file wires them together.

mod admin;
mod admin_alliance;
mod auth_creds;
mod bots;
mod certs;
mod channels;
mod devices;
mod discovery;
mod dm;
mod events_polls;
mod farm;
mod home_hub;
mod hub_session;
mod identity;
mod identity_cmd;
mod lobby;
mod local_store;
mod messages;
mod mini_app;
mod pairing;
mod prefs_blob;
mod screen_share;
mod state;
mod types;
mod updater;
mod voice_cmd;
mod ws;

use tauri::Manager;

use state::{AppState, PendingUpdate};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            app.manage(AppState {
                hubs: Default::default(),
                active_hub: Default::default(),
                voice: Default::default(),
                http_client: reqwest::Client::new(),
            });
            app.manage(PendingUpdate(std::sync::Mutex::new(None)));
            let update_handle = app.handle().clone();
            tauri::async_runtime::spawn(updater::check_for_updates(update_handle));

            let show = MenuItem::with_id(app, "show", "Show Wavvon", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let _tray = TrayIconBuilder::with_id("main")
                .tooltip("Wavvon")
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
            // Hub session
            hub_session::add_hub,
            hub_session::list_hubs,
            hub_session::ping_hub,
            hub_session::set_active_hub,
            hub_session::remove_hub,
            hub_session::auto_connect_saved,
            hub_session::reconnect_hub,
            hub_session::reorder_hubs,
            hub_session::preview_hub_info,
            hub_session::add_hub_by_url,
            hub_session::get_hub_ws_info,
            // Channels
            channels::list_channels,
            channels::list_hub_emojis,
            channels::create_channel,
            channels::update_channel_description,
            channels::rename_channel,
            channels::move_channel,
            channels::update_channel_appearance,
            channels::delete_channel,
            channels::reorder_channels,
            channels::subscribe_channel,
            channels::unsubscribe_channel,
            channels::set_typing,
            channels::set_dm_typing,
            channels::patch_channel_banner_file,
            channels::patch_channel_banner_url,
            // Messages
            messages::get_messages,
            messages::get_thread_replies,
            messages::search_messages,
            messages::search_messages_global,
            messages::add_reaction,
            messages::remove_reaction,
            messages::send_message,
            messages::edit_message,
            messages::delete_message,
            messages::forum_list_posts,
            messages::forum_get_post,
            messages::forum_create_post,
            messages::forum_create_reply,
            messages::forum_get_post_replies,
            messages::forum_pin_post,
            messages::forum_lock_post,
            messages::mark_post_read,
            messages::upload_file,
            messages::pin_message,
            messages::unpin_message,
            messages::get_pinned_messages,
            // Voice
            voice_cmd::voice_populations,
            voice_cmd::voice_active_users,
            voice_cmd::voice_channel_participants,
            voice_cmd::voice_join,
            voice_cmd::voice_leave,
            voice_cmd::voice_set_muted,
            voice_cmd::voice_set_deafened,
            voice_cmd::list_audio_devices,
            local_store::get_voice_settings,
            local_store::save_voice_settings,
            voice_cmd::set_voice_gain,
            voice_cmd::set_voice_position,
            voice_cmd::send_hub_ws_raw,
            voice_cmd::mic_test_start,
            voice_cmd::mic_test_stop,
            voice_cmd::start_whisper,
            voice_cmd::stop_whisper,
            voice_cmd::load_whisper_lists,
            voice_cmd::save_whisper_lists,
            // Local store
            local_store::load_appearance,
            local_store::save_appearance,
            local_store::clear_local_data,
            local_store::load_unread_state,
            local_store::save_unread_state,
            local_store::load_notification_mutes,
            local_store::save_notification_mutes,
            local_store::load_pinned_channels,
            local_store::save_pinned_channels,
            local_store::load_collapsed_categories,
            local_store::save_collapsed_categories,
            local_store::load_blocked_users,
            local_store::save_blocked_users,
            local_store::load_ignored_users,
            local_store::save_ignored_users,
            local_store::load_dnd_settings,
            local_store::save_dnd_settings,
            local_store::get_profile,
            local_store::save_profile,
            local_store::get_notification_prefs,
            local_store::set_notification_pref,
            // Admin
            admin::list_users,
            admin::update_display_name,
            admin::update_avatar,
            admin::get_me,
            admin::get_hub_branding,
            admin::update_hub_branding,
            admin::list_roles,
            admin::create_role,
            admin::update_role,
            admin::delete_role,
            admin::assign_role,
            admin::unassign_role,
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
            admin::get_talk_power,
            admin::set_talk_power_cmd,
            admin::list_bans,
            admin::unban_user,
            admin::list_invites,
            admin::create_invite,
            admin::revoke_invite,
            admin::get_user_profile,
            // Alliance / federation
            admin_alliance::list_alliances,
            admin_alliance::create_alliance,
            admin_alliance::get_alliance,
            admin_alliance::create_alliance_invite,
            admin_alliance::join_alliance,
            admin_alliance::leave_alliance,
            admin_alliance::send_alliance_push_invite,
            admin_alliance::list_pending_alliance_invites,
            admin_alliance::respond_to_alliance_invite,
            admin_alliance::list_alliance_shared_channels,
            admin_alliance::get_alliance_channel_messages,
            admin_alliance::send_alliance_channel_message,
            admin_alliance::share_channel_with_alliance,
            admin_alliance::unshare_channel_from_alliance,
            // Identity
            identity_cmd::get_recovery_phrase,
            identity_cmd::recover_identity_from_phrase,
            identity_cmd::get_my_public_key,
            identity_cmd::get_my_pubkey,
            identity_cmd::sign_message,
            identity_cmd::export_identity_backup,
            identity_cmd::import_identity_backup,
            identity_cmd::push_prefs_blob,
            identity_cmd::pull_and_apply_prefs_blob,
            identity_cmd::save_public_profile,
            identity_cmd::fetch_public_profile,
            identity_cmd::submit_to_directory,
            // DM / friends / E2E crypto
            dm::list_friends,
            dm::list_pending_friends,
            dm::send_friend_request,
            dm::accept_friend,
            dm::remove_friend,
            dm::list_conversations,
            dm::create_conversation,
            dm::get_dm_messages,
            dm::send_dm,
            dm::update_dm_blocks,
            dm::publish_dh_key,
            dm::fetch_dh_key,
            dm::encrypt_dm,
            dm::decrypt_dm,
            dm::push_group_sender_key,
            dm::rotate_group_sender_key,
            dm::fetch_group_sender_keys,
            dm::encrypt_group_dm,
            dm::decrypt_group_dm,
            // Bots / webhooks
            bots::list_bots,
            bots::create_bot,
            bots::delete_bot,
            bots::rotate_bot_token,
            bots::admin_list_bots,
            bots::admin_create_bot,
            bots::admin_delete_bot,
            bots::admin_set_bot_webhook,
            bots::admin_get_bot_detail,
            bots::send_component_interaction,
            bots::get_bot_profile,
            bots::admin_list_external_bots,
            bots::admin_add_external_bot,
            bots::admin_remove_external_bot,
            bots::admin_set_bot_channel_scope,
            bots::admin_list_webhooks,
            bots::admin_create_webhook,
            bots::admin_regenerate_webhook,
            bots::admin_delete_webhook,
            // Lobby / challenge / survey
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
            // Farm management + recovery
            farm::get_hub_info,
            farm::get_farm_info,
            farm::probe_farm,
            farm::get_farm_hub_quota,
            farm::get_farm_settings,
            farm::patch_farm_settings,
            farm::get_farm_hubs_admin,
            farm::suspend_farm_hub,
            farm::delete_farm_hub,
            farm::get_farm_users,
            farm::revoke_farm_user_sessions,
            farm::create_hub_on_farm,
            farm::get_farm_servers,
            farm::generate_farm_server_token,
            farm::farm_totp_setup,
            farm::farm_totp_confirm,
            farm::farm_totp_disable,
            farm::list_recovery_contacts,
            farm::add_recovery_contact,
            farm::remove_recovery_contact,
            farm::submit_rotation_request,
            farm::list_rotation_requests,
            // Events and polls
            events_polls::list_events,
            events_polls::rsvp_event,
            events_polls::create_event,
            events_polls::vote_poll,
            events_polls::create_poll,
            events_polls::get_channel_polls,
            events_polls::delete_poll,
            events_polls::delete_event,
            events_polls::get_hub_events,
            events_polls::rsvp_event_hub,
            events_polls::create_event_hub,
            // Screen capture / PiP
            screen_share::list_capture_sources,
            screen_share::open_pip_window,
            screen_share::close_pip_window,
            // Mini-app windows
            mini_app::open_mini_app,
            mini_app::close_mini_app,
            // Certs / audit
            certs::get_cert_settings,
            certs::get_audit_log,
            certs::list_issued_certs,
            certs::save_cert_settings,
            certs::issue_cert,
            certs::revoke_cert,
            certs::fetch_my_certs,
            // Discovery / badges
            discovery::get_discovery_settings,
            discovery::set_discovery_tags,
            discovery::set_hub_listed,
            discovery::fetch_link_preview,
            discovery::list_badges,
            discovery::list_pending_badges,
            discovery::accept_badge,
            discovery::decline_badge,
            discovery::remove_badge,
            discovery::grant_badge,
            // Updater / tray
            updater::install_pending_update,
            updater::set_tray_unread,
            // Pairing / home hub / devices
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
            devices::device_list,
            devices::device_revoke,
            devices::subkey_issue,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ---------------------------------------------------------------------------
// Tests — cover pure helpers that don't need a running AppHandle.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use crate::local_store::{LocalProfile, NamedProfile, StoredVoiceSettings};
    use crate::messages::urlencoding_emoji;
    use crate::types::{default_approval_status, SavedHub};

    #[test]
    fn urlencoding_emoji_passes_unreserved_chars_through() {
        assert_eq!(urlencoding_emoji(""), "");
        assert_eq!(urlencoding_emoji("hello"), "hello");
        assert_eq!(urlencoding_emoji("a-b_c.d~e"), "a-b_c.d~e");
        assert_eq!(urlencoding_emoji("0123456789"), "0123456789");
    }

    #[test]
    fn urlencoding_emoji_percent_encodes_reserved_and_unicode() {
        assert_eq!(urlencoding_emoji(" "), "%20");
        assert_eq!(urlencoding_emoji("a/b"), "a%2Fb");
        assert_eq!(urlencoding_emoji("?&="), "%3F%26%3D");
        assert_eq!(urlencoding_emoji("\u{1F44D}"), "%F0%9F%91%8D");
        assert_eq!(urlencoding_emoji("\u{2764}"), "%E2%9D%A4");
    }

    #[test]
    fn default_approval_status_is_approved() {
        assert_eq!(default_approval_status(), "approved");
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
            ..Default::default()
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
        let old: LocalProfile = serde_json::from_str(r#"{"profiles":[]}"#).unwrap();
        assert!(old.profiles.is_empty());
        assert!(old.theme.is_none());
        assert!(old.default_profile_id.is_none());
    }
}
