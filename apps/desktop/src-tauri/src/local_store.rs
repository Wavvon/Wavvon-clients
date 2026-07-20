use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// StoredVoiceSettings
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub(crate) struct StoredVoiceSettings {
    pub input_device: Option<String>,
    pub output_device: Option<String>,
    /// Range [0.001, 0.2]. Higher = less sensitive.
    pub vad_threshold: Option<f32>,
    /// "vad" (default) or "ptt".
    #[serde(default)]
    pub voice_mode: Option<String>,
    /// KeyboardEvent.code of the PTT hotkey.
    #[serde(default)]
    pub ptt_key: Option<String>,
    /// Audio quality profile: "standard" | "music" | "custom".
    #[serde(default)]
    pub audio_profile: Option<String>,
    #[serde(default)]
    pub custom_bitrate: Option<u32>,
    #[serde(default)]
    pub custom_app: Option<String>,
    #[serde(default)]
    pub custom_noise_suppress: Option<bool>,
    #[serde(default)]
    pub custom_vad: Option<bool>,
    #[serde(default)]
    pub custom_vad_threshold: Option<f32>,
    #[serde(default)]
    pub custom_channels: Option<u16>,
    #[serde(default)]
    pub custom_frame_ms: Option<u32>,
    #[serde(default)]
    pub custom_complexity: Option<u32>,
}

// ---------------------------------------------------------------------------
// AppearanceSettings
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct AppearanceSettings {
    #[serde(default = "default_appearance_slot")]
    pub slot: String,
    #[serde(default)]
    pub skin: Option<serde_json::Value>,
}

fn default_appearance_slot() -> String {
    "calm".to_string()
}

// ---------------------------------------------------------------------------
// Profile types
//
// The 2026-07-12 converged model (settings-ia.md §5): one local default
// profile (personal-axis) plus a hub-authoritative /me card per joined hub
// (community-axis, not mirrored here). The old NamedProfile[] pool +
// per-hub assignment map is deleted — alpha rules, no migration.
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Default)]
pub(crate) struct FavoriteHubEntry {
    pub url: String,
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub(crate) struct DefaultProfileFields {
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub bio: Option<String>,
    #[serde(default)]
    pub pronouns: Option<String>,
    #[serde(default)]
    pub status_message: Option<String>,
    #[serde(default)]
    pub activities: Option<String>,
    #[serde(default)]
    pub accent_color: Option<String>,
    #[serde(default)]
    pub cover: Option<String>,
    #[serde(default)]
    pub favorite_hubs: Vec<FavoriteHubEntry>,
    #[serde(default)]
    pub show_hubs: bool,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub(crate) struct LocalProfile {
    #[serde(default)]
    pub default_profile: Option<DefaultProfileFields>,
    #[serde(default)]
    pub theme: Option<String>,
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

// Device-global (settings-ia.md §7): hardware/device selection and encode
// tuning aren't tied to which account is active, matching web's unscoped
// `wavvon.audio_profile` / PTT-key / audio-device-id localStorage keys.
pub(crate) fn voice_settings_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".wavvon").join("voice.json"))
}

// Device-global: the theme *slot* choice, matching web's unscoped
// `wavvon:appearance` key. The *skin* half of `AppearanceSettings` is
// per-account instead — see load_appearance/save_appearance below, which
// merge this file with accounts::active_skin_path().
pub(crate) fn appearance_settings_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".wavvon").join("appearance.json"))
}

// Device-global: the `theme` field only (a legacy duplicate of
// appearance.json's slot — see useSettingsProfile.ts's persistTheme). The
// `default_profile` half of `LocalProfile` is per-account instead — see
// load_profile/save_profile_to_disk below, which merge this file with
// accounts::active_default_profile_path().
pub(crate) fn profile_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".wavvon").join("profile.json"))
}

// Per-account (settings-ia.md §7 fix): every one of these mirrors a web
// localStorage key that's namespaced under `wavvon:acct:<pubkey>:*` (saved
// hubs, active hub pointer, per-peer voice gains, ignored users, pinned
// channels, collapsed categories, notify mode/mutes, per-hub notify level)
// or, for unread state and the synced DM-block cache, data that's only
// meaningful within one account's own hub membership.
pub(crate) fn saved_hubs_path() -> Result<std::path::PathBuf, String> {
    crate::accounts::active_saved_hubs_path()
}

pub(crate) fn active_hub_path() -> Result<std::path::PathBuf, String> {
    crate::accounts::active_selected_hub_path()
}

pub(crate) fn voice_gains_path() -> Result<std::path::PathBuf, String> {
    crate::accounts::active_voice_gains_path()
}

pub(crate) fn unread_state_path() -> Result<std::path::PathBuf, String> {
    crate::accounts::active_unread_state_path()
}

pub(crate) fn notification_mutes_path() -> Result<std::path::PathBuf, String> {
    crate::accounts::active_notification_mutes_path()
}

pub(crate) fn pinned_channels_path() -> Result<std::path::PathBuf, String> {
    crate::accounts::active_pinned_channels_path()
}

pub(crate) fn collapsed_categories_path() -> Result<std::path::PathBuf, String> {
    crate::accounts::active_collapsed_categories_path()
}

pub(crate) fn blocked_users_path() -> Result<std::path::PathBuf, String> {
    crate::accounts::active_blocked_users_path()
}

pub(crate) fn ignored_users_path() -> Result<std::path::PathBuf, String> {
    crate::accounts::active_ignored_users_path()
}

pub(crate) fn dnd_settings_path() -> Result<std::path::PathBuf, String> {
    crate::accounts::active_dnd_settings_path()
}

pub(crate) fn notif_prefs_path() -> Result<std::path::PathBuf, String> {
    crate::accounts::active_notif_prefs_path()
}

// ---------------------------------------------------------------------------
// Load / save helpers
// ---------------------------------------------------------------------------

pub(crate) fn load_voice_gains() -> HashMap<String, f32> {
    voice_gains_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(&p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub(crate) fn save_voice_gains_to_disk(gains: &HashMap<String, f32>) {
    if let Ok(path) = voice_gains_path() {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(text) = serde_json::to_string(gains) {
            let _ = std::fs::write(&path, text);
        }
    }
}

pub(crate) fn load_voice_settings() -> StoredVoiceSettings {
    if let Ok(path) = voice_settings_path() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(s) = serde_json::from_str::<StoredVoiceSettings>(&data) {
                return s;
            }
        }
    }
    StoredVoiceSettings::default()
}

pub(crate) fn save_voice_settings_to_disk(settings: &StoredVoiceSettings) -> Result<(), String> {
    let path = voice_settings_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Mkdir failed: {e}"))?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Write failed: {e}"))?;
    Ok(())
}

pub(crate) fn load_saved_hubs() -> Vec<crate::types::SavedHub> {
    if let Ok(path) = saved_hubs_path() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(hubs) = serde_json::from_str(&data) {
                return hubs;
            }
        }
    }
    Vec::new()
}

pub(crate) fn save_hubs_list(hubs: &[crate::types::SavedHub]) -> Result<(), String> {
    let path = saved_hubs_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Mkdir failed: {e}"))?;
    }
    let json = serde_json::to_string_pretty(hubs).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Write failed: {e}"))?;
    Ok(())
}

pub(crate) fn load_active_hub_id() -> Option<String> {
    let path = active_hub_path().ok()?;
    let data = std::fs::read_to_string(&path).ok()?;
    let trimmed = data.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(crate) fn save_active_hub_id(hub_id: Option<&str>) {
    let Ok(path) = active_hub_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, hub_id.unwrap_or(""));
}

// The on-disk shape of the device-global half of LocalProfile — just
// `theme` (see profile_path()'s doc comment for why `default_profile` isn't
// here).
#[derive(Serialize, Deserialize, Default)]
struct GlobalThemeFile {
    #[serde(default)]
    theme: Option<String>,
}

pub(crate) fn load_profile() -> LocalProfile {
    let theme = profile_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(&p).ok())
        .and_then(|s| serde_json::from_str::<GlobalThemeFile>(&s).ok())
        .and_then(|g| g.theme);
    let default_profile = crate::accounts::active_default_profile_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(&p).ok())
        .and_then(|s| serde_json::from_str(&s).ok());
    LocalProfile {
        default_profile,
        theme,
    }
}

pub(crate) fn save_profile_to_disk(profile: &LocalProfile) -> Result<(), String> {
    // `theme` is device-global — always persisted, even with no active
    // account yet.
    let path = profile_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Mkdir failed: {e}"))?;
    }
    let json = serde_json::to_string_pretty(&GlobalThemeFile {
        theme: profile.theme.clone(),
    })
    .map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Write failed: {e}"))?;

    // `default_profile` is per-account; best-effort so a theme-only save
    // (persistTheme) still succeeds before any account exists.
    if let Ok(dp_path) = crate::accounts::active_default_profile_path() {
        if let Some(parent) = dp_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        match &profile.default_profile {
            Some(dp) => {
                if let Ok(json) = serde_json::to_string_pretty(dp) {
                    let _ = std::fs::write(&dp_path, json);
                }
            }
            None => {
                let _ = std::fs::remove_file(&dp_path);
            }
        }
    }
    Ok(())
}

pub(crate) fn save_blocked_users_raw(users: &[String]) -> Result<(), String> {
    let path = blocked_users_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let text = serde_json::to_string(users).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands: appearance, blocked/ignored users, collapsables, profile,
// voice settings, DnD, unread, notification mutes
// ---------------------------------------------------------------------------

// The on-disk shape of the device-global half of AppearanceSettings — just
// `slot` (see appearance_settings_path()'s doc comment for why `skin` isn't
// here).
#[derive(Serialize, Deserialize)]
struct GlobalAppearanceFile {
    #[serde(default = "default_appearance_slot")]
    slot: String,
}

#[tauri::command]
pub(crate) fn load_appearance() -> AppearanceSettings {
    let slot = appearance_settings_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(&p).ok())
        .and_then(|s| serde_json::from_str::<GlobalAppearanceFile>(&s).ok())
        .map(|g| g.slot)
        .unwrap_or_else(default_appearance_slot);
    let skin = crate::accounts::active_skin_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(&p).ok())
        .and_then(|s| serde_json::from_str(&s).ok());
    AppearanceSettings { slot, skin }
}

#[tauri::command]
pub(crate) fn save_appearance(settings: AppearanceSettings) -> Result<(), String> {
    // `slot` is device-global — always persisted, even with no active
    // account yet.
    let path = appearance_settings_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Dir error: {e}"))?;
    }
    let json = serde_json::to_string_pretty(&GlobalAppearanceFile {
        slot: settings.slot.clone(),
    })
    .map_err(|e| format!("Serialize: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("Write error: {e}"))?;

    // `skin` is per-account; best-effort so a plain slot switch (away from
    // "custom") still succeeds before any account exists.
    if let Ok(skin_path) = crate::accounts::active_skin_path() {
        if let Some(parent) = skin_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        match &settings.skin {
            Some(skin) => {
                if let Ok(json) = serde_json::to_string_pretty(skin) {
                    let _ = std::fs::write(&skin_path, json);
                }
            }
            None => {
                let _ = std::fs::remove_file(&skin_path);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn load_blocked_users() -> Result<Vec<String>, String> {
    let path = blocked_users_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("parse: {e}"))
}

#[tauri::command]
pub(crate) fn save_blocked_users(blocked: Vec<String>) -> Result<(), String> {
    let path = blocked_users_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let text = serde_json::to_string(&blocked).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn load_ignored_users() -> Result<Vec<String>, String> {
    let path = ignored_users_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("parse: {e}"))
}

#[tauri::command]
pub(crate) fn save_ignored_users(ignored: Vec<String>) -> Result<(), String> {
    let path = ignored_users_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let text = serde_json::to_string(&ignored).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn load_dnd_settings() -> Result<bool, String> {
    let path = dnd_settings_path()?;
    if !path.exists() {
        return Ok(false);
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?;
    let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("parse: {e}"))?;
    Ok(v.get("active").and_then(|a| a.as_bool()).unwrap_or(false))
}

#[tauri::command]
pub(crate) fn save_dnd_settings(active: bool) -> Result<(), String> {
    let path = dnd_settings_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let text = serde_json::to_string(&serde_json::json!({ "active": active }))
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn load_collapsed_categories() -> Result<serde_json::Value, String> {
    let path = collapsed_categories_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("parse: {e}"))
}

#[tauri::command]
pub(crate) fn save_collapsed_categories(state: serde_json::Value) -> Result<(), String> {
    let path = collapsed_categories_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let text = serde_json::to_string(&state).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn load_pinned_channels() -> Result<serde_json::Value, String> {
    let path = pinned_channels_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("parse: {e}"))
}

#[tauri::command]
pub(crate) fn save_pinned_channels(state: serde_json::Value) -> Result<(), String> {
    let path = pinned_channels_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let text = serde_json::to_string(&state).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn load_notification_mutes() -> Result<serde_json::Value, String> {
    let path = notification_mutes_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({ "hubs": {}, "channels": {} }));
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("parse: {e}"))
}

#[tauri::command]
pub(crate) fn save_notification_mutes(state: serde_json::Value) -> Result<(), String> {
    let path = notification_mutes_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let text = serde_json::to_string(&state).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn load_unread_state() -> Result<serde_json::Value, String> {
    let path = unread_state_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("parse: {e}"))
}

#[tauri::command]
pub(crate) fn save_unread_state(state: serde_json::Value) -> Result<(), String> {
    let path = unread_state_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let text = serde_json::to_string(&state).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn get_profile() -> LocalProfile {
    load_profile()
}

#[tauri::command]
pub(crate) fn save_profile(profile: LocalProfile) -> Result<(), String> {
    save_profile_to_disk(&profile)
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
pub(crate) fn get_notification_prefs() -> Result<serde_json::Value, String> {
    let path = notif_prefs_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn set_notification_pref(hub_url: String, level: String) -> Result<(), String> {
    let path = notif_prefs_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut prefs: serde_json::Map<String, serde_json::Value> = if path.exists() {
        let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).unwrap_or_default()
    } else {
        serde_json::Map::new()
    };
    prefs.insert(hub_url, serde_json::Value::String(level));
    let serialized = serde_json::to_string_pretty(&prefs).map_err(|e| e.to_string())?;
    std::fs::write(&path, serialized).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn clear_local_data() -> Result<(), String> {
    let paths = [
        unread_state_path()?,
        notification_mutes_path()?,
        pinned_channels_path()?,
        collapsed_categories_path()?,
        blocked_users_path()?,
        voice_settings_path()?,
    ];
    for p in paths {
        if p.exists() {
            let _ = std::fs::remove_file(&p);
        }
    }
    Ok(())
}
