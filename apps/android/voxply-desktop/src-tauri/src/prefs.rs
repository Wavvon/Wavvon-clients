use crate::state::StoredVoiceSettings;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

// --- Path helpers ---

pub(crate) fn voice_settings_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("voice.json"))
}

pub(crate) fn appearance_settings_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("appearance.json"))
}

pub(crate) fn unread_state_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("unread.json"))
}

pub(crate) fn notification_mutes_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("notification_mutes.json"))
}

pub(crate) fn pinned_channels_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("pinned_channels.json"))
}

pub(crate) fn collapsed_categories_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("collapsed_categories.json"))
}

pub(crate) fn blocked_users_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("blocked_users.json"))
}

pub(crate) fn profile_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("profile.json"))
}

// --- Appearance ---

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct AppearanceSettings {
    #[serde(default = "default_appearance_slot")]
    pub(crate) slot: String,
    #[serde(default)]
    pub(crate) skin: Option<serde_json::Value>,
}

fn default_appearance_slot() -> String {
    "calm".to_string()
}

#[tauri::command]
pub(crate) fn load_appearance() -> AppearanceSettings {
    appearance_settings_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(&p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(AppearanceSettings {
            slot: "calm".to_string(),
            skin: None,
        })
}

#[tauri::command]
pub(crate) fn save_appearance(settings: AppearanceSettings) -> Result<(), String> {
    let path = appearance_settings_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Dir error: {e}"))?;
    }
    let json = serde_json::to_string_pretty(&settings).map_err(|e| format!("Serialize: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("Write error: {e}"))?;
    Ok(())
}

// --- Blocked users ---

#[tauri::command]
pub(crate) fn load_blocked_users() -> Result<Vec<String>, String> {
    let path = blocked_users_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("parse: {e}"))
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

// --- Collapsed categories ---

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

// --- Pinned channels ---

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

// --- Notification mutes ---

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

// --- Unread state ---

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

// --- Local Profile ---

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct NamedProfile {
    /// Stable identifier (UUID generated on the client when the profile is
    /// created).
    pub(crate) id: String,
    /// User-given label for this profile, e.g. "Work" or "Gaming".
    pub(crate) label: String,
    /// Display name applied when this profile is used.
    #[serde(default)]
    pub(crate) display_name: String,
    /// Optional avatar (base64 data URL).
    #[serde(default)]
    pub(crate) avatar: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub(crate) struct LocalProfile {
    /// All profiles the user has defined. Empty on fresh installs.
    #[serde(default)]
    pub(crate) profiles: Vec<NamedProfile>,
    /// Which profile to auto-apply on new hubs. Falls back to the first
    /// profile in the list when missing or stale.
    #[serde(default)]
    pub(crate) default_profile_id: Option<String>,

    /// Visual theme preference: "calm" | "classic" | "linear" | "light".
    /// Missing or unknown values fall back to calm at the client.
    #[serde(default)]
    pub(crate) theme: Option<String>,
}

impl LocalProfile {
    pub(crate) fn default_profile(&self) -> Option<&NamedProfile> {
        if self.profiles.is_empty() {
            return None;
        }
        if let Some(id) = self.default_profile_id.as_ref() {
            if let Some(p) = self.profiles.iter().find(|p| &p.id == id) {
                return Some(p);
            }
        }
        self.profiles.first()
    }
}

pub(crate) fn load_profile() -> LocalProfile {
    if let Ok(path) = profile_path() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(p) = serde_json::from_str::<LocalProfile>(&data) {
                return p;
            }
        }
    }
    LocalProfile::default()
}

pub(crate) fn save_profile_to_disk(profile: &LocalProfile) -> Result<(), String> {
    let path = profile_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Mkdir failed: {e}"))?;
    }
    let json = serde_json::to_string_pretty(profile).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Write failed: {e}"))?;
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

// --- Voice settings ---

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

// --- Clear local data ---

/// Wipe local-only state files (unread, notification mutes, pinned channels,
/// collapsed categories, voice settings). Identity and saved-hubs are NOT
/// touched -- those are user-meaningful and need an explicit recover/leave
/// flow.
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
            // Best-effort: if any single file fails to delete (file in use,
            // permissions), keep going so we delete what we can.
            let _ = std::fs::remove_file(&p);
        }
    }
    Ok(())
}

// --- Tray ---

/// Update the tray tooltip + title to reflect current unread count. Called
/// from the frontend whenever the aggregated unread number changes.
#[tauri::command]
pub(crate) fn set_tray_unread(count: u32, app: AppHandle) -> Result<(), String> {
    let tray = app.tray_by_id("main").ok_or("tray missing")?;
    let label = if count == 0 {
        "Voxply".to_string()
    } else if count > 99 {
        "Voxply — 99+ unread".to_string()
    } else {
        format!("Voxply — {count} unread")
    };
    tray.set_tooltip(Some(&label)).map_err(|e| e.to_string())?;
    Ok(())
}

// --- Update check ---

/// Background update check — fires once at startup and is entirely best-effort.
/// Any error is logged at WARN level; nothing is propagated to the caller.
pub(crate) async fn check_for_updates(app: AppHandle) {
    use tauri_plugin_updater::UpdaterExt;

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            tracing::warn!("updater unavailable: {e}");
            return;
        }
    };

    let update = match updater.check().await {
        Ok(Some(u)) => u,
        Ok(None) => return,
        Err(e) => {
            tracing::warn!("update check failed: {e}");
            return;
        }
    };

    #[derive(Clone, serde::Serialize)]
    struct UpdatePayload {
        version: String,
        notes: Option<String>,
    }

    let _ = app.emit(
        "update-available",
        UpdatePayload {
            version: update.version.clone(),
            notes: update.body.clone(),
        },
    );

    if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
        tracing::warn!("update download/install failed: {e}");
    }
}
