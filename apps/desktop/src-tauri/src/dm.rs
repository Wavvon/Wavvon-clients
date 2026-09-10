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
    crate::paging::fetch_all_pages_as(
        &client,
        &token,
        &format!("{hub_url}/conversations"),
        "id",
        "list_conversations",
    )
    .await
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
    let own_plaintexts = load_own_plaintexts();

    // Sender DH keys are only needed to responder-init a missing DR session
    // (first inbound v2 message) — skip the fetches entirely when a session
    // already exists. One fetch per distinct sender per call otherwise.
    let have_dr_session = load_dr_sessions()
        .map(|s| s.contains_key(&conversation_id))
        .unwrap_or(false);
    let mut dh_key_cache: std::collections::HashMap<String, Option<String>> =
        std::collections::HashMap::new();

    let mut result = Vec::with_capacity(raw.len());
    for msg in raw {
        let sender_dh_key: Option<String> = if !have_dr_session && msg.is_encrypted {
            if !dh_key_cache.contains_key(&msg.sender) {
                let fetched = fetch_dh_key_http(&client, &hub_url, &token, &msg.sender).await;
                dh_key_cache.insert(msg.sender.clone(), fetched);
            }
            dh_key_cache.get(&msg.sender).cloned().flatten()
        } else {
            None
        };
        let content = if (msg.is_encrypted || msg.is_group_encrypted)
            && own_plaintexts.contains_key(&msg.id)
        {
            // Our own encrypted send — the ratchet can't decrypt its own
            // outbound envelopes (and the group path only had a "[sent]"
            // placeholder); render the plaintext stashed at send time.
            own_plaintexts[&msg.id].clone()
        } else if msg.is_encrypted {
            if let Some(ref env) = msg.encrypted_envelope {
                let is_v2 = env["v"].as_u64().unwrap_or(1) == 2;
                if is_v2 {
                    decrypt_dm_dr_inner(&conversation_id, env, sender_dh_key.as_deref())
                        .unwrap_or_else(|_| "[decryption failed]".to_string())
                } else if let Some(ref id) = identity {
                    decrypt_dm_inner(&conversation_id, env, id)
                        .unwrap_or_else(|_| "[decryption failed]".to_string())
                } else {
                    "[encrypted]".to_string()
                }
            } else if let Some(ref env) = msg.dr_envelope {
                decrypt_dm_dr_inner(&conversation_id, env, sender_dh_key.as_deref())
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

    let my_dh_sec = identity.e2e_dh_secret();
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
    // Plaintext of an encrypted send, stashed locally per message id so
    // history reloads can render our own messages (see load_own_plaintexts).
    // Never sent to the hub.
    plaintext: Option<String>,
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
    if let Some(pt) = plaintext {
        if let Ok(created) = resp.json::<serde_json::Value>().await {
            if let Some(id) = created["id"].as_str() {
                save_own_plaintext(id, &pt);
            }
        }
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

    // Per hub, not once for all of them: the hub verifies the record against
    // the pubkey in the URL and that must be the identity *it* seated us as,
    // which is not the same on every hub (see HubSession::canonical_pubkey).
    // Published under the wrong one the row fails its foreign key and nobody
    // can encrypt to this device at all — which is why a DM to a fresh
    // desktop identity arrived in plaintext until 2026-09-06.
    let hub_sessions: Vec<(String, String, String)> = {
        let sessions = state.hubs.lock().unwrap();
        sessions
            .values()
            .map(|s| {
                (
                    s.hub_url.clone(),
                    s.token.clone(),
                    s.canonical_pubkey.clone(),
                )
            })
            .collect()
    };

    for (hub_url, token, canonical) in hub_sessions {
        let me = crate::auth_creds::hub_identity(Some(&canonical))?;
        let pubkey_hex = me.pubkey();
        // A paired device holds a subkey, and a DH record carries no cert to
        // chain it — only the device that holds the canonical seed can sign
        // one. The enrolling device already published it. (Web skips for the
        // same reason: canPublishDhKey in platform/commands/dms.ts.)
        if pubkey_hex != canonical {
            continue;
        }
        let signature_hex = hex::encode(me.sign(&crate::identity::DhKeyRecord::signing_bytes(
            &pubkey_hex,
            &dh_pubkey_hex,
        )));
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

/// Fetch a user's published static DH key from a hub. Returns None on any
/// failure (unpublished key, network error) — callers treat that as
/// "cannot responder-init".
pub(crate) async fn fetch_dh_key_http(
    client: &reqwest::Client,
    hub_url: &str,
    token: &str,
    pubkey: &str,
) -> Option<String> {
    let url = format!("{hub_url}/identity/{pubkey}/dh-key");
    let resp = client.get(&url).bearer_auth(token).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let v: serde_json::Value = resp.json().await.ok()?;
    v["dh_pubkey_hex"].as_str().map(|s| s.to_string())
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

// ---------------------------------------------------------------------------
// Group E2E sender-key commands
// ---------------------------------------------------------------------------

fn group_sender_keys_path() -> Result<std::path::PathBuf, String> {
    crate::accounts::active_group_sender_keys_path()
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

/// One member's copy of a sender key: the wrapped key and the nonce that
/// wrapped it, kept apart.
///
/// They used to be packed into one `"wrapped:nonce"` string and passed as the
/// `wrapped_hex` half of the signing pairs, so this side signed over the pair
/// *including* the nonce while the hub signs over the wrapped key alone
/// (identity crate, `sender_key_dist_signing_bytes`). Every distribution was
/// rejected, which is every group conversation: nobody can send under a
/// sender key nobody could be given.
pub(crate) struct WrappedForRecipient {
    pub pubkey: String,
    pub wrapped_hex: String,
    pub nonce_hex: String,
}

/// Wrap the chain key for every member but ourselves.
///
/// One function for both the first distribution and the leave-triggered
/// rotation: they were copies, and the copies had already drifted — the
/// rotation signed with this device's own `Identity` instead of routing
/// through `auth_creds::hub_identity`, so it claimed the canonical pubkey and
/// signed with a key that is not it.
///
/// A member whose DH key cannot be fetched is skipped, deliberately: they get
/// no copy of this key and cannot read the messages under it, which is the
/// same outcome as any absent key and is repaired by the next rotation.
#[allow(clippy::too_many_arguments)]
async fn wrap_for_members(
    client: &reqwest::Client,
    hub_url: &str,
    token: &str,
    members: &[String],
    my_pubkey: &str,
    my_dh_sec: &x25519_dalek::StaticSecret,
    conv_id: &str,
    chain_key: &[u8; 32],
    iteration: u32,
) -> Vec<WrappedForRecipient> {
    let mut out = Vec::new();
    for member in members {
        if member == my_pubkey {
            continue;
        }
        let dh_resp: serde_json::Value = match client
            .get(format!("{hub_url}/identity/{member}/dh-key"))
            .bearer_auth(token)
            .send()
            .await
        {
            Ok(r) if r.status().is_success() => r.json().await.unwrap_or(serde_json::Value::Null),
            _ => continue,
        };
        let Some(dh_hex) = dh_resp["dh_pubkey_hex"].as_str() else {
            continue;
        };
        let Ok(dh_bytes) = hex::decode(dh_hex) else {
            continue;
        };
        let Ok(dh_arr) = <[u8; 32]>::try_from(dh_bytes) else {
            continue;
        };
        let rec_pub = x25519_dalek::PublicKey::from(dh_arr);
        let Ok((wrapped_hex, nonce_hex)) =
            wrap_chain_key(my_dh_sec, &rec_pub, conv_id, chain_key, iteration)
        else {
            continue;
        };
        out.push(WrappedForRecipient {
            pubkey: member.clone(),
            wrapped_hex,
            nonce_hex,
        });
    }
    out
}

/// The `(pubkey, wrapped_hex)` pairs the signature covers — the nonce is not
/// among them, which is the whole point of keeping the two apart.
fn dist_signing_pairs(recipients: &[WrappedForRecipient]) -> Vec<(String, String)> {
    recipients
        .iter()
        .map(|r| (r.pubkey.clone(), r.wrapped_hex.clone()))
        .collect()
}

/// The request blobs. `iteration` is required by the hub and was missing, so
/// the body failed to deserialize before any signature was even looked at.
fn dist_recipients_json(
    recipients: &[WrappedForRecipient],
    iteration: u32,
) -> Vec<serde_json::Value> {
    recipients
        .iter()
        .map(|r| {
            serde_json::json!({
                "recipient_pubkey": r.pubkey,
                "wrapped_key_hex": r.wrapped_hex,
                "wrap_nonce_hex": r.nonce_hex,
                "iteration": iteration,
            })
        })
        .collect()
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
    let my_dh_sec = identity.e2e_dh_secret();

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

    // Walked to exhaustion: this looks a conversation up by id, and a single
    // page would silently miss it for anyone with more DM partners than fit.
    let convs = crate::paging::fetch_all_pages(
        &client,
        &token,
        &format!("{hub_url}/conversations"),
        "id",
        "conversation lookup",
    )
    .await?;

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

    let me = crate::auth_creds::hub_identity(
        crate::state::canonical_for_url(&state, &hub_url).as_deref(),
    )?;
    let my_pubkey = me.pubkey();
    let recipients = wrap_for_members(
        &client, &hub_url, &token, &members, &my_pubkey, &my_dh_sec, &conv_id, &chain_key,
        iteration,
    )
    .await;

    let signing_bytes =
        sender_key_dist_signing_bytes(&conv_id, version, &dist_signing_pairs(&recipients));
    let signature_hex = hex::encode(me.sign(&signing_bytes));

    let resp = client
        .put(format!("{hub_url}/conversations/{conv_id}/sender-keys"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "sender_pubkey": my_pubkey,
            "sender_key_version": version,
            "iteration": iteration,
            "recipients": dist_recipients_json(&recipients, iteration),
            "signature_hex": signature_hex,
            // A paired device signs with its subkey; the cert is what ties
            // that signature to the canonical pubkey claimed above.
            "signer_cert": me.signer_cert(),
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
    let my_dh_sec = identity.e2e_dh_secret();

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

    // Walked to exhaustion: this looks a conversation up by id, and a single
    // page would silently miss it for anyone with more DM partners than fit.
    let convs = crate::paging::fetch_all_pages(
        &client,
        &token,
        &format!("{hub_url}/conversations"),
        "id",
        "conversation lookup",
    )
    .await?;

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

    let me = crate::auth_creds::hub_identity(
        crate::state::canonical_for_url(&state, &hub_url).as_deref(),
    )?;
    let my_pubkey = me.pubkey();
    let recipients = wrap_for_members(
        &client,
        &hub_url,
        &token,
        &members,
        &my_pubkey,
        &my_dh_sec,
        &conv_id,
        &new_chain_key,
        iteration,
    )
    .await;

    let signing_bytes =
        sender_key_dist_signing_bytes(&conv_id, new_version, &dist_signing_pairs(&recipients));
    let signature_hex = hex::encode(me.sign(&signing_bytes));

    let resp = client
        .put(format!("{hub_url}/conversations/{conv_id}/sender-keys"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "sender_pubkey": my_pubkey,
            "sender_key_version": new_version,
            "iteration": iteration,
            "recipients": dist_recipients_json(&recipients, iteration),
            "signature_hex": signature_hex,
            "signer_cert": me.signer_cert(),
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
    let my_dh_sec = identity.e2e_dh_secret();

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
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Key, Nonce};
    use hkdf::Hkdf;
    use sha2::Sha256;

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
    let me =
        crate::auth_creds::hub_identity(crate::state::active_canonical_pubkey(&state).as_deref())?;
    let signature_hex = hex::encode(me.sign(&signing_bytes));

    Ok(serde_json::json!({
        "sender_pubkey": me.pubkey(),
        "conv_id": conv_id,
        "sender_key_version": version,
        "iteration": iteration,
        "ciphertext_hex": ciphertext_hex,
        "nonce_hex": nonce_hex,
        "signature_hex": signature_hex,
        // Same as the 1:1 envelope: on a paired device `me.sign` is the
        // subkey, and this is what ties it to the canonical pubkey claimed
        // above. `None` on a device that signs as itself.
        "signer_cert": me.signer_cert(),
    }))
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
    /// Always empty for v2 — the nonce is derived from the message key and is
    /// not transmitted. Present because the hub's `EncryptedDmEnvelope`
    /// requires the field; web sends the same empty string.
    pub nonce_hex: String,
    /// Sender's current ratchet DH public key.
    pub dh_pubkey_hex: String,
    pub signature_hex: String,
    /// Always 2 for v2 envelopes.
    pub v: u8,
    pub message_index: u32,
    pub prev_count: u32,
    /// Present when the signing key is not the sender: a paired device signs
    /// with its subkey and chains it to the canonical identity through this
    /// cert (decisions.md, "Paired-device DMs attribute to canonical via
    /// cert-chained envelopes"). Omitted otherwise, which keeps a
    /// single-device envelope byte-identical to what the vectors pin.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signer_cert: Option<crate::identity::SubkeyCert>,
}

fn dr_sessions_path() -> Result<std::path::PathBuf, String> {
    crate::accounts::active_dr_sessions_path()
}

// A ratchet can't decrypt its own outbound envelopes (the message keys are
// consumed at encrypt time, the receiving chain belongs to the peer), so the
// sender's plaintext is stashed per message id at send time and read back
// when rendering history. Mirrors web's scoped-localStorage stash.
// ponytail: one flat JSON map, never pruned — split per conversation if a
// heavy DM user ever notices.
fn load_own_plaintexts() -> std::collections::HashMap<String, String> {
    let Ok(path) = crate::accounts::active_own_dm_plaintexts_path() else {
        return std::collections::HashMap::new();
    };
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save_own_plaintext(message_id: &str, plaintext: &str) {
    let Ok(path) = crate::accounts::active_own_dm_plaintexts_path() else {
        return;
    };
    let mut map = load_own_plaintexts();
    map.insert(message_id.to_string(), plaintext.to_string());
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(text) = serde_json::to_string(&map) {
        let _ = std::fs::write(&path, text);
    }
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

/// rk0 = HKDF(ikm=X25519(my_static, their_static), salt=conv_id,
/// info="wavvon/dr-init/v2", len=32) — the shared DR root both sides derive.
fn dr_root_key(
    conv_id: &str,
    my_static_priv: &x25519_dalek::StaticSecret,
    their_static_pub: &x25519_dalek::PublicKey,
) -> Result<[u8; 32], String> {
    use hkdf::Hkdf;
    use sha2::Sha256;
    let static_shared = my_static_priv.diffie_hellman(their_static_pub);
    let hk = Hkdf::<Sha256>::new(Some(conv_id.as_bytes()), static_shared.as_bytes());
    let mut rk0 = [0u8; 32];
    hk.expand(b"wavvon/dr-init/v2", &mut rk0)
        .map_err(|e| e.to_string())?;
    Ok(rk0)
}

/// Initialise a DR v2 session as Alice (the initiator). Pure — no disk I/O.
fn initiator_init_session(
    conv_id: &str,
    my_static_priv: &x25519_dalek::StaticSecret,
    their_dh_pub_hex: &str,
) -> Result<DrSession, String> {
    let their_static_pub = public_key_from_hex(their_dh_pub_hex)?;
    let rk0 = dr_root_key(conv_id, my_static_priv, &their_static_pub)?;

    // Fresh ephemeral ratchet keypair; (rk, cks) = KDF_RK(rk0, X25519(eph, their_static))
    let (eph_priv_hex, eph_pub_hex) = generate_ratchet_keypair();
    let eph_priv = static_secret_from_hex(&eph_priv_hex)?;
    let dh_out = eph_priv.diffie_hellman(&their_static_pub);
    let dh_out_arr: [u8; 32] = *dh_out.as_bytes();
    let (rk, cks) = kdf_rk(&rk0, &dh_out_arr);

    Ok(DrSession {
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
    })
}

/// Initialise a DR v2 session as Bob (the responder), from the first inbound
/// envelope's ratchet key. Pure — no disk I/O. Mirrors packages/core
/// `decryptDmDr`'s empty-session branch: the receiving chain must equal the
/// initiator's sending chain (KDF_RK(rk0, X25519(my_static, their_eph))),
/// and our own fresh ratchet keypair seeds the sending chain the initiator
/// will derive on its next ratchet step.
fn responder_init_session(
    conv_id: &str,
    my_static_priv: &x25519_dalek::StaticSecret,
    their_static_dh_pub_hex: &str,
    incoming_dhr_hex: &str,
) -> Result<DrSession, String> {
    let their_static_pub = public_key_from_hex(their_static_dh_pub_hex)?;
    let incoming_dhr = public_key_from_hex(incoming_dhr_hex)?;
    let rk0 = dr_root_key(conv_id, my_static_priv, &their_static_pub)?;

    let dh_recv = my_static_priv.diffie_hellman(&incoming_dhr);
    let dh_recv_arr: [u8; 32] = *dh_recv.as_bytes();
    let (rk, ckr) = kdf_rk(&rk0, &dh_recv_arr);

    let (eph_priv_hex, eph_pub_hex) = generate_ratchet_keypair();
    let eph_priv = static_secret_from_hex(&eph_priv_hex)?;
    let dh_send = eph_priv.diffie_hellman(&incoming_dhr);
    let dh_send_arr: [u8; 32] = *dh_send.as_bytes();
    let (rk2, cks) = kdf_rk(&rk, &dh_send_arr);

    Ok(DrSession {
        rk: hex::encode(rk2),
        cks: Some(hex::encode(cks)),
        ckr: Some(hex::encode(ckr)),
        ns: 0,
        nr: 0,
        pn: 0,
        dhs_priv: eph_priv_hex,
        dhs_pub: eph_pub_hex,
        dhr: Some(incoming_dhr_hex.to_string()),
        mkskipped: std::collections::HashMap::new(),
    })
}

/// Initialise a Double Ratchet v2 session as Alice (the initiator).
///
/// Idempotent: if the session already exists for `conv_id`, returns Ok immediately.
#[tauri::command]
pub(crate) async fn init_dr_session(
    conv_id: String,
    their_dh_pub_hex: String,
) -> Result<(), String> {
    let mut sessions = load_dr_sessions()?;
    if sessions.contains_key(&conv_id) {
        return Ok(());
    }

    let identity_path = crate::identity::Identity::default_path().map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&identity_path).map_err(|e| e.to_string())?;
    let my_dh_priv = identity.e2e_dh_secret();

    let session = initiator_init_session(&conv_id, &my_dh_priv, &their_dh_pub_hex)?;
    sessions.insert(conv_id, session);
    save_dr_sessions(&sessions)
}

/// Encrypt a message using Double Ratchet v2, returning a signed `DrDmEnvelope`.
#[tauri::command]
pub(crate) async fn encrypt_dm_dr(
    conv_id: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<DrDmEnvelope, String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Key, Nonce};

    // Who the hub seated this session as, not who this device is: it verifies
    // the signature against that pubkey and refuses the message otherwise.
    let me =
        crate::auth_creds::hub_identity(crate::state::active_canonical_pubkey(&state).as_deref())?;

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
    let signature_hex = hex::encode(me.sign(&signing_bytes));

    // Advance state
    session.cks = Some(hex::encode(new_cks));
    session.ns += 1;

    save_dr_sessions(&sessions)?;

    Ok(DrDmEnvelope {
        sender_pubkey: me.pubkey(),
        conv_id,
        ciphertext_hex,
        nonce_hex: String::new(),
        dh_pubkey_hex: dhs_pub,
        signature_hex,
        v: 2,
        message_index,
        prev_count,
        signer_cert: me.signer_cert(),
    })
}

/// Inner synchronous DR decrypt used both by `decrypt_dm_dr` and `get_dm_messages`.
fn decrypt_dm_dr_inner(
    conv_id: &str,
    envelope: &serde_json::Value,
    sender_static_dh_pub_hex: Option<&str>,
) -> Result<String, String> {
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
    if !sessions.contains_key(conv_id) {
        // First inbound DR message of a conversation this side never sent
        // in: responder-init from the envelope's ratchet key + the sender's
        // published static DH key. Only for a MISSING session — an existing
        // initiator session (ckr still None) must take the DH-ratchet step
        // below instead, never re-init.
        let Some(sender_key) = sender_static_dh_pub_hex else {
            return Err("dr_session_not_initialised".to_string());
        };
        let identity_path = crate::identity::Identity::default_path().map_err(|e| e.to_string())?;
        let identity =
            crate::identity::Identity::load(&identity_path).map_err(|e| e.to_string())?;
        let my_dh_priv = identity.e2e_dh_secret();
        let session = responder_init_session(conv_id, &my_dh_priv, sender_key, dh_pubkey_hex)?;
        sessions.insert(conv_id.to_string(), session);
    }
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

#[cfg(test)]
mod tests {
    use super::{dist_recipients_json, dist_signing_pairs, WrappedForRecipient};

    fn wrapped() -> Vec<WrappedForRecipient> {
        vec![
            WrappedForRecipient {
                pubkey: "bb".repeat(32),
                wrapped_hex: "11".repeat(48),
                nonce_hex: "0102030405060708090a0b0c".to_string(),
            },
            WrappedForRecipient {
                pubkey: "cc".repeat(32),
                wrapped_hex: "22".repeat(48),
                nonce_hex: "0c0b0a090807060504030201".to_string(),
            },
        ]
    }

    /// The signature covers the wrapped key, and not the nonce beside it.
    ///
    /// The two used to be packed into one `"wrapped:nonce"` string that was
    /// passed as the `wrapped_hex` half of the pairs, so this side signed over
    /// something the hub — which signs over `wrapped_key_hex` alone — could
    /// never reproduce. Every sender-key distribution was refused, and with it
    /// every group conversation, since nobody can send under a key nobody
    /// could be handed. The mirror of the signing function was correct all
    /// along; the caller was not, which is why no wire vector caught it.
    #[test]
    fn the_signed_pairs_carry_the_wrapped_key_and_not_the_nonce() {
        let pairs = dist_signing_pairs(&wrapped());
        assert_eq!(pairs.len(), 2);
        for (_, wrapped_hex) in &pairs {
            assert!(
                !wrapped_hex.contains(':'),
                "the nonce must not be packed into the signed value: {wrapped_hex}"
            );
        }
        assert_eq!(pairs[0].1, "11".repeat(48));
        assert_eq!(pairs[1].1, "22".repeat(48));
    }

    /// Every blob carries its iteration.
    ///
    /// The hub's `SenderKeyRecipientBlob` requires it and has no default, so a
    /// body without it was refused as unprocessable before any signature was
    /// looked at — a second, independent reason the same request could never
    /// succeed.
    #[test]
    fn every_recipient_blob_carries_its_iteration() {
        let blobs = dist_recipients_json(&wrapped(), 7);
        assert_eq!(blobs.len(), 2);
        for blob in &blobs {
            assert_eq!(blob["iteration"], 7);
            assert!(blob["recipient_pubkey"].is_string());
            assert!(blob["wrapped_key_hex"].is_string());
            assert!(blob["wrap_nonce_hex"].is_string());
        }
        assert_eq!(blobs[0]["wrap_nonce_hex"], "0102030405060708090a0b0c");
    }

    use super::*;

    fn static_keypair(seed_byte: u8) -> (x25519_dalek::StaticSecret, String) {
        // Same ed25519-seed -> x25519 derivation as Identity::dh_keypair /
        // packages/core dhKeypairFromSeed.
        use sha2::{Digest, Sha512};
        let seed = [seed_byte; 32];
        let hash = Sha512::digest(seed);
        let mut scalar = [0u8; 32];
        scalar.copy_from_slice(&hash[..32]);
        scalar[0] &= 248;
        scalar[31] &= 127;
        scalar[31] |= 64;
        let secret = x25519_dalek::StaticSecret::from(scalar);
        let public = x25519_dalek::PublicKey::from(&secret);
        (secret, hex::encode(public.as_bytes()))
    }

    /// The responder's receiving chain must equal the initiator's sending
    /// chain — the load-bearing equality behind first-message decryption.
    #[test]
    fn responder_receiving_chain_matches_initiator_sending_chain() {
        let (alice_priv, alice_pub_hex) = static_keypair(1);
        let (bob_priv, bob_pub_hex) = static_keypair(2);

        let alice = initiator_init_session("conv-t", &alice_priv, &bob_pub_hex).unwrap();
        let bob =
            responder_init_session("conv-t", &bob_priv, &alice_pub_hex, &alice.dhs_pub).unwrap();

        assert_eq!(bob.ckr, alice.cks);
        assert_eq!(bob.dhr.as_deref(), Some(alice.dhs_pub.as_str()));
    }

    /// Cross-language vector: a real envelope produced by packages/core
    /// (TS initiator, seeds 0x07/0x08, conv "conv-vector") must decrypt via
    /// the Rust responder init + chain advance — the exact web->desktop DM
    /// path. Regenerate with initDrSession + encryptDmDr if the DR scheme
    /// ever changes version.
    #[test]
    fn decrypts_ts_initiator_envelope() {
        use aes_gcm::aead::{Aead, KeyInit};
        use aes_gcm::{Aes256Gcm, Key, Nonce};

        let alice_static_dh_pub =
            "761d88ec830413919dfe9d4d1d56f17e653c8c994082df5b137b90a0ae6edf74";
        let envelope_dh_pub = "3425a8a1af9131f1eb9b254629a36f169beb721ee972d9f0475597abb2f1826a";
        let ciphertext_hex = "82d09b7ad0a6c8096a96579fabb071904f59db8cdf6ebeed0d762f2206985b81396b3bb664865dcc2c187730258966011dd950";

        let (bob_priv, _) = static_keypair(0x08);
        let session = responder_init_session(
            "conv-vector",
            &bob_priv,
            alice_static_dh_pub,
            envelope_dh_pub,
        )
        .unwrap();

        // Advance the receiving chain to message_index 0 and decrypt —
        // the same steps decrypt_dm_dr_inner performs after init.
        let ckr_bytes = hex::decode(session.ckr.unwrap()).unwrap();
        let ckr: [u8; 32] = ckr_bytes.try_into().unwrap();
        let (mk, _) = kdf_ck(&ckr);
        let nonce_bytes = derive_nonce_dr(&mk);
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&mk));
        let ct = hex::decode(ciphertext_hex).unwrap();
        let plaintext_bytes = cipher
            .decrypt(Nonce::from_slice(&nonce_bytes), ct.as_slice())
            .expect("TS-initiator envelope must decrypt under the Rust responder chain");
        let v: serde_json::Value = serde_json::from_slice(&plaintext_bytes).unwrap();
        assert_eq!(v["content"], "cross-language vector");
    }

    /// The hub's `EncryptedDmEnvelope` requires every field, `nonce_hex`
    /// included, so an envelope that omits it is rejected at
    /// deserialization: 422, no row, nothing stored. That is how desktop DMs
    /// reached nothing silently until 2026-09-06. Web sends the same empty
    /// string.
    #[test]
    fn dr_envelope_carries_every_field_the_hub_requires() {
        let env = DrDmEnvelope {
            sender_pubkey: "aa".into(),
            conv_id: "conv-shape".into(),
            ciphertext_hex: "bb".into(),
            nonce_hex: String::new(),
            dh_pubkey_hex: "cc".into(),
            signature_hex: "dd".into(),
            v: 2,
            message_index: 0,
            prev_count: 0,
            signer_cert: None,
        };
        let json: serde_json::Value = serde_json::to_value(&env).unwrap();
        for field in [
            "sender_pubkey",
            "conv_id",
            "ciphertext_hex",
            "nonce_hex",
            "dh_pubkey_hex",
            "signature_hex",
            "v",
        ] {
            assert!(json.get(field).is_some(), "missing {field}");
        }
        assert_eq!(json["nonce_hex"], "");
    }
}
