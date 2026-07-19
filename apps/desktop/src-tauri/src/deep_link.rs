// ponytail: no wavvon:// OS scheme registration exists yet (no tauri-plugin-deep-link,
// no installer/registry/Info.plist/desktop-file entry), so there is never a real pending
// link to hand back. This stub just satisfies the command the frontend calls on startup
// so it doesn't throw an unhandled rejection. Wire real capture here once the URL scheme
// is registered end to end.
#[tauri::command]
pub fn get_pending_deep_link() -> Result<Option<String>, String> {
    Ok(None)
}
