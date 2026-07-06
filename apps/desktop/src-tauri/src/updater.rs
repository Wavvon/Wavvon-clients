use crate::state::PendingUpdate;
use tauri::{AppHandle, Emitter, Manager, State};

/// Background update check — fires once at startup, best-effort.
/// Emits `update-available` and stores the update for user-triggered install.
pub(crate) async fn check_for_updates(app: AppHandle) {
    use tauri_plugin_updater::UpdaterExt;

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

    #[derive(Clone, serde::Serialize)]
    struct UpdatePayload {
        version: String,
        notes: Option<String>,
    }

    let _ = app.emit(
        "update-available",
        UpdatePayload {
            version: update.version.clone(),
            notes: update.body.clone(),
        },
    );

    if let Some(state) = app.try_state::<PendingUpdate>() {
        if let Ok(mut lock) = state.0.lock() {
            *lock = Some(update);
        }
    }
}

/// Download and install the pending update. Triggers app restart on completion.
#[tauri::command]
pub(crate) async fn install_pending_update(
    pending: State<'_, PendingUpdate>,
) -> Result<(), String> {
    let update = {
        let mut lock = pending.0.lock().map_err(|e| e.to_string())?;
        lock.take()
    };
    if let Some(update) = update {
        update
            .download_and_install(|_, _| {}, || {})
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
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
