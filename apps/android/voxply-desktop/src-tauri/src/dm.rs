use crate::messages::AttachmentInfo;
use crate::state::{active_session, AppState};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

// --- DTOs ---

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ConversationInfo {
    pub(crate) id: String,
    pub(crate) conv_type: String,
    pub(crate) members: Vec<String>,
    pub(crate) created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct DmMessageInfo {
    pub(crate) id: String,
    pub(crate) conversation_id: String,
    pub(crate) sender: String,
    pub(crate) sender_name: Option<String>,
    pub(crate) content: String,
    pub(crate) created_at: i64,
    #[serde(default)]
    pub(crate) attachments: Vec<AttachmentInfo>,
    #[serde(default)]
    pub(crate) is_encrypted: bool,
    #[serde(default)]
    pub(crate) delivery_failed: bool,
}

/// Raw response from the hub for a DM message — may include an encrypted envelope.
/// Converted to `DmMessageInfo` after optional in-process decryption.
#[derive(Deserialize)]
pub(crate) struct RawDmMessageResponse {
    pub(crate) id: String,
    pub(crate) conversation_id: String,
    pub(crate) sender: String,
    pub(crate) sender_name: Option<String>,
    pub(crate) content: Option<String>,
    pub(crate) created_at: i64,
    #[serde(default)]
    pub(crate) attachments: Vec<AttachmentInfo>,
    #[serde(default)]
    pub(crate) is_encrypted: bool,
    #[serde(default)]
    pub(crate) delivery_failed: bool,
    pub(crate) encrypted_envelope: Option<serde_json::Value>,
}

// --- Signing helpers ---

/// Signing bytes for a 1:1 encrypted DM envelope. Must stay
/// byte-identical to the hub's canonical encoder; pinned by the wire
/// vectors in identity.rs.
pub(crate) fn dm_envelope_signing_bytes(
    conv_id: &str,
    ciphertext_hex: &str,
    nonce_hex: &str,
    dh_pubkey_hex: &str,
) -> Vec<u8> {
    let mut out = b"voxply/dm-ciphertext/v1\0".to_vec();
    for s in [conv_id, ciphertext_hex, nonce_hex, dh_pubkey_hex] {
        let b = s.as_bytes();
        out.extend_from_slice(&(b.len() as u32).to_le_bytes());
        out.extend_from_slice(b);
    }
    out
}

pub(crate) fn decrypt_dm_inner(
    conv_id: &str,
    envelope: &serde_json::Value,
    identity: &crate::identity::Identity,
) -> Result<String, String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Key, Nonce};
    use hkdf::Hkdf;
    use sha2::Sha256;

    let (my_dh_sec, _) = identity.dh_keypair();
    let sender_dh_hex = envelope["dh_pubkey_hex"]
        .as_str()
        .ok_or("missing dh_pubkey_hex")?;
    let ciphertext_hex = envelope["ciphertext_hex"]
        .as_str()
        .ok_or("missing ciphertext_hex")?;
    let nonce_hex = envelope["nonce_hex"].as_str().ok_or("missing nonce_hex")?;

    let sender_bytes = hex::decode(sender_dh_hex).map_err(|e| e.to_string())?;
    let sender_arr: [u8; 32] = sender_bytes
        .try_into()
        .map_err(|_| "bad DH key".to_string())?;
    let sender_pub = x25519_dalek::PublicKey::from(sender_arr);
    let shared = my_dh_sec.diffie_hellman(&sender_pub);

    let hk = Hkdf::<Sha256>::new(Some(conv_id.as_bytes()), shared.as_bytes());
    let mut key_bytes = [0u8; 32];
    hk.expand(b"voxply/dm-key/v1", &mut key_bytes)
        .map_err(|e| e.to_string())?;

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));
    let nonce_bytes = hex::decode(nonce_hex).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = hex::decode(ciphertext_hex).map_err(|e| e.to_string())?;
    let plaintext_bytes = cipher
        .decrypt(nonce, ct.as_slice())
        .map_err(|_| "decryption failed".to_string())?;
    let plaintext: serde_json::Value =
        serde_json::from_slice(&plaintext_bytes).map_err(|e| e.to_string())?;
    Ok(plaintext["content"].as_str().unwrap_or("").to_string())
}

// --- Tauri commands ---

#[tauri::command]
pub(crate) async fn list_conversations(
    state: State<'_, AppState>,
) -> Result<Vec<ConversationInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client
        .get(format!("{hub_url}/conversations"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn create_conversation(
    members: Vec<String>,
    member_hubs: Option<HashMap<String, String>>,
    state: State<'_, AppState>,
) -> Result<ConversationInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/conversations"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "members": members,
            "member_hubs": member_hubs.unwrap_or_default(),
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn get_dm_messages(
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<DmMessageInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let raw: Vec<RawDmMessageResponse> = client
        .get(format!(
            "{hub_url}/conversations/{conversation_id}/messages"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))?;

    let identity_path = crate::identity::Identity::default_path().map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&identity_path).ok();

    let mut result = Vec::with_capacity(raw.len());
    for msg in raw {
        let content = if msg.is_encrypted {
            if let (Some(env), Some(ref id)) = (&msg.encrypted_envelope, &identity) {
                decrypt_dm_inner(&conversation_id, env, id)
                    .unwrap_or_else(|_| "[decryption failed]".to_string())
            } else {
                "[encrypted]".to_string()
            }
        } else {
            msg.content.unwrap_or_default()
        };
        result.push(DmMessageInfo {
            id: msg.id,
            conversation_id: msg.conversation_id,
            sender: msg.sender,
            sender_name: msg.sender_name,
            content,
            created_at: msg.created_at,
            attachments: msg.attachments,
            is_encrypted: msg.is_encrypted,
            delivery_failed: msg.delivery_failed,
        });
    }
    Ok(result)
}

#[tauri::command]
pub(crate) async fn send_dm(
    conversation_id: String,
    content: Option<String>,
    attachments: Option<Vec<AttachmentInfo>>,
    encrypted_envelope: Option<serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let body = if let Some(env) = encrypted_envelope {
        serde_json::json!({
            "encrypted_envelope": env,
            "attachments": attachments.unwrap_or_default(),
        })
    } else {
        serde_json::json!({
            "content": content.unwrap_or_default(),
            "attachments": attachments.unwrap_or_default(),
        })
    };
    let resp = client
        .post(format!(
            "{hub_url}/conversations/{conversation_id}/messages"
        ))
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// E2E DM encryption commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub(crate) async fn publish_dh_key(state: State<'_, AppState>) -> Result<(), String> {
    let identity_path = crate::identity::Identity::default_path().map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&identity_path).map_err(|e| e.to_string())?;
    let (_, dh_pub) = identity.dh_keypair();
    let dh_pubkey_hex = hex::encode(dh_pub.as_bytes());
    let sig_bytes = {
        let msg =
            crate::identity::DhKeyRecord::signing_bytes(&identity.public_key_hex(), &dh_pubkey_hex);
        identity.sign(&msg).to_bytes()
    };
    let signature_hex = hex::encode(sig_bytes);
    let pubkey_hex = identity.public_key_hex();

    // Collect hub urls + tokens before any await so the MutexGuard is dropped.
    let hub_sessions: Vec<(String, String)> = {
        let sessions = state.hubs.lock().unwrap();
        sessions
            .values()
            .map(|s| (s.hub_url.clone(), s.token.clone()))
            .collect()
    };

    for (hub_url, token) in hub_sessions {
        let url = format!("{}/identity/{}/dh-key", hub_url, pubkey_hex);
        let client = state.http_client.clone();
        let _ = client
            .put(&url)
            .bearer_auth(&token)
            .json(&serde_json::json!({
                "dh_pubkey_hex": &dh_pubkey_hex,
                "signature_hex": &signature_hex,
            }))
            .send()
            .await;
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn fetch_dh_key(
    pubkey: String,
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let url = format!("{}/identity/{}/dh-key", hub_url, pubkey);
    // Drop the MutexGuard before the first await.
    let token: Option<String> = {
        let sessions = state.hubs.lock().unwrap();
        sessions
            .values()
            .find(|s| s.hub_url == hub_url)
            .map(|s| s.token.clone())
    };
    let client = state.http_client.clone();
    let mut req = client.get(&url);
    if let Some(t) = token {
        req = req.bearer_auth(t);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(format!("hub returned {}", resp.status()));
    }
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(body["dh_pubkey_hex"].as_str().map(|s| s.to_string()))
}

#[tauri::command]
pub(crate) async fn encrypt_dm(
    conv_id: String,
    content: String,
    recipient_dh_pubkey_hex: String,
) -> Result<serde_json::Value, String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Key, Nonce};
    use hkdf::Hkdf;
    use rand::RngCore;
    use sha2::Sha256;

    let identity_path = crate::identity::Identity::default_path().map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&identity_path).map_err(|e| e.to_string())?;
    let (my_dh_sec, my_dh_pub) = identity.dh_keypair();

    let rec_bytes = hex::decode(&recipient_dh_pubkey_hex).map_err(|e| e.to_string())?;
    let rec_arr: [u8; 32] = rec_bytes
        .try_into()
        .map_err(|_| "bad DH key length".to_string())?;
    let rec_pub = x25519_dalek::PublicKey::from(rec_arr);

    let shared = my_dh_sec.diffie_hellman(&rec_pub);

    let hk = Hkdf::<Sha256>::new(Some(conv_id.as_bytes()), shared.as_bytes());
    let mut key_bytes = [0u8; 32];
    hk.expand(b"voxply/dm-key/v1", &mut key_bytes)
        .map_err(|e| e.to_string())?;

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = serde_json::json!({ "content": content }).to_string();
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| e.to_string())?;

    let ciphertext_hex = hex::encode(&ciphertext);
    let nonce_hex = hex::encode(nonce_bytes);
    let dh_pubkey_hex = hex::encode(my_dh_pub.as_bytes());

    let signing_msg =
        dm_envelope_signing_bytes(&conv_id, &ciphertext_hex, &nonce_hex, &dh_pubkey_hex);
    let sig = hex::encode(identity.sign(&signing_msg).to_bytes());

    Ok(serde_json::json!({
        "sender_pubkey": identity.public_key_hex(),
        "conv_id": conv_id,
        "ciphertext_hex": ciphertext_hex,
        "nonce_hex": nonce_hex,
        "dh_pubkey_hex": dh_pubkey_hex,
        "signature_hex": sig,
    }))
}

#[tauri::command]
pub(crate) async fn decrypt_dm(
    conv_id: String,
    envelope: serde_json::Value,
) -> Result<String, String> {
    let identity_path = crate::identity::Identity::default_path().map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&identity_path).map_err(|e| e.to_string())?;
    decrypt_dm_inner(&conv_id, &envelope, &identity)
}
