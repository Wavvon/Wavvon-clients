use std::path::PathBuf;

use crate::identity::{DeviceSubkey, Identity, SubkeyCert};

use crate::pairing::PairedIdentity;

fn paired_identity_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("paired_identity.json"))
}

fn read_paired_identity() -> Option<PairedIdentity> {
    let path = paired_identity_path().ok()?;
    if !path.exists() {
        return None;
    }
    let text = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&text).ok()
}

enum SigningSource {
    Legacy(Identity),
    Subkey(DeviceSubkey),
}

pub struct AuthCredentials {
    pub public_key_hex: String,
    signing_source: SigningSource,
    pub cert: Option<SubkeyCert>,
    pub security_nonce: u64,
    pub security_level: u32,
}

impl AuthCredentials {
    pub fn sign(&self, msg: &[u8]) -> [u8; 64] {
        match &self.signing_source {
            SigningSource::Legacy(id) => id.sign(msg).to_bytes(),
            SigningSource::Subkey(sk) => sk.sign(msg).to_bytes(),
        }
    }

    /// Run the challenge/verify dance against a hub URL. Returns the
    /// session token. If a paired identity is active, the verify
    /// request includes the master-signed cert so the hub resolves us
    /// to the canonical user identity.
    pub async fn authenticate(
        &self,
        hub_url: &str,
        client: &reqwest::Client,
        invite_code: Option<&str>,
    ) -> Result<String, String> {
        let challenge_resp: ChallengeResponse = client
            .post(format!("{hub_url}/auth/challenge"))
            .json(&serde_json::json!({ "public_key": self.public_key_hex }))
            .send()
            .await
            .map_err(|e| format!("challenge: {e}"))?
            .json()
            .await
            .map_err(|e| format!("challenge decode: {e}"))?;

        let challenge_bytes = hex::decode(&challenge_resp.challenge)
            .map_err(|e| format!("bad challenge hex: {e}"))?;
        let signature_bytes = self.sign(&challenge_bytes);

        let mut body = serde_json::json!({
            "public_key": self.public_key_hex,
            "challenge": challenge_resp.challenge,
            "signature": hex::encode(signature_bytes),
            "security_nonce": self.security_nonce,
            "security_level": self.security_level,
        });
        if let Some(cert) = &self.cert {
            body["subkey_cert"] =
                serde_json::to_value(cert).map_err(|e| format!("serialize cert: {e}"))?;
        }
        if let Some(code) = invite_code {
            body["invite_code"] = serde_json::Value::String(code.to_string());
        }

        let resp = client
            .post(format!("{hub_url}/auth/verify"))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("verify: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!(
                "verify rejected ({}): {}",
                resp.status(),
                resp.text().await.unwrap_or_default()
            ));
        }
        let verify: VerifyResponse = resp
            .json()
            .await
            .map_err(|e| format!("verify decode: {e}"))?;
        Ok(verify.token)
    }
}

/// Load whichever identity should be used to authenticate against
/// hubs. If a paired_identity.json file exists, that takes precedence
/// — the device authenticates with its subkey and presents the
/// master-signed cert. Otherwise the legacy single-key identity is
/// used (with no cert).
pub fn load_active_credentials() -> Result<AuthCredentials, String> {
    if let Some(paired) = read_paired_identity() {
        let secret = hex::decode(&paired.subkey_secret_hex)
            .map_err(|e| format!("decode subkey secret: {e}"))?;
        let secret_array: [u8; 32] = secret
            .try_into()
            .map_err(|_| "subkey secret must be 32 bytes".to_string())?;
        let subkey = DeviceSubkey::from_secret_bytes(&secret_array, paired.device_label.clone());
        // Subkey devices bypass PoW — the pairing relationship is already a
        // trust gate; requiring PoW per-subkey would penalise legitimate users.
        return Ok(AuthCredentials {
            public_key_hex: paired.subkey_pubkey,
            signing_source: SigningSource::Subkey(subkey),
            cert: Some(paired.cert),
            security_nonce: 0,
            security_level: 0,
        });
    }

    let path = Identity::default_path().map_err(|e| e.to_string())?;
    let (identity, _) = Identity::load_or_create(&path).map_err(|e| e.to_string())?;
    let public_key_hex = identity.public_key_hex();
    let security_nonce = identity.security_nonce;
    let security_level = identity.security_level;
    Ok(AuthCredentials {
        public_key_hex,
        signing_source: SigningSource::Legacy(identity),
        cert: None,
        security_nonce,
        security_level,
    })
}

// Locally-defined to avoid pulling lib.rs's auth response types into
// this module's dependency graph. They're trivially serde-compatible.

#[derive(serde::Deserialize)]
struct ChallengeResponse {
    challenge: String,
}

#[derive(serde::Deserialize)]
struct VerifyResponse {
    token: String,
}
