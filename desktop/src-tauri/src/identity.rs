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

// ---------------------------------------------------------------------------
// Wire-format test vectors
// ---------------------------------------------------------------------------

/// Canonical hex vectors from hub/docs/wire-format.md (enforced server-side by
/// hub/identity/tests/wire_vectors.rs). These pin our hand-written encoders to
/// the exact bytes the hub produces, so the formats cannot drift apart.
///
/// Fixed inputs:
///   master seed: 0x01 0x02 … 0x20  (32 bytes)
///   subkey seed: 0x21 0x22 … 0x40  (32 bytes)
///   timestamp  : 1_700_000_000  (unix seconds)
#[cfg(test)]
mod wire_vector_tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    const TS: u64 = 1_700_000_000;

    const MASTER_PUB: &str = "79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664";
    const SUBKEY_PUB: &str = "e7f162a10bec559afea195e4dce84b69568d5d2cb0963eb446c0685e2b17f2f0";

    const HOME_HUB_LIST_SIGNING_BYTES: &str = "766f78706c792f686f6d652d6875622d6c6973742f7631004000000037396235353632653866653635346639343037386231313265386139386261373930316638353361653639356265643765306533393130626164303439363634010000001300000068747470733a2f2f6875622e6578616d706c6500f15365000000000100000000000000";
    const HOME_HUB_LIST_SIG: &str = "4870a33b56b0379da91cf0c7cf517bb0dc9d0f2c4fbe487cd1b310811b70c2a3ad0bbec3468cf58c4c696a472207e29925b8975f87e68eaeaa4fc3fc449a9f03";

    const SUBKEY_CERT_SIGNING_BYTES: &str = "766f78706c792f7375626b65792d636572742f76310040000000373962353536326538666536353466393430373862313132653861393862613739303166383533616536393562656437653065333931306261643034393636344000000065376631363261313062656335353961666561313935653464636538346236393536386435643263623039363365623434366330363835653262313766326630060000006c6170746f7000f15365000000000000000000";
    const SUBKEY_CERT_SIG: &str = "90a7abf5cf8915efea90740ab0e0b8f09ed93343584dbddeb7b593a1f0c4c4c883590f88e5ce46d14bd986cb4081e0860850934031c8343f82335699fd95fc04";

    const REVOCATION_SIGNING_BYTES: &str = "766f78706c792f7265766f636174696f6e2f76310040000000373962353536326538666536353466393430373862313132653861393862613739303166383533616536393562656437653065333931306261643034393636344000000065376631363261313062656335353961666561313935653464636538346236393536386435643263623039363365623434366330363835653262313766326630f4f2536500000000";
    const REVOCATION_SIG: &str = "97b97ed6ef6586d23d20c5dc1f96265611758a7bdccb06455b3a79674b176fbee65a4fd0223e181cd0d10d8c6107eb04fc6ca742814ff017c97ed1a7726ac406";

    const PREFS_CIPHERTEXT_HEX: &str = "63697068657274657874";
    const PREFS_SIGNING_BYTES: &str = "766f78706c792f70726566732d626c6f622f76310040000000373962353536326538666536353466393430373862313132653861393862613739303166383533616536393562656437653065333931306261643034393636340100000000000000305531dcc50ebca31cf1d5b31e9fc76ed51f66b3b6dd5a030c6539ae6532f979";
    const PREFS_SIG: &str = "6e76b197980a4b0b8794c1c2989663b6045ceffaf3985e5f6b6681f636fbf46750ccfb0424f3aa02b95d504cea19c60d5c27e09905924eb50096a30a2f3ce80c";

    const PAIRING_OFFER_SIGNING_BYTES: &str = "766f78706c792f70616972696e672d6f666665722f7631004000000037396235353632653866653635346639343037386231313265386139386261373930316638353361653639356265643765306533393130626164303439363634010000001300000068747470733a2f2f6875622e6578616d706c6506000000746f6b31323300f15365000000002cf2536500000000";
    const PAIRING_OFFER_SIG: &str = "e7ed2fb82e5c195e532ce949f8804c2069854697abd744f532c490322fa42af4b8708bb473762a0261dfeb7a8209ef165849e7bc08f653d41f0b8064b89e470a";

    const PAIRING_CLAIM_SIGNING_BYTES: &str = "766f78706c792f70616972696e672d636c61696d2f76310006000000746f6b3132334000000065376631363261313062656335353961666561313935653464636538346236393536386435643263623039363365623434366330363835653262313766326630060000006c6170746f70";
    const PAIRING_CLAIM_PROOF: &str = "e2eeee6d5b5032974c19b6aff42361829846f2e26e7e329985ad709d6b8c6f45e48156adcb75301570759bd14a1e192f4499fa0273adab1ee3db900821663608";

    fn master_key() -> SigningKey {
        let mut seed = [0u8; 32];
        for (i, b) in seed.iter_mut().enumerate() {
            *b = (i + 1) as u8;
        }
        SigningKey::from_bytes(&seed)
    }

    fn subkey_signing_key() -> SigningKey {
        let mut seed = [0u8; 32];
        for (i, b) in seed.iter_mut().enumerate() {
            *b = (i + 0x21) as u8;
        }
        SigningKey::from_bytes(&seed)
    }

    fn hex_pubkey(k: &SigningKey) -> String {
        hex::encode(k.verifying_key().as_bytes())
    }

    #[test]
    fn master_pubkey_vector() {
        assert_eq!(hex_pubkey(&master_key()), MASTER_PUB);
    }

    #[test]
    fn subkey_pubkey_vector() {
        assert_eq!(hex_pubkey(&subkey_signing_key()), SUBKEY_PUB);
    }

    #[test]
    fn home_hub_list_signing_bytes_vector() {
        let hubs = vec!["https://hub.example".to_string()];
        let sb = HomeHubList::signing_bytes(MASTER_PUB, &hubs, TS, 1);
        assert_eq!(hex::encode(&sb), HOME_HUB_LIST_SIGNING_BYTES);
    }

    #[test]
    fn home_hub_list_signature_and_verify_vector() {
        let hubs = vec!["https://hub.example".to_string()];
        let sb = HomeHubList::signing_bytes(MASTER_PUB, &hubs, TS, 1);
        let sig = master_key().sign(&sb);
        assert_eq!(hex::encode(sig.to_bytes()), HOME_HUB_LIST_SIG);
        let entry = HomeHubList {
            master_pubkey: MASTER_PUB.to_string(),
            hubs,
            issued_at: TS,
            sequence: 1,
            signature: HOME_HUB_LIST_SIG.to_string(),
        };
        assert!(entry.verify().is_ok());
    }

    #[test]
    fn subkey_cert_signing_bytes_vector() {
        let sb = SubkeyCert::signing_bytes(MASTER_PUB, SUBKEY_PUB, "laptop", TS, None, &[]);
        assert_eq!(hex::encode(&sb), SUBKEY_CERT_SIGNING_BYTES);
    }

    #[test]
    fn subkey_cert_signature_and_verify_vector() {
        let sb = SubkeyCert::signing_bytes(MASTER_PUB, SUBKEY_PUB, "laptop", TS, None, &[]);
        let sig = master_key().sign(&sb);
        assert_eq!(hex::encode(sig.to_bytes()), SUBKEY_CERT_SIG);
        let cert = SubkeyCert {
            master_pubkey: MASTER_PUB.to_string(),
            subkey_pubkey: SUBKEY_PUB.to_string(),
            device_label: "laptop".to_string(),
            issued_at: TS,
            not_after: None,
            fallback_hubs: vec![],
            signature: SUBKEY_CERT_SIG.to_string(),
        };
        assert!(cert.verify().is_ok());
    }

    #[test]
    fn revocation_signing_bytes_vector() {
        let sb = RevocationEntry::signing_bytes(MASTER_PUB, SUBKEY_PUB, TS + 500);
        assert_eq!(hex::encode(&sb), REVOCATION_SIGNING_BYTES);
    }

    #[test]
    fn revocation_signature_and_verify_vector() {
        let sb = RevocationEntry::signing_bytes(MASTER_PUB, SUBKEY_PUB, TS + 500);
        let sig = master_key().sign(&sb);
        assert_eq!(hex::encode(sig.to_bytes()), REVOCATION_SIG);
        let entry = RevocationEntry {
            master_pubkey: MASTER_PUB.to_string(),
            subkey_pubkey: SUBKEY_PUB.to_string(),
            revoked_at: TS + 500,
            signature: REVOCATION_SIG.to_string(),
        };
        assert!(entry.verify().is_ok());
    }

    #[test]
    fn prefs_blob_signing_bytes_vector() {
        let ct = hex::decode(PREFS_CIPHERTEXT_HEX).unwrap();
        let sb = SignedPrefsBlob::signing_bytes(MASTER_PUB, 1, &ct);
        assert_eq!(hex::encode(&sb), PREFS_SIGNING_BYTES);
    }

    #[test]
    fn prefs_blob_signature_and_verify_vector() {
        let ct = hex::decode(PREFS_CIPHERTEXT_HEX).unwrap();
        let sb = SignedPrefsBlob::signing_bytes(MASTER_PUB, 1, &ct);
        let sig = master_key().sign(&sb);
        assert_eq!(hex::encode(sig.to_bytes()), PREFS_SIG);
        let blob = SignedPrefsBlob {
            master_pubkey: MASTER_PUB.to_string(),
            blob_version: 1,
            ciphertext_hex: PREFS_CIPHERTEXT_HEX.to_string(),
            signature: PREFS_SIG.to_string(),
        };
        assert!(blob.verify().is_ok());
    }

    #[test]
    fn pairing_offer_signing_bytes_vector() {
        let hubs = vec!["https://hub.example".to_string()];
        let sb = PairingOffer::signing_bytes(MASTER_PUB, &hubs, "tok123", TS, TS + 300);
        assert_eq!(hex::encode(&sb), PAIRING_OFFER_SIGNING_BYTES);
    }

    #[test]
    fn pairing_offer_signature_and_verify_vector() {
        let hubs = vec!["https://hub.example".to_string()];
        let sb = PairingOffer::signing_bytes(MASTER_PUB, &hubs, "tok123", TS, TS + 300);
        let sig = master_key().sign(&sb);
        assert_eq!(hex::encode(sig.to_bytes()), PAIRING_OFFER_SIG);
        let offer = PairingOffer {
            master_pubkey: MASTER_PUB.to_string(),
            home_hubs: hubs,
            pairing_token: "tok123".to_string(),
            issued_at: TS,
            expires_at: TS + 300,
            signature: PAIRING_OFFER_SIG.to_string(),
        };
        assert!(offer.verify().is_ok());
    }

    #[test]
    fn pairing_claim_signing_bytes_vector() {
        let sb = PairingClaim::signing_bytes("tok123", SUBKEY_PUB, "laptop");
        assert_eq!(hex::encode(&sb), PAIRING_CLAIM_SIGNING_BYTES);
    }

    #[test]
    fn pairing_claim_proof_and_verify_vector() {
        let sb = PairingClaim::signing_bytes("tok123", SUBKEY_PUB, "laptop");
        let sig = subkey_signing_key().sign(&sb);
        assert_eq!(hex::encode(sig.to_bytes()), PAIRING_CLAIM_PROOF);
        let claim = PairingClaim {
            pairing_token: "tok123".to_string(),
            subkey_pubkey: SUBKEY_PUB.to_string(),
            device_label: "laptop".to_string(),
            proof: PAIRING_CLAIM_PROOF.to_string(),
        };
        assert!(claim.verify().is_ok());
    }

    // -----------------------------------------------------------------------
    // DhKeyRecord + DM-envelope vectors
    // -----------------------------------------------------------------------

    // X25519 DH pubkey derived from the master seed (SHA-512 + clamp)
    const MASTER_DH_PUB: &str = "4a3807d064d077181cc070989e76891d20dca5559548dc2c77c1a50273882b38";

    const DH_KEY_RECORD_SIGNING_BYTES: &str = "766f78706c792f64682d6b65792f76310040000000373962353536326538666536353466393430373862313132653861393862613739303166383533616536393562656437653065333931306261643034393636344000000034613338303764303634643037373138316363303730393839653736383931643230646361353535393534386463326337376331613530323733383832623338";
    const DH_KEY_RECORD_SIG: &str = "055425d9cd0d2488c89bb9b0cc13f7ccb7f8581d20ba767123d4131bff9dd6abbb24b73c111777602d79b4cf4f7f8cc7c9eb0f3b3409bb2f1ab422330a2a7807";

    // Shared DM-envelope fixed inputs
    const DM_CONV_ID: &str = "conv123";
    const DM_CIPHERTEXT_HEX: &str = "63697068657274657874"; // hex("ciphertext")
    const DM_NONCE_HEX: &str = "0102030405060708090a0b0c";

    const DM_ENVELOPE_SIGNING_BYTES: &str = "766f78706c792f646d2d636970686572746578742f76310007000000636f6e76313233140000003633363937303638363537323734363537383734180000003031303230333034303530363037303830393061306230634000000034613338303764303634643037373138316363303730393839653736383931643230646361353535393534386463326337376331613530323733383832623338";
    const DM_ENVELOPE_SIG: &str = "cacd0b3e90b7b09c25d0a2ae508470338a1b6c5b73935ba6245125c13c6bdc67bf647f9e108b59ea3ca913c3e7ad55b6c3a3157b9e95afc995ed9c22f9f34506";

    // GroupEncryptedEnvelope — sender_key_version = 1, iteration = 2
    const GROUP_DM_ENVELOPE_SIGNING_BYTES: &str = "766f78706c792f67726f75702d646d2d636970686572746578742f76310007000000636f6e763132330100000031010000003214000000363336393730363836353732373436353738373418000000303130323033303430353036303730383039306130623063";
    const GROUP_DM_ENVELOPE_SIG: &str = "57c14f56b4367584ca5595586dde46dee09757d95200eeab6044948a2c6e39d3db7faa4a2ed352963c5d5ad76f85fb9b4345e3912bdd9d758583b362786b610f";

    // Sender-key distribution — version 1, recipients supplied unsorted
    // (subkey first) to exercise the canonical sort by recipient_pubkey.
    const SENDER_KEY_DIST_SIGNING_BYTES: &str = "766f78706c792f67726f75702d6b65792d646973742f76310007000000636f6e76313233010000003140000000373962353536326538666536353466393430373862313132653861393862613739303166383533616536393562656437653065333931306261643034393636340800000031313232333334344000000065376631363261313062656335353961666561313935653464636538346236393536386435643263623039363365623434366330363835653262313766326630080000003535363637373838";
    const SENDER_KEY_DIST_SIG: &str = "36325dd1c3e2a36618ceef4b8d91a7c71d4274c441dbbc37cb42bf2e96106d59fecf0721cb3042e1410b575d072b79189c14896bbbfc6a4266de7857e45c7a06";

    /// Standard ed25519→x25519 derivation: SHA-512(seed)[0..32] → clamp.
    /// Mirrors `Identity::dh_keypair()`; replicated here so the derivation
    /// itself is pinned by the MASTER_DH_PUB vector.
    fn master_dh_pub_hex() -> String {
        use sha2::{Digest, Sha512};
        let hash = Sha512::digest(master_key().to_bytes());
        let mut scalar = [0u8; 32];
        scalar.copy_from_slice(&hash[..32]);
        scalar[0] &= 248;
        scalar[31] &= 127;
        scalar[31] |= 64;
        let secret = x25519_dalek::StaticSecret::from(scalar);
        hex::encode(x25519_dalek::PublicKey::from(&secret).as_bytes())
    }

    fn dist_recipients() -> Vec<(String, String)> {
        vec![
            (SUBKEY_PUB.to_string(), "55667788".to_string()),
            (MASTER_PUB.to_string(), "11223344".to_string()),
        ]
    }

    #[test]
    fn master_dh_pubkey_vector() {
        assert_eq!(master_dh_pub_hex(), MASTER_DH_PUB);
    }

    #[test]
    fn dh_key_record_signing_bytes_vector() {
        let sb = DhKeyRecord::signing_bytes(MASTER_PUB, MASTER_DH_PUB);
        assert_eq!(hex::encode(&sb), DH_KEY_RECORD_SIGNING_BYTES);
    }

    #[test]
    fn dh_key_record_signature_and_verify_vector() {
        let sb = DhKeyRecord::signing_bytes(MASTER_PUB, MASTER_DH_PUB);
        let sig = master_key().sign(&sb);
        assert_eq!(hex::encode(sig.to_bytes()), DH_KEY_RECORD_SIG);
        let record = DhKeyRecord {
            pubkey: MASTER_PUB.to_string(),
            dh_pubkey_hex: MASTER_DH_PUB.to_string(),
            signature_hex: DH_KEY_RECORD_SIG.to_string(),
            published_at: TS as i64,
        };
        assert!(record.verify().is_ok());
    }

    #[test]
    fn dm_envelope_signing_bytes_vector() {
        let sb = crate::dm::dm_envelope_signing_bytes(
            DM_CONV_ID,
            DM_CIPHERTEXT_HEX,
            DM_NONCE_HEX,
            MASTER_DH_PUB,
        );
        assert_eq!(hex::encode(&sb), DM_ENVELOPE_SIGNING_BYTES);
    }

    #[test]
    fn dm_envelope_signature_vector() {
        let sb = crate::dm::dm_envelope_signing_bytes(
            DM_CONV_ID,
            DM_CIPHERTEXT_HEX,
            DM_NONCE_HEX,
            MASTER_DH_PUB,
        );
        let sig = master_key().sign(&sb);
        assert_eq!(hex::encode(sig.to_bytes()), DM_ENVELOPE_SIG);
    }

    #[test]
    fn group_dm_envelope_signing_bytes_vector() {
        let sb = crate::dm::group_envelope_signing_bytes(
            DM_CONV_ID,
            1,
            2,
            DM_CIPHERTEXT_HEX,
            DM_NONCE_HEX,
        );
        assert_eq!(hex::encode(&sb), GROUP_DM_ENVELOPE_SIGNING_BYTES);
    }

    #[test]
    fn group_dm_envelope_signature_vector() {
        let sb = crate::dm::group_envelope_signing_bytes(
            DM_CONV_ID,
            1,
            2,
            DM_CIPHERTEXT_HEX,
            DM_NONCE_HEX,
        );
        let sig = master_key().sign(&sb);
        assert_eq!(hex::encode(sig.to_bytes()), GROUP_DM_ENVELOPE_SIG);
    }

    #[test]
    fn sender_key_dist_signing_bytes_vector() {
        let sb = crate::dm::sender_key_dist_signing_bytes(DM_CONV_ID, 1, &dist_recipients());
        assert_eq!(hex::encode(&sb), SENDER_KEY_DIST_SIGNING_BYTES);
    }

    #[test]
    fn sender_key_dist_signature_vector() {
        let sb = crate::dm::sender_key_dist_signing_bytes(DM_CONV_ID, 1, &dist_recipients());
        let sig = master_key().sign(&sb);
        assert_eq!(hex::encode(sig.to_bytes()), SENDER_KEY_DIST_SIG);
    }
}
