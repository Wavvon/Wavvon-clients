use std::time::{SystemTime, UNIX_EPOCH};

use crate::identity::{Identity, RevocationEntry, SubkeyCert};

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client: {e}"))
}

fn load_master_identity() -> Result<crate::identity::MasterIdentity, String> {
    let path = Identity::default_path().map_err(|e| e.to_string())?;
    let identity = Identity::load(&path).map_err(|e| e.to_string())?;
    identity.master().map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct PairedDevice {
    pub subkey_pubkey: String,
    pub device_label: String,
    pub issued_at: u64,
    pub not_after: Option<u64>,
    pub is_this_device: bool,
}

/// List all registered device certs from the first reachable home hub.
/// Returns an empty Vec (not an error) when no hub is reachable.
#[tauri::command]
pub async fn device_list() -> Result<Vec<PairedDevice>, String> {
    // Determine master pubkey and "this device" subkey pubkey.
    let (master_pubkey, my_pubkey) = {
        let paired = crate::pairing::get_paired_identity();
        if let Some(p) = paired {
            (p.master_pubkey, p.subkey_pubkey)
        } else {
            let path = Identity::default_path().map_err(|e| e.to_string())?;
            let identity = Identity::load_or_create(&path)
                .map_err(|e| e.to_string())?
                .0;
            let master = identity.master().map_err(|e| e.to_string())?;
            let master_pubkey = master.public_key_hex();
            let my_pubkey = identity.public_key_hex();
            (master_pubkey, my_pubkey)
        }
    };

    let home_hubs = crate::home_hub::read_cached_designation()
        .map(|d| d.hubs)
        .unwrap_or_default();

    if home_hubs.is_empty() {
        return Ok(Vec::new());
    }

    let client = http_client()?;

    for hub_url in &home_hubs {
        let endpoint = format!(
            "{}/identity/{}/devices",
            hub_url.trim_end_matches('/'),
            master_pubkey
        );
        match client.get(&endpoint).send().await {
            Ok(resp) if resp.status().is_success() => match resp.json::<Vec<SubkeyCert>>().await {
                Ok(certs) => {
                    let devices = certs
                        .into_iter()
                        .map(|cert| {
                            let is_this_device = cert.subkey_pubkey == my_pubkey;
                            PairedDevice {
                                subkey_pubkey: cert.subkey_pubkey,
                                device_label: cert.device_label,
                                issued_at: cert.issued_at,
                                not_after: cert.not_after,
                                is_this_device,
                            }
                        })
                        .collect();
                    return Ok(devices);
                }
                Err(_) => continue,
            },
            _ => continue,
        }
    }

    // No hub was reachable — return empty, not an error.
    Ok(Vec::new())
}

/// Revoke a device subkey. Requires master identity (phrase) on this device.
#[tauri::command]
pub async fn device_revoke(pubkey: String) -> Result<(), String> {
    let master = load_master_identity()
        .map_err(|_| "device revoke requires master identity on this device".to_string())?;
    let master_pubkey = master.public_key_hex();
    let revoked_at = now_secs();

    let signing_bytes = RevocationEntry::signing_bytes(&master_pubkey, &pubkey, revoked_at);
    let signature = hex::encode(master.sign(&signing_bytes).to_bytes());

    let entry = RevocationEntry {
        master_pubkey: master_pubkey.clone(),
        subkey_pubkey: pubkey,
        revoked_at,
        signature,
    };
    entry
        .verify()
        .map_err(|e| format!("revocation self-verify: {e}"))?;

    let home_hubs = crate::home_hub::read_cached_designation()
        .map(|d| d.hubs)
        .unwrap_or_default();

    if home_hubs.is_empty() {
        return Err("No home hubs configured".to_string());
    }

    let client = http_client()?;
    let mut accepted = 0usize;
    let mut last_error = String::new();

    for hub_url in &home_hubs {
        let endpoint = format!(
            "{}/identity/{}/revocations",
            hub_url.trim_end_matches('/'),
            master_pubkey
        );
        match client.post(&endpoint).json(&entry).send().await {
            Ok(resp) if resp.status().is_success() => accepted += 1,
            Ok(resp) => {
                last_error = format!(
                    "{hub_url}: HTTP {} {}",
                    resp.status(),
                    resp.text().await.unwrap_or_default()
                );
            }
            Err(e) => last_error = format!("{hub_url}: {e}"),
        }
    }

    if accepted == 0 {
        return Err(format!(
            "No home hub accepted the revocation. Last error: {last_error}"
        ));
    }

    Ok(())
}

/// Issue a SubkeyCert for this device's subkey and register it on all home hubs.
/// Requires master identity (phrase) on this device.
#[tauri::command]
pub async fn subkey_issue() -> Result<(), String> {
    let master = load_master_identity()
        .map_err(|_| "subkey_issue requires master identity on this device".to_string())?;
    let master_pubkey = master.public_key_hex();

    let path = Identity::default_path().map_err(|e| e.to_string())?;
    let (identity, _) = Identity::load_or_create(&path).map_err(|e| e.to_string())?;
    let subkey_pubkey = identity.public_key_hex();

    let home_hubs = crate::home_hub::read_cached_designation()
        .map(|d| d.hubs)
        .unwrap_or_default();

    let device_label = "Primary device".to_string();
    let issued_at = now_secs();

    let signing_bytes = SubkeyCert::signing_bytes(
        &master_pubkey,
        &subkey_pubkey,
        &device_label,
        issued_at,
        None,
        &home_hubs,
    );
    let signature = hex::encode(master.sign(&signing_bytes).to_bytes());

    let cert = SubkeyCert {
        master_pubkey: master_pubkey.clone(),
        subkey_pubkey,
        device_label,
        issued_at,
        not_after: None,
        fallback_hubs: home_hubs.clone(),
        signature,
    };
    cert.verify()
        .map_err(|e| format!("cert self-verify: {e}"))?;

    if home_hubs.is_empty() {
        return Err("No home hubs configured".to_string());
    }

    let client = http_client()?;
    let mut accepted = 0usize;
    let mut last_error = String::new();

    for hub_url in &home_hubs {
        let endpoint = format!(
            "{}/identity/{}/devices",
            hub_url.trim_end_matches('/'),
            master_pubkey
        );
        match client.post(&endpoint).json(&cert).send().await {
            Ok(resp) if resp.status().is_success() => accepted += 1,
            Ok(resp) => {
                last_error = format!(
                    "{hub_url}: HTTP {} {}",
                    resp.status(),
                    resp.text().await.unwrap_or_default()
                );
            }
            Err(e) => last_error = format!("{hub_url}: {e}"),
        }
    }

    if accepted == 0 {
        return Err(format!(
            "No home hub accepted the cert. Last error: {last_error}"
        ));
    }

    Ok(())
}
