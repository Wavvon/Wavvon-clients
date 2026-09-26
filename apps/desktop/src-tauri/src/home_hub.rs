use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::identity::{HomeHubList, Identity, MasterIdentity};

fn home_hub_list_path() -> Result<PathBuf, String> {
    crate::accounts::active_home_hub_list_path()
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn load_master() -> Result<MasterIdentity, String> {
    let path = Identity::default_path().map_err(|e| e.to_string())?;
    let identity = Identity::load(&path).map_err(|e| e.to_string())?;
    identity.master().map_err(|e| e.to_string())
}

pub(crate) fn read_cached_designation() -> Option<HomeHubList> {
    let path = home_hub_list_path().ok()?;
    if !path.exists() {
        return None;
    }
    let text = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_cached_designation(designation: &HomeHubList) -> Result<(), String> {
    let path = home_hub_list_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let text = serde_json::to_string_pretty(designation).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("write: {e}"))
}

/// Build a new master-signed HomeHubList for the given URLs. Sequence
/// is the cached sequence + 1, or 1 if there is no cached designation.
pub fn build_designation(urls: Vec<String>) -> Result<HomeHubList, String> {
    let master = load_master()?;
    let master_pubkey = master.public_key_hex();

    let next_sequence = read_cached_designation()
        .map(|d| d.sequence.saturating_add(1))
        .unwrap_or(1);

    let issued_at = now_secs();
    let bytes = HomeHubList::signing_bytes(&master_pubkey, &urls, issued_at, next_sequence);
    let signature = hex::encode(master.sign(&bytes).to_bytes());

    let designation = HomeHubList {
        master_pubkey,
        hubs: urls,
        issued_at,
        sequence: next_sequence,
        signature,
    };

    // Sanity check: the bytes we signed and the bytes verify() will check
    // must agree. If this ever fails we have a serializer mismatch.
    designation
        .verify()
        .map_err(|e| format!("self-verify failed: {e}"))?;

    Ok(designation)
}

/// POST a designation to every URL in its list. Succeeds if at least
/// one hub accepts (200). Returns the count of successful posts and a
/// vec of (url, error) for the ones that failed.
pub async fn publish_designation(
    designation: &HomeHubList,
    client: &reqwest::Client,
) -> (usize, Vec<(String, String)>) {
    let mut ok_count = 0;
    let mut errors = Vec::new();

    for url in &designation.hubs {
        let endpoint = format!(
            "{}/identity/{}/designation",
            url.trim_end_matches('/'),
            designation.master_pubkey
        );
        match client.post(&endpoint).json(designation).send().await {
            Ok(resp) if resp.status().is_success() => ok_count += 1,
            Ok(resp) => {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                errors.push((url.clone(), format!("HTTP {status}: {body}")));
            }
            Err(e) => errors.push((url.clone(), e.to_string())),
        }
    }

    (ok_count, errors)
}

#[derive(serde::Serialize)]
pub struct SetHomeHubListResult {
    pub designation: HomeHubList,
    pub posted_count: usize,
    pub failures: Vec<HomeHubFailure>,
}

#[derive(serde::Serialize)]
pub struct HomeHubFailure {
    pub url: String,
    pub error: String,
}

/// Sign a new HomeHubList for the given URLs and POST it to each. The
/// cached designation is updated only if at least one hub accepted.
#[tauri::command]
pub async fn set_home_hub_list(urls: Vec<String>) -> Result<SetHomeHubListResult, String> {
    if urls.is_empty() {
        return Err("Home hub list must contain at least one URL".to_string());
    }

    let designation = build_designation(urls)?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client: {e}"))?;
    let (posted_count, failures) = publish_designation(&designation, &client).await;

    if posted_count == 0 {
        return Err(format!(
            "No home hub accepted the designation. Failures: {:?}",
            failures
        ));
    }

    write_cached_designation(&designation)?;

    Ok(SetHomeHubListResult {
        designation,
        posted_count,
        failures: failures
            .into_iter()
            .map(|(url, error)| HomeHubFailure { url, error })
            .collect(),
    })
}

/// Read the locally-cached home hub designation. Returns None if no
/// designation has been written yet on this device.
#[tauri::command]
pub fn get_home_hub_list() -> Option<HomeHubList> {
    read_cached_designation()
}

/// The first hub an identity signs in to becomes its home hub.
///
/// Personal-axis state — the prefs blob, the DM inbox — needs a published list
/// to live in, and a list only ever created by hand in the Home Hubs screen
/// stays empty for almost everyone. Then no hub can resolve where to deliver a
/// DM, and fan-out and mirroring skip the identity in silence.
///
/// Only for an identity that has **no list at all**. A paired device is
/// skipped (a subkey cannot sign a `HomeHubList`), and so is a device that
/// already holds one locally — joining a hub that has not seen your list yet
/// is not a reason to replace it.
///
/// That second guard is load-bearing, not defensive. `set_home_hub_list` signs
/// with `cached sequence + 1`, and consumers take the highest sequence, so
/// publishing a single-hub list from here would *win* against the user's real
/// one everywhere — turning "I joined another hub" into "my home hub list was
/// silently reset to that hub". The hub answering 404 means only that this hub
/// has not seen the designation; it says nothing about whether one exists.
///
/// Best-effort by design — a hub too old to serve designations, or simply
/// unreachable, must not fail a join.
pub(crate) async fn ensure_designation(hub_url: &str, client: &reqwest::Client) {
    if crate::pairing::get_paired_identity().is_some() {
        return;
    }
    if read_cached_designation().is_some() {
        return;
    }
    let Ok(master) = load_master() else { return };
    let hub_url = hub_url.trim_end_matches('/').to_string();

    let endpoint = format!(
        "{}/identity/{}/designation",
        hub_url,
        master.public_key_hex()
    );
    match client.get(&endpoint).send().await {
        // Anything the hub answers with other than "nothing here" means we
        // must not write: a 200 is the user's existing list, and a 5xx or a
        // transport error is a hub we cannot conclude anything about.
        Ok(resp) if resp.status() == reqwest::StatusCode::NOT_FOUND => {}
        _ => return,
    }

    let _ = set_home_hub_list(vec![hub_url]).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Designation we just signed must verify. If this breaks, the
    /// signing-bytes encoding has drifted from wavvon-identity.
    #[test]
    fn build_designation_self_verifies_when_identity_exists() {
        // Skipped at runtime if no identity file exists in the test env;
        // CI usually starts with no ~/.wavvon/identity.json.
        if Identity::default_path()
            .ok()
            .filter(|p| p.exists())
            .is_none()
        {
            return;
        }
        let urls = vec![
            "https://a.example".to_string(),
            "https://b.example".to_string(),
        ];
        let designation = build_designation(urls).expect("build");
        assert!(designation.verify().is_ok());
    }
}
