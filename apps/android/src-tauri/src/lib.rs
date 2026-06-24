mod voice_cmd;
use voice_cmd::VoiceState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(VoiceState::new())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            voice_cmd::voice_join,
            voice_cmd::voice_set_reg_token,
            voice_cmd::voice_leave,
            voice_cmd::voice_set_muted,
            voice_cmd::voice_set_deafened,
            voice_cmd::list_audio_devices,
            voice_cmd::mic_test_start,
            voice_cmd::mic_test_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Voxply");
}
