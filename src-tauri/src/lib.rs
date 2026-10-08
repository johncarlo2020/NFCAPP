mod nfc;

use std::sync::{Arc, Mutex};
use tauri::Manager;

#[tauri::command]
fn get_nfc_status(state: tauri::State<'_, nfc::SharedStatus>) -> Result<nfc::Status, String> {
    state
        .0
        .lock()
        .map(|status| status.clone())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let status = Arc::new(Mutex::new(nfc::Status::default()));
            app.manage(nfc::SharedStatus(status.clone()));
            nfc::start(app.handle().clone(), status);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_nfc_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
