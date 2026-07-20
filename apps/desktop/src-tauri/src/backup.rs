// Unified cross-platform identity backup file (settings-ia.md §4a). Must
// match packages/core/src/identity/backup.ts byte-for-byte — see the
// `shared_test_vector_matches_typescript` test below, which asserts against
// the exact fixture in packages/core/src/identity/backup.test.ts.
//
// One account per file: plaintext is `{label, secret_key_hex}`, encrypted
// with Argon2id (65536 KiB, 3 iters, parallelism 1) + AES-256-GCM. The
// envelope is plain JSON with base64 fields — not hex, unlike this crate's
// other encrypted-blob formats — because the TS side (@noble/hashes +
// @noble/ciphers) round-trips base64 natively and this file must be
// bit-identical on both sides.

use crate::accounts;
use crate::identity::Identity;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce as AesNonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};

const BACKUP_M: u32 = 65536;
const BACKUP_T: u32 = 3;
const BACKUP_P: u32 = 1;

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct BackupAccount {
    pub label: String,
    pub secret_key_hex: String,
}

#[derive(Serialize, Deserialize)]
struct KdfParams {
    m: u32,
    t: u32,
    p: u32,
}

#[derive(Serialize, Deserialize)]
struct BackupEnvelope {
    version: u32,
    kdf: String,
    kdf_params: KdfParams,
    salt: String,
    nonce: String,
    ciphertext: String,
}

fn derive_key(passphrase: &str, salt: &[u8], m: u32, t: u32, p: u32) -> Result<[u8; 32], String> {
    let params = Params::new(m, t, p, Some(32)).map_err(|e| format!("Argon2 params: {e}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; 32];
    argon2
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| format!("Argon2 hash: {e}"))?;
    Ok(key)
}

fn encrypt_backup(
    account: &BackupAccount,
    passphrase: &str,
    salt: [u8; 16],
    nonce: [u8; 12],
) -> Result<String, String> {
    let key = derive_key(passphrase, &salt, BACKUP_M, BACKUP_T, BACKUP_P)?;
    let plaintext = serde_json::to_vec(account).map_err(|e| e.to_string())?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("AES key init: {e}"))?;
    let ciphertext = cipher
        .encrypt(AesNonce::from_slice(&nonce), plaintext.as_ref())
        .map_err(|e| format!("AES-GCM encrypt: {e}"))?;
    let envelope = BackupEnvelope {
        version: 1,
        kdf: "argon2id".to_string(),
        kdf_params: KdfParams {
            m: BACKUP_M,
            t: BACKUP_T,
            p: BACKUP_P,
        },
        salt: B64.encode(salt),
        nonce: B64.encode(nonce),
        ciphertext: B64.encode(&ciphertext),
    };
    serde_json::to_string_pretty(&envelope).map_err(|e| e.to_string())
}

fn encrypt_backup_random(account: &BackupAccount, passphrase: &str) -> Result<String, String> {
    let mut salt = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    let mut nonce = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce);
    encrypt_backup(account, passphrase, salt, nonce)
}

/// Throws "unsupported_backup_format" for anything that isn't this envelope
/// (old web PBKDF2 `.wavvon-backup` files, this crate's retired `.voxback`) —
/// alpha rules: no legacy importer. Throws "decrypt_failed" for a wrong
/// passphrase or corrupted ciphertext — mirrors backup.ts's decryptBackup.
fn decrypt_backup(envelope_json: &str, passphrase: &str) -> Result<BackupAccount, String> {
    let envelope: BackupEnvelope =
        serde_json::from_str(envelope_json).map_err(|_| "unsupported_backup_format".to_string())?;
    if envelope.version != 1 || envelope.kdf != "argon2id" {
        return Err("unsupported_backup_format".to_string());
    }
    let salt = B64
        .decode(&envelope.salt)
        .map_err(|_| "unsupported_backup_format".to_string())?;
    let nonce = B64
        .decode(&envelope.nonce)
        .map_err(|_| "unsupported_backup_format".to_string())?;
    let ciphertext = B64
        .decode(&envelope.ciphertext)
        .map_err(|_| "unsupported_backup_format".to_string())?;
    let key = derive_key(
        passphrase,
        &salt,
        envelope.kdf_params.m,
        envelope.kdf_params.t,
        envelope.kdf_params.p,
    )?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("AES key init: {e}"))?;
    let plaintext = cipher
        .decrypt(AesNonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| "decrypt_failed".to_string())?;
    serde_json::from_slice(&plaintext).map_err(|_| "decrypt_failed".to_string())
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub(crate) fn export_account_backup(
    id: String,
    passphrase: String,
    path: String,
) -> Result<(), String> {
    let identity_path = accounts::account_identity_path_for(&id)?;
    let identity = Identity::load(&identity_path)
        .map_err(|_| "No identity on this device for that account".to_string())?;
    let label = accounts::account_label_for(&id)?.unwrap_or_else(|| id.clone());
    let account = BackupAccount {
        label,
        secret_key_hex: identity.secret_key_hex(),
    };
    let json = encrypt_backup_random(&account, &passphrase)?;
    std::fs::write(&path, json).map_err(|e| format!("write backup: {e}"))
}

#[derive(Serialize)]
pub(crate) struct ImportedAccount {
    #[serde(flatten)]
    pub summary: accounts::AccountSummary,
    pub is_new: bool,
}

#[tauri::command]
pub(crate) fn import_account_backup(
    path: String,
    passphrase: String,
) -> Result<ImportedAccount, String> {
    let raw =
        std::fs::read_to_string(&path).map_err(|e| format!("Cannot read backup file: {e}"))?;
    let account = decrypt_backup(&raw, &passphrase)?;
    let (summary, is_new) =
        accounts::create_account_from_secret_key_hex(&account.secret_key_hex, Some(account.label))?;
    Ok(ImportedAccount { summary, is_new })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn hex_to_bytes(hex: &str) -> Vec<u8> {
        hex::decode(hex).unwrap()
    }

    // Fixed salt/nonce/passphrase/account shared with
    // packages/core/src/identity/backup.test.ts (settings-ia.md §4a). This
    // Rust implementation must produce the exact same envelope byte-for-byte.
    const VECTOR_SALT_HEX: &str = "000102030405060708090a0b0c0d0e0f";
    const VECTOR_NONCE_HEX: &str = "101112131415161718191a1b";
    const VECTOR_PASSPHRASE: &str = "correct horse battery staple";
    const VECTOR_CIPHERTEXT_B64: &str = "Z09hWEMqmbrPQD9lNMlEFy9pan5hNuegXFeJ2AmOE+YR2F/ghRqpwup+yNHFfVh55NxxC3ebPnQ2udg+wbHqgkRmRr6FmmMZgpUCPpSHuiKQrKd5/zyTgWWpW95UD0UnvH1etfgvvKBnKdO/ADl+5gsyBEb8Upi1FTwHnw==";

    fn vector_account() -> BackupAccount {
        BackupAccount {
            label: "test-account".to_string(),
            secret_key_hex: "a1".repeat(32),
        }
    }

    #[test]
    fn shared_test_vector_matches_typescript() {
        let salt: [u8; 16] = hex_to_bytes(VECTOR_SALT_HEX).try_into().unwrap();
        let nonce: [u8; 12] = hex_to_bytes(VECTOR_NONCE_HEX).try_into().unwrap();
        let json = encrypt_backup(&vector_account(), VECTOR_PASSPHRASE, salt, nonce).unwrap();
        let envelope: BackupEnvelope = serde_json::from_str(&json).unwrap();

        assert_eq!(envelope.version, 1);
        assert_eq!(envelope.kdf, "argon2id");
        assert_eq!(envelope.kdf_params.m, 65536);
        assert_eq!(envelope.kdf_params.t, 3);
        assert_eq!(envelope.kdf_params.p, 1);
        assert_eq!(envelope.salt, "AAECAwQFBgcICQoLDA0ODw==");
        assert_eq!(envelope.nonce, "EBESExQVFhcYGRob");
        assert_eq!(envelope.ciphertext, VECTOR_CIPHERTEXT_B64);
    }

    #[test]
    fn round_trips_through_decrypt() {
        let salt: [u8; 16] = hex_to_bytes(VECTOR_SALT_HEX).try_into().unwrap();
        let nonce: [u8; 12] = hex_to_bytes(VECTOR_NONCE_HEX).try_into().unwrap();
        let json = encrypt_backup(&vector_account(), VECTOR_PASSPHRASE, salt, nonce).unwrap();
        let decrypted = decrypt_backup(&json, VECTOR_PASSPHRASE).unwrap();
        assert_eq!(decrypted.label, vector_account().label);
        assert_eq!(decrypted.secret_key_hex, vector_account().secret_key_hex);
    }

    #[test]
    fn rejects_wrong_passphrase() {
        let salt: [u8; 16] = hex_to_bytes(VECTOR_SALT_HEX).try_into().unwrap();
        let nonce: [u8; 12] = hex_to_bytes(VECTOR_NONCE_HEX).try_into().unwrap();
        let json = encrypt_backup(&vector_account(), VECTOR_PASSPHRASE, salt, nonce).unwrap();
        let err = decrypt_backup(&json, "wrong passphrase").unwrap_err();
        assert_eq!(err, "decrypt_failed");
    }

    #[test]
    fn rejects_unrecognized_envelope_shape() {
        let legacy = serde_json::json!({
            "format": "wavvon-backup",
            "version": 2,
            "kdf": { "alg": "pbkdf2-sha256", "salt": "abc", "iterations": 100000 },
            "cipher": { "alg": "aes-256-gcm", "nonce": "def", "ciphertext": "ghi" },
        })
        .to_string();
        let err = decrypt_backup(&legacy, VECTOR_PASSPHRASE).unwrap_err();
        assert_eq!(err, "unsupported_backup_format");
    }
}
