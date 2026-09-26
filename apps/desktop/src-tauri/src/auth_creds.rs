use std::path::PathBuf;

use crate::identity::{DeviceSubkey, Identity, SubkeyCert};

use crate::pairing::PairedIdentity;

fn paired_identity_path() -> Result<PathBuf, String> {
    crate::accounts::active_paired_identity_path()
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
    /// Sign a cert for this very device under the master its own seed derives.
    /// Only an entropy-holding identity can: a paired device's seed is a
    /// subkey and would derive some unrelated master.
    fn self_signed_cert(&self, identity: &Identity, hub_url: &str) -> Result<SubkeyCert, String> {
        let master = identity.master().map_err(|e| e.to_string())?;
        let master_pubkey = master.public_key_hex();
        let subkey_pubkey = identity.public_key_hex();
        // `Identity` carries no label — only a paired `DeviceSubkey` does, and
        // desktop has no rename UI yet. Same default string web issues its own
        // self-cert with, so a user with both sees one convention.
        let device_label = "This device".to_string();
        let issued_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let fallback_hubs = vec![hub_url.trim_end_matches('/').to_string()];
        let bytes = SubkeyCert::signing_bytes(
            &master_pubkey,
            &subkey_pubkey,
            &device_label,
            issued_at,
            None,
            &fallback_hubs,
        );
        Ok(SubkeyCert {
            master_pubkey,
            subkey_pubkey,
            device_label,
            issued_at,
            not_after: None,
            fallback_hubs,
            signature: hex::encode(master.sign(&bytes).to_bytes()),
        })
    }

    pub fn sign(&self, msg: &[u8]) -> [u8; 64] {
        match &self.signing_source {
            SigningSource::Legacy(id) => id.sign(msg).to_bytes(),
            SigningSource::Subkey(sk) => sk.sign(msg).to_bytes(),
        }
    }

    /// Run the challenge/verify dance against a hub URL. Returns the
    /// session token and the canonical identity the hub seated it as. The verify request always carries a master-signed
    /// cert — the one a paired identity was handed, or one an
    /// entropy-holding identity signs for itself — so the hub can resolve
    /// this pubkey to the canonical identity and record its master.
    pub async fn authenticate(
        &self,
        hub_url: &str,
        client: &reqwest::Client,
        invite_code: Option<&str>,
    ) -> Result<AuthOutcome, String> {
        let challenge_raw = client
            .post(format!("{hub_url}/auth/challenge"))
            .json(&serde_json::json!({ "public_key": self.public_key_hex }))
            .send()
            .await
            .map_err(|e| format!("challenge: {e}"))?;
        if !challenge_raw.status().is_success() {
            let status = challenge_raw.status();
            let body = challenge_raw.text().await.unwrap_or_default();
            return Err(format!("challenge rejected ({status}): {body}"));
        }
        let challenge_resp: ChallengeResponse = challenge_raw
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
        // A paired device presents the cert it was handed; an entropy-holding
        // one signs its own here. Either way the hub learns which master this
        // roster pubkey belongs to, and that link is the only thing that makes
        // a home hub list findable — without it no hub can resolve the list a
        // DM should be delivered to, and fan-out and mirroring skip this
        // identity in silence.
        //
        // Built here rather than in `load_active_credentials` because the cert
        // carries the hub URL as its designation-of-last-resort, and only the
        // caller knows it. Nothing persists it: it is re-derivable from the
        // seed, the hub upserts by (master, subkey), and desktop reads device
        // certs from the hub rather than from disk.
        let self_cert = match (&self.cert, &self.signing_source) {
            (None, SigningSource::Legacy(identity)) => {
                Some(self.self_signed_cert(identity, hub_url)?)
            }
            _ => None,
        };
        if let Some(cert) = self.cert.as_ref().or(self_cert.as_ref()) {
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
        let canonical_pubkey = if verify.canonical_pubkey.is_empty() {
            self.public_key_hex.clone()
        } else {
            verify.canonical_pubkey
        };
        Ok(AuthOutcome {
            token: verify.token,
            canonical_pubkey,
        })
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

/// The identity a hub attributes this device to, and the key that signs as it.
///
/// These are not always the same key. An entropy-holding identity presents a
/// self-signed cert at auth so the hub learns which master its roster pubkey
/// belongs to (without that link no hub can resolve a home hub list), and a
/// hub seeing that identity for the first time seats the *master* as the user
/// — the hub's resolve_canonical_identity, "brand-new paired device" branch.
/// Everything the hub verifies afterwards is checked against that seated
/// pubkey: a DM envelope's sender and signature, the owner of a published DH
/// key. Signing those with this device's own key is rejected, which is how a
/// desktop DM reached nothing at all until 2026-09-06.
pub enum HubIdentity {
    /// The hub seated this device's own key — a single-key identity on a hub
    /// that already had a row for it, and every hub predating certs.
    Device(Identity),
    /// The hub seated the master our self-signed cert names. We hold the
    /// entropy it derives from, so we sign as it directly and need no cert
    /// chain on the envelope.
    Master(crate::identity::MasterIdentity),
    /// A paired device: it holds a subkey and the master-signed cert for it,
    /// and nothing else. Envelopes carry the cert so the hub can verify the
    /// signature against the subkey while attributing it to the canonical
    /// identity (decisions.md, "Paired-device DMs attribute to canonical via
    /// cert-chained envelopes").
    Paired {
        canonical_pubkey: String,
        subkey: DeviceSubkey,
        cert: SubkeyCert,
    },
}

impl HubIdentity {
    /// The pubkey to claim as the sender/owner of anything the hub verifies.
    pub fn pubkey(&self) -> String {
        match self {
            HubIdentity::Device(id) => id.public_key_hex(),
            HubIdentity::Master(m) => m.public_key_hex(),
            HubIdentity::Paired {
                canonical_pubkey, ..
            } => canonical_pubkey.clone(),
        }
    }

    pub fn sign(&self, msg: &[u8]) -> [u8; 64] {
        match self {
            HubIdentity::Device(id) => id.sign(msg).to_bytes(),
            HubIdentity::Master(m) => m.sign(msg).to_bytes(),
            HubIdentity::Paired { subkey, .. } => subkey.sign(msg).to_bytes(),
        }
    }

    /// The cert a verifier needs to tie the signing key to the claimed sender,
    /// or None when the signing key *is* the claimed sender.
    pub fn signer_cert(&self) -> Option<SubkeyCert> {
        match self {
            HubIdentity::Paired { cert, .. } => Some(cert.clone()),
            _ => None,
        }
    }
}

/// Resolve who to be toward a hub, given the canonical pubkey that hub
/// reported at auth (None before any session exists — then this device's own
/// key is the only answer available).
pub fn hub_identity(canonical: Option<&str>) -> Result<HubIdentity, String> {
    if let Some(paired) = read_paired_identity() {
        let secret = hex::decode(&paired.subkey_secret_hex)
            .map_err(|e| format!("decode subkey secret: {e}"))?;
        let secret_array: [u8; 32] = secret
            .try_into()
            .map_err(|_| "subkey secret must be 32 bytes".to_string())?;
        let subkey = DeviceSubkey::from_secret_bytes(&secret_array, paired.device_label.clone());
        return Ok(HubIdentity::Paired {
            canonical_pubkey: canonical
                .map(str::to_string)
                .unwrap_or_else(|| paired.cert.master_pubkey.clone()),
            subkey,
            cert: paired.cert,
        });
    }

    let path = Identity::default_path().map_err(|e| e.to_string())?;
    let identity = Identity::load(&path).map_err(|e| e.to_string())?;
    let master = identity.master().map_err(|e| e.to_string())?;
    match choose_signer(
        canonical,
        &identity.public_key_hex(),
        &master.public_key_hex(),
    ) {
        SignerChoice::Device => Ok(HubIdentity::Device(identity)),
        SignerChoice::Master => Ok(HubIdentity::Master(master)),
    }
}

pub enum SignerChoice {
    Device,
    Master,
}

/// Which of the two keys an entropy-holding identity holds can sign as the
/// canonical pubkey a hub reported. Split out from hub_identity so the choice
/// is testable without an account on disk.
///
/// An unknown canonical falls back to the device key: nothing local can
/// produce that signature, so claim what we are and let the hub refuse in its
/// own words rather than invent one here.
fn choose_signer(
    canonical: Option<&str>,
    device_pubkey: &str,
    master_pubkey: &str,
) -> SignerChoice {
    match canonical {
        Some(c) if c == master_pubkey && c != device_pubkey => SignerChoice::Master,
        _ => SignerChoice::Device,
    }
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
    /// Who the hub says we are. Absent on a hub predating the field, where
    /// the auth pubkey is the answer.
    #[serde(default)]
    canonical_pubkey: String,
}

/// What a successful auth hands back: the session token plus the identity the
/// hub attributes it to. The second half is not cosmetic — a hub that has
/// never seen this identity seats the *master* named in our self-signed cert
/// as the user, so signing a DM envelope or publishing a DH key as this
/// device's own key is rejected. See HubSession::canonical_pubkey.
pub struct AuthOutcome {
    pub token: String,
    pub canonical_pubkey: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    // The hub seats an identity it meets through a self-signed cert as the
    // *master* named in that cert, and then verifies everything we send
    // against it. Signing as the device key there is what made a desktop DM
    // reach nothing at all: the hub answered "Invalid envelope signature" and
    // the row was never written.
    #[test]
    fn the_signer_follows_whichever_key_the_hub_seated() {
        let device = "de".repeat(32);
        let master = "ma".repeat(32);

        assert!(matches!(
            choose_signer(Some(&master), &device, &master),
            SignerChoice::Master
        ));
        assert!(matches!(
            choose_signer(Some(&device), &device, &master),
            SignerChoice::Device
        ));
        // No session yet — the device key is the only answer available.
        assert!(matches!(
            choose_signer(None, &device, &master),
            SignerChoice::Device
        ));
        // A canonical neither key can sign as: claim what we are, let the hub
        // say no.
        assert!(matches!(
            choose_signer(Some(&"ff".repeat(32)), &device, &master),
            SignerChoice::Device
        ));
    }

    // The hub verifies this cert's signature against the master named inside
    // it, and links that master to the roster pubkey. Get either half wrong
    // and nothing reports it: auth still succeeds, the link is just never
    // made, and the identity stays invisible to every home-hub lookup.
    #[test]
    fn an_entropy_holding_identity_signs_a_cert_the_hub_will_accept() {
        let identity = Identity::generate();
        let creds = AuthCredentials {
            public_key_hex: identity.public_key_hex(),
            signing_source: SigningSource::Legacy(identity),
            cert: None,
            security_nonce: 0,
            security_level: 0,
        };
        let SigningSource::Legacy(ref id) = creds.signing_source else {
            unreachable!()
        };

        let cert = creds
            .self_signed_cert(id, "https://hub.example/")
            .expect("an identity holding entropy can always sign for itself");

        cert.verify().expect("cert must verify against its master");
        assert_eq!(cert.subkey_pubkey, creds.public_key_hex);
        assert_eq!(
            cert.master_pubkey,
            id.master().unwrap().public_key_hex(),
            "the cert must name the master this seed derives, or the link points nowhere"
        );
        // Trailing slash stripped: the designation and the fallback list are
        // compared as strings, so two spellings of one hub are two hubs.
        assert_eq!(cert.fallback_hubs, vec!["https://hub.example".to_string()]);
    }
}
