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
}

// ---- Blob key derivation ----

pub fn derive_blob_key(master: &MasterIdentity) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(None, &master.secret_seed());
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

pub fn decrypt_prefs(blob_key: &[u8; 32], data: &[u8]) -> Result<LocalPrefs> {
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

/// Fetch the current blob_version from the first reachable home hub (0 if
/// none), along with the prefs it holds when they decrypt — the caller needs
/// them to carry other clients' fields forward instead of clobbering them.
async fn fetch_current(
    master_pubkey: &str,
    hubs: &[String],
    blob_key: &[u8; 32],
    client: &reqwest::Client,
) -> (u64, Option<LocalPrefs>) {
    for url in hubs {
        let endpoint = format!(
            "{}/identity/{}/prefs",
            url.trim_end_matches('/'),
            master_pubkey
        );
        if let Ok(resp) = client.get(&endpoint).send().await {
            if let Ok(blob) = resp.json::<SignedPrefsBlob>().await {
                let prefs = hex::decode(&blob.ciphertext_hex)
                    .ok()
                    .and_then(|ct| decrypt_prefs(blob_key, &ct).ok());
                return (blob.blob_version, prefs);
            }
        }
    }
    (0, None)
}

/// Sign and PUT the prefs blob to every home hub in the list.
pub async fn push_prefs_blob(
    master: &MasterIdentity,
    blob_key: &[u8; 32],
    home_hubs: &[String],
    client: &reqwest::Client,
) -> Result<()> {
    let master_pubkey = master.public_key_hex();
    let (current_version, current) =
        fetch_current(&master_pubkey, home_hubs, blob_key, client).await;

    let blocked = crate::local_store::load_blocked_users().unwrap_or_default();
    let voice = crate::local_store::load_voice_settings();
    let prefs = LocalPrefs {
        blocked_users: blocked,
        voice_settings: voice,
        hide_birthdays: current.as_ref().and_then(|p| p.hide_birthdays),
        settings: current.and_then(|p| p.settings),
    };

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

    for hub_url in home_hubs {
        let endpoint = format!(
            "{}/identity/{}/prefs",
            hub_url.trim_end_matches('/'),
            master_pubkey
        );
        let _ = client.put(&endpoint).json(&blob).send().await;
    }
    Ok(())
}

/// Fetch the blob from the first reachable home hub, verify signature, decrypt.
pub async fn pull_prefs_blob(
    master_pubkey: &str,
    home_hubs: &[String],
    blob_key: &[u8; 32],
    client: &reqwest::Client,
) -> Result<LocalPrefs> {
    for url in home_hubs {
        let endpoint = format!(
            "{}/identity/{}/prefs",
            url.trim_end_matches('/'),
            master_pubkey
        );
        let Ok(resp) = client.get(&endpoint).send().await else {
            continue;
        };
        if !resp.status().is_success() {
            continue;
        }
        let Ok(blob) = resp.json::<SignedPrefsBlob>().await else {
            continue;
        };
        blob.verify()
            .map_err(|e| anyhow!("blob signature invalid: {e}"))?;
        let ciphertext = hex::decode(&blob.ciphertext_hex)?;
        return decrypt_prefs(blob_key, &ciphertext);
    }
    Err(anyhow!("no reachable home hub with a prefs blob"))
}
