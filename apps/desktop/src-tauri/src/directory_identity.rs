//! The invite directory listing of this identity (invite-directory.md):
//! published, read and removed against the directory, signed with the master
//! key. The document itself is built in `@wavvon/core` so web and desktop
//! submit the same bytes; the shell only checks that it names this master,
//! signs it, and sends it, since the master seed never leaves Rust.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use tauri::State;

use crate::identity::{Identity, MasterIdentity};
use crate::state::AppState;

fn load_master() -> Result<MasterIdentity, String> {
    let path = Identity::default_path().map_err(|e| e.to_string())?;
    let identity = Identity::load(&path).map_err(|e| e.to_string())?;
    identity.master().map_err(|e| e.to_string())
}

fn sign_b64(master: &MasterIdentity, message: &str) -> String {
    URL_SAFE_NO_PAD.encode(master.sign(message.as_bytes()).to_bytes())
}

/// The listing must be a person's identity document naming this master: the
/// shell signs nothing else with the master key on the frontend's behalf.
fn check_listing(payload: &str, master_hex: &str) -> Result<(), String> {
    let doc: serde_json::Value =
        serde_json::from_str(payload).map_err(|e| format!("listing is not JSON: {e}"))?;
    if doc["format"] != "wavvon.identity" {
        return Err("not an identity listing".into());
    }
    if doc["pubkey"] != format!("ed25519:{master_hex}") {
        return Err("This device does not hold the master key this listing names.".into());
    }
    Ok(())
}

fn delete_message(master_hex: &str, listed_at: i64) -> String {
    format!("wavvon-directory/delete/v1:identity:{master_hex}:{listed_at}")
}

async fn error_of(res: reqwest::Response) -> String {
    let status = res.status();
    let body: serde_json::Value = res.json().await.unwrap_or_default();
    body["error"]
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| format!("HTTP {status}"))
}

/// This identity's listing document, or None when it has none.
#[tauri::command]
pub(crate) async fn directory_identity_get(
    directory_url: String,
    state: State<'_, AppState>,
) -> Result<Option<serde_json::Value>, String> {
    let master_hex = load_master()?.public_key_hex();
    let res = state
        .http_client
        .get(format!(
            "{}/api/identities/{master_hex}",
            directory_url.trim_end_matches('/')
        ))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !res.status().is_success() {
        return Err(error_of(res).await);
    }
    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(Some(body["doc"].clone()))
}

#[tauri::command]
pub(crate) async fn directory_identity_publish(
    directory_url: String,
    payload: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let master = load_master()?;
    check_listing(&payload, &master.public_key_hex())?;
    let sig = sign_b64(&master, &payload);
    let res = state
        .http_client
        .post(format!(
            "{}/api/identities",
            directory_url.trim_end_matches('/')
        ))
        .json(&serde_json::json!({ "payload": payload, "sig": sig }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(error_of(res).await);
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn directory_identity_unpublish(
    directory_url: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let master = load_master()?;
    let master_hex = master.public_key_hex();
    let Some(doc) = directory_identity_get(directory_url.clone(), state.clone()).await? else {
        return Ok(());
    };
    let listed_at = doc["listed_at"]
        .as_i64()
        .ok_or("the listing has no listed_at")?;
    let sig = sign_b64(&master, &delete_message(&master_hex, listed_at));
    let res = state
        .http_client
        .delete(format!(
            "{}/api/identities/{master_hex}",
            directory_url.trim_end_matches('/')
        ))
        .header("x-wavvon-signature", sig)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() && res.status() != reqwest::StatusCode::NOT_FOUND {
        return Err(error_of(res).await);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::Verifier;

    #[test]
    fn signs_the_payload_bytes_as_base64url_and_refuses_another_key() {
        let master = MasterIdentity::derive_from_entropy(&[7u8; 32]).unwrap();
        let hex = master.public_key_hex();
        let payload = format!(r#"{{"format":"wavvon.identity","pubkey":"ed25519:{hex}"}}"#);
        assert!(check_listing(&payload, &hex).is_ok());
        assert!(check_listing(&payload, &"00".repeat(32)).is_err());

        let sig = URL_SAFE_NO_PAD.decode(sign_b64(&master, &payload)).unwrap();
        let key_bytes: [u8; 32] = hex::decode(&hex).unwrap().try_into().unwrap();
        let key = ed25519_dalek::VerifyingKey::from_bytes(&key_bytes).unwrap();
        let sig = ed25519_dalek::Signature::from_slice(&sig).unwrap();
        assert!(key.verify(payload.as_bytes(), &sig).is_ok());
        assert_eq!(
            delete_message(&hex, 5),
            format!("wavvon-directory/delete/v1:identity:{hex}:5")
        );
    }
}
