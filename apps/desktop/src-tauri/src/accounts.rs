// Per-account storage: the desktop analogue of web's IndexedDB identity rows
// + `wavvon:acct:<pubkey>:*` localStorage namespaces (decisions.md "Multi-account
// is device-local storage namespacing" + settings-ia.md §3).
//
// Layout under `~/.wavvon/`:
//   accounts.json        — registry: [{id, label, order, created_at}] + active_id
//   accounts/<id>/        — one directory per account, <id> is the account's own
//                            pubkey (owned identity's pubkey, or the paired
//                            subkey's pubkey — same "id" convention as web's
//                            IdentityRecord.id)
//     identity.json        — owned identity (Identity::save format), if any
//     paired_identity.json — paired-device identity (PairingComplete), if any
//     home_hub_list.json   — cached master-signed HomeHubList
//     dr_sessions.json     — DM double-ratchet session state
//     group_sender_keys.json — DM group sender-key state
//     hubs.json             — saved/joined hub list
//     active_hub             — pointer to the last-selected hub
//     voice_gains.json      — per-peer voice volume overrides
//     blocked_users.json    — local cache of the synced DM block list
//     ignored_users.json    — locally-ignored pubkeys
//     pinned_channels.json  — pinned-channel flags, keyed by hub/channel id
//     collapsed_categories.json — collapsed-category flags
//     notification_mutes.json  — per-hub/channel notify mode
//     unread.json           — unread counts, keyed by hub/channel id
//     dnd_settings.json     — do-not-disturb toggle
//     notification_prefs.json — per-hub notify level (legacy key shape)
//     default_profile.json  — the local default profile card
//     skin.json             — the active custom-theme skin, if any
//
// settings-ia.md §7 records which of local_store.rs's files stayed
// device-global on purpose (voice device/profile settings, and the theme
// *slot* itself) vs moved here — matched item-by-item against which
// localStorage keys web scopes under `wavvon:acct:<pubkey>:*` vs leaves
// unscoped. See local_store.rs's load_appearance/load_profile for the
// slot-vs-skin and theme-vs-default_profile splits.
//
// Every existing per-identity path helper (Identity::default_path(),
// pairing.rs/auth_creds.rs's paired_identity_path(), home_hub.rs's
// home_hub_list_path(), dm.rs's dr_sessions_path()/group_sender_keys_path(),
// local_store.rs's per-user path helpers) now delegates to the *_path()
// functions below, so every existing call site (devices.rs, dm.rs, farm.rs,
// identity_cmd.rs, pairing.rs, home_hub.rs, local_store.rs) keeps working
// unchanged, transparently re-targeted at the active account.
//
// Device-local only: this registry is never synced to a hub, never enters the
// prefs blob (same rule as web).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

use crate::identity::Identity;
use crate::state::AppState;

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn wavvon_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".wavvon"))
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct Registry {
    #[serde(default)]
    accounts: Vec<AccountEntry>,
    #[serde(default)]
    active_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct AccountEntry {
    id: String,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    order: Option<u64>,
    #[serde(default)]
    created_at: u64,
}

/// One account as reported to the frontend switcher.
#[derive(Serialize, Clone, Debug)]
pub struct AccountSummary {
    pub id: String,
    pub label: Option<String>,
    pub order: u64,
    pub is_active: bool,
    /// "owned" (has its own identity.json), "paired" (claimed via QR pairing,
    /// no master seed on this device), or "empty" (registered but neither
    /// file exists yet — shouldn't normally be observed).
    pub kind: String,
}

// ---------------------------------------------------------------------------
// Base-parameterized core logic — testable without touching the real home dir
// ---------------------------------------------------------------------------

fn registry_path_in(base: &Path) -> PathBuf {
    base.join("accounts.json")
}

fn account_dir_in(base: &Path, id: &str) -> PathBuf {
    base.join("accounts").join(id)
}

fn load_registry_in(base: &Path) -> Registry {
    std::fs::read_to_string(registry_path_in(base))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_registry_in(base: &Path, reg: &Registry) -> Result<(), String> {
    std::fs::create_dir_all(base).map_err(|e| format!("mkdir: {e}"))?;
    let json = serde_json::to_string_pretty(reg).map_err(|e| e.to_string())?;
    std::fs::write(registry_path_in(base), json).map_err(|e| format!("write: {e}"))
}

fn next_order_in(reg: &Registry) -> u64 {
    reg.accounts
        .iter()
        .filter_map(|a| a.order)
        .max()
        .unwrap_or(0)
        + 1
}

/// Explicit order wins; unordered accounts (shouldn't happen post-creation,
/// but mirrors web's accountOrder.ts fallback) sort last by label/id.
fn sort_key(a: &AccountEntry) -> (u64, String) {
    match a.order {
        Some(o) => (o, String::new()),
        None => (
            u64::MAX,
            a.label
                .clone()
                .unwrap_or_else(|| a.id.clone())
                .to_lowercase(),
        ),
    }
}

fn sorted(mut entries: Vec<AccountEntry>) -> Vec<AccountEntry> {
    entries.sort_by(|a, b| sort_key(a).cmp(&sort_key(b)).then_with(|| a.id.cmp(&b.id)));
    entries
}

fn account_kind_in(base: &Path, id: &str) -> String {
    let dir = account_dir_in(base, id);
    if dir.join("paired_identity.json").exists() {
        // Paired identity takes precedence over an incidental owned identity
        // in the same slot, mirroring auth_creds.rs's existing precedence.
        "paired".to_string()
    } else if dir.join("identity.json").exists() {
        "owned".to_string()
    } else {
        "empty".to_string()
    }
}

fn to_summary(base: &Path, reg: &Registry, entry: &AccountEntry) -> AccountSummary {
    AccountSummary {
        id: entry.id.clone(),
        label: entry.label.clone(),
        order: entry.order.unwrap_or(0),
        is_active: reg.active_id.as_deref() == Some(entry.id.as_str()),
        kind: account_kind_in(base, &entry.id),
    }
}

fn list_accounts_in(base: &Path) -> Vec<AccountSummary> {
    let reg = load_registry_in(base);
    sorted(reg.accounts.clone())
        .iter()
        .map(|a| to_summary(base, &reg, a))
        .collect()
}

/// Directory for the active account. If nothing is active but exactly one
/// account is registered, that one is adopted (mirrors web's loadIdentity
/// fallback). If no account is registered at all (fresh install — alpha
/// rules, no migration of the old single-identity file, settings-ia.md §5),
/// this deliberately does *not* auto-create one: the frontend's AccountRoot
/// gates on `list_accounts()` being empty and drives account creation
/// explicitly via `create_account`/pairing, so every existing
/// identity-dependent command (get_my_public_key, etc.) can assume an active
/// account exists by the time it's ever invoked from the running app. Erring
/// here (rather than silently minting an identity) also keeps this function
/// side-effect-free when called from tests that don't go through the UI.
fn active_account_dir_in(base: &Path) -> Result<PathBuf, String> {
    let mut reg = load_registry_in(base);

    if let Some(id) = reg.active_id.clone() {
        if reg.accounts.iter().any(|a| a.id == id) {
            let dir = account_dir_in(base, &id);
            std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;
            return Ok(dir);
        }
    }

    if reg.accounts.len() == 1 {
        let id = reg.accounts[0].id.clone();
        reg.active_id = Some(id.clone());
        save_registry_in(base, &reg)?;
        let dir = account_dir_in(base, &id);
        std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;
        return Ok(dir);
    }

    // Either no account is registered yet, or more than one exists but the
    // active pointer is stale/missing — ambiguous either way. Refuse rather
    // than silently guessing; the frontend routes this to the account-gate
    // screen.
    Err("No active account selected".to_string())
}

/// Shared by every "put this identity on this device" path (fresh generate,
/// recovery phrase, backup restore): writes identity.json into a new
/// per-account dir and registers it. Errors if the identity's pubkey is
/// already registered — callers that want dedupe-not-error semantics
/// (backup restore) check the registry themselves first.
fn register_new_account_in(
    base: &Path,
    identity: Identity,
    label: Option<String>,
) -> Result<AccountSummary, String> {
    let id = identity.public_key_hex();

    let mut reg = load_registry_in(base);
    if reg.accounts.iter().any(|a| a.id == id) {
        return Err("This identity is already on this device".to_string());
    }

    let dir = account_dir_in(base, &id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;
    identity
        .save(&dir.join("identity.json"))
        .map_err(|e| e.to_string())?;

    let order = next_order_in(&reg);
    reg.accounts.push(AccountEntry {
        id: id.clone(),
        label: label.filter(|l| !l.trim().is_empty()),
        order: Some(order),
        created_at: now_secs(),
    });
    if reg.active_id.is_none() {
        reg.active_id = Some(id.clone());
    }
    save_registry_in(base, &reg)?;

    let entry = reg.accounts.iter().find(|a| a.id == id).unwrap().clone();
    Ok(to_summary(base, &reg, &entry))
}

fn create_account_in(
    base: &Path,
    label: Option<String>,
    phrase: Option<String>,
) -> Result<AccountSummary, String> {
    let identity = match phrase {
        Some(p) => Identity::from_recovery_phrase(p.trim())
            .map_err(|e| format!("Invalid recovery phrase: {e}"))?,
        None => Identity::generate(),
    };
    register_new_account_in(base, identity, label)
}

/// Backup-restore path (settings-ia.md §4a): unlike `create_account_in`, an
/// identity that's already on this device is not an error — it just returns
/// the existing account with `is_new: false`, mirroring web's
/// `resolveOrCreateAccount` dedupe semantics.
fn create_account_from_secret_key_hex_in(
    base: &Path,
    secret_key_hex: &str,
    label: Option<String>,
) -> Result<(AccountSummary, bool), String> {
    let identity = Identity::from_secret_key_hex(secret_key_hex).map_err(|e| e.to_string())?;
    let id = identity.public_key_hex();
    let reg = load_registry_in(base);
    if let Some(entry) = reg.accounts.iter().find(|a| a.id == id).cloned() {
        return Ok((to_summary(base, &reg, &entry), false));
    }
    let summary = register_new_account_in(base, identity, label)?;
    Ok((summary, true))
}

fn switch_account_in(base: &Path, id: &str) -> Result<AccountSummary, String> {
    let mut reg = load_registry_in(base);
    if !reg.accounts.iter().any(|a| a.id == id) {
        return Err("Unknown account".to_string());
    }
    if reg.active_id.as_deref() != Some(id) {
        reg.active_id = Some(id.to_string());
        save_registry_in(base, &reg)?;
    }
    let entry = reg.accounts.iter().find(|a| a.id == id).unwrap().clone();
    Ok(to_summary(base, &reg, &entry))
}

fn remove_account_in(base: &Path, id: &str) -> Result<Option<String>, String> {
    let mut reg = load_registry_in(base);
    if !reg.accounts.iter().any(|a| a.id == id) {
        return Err("Unknown account".to_string());
    }
    let was_active = reg.active_id.as_deref() == Some(id);
    reg.accounts.retain(|a| a.id != id);
    if was_active {
        reg.active_id = sorted(reg.accounts.clone()).first().map(|a| a.id.clone());
    }
    save_registry_in(base, &reg)?;

    // Purge the whole per-account namespace: identity material, home hub
    // designation, and DM ratchet/session state must not outlive removal
    // (decisions.md "Removing an account ... purges its namespace").
    let dir = account_dir_in(base, id);
    let _ = std::fs::remove_dir_all(&dir);

    Ok(reg.active_id.clone())
}

fn rename_account_in(base: &Path, id: &str, label: String) -> Result<AccountSummary, String> {
    let mut reg = load_registry_in(base);
    let trimmed = label.trim().to_string();
    {
        let entry = reg
            .accounts
            .iter_mut()
            .find(|a| a.id == id)
            .ok_or("Unknown account")?;
        entry.label = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        };
    }
    save_registry_in(base, &reg)?;
    let entry = reg.accounts.iter().find(|a| a.id == id).unwrap().clone();
    Ok(to_summary(base, &reg, &entry))
}

fn reorder_accounts_in(
    base: &Path,
    ids_in_order: &[String],
) -> Result<Vec<AccountSummary>, String> {
    let mut reg = load_registry_in(base);
    for (idx, id) in ids_in_order.iter().enumerate() {
        if let Some(entry) = reg.accounts.iter_mut().find(|a| &a.id == id) {
            entry.order = Some((idx + 1) as u64);
        }
    }
    save_registry_in(base, &reg)?;
    Ok(list_accounts_in(base))
}

// ---------------------------------------------------------------------------
// Production path helpers — everything below resolves against ~/.wavvon/
// ---------------------------------------------------------------------------

pub(crate) fn active_account_dir() -> Result<PathBuf, String> {
    active_account_dir_in(&wavvon_dir()?)
}

pub(crate) fn active_identity_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("identity.json"))
}

pub(crate) fn active_paired_identity_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("paired_identity.json"))
}

pub(crate) fn active_home_hub_list_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("home_hub_list.json"))
}

pub(crate) fn active_dr_sessions_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("dr_sessions.json"))
}

pub(crate) fn active_group_sender_keys_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("group_sender_keys.json"))
}

// local_store.rs's per-user files (settings-ia.md §7 fix): everything below
// backs a local_store.rs path helper of the same data. Voice device/profile
// settings and the theme *slot* deliberately stay out of this list — they
// stay device-global in local_store.rs's own path helpers, matching web's
// unscoped `wavvon.audio_profile`/PTT/device-id keys and unscoped
// `wavvon:appearance` slot.

pub(crate) fn active_saved_hubs_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("hubs.json"))
}

pub(crate) fn active_selected_hub_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("active_hub"))
}

pub(crate) fn active_voice_gains_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("voice_gains.json"))
}

pub(crate) fn active_blocked_users_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("blocked_users.json"))
}

pub(crate) fn active_ignored_users_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("ignored_users.json"))
}

pub(crate) fn active_pinned_channels_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("pinned_channels.json"))
}

pub(crate) fn active_collapsed_categories_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("collapsed_categories.json"))
}

pub(crate) fn active_notification_mutes_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("notification_mutes.json"))
}

pub(crate) fn active_unread_state_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("unread.json"))
}

pub(crate) fn active_dnd_settings_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("dnd_settings.json"))
}

pub(crate) fn active_notif_prefs_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("notification_prefs.json"))
}

pub(crate) fn active_default_profile_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("default_profile.json"))
}

pub(crate) fn active_skin_path() -> Result<PathBuf, String> {
    Ok(active_account_dir()?.join("skin.json"))
}

/// identity.json path for an arbitrary (not necessarily active) registered
/// account — used by backup export, which reads a specific account's secret
/// key rather than whichever one is currently active.
pub(crate) fn account_identity_path_for(id: &str) -> Result<PathBuf, String> {
    Ok(account_dir_in(&wavvon_dir()?, id).join("identity.json"))
}

pub(crate) fn account_label_for(id: &str) -> Result<Option<String>, String> {
    let reg = load_registry_in(&wavvon_dir()?);
    Ok(reg
        .accounts
        .iter()
        .find(|a| a.id == id)
        .and_then(|a| a.label.clone()))
}

pub(crate) fn create_account_from_secret_key_hex(
    secret_key_hex: &str,
    label: Option<String>,
) -> Result<(AccountSummary, bool), String> {
    create_account_from_secret_key_hex_in(&wavvon_dir()?, secret_key_hex, label)
}

/// Tears down live per-account handles the way web's resetHubSessions() does
/// before an account switch/removal: abort every connected hub's WebSocket
/// task and clear the active-hub pointer (both in-memory and on disk).
/// Session tokens live only in AppState.hubs (never written to disk), so
/// this abort is the whole of "purge session tokens" on the Rust side.
fn teardown_live_sessions(state: &State<'_, AppState>) {
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
    crate::local_store::save_active_hub_id(None);

    // A joined voice call belongs to whichever hub session was just torn
    // down above — its stop_tx/ws_tx reference a connection that no longer
    // exists, so it must not linger in AppState across the switch (the
    // voice-side half of "reset stale per-account state", mirroring the hub
    // session drain above).
    if let Some(session) = state.voice.lock().unwrap().take() {
        let _ = session.stop_tx.send(());
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub(crate) fn list_accounts() -> Result<Vec<AccountSummary>, String> {
    Ok(list_accounts_in(&wavvon_dir()?))
}

#[tauri::command]
pub(crate) fn create_account(
    label: Option<String>,
    phrase: Option<String>,
) -> Result<AccountSummary, String> {
    create_account_in(&wavvon_dir()?, label, phrase)
}

#[tauri::command]
pub(crate) fn switch_account(
    id: String,
    state: State<'_, AppState>,
) -> Result<AccountSummary, String> {
    let base = wavvon_dir()?;
    let reg = load_registry_in(&base);
    let is_switch = reg.active_id.as_deref() != Some(id.as_str());
    let summary = switch_account_in(&base, &id)?;
    if is_switch {
        // Teardown happens after the registry write succeeds so a failed
        // switch (unknown id) never tears down a working session.
        teardown_live_sessions(&state);
    }
    Ok(summary)
}

#[tauri::command]
pub(crate) fn remove_account(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let base = wavvon_dir()?;
    let reg = load_registry_in(&base);
    let was_active = reg.active_id.as_deref() == Some(id.as_str());
    remove_account_in(&base, &id)?;
    if was_active {
        teardown_live_sessions(&state);
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn rename_account(id: String, label: String) -> Result<AccountSummary, String> {
    rename_account_in(&wavvon_dir()?, &id, label)
}

#[tauri::command]
pub(crate) fn reorder_accounts(ids_in_order: Vec<String>) -> Result<Vec<AccountSummary>, String> {
    reorder_accounts_in(&wavvon_dir()?, &ids_in_order)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Isolated scratch dir per test — never touches the real ~/.wavvon/.
    /// Cleaned up on drop so repeated test runs don't accumulate junk.
    struct TempBase(PathBuf);

    impl TempBase {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir()
                .join(format!("wavvon-accounts-test-{name}-{}", now_secs_nanos()));
            std::fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }

    impl Drop for TempBase {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn now_secs_nanos() -> u128 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    }

    #[test]
    fn create_switch_remove_purge_roundtrip() {
        let base = TempBase::new("roundtrip");

        // No accounts yet.
        assert!(list_accounts_in(&base.0).is_empty());

        // First account auto-activates.
        let a = create_account_in(&base.0, Some("Laptop".to_string()), None).expect("create a");
        assert!(a.is_active);
        assert_eq!(a.kind, "owned");
        assert_eq!(a.label.as_deref(), Some("Laptop"));

        // Second account does not steal activity.
        let b = create_account_in(&base.0, Some("Phone".to_string()), None).expect("create b");
        assert!(!b.is_active);

        let listed = list_accounts_in(&base.0);
        assert_eq!(listed.len(), 2);
        assert!(listed.iter().find(|s| s.id == a.id).unwrap().is_active);
        assert!(!listed.iter().find(|s| s.id == b.id).unwrap().is_active);

        // Switching flips the active pointer.
        let switched = switch_account_in(&base.0, &b.id).expect("switch to b");
        assert!(switched.is_active);
        let listed = list_accounts_in(&base.0);
        assert!(listed.iter().find(|s| s.id == a.id).unwrap().kind == "owned");
        assert!(!listed.iter().find(|s| s.id == a.id).unwrap().is_active);
        assert!(listed.iter().find(|s| s.id == b.id).unwrap().is_active);

        // b's per-account files exist before removal.
        let b_dir = account_dir_in(&base.0, &b.id);
        assert!(b_dir.join("identity.json").exists());
        std::fs::write(b_dir.join("home_hub_list.json"), "{}").unwrap();
        std::fs::write(b_dir.join("dr_sessions.json"), "{}").unwrap();

        // Removing the active account purges its whole namespace and falls
        // back to the remaining account.
        let new_active = remove_account_in(&base.0, &b.id).expect("remove b");
        assert_eq!(new_active.as_deref(), Some(a.id.as_str()));
        assert!(!b_dir.exists());

        let listed = list_accounts_in(&base.0);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, a.id);
        assert!(listed[0].is_active);

        // Removing the last account leaves an empty, valid registry.
        remove_account_in(&base.0, &a.id).expect("remove a");
        assert!(list_accounts_in(&base.0).is_empty());
    }

    #[test]
    fn create_account_rejects_duplicate_phrase_import() {
        let base = TempBase::new("dup-phrase");
        let identity = Identity::generate();
        let phrase = identity.recovery_phrase();

        create_account_in(&base.0, None, Some(phrase.clone())).expect("first import");
        let err = create_account_in(&base.0, None, Some(phrase)).unwrap_err();
        assert!(err.contains("already"));
    }

    #[test]
    fn rename_and_reorder_round_trip() {
        let base = TempBase::new("rename-reorder");
        let a = create_account_in(&base.0, None, None).unwrap();
        let b = create_account_in(&base.0, None, None).unwrap();

        let renamed = rename_account_in(&base.0, &a.id, "  Main  ".to_string()).unwrap();
        assert_eq!(renamed.label.as_deref(), Some("Main"));

        let cleared = rename_account_in(&base.0, &a.id, "   ".to_string()).unwrap();
        assert_eq!(cleared.label, None);

        let reordered = reorder_accounts_in(&base.0, &[b.id.clone(), a.id.clone()]).unwrap();
        assert_eq!(reordered[0].id, b.id);
        assert_eq!(reordered[1].id, a.id);
    }

    #[test]
    fn local_store_files_are_isolated_per_account_and_purged_on_remove() {
        // Exercises the same active_account_dir_in() primitive every
        // local_store.rs per-user path helper (pinned_channels, blocked
        // users, notification mutes, ...) delegates to via its production
        // active_*_path() wrappers — proving those files land inside each
        // account's own directory rather than one shared device-global file.
        let base = TempBase::new("local-store-isolation");
        let a = create_account_in(&base.0, Some("A".to_string()), None).expect("create a");
        let b = create_account_in(&base.0, Some("B".to_string()), None).expect("create b");

        switch_account_in(&base.0, &a.id).expect("switch to a");
        let dir_a = active_account_dir_in(&base.0).expect("active dir a");
        std::fs::write(dir_a.join("pinned_channels.json"), r#"{"scope":"a"}"#).unwrap();

        switch_account_in(&base.0, &b.id).expect("switch to b");
        let dir_b = active_account_dir_in(&base.0).expect("active dir b");
        std::fs::write(dir_b.join("pinned_channels.json"), r#"{"scope":"b"}"#).unwrap();

        assert_ne!(dir_a, dir_b);
        assert_eq!(
            std::fs::read_to_string(dir_a.join("pinned_channels.json")).unwrap(),
            r#"{"scope":"a"}"#
        );
        assert_eq!(
            std::fs::read_to_string(dir_b.join("pinned_channels.json")).unwrap(),
            r#"{"scope":"b"}"#
        );

        // Removing b purges its local-store file along with the rest of its
        // namespace; a's copy is untouched.
        remove_account_in(&base.0, &b.id).expect("remove b");
        assert!(!dir_b.join("pinned_channels.json").exists());
        assert!(dir_a.join("pinned_channels.json").exists());
    }

    #[test]
    fn active_account_dir_errors_when_no_accounts_exist() {
        let base = TempBase::new("no-accounts");
        assert!(list_accounts_in(&base.0).is_empty());

        // No auto-create: a fresh install starts empty (alpha rules, no
        // migration) and the frontend gate is responsible for creating
        // account #1 explicitly. This must also not touch disk as a
        // side effect — no directory should appear under `accounts/`.
        assert!(active_account_dir_in(&base.0).is_err());
        assert!(!base.0.join("accounts").exists());
    }
}
