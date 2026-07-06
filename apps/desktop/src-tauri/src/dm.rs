use crate::state::{active_session, AppState};
use crate::types::{
    AttachmentInfo, ConversationInfo, DmMessageInfo, FriendInfo, RawDmMessageResponse,
};
use std::collections::HashMap;
use tauri::State;

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

#[tauri::command]
pub(crate) async fn list_friends(state: State<'_, AppState>) -> Result<Vec<FriendInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client
        .get(format!("{hub_url}/friends"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn list_pending_friends(
    state: State<'_, AppState>,
) -> Result<Vec<FriendInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client
        .get(format!("{hub_url}/friends/pending"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
pub(crate) async fn send_friend_request(
    target_public_key: String,
    friend_hub_url: Option<String>,
    display_name: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/friends"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "target_public_key": target_public_key,
            "hub_url": friend_hub_url,
            "display_name": display_name,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn accept_friend(
    from_public_key: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/friends/{from_public_key}/accept"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn remove_friend(
    target_public_key: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/friends/{target_public_key}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Conversations / DMs
// ---------------------------------------------------------------------------

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
            if let Some(ref env) = msg.encrypted_envelope {
                let is_v2 = env["v"].as_u64().unwrap_or(1) == 2;
                if is_v2 {
                    decrypt_dm_dr_inner(&conversation_id, env)
                        .unwrap_or_else(|_| "[decryption failed]".to_string())
                } else if let Some(ref id) = identity {
                    decrypt_dm_inner(&conversation_id, env, id)
                        .unwrap_or_else(|_| "[decryption failed]".to_string())
                } else {
                    "[encrypted]".to_string()
                }
            } else if let Some(ref env) = msg.dr_envelope {
                decrypt_dm_dr_inner(&conversation_id, env)
                    .unwrap_or_else(|_| "[decryption failed]".to_string())
            } else {
                "[encrypted]".to_string()
            }
        } else if msg.is_group_encrypted {
            if let (Some(env), Some(ref id)) = (&msg.group_encrypted_envelope, &identity) {
                if env["sender_pubkey"].as_str() == Some(&id.public_key_hex()) {
                    "[sent]".to_string()
                } else {
                    decrypt_group_dm_inner(&conversation_id, env, id)
                        .unwrap_or_else(|_| "[encrypted]".to_string())
                }
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
            is_group_encrypted: msg.is_group_encrypted,
            delivery_failed: msg.delivery_failed,
        });
    }
    Ok(result)
}

fn decrypt_dm_inner(
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
    hk.expand(b"wavvon/dm-key/v1", &mut key_bytes)
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

#[tauri::command]
pub(crate) async fn send_dm(
    conversation_id: String,
    content: Option<String>,
    attachments: Option<Vec<AttachmentInfo>>,
    encrypted_envelope: Option<serde_json::Value>,
    group_encrypted_envelope: Option<serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let body = if let Some(env) = group_encrypted_envelope {
        serde_json::json!({
            "group_encrypted_envelope": env,
            "attachments": attachments.unwrap_or_default(),
        })
    } else if let Some(env) = encrypted_envelope {
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

#[tauri::command]
pub(crate) async fn update_dm_blocks(
    blocked: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let base = hub_url.trim_end_matches('/');
    #[derive(serde::Serialize)]
    struct Payload {
        blocked_pubkeys: Vec<String>,
    }
    let resp = state
        .http_client
        .put(format!("{base}/identity/dm-blocks"))
        .bearer_auth(&token)
        .json(&Payload {
            blocked_pubkeys: blocked,
        })
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
    hk.expand(b"wavvon/dm-key/v1", &mut key_bytes)
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

// ---------------------------------------------------------------------------
// Group E2E sender-key commands
// ---------------------------------------------------------------------------

fn group_sender_keys_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;
    Ok(home.join(".wavvon").join("group_sender_keys.json"))
}

fn load_sender_key_state() -> Result<serde_json::Value, String> {
    let path = group_sender_keys_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({ "my_keys": {}, "peer_keys": {} }));
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

fn save_sender_key_state(state: &serde_json::Value) -> Result<(), String> {
    let path = group_sender_keys_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())
}

pub(crate) fn dm_envelope_signing_bytes(
    conv_id: &str,
    ciphertext_hex: &str,
    nonce_hex: &str,
    dh_pubkey_hex: &str,
) -> Vec<u8> {
    let mut out = b"wavvon/dm-ciphertext/v1\0".to_vec();
    for s in [conv_id, ciphertext_hex, nonce_hex, dh_pubkey_hex] {
        let b = s.as_bytes();
        out.extend_from_slice(&(b.len() as u32).to_le_bytes());
        out.extend_from_slice(b);
    }
    out
}

pub(crate) fn sender_key_dist_signing_bytes(
    conv_id: &str,
    version: u32,
    recipients: &[(String, String)],
) -> Vec<u8> {
    fn len_prefixed(out: &mut Vec<u8>, s: &str) {
        let b = s.as_bytes();
        out.extend_from_slice(&(b.len() as u32).to_le_bytes());
        out.extend_from_slice(b);
    }
    let mut out = b"wavvon/group-key-dist/v1\0".to_vec();
    len_prefixed(&mut out, conv_id);
    len_prefixed(&mut out, &version.to_string());
    let mut sorted = recipients.to_vec();
    sorted.sort_by(|a, b| a.0.cmp(&b.0));
    for (pubkey, wrapped_hex) in &sorted {
        len_prefixed(&mut out, pubkey);
        len_prefixed(&mut out, wrapped_hex);
    }
    out
}

pub(crate) fn group_envelope_signing_bytes(
    conv_id: &str,
    version: u32,
    iteration: u32,
    ciphertext_hex: &str,
    nonce_hex: &str,
) -> Vec<u8> {
    fn len_prefixed(out: &mut Vec<u8>, s: &str) {
        let b = s.as_bytes();
        out.extend_from_slice(&(b.len() as u32).to_le_bytes());
        out.extend_from_slice(b);
    }
    let mut out = b"wavvon/group-dm-ciphertext/v1\0".to_vec();
    len_prefixed(&mut out, conv_id);
    len_prefixed(&mut out, &version.to_string());
    len_prefixed(&mut out, &iteration.to_string());
    len_prefixed(&mut out, ciphertext_hex);
    len_prefixed(&mut out, nonce_hex);
    out
}

fn wrap_chain_key(
    my_dh_sec: &x25519_dalek::StaticSecret,
    recipient_dh_pub: &x25519_dalek::PublicKey,
    conv_id: &str,
    chain_key: &[u8; 32],
    iteration: u32,
) -> Result<(String, String), String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Key, Nonce};
    use hkdf::Hkdf;
    use rand::RngCore;
    use sha2::Sha256;

    let shared = my_dh_sec.diffie_hellman(recipient_dh_pub);
    let hk = Hkdf::<Sha256>::new(Some(conv_id.as_bytes()), shared.as_bytes());
    let mut wrap_key = [0u8; 32];
    hk.expand(b"wavvon/group-key-dist/v1", &mut wrap_key)
        .map_err(|e| e.to_string())?;

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&wrap_key));
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let mut plaintext = [0u8; 36];
    plaintext[..32].copy_from_slice(chain_key);
    plaintext[32..36].copy_from_slice(&iteration.to_be_bytes());

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_slice())
        .map_err(|e| e.to_string())?;
    Ok((hex::encode(ciphertext), hex::encode(nonce_bytes)))
}

#[tauri::command]
pub(crate) async fn push_group_sender_key(
    conv_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    use rand::RngCore;

    let identity_path = crate::identity::Identity::default_path().map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&identity_path).map_err(|e| e.to_string())?;
    let (my_dh_sec, _) = identity.dh_keypair();

    let mut key_state = load_sender_key_state()?;

    let (chain_key, version, iteration) =
        if let Some(existing) = key_state["my_keys"][&conv_id].as_object() {
            let ck_hex = existing
                .get("chain_key_hex")
                .and_then(|v| v.as_str())
                .ok_or("bad state")?;
            let ck_bytes = hex::decode(ck_hex).map_err(|e| e.to_string())?;
            let ck_arr: [u8; 32] = ck_bytes
                .try_into()
                .map_err(|_| "bad chain key length".to_string())?;
            let ver = existing
                .get("version")
                .and_then(|v| v.as_u64())
                .unwrap_or(1) as u32;
            let iter = existing
                .get("iteration")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
            (ck_arr, ver, iter)
        } else {
            let mut ck = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut ck);
            (ck, 1u32, 0u32)
        };

    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();

    let convs: Vec<serde_json::Value> = client
        .get(format!("{hub_url}/conversations"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))?;

    let members: Vec<String> = convs
        .iter()
        .find(|c| c["id"].as_str() == Some(&conv_id))
        .and_then(|c| c["members"].as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let my_pubkey = identity.public_key_hex();
    let mut recipients: Vec<(String, String)> = Vec::new();

    for member in &members {
        if member == &my_pubkey {
            continue;
        }
        let dh_resp: serde_json::Value = match client
            .get(format!("{hub_url}/identity/{member}/dh-key"))
            .bearer_auth(&token)
            .send()
            .await
        {
            Ok(r) if r.status().is_success() => r.json().await.unwrap_or(serde_json::Value::Null),
            _ => continue,
        };
        let dh_hex = match dh_resp["dh_pubkey_hex"].as_str() {
            Some(h) => h.to_string(),
            None => continue,
        };
        let dh_bytes = match hex::decode(&dh_hex) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let dh_arr: [u8; 32] = match dh_bytes.try_into() {
            Ok(a) => a,
            Err(_) => continue,
        };
        let rec_pub = x25519_dalek::PublicKey::from(dh_arr);
        let (wrapped_hex, nonce_hex) =
            match wrap_chain_key(&my_dh_sec, &rec_pub, &conv_id, &chain_key, iteration) {
                Ok(v) => v,
                Err(_) => continue,
            };
        recipients.push((member.clone(), format!("{}:{}", wrapped_hex, nonce_hex)));
    }

    let signing_bytes = sender_key_dist_signing_bytes(&conv_id, version, &recipients);
    let signature_hex = hex::encode(identity.sign(&signing_bytes).to_bytes());

    let recipients_json: Vec<serde_json::Value> = recipients
        .iter()
        .map(|(pubkey, packed)| {
            let parts: Vec<&str> = packed.splitn(2, ':').collect();
            serde_json::json!({
                "recipient_pubkey": pubkey,
                "wrapped_key_hex": parts[0],
                "wrap_nonce_hex": parts[1],
            })
        })
        .collect();

    let resp = client
        .put(format!("{hub_url}/conversations/{conv_id}/sender-keys"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "sender_pubkey": my_pubkey,
            "sender_key_version": version,
            "iteration": iteration,
            "recipients": recipients_json,
            "signature_hex": signature_hex,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }

    if key_state["my_keys"].is_null() || !key_state["my_keys"].is_object() {
        key_state["my_keys"] = serde_json::json!({});
    }
    key_state["my_keys"][&conv_id] = serde_json::json!({
        "version": version,
        "chain_key_hex": hex::encode(chain_key),
        "iteration": iteration,
    });
    save_sender_key_state(&key_state)
}

#[tauri::command]
pub(crate) async fn rotate_group_sender_key(
    conv_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    use rand::RngCore;

    let identity_path = crate::identity::Identity::default_path().map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&identity_path).map_err(|e| e.to_string())?;
    let (my_dh_sec, _) = identity.dh_keypair();

    let mut key_state = load_sender_key_state()?;

    let old_version = key_state["my_keys"][&conv_id]
        .as_object()
        .and_then(|o| o.get("version"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    let mut new_chain_key = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut new_chain_key);
    let new_version = old_version + 1;
    let iteration = 0u32;

    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();

    let convs: Vec<serde_json::Value> = client
        .get(format!("{hub_url}/conversations"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))?;

    let members: Vec<String> = convs
        .iter()
        .find(|c| c["id"].as_str() == Some(&conv_id))
        .and_then(|c| c["members"].as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let my_pubkey = identity.public_key_hex();
    let mut recipients: Vec<(String, String)> = Vec::new();

    for member in &members {
        if member == &my_pubkey {
            continue;
        }
        let dh_resp: serde_json::Value = match client
            .get(format!("{hub_url}/identity/{member}/dh-key"))
            .bearer_auth(&token)
            .send()
            .await
        {
            Ok(r) if r.status().is_success() => r.json().await.unwrap_or(serde_json::Value::Null),
            _ => continue,
        };
        let dh_hex = match dh_resp["dh_pubkey_hex"].as_str() {
            Some(h) => h.to_string(),
            None => continue,
        };
        let dh_bytes = match hex::decode(&dh_hex) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let dh_arr: [u8; 32] = match dh_bytes.try_into() {
            Ok(a) => a,
            Err(_) => continue,
        };
        let rec_pub = x25519_dalek::PublicKey::from(dh_arr);
        let (wrapped_hex, nonce_hex) =
            match wrap_chain_key(&my_dh_sec, &rec_pub, &conv_id, &new_chain_key, iteration) {
                Ok(v) => v,
                Err(_) => continue,
            };
        recipients.push((member.clone(), format!("{}:{}", wrapped_hex, nonce_hex)));
    }

    let signing_bytes = sender_key_dist_signing_bytes(&conv_id, new_version, &recipients);
    let signature_hex = hex::encode(identity.sign(&signing_bytes).to_bytes());

    let recipients_json: Vec<serde_json::Value> = recipients
        .iter()
        .map(|(pubkey, packed)| {
            let parts: Vec<&str> = packed.splitn(2, ':').collect();
            serde_json::json!({
                "recipient_pubkey": pubkey,
                "wrapped_key_hex": parts[0],
                "wrap_nonce_hex": parts[1],
            })
        })
        .collect();

    let resp = client
        .put(format!("{hub_url}/conversations/{conv_id}/sender-keys"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "sender_pubkey": my_pubkey,
            "sender_key_version": new_version,
            "iteration": iteration,
            "recipients": recipients_json,
            "signature_hex": signature_hex,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }

    if key_state["my_keys"].is_null() || !key_state["my_keys"].is_object() {
        key_state["my_keys"] = serde_json::json!({});
    }
    key_state["my_keys"][&conv_id] = serde_json::json!({
        "version": new_version,
        "chain_key_hex": hex::encode(new_chain_key),
        "iteration": iteration,
    });
    save_sender_key_state(&key_state)
}

#[tauri::command]
pub(crate) async fn fetch_group_sender_keys(
    conv_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let identity_path = crate::identity::Identity::default_path().map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&identity_path).map_err(|e| e.to_string())?;
    let (my_dh_sec, _) = identity.dh_keypair();

    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();

    let entries: Vec<serde_json::Value> = client
        .get(format!("{hub_url}/conversations/{conv_id}/sender-keys"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))?;

    let mut key_state = load_sender_key_state()?;

    for entry in &entries {
        let sender_pubkey = match entry["sender_pubkey"].as_str() {
            Some(s) => s.to_string(),
            None => continue,
        };
        let sender_key_version = entry["sender_key_version"].as_u64().unwrap_or(1) as u32;
        let wrapped_key_hex = match entry["wrapped_key_hex"].as_str() {
            Some(s) => s,
            None => continue,
        };
        let wrap_nonce_hex = match entry["wrap_nonce_hex"].as_str() {
            Some(s) => s,
            None => continue,
        };

        let dh_resp: serde_json::Value = match client
            .get(format!("{hub_url}/identity/{sender_pubkey}/dh-key"))
            .bearer_auth(&token)
            .send()
            .await
        {
            Ok(r) if r.status().is_success() => r.json().await.unwrap_or(serde_json::Value::Null),
            _ => continue,
        };
        let sender_dh_hex = match dh_resp["dh_pubkey_hex"].as_str() {
            Some(h) => h,
            None => continue,
        };
        let sender_dh_bytes = match hex::decode(sender_dh_hex) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let sender_dh_arr: [u8; 32] = match sender_dh_bytes.try_into() {
            Ok(a) => a,
            Err(_) => continue,
        };
        let sender_dh_pub = x25519_dalek::PublicKey::from(sender_dh_arr);

        use aes_gcm::aead::{Aead, KeyInit};
        use aes_gcm::{Aes256Gcm, Key, Nonce};
        use hkdf::Hkdf;
        use sha2::Sha256;

        let shared = my_dh_sec.diffie_hellman(&sender_dh_pub);
        let hk = Hkdf::<Sha256>::new(Some(conv_id.as_bytes()), shared.as_bytes());
        let mut wrap_key = [0u8; 32];
        if hk
            .expand(b"wavvon/group-key-dist/v1", &mut wrap_key)
            .is_err()
        {
            continue;
        }
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&wrap_key));
        let nonce_bytes = match hex::decode(wrap_nonce_hex) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let wrapped_bytes = match hex::decode(wrapped_key_hex) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let nonce = Nonce::from_slice(&nonce_bytes);
        let plaintext = match cipher.decrypt(nonce, wrapped_bytes.as_slice()) {
            Ok(p) => p,
            Err(_) => continue,
        };
        if plaintext.len() < 36 {
            continue;
        }
        let chain_key_hex = hex::encode(&plaintext[..32]);
        let unwrapped_iteration =
            u32::from_be_bytes(plaintext[32..36].try_into().unwrap_or([0; 4]));

        let existing_version = key_state["peer_keys"][&conv_id][&sender_pubkey]["version"]
            .as_u64()
            .unwrap_or(0) as u32;
        if sender_key_version <= existing_version {
            continue;
        }

        if key_state["peer_keys"].is_null() || !key_state["peer_keys"].is_object() {
            key_state["peer_keys"] = serde_json::json!({});
        }
        if key_state["peer_keys"][&conv_id].is_null()
            || !key_state["peer_keys"][&conv_id].is_object()
        {
            key_state["peer_keys"][&conv_id] = serde_json::json!({});
        }
        key_state["peer_keys"][&conv_id][&sender_pubkey] = serde_json::json!({
            "version": sender_key_version,
            "chain_key_hex": chain_key_hex,
            "iteration": unwrapped_iteration,
        });
    }

    save_sender_key_state(&key_state)
}

#[tauri::command]
pub(crate) async fn encrypt_group_dm(
    conv_id: String,
    content: String,
) -> Result<serde_json::Value, String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Key, Nonce};
    use hkdf::Hkdf;
    use sha2::Sha256;

    let identity_path = crate::identity::Identity::default_path().map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&identity_path).map_err(|e| e.to_string())?;

    let mut key_state = load_sender_key_state()?;

    let (chain_key, version, iteration) = {
        let entry = key_state["my_keys"]
            .get(&conv_id)
            .filter(|v| v.is_object())
            .cloned()
            .ok_or_else(|| "no_sender_key".to_string())?;
        let ck_hex = entry["chain_key_hex"].as_str().ok_or("bad state")?;
        let ck_bytes = hex::decode(ck_hex).map_err(|e| e.to_string())?;
        let ck_arr: [u8; 32] = ck_bytes
            .try_into()
            .map_err(|_| "bad chain key length".to_string())?;
        let ver = entry["version"].as_u64().unwrap_or(1) as u32;
        let iter = entry["iteration"].as_u64().unwrap_or(0) as u32;
        (ck_arr, ver, iter)
    };

    let hk_msg = Hkdf::<Sha256>::new(Some(&iteration.to_be_bytes()), &chain_key);
    let mut msg_key = [0u8; 32];
    hk_msg
        .expand(b"wavvon/group-msg/v1", &mut msg_key)
        .map_err(|e| e.to_string())?;

    let mut nonce_bytes = [0u8; 12];
    nonce_bytes[8..12].copy_from_slice(&iteration.to_be_bytes());
    let nonce = Nonce::from_slice(&nonce_bytes);

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&msg_key));
    let plaintext = serde_json::json!({ "content": content }).to_string();
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| e.to_string())?;

    let hk_chain = Hkdf::<Sha256>::new(Some(&iteration.to_be_bytes()), &chain_key);
    let mut new_chain_key = [0u8; 32];
    hk_chain
        .expand(b"wavvon/group-chain/v1", &mut new_chain_key)
        .map_err(|e| e.to_string())?;
    let new_iteration = iteration + 1;

    key_state["my_keys"][&conv_id] = serde_json::json!({
        "version": version,
        "chain_key_hex": hex::encode(new_chain_key),
        "iteration": new_iteration,
    });
    save_sender_key_state(&key_state)?;

    let ciphertext_hex = hex::encode(&ciphertext);
    let nonce_hex = hex::encode(nonce_bytes);
    let signing_bytes =
        group_envelope_signing_bytes(&conv_id, version, iteration, &ciphertext_hex, &nonce_hex);
    let signature_hex = hex::encode(identity.sign(&signing_bytes).to_bytes());

    Ok(serde_json::json!({
        "sender_pubkey": identity.public_key_hex(),
        "conv_id": conv_id,
        "sender_key_version": version,
        "iteration": iteration,
        "ciphertext_hex": ciphertext_hex,
        "nonce_hex": nonce_hex,
        "signature_hex": signature_hex,
    }))
}

#[tauri::command]
pub(crate) async fn decrypt_group_dm(
    conv_id: String,
    envelope: serde_json::Value,
) -> Result<String, String> {
    let identity_path = crate::identity::Identity::default_path().map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&identity_path).map_err(|e| e.to_string())?;
    decrypt_group_dm_inner(&conv_id, &envelope, &identity)
}

// ---------------------------------------------------------------------------
// Double Ratchet v2 — session state, KDF helpers, Tauri commands
// ---------------------------------------------------------------------------

/// Persisted Double Ratchet session state for one conversation.
#[derive(serde::Serialize, serde::Deserialize, Clone, Default)]
struct DrSession {
    /// Root key (hex).
    rk: String,
    /// Sending chain key (hex), None before first send.
    cks: Option<String>,
    /// Receiving chain key (hex), None before first receive on a new ratchet step.
    ckr: Option<String>,
    /// Number of messages sent in current sending chain.
    ns: u32,
    /// Number of messages received in current receiving chain.
    nr: u32,
    /// Number of messages sent in previous sending chain (carried into next ratchet header).
    pn: u32,
    /// Current ratchet DH private key (hex of 32-byte X25519 scalar).
    dhs_priv: String,
    /// Current ratchet DH public key (hex).
    dhs_pub: String,
    /// Peer's current ratchet DH public key (hex), None until first message received.
    dhr: Option<String>,
    /// Cached skipped message keys. Key: `"<dhr_hex>:<n>"`, value: msg_key hex.
    mkskipped: std::collections::HashMap<String, String>,
}

/// Wire envelope for a Double Ratchet v2 DM.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DrDmEnvelope {
    pub sender_pubkey: String,
    pub conv_id: String,
    pub ciphertext_hex: String,
    /// Sender's current ratchet DH public key.
    pub dh_pubkey_hex: String,
    pub signature_hex: String,
    /// Always 2 for v2 envelopes.
    pub v: u8,
    pub message_index: u32,
    pub prev_count: u32,
}

fn dr_sessions_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;
    Ok(home.join(".wavvon").join("dr_sessions.json"))
}

fn load_dr_sessions() -> Result<std::collections::HashMap<String, DrSession>, String> {
    let path = dr_sessions_path()?;
    if !path.exists() {
        return Ok(std::collections::HashMap::new());
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

fn save_dr_sessions(sessions: &std::collections::HashMap<String, DrSession>) -> Result<(), String> {
    let path = dr_sessions_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(sessions).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())
}

/// KDF_RK — derive a new root key and chain key from the current root key and a DH output.
/// `out = HKDF-SHA256(ikm=dh_output, salt=rk, info="wavvon/dr-rk/v2", len=64)`
fn kdf_rk(rk: &[u8; 32], dh_output: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    use hkdf::Hkdf;
    use sha2::Sha256;
    let hk = Hkdf::<Sha256>::new(Some(rk), dh_output);
    let mut out = [0u8; 64];
    hk.expand(b"wavvon/dr-rk/v2", &mut out)
        .expect("HKDF expand 64 bytes always succeeds");
    let mut new_rk = [0u8; 32];
    let mut new_ck = [0u8; 32];
    new_rk.copy_from_slice(&out[..32]);
    new_ck.copy_from_slice(&out[32..]);
    (new_rk, new_ck)
}

/// KDF_CK — derive a message key and the next chain key from the current chain key.
/// `out = HKDF-SHA256(ikm=ck, salt=&[], info="wavvon/dr-ck-step/v2", len=64)`
fn kdf_ck(ck: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    use hkdf::Hkdf;
    use sha2::Sha256;
    let hk = Hkdf::<Sha256>::new(None, ck);
    let mut out = [0u8; 64];
    hk.expand(b"wavvon/dr-ck-step/v2", &mut out)
        .expect("HKDF expand 64 bytes always succeeds");
    let mut msg_key = [0u8; 32];
    let mut new_ck = [0u8; 32];
    msg_key.copy_from_slice(&out[..32]);
    new_ck.copy_from_slice(&out[32..]);
    (msg_key, new_ck)
}

/// derive_nonce — produce a 12-byte AES-GCM nonce deterministically from a message key.
/// `HKDF-SHA256(ikm=msg_key, salt=&[], info="wavvon/dr-nonce/v2", len=12)`
fn derive_nonce_dr(msg_key: &[u8; 32]) -> [u8; 12] {
    use hkdf::Hkdf;
    use sha2::Sha256;
    let hk = Hkdf::<Sha256>::new(None, msg_key);
    let mut out = [0u8; 12];
    hk.expand(b"wavvon/dr-nonce/v2", &mut out)
        .expect("HKDF expand 12 bytes always succeeds");
    out
}

/// Signing bytes for a DR v2 DM envelope.
/// Tag: `b"wavvon/dm-ciphertext/v2\0"` — matches `wavvon_identity::dr_envelope_signing_bytes`.
pub(crate) fn dr_envelope_signing_bytes(
    conv_id: &str,
    message_index: u32,
    prev_count: u32,
    ciphertext_hex: &str,
    dh_pubkey_hex: &str,
) -> Vec<u8> {
    fn len_prefixed(out: &mut Vec<u8>, s: &str) {
        let b = s.as_bytes();
        out.extend_from_slice(&(b.len() as u32).to_le_bytes());
        out.extend_from_slice(b);
    }
    let mut out = b"wavvon/dm-ciphertext/v2\0".to_vec();
    len_prefixed(&mut out, conv_id);
    out.extend_from_slice(&message_index.to_le_bytes());
    out.extend_from_slice(&prev_count.to_le_bytes());
    len_prefixed(&mut out, ciphertext_hex);
    len_prefixed(&mut out, dh_pubkey_hex);
    out
}

/// Generate a fresh X25519 keypair for use as a ratchet DH key.
/// Returns `(priv_hex, pub_hex)`.
fn generate_ratchet_keypair() -> (String, String) {
    use rand::rngs::OsRng;
    let priv_key = x25519_dalek::StaticSecret::random_from_rng(OsRng);
    let pub_key = x25519_dalek::PublicKey::from(&priv_key);
    (
        hex::encode(priv_key.to_bytes()),
        hex::encode(pub_key.as_bytes()),
    )
}

/// Decode a hex string into a 32-byte X25519 StaticSecret.
fn static_secret_from_hex(hex_str: &str) -> Result<x25519_dalek::StaticSecret, String> {
    let bytes = hex::decode(hex_str).map_err(|e| e.to_string())?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "DH key must be 32 bytes".to_string())?;
    Ok(x25519_dalek::StaticSecret::from(arr))
}

/// Decode a hex string into a 32-byte X25519 PublicKey.
fn public_key_from_hex(hex_str: &str) -> Result<x25519_dalek::PublicKey, String> {
    let bytes = hex::decode(hex_str).map_err(|e| e.to_string())?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "DH pubkey must be 32 bytes".to_string())?;
    Ok(x25519_dalek::PublicKey::from(arr))
}

/// Initialise a Double Ratchet v2 session as Alice (the initiator).
///
/// Idempotent: if the session already exists for `conv_id`, returns Ok immediately.
#[tauri::command]
pub(crate) async fn init_dr_session(
    conv_id: String,
    their_dh_pub_hex: String,
) -> Result<(), String> {
    use hkdf::Hkdf;
    use sha2::Sha256;

    let mut sessions = load_dr_sessions()?;
    if sessions.contains_key(&conv_id) {
        return Ok(());
    }

    let identity_path = crate::identity::Identity::default_path().map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&identity_path).map_err(|e| e.to_string())?;
    let (my_dh_priv, _) = identity.dh_keypair();

    let their_static_pub = public_key_from_hex(&their_dh_pub_hex)?;

    // Step 1: static_shared = X25519(my_static, their_static)
    let static_shared = my_dh_priv.diffie_hellman(&their_static_pub);

    // Step 2: rk0 = HKDF(ikm=static_shared, salt=conv_id, info="wavvon/dr-init/v2", len=32)
    let hk = Hkdf::<Sha256>::new(Some(conv_id.as_bytes()), static_shared.as_bytes());
    let mut rk0 = [0u8; 32];
    hk.expand(b"wavvon/dr-init/v2", &mut rk0)
        .map_err(|e| e.to_string())?;

    // Step 3: fresh ephemeral ratchet keypair
    let (eph_priv_hex, eph_pub_hex) = generate_ratchet_keypair();
    let eph_priv = static_secret_from_hex(&eph_priv_hex)?;

    // Step 4: dh_out = X25519(eph_priv, their_static)
    let dh_out = eph_priv.diffie_hellman(&their_static_pub);

    // Step 5: (rk, cks) = KDF_RK(rk0, dh_out)
    let dh_out_arr: [u8; 32] = *dh_out.as_bytes();
    let (rk, cks) = kdf_rk(&rk0, &dh_out_arr);

    let session = DrSession {
        rk: hex::encode(rk),
        cks: Some(hex::encode(cks)),
        ckr: None,
        ns: 0,
        nr: 0,
        pn: 0,
        dhs_priv: eph_priv_hex,
        dhs_pub: eph_pub_hex,
        dhr: None,
        mkskipped: std::collections::HashMap::new(),
    };

    sessions.insert(conv_id, session);
    save_dr_sessions(&sessions)
}

/// Encrypt a message using Double Ratchet v2, returning a signed `DrDmEnvelope`.
#[tauri::command]
pub(crate) async fn encrypt_dm_dr(
    conv_id: String,
    content: String,
) -> Result<DrDmEnvelope, String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Key, Nonce};

    let identity_path = crate::identity::Identity::default_path().map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&identity_path).map_err(|e| e.to_string())?;

    let mut sessions = load_dr_sessions()?;
    let session = sessions
        .get_mut(&conv_id)
        .ok_or_else(|| "dr_session_not_initialised".to_string())?;

    let cks_hex = session
        .cks
        .clone()
        .ok_or_else(|| "no_sending_chain_key".to_string())?;
    let cks_bytes = hex::decode(&cks_hex).map_err(|e| e.to_string())?;
    let cks_arr: [u8; 32] = cks_bytes
        .try_into()
        .map_err(|_| "bad chain key length".to_string())?;

    let (mk, new_cks) = kdf_ck(&cks_arr);
    let nonce_bytes = derive_nonce_dr(&mk);

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&mk));
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = serde_json::json!({ "content": content }).to_string();
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| e.to_string())?;
    let ciphertext_hex = hex::encode(&ciphertext);

    let message_index = session.ns;
    let prev_count = session.pn;
    let dhs_pub = session.dhs_pub.clone();

    let signing_bytes = dr_envelope_signing_bytes(
        &conv_id,
        message_index,
        prev_count,
        &ciphertext_hex,
        &dhs_pub,
    );
    let signature_hex = hex::encode(identity.sign(&signing_bytes).to_bytes());

    // Advance state
    session.cks = Some(hex::encode(new_cks));
    session.ns += 1;

    save_dr_sessions(&sessions)?;

    Ok(DrDmEnvelope {
        sender_pubkey: identity.public_key_hex(),
        conv_id,
        ciphertext_hex,
        dh_pubkey_hex: dhs_pub,
        signature_hex,
        v: 2,
        message_index,
        prev_count,
    })
}

/// Decrypt a Double Ratchet v2 DM from a JSON-serialised `DrDmEnvelope`.
///
/// If the session is not initialised, returns `Err("dr_session_not_initialised")`
/// so the UI can call `init_dr_session` and retry.
#[tauri::command]
pub(crate) async fn decrypt_dm_dr(
    conv_id: String,
    envelope_json: String,
) -> Result<String, String> {
    let env: DrDmEnvelope =
        serde_json::from_str(&envelope_json).map_err(|e| format!("bad envelope: {e}"))?;
    let result = decrypt_dm_dr_inner(
        &conv_id,
        &serde_json::to_value(&env).map_err(|e| e.to_string())?,
    )?;
    Ok(result)
}

/// Inner synchronous DR decrypt used both by `decrypt_dm_dr` and `get_dm_messages`.
fn decrypt_dm_dr_inner(conv_id: &str, envelope: &serde_json::Value) -> Result<String, String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Key, Nonce};

    let ciphertext_hex = envelope["ciphertext_hex"]
        .as_str()
        .ok_or("missing ciphertext_hex")?;
    let dh_pubkey_hex = envelope["dh_pubkey_hex"]
        .as_str()
        .ok_or("missing dh_pubkey_hex")?;
    let message_index = envelope["message_index"]
        .as_u64()
        .ok_or("missing message_index")? as u32;
    let prev_count = envelope["prev_count"].as_u64().unwrap_or(0) as u32;

    let mut sessions = load_dr_sessions()?;
    let session = sessions
        .get_mut(conv_id)
        .ok_or_else(|| "dr_session_not_initialised".to_string())?;

    // Check skipped-key cache first
    let skipped_key_entry = format!("{}:{}", dh_pubkey_hex, message_index);
    if let Some(mk_hex) = session.mkskipped.remove(&skipped_key_entry) {
        let mk_bytes = hex::decode(&mk_hex).map_err(|e| e.to_string())?;
        let mk_arr: [u8; 32] = mk_bytes
            .try_into()
            .map_err(|_| "bad msg key length".to_string())?;
        let nonce_bytes = derive_nonce_dr(&mk_arr);
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&mk_arr));
        let ct = hex::decode(ciphertext_hex).map_err(|e| e.to_string())?;
        let plaintext_bytes = cipher
            .decrypt(Nonce::from_slice(&nonce_bytes), ct.as_slice())
            .map_err(|_| "decryption failed".to_string())?;
        let plaintext: serde_json::Value =
            serde_json::from_slice(&plaintext_bytes).map_err(|e| e.to_string())?;
        save_dr_sessions(&sessions)?;
        return Ok(plaintext["content"].as_str().unwrap_or("").to_string());
    }

    const MAX_SKIP: usize = 1000;

    // Check whether the message uses a new ratchet key
    let is_new_ratchet = session.dhr.as_deref() != Some(dh_pubkey_hex);

    if is_new_ratchet {
        // Cache skipped keys in old receiving chain up to prev_count
        if let Some(ref ckr_hex) = session.ckr.clone() {
            let old_dhr = session.dhr.clone().unwrap_or_default();
            let ckr_bytes = hex::decode(ckr_hex).map_err(|e| e.to_string())?;
            let mut ckr: [u8; 32] = ckr_bytes
                .try_into()
                .map_err(|_| "bad chain key length".to_string())?;

            let to_skip = prev_count.saturating_sub(session.nr);
            if session.mkskipped.len() + to_skip as usize > MAX_SKIP {
                return Err("too_many_skipped_messages".to_string());
            }
            for n in session.nr..prev_count {
                let (mk, new_ckr) = kdf_ck(&ckr);
                session
                    .mkskipped
                    .insert(format!("{}:{}", old_dhr, n), hex::encode(mk));
                ckr = new_ckr;
            }
        }

        // DH ratchet step
        let rk_bytes = hex::decode(&session.rk).map_err(|e| e.to_string())?;
        let rk: [u8; 32] = rk_bytes
            .try_into()
            .map_err(|_| "bad root key length".to_string())?;
        let my_dhs_priv = static_secret_from_hex(&session.dhs_priv)?;
        let their_new_pub = public_key_from_hex(dh_pubkey_hex)?;
        let dh_recv = my_dhs_priv.diffie_hellman(&their_new_pub);
        let dh_recv_arr: [u8; 32] = *dh_recv.as_bytes();
        let (new_rk, new_ckr) = kdf_rk(&rk, &dh_recv_arr);

        // Generate new sending DH keypair
        let (new_dhs_priv_hex, new_dhs_pub_hex) = generate_ratchet_keypair();
        let new_dhs_priv = static_secret_from_hex(&new_dhs_priv_hex)?;
        let dh_send = new_dhs_priv.diffie_hellman(&their_new_pub);
        let dh_send_arr: [u8; 32] = *dh_send.as_bytes();
        let (new_rk2, new_cks) = kdf_rk(&new_rk, &dh_send_arr);

        session.rk = hex::encode(new_rk2);
        session.cks = Some(hex::encode(new_cks));
        session.pn = session.ns;
        session.ns = 0;
        session.nr = 0;
        session.dhr = Some(dh_pubkey_hex.to_string());
        session.ckr = Some(hex::encode(new_ckr));
        session.dhs_priv = new_dhs_priv_hex;
        session.dhs_pub = new_dhs_pub_hex;
    }

    // Advance receiving chain to message_index, caching skipped keys
    let ckr_hex = session
        .ckr
        .clone()
        .ok_or_else(|| "no_receiving_chain_key".to_string())?;
    let ckr_bytes = hex::decode(&ckr_hex).map_err(|e| e.to_string())?;
    let mut ckr: [u8; 32] = ckr_bytes
        .try_into()
        .map_err(|_| "bad chain key length".to_string())?;

    let to_skip = message_index.saturating_sub(session.nr);
    if session.mkskipped.len() + to_skip as usize > MAX_SKIP {
        return Err("too_many_skipped_messages".to_string());
    }
    for n in session.nr..message_index {
        let (mk, new_ckr) = kdf_ck(&ckr);
        let cache_key = format!("{}:{}", dh_pubkey_hex, n);
        session.mkskipped.insert(cache_key, hex::encode(mk));
        ckr = new_ckr;
    }

    // Decrypt message at message_index
    let (mk, new_ckr) = kdf_ck(&ckr);
    let nonce_bytes = derive_nonce_dr(&mk);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&mk));
    let ct = hex::decode(ciphertext_hex).map_err(|e| e.to_string())?;
    let plaintext_bytes = cipher
        .decrypt(Nonce::from_slice(&nonce_bytes), ct.as_slice())
        .map_err(|_| "decryption failed".to_string())?;

    session.ckr = Some(hex::encode(new_ckr));
    session.nr = message_index + 1;

    save_dr_sessions(&sessions)?;

    let plaintext: serde_json::Value =
        serde_json::from_slice(&plaintext_bytes).map_err(|e| e.to_string())?;
    Ok(plaintext["content"].as_str().unwrap_or("").to_string())
}

fn decrypt_group_dm_inner(
    conv_id: &str,
    envelope: &serde_json::Value,
    identity: &crate::identity::Identity,
) -> Result<String, String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Key, Nonce};
    use hkdf::Hkdf;
    use sha2::Sha256;

    let sender_pubkey = envelope["sender_pubkey"]
        .as_str()
        .ok_or("missing sender_pubkey")?;
    let sender_key_version = envelope["sender_key_version"].as_u64().unwrap_or(1) as u32;
    let iteration = envelope["iteration"].as_u64().ok_or("missing iteration")? as u32;
    let ciphertext_hex = envelope["ciphertext_hex"]
        .as_str()
        .ok_or("missing ciphertext_hex")?;
    let nonce_hex = envelope["nonce_hex"].as_str().ok_or("missing nonce_hex")?;

    if sender_pubkey == identity.public_key_hex() {
        return Err("own_message".to_string());
    }

    let key_state = load_sender_key_state()?;

    let peer_entry = key_state["peer_keys"][conv_id][sender_pubkey]
        .as_object()
        .ok_or_else(|| "key_not_found".to_string())?;

    let stored_version = peer_entry
        .get("version")
        .and_then(|v| v.as_u64())
        .unwrap_or(1) as u32;
    if stored_version != sender_key_version {
        return Err("version_mismatch".to_string());
    }

    let stored_ck_hex = peer_entry
        .get("chain_key_hex")
        .and_then(|v| v.as_str())
        .ok_or("bad state")?;
    let stored_ck_bytes = hex::decode(stored_ck_hex).map_err(|e| e.to_string())?;
    let mut chain_key: [u8; 32] = stored_ck_bytes
        .try_into()
        .map_err(|_| "bad chain key length".to_string())?;
    let stored_iteration = peer_entry
        .get("iteration")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    if stored_iteration > iteration {
        return Err("chain_advanced_past_message".to_string());
    }

    for i in stored_iteration..iteration {
        let hk = Hkdf::<Sha256>::new(Some(&i.to_be_bytes()), &chain_key);
        let mut next = [0u8; 32];
        hk.expand(b"wavvon/group-chain/v1", &mut next)
            .map_err(|e| e.to_string())?;
        chain_key = next;
    }

    let hk_msg = Hkdf::<Sha256>::new(Some(&iteration.to_be_bytes()), &chain_key);
    let mut msg_key = [0u8; 32];
    hk_msg
        .expand(b"wavvon/group-msg/v1", &mut msg_key)
        .map_err(|e| e.to_string())?;

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&msg_key));
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
