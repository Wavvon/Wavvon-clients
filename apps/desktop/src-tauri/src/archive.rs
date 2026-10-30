// The full personal-data archive (docs wiki data-export.md), in the web's
// format: the `wavvon-archive` envelope must match
// packages/core/src/identity/archive.ts byte-for-byte (see the
// `shared_test_vector_matches_typescript` test), and the document inside is
// packages/ui's `ArchiveDocument`.
//
// The archive carries the identity, so the halves that touch the seed live
// here: export adds identity + hub-synced prefs + the Rust-held stores to
// what the renderer gathered (DMs, drafts), and restore decrypts, puts the
// identity on the device, and hands the renderer the document *without* its
// identity to plan the merge with the shared planRestore.

use std::collections::HashMap;
use std::path::Path;

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce as AesNonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

use crate::accounts::{self, IGNORED_USERS_FILE, SAVED_HUBS_FILE, SKIN_FILE, VOICE_GAINS_FILE};
use crate::backup::{derive_key, BACKUP_M, BACKUP_P, BACKUP_T};
use crate::identity::{Identity, SignedPrefsBlob};
use crate::state::{active_session, AppState};
use crate::types::SavedHub;

const ARCHIVE_FORMAT: &str = "wavvon-archive";
const ARCHIVE_ENVELOPE_VERSION: u32 = 1;
const ARCHIVE_KIND: &str = "full-archive";
const ARCHIVE_DOCUMENT_VERSION: u64 = 1;

// Same words web's assembleArchive writes: the note is part of the document.
const PAIRED_GAP_NOTE: &str = "This is a paired device — hub-synced preferences (blocked users, cross-device voice settings) can only be decrypted from the entropy-holding device that set them up.";

#[derive(Serialize, Deserialize)]
struct ArchiveKdf {
    alg: String,
    m: u32,
    t: u32,
    p: u32,
    salt: String,
}

#[derive(Serialize, Deserialize)]
struct ArchiveCipher {
    alg: String,
    nonce: String,
}

#[derive(Serialize, Deserialize)]
struct ArchiveEnvelope {
    format: String,
    version: u32,
    kdf: ArchiveKdf,
    cipher: ArchiveCipher,
    ciphertext: String,
}

fn encrypt_archive(
    json: &str,
    passphrase: &str,
    salt: [u8; 16],
    nonce: [u8; 12],
) -> Result<String, String> {
    let key = derive_key(passphrase, &salt, BACKUP_M, BACKUP_T, BACKUP_P)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("AES key init: {e}"))?;
    let ciphertext = cipher
        .encrypt(AesNonce::from_slice(&nonce), json.as_bytes())
        .map_err(|e| format!("AES-GCM encrypt: {e}"))?;
    let envelope = ArchiveEnvelope {
        format: ARCHIVE_FORMAT.to_string(),
        version: ARCHIVE_ENVELOPE_VERSION,
        kdf: ArchiveKdf {
            alg: "argon2id".to_string(),
            m: BACKUP_M,
            t: BACKUP_T,
            p: BACKUP_P,
            salt: B64.encode(salt),
        },
        cipher: ArchiveCipher {
            alg: "aes-256-gcm".to_string(),
            nonce: B64.encode(nonce),
        },
        ciphertext: B64.encode(&ciphertext),
    };
    serde_json::to_string_pretty(&envelope).map_err(|e| e.to_string())
}

/// Same error codes as archive.ts's decryptArchive, which the shared
/// FullArchiveSection translates.
fn decrypt_archive(text: &str, passphrase: &str) -> Result<String, String> {
    let unsupported = || "unsupported_archive_format".to_string();
    let raw: Value = serde_json::from_str(text).map_err(|_| unsupported())?;
    if raw["format"] != ARCHIVE_FORMAT {
        return Err(unsupported());
    }
    if raw["version"] != ARCHIVE_ENVELOPE_VERSION {
        return Err("archive_too_new".to_string());
    }
    let env: ArchiveEnvelope = serde_json::from_value(raw).map_err(|_| unsupported())?;
    if env.kdf.alg != "argon2id" || env.cipher.alg != "aes-256-gcm" {
        return Err(unsupported());
    }
    let salt = B64.decode(&env.kdf.salt).map_err(|_| unsupported())?;
    let nonce = B64.decode(&env.cipher.nonce).map_err(|_| unsupported())?;
    let ciphertext = B64.decode(&env.ciphertext).map_err(|_| unsupported())?;
    if nonce.len() != 12 {
        return Err(unsupported());
    }
    let key = derive_key(passphrase, &salt, env.kdf.m, env.kdf.t, env.kdf.p)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("AES key init: {e}"))?;
    let plaintext = cipher
        .decrypt(AesNonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| "decrypt_failed".to_string())?;
    String::from_utf8(plaintext).map_err(|_| "decrypt_failed".to_string())
}

/// Mirrors packages/ui's parseArchiveDocument, error codes included.
fn validate_document(doc: &Value) -> Result<(), String> {
    let malformed = || "malformed_archive".to_string();
    if !doc.is_object() {
        return Err(malformed());
    }
    if doc["kind"] != ARCHIVE_KIND {
        return Err("unsupported_archive_format".to_string());
    }
    match doc["version"].as_f64() {
        Some(v) if v <= ARCHIVE_DOCUMENT_VERSION as f64 => {}
        _ => return Err("archive_too_new".to_string()),
    }
    let seed_ok = doc["identity"]["seed_hex"]
        .as_str()
        .is_some_and(|s| !s.is_empty());
    if !seed_ok
        || !doc["dms"].is_array()
        || !doc["themes"].is_array()
        || !doc["drafts"].is_object()
        || !doc["prefs"]["hub_list"].is_array()
        || !doc["prefs"]["ignored_users"].is_array()
    {
        return Err(malformed());
    }
    Ok(())
}

/// A paired device's archive carries its subkey seed: restored as an owned
/// account it would be a different identity from the one the hubs know.
fn is_paired_archive(identity: &Value) -> Result<bool, String> {
    let Some(master) = identity["master_pubkey"].as_str() else {
        return Ok(false);
    };
    if identity["subkey_cert"].is_null() {
        return Ok(false);
    }
    let seed = identity["seed_hex"].as_str().unwrap_or_default();
    let own = Identity::from_secret_key_hex(seed).map_err(|_| "malformed_archive".to_string())?;
    let own_master = own.master().map_err(|e| e.to_string())?;
    Ok(own_master.public_key_hex() != master)
}

// ---------------------------------------------------------------------------
// Per-account stores, read and written by directory so a restore can target
// an account that is not the active one.
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize)]
pub(crate) struct ArchiveStores {
    hub_list: Vec<SavedHub>,
    ignored_users: Vec<String>,
    /// Percent, as the archive and web store it; desktop's file holds a
    /// 0.0–2.0 multiplier.
    voice_gains: HashMap<String, f64>,
    skin: Option<Value>,
}

fn read_json<T: serde::de::DeserializeOwned + Default>(path: &Path) -> T {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| format!("write {}: {e}", path.display()))
}

fn read_stores(dir: &Path) -> ArchiveStores {
    let gains: HashMap<String, f32> = read_json(&dir.join(VOICE_GAINS_FILE));
    ArchiveStores {
        hub_list: read_json(&dir.join(SAVED_HUBS_FILE)),
        ignored_users: read_json(&dir.join(IGNORED_USERS_FILE)),
        voice_gains: gains
            .into_iter()
            .map(|(k, g)| (k, (f64::from(g) * 100.0).round()))
            .collect(),
        skin: read_json::<Option<Value>>(&dir.join(SKIN_FILE)),
    }
}

fn write_stores(dir: &Path, stores: &ArchiveStores) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("mkdir: {e}"))?;
    write_json(&dir.join(SAVED_HUBS_FILE), &stores.hub_list)?;
    write_json(&dir.join(IGNORED_USERS_FILE), &stores.ignored_users)?;
    let gains: HashMap<&String, f32> = stores
        .voice_gains
        .iter()
        .map(|(k, pct)| (k, (pct / 100.0).clamp(0.0, 2.0) as f32))
        .filter(|(_, g)| (g - 1.0).abs() >= 0.001)
        .collect();
    write_json(&dir.join(VOICE_GAINS_FILE), &gains)?;
    if let Some(skin) = &stores.skin {
        write_json(&dir.join(SKIN_FILE), skin)?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/// What only the renderer holds: DM plaintext comes through the existing
/// get_dm_messages command, drafts and the mention-ping switch live in its
/// localStorage.
#[derive(Deserialize)]
pub(crate) struct RendererSections {
    dms: Value,
    drafts: Value,
    mention_ping_enabled: bool,
}

/// GET against the active hub, where 404 is the one answer that means "none":
/// anything else that is not a success aborts, so a hiccup never produces an
/// archive silently missing a section.
async fn hub_get(
    client: &reqwest::Client,
    hub_url: &str,
    token: &str,
    path: &str,
) -> Result<Option<Value>, String> {
    let url = format!("{}{path}", hub_url.trim_end_matches('/'));
    let resp = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("{path}: {e}"))?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(format!("{path}: HTTP {}", resp.status()));
    }
    resp.json()
        .await
        .map(Some)
        .map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
pub(crate) async fn export_full_archive(
    app: tauri::AppHandle,
    passphrase: String,
    sections: RendererSections,
    suggested_name: String,
    filter_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let path = crate::backup::choose_save_path(&app, &suggested_name, &filter_name, "enc").await?;
    let account_dir = accounts::active_account_dir()?;
    let account_id = account_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_string();

    // A paired account's own file takes precedence, as everywhere else.
    let (mut identity, master_pubkey, blob_key) = match crate::pairing::get_paired_identity() {
        Some(p) => {
            let mut id = json!({
                "seed_hex": p.subkey_secret_hex,
                "security_nonce": 0,
                "security_level": 0,
                "master_pubkey": p.master_pubkey,
                "subkey_cert": p.cert,
                "device_label": p.device_label,
            });
            if let Some(dh) = p.canonical_dh_scalar_hex {
                id["canonical_dh_priv_hex"] = json!(dh);
            }
            (id, p.master_pubkey, None)
        }
        None => {
            let owned = Identity::load(&account_dir.join("identity.json"))
                .map_err(|_| "No identity found on this device.".to_string())?;
            let master = owned.master().map_err(|e| e.to_string())?;
            let id = json!({
                "seed_hex": *owned.secret_key_hex(),
                "security_nonce": owned.security_nonce,
                "security_level": owned.security_level,
            });
            let key = crate::prefs_blob::derive_blob_key(&master);
            (id, master.public_key_hex(), Some(key))
        }
    };
    if let Some(label) = accounts::account_label_for(&account_id)? {
        identity["account_label"] = json!(label);
    }

    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let base = format!("/identity/{master_pubkey}");
    let designation = hub_get(&client, &hub_url, &token, &format!("{base}/designation")).await?;
    let subkey_certs = hub_get(&client, &hub_url, &token, &format!("{base}/devices"))
        .await?
        .ok_or("/devices: not found")?;
    let revocations = hub_get(&client, &hub_url, &token, &format!("{base}/revocations"))
        .await?
        .ok_or("/revocations: not found")?;

    let (hub_synced, gap_note) = match blob_key {
        None => (Value::Null, json!(PAIRED_GAP_NOTE)),
        Some(key) => match hub_get(&client, &hub_url, &token, &format!("{base}/prefs")).await? {
            None => (Value::Null, Value::Null),
            Some(raw) => {
                let blob: SignedPrefsBlob =
                    serde_json::from_value(raw).map_err(|e| format!("prefs blob: {e}"))?;
                blob.verify()
                    .map_err(|_| "Prefs blob signature verification failed.".to_string())?;
                let ct = hex::decode(&blob.ciphertext_hex).map_err(|e| e.to_string())?;
                let prefs: Value =
                    crate::prefs_blob::decrypt_prefs(&key, &ct).map_err(|e| e.to_string())?;
                (prefs, Value::Null)
            }
        },
    };

    let stores = read_stores(&account_dir);
    // Desktop keeps no icon or token flag per hub; web reads both as optional
    // state it refreshes from /info.
    let hub_list: Vec<Value> = stores
        .hub_list
        .iter()
        .map(|h| {
            json!({
                "hub_id": h.hub_id,
                "hub_name": h.hub_name,
                "hub_url": h.hub_url,
                "hub_icon": null,
                "remember_token": false,
            })
        })
        .collect();
    let exported_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let document = json!({
        "version": ARCHIVE_DOCUMENT_VERSION,
        "kind": ARCHIVE_KIND,
        "exported_at": exported_at,
        "identity": identity,
        "home_hubs": { "designations": designation.into_iter().collect::<Vec<_>>() },
        "devices": { "subkey_certs": subkey_certs, "revocations": revocations },
        "prefs": {
            "hub_list": hub_list,
            "theme": crate::local_store::load_appearance().slot,
            "ignored_users": stores.ignored_users,
            "voice_gains": stores.voice_gains,
            "mention_ping_enabled": sections.mention_ping_enabled,
            "hub_synced": hub_synced,
            "gap_note": gap_note,
        },
        "dms": sections.dms,
        "themes": stores.skin.into_iter().collect::<Vec<_>>(),
        "drafts": sections.drafts,
    });
    validate_document(&document)?;

    let json = serde_json::to_string_pretty(&document).map_err(|e| e.to_string())?;
    let mut salt = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    let mut nonce = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce);
    let envelope = encrypt_archive(&json, &passphrase, salt, nonce)?;
    std::fs::write(&path, envelope).map_err(|e| format!("write archive: {e}"))
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub(crate) struct OpenedArchive {
    account_id: String,
    was_first_account: bool,
    /// The document minus `identity`, which stays here.
    archive: Value,
    existing: ArchiveStores,
}

/// Decrypts the archive and resolves its identity to an account — the
/// existing one when the device has it (merge), a new one otherwise (create).
#[tauri::command]
pub(crate) fn open_full_archive(path: String, passphrase: String) -> Result<OpenedArchive, String> {
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("Cannot read archive: {e}"))?;
    let mut doc: Value = serde_json::from_str(&decrypt_archive(&raw, &passphrase)?)
        .map_err(|_| "malformed_archive".to_string())?;
    validate_document(&doc)?;

    let identity = doc
        .as_object_mut()
        .and_then(|o| o.remove("identity"))
        .unwrap_or_default();
    let seed = identity["seed_hex"].as_str().unwrap_or_default();
    let pubkey = Identity::from_secret_key_hex(seed)
        .map_err(|_| "malformed_archive".to_string())?
        .public_key_hex();

    let prior = accounts::list_accounts()?;
    let on_device = prior.iter().any(|a| a.id == pubkey);
    if !on_device && is_paired_archive(&identity)? {
        return Err("archive_paired_device".to_string());
    }
    let label = identity["account_label"].as_str().map(str::to_string);
    let (summary, _) = accounts::create_account_from_secret_key_hex(seed, label)?;

    let existing = read_stores(&accounts::registered_account_dir(&summary.id)?);
    Ok(OpenedArchive {
        account_id: summary.id,
        was_first_account: prior.is_empty(),
        archive: doc,
        existing,
    })
}

/// Writes the merged result planRestore produced. Every list is the full new
/// contents (existing first), so this is a plain write.
#[tauri::command]
pub(crate) fn apply_full_archive_restore(
    account_id: String,
    stores: ArchiveStores,
) -> Result<(), String> {
    write_stores(&accounts::registered_account_dir(&account_id)?, &stores)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Fixed inputs shared with packages/core/src/identity/archive.test.ts and
    // the docs wiki's data-export.md §0.
    const VECTOR_SALT_HEX: &str = "000102030405060708090a0b0c0d0e0f";
    const VECTOR_NONCE_HEX: &str = "101112131415161718191a1b";
    const VECTOR_PASSPHRASE: &str = "correct horse battery staple";
    const VECTOR_PLAINTEXT: &str =
        r#"{"kind":"full-archive","version":1,"drafts":{"hub/chan":"héllo"}}"#;
    const VECTOR_CIPHERTEXT_B64: &str = "Z09mUE8r16LXBD5sK5AIBC9ibH1qYOmuCEGeyBKECZtAjAqdiQ2whqQvi9rfblE958JzUnfEfX914HqmzOzkkVgqoN0g34v3b+vz7Z/m70IWjA==";

    fn vector_envelope() -> String {
        let salt: [u8; 16] = hex::decode(VECTOR_SALT_HEX).unwrap().try_into().unwrap();
        let nonce: [u8; 12] = hex::decode(VECTOR_NONCE_HEX).unwrap().try_into().unwrap();
        encrypt_archive(VECTOR_PLAINTEXT, VECTOR_PASSPHRASE, salt, nonce).unwrap()
    }

    #[test]
    fn shared_test_vector_matches_typescript() {
        let env: Value = serde_json::from_str(&vector_envelope()).unwrap();
        assert_eq!(
            env,
            json!({
                "format": "wavvon-archive",
                "version": 1,
                "kdf": { "alg": "argon2id", "m": 65536, "t": 3, "p": 1, "salt": "AAECAwQFBgcICQoLDA0ODw==" },
                "cipher": { "alg": "aes-256-gcm", "nonce": "EBESExQVFhcYGRob" },
                "ciphertext": VECTOR_CIPHERTEXT_B64,
            })
        );
    }

    #[test]
    fn round_trips_and_refuses_wrong_input() {
        let env = vector_envelope();
        assert_eq!(
            decrypt_archive(&env, VECTOR_PASSPHRASE).unwrap(),
            VECTOR_PLAINTEXT
        );
        assert_eq!(
            decrypt_archive(&env, "wrong passphrase").unwrap_err(),
            "decrypt_failed"
        );
        let backup = r#"{"version":1,"kdf":"argon2id","salt":"","nonce":"","ciphertext":""}"#;
        assert_eq!(
            decrypt_archive(backup, VECTOR_PASSPHRASE).unwrap_err(),
            "unsupported_archive_format"
        );
        let mut newer: Value = serde_json::from_str(&env).unwrap();
        newer["version"] = json!(2);
        assert_eq!(
            decrypt_archive(&newer.to_string(), VECTOR_PASSPHRASE).unwrap_err(),
            "archive_too_new"
        );
    }

    fn minimal_document() -> Value {
        json!({
            "version": 1, "kind": "full-archive", "exported_at": 0,
            "identity": { "seed_hex": "a1".repeat(32), "security_nonce": 0, "security_level": 0 },
            "home_hubs": { "designations": [] },
            "devices": { "subkey_certs": [], "revocations": [] },
            "prefs": { "hub_list": [], "theme": "dark", "ignored_users": [], "voice_gains": {},
                       "mention_ping_enabled": true, "hub_synced": null, "gap_note": null },
            "dms": [], "themes": [], "drafts": {},
        })
    }

    #[test]
    fn validates_the_document_like_parse_archive_document() {
        assert!(validate_document(&minimal_document()).is_ok());
        let mut other = minimal_document();
        other["kind"] = json!("identity-backup");
        assert_eq!(
            validate_document(&other).unwrap_err(),
            "unsupported_archive_format"
        );
        let mut newer = minimal_document();
        newer["version"] = json!(2);
        assert_eq!(validate_document(&newer).unwrap_err(), "archive_too_new");
        for key in ["identity", "dms", "prefs", "themes", "drafts"] {
            let mut bad = minimal_document();
            bad.as_object_mut().unwrap().remove(key);
            assert_eq!(validate_document(&bad).unwrap_err(), "malformed_archive");
        }
    }

    #[test]
    fn tells_a_paired_device_archive_from_an_entropy_holders() {
        let seed = "a1".repeat(32);
        let own_master = Identity::from_secret_key_hex(&seed)
            .unwrap()
            .master()
            .unwrap()
            .public_key_hex();
        let plain = json!({ "seed_hex": seed });
        let self_certified =
            json!({ "seed_hex": seed, "master_pubkey": own_master, "subkey_cert": {} });
        let paired =
            json!({ "seed_hex": seed, "master_pubkey": "b2".repeat(32), "subkey_cert": {} });
        assert!(!is_paired_archive(&plain).unwrap());
        assert!(!is_paired_archive(&self_certified).unwrap());
        assert!(is_paired_archive(&paired).unwrap());
    }

    #[test]
    fn stores_round_trip_with_gains_in_percent() {
        let dir = std::env::temp_dir().join(format!("wavvon-archive-test-{}", std::process::id()));
        let stores = ArchiveStores {
            hub_list: vec![SavedHub {
                hub_id: "h".into(),
                hub_name: "Hub".into(),
                hub_url: "https://hub.example".into(),
            }],
            ignored_users: vec!["peer".into()],
            voice_gains: HashMap::from([("loud".to_string(), 150.0), ("same".to_string(), 100.0)]),
            skin: Some(json!({ "name": "Mine" })),
        };
        write_stores(&dir, &stores).unwrap();
        let back = read_stores(&dir);
        let _ = std::fs::remove_dir_all(&dir);

        assert_eq!(back.hub_list.len(), 1);
        assert_eq!(back.ignored_users, vec!["peer".to_string()]);
        // 100% is desktop's "no override" and is not written at all.
        assert_eq!(
            back.voice_gains,
            HashMap::from([("loud".to_string(), 150.0)])
        );
        assert_eq!(back.skin, Some(json!({ "name": "Mine" })));
    }
}
