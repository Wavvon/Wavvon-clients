use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);
// The loop wakes often and compares wall-clock time: a monotonic sleep does
// not advance while the machine sleeps, so a resume would otherwise push the
// next check back by up to six hours.
const POLL_EVERY: Duration = Duration::from_secs(15 * 60);
const PROGRESS_EVERY: Duration = Duration::from_millis(250);

#[derive(Clone, Copy, PartialEq, Eq, Debug, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Phase {
    Downloading,
    Ready,
    Failed,
    Installing,
}

#[derive(Clone, Debug, serde::Serialize)]
pub(crate) struct UpdateStatus {
    version: String,
    notes: Option<String>,
    phase: Phase,
    downloaded: u64,
    total: Option<u64>,
    error: Option<String>,
}

struct Pending {
    update: Update,
    // Kept in memory only, so a failed or abandoned update leaves nothing on disk.
    bytes: Option<Vec<u8>>,
    status: UpdateStatus,
}

#[derive(Default)]
pub(crate) struct UpdaterState(Mutex<Option<Pending>>);

impl UpdaterState {
    fn lock(&self) -> MutexGuard<'_, Option<Pending>> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Mutates the pending update's status and pushes the result to the UI.
fn set_status(app: &AppHandle, f: impl FnOnce(&mut Pending)) {
    let Some(state) = app.try_state::<UpdaterState>() else {
        return;
    };
    let status = {
        let mut lock = state.lock();
        let Some(pending) = lock.as_mut() else {
            return;
        };
        f(pending);
        pending.status.clone()
    };
    let _ = app.emit("update-status", status);
}

fn check_due(last: Option<SystemTime>, now: SystemTime) -> bool {
    match last {
        None => true,
        // A clock that went backwards counts as due: one extra check is harmless.
        Some(t) => now.duration_since(t).map_or(true, |d| d >= CHECK_EVERY),
    }
}

/// Checks at startup and every six hours for as long as the app runs.
pub(crate) async fn run_update_checks(app: AppHandle) {
    let mut last = None;
    loop {
        let now = SystemTime::now();
        if check_due(last, now) {
            last = Some(now);
            check_once(&app).await;
        }
        tokio::time::sleep(POLL_EVERY).await;
    }
}

async fn check_once(app: &AppHandle) {
    let Some(state) = app.try_state::<UpdaterState>() else {
        return;
    };
    // An update already downloading, ready or installing is not replaced; a
    // failed one is, which is what retries it on the next check.
    if state
        .lock()
        .as_ref()
        .is_some_and(|p| p.status.phase != Phase::Failed)
    {
        return;
    }

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            tracing::warn!("updater unavailable: {e}");
            return;
        }
    };
    let update = match updater.check().await {
        Ok(Some(u)) => u,
        Ok(None) => return,
        Err(e) => {
            tracing::warn!("update check failed: {e}");
            return;
        }
    };

    *state.lock() = Some(Pending {
        status: UpdateStatus {
            version: update.version.clone(),
            notes: update.body.clone(),
            phase: Phase::Downloading,
            downloaded: 0,
            total: None,
            error: None,
        },
        update,
        bytes: None,
    });
    download(app.clone()).await;
}

/// Downloads the pending update in the background. The app stays usable; the
/// banner follows the `update-status` events.
async fn download(app: AppHandle) {
    let mut update = None;
    set_status(&app, |p| {
        p.bytes = None;
        p.status.phase = Phase::Downloading;
        p.status.downloaded = 0;
        p.status.total = None;
        p.status.error = None;
        update = Some(p.update.clone());
    });
    let Some(update) = update else {
        return;
    };

    let mut downloaded = 0u64;
    let mut last_emit: Option<Instant> = None;
    let result = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                if last_emit.is_none_or(|t| t.elapsed() >= PROGRESS_EVERY) {
                    last_emit = Some(Instant::now());
                    set_status(&app, |p| {
                        p.status.downloaded = downloaded;
                        p.status.total = total;
                    });
                }
            },
            || {},
        )
        .await;

    match result {
        Ok(bytes) => set_status(&app, |p| {
            p.status.downloaded = bytes.len() as u64;
            p.status.total = Some(bytes.len() as u64);
            p.status.phase = Phase::Ready;
            p.bytes = Some(bytes);
        }),
        Err(e) => {
            tracing::warn!("update download failed: {e}");
            set_status(&app, |p| {
                p.status.phase = Phase::Failed;
                p.status.error = Some(e.to_string());
            });
        }
    }
}

#[tauri::command]
pub(crate) fn get_update_status(state: State<'_, UpdaterState>) -> Option<UpdateStatus> {
    state.lock().as_ref().map(|p| p.status.clone())
}

#[tauri::command]
pub(crate) fn retry_update_download(
    app: AppHandle,
    state: State<'_, UpdaterState>,
) -> Result<(), String> {
    let failed = state
        .lock()
        .as_ref()
        .is_some_and(|p| p.status.phase == Phase::Failed);
    if !failed {
        return Err("No failed update to retry".to_string());
    }
    tauri::async_runtime::spawn(download(app));
    Ok(())
}

/// Installs the downloaded update and restarts into it. On Windows the
/// installer closes the app and relaunches it itself; on macOS and Linux the
/// bundle is replaced in place and the app restarts here.
#[tauri::command]
pub(crate) async fn install_update(app: AppHandle) -> Result<(), String> {
    let mut job = None;
    set_status(&app, |p| {
        if p.status.phase == Phase::Ready {
            if let Some(bytes) = p.bytes.take() {
                job = Some((p.update.clone(), bytes));
                p.status.phase = Phase::Installing;
            }
        }
    });
    let (update, bytes) = job.ok_or_else(|| "No downloaded update to install".to_string())?;

    let result = tauri::async_runtime::spawn_blocking(move || update.install(bytes))
        .await
        .map_err(|e| e.to_string())
        .and_then(|r| r.map_err(|e| e.to_string()));
    match result {
        Ok(()) => app.restart(),
        Err(e) => {
            // The current version keeps running; the banner offers a retry,
            // which downloads afresh since the bytes may be what failed.
            set_status(&app, |p| {
                p.status.phase = Phase::Failed;
                p.status.error = Some(e.clone());
            });
            Err(e)
        }
    }
}

/// Installs a downloaded update when the app quits without the user having
/// chosen to restart, so the next launch is the new version.
pub(crate) fn install_on_quit(app: &AppHandle) {
    let Some(state) = app.try_state::<UpdaterState>() else {
        return;
    };
    let job = {
        let mut lock = state.lock();
        match lock.as_mut() {
            Some(p) if p.status.phase == Phase::Ready => {
                p.bytes.take().map(|b| (p.update.clone(), b))
            }
            _ => None,
        }
    };
    if let Some((update, bytes)) = job {
        // The user quit: the Windows installer must not relaunch the app.
        if let Err(e) = update.restart_after_install(false).install(bytes) {
            tracing::warn!("install on quit failed: {e}");
        }
    }
}

/// Update the tray tooltip to reflect current unread count.
#[tauri::command]
pub(crate) fn set_tray_unread(count: u32, app: AppHandle) -> Result<(), String> {
    let tray = app.tray_by_id("main").ok_or("tray missing")?;
    let label = if count == 0 {
        "Wavvon".to_string()
    } else if count > 99 {
        "Wavvon \u{2014} 99+ unread".to_string()
    } else {
        format!("Wavvon \u{2014} {count} unread")
    };
    tray.set_tooltip(Some(&label)).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_check_is_due_immediately() {
        assert!(check_due(None, SystemTime::now()));
    }

    #[test]
    fn check_waits_six_hours_of_wall_clock() {
        let t = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000_000);
        assert!(!check_due(Some(t), t + Duration::from_secs(60)));
        assert!(!check_due(
            Some(t),
            t + CHECK_EVERY - Duration::from_secs(1)
        ));
        assert!(check_due(Some(t), t + CHECK_EVERY));
        // A resume after a long sleep jumps the wall clock past the deadline.
        assert!(check_due(Some(t), t + Duration::from_secs(24 * 3600)));
    }

    #[test]
    fn clock_going_backwards_counts_as_due() {
        let t = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000_000);
        assert!(check_due(Some(t), t - Duration::from_secs(10)));
    }
}
