mod nfc;

use std::sync::{Arc, Mutex};
use tauri::Manager;

// server/.env as it was at build time (see build.rs)
const EMBEDDED_ENV: &str = include_str!(concat!(env!("OUT_DIR"), "/embedded.env"));

fn lookup_in(contents: &str, key: &str) -> Option<String> {
    for line in contents.lines() {
        if let Some((k, v)) = line.trim().split_once('=') {
            let v = v.trim().trim_matches('"').trim_matches('\'');
            if k.trim() == key && !v.is_empty() {
                return Some(v.to_string());
            }
        }
    }
    None
}

// Reads KEY from the process environment, then from a .env next to the executable or
// the working directory, and finally from the .env embedded at build time.
fn env_value(key: &str) -> Option<String> {
    if let Ok(value) = std::env::var(key) {
        if !value.trim().is_empty() {
            return Some(value.trim().to_string());
        }
    }

    let mut dirs: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            dirs.push(dir.to_path_buf());
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        dirs.push(cwd.clone());
        if let Some(parent) = cwd.parent() {
            dirs.push(parent.to_path_buf());
        }
    }

    for dir in dirs {
        for candidate in [dir.join(".env"), dir.join("server").join(".env")] {
            if let Ok(contents) = std::fs::read_to_string(&candidate) {
                if let Some(value) = lookup_in(&contents, key) {
                    return Some(value);
                }
            }
        }
    }
    lookup_in(EMBEDDED_ENV, key)
}

// Resolve the staff API address from native environment configuration.
#[tauri::command]
fn get_api_base_url() -> Result<String, String> {
    let configured_base = env_value("NFC_API_BASE_URL");
    let source = configured_base
        .clone()
        .or_else(|| env_value("USERS_API_URL"))
        .ok_or("NFC_API_BASE_URL is not set in .env")?;
    let mut url = reqwest::Url::parse(&source)
        .map_err(|_| "Invalid API URL in .env".to_string())?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Configure a valid HTTP or HTTPS API URL in .env".to_string());
    }
    // The legacy users setting is an endpoint; use its origin for staff API calls.
    if configured_base.is_none() {
        url.set_path("/");
    }
    Ok(url.as_str().trim_end_matches('/').to_string())
}

// Fetches users without an NFC code straight from USERS_API_URL (secret stays out of the webview)
#[tauri::command]
async fn get_users() -> Result<serde_json::Value, String> {
    let url = env_value("USERS_API_URL").ok_or("USERS_API_URL is not set in .env")?;
    let secret = env_value("API_SECRET").unwrap_or_default();

    let response = reqwest::Client::new()
        .get(&url)
        .header("X-API-Secret", secret)
        .header("Accept", "application/json")
        .header("User-Agent", "Mozilla/5.0 RFIDScanner/0.1")
        .send()
        .await
        .map_err(|e| format!("Failed to reach users API: {:?}", e))?;

    if !response.status().is_success() {
        return Err(format!("Users API returned HTTP {}", response.status().as_u16()));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Invalid users API response: {}", e))?;

    let list = match &body {
        serde_json::Value::Array(_) => body.clone(),
        _ => body
            .get("data")
            .or_else(|| body.get("users"))
            .cloned()
            .unwrap_or_else(|| serde_json::Value::Array(vec![])),
    };
    Ok(list)
}

// Triggers a Pusher event via its REST API (signed with the app secret, which stays in Rust)
async fn pusher_trigger(event_env: &str, default_event: &str, payload: serde_json::Value) -> Result<(), String> {
    use hmac::{Hmac, KeyInit, Mac};
    use md5::{Digest, Md5};
    use sha2::Sha256;

    let app_id = env_value("PUSHER_APP_ID");
    let key = env_value("PUSHER_KEY");
    let secret = env_value("PUSHER_SECRET");
    let (Some(app_id), Some(key), Some(secret)) = (app_id, key, secret) else {
        return Err("Pusher is not configured. Set PUSHER_APP_ID, PUSHER_KEY and PUSHER_SECRET in .env".to_string());
    };
    let cluster = env_value("PUSHER_CLUSTER").unwrap_or_else(|| "mt1".to_string());
    let channel = env_value("PUSHER_CHANNEL").unwrap_or_else(|| "nfc".to_string());
    let event = env_value(event_env).unwrap_or_else(|| default_event.to_string());

    let body = serde_json::json!({
        "name": event,
        "channel": channel,
        "data": payload.to_string(),
    })
    .to_string();

    let body_md5 = hex::encode(Md5::digest(body.as_bytes()));
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let path = format!("/apps/{}/events", app_id);
    let query = format!(
        "auth_key={}&auth_timestamp={}&auth_version=1.0&body_md5={}",
        key, timestamp, body_md5
    );

    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).map_err(|e| e.to_string())?;
    mac.update(format!("POST\n{}\n{}", path, query).as_bytes());
    let signature = hex::encode(mac.finalize().into_bytes());

    let url = format!(
        "https://api-{}.pusher.com{}?{}&auth_signature={}",
        cluster, path, query, signature
    );
    let response = reqwest::Client::new()
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach Pusher: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        Err(format!("Pusher returned HTTP {}: {}", status, text))
    }
}

#[tauri::command]
async fn assign_nfc(nfc_code: String, user_id: serde_json::Value) -> Result<(), String> {
    if nfc_code.is_empty() {
        return Err("nfcCode is required".to_string());
    }
    pusher_trigger(
        "PUSHER_REGISTRATION_EVENT",
        "nfc-registration",
        serde_json::json!({ "nfc_code": nfc_code, "user_id": user_id }),
    )
    .await
}

#[tauri::command]
async fn station_scan(nfc_code: String, station_id: u32) -> Result<(), String> {
    if nfc_code.is_empty() {
        return Err("nfcCode is required".to_string());
    }
    pusher_trigger(
        "PUSHER_STATION_EVENT",
        "nfc-station",
        serde_json::json!({ "nfc_code": nfc_code, "station_id": station_id }),
    )
    .await
}

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
        .invoke_handler(tauri::generate_handler![get_api_base_url, get_nfc_status, get_users, assign_nfc, station_scan])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
