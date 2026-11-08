use crate::identity::{MasterIdentity, SignedPrefsBlob};
use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use anyhow::{anyhow, Result};
use hkdf::Hkdf;
use sha2::Sha256;

// ---- Types ----

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct LocalPrefs {
    pub blocked_users: Vec<String>,
    pub voice_settings: crate::local_store::StoredVoiceSettings,
    /// Viewer opt-out from the 🎂 birthday badge. Not yet wired to a local
    /// setting on this client (the in-app toggle is session-only, matching
    /// the existing "hide silenced channels" precedent) — carried here so
    /// the wire shape matches packages/core's PrefsBlobContents.
    #[serde(default)]
    pub hide_birthdays: Option<bool>,
    /// Web's generic settings map (packages/core `PrefsBlobContents.settings`):
    /// storage key -> raw stored string. This client does not read it, but it
    /// MUST carry it forward on every push — dropping it would wipe the other
    /// client's synced settings on the next write from here.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub settings: Option<serde_json::Value>,
    /// The saved-sticker collection (packages/core PrefsBlobContents.stickers).
    /// Kept as raw JSON so an entry written by a newer client survives. Every
    /// push must carry it forward: dropping it erases the collection.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stickers: Option<Vec<serde_json::Value>>,
}

// ---- Blob key derivation ----

pub fn derive_blob_key(master: &MasterIdentity) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(None, master.secret_seed().as_ref());
    let mut key = [0u8; 32];
    hk.expand(b"wavvon/prefs-blob-key/v1", &mut key)
        .expect("HKDF expand");
    key
}

// ---- Encryption / decryption ----

pub fn encrypt_prefs(blob_key: &[u8; 32], prefs: &LocalPrefs) -> Result<Vec<u8>> {
    let json = serde_json::to_vec(prefs)?;
    let cipher = Aes256Gcm::new_from_slice(blob_key).map_err(|e| anyhow!("{e}"))?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, json.as_ref())
        .map_err(|e| anyhow!("{e}"))?;
    let mut out = Vec::with_capacity(12 + ciphertext.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Generic so the archive export can keep fields this client does not model.
pub fn decrypt_prefs<T: serde::de::DeserializeOwned>(
    blob_key: &[u8; 32],
    data: &[u8],
) -> Result<T> {
    if data.len() < 12 {
        return Err(anyhow!("ciphertext too short"));
    }
    let nonce = Nonce::from_slice(&data[..12]);
    let cipher = Aes256Gcm::new_from_slice(blob_key).map_err(|e| anyhow!("{e}"))?;
    let plaintext = cipher
        .decrypt(nonce, &data[12..])
        .map_err(|e| anyhow!("decrypt: {e}"))?;
    Ok(serde_json::from_slice(&plaintext)?)
}

// ---- Hub I/O ----

/// The highest blob_version this account has read or written, kept locally so
/// a hub cannot replay an older signed blob: every one it ever stored verifies.
fn seen_version_path() -> Option<std::path::PathBuf> {
    crate::accounts::active_account_dir()
        .ok()
        .map(|d| d.join("prefs_blob_version.json"))
}

fn seen_version() -> u64 {
    seen_version_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0)
}

fn note_seen_version(version: u64) {
    if version > seen_version() {
        if let Some(p) = seen_version_path() {
            let _ = std::fs::write(p, version.to_string());
        }
    }
}

/// The newest of the blobs the home hubs returned, ignoring any older than
/// `floor`.
fn newest(found: Vec<(u64, LocalPrefs)>, floor: u64) -> Option<(u64, LocalPrefs)> {
    found
        .into_iter()
        .filter(|(v, _)| *v >= floor)
        .max_by_key(|(v, _)| *v)
}

/// The newest verified blob across every home hub. Asking them all matters: a
/// hub that answers 404 or holds an old copy must not stand in for the one
/// that has the current blob, or the next push drops what only that one held.
/// Ok(None) means a hub answered and none holds a blob; Err means no hub
/// answered at all, which callers must not read as "empty".
async fn read_latest(
    master_pubkey: &str,
    hubs: &[String],
    blob_key: &[u8; 32],
    client: &reqwest::Client,
) -> Result<Option<(u64, LocalPrefs)>, String> {
    let mut reachable = false;
    let mut found = Vec::new();
    for url in hubs {
        let endpoint = format!(
            "{}/identity/{}/prefs",
            url.trim_end_matches('/'),
            master_pubkey
        );
        let Ok(resp) = client.get(&endpoint).send().await else {
            continue;
        };
        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            reachable = true;
            continue;
        }
        if !resp.status().is_success() {
            continue;
        }
        let Ok(blob) = resp.json::<SignedPrefsBlob>().await else {
            continue;
        };
        if blob.master_pubkey != master_pubkey || blob.verify().is_err() {
            continue;
        }
        let Some(prefs) = hex::decode(&blob.ciphertext_hex)
            .ok()
            .and_then(|ct| decrypt_prefs::<LocalPrefs>(blob_key, &ct).ok())
        else {
            continue;
        };
        reachable = true;
        found.push((blob.blob_version, prefs));
    }
    let floor = seen_version();
    match newest(found, floor) {
        Some((version, prefs)) => {
            note_seen_version(version);
            Ok(Some((version, prefs)))
        }
        None if reachable => Ok(None),
        None => Err("no home hub answered with a current prefs blob".to_string()),
    }
}

/// What a push writes: this client's own fields, with everything it does not
/// manage carried forward from the blob already on the hub.
fn next_prefs(
    current: Option<LocalPrefs>,
    blocked_users: Vec<String>,
    voice_settings: crate::local_store::StoredVoiceSettings,
    stickers: Option<Vec<serde_json::Value>>,
) -> LocalPrefs {
    LocalPrefs {
        blocked_users,
        voice_settings,
        hide_birthdays: current.as_ref().and_then(|p| p.hide_birthdays),
        stickers: stickers.or_else(|| current.as_ref().and_then(|p| p.stickers.clone())),
        settings: current.and_then(|p| p.settings),
    }
}

/// Sign and PUT the prefs blob to every home hub in the list. `stickers`
/// replaces the collection when given; None keeps the one on the hub. Returns
/// how many hubs accepted it.
pub async fn push_prefs_blob(
    master: &MasterIdentity,
    blob_key: &[u8; 32],
    home_hubs: &[String],
    client: &reqwest::Client,
    stickers: Option<Vec<serde_json::Value>>,
) -> Result<usize> {
    let master_pubkey = master.public_key_hex();
    let latest = read_latest(&master_pubkey, home_hubs, blob_key, client)
        .await
        .map_err(|e| anyhow!(e))?;
    let current_version = latest.as_ref().map_or(0, |(v, _)| *v).max(seen_version());
    let current = latest.map(|(_, p)| p);

    let blocked = crate::local_store::load_blocked_users().unwrap_or_default();
    let voice = crate::local_store::load_voice_settings();
    let prefs = next_prefs(current, blocked, voice, stickers);

    let ciphertext = encrypt_prefs(blob_key, &prefs)?;
    let ciphertext_hex = hex::encode(&ciphertext);

    let blob_version = current_version + 1;

    let signing_bytes = SignedPrefsBlob::signing_bytes(&master_pubkey, blob_version, &ciphertext);
    let signature = hex::encode(master.sign(&signing_bytes).to_bytes());

    let blob = SignedPrefsBlob {
        master_pubkey: master_pubkey.clone(),
        blob_version,
        ciphertext_hex,
        signature,
    };

    let mut accepted = 0;
    for hub_url in home_hubs {
        let endpoint = format!(
            "{}/identity/{}/prefs",
            hub_url.trim_end_matches('/'),
            master_pubkey
        );
        if let Ok(resp) = client.put(&endpoint).json(&blob).send().await {
            if resp.status().is_success() {
                accepted += 1;
            }
        }
    }
    if accepted > 0 {
        note_seen_version(blob_version);
    }
    Ok(accepted)
}

/// The newest verified blob across the home hubs, decrypted.
pub async fn pull_prefs_blob(
    master_pubkey: &str,
    home_hubs: &[String],
    blob_key: &[u8; 32],
    client: &reqwest::Client,
) -> Result<LocalPrefs> {
    read_latest(master_pubkey, home_hubs, blob_key, client)
        .await
        .map_err(|e| anyhow!(e))?
        .map(|(_, prefs)| prefs)
        .ok_or_else(|| anyhow!("no home hub holds a prefs blob"))
}

// ---- Saved-sticker collection ----

#[derive(serde::Serialize)]
pub(crate) struct StickerCollection {
    /// Only a device holding the master seed can write the blob (v1,
    /// stickers.md section 2). A paired desktop gets an empty, read-only list.
    editable: bool,
    stickers: Vec<serde_json::Value>,
}

fn load_master() -> Result<MasterIdentity, String> {
    let path = crate::identity::Identity::default_path().map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&path).map_err(|e| e.to_string())?;
    identity.master().map_err(|e| e.to_string())
}

/// The designated home hubs, and only those: the blob also holds the block
/// list and synced settings, so it is never written to a hub just because it
/// is the active one.
fn collection_hubs() -> Vec<String> {
    crate::home_hub::read_cached_designation()
        .map(|d| d.hubs)
        .unwrap_or_default()
}

/// An unreachable hub is an error, never an empty list: a caller that read
/// "empty" for "could not ask" would save over the real collection.
async fn read_stickers(
    master_pubkey: &str,
    hubs: &[String],
    blob_key: &[u8; 32],
    client: &reqwest::Client,
) -> Result<Vec<serde_json::Value>, String> {
    Ok(read_latest(master_pubkey, hubs, blob_key, client)
        .await?
        .and_then(|(_, prefs)| prefs.stickers)
        .unwrap_or_default())
}

#[tauri::command]
pub(crate) async fn sticker_collection_get(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<StickerCollection, String> {
    let hubs = collection_hubs();
    let (Ok(master), false) = (load_master(), hubs.is_empty()) else {
        return Ok(StickerCollection {
            editable: false,
            stickers: Vec::new(),
        });
    };
    let key = derive_blob_key(&master);
    let stickers = read_stickers(&master.public_key_hex(), &hubs, &key, &state.http_client).await?;
    Ok(StickerCollection {
        editable: true,
        stickers,
    })
}

/// One edit applied to the list as the hub holds it right now, so a save from
/// another device in between is merged rather than overwritten.
fn apply_collection_op(
    mut list: Vec<serde_json::Value>,
    add: Option<serde_json::Value>,
    remove: Option<&str>,
) -> Vec<serde_json::Value> {
    let sha = |v: &serde_json::Value| v.get("sha256").and_then(|s| s.as_str()).map(str::to_owned);
    if let Some(sha256) = remove {
        list.retain(|v| sha(v).as_deref() != Some(sha256));
    }
    if let Some(entry) = add {
        if !list.iter().any(|v| sha(v) == sha(&entry)) {
            list.push(entry);
        }
    }
    list
}

#[tauri::command]
pub(crate) async fn sticker_collection_update(
    add: Option<serde_json::Value>,
    remove: Option<String>,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let master = load_master()?;
    let hubs = collection_hubs();
    if hubs.is_empty() {
        return Err("no home hub designated".to_string());
    }
    let key = derive_blob_key(&master);
    let current = read_stickers(&master.public_key_hex(), &hubs, &key, &state.http_client).await?;
    let next = apply_collection_op(current, add, remove.as_deref());
    let accepted = push_prefs_blob(&master, &key, &hubs, &state.http_client, Some(next.clone()))
        .await
        .map_err(|e| e.to_string())?;
    if accepted == 0 {
        return Err("no home hub accepted the collection".to_string());
    }
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stickers() -> Vec<serde_json::Value> {
        vec![serde_json::json!({
            "sha256": "ab".repeat(32),
            "name": "wave",
            "origin_hub_url": "https://a.example",
            "origin_hub_name": "A",
            "saved_at": 1700000000,
            "from_a_newer_client": true,
        })]
    }

    fn prefs(stickers: Option<Vec<serde_json::Value>>) -> LocalPrefs {
        LocalPrefs {
            blocked_users: vec![],
            voice_settings: Default::default(),
            hide_birthdays: None,
            settings: None,
            stickers,
        }
    }

    #[test]
    fn collection_survives_an_encrypt_decrypt_round_trip() {
        let key = [7u8; 32];
        let ct = encrypt_prefs(&key, &prefs(Some(stickers()))).unwrap();
        let back: LocalPrefs = decrypt_prefs(&key, &ct).unwrap();
        assert_eq!(back.stickers, Some(stickers()));
    }

    #[test]
    fn a_push_that_does_not_touch_stickers_carries_them_forward() {
        let next = next_prefs(
            Some(prefs(Some(stickers()))),
            vec![],
            Default::default(),
            None,
        );
        assert_eq!(next.stickers, Some(stickers()));
    }

    #[test]
    fn a_push_with_a_new_list_replaces_it() {
        let next = next_prefs(
            Some(prefs(Some(stickers()))),
            vec![],
            Default::default(),
            Some(vec![]),
        );
        assert_eq!(next.stickers, Some(vec![]));
    }

    #[test]
    fn an_edit_applies_to_the_list_as_it_is_now() {
        let a = serde_json::json!({ "sha256": "aa", "name": "a" });
        let b = serde_json::json!({ "sha256": "bb", "name": "b" });
        let list = apply_collection_op(vec![a.clone()], Some(b.clone()), None);
        assert_eq!(list, vec![a.clone(), b.clone()]);
        assert_eq!(
            apply_collection_op(list.clone(), Some(b.clone()), None),
            list
        );
        assert_eq!(apply_collection_op(list, None, Some("aa")), vec![b]);
    }

    #[test]
    fn the_newest_blob_wins_and_an_older_one_than_seen_is_refused() {
        let found = || {
            vec![
                (3, prefs(None)),
                (5, prefs(Some(stickers()))),
                (4, prefs(None)),
            ]
        };
        assert_eq!(newest(found(), 0).map(|(v, _)| v), Some(5));
        assert_eq!(newest(found(), 5).map(|(v, _)| v), Some(5));
        assert!(newest(found(), 6).is_none());
    }

    #[test]
    fn a_blob_without_the_field_decodes_and_re_encodes_without_it() {
        let json = r#"{"blocked_users":[],"voice_settings":{}}"#;
        let p: LocalPrefs = serde_json::from_str(json).unwrap();
        assert!(p.stickers.is_none());
        assert!(!serde_json::to_string(&p).unwrap().contains("stickers"));
    }
}
