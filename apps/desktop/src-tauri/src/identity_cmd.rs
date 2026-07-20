#![allow(dead_code)]
use crate::identity::Identity;
use crate::local_store::{save_active_hub_id, save_hubs_list};
use crate::state::{active_session, AppState};
use tauri::State;

#[tauri::command]
pub(crate) fn get_recovery_phrase() -> Result<String, String> {
    let path = Identity::default_path().map_err(|e| e.to_string())?;
    let identity = Identity::load(&path).map_err(|e| e.to_string())?;
    Ok(identity.recovery_phrase())
}

#[tauri::command]
pub(crate) fn recover_identity_from_phrase(
    phrase: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let restored = Identity::from_recovery_phrase(phrase.trim())
        .map_err(|e| format!("Invalid recovery phrase: {e}"))?;
    let new_pubkey = restored.public_key_hex();

    let identity_path = Identity::default_path().map_err(|e| e.to_string())?;

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
    save_active_hub_id(None);

    let _ = save_hubs_list(&[]);

    restored
        .save(&identity_path)
        .map_err(|e| format!("Failed to save identity: {e}"))?;

    Ok(new_pubkey)
}

#[tauri::command]
pub(crate) fn get_my_public_key() -> Result<String, String> {
    let path = Identity::default_path().map_err(|e| e.to_string())?;
    let (identity, _) = Identity::load_or_create(&path).map_err(|e| e.to_string())?;
    Ok(identity.public_key_hex())
}

#[tauri::command]
pub(crate) fn get_my_pubkey() -> Result<String, String> {
    get_my_public_key()
}

#[tauri::command]
pub(crate) fn sign_message(message: String) -> Result<String, String> {
    let path = Identity::default_path().map_err(|e| e.to_string())?;
    let (identity, _) = Identity::load_or_create(&path).map_err(|e| e.to_string())?;
    let sig = identity.sign(message.as_bytes());
    Ok(hex::encode(sig.to_bytes()))
}

pub(crate) fn load_master_identity() -> Result<crate::identity::MasterIdentity, String> {
    let path = Identity::default_path().map_err(|e| e.to_string())?;
    let identity = Identity::load(&path).map_err(|e| e.to_string())?;
    identity.master().map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn push_prefs_blob() -> Result<(), String> {
    let master = load_master_identity()?;
    let blob_key = crate::prefs_blob::derive_blob_key(&master);
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
    crate::prefs_blob::push_prefs_blob(&master, &blob_key, &home_hubs, &client)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn pull_and_apply_prefs_blob() -> Result<crate::prefs_blob::LocalPrefs, String> {
    let master = load_master_identity()?;
    let blob_key = crate::prefs_blob::derive_blob_key(&master);
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
    let prefs = crate::prefs_blob::pull_prefs_blob(
        &master.public_key_hex(),
        &home_hubs,
        &blob_key,
        &client,
    )
    .await
    .map_err(|e| e.to_string())?;
    let _ = crate::local_store::save_blocked_users_raw(&prefs.blocked_users);
    let _ = crate::local_store::save_voice_settings_to_disk(&prefs.voice_settings);
    Ok(prefs)
}

// ---------------------------------------------------------------------------
// Public profile / directory
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct PublicHubEntryInput {
    pub hub_url: String,
    pub hub_name: String,
    pub joined_at: u64,
}

#[tauri::command]
pub(crate) async fn save_public_profile(
    entries: Vec<PublicHubEntryInput>,
    display_name: String,
    avatar: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    use crate::identity::{PublicHubEntry, PublicHubProfile};

    let identity_path = Identity::default_path().map_err(|e| format!("Identity path: {e}"))?;
    let identity = Identity::load(&identity_path).map_err(|e| format!("Load identity: {e}"))?;
    let pubkey = identity.public_key_hex();

    let issued_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let public_hubs: Vec<PublicHubEntry> = entries
        .into_iter()
        .map(|e| PublicHubEntry {
            hub_url: e.hub_url,
            hub_name: e.hub_name,
            joined_at: e.joined_at,
        })
        .collect();

    let signing_bytes = PublicHubProfile::signing_bytes(&pubkey, &public_hubs, issued_at);
    let signature = hex::encode(identity.sign(&signing_bytes).to_bytes());

    let profile = PublicHubProfile {
        pubkey: pubkey.clone(),
        display_name,
        avatar,
        public_hubs,
        issued_at,
        signature,
    };

    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .put(format!("{hub_url}/profile/{pubkey}"))
        .bearer_auth(&token)
        .json(&profile)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Hub rejected profile update: {}",
            resp.text().await.unwrap_or_default()
        ));
    }

    Ok(())
}

#[tauri::command]
pub(crate) async fn fetch_public_profile(
    hub_url: String,
    pubkey: String,
) -> Result<Option<serde_json::Value>, String> {
    let client = reqwest::Client::new();
    let hub_url = hub_url.trim_end_matches('/');
    let resp = client
        .get(format!("{hub_url}/profile/{pubkey}"))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    if !resp.status().is_success() {
        return Err(format!(
            "Hub returned error: {}",
            resp.text().await.unwrap_or_default()
        ));
    }

    let v: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse response: {e}"))?;
    Ok(Some(v))
}

#[tauri::command]
pub(crate) async fn submit_to_directory(
    directory_url: String,
    tags: Vec<String>,
    language: String,
    bio: String,
    invite_code: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();

    let sign_resp = client
        .post(format!("{hub_url}/admin/directory-sign"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "hub_url": hub_url,
            "tags": tags,
            "language": language,
            "bio": bio,
            "invite_code": invite_code,
        }))
        .send()
        .await
        .map_err(|e| format!("Sign request failed: {e}"))?;

    if !sign_resp.status().is_success() {
        return Err(format!(
            "Hub refused to sign: {}",
            sign_resp.text().await.unwrap_or_default()
        ));
    }

    let signed: serde_json::Value = sign_resp
        .json()
        .await
        .map_err(|e| format!("Sign response decode: {e}"))?;

    let dir_base = directory_url.trim_end_matches('/');
    let submit_resp = client
        .post(format!("{dir_base}/api/hubs"))
        .json(&serde_json::json!({
            "hub_url": hub_url,
            "tags": tags,
            "language": language,
            "bio": bio,
            "invite_code": invite_code,
            "canonical_payload": signed["canonical_payload"],
            "hub_pubkey": signed["hub_pubkey"],
            "signature": signed["signature"],
        }))
        .send()
        .await
        .map_err(|e| format!("Directory submit failed: {e}"))?;

    if !submit_resp.status().is_success() {
        return Err(format!(
            "Directory rejected submission: {}",
            submit_resp.text().await.unwrap_or_default()
        ));
    }

    Ok(())
}
