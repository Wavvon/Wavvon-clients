// Local identity primitives — reimplemented directly against standard crypto
// crates so wavvon-desktop has no dependency on any hub-internal crate.

use anyhow::{anyhow, Context, Result};
use bip39::{Language, Mnemonic};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use hkdf::Hkdf;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use zeroize::{Zeroize, Zeroizing};

// ---------------------------------------------------------------------------
// Identity (per-device keypair)
// ---------------------------------------------------------------------------

pub struct Identity {
    signing_key: SigningKey,
    pub security_nonce: u64,
    pub security_level: u32,
}

#[derive(Serialize, Deserialize)]
struct SavedIdentity {
    secret_key: String,
    #[serde(default)]
    security_nonce: Option<u64>,
    #[serde(default)]
    security_level: Option<u32>,
}

impl Identity {
    pub fn generate() -> Self {
        let signing_key = SigningKey::generate(&mut OsRng);
        Self {
            signing_key,
            security_nonce: 0,
            security_level: 0,
        }
    }

    pub fn public_key_hex(&self) -> String {
        hex::encode(self.signing_key.verifying_key().as_bytes())
    }

    /// Raw 32-byte secret key, hex-encoded — the payload of an identity
    /// backup file (see `backup.rs`). Never sent anywhere except into that
    /// encrypted envelope.
    pub fn secret_key_hex(&self) -> Zeroizing<String> {
        let seed = Zeroizing::new(self.signing_key.to_bytes());
        Zeroizing::new(hex::encode(seed.as_ref()))
    }

    /// Reconstruct an identity from the raw secret key hex produced by
    /// `secret_key_hex()` (backup restore path).
    pub fn from_secret_key_hex(hex_str: &str) -> Result<Self> {
        let bytes = Zeroizing::new(hex::decode(hex_str).context("Invalid secret key hex")?);
        let secret_array = <[u8; 32]>::try_from(bytes.as_slice())
            .map(Zeroizing::new)
            .map_err(|_| anyhow!("Secret key must be exactly 32 bytes"))?;
        Ok(Self {
            signing_key: SigningKey::from_bytes(&secret_array),
            security_nonce: 0,
            security_level: 0,
        })
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        let mut data = SavedIdentity {
            secret_key: self.secret_key_hex().to_string(),
            security_nonce: Some(self.security_nonce),
            security_level: Some(self.security_level),
        };
        let json = serde_json::to_string_pretty(&data).map(Zeroizing::new);
        data.secret_key.zeroize();
        let json = json?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).context("Failed to create identity directory")?;
        }
        write_secret(path, json.as_bytes()).context("Failed to write identity file")?;
        Ok(())
    }

    pub fn load(path: &Path) -> Result<Self> {
        restrict_secret(path);
        let json =
            Zeroizing::new(fs::read_to_string(path).context("Failed to read identity file")?);
        let mut data: SavedIdentity =
            serde_json::from_str(&json).context("Failed to parse identity file")?;
        let secret_bytes = hex::decode(&data.secret_key).map(Zeroizing::new);
        data.secret_key.zeroize();
        let secret_bytes = secret_bytes.context("Invalid hex in identity file")?;
        let secret_array = <[u8; 32]>::try_from(secret_bytes.as_slice())
            .map(Zeroizing::new)
            .map_err(|_| anyhow!("Secret key must be exactly 32 bytes"))?;
        let signing_key = SigningKey::from_bytes(&secret_array);
        Ok(Self {
            signing_key,
            security_nonce: data.security_nonce.unwrap_or(0),
            security_level: data.security_level.unwrap_or(0),
        })
    }

    pub fn load_or_create(path: &Path) -> Result<(Self, bool)> {
        if path.exists() {
            Ok((Self::load(path)?, false))
        } else {
            let identity = Self::generate();
            identity.save(path)?;
            Ok((identity, true))
        }
    }

    pub fn sign(&self, message: &[u8]) -> Signature {
        self.signing_key.sign(message)
    }

    /// Resolves to the *active account's* identity.json (see `accounts.rs`).
    /// Kept as one function so every existing call site transparently
    /// re-targets to per-account storage with no call-site changes.
    pub fn default_path() -> Result<PathBuf> {
        crate::accounts::active_identity_path().map_err(|e| anyhow!(e))
    }

    /// Derive the master keypair from this identity's secret bytes.
    pub fn master(&self) -> Result<MasterIdentity> {
        let entropy = Zeroizing::new(self.signing_key.to_bytes());
        MasterIdentity::derive_from_entropy(&entropy)
    }

    /// Generate a 24-word BIP39 recovery phrase from the secret key.
    pub fn recovery_phrase(&self) -> Zeroizing<String> {
        let secret_bytes = Zeroizing::new(self.signing_key.to_bytes());
        let mnemonic = Mnemonic::from_entropy_in(Language::English, secret_bytes.as_ref())
            .expect("32 bytes should always produce a valid mnemonic");
        Zeroizing::new(mnemonic.to_string())
    }

    /// Restore an identity from a 24-word recovery phrase.
    pub fn from_recovery_phrase(phrase: &str) -> Result<Self> {
        let mnemonic =
            Mnemonic::parse_in(Language::English, phrase).context("Invalid recovery phrase")?;
        let entropy = Zeroizing::new(mnemonic.to_entropy());
        let secret_array = <[u8; 32]>::try_from(entropy.as_slice())
            .map(Zeroizing::new)
            .map_err(|_| anyhow!("Recovery phrase must produce exactly 32 bytes"))?;
        let signing_key = SigningKey::from_bytes(&secret_array);
        Ok(Self {
            signing_key,
            security_nonce: 0,
            security_level: 0,
        })
    }

    /// Derive the X25519 DH keypair from this identity's Ed25519 seed.
    /// Uses the standard ed25519 → x25519 conversion: SHA-512(seed)[0..32] → clamp.
    pub fn dh_keypair(&self) -> (x25519_dalek::StaticSecret, x25519_dalek::PublicKey) {
        use sha2::Sha512;
        let seed = Zeroizing::new(self.signing_key.to_bytes());
        let mut hash = Sha512::digest(seed.as_ref());
        let mut scalar = Zeroizing::new([0u8; 32]);
        scalar.copy_from_slice(&hash[..32]);
        hash.as_mut_slice().zeroize();
        scalar[0] &= 248;
        scalar[31] &= 127;
        scalar[31] |= 64;
        let secret = x25519_dalek::StaticSecret::from(*scalar);
        let public = x25519_dalek::PublicKey::from(&secret);
        (secret, public)
    }

    /// The X25519 scalar every E2E operation on this device must use: the
    /// canonical one provisioned at pairing time if this is a paired device,
    /// otherwise this identity's own seed-derived scalar.
    ///
    /// Peers agree on E2E DM and voice sender keys against the DH key
    /// published under our *roster* pubkey (`dm.rs::publish_dh_key`). A
    /// paired device's subkey seed derives a different scalar, so calling
    /// `dh_keypair()` directly there computes a shared secret nobody else
    /// arrives at — silently, as an undecryptable message rather than an
    /// error. Every DM and voice-key path routes through here so there is
    /// exactly one place that choice is made.
    ///
    // ponytail: re-reads paired_identity.json per call, so decrypting a page
    // of DMs stats (primary device) or reads+parses (paired device) that file
    // once per message. It is a sub-KB file and the alternative is caching
    // keyed on the active account, which has to invalidate on account switch
    // — not worth it until a profile says otherwise.
    pub fn e2e_dh_secret(&self) -> x25519_dalek::StaticSecret {
        if let Some(scalar) = crate::pairing::canonical_dh_scalar() {
            return x25519_dalek::StaticSecret::from(scalar);
        }
        self.dh_keypair().0
    }
}

impl fmt::Display for Identity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.public_key_hex())
    }
}

// ---------------------------------------------------------------------------
// MasterIdentity
// ---------------------------------------------------------------------------

const MASTER_HKDF_INFO: &[u8] = b"wavvon/master/v1";

pub struct MasterIdentity {
    signing_key: SigningKey,
}

impl MasterIdentity {
    pub fn derive_from_entropy(entropy: &[u8; 32]) -> Result<Self> {
        let hk = Hkdf::<Sha256>::new(None, entropy);
        let mut okm = Zeroizing::new([0u8; 32]);
        hk.expand(MASTER_HKDF_INFO, okm.as_mut())
            .map_err(|e| anyhow!("HKDF expand failed: {e}"))?;
        Ok(Self {
            signing_key: SigningKey::from_bytes(&okm),
        })
    }

    pub fn secret_seed(&self) -> Zeroizing<[u8; 32]> {
        Zeroizing::new(self.signing_key.to_bytes())
    }

    pub fn public_key_hex(&self) -> String {
        hex::encode(self.signing_key.verifying_key().as_bytes())
    }

    pub fn sign(&self, message: &[u8]) -> Signature {
        self.signing_key.sign(message)
    }
}

// ---------------------------------------------------------------------------
// DeviceSubkey
// ---------------------------------------------------------------------------

pub struct DeviceSubkey {
    signing_key: SigningKey,
}

impl DeviceSubkey {
    pub fn generate() -> Self {
        Self {
            signing_key: SigningKey::generate(&mut OsRng),
        }
    }

    pub fn public_key_hex(&self) -> String {
        hex::encode(self.signing_key.verifying_key().as_bytes())
    }

    /// Raw 32-byte secret for persistence.
    pub fn secret_bytes(&self) -> Zeroizing<[u8; 32]> {
        Zeroizing::new(self.signing_key.to_bytes())
    }

    pub fn from_secret_bytes(secret: &[u8; 32]) -> Self {
        Self {
            signing_key: SigningKey::from_bytes(secret),
        }
    }

    pub fn sign(&self, message: &[u8]) -> Signature {
        self.signing_key.sign(message)
    }
}

// ---------------------------------------------------------------------------
// Signature verification helper
// ---------------------------------------------------------------------------

pub fn verify_signature(
    public_key_hex: &str,
    message: &[u8],
    signature_bytes: &[u8],
) -> Result<()> {
    let pub_bytes = hex::decode(public_key_hex).context("Invalid public key hex")?;
    let pub_array: [u8; 32] = pub_bytes
        .try_into()
        .map_err(|_| anyhow!("Public key must be 32 bytes"))?;
    let verifying_key = VerifyingKey::from_bytes(&pub_array).context("Invalid public key bytes")?;
    let sig_array: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| anyhow!("Signature must be 64 bytes"))?;
    let signature = Signature::from_bytes(&sig_array);
    verifying_key
        .verify(message, &signature)
        .context("Signature verification failed")?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Proof-of-work
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ECIES: wrap / unwrap a 32-byte blob key for an Ed25519 recipient
// ---------------------------------------------------------------------------

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce as AesNonce,
};
use rand::RngCore;
use sha2::Sha512;

const ECIES_INFO: &[u8] = b"wavvon/ecies/v1";

/// Wrap a 32-byte blob key for a recipient identified by their Ed25519 pubkey.
///
/// Returns a 184-char hex string encoding:
///   eph_x25519_pub[32] || aes_gcm_nonce[12] || aes_gcm_ciphertext_and_tag[48]
pub fn wrap_blob_key(blob_key: &[u8; 32], recipient_ed25519_pubkey_hex: &str) -> Result<String> {
    let mut eph_secret = [0u8; 32];
    OsRng.fill_bytes(&mut eph_secret);
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    wrap_blob_key_with(
        blob_key,
        recipient_ed25519_pubkey_hex,
        eph_secret,
        nonce_bytes,
    )
}

/// `wrap_blob_key` with the ephemeral X25519 secret and the nonce supplied by
/// the caller, so the wire vector can pin its output. Reusing either value
/// breaks the encryption: everything else calls `wrap_blob_key`.
fn wrap_blob_key_with(
    blob_key: &[u8; 32],
    recipient_ed25519_pubkey_hex: &str,
    eph_secret: [u8; 32],
    nonce_bytes: [u8; 12],
) -> Result<String> {
    let pubkey_bytes = hex::decode(recipient_ed25519_pubkey_hex)
        .map_err(|e| anyhow!("invalid pubkey hex: {e}"))?;
    let pubkey_bytes: [u8; 32] = pubkey_bytes
        .try_into()
        .map_err(|_| anyhow!("pubkey must be 32 bytes"))?;

    let compressed = curve25519_dalek::edwards::CompressedEdwardsY::from_slice(&pubkey_bytes)
        .map_err(|_| anyhow!("invalid compressed Edwards point length"))?;
    let point = compressed
        .decompress()
        .ok_or_else(|| anyhow!("invalid ed25519 point"))?;
    let montgomery = point.to_montgomery();
    let x25519_pub = x25519_dalek::PublicKey::from(montgomery.to_bytes());

    let eph_priv = x25519_dalek::StaticSecret::from(eph_secret);
    let eph_pub = x25519_dalek::PublicKey::from(&eph_priv);

    let shared = eph_priv.diffie_hellman(&x25519_pub);

    let hk = Hkdf::<Sha256>::new(Some(eph_pub.as_bytes()), shared.as_bytes());
    let mut enc_key = [0u8; 32];
    hk.expand(ECIES_INFO, &mut enc_key)
        .map_err(|e| anyhow!("HKDF expand: {e}"))?;

    let cipher = Aes256Gcm::new_from_slice(&enc_key).map_err(|e| anyhow!("AES key: {e}"))?;
    let ciphertext = cipher
        .encrypt(AesNonce::from_slice(&nonce_bytes), blob_key.as_ref())
        .map_err(|e| anyhow!("AES-GCM encrypt: {e}"))?;

    let mut out = Vec::with_capacity(92);
    out.extend_from_slice(eph_pub.as_bytes());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    debug_assert_eq!(out.len(), 92);
    Ok(hex::encode(out))
}

/// Unwrap a wrapped blob key using the recipient's Ed25519 seed (32-byte secret).
pub fn unwrap_blob_key(wrapped_hex: &str, recipient_ed25519_seed: &[u8; 32]) -> Result<[u8; 32]> {
    let bytes = hex::decode(wrapped_hex).map_err(|e| anyhow!("invalid wrapped_hex: {e}"))?;
    if bytes.len() != 92 {
        return Err(anyhow!(
            "wrapped blob key must be 92 bytes, got {}",
            bytes.len()
        ));
    }

    let eph_pub_bytes: [u8; 32] = bytes[0..32].try_into().unwrap();
    let nonce_bytes: [u8; 12] = bytes[32..44].try_into().unwrap();
    let ct = &bytes[44..92];

    let hash = Sha512::digest(recipient_ed25519_seed);
    let mut scalar = [0u8; 32];
    scalar.copy_from_slice(&hash[..32]);
    scalar[0] &= 248;
    scalar[31] &= 127;
    scalar[31] |= 64;
    let x25519_priv = x25519_dalek::StaticSecret::from(scalar);

    let eph_pub = x25519_dalek::PublicKey::from(eph_pub_bytes);
    let shared = x25519_priv.diffie_hellman(&eph_pub);

    let hk = Hkdf::<Sha256>::new(Some(&eph_pub_bytes), shared.as_bytes());
    let mut enc_key = [0u8; 32];
    hk.expand(ECIES_INFO, &mut enc_key)
        .map_err(|e| anyhow!("HKDF expand: {e}"))?;

    let cipher = Aes256Gcm::new_from_slice(&enc_key).map_err(|e| anyhow!("AES key: {e}"))?;
    let plaintext = cipher
        .decrypt(AesNonce::from_slice(&nonce_bytes), ct)
        .map_err(|e| anyhow!("AES-GCM decrypt: {e}"))?;

    let blob_key: [u8; 32] = plaintext
        .try_into()
        .map_err(|_| anyhow!("decrypted plaintext is not 32 bytes"))?;
    Ok(blob_key)
}

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

fn write_u32_le(buf: &mut Vec<u8>, v: u32) {
    buf.extend_from_slice(&v.to_le_bytes());
}

fn write_u64_le(buf: &mut Vec<u8>, v: u64) {
    buf.extend_from_slice(&v.to_le_bytes());
}

fn write_str(buf: &mut Vec<u8>, s: &str) {
    write_u32_le(buf, s.len() as u32);
    buf.extend_from_slice(s.as_bytes());
}

fn write_str_vec(buf: &mut Vec<u8>, v: &[String]) {
    write_u32_le(buf, v.len() as u32);
    for s in v {
        write_str(buf, s);
    }
}

fn check_sig(pubkey_hex: &str, signing_bytes: &[u8], signature_hex: &str) -> Result<()> {
    let sig = hex::decode(signature_hex).context("Invalid signature hex")?;
    verify_signature(pubkey_hex, signing_bytes, &sig)
}

/// Master-signed list of the user's home hubs, ordered by preference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeHubList {
    pub master_pubkey: String,
    pub hubs: Vec<String>,
    pub issued_at: u64,
    pub sequence: u64,
    pub signature: String,
}

impl HomeHubList {
    pub fn signing_bytes(
        master_pubkey: &str,
        hubs: &[String],
        issued_at: u64,
        sequence: u64,
    ) -> Vec<u8> {
        let mut buf = Vec::new();
        buf.extend_from_slice(b"wavvon/home-hub-list/v1\0");
        write_str(&mut buf, master_pubkey);
        write_str_vec(&mut buf, hubs);
        write_u64_le(&mut buf, issued_at);
        write_u64_le(&mut buf, sequence);
        buf
    }

    pub fn to_signing_bytes(&self) -> Vec<u8> {
        Self::signing_bytes(
            &self.master_pubkey,
            &self.hubs,
            self.issued_at,
            self.sequence,
        )
    }

    pub fn verify(&self) -> Result<()> {
        check_sig(
            &self.master_pubkey,
            &self.to_signing_bytes(),
            &self.signature,
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubkeyCert {
    pub master_pubkey: String,
    pub subkey_pubkey: String,
    pub device_label: String,
    pub issued_at: u64,
    #[serde(default)]
    pub not_after: Option<u64>,
    #[serde(default)]
    pub fallback_hubs: Vec<String>,
    pub signature: String,
}

impl SubkeyCert {
    pub fn signing_bytes(
        master_pubkey: &str,
        subkey_pubkey: &str,
        device_label: &str,
        issued_at: u64,
        not_after: Option<u64>,
        fallback_hubs: &[String],
    ) -> Vec<u8> {
        let mut buf = Vec::new();
        buf.extend_from_slice(b"wavvon/subkey-cert/v1\0");
        write_str(&mut buf, master_pubkey);
        write_str(&mut buf, subkey_pubkey);
        write_str(&mut buf, device_label);
        write_u64_le(&mut buf, issued_at);
        match not_after {
            Some(t) => {
                buf.push(1);
                write_u64_le(&mut buf, t);
            }
            None => buf.push(0),
        }
        write_str_vec(&mut buf, fallback_hubs);
        buf
    }

    pub fn to_signing_bytes(&self) -> Vec<u8> {
        Self::signing_bytes(
            &self.master_pubkey,
            &self.subkey_pubkey,
            &self.device_label,
            self.issued_at,
            self.not_after,
            &self.fallback_hubs,
        )
    }

    pub fn verify(&self) -> Result<()> {
        check_sig(
            &self.master_pubkey,
            &self.to_signing_bytes(),
            &self.signature,
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevocationEntry {
    pub master_pubkey: String,
    pub subkey_pubkey: String,
    pub revoked_at: u64,
    pub signature: String,
}

impl RevocationEntry {
    pub fn signing_bytes(master_pubkey: &str, subkey_pubkey: &str, revoked_at: u64) -> Vec<u8> {
        let mut buf = Vec::new();
        buf.extend_from_slice(b"wavvon/revocation/v1\0");
        write_str(&mut buf, master_pubkey);
        write_str(&mut buf, subkey_pubkey);
        write_u64_le(&mut buf, revoked_at);
        buf
    }

    pub fn to_signing_bytes(&self) -> Vec<u8> {
        Self::signing_bytes(&self.master_pubkey, &self.subkey_pubkey, self.revoked_at)
    }

    pub fn verify(&self) -> Result<()> {
        check_sig(
            &self.master_pubkey,
            &self.to_signing_bytes(),
            &self.signature,
        )
    }
}

/// Encrypted prefs blob with a master-signed envelope.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedPrefsBlob {
    pub master_pubkey: String,
    pub blob_version: u64,
    pub ciphertext_hex: String,
    pub signature: String,
}

impl SignedPrefsBlob {
    pub fn signing_bytes(master_pubkey: &str, blob_version: u64, ciphertext: &[u8]) -> Vec<u8> {
        let digest = Sha256::digest(ciphertext);
        let mut buf = Vec::new();
        buf.extend_from_slice(b"wavvon/prefs-blob/v1\0");
        write_str(&mut buf, master_pubkey);
        write_u64_le(&mut buf, blob_version);
        buf.extend_from_slice(&digest);
        buf
    }

    pub fn to_signing_bytes(&self) -> Result<Vec<u8>> {
        let ciphertext = hex::decode(&self.ciphertext_hex)
            .map_err(|e| anyhow!("Invalid ciphertext hex: {e}"))?;
        Ok(Self::signing_bytes(
            &self.master_pubkey,
            self.blob_version,
            &ciphertext,
        ))
    }

    pub fn verify(&self) -> Result<()> {
        let bytes = self.to_signing_bytes()?;
        check_sig(&self.master_pubkey, &bytes, &self.signature)
    }
}

/// QR-encoded pairing offer created by the existing device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairingOffer {
    pub master_pubkey: String,
    pub home_hubs: Vec<String>,
    pub pairing_token: String,
    pub issued_at: u64,
    pub expires_at: u64,
    pub signature: String,
}

impl PairingOffer {
    pub fn signing_bytes(
        master_pubkey: &str,
        home_hubs: &[String],
        pairing_token: &str,
        issued_at: u64,
        expires_at: u64,
    ) -> Vec<u8> {
        let mut buf = Vec::new();
        buf.extend_from_slice(b"wavvon/pairing-offer/v1\0");
        write_str(&mut buf, master_pubkey);
        write_str_vec(&mut buf, home_hubs);
        write_str(&mut buf, pairing_token);
        write_u64_le(&mut buf, issued_at);
        write_u64_le(&mut buf, expires_at);
        buf
    }

    pub fn to_signing_bytes(&self) -> Vec<u8> {
        Self::signing_bytes(
            &self.master_pubkey,
            &self.home_hubs,
            &self.pairing_token,
            self.issued_at,
            self.expires_at,
        )
    }

    pub fn verify(&self) -> Result<()> {
        check_sig(
            &self.master_pubkey,
            &self.to_signing_bytes(),
            &self.signature,
        )
    }
}

/// New device's claim against an offer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairingClaim {
    pub pairing_token: String,
    pub subkey_pubkey: String,
    pub device_label: String,
    pub proof: String,
}

impl PairingClaim {
    pub fn signing_bytes(pairing_token: &str, subkey_pubkey: &str, device_label: &str) -> Vec<u8> {
        let mut buf = Vec::new();
        buf.extend_from_slice(b"wavvon/pairing-claim/v1\0");
        write_str(&mut buf, pairing_token);
        write_str(&mut buf, subkey_pubkey);
        write_str(&mut buf, device_label);
        buf
    }

    pub fn to_signing_bytes(&self) -> Vec<u8> {
        Self::signing_bytes(&self.pairing_token, &self.subkey_pubkey, &self.device_label)
    }

    pub fn verify(&self) -> Result<()> {
        check_sig(&self.subkey_pubkey, &self.to_signing_bytes(), &self.proof)
    }
}

/// Existing device finalizes pairing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairingComplete {
    pub pairing_token: String,
    pub cert: SubkeyCert,
    pub wrapped_blob_key_hex: String,
    /// The canonical (subkey-0/entropy) DM DH X25519 **scalar** (not the
    /// Ed25519 seed), ECIES-wrapped for the claiming subkey with the same
    /// `wrap_blob_key` primitive as `wrapped_blob_key_hex`. Lets the paired
    /// device agree on E2E DM and voice keys as the canonical identity
    /// without ever holding a signing seed (multi-device.md "Mechanism A").
    /// `None` for hubs/clients that predate this field — a plain JSON
    /// addition with no signing-bytes impact, since `PairingComplete` is not
    /// itself signed; only the nested `cert` is.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrapped_dh_seed_hex: Option<String>,
}

/// Status returned by the pairing status endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum PairingStatus {
    Pending,
    Claimed {
        subkey_pubkey: String,
        device_label: String,
    },
    Complete {
        cert: SubkeyCert,
        wrapped_blob_key_hex: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        wrapped_dh_seed_hex: Option<String>,
    },
    Expired,
}

/// Published DH key for a user.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DhKeyRecord {
    pub pubkey: String,
    pub dh_pubkey_hex: String,
    pub signature_hex: String,
    pub published_at: i64,
}

impl DhKeyRecord {
    pub fn signing_bytes(pubkey: &str, dh_pubkey_hex: &str) -> Vec<u8> {
        let mut out = b"wavvon/dh-key/v1\0".to_vec();
        let pk = pubkey.as_bytes();
        out.extend_from_slice(&(pk.len() as u32).to_le_bytes());
        out.extend_from_slice(pk);
        let dh = dh_pubkey_hex.as_bytes();
        out.extend_from_slice(&(dh.len() as u32).to_le_bytes());
        out.extend_from_slice(dh);
        out
    }
}

/// Shared encoder for the recovery-rotation bundle (hub_pubkey, old_pubkey,
/// new_pubkey), parameterized by domain tag — mirrors
/// wavvon_identity::wire::recovery_bundle_bytes (Wavvon-server) so distinct
/// signers (new-key proof vs. contact attestation) can never have their
/// signatures replayed as each other's.
fn recovery_bundle_bytes(
    tag: &[u8],
    hub_pubkey: &str,
    old_pubkey: &str,
    new_pubkey: &str,
) -> Vec<u8> {
    let mut buf = tag.to_vec();
    write_str(&mut buf, hub_pubkey);
    write_str(&mut buf, old_pubkey);
    write_str(&mut buf, new_pubkey);
    buf
}

/// Signing bytes for the requester's new-key proof, submitted inline with
/// `POST /recovery/rotate-key` (docs/recovery-attestation.md §4). Signed by
/// `new_pubkey`'s master key, proving the requester holds the key they're
/// rotating to. No `request_nonce` — the hub hasn't minted one yet.
pub fn recovery_request_signing_bytes(
    hub_pubkey: &str,
    old_pubkey: &str,
    new_pubkey: &str,
) -> Vec<u8> {
    recovery_bundle_bytes(
        b"wavvon/recovery-request/v1\0",
        hub_pubkey,
        old_pubkey,
        new_pubkey,
    )
}

/// Signing bytes for a recovery-contact attestation
/// (docs/recovery-attestation.md §2). A designated recovery contact signs
/// these bytes with their master key to vouch for an open key-rotation
/// request. `request_nonce` is the hub-generated per-request nonce, binding
/// the signature to one request.
pub fn recovery_attestation_signing_bytes(
    hub_pubkey: &str,
    old_pubkey: &str,
    new_pubkey: &str,
    request_nonce: &str,
) -> Vec<u8> {
    let mut buf = recovery_bundle_bytes(
        b"wavvon/recovery-attestation/v1\0",
        hub_pubkey,
        old_pubkey,
        new_pubkey,
    );
    write_str(&mut buf, request_nonce);
    buf
}

/// The scheme a hub or farm names in its /auth/challenge response when it
/// accepts an answer signed over `auth_challenge_signing_bytes`.
pub const AUTH_CHALLENGE_SCHEME: &str = "tagged-v1";

/// What a client signs to answer an auth challenge. Mirrors
/// `auth_challenge_signing_bytes` (Wavvon-server#111).
pub fn auth_challenge_signing_bytes(challenge: &[u8]) -> Vec<u8> {
    let mut buf = b"wavvon/auth-challenge/v1 ".to_vec();
    buf.extend_from_slice(challenge);
    buf
}

/// What the sender of a plaintext DM signs so a receiving hub accepts it
/// across hubs. Mirrors `federated_plaintext_dm_signing_bytes`.
pub fn federated_plaintext_dm_signing_bytes(
    conversation_id: &str,
    conv_type: &str,
    content: &str,
) -> Vec<u8> {
    let mut buf = b"wavvon/federated-dm/v1 ".to_vec();
    write_str(&mut buf, conversation_id);
    write_str(&mut buf, conv_type);
    write_str(&mut buf, content);
    buf
}

// ---------------------------------------------------------------------------
// Wire-format test vectors
// ---------------------------------------------------------------------------

/// The server's wire-format vectors, read from `wire-vectors/wire-vectors.json`
/// (see `crate::wire_vectors`). They pin our hand-written encoders to the exact
/// bytes the hub produces; no expected output is spelled out here.
/// Write a file only its owner can read: on Unix it is created 0o600 from the
/// start, not chmod-ed after. Same rule as the hub's `write_secret`.
fn write_secret(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        let mut file = options.mode(0o600).open(path)?;
        file.set_permissions(fs::Permissions::from_mode(0o600))?;
        file.write_all(contents)
    }
    #[cfg(not(unix))]
    options.open(path)?.write_all(contents)
}

/// Narrow an identity file written by an older version to owner-only (Unix).
fn restrict_secret(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    #[cfg(not(unix))]
    let _ = path;
}

#[cfg(test)]
mod wire_vector_tests {
    use super::*;
    use crate::wire_vectors::{arr, fixture, inp, n, out, s, strings, vector};
    use ed25519_dalek::{Signer, SigningKey};

    fn key(seed_hex: &str) -> SigningKey {
        SigningKey::from_bytes(&arr::<32>(seed_hex))
    }

    fn master_key() -> SigningKey {
        key(&fixture("master_seed"))
    }

    fn subkey_signing_key() -> SigningKey {
        key(&fixture("subkey_seed"))
    }

    fn hex_pubkey(k: &SigningKey) -> String {
        hex::encode(k.verifying_key().as_bytes())
    }

    /// Signs `sb` with the vector's `signer_seed` and asserts the result
    /// against its `field`; returns the signature hex.
    fn assert_signed(name: &str, field: &str, sb: &[u8]) -> String {
        let v = vector(name);
        let sig = key(&s(v, "signer_seed")).sign(sb);
        assert_eq!(hex::encode(sig.to_bytes()), out(v, field), "{name}.{field}");
        out(v, field)
    }

    fn assert_signing_bytes(name: &str, sb: &[u8]) {
        assert_eq!(
            hex::encode(sb),
            out(vector(name), "signing_bytes"),
            "{name}.signing_bytes"
        );
    }

    #[test]
    fn master_pubkey_vector() {
        let v = vector("master_pubkey");
        assert_eq!(hex_pubkey(&key(&s(v, "seed"))), out(v, "public_key"));
    }

    #[test]
    fn subkey_pubkey_vector() {
        let v = vector("subkey_pubkey");
        assert_eq!(hex_pubkey(&key(&s(v, "seed"))), out(v, "public_key"));
    }

    fn home_hub_list_sb() -> Vec<u8> {
        let v = vector("home_hub_list");
        HomeHubList::signing_bytes(
            &s(v, "master_pubkey"),
            &strings(v, "hubs"),
            n(v, "issued_at"),
            n(v, "sequence"),
        )
    }

    #[test]
    fn home_hub_list_signing_bytes_vector() {
        assert_signing_bytes("home_hub_list", &home_hub_list_sb());
    }

    #[test]
    fn home_hub_list_signature_and_verify_vector() {
        let v = vector("home_hub_list");
        let signature = assert_signed("home_hub_list", "signature", &home_hub_list_sb());
        let entry = HomeHubList {
            master_pubkey: s(v, "master_pubkey"),
            hubs: strings(v, "hubs"),
            issued_at: n(v, "issued_at"),
            sequence: n(v, "sequence"),
            signature,
        };
        assert!(entry.verify().is_ok());
    }

    fn subkey_cert_sb() -> Vec<u8> {
        let v = vector("subkey_cert");
        assert!(inp(v, "not_after").is_null());
        assert!(strings(v, "fallback_hubs").is_empty());
        SubkeyCert::signing_bytes(
            &s(v, "master_pubkey"),
            &s(v, "subkey_pubkey"),
            &s(v, "device_label"),
            n(v, "issued_at"),
            None,
            &[],
        )
    }

    #[test]
    fn subkey_cert_signing_bytes_vector() {
        assert_signing_bytes("subkey_cert", &subkey_cert_sb());
    }

    #[test]
    fn subkey_cert_signature_and_verify_vector() {
        let v = vector("subkey_cert");
        let signature = assert_signed("subkey_cert", "signature", &subkey_cert_sb());
        let cert = SubkeyCert {
            master_pubkey: s(v, "master_pubkey"),
            subkey_pubkey: s(v, "subkey_pubkey"),
            device_label: s(v, "device_label"),
            issued_at: n(v, "issued_at"),
            not_after: None,
            fallback_hubs: vec![],
            signature,
        };
        assert!(cert.verify().is_ok());
    }

    fn revocation_sb() -> Vec<u8> {
        let v = vector("revocation");
        RevocationEntry::signing_bytes(
            &s(v, "master_pubkey"),
            &s(v, "subkey_pubkey"),
            n(v, "revoked_at"),
        )
    }

    #[test]
    fn revocation_signing_bytes_vector() {
        assert_signing_bytes("revocation", &revocation_sb());
    }

    #[test]
    fn revocation_signature_and_verify_vector() {
        let v = vector("revocation");
        let signature = assert_signed("revocation", "signature", &revocation_sb());
        let entry = RevocationEntry {
            master_pubkey: s(v, "master_pubkey"),
            subkey_pubkey: s(v, "subkey_pubkey"),
            revoked_at: n(v, "revoked_at"),
            signature,
        };
        assert!(entry.verify().is_ok());
    }

    fn prefs_blob_sb() -> Vec<u8> {
        let v = vector("prefs_blob");
        SignedPrefsBlob::signing_bytes(
            &s(v, "master_pubkey"),
            n(v, "blob_version"),
            &hex::decode(s(v, "ciphertext")).unwrap(),
        )
    }

    #[test]
    fn prefs_blob_signing_bytes_vector() {
        assert_signing_bytes("prefs_blob", &prefs_blob_sb());
    }

    #[test]
    fn prefs_blob_signature_and_verify_vector() {
        let v = vector("prefs_blob");
        let signature = assert_signed("prefs_blob", "signature", &prefs_blob_sb());
        let blob = SignedPrefsBlob {
            master_pubkey: s(v, "master_pubkey"),
            blob_version: n(v, "blob_version"),
            ciphertext_hex: s(v, "ciphertext"),
            signature,
        };
        assert!(blob.verify().is_ok());
    }

    fn pairing_offer_sb() -> Vec<u8> {
        let v = vector("pairing_offer");
        PairingOffer::signing_bytes(
            &s(v, "master_pubkey"),
            &strings(v, "home_hubs"),
            &s(v, "pairing_token"),
            n(v, "issued_at"),
            n(v, "expires_at"),
        )
    }

    #[test]
    fn pairing_offer_signing_bytes_vector() {
        assert_signing_bytes("pairing_offer", &pairing_offer_sb());
    }

    #[test]
    fn pairing_offer_signature_and_verify_vector() {
        let v = vector("pairing_offer");
        let signature = assert_signed("pairing_offer", "signature", &pairing_offer_sb());
        let offer = PairingOffer {
            master_pubkey: s(v, "master_pubkey"),
            home_hubs: strings(v, "home_hubs"),
            pairing_token: s(v, "pairing_token"),
            issued_at: n(v, "issued_at"),
            expires_at: n(v, "expires_at"),
            signature,
        };
        assert!(offer.verify().is_ok());
    }

    fn pairing_claim_sb() -> Vec<u8> {
        let v = vector("pairing_claim");
        PairingClaim::signing_bytes(
            &s(v, "pairing_token"),
            &s(v, "subkey_pubkey"),
            &s(v, "device_label"),
        )
    }

    #[test]
    fn pairing_claim_signing_bytes_vector() {
        assert_signing_bytes("pairing_claim", &pairing_claim_sb());
    }

    #[test]
    fn pairing_claim_proof_and_verify_vector() {
        let v = vector("pairing_claim");
        let proof = assert_signed("pairing_claim", "proof", &pairing_claim_sb());
        let claim = PairingClaim {
            pairing_token: s(v, "pairing_token"),
            subkey_pubkey: s(v, "subkey_pubkey"),
            device_label: s(v, "device_label"),
            proof,
        };
        assert!(claim.verify().is_ok());
    }

    // -----------------------------------------------------------------------
    // DhKeyRecord + DM-envelope vectors
    // -----------------------------------------------------------------------

    /// Standard ed25519→x25519 derivation: SHA-512(seed)[0..32] → clamp.
    /// Mirrors `Identity::dh_keypair()`; replicated here so the derivation
    /// itself is pinned by the master_dh_pubkey vector.
    fn dh_pub_hex(seed: &[u8; 32]) -> String {
        use sha2::{Digest, Sha512};
        let hash = Sha512::digest(seed);
        let mut scalar = [0u8; 32];
        scalar.copy_from_slice(&hash[..32]);
        scalar[0] &= 248;
        scalar[31] &= 127;
        scalar[31] |= 64;
        let secret = x25519_dalek::StaticSecret::from(scalar);
        hex::encode(x25519_dalek::PublicKey::from(&secret).as_bytes())
    }

    #[test]
    fn master_dh_pubkey_vector() {
        let v = vector("master_dh_pubkey");
        assert_eq!(dh_pub_hex(&arr(&s(v, "seed"))), out(v, "dh_pubkey"));
    }

    fn dh_key_record_sb() -> Vec<u8> {
        let v = vector("dh_key_record");
        DhKeyRecord::signing_bytes(&s(v, "pubkey"), &s(v, "dh_pubkey"))
    }

    #[test]
    fn dh_key_record_signing_bytes_vector() {
        assert_signing_bytes("dh_key_record", &dh_key_record_sb());
    }

    // The `verify()` half of this is gone with the method: the shell publishes
    // its own DH key and never checks anybody else's, so nothing but this
    // assertion ever called it. What is left is the part that pins a byte
    // layout the shell does use.
    #[test]
    fn dh_key_record_signature_vector() {
        assert_signed("dh_key_record", "signature", &dh_key_record_sb());
    }

    #[test]
    fn dr_envelope_vector() {
        let v = vector("dr_envelope");
        let sb = crate::dm::dr_envelope_signing_bytes(
            &s(v, "conversation_id"),
            n(v, "message_index") as u32,
            n(v, "prev_count") as u32,
            &s(v, "ciphertext"),
            &s(v, "dh_pubkey"),
        );
        assert_signing_bytes("dr_envelope", &sb);
        assert_signed("dr_envelope", "signature", &sb);
    }

    #[test]
    fn ecies_wrap_vector() {
        let v = vector("ecies_wrap");
        let wrapped = wrap_blob_key_with(
            &arr(&s(v, "blob_key")),
            &s(v, "recipient_pubkey"),
            arr(&s(v, "eph_secret")),
            arr(&s(v, "nonce")),
        )
        .unwrap();
        assert_eq!(wrapped, out(v, "wrapped"));
        let unwrapped = unwrap_blob_key(&wrapped, &arr(&fixture("subkey_seed"))).unwrap();
        assert_eq!(hex::encode(unwrapped), s(v, "blob_key"));
    }

    fn group_dm_envelope_sb() -> Vec<u8> {
        let v = vector("group_dm_envelope");
        crate::dm::group_envelope_signing_bytes(
            &s(v, "conversation_id"),
            n(v, "sender_key_version") as u32,
            n(v, "iteration") as u32,
            &s(v, "ciphertext"),
            &s(v, "nonce"),
        )
    }

    #[test]
    fn group_dm_envelope_signing_bytes_vector() {
        assert_signing_bytes("group_dm_envelope", &group_dm_envelope_sb());
    }

    #[test]
    fn group_dm_envelope_signature_vector() {
        assert_signed("group_dm_envelope", "signature", &group_dm_envelope_sb());
    }

    /// Recipients arrive unsorted in the vector, to exercise the canonical
    /// sort by recipient_pubkey.
    fn sender_key_dist_sb() -> Vec<u8> {
        let v = vector("sender_key_dist");
        let recipients: Vec<(String, String)> = inp(v, "recipients")
            .as_array()
            .unwrap()
            .iter()
            .map(|p| (crate::wire_vectors::r(&p[0]), crate::wire_vectors::r(&p[1])))
            .collect();
        crate::dm::sender_key_dist_signing_bytes(
            &s(v, "conversation_id"),
            n(v, "version") as u32,
            &recipients,
        )
    }

    #[test]
    fn sender_key_dist_signing_bytes_vector() {
        assert_signing_bytes("sender_key_dist", &sender_key_dist_sb());
    }

    #[test]
    fn sender_key_dist_signature_vector() {
        assert_signed("sender_key_dist", "signature", &sender_key_dist_sb());
    }

    // -----------------------------------------------------------------------
    // Recovery-attestation bundle (docs/recovery-attestation.md §2, §4).
    // -----------------------------------------------------------------------

    fn recovery_request_sb() -> Vec<u8> {
        let v = vector("recovery_request");
        recovery_request_signing_bytes(
            &s(v, "hub_pubkey"),
            &s(v, "old_pubkey"),
            &s(v, "new_pubkey"),
        )
    }

    fn recovery_attestation_sb() -> Vec<u8> {
        let v = vector("recovery_attestation");
        recovery_attestation_signing_bytes(
            &s(v, "hub_pubkey"),
            &s(v, "old_pubkey"),
            &s(v, "new_pubkey"),
            &s(v, "request_nonce"),
        )
    }

    #[test]
    fn recovery_request_signing_bytes_vector() {
        let v = vector("recovery_request");
        // The new key is the one the recovery vectors rotate to.
        assert_eq!(
            hex_pubkey(&key(&s(v, "signer_seed"))),
            out(vector("new_key_pubkey"), "public_key")
        );
        assert_signing_bytes("recovery_request", &recovery_request_sb());
    }

    #[test]
    fn recovery_request_proof_vector() {
        assert_signed("recovery_request", "proof", &recovery_request_sb());
    }

    #[test]
    fn recovery_attestation_signing_bytes_vector() {
        assert_signing_bytes("recovery_attestation", &recovery_attestation_sb());
    }

    #[test]
    fn recovery_attestation_signature_vector() {
        assert_signed(
            "recovery_attestation",
            "signature",
            &recovery_attestation_sb(),
        );
    }

    #[test]
    fn recovery_request_and_attestation_bytes_differ() {
        let v = vector("recovery_attestation");
        let (hub, old, new) = (s(v, "hub_pubkey"), s(v, "old_pubkey"), s(v, "new_pubkey"));
        assert_ne!(
            recovery_request_signing_bytes(&hub, &old, &new),
            recovery_attestation_sb()
        );
    }

    // -----------------------------------------------------------------
    // Pairing Mechanism A (multi-device.md): the canonical DM DH scalar
    // travels to a paired device ECIES-wrapped for its subkey. Mirrors
    // identity/tests/wire_vectors.rs's
    // `wrapped_dh_scalar_round_trips_through_existing_ecies_primitive`
    // and packages/core's wire.test.ts equivalent.
    // -----------------------------------------------------------------

    #[test]
    fn pairing_complete_without_wrapped_dh_seed_parses_as_none() {
        // JSON from an enrolling device that predates the field must still
        // deserialize — pairing against an older peer degrades to "no E2E",
        // it does not fail.
        let v = vector("subkey_cert");
        let json = serde_json::json!({
            "pairing_token": "tok123",
            "cert": {
                "master_pubkey": s(v, "master_pubkey"),
                "subkey_pubkey": s(v, "subkey_pubkey"),
                "device_label": s(v, "device_label"),
                "issued_at": n(v, "issued_at"),
                "not_after": null,
                "fallback_hubs": [],
                "signature": out(v, "signature"),
            },
            "wrapped_blob_key_hex": "deadbeef",
        });
        let complete: PairingComplete = serde_json::from_value(json).unwrap();
        assert_eq!(complete.wrapped_dh_seed_hex, None);
    }

    /// The property that actually matters: what the claiming device unwraps
    /// must be the *X25519 scalar* behind the enrolling device's published
    /// DH key — not its Ed25519 seed. Wrapping the wrong one still
    /// round-trips 32 bytes and still "works", but every shared secret comes
    /// out different and messages simply fail to decrypt.
    #[test]
    fn unwrapped_canonical_scalar_reproduces_the_published_dh_pubkey() {
        let enrolling =
            Identity::from_secret_key_hex(&hex::encode(master_key().to_bytes())).unwrap();
        let (canonical_secret, canonical_pub) = enrolling.dh_keypair();

        let subkey = subkey_signing_key();
        let subkey_pubkey_hex = hex_pubkey(&subkey);

        let wrapped = wrap_blob_key(&canonical_secret.to_bytes(), &subkey_pubkey_hex)
            .expect("wrapping the canonical DH scalar");
        let unwrapped = unwrap_blob_key(&wrapped, &subkey.to_bytes()).expect("unwrapping it");

        let recovered = x25519_dalek::StaticSecret::from(unwrapped);
        assert_eq!(
            x25519_dalek::PublicKey::from(&recovered).as_bytes(),
            canonical_pub.as_bytes(),
            "paired device must derive the same DH pubkey peers fetch for the roster identity",
        );
    }

    /// A paired device holding the canonical scalar and the enrolling device
    /// must agree on the same static-static shared secret with any third
    /// party — that agreement is the whole point of Mechanism A.
    #[test]
    fn paired_device_agrees_with_enrolling_device_on_the_shared_secret() {
        let enrolling =
            Identity::from_secret_key_hex(&hex::encode(master_key().to_bytes())).unwrap();
        let (canonical_secret, _) = enrolling.dh_keypair();
        let subkey = subkey_signing_key();

        let wrapped = wrap_blob_key(&canonical_secret.to_bytes(), &hex_pubkey(&subkey)).unwrap();
        let paired_scalar = x25519_dalek::StaticSecret::from(
            unwrap_blob_key(&wrapped, &subkey.to_bytes()).unwrap(),
        );

        let peer = Identity::from_secret_key_hex(&hex::encode([7u8; 32])).unwrap();
        let (peer_secret, peer_pub) = peer.dh_keypair();

        assert_eq!(
            paired_scalar.diffie_hellman(&peer_pub).as_bytes(),
            canonical_secret.diffie_hellman(&peer_pub).as_bytes(),
            "paired device must reach the peer's shared secret",
        );
        // And the peer reaches the same one from its side.
        let (_, canonical_pub) = enrolling.dh_keypair();
        assert_eq!(
            peer_secret.diffie_hellman(&canonical_pub).as_bytes(),
            paired_scalar.diffie_hellman(&peer_pub).as_bytes(),
        );
    }

    #[test]
    fn auth_challenge_matches_the_server_vector() {
        let v = vector("auth_challenge");
        let sb = auth_challenge_signing_bytes(&hex::decode(s(v, "challenge")).unwrap());
        assert_signing_bytes("auth_challenge", &sb);
        assert_signed("auth_challenge", "signature", &sb);
    }

    #[test]
    fn federated_plaintext_dm_matches_the_server_vector() {
        let v = vector("federated_plaintext_dm");
        let sb = federated_plaintext_dm_signing_bytes(
            &s(v, "conversation_id"),
            &s(v, "kind"),
            &s(v, "content"),
        );
        assert_signing_bytes("federated_plaintext_dm", &sb);
        assert_signed("federated_plaintext_dm", "signature", &sb);
    }

    /// The failure this replaces: deriving from the paired device's own
    /// subkey seed produces a scalar nobody else agrees with. If this ever
    /// starts passing, `e2e_dh_secret` has stopped mattering.
    #[test]
    fn subkey_derived_scalar_does_not_agree_with_the_canonical_one() {
        let enrolling =
            Identity::from_secret_key_hex(&hex::encode(master_key().to_bytes())).unwrap();
        let (canonical_secret, _) = enrolling.dh_keypair();
        let subkey_identity =
            Identity::from_secret_key_hex(&hex::encode(subkey_signing_key().to_bytes())).unwrap();
        let (subkey_secret, _) = subkey_identity.dh_keypair();

        let peer = Identity::from_secret_key_hex(&hex::encode([9u8; 32])).unwrap();
        let (_, peer_pub) = peer.dh_keypair();

        assert_ne!(
            subkey_secret.diffie_hellman(&peer_pub).as_bytes(),
            canonical_secret.diffie_hellman(&peer_pub).as_bytes(),
        );
    }
}
