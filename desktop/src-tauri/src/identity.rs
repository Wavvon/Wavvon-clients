// Local identity primitives — reimplemented directly against standard crypto
// crates so voxply-desktop has no dependency on any hub-internal crate.

#![allow(dead_code)]

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

    pub fn save(&self, path: &Path) -> Result<()> {
        let data = SavedIdentity {
            secret_key: hex::encode(self.signing_key.to_bytes()),
            security_nonce: Some(self.security_nonce),
            security_level: Some(self.security_level),
        };
        let json = serde_json::to_string_pretty(&data)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).context("Failed to create identity directory")?;
        }
        fs::write(path, json).context("Failed to write identity file")?;
        Ok(())
    }

    pub fn load(path: &Path) -> Result<Self> {
        let json = fs::read_to_string(path).context("Failed to read identity file")?;
        let data: SavedIdentity =
            serde_json::from_str(&json).context("Failed to parse identity file")?;
        let secret_bytes = hex::decode(&data.secret_key).context("Invalid hex in identity file")?;
        let secret_array: [u8; 32] = secret_bytes
            .try_into()
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

    pub fn verifying_key(&self) -> VerifyingKey {
        self.signing_key.verifying_key()
    }

    pub fn default_path() -> Result<PathBuf> {
        let home = dirs::home_dir().context("Could not find home directory")?;
        Ok(home.join(".voxply").join("identity.json"))
    }

    /// Derive the master keypair from this identity's secret bytes.
    pub fn master(&self) -> Result<MasterIdentity> {
        let entropy = self.signing_key.to_bytes();
        MasterIdentity::derive_from_entropy(&entropy)
    }

    /// Wrap this identity as subkey 0 with a user-facing label.
    pub fn as_subkey_zero(&self, label: String) -> DeviceSubkey {
        let entropy = self.signing_key.to_bytes();
        DeviceSubkey::subkey_zero_from_entropy(&entropy, label)
    }

    /// Generate a 24-word BIP39 recovery phrase from the secret key.
    pub fn recovery_phrase(&self) -> String {
        let secret_bytes = self.signing_key.to_bytes();
        Mnemonic::from_entropy_in(Language::English, &secret_bytes)
            .expect("32 bytes should always produce a valid mnemonic")
            .to_string()
    }

    /// Restore an identity from a 24-word recovery phrase.
    pub fn from_recovery_phrase(phrase: &str) -> Result<Self> {
        let mnemonic =
            Mnemonic::parse_in(Language::English, phrase).context("Invalid recovery phrase")?;
        let entropy = mnemonic.to_entropy();
        let secret_array: [u8; 32] = entropy
            .try_into()
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
        let seed = self.signing_key.to_bytes();
        let hash = Sha512::digest(seed);
        let mut scalar = [0u8; 32];
        scalar.copy_from_slice(&hash[..32]);
        scalar[0] &= 248;
        scalar[31] &= 127;
        scalar[31] |= 64;
        let secret = x25519_dalek::StaticSecret::from(scalar);
        let public = x25519_dalek::PublicKey::from(&secret);
        (secret, public)
    }

    /// Improve security level by computing more proof-of-work.
    pub fn improve_security_level(&mut self, target_level: u32) -> u32 {
        let pub_key = self.public_key_hex();
        let (nonce, level) = compute_security_level(&pub_key, self.security_nonce, target_level);
        self.security_nonce = nonce;
        self.security_level = level;
        level
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

const MASTER_HKDF_INFO: &[u8] = b"voxply/master/v1";

pub struct MasterIdentity {
    signing_key: SigningKey,
}

impl MasterIdentity {
    pub fn derive_from_entropy(entropy: &[u8; 32]) -> Result<Self> {
        let hk = Hkdf::<Sha256>::new(None, entropy);
        let mut okm = [0u8; 32];
        hk.expand(MASTER_HKDF_INFO, &mut okm)
            .map_err(|e| anyhow!("HKDF expand failed: {e}"))?;
        Ok(Self {
            signing_key: SigningKey::from_bytes(&okm),
        })
    }

    pub fn derive_from_phrase(phrase: &str) -> Result<Self> {
        let mnemonic =
            Mnemonic::parse_in(Language::English, phrase).context("Invalid recovery phrase")?;
        let entropy = mnemonic.to_entropy();
        let entropy_array: [u8; 32] = entropy
            .try_into()
            .map_err(|_| anyhow!("Recovery phrase must produce exactly 32 bytes"))?;
        Self::derive_from_entropy(&entropy_array)
    }

    pub fn public_key_hex(&self) -> String {
        hex::encode(self.signing_key.verifying_key().as_bytes())
    }

    pub fn sign(&self, message: &[u8]) -> Signature {
        self.signing_key.sign(message)
    }

    pub fn verifying_key(&self) -> VerifyingKey {
        self.signing_key.verifying_key()
    }

    /// Raw 32-byte seed of the master signing key.
    pub fn secret_seed(&self) -> [u8; 32] {
        self.signing_key.to_bytes()
    }
}

// ---------------------------------------------------------------------------
// DeviceSubkey
// ---------------------------------------------------------------------------

pub struct DeviceSubkey {
    signing_key: SigningKey,
    label: String,
}

impl DeviceSubkey {
    pub fn generate(label: String) -> Self {
        Self {
            signing_key: SigningKey::generate(&mut OsRng),
            label,
        }
    }

    /// Subkey 0 is the legacy single-key identity. Its pubkey equals
    /// the existing per-device identity's pubkey, so non-upgraded hubs
    /// see no change.
    pub fn subkey_zero_from_entropy(entropy: &[u8; 32], label: String) -> Self {
        Self {
            signing_key: SigningKey::from_bytes(entropy),
            label,
        }
    }

    pub fn label(&self) -> &str {
        &self.label
    }

    pub fn public_key_hex(&self) -> String {
        hex::encode(self.signing_key.verifying_key().as_bytes())
    }

    /// Raw 32-byte secret for persistence.
    pub fn secret_bytes(&self) -> [u8; 32] {
        self.signing_key.to_bytes()
    }

    pub fn from_secret_bytes(secret: &[u8; 32], label: String) -> Self {
        Self {
            signing_key: SigningKey::from_bytes(secret),
            label,
        }
    }

    pub fn sign(&self, message: &[u8]) -> Signature {
        self.signing_key.sign(message)
    }

    pub fn verifying_key(&self) -> VerifyingKey {
        self.signing_key.verifying_key()
    }

    /// Raw 32-byte seed of this device's signing key.
    pub fn secret_seed(&self) -> [u8; 32] {
        self.signing_key.to_bytes()
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

/// Count leading zero bits in a SHA256 hash.
pub fn leading_zero_bits(hash: &[u8]) -> u32 {
    let mut count = 0;
    for byte in hash {
        if *byte == 0 {
            count += 8;
        } else {
            count += byte.leading_zeros();
            break;
        }
    }
    count
}

/// Compute a proof-of-work nonce that achieves at least `target_level` leading zero bits.
/// Starts searching from `start_nonce`. Returns (nonce, actual_level_achieved).
pub fn compute_security_level(
    public_key_hex: &str,
    start_nonce: u64,
    target_level: u32,
) -> (u64, u32) {
    let mut best_nonce = start_nonce;
    let mut best_level = 0;

    if start_nonce > 0 {
        best_level = hash_level(public_key_hex, start_nonce);
        if best_level >= target_level {
            return (best_nonce, best_level);
        }
    }

    let mut nonce = start_nonce;
    loop {
        nonce += 1;
        let level = hash_level(public_key_hex, nonce);
        if level > best_level {
            best_level = level;
            best_nonce = nonce;
            if best_level >= target_level {
                return (best_nonce, best_level);
            }
        }
    }
}

/// Verify that a given nonce achieves the claimed security level.
pub fn verify_security_level(public_key_hex: &str, nonce: u64, claimed_level: u32) -> bool {
    if claimed_level == 0 {
        return true;
    }
    hash_level(public_key_hex, nonce) >= claimed_level
}

fn hash_level(public_key_hex: &str, nonce: u64) -> u32 {
    let mut hasher = Sha256::new();
    hasher.update(public_key_hex.as_bytes());
    hasher.update(nonce.to_le_bytes());
    let result = hasher.finalize();
    leading_zero_bits(&result)
}

// ---------------------------------------------------------------------------
// ECIES: wrap / unwrap a 32-byte blob key for an Ed25519 recipient
// ---------------------------------------------------------------------------

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce as AesNonce,
};
use rand::RngCore;
use sha2::Sha512;

const ECIES_INFO: &[u8] = b"voxply/ecies/v1";

/// Wrap a 32-byte blob key for a recipient identified by their Ed25519 pubkey.
///
/// Returns a 184-char hex string encoding:
///   eph_x25519_pub[32] || aes_gcm_nonce[12] || aes_gcm_ciphertext_and_tag[48]
pub fn wrap_blob_key(blob_key: &[u8; 32], recipient_ed25519_pubkey_hex: &str) -> Result<String> {
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

    let eph_priv = x25519_dalek::StaticSecret::random_from_rng(OsRng);
    let eph_pub = x25519_dalek::PublicKey::from(&eph_priv);

    let shared = eph_priv.diffie_hellman(&x25519_pub);

    let hk = Hkdf::<Sha256>::new(Some(eph_pub.as_bytes()), shared.as_bytes());
    let mut enc_key = [0u8; 32];
    hk.expand(ECIES_INFO, &mut enc_key)
        .map_err(|e| anyhow!("HKDF expand: {e}"))?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
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
        buf.extend_from_slice(b"voxply/home-hub-list/v1\0");
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
        buf.extend_from_slice(b"voxply/subkey-cert/v1\0");
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
        buf.extend_from_slice(b"voxply/revocation/v1\0");
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
        buf.extend_from_slice(b"voxply/prefs-blob/v1\0");
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
        buf.extend_from_slice(b"voxply/pairing-offer/v1\0");
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
        buf.extend_from_slice(b"voxply/pairing-claim/v1\0");
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
        let mut out = b"voxply/dh-key/v1\0".to_vec();
        let pk = pubkey.as_bytes();
        out.extend_from_slice(&(pk.len() as u32).to_le_bytes());
        out.extend_from_slice(pk);
        let dh = dh_pubkey_hex.as_bytes();
        out.extend_from_slice(&(dh.len() as u32).to_le_bytes());
        out.extend_from_slice(dh);
        out
    }

    pub fn verify(&self) -> Result<()> {
        let msg = Self::signing_bytes(&self.pubkey, &self.dh_pubkey_hex);
        verify_signature(
            &self.pubkey,
            &msg,
            &hex::decode(&self.signature_hex).context("invalid signature hex")?,
        )
    }
}

/// One entry in a user's public hub list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicHubEntry {
    pub hub_url: String,
    pub hub_name: String,
    pub joined_at: u64,
}

/// Master-signed public profile declaring which hubs a user wants others
/// to discover them on.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicHubProfile {
    pub pubkey: String,
    pub display_name: String,
    #[serde(default)]
    pub avatar: Option<String>,
    pub public_hubs: Vec<PublicHubEntry>,
    pub issued_at: u64,
    pub signature: String,
}

impl PublicHubProfile {
    pub fn signing_bytes(pubkey: &str, public_hubs: &[PublicHubEntry], issued_at: u64) -> Vec<u8> {
        let mut buf = Vec::new();
        buf.extend_from_slice(b"voxply/public-hub-profile/v1\0");
        write_str(&mut buf, pubkey);
        write_u64_le(&mut buf, issued_at);
        write_u32_le(&mut buf, public_hubs.len() as u32);
        for entry in public_hubs {
            write_str(&mut buf, &entry.hub_url);
            write_str(&mut buf, &entry.hub_name);
            write_u64_le(&mut buf, entry.joined_at);
        }
        buf
    }

    pub fn to_signing_bytes(&self) -> Vec<u8> {
        Self::signing_bytes(&self.pubkey, &self.public_hubs, self.issued_at)
    }

    pub fn verify(&self) -> Result<()> {
        check_sig(&self.pubkey, &self.to_signing_bytes(), &self.signature)
    }
}
