use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::Manager;

// Store the server process handle
struct ServerProcess(Mutex<Option<Child>>);

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_server_status() -> Result<String, String> {
    Ok("Server running on http://localhost:3001".to_string())
}

fn start_node_server() -> Result<Child, std::io::Error> {
    println!("Starting Node.js RFID server...");
    
    // Get the path to the server directory (relative to project root)
    let mut server_path = std::env::current_dir()?;
    
    // If we're in src-tauri directory, go up one level
    if server_path.ends_with("src-tauri") {
        server_path.pop();
    }
    
    server_path.push("server");
    println!("Server path: {:?}", server_path);

    // Start the Node.js server
    let child = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(&["/C", "npm", "start"])
            .current_dir(&server_path)
            .spawn()?
    } else {
        Command::new("npm")
            .arg("start")
            .current_dir(&server_path)
            .spawn()?
    };

    println!("Node.js server started with PID: {}", child.id());
    Ok(child)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Start the Node.js server when the app starts
            match start_node_server() {
                Ok(child) => {
                    println!("✅ Server started successfully");
                    app.manage(ServerProcess(Mutex::new(Some(child))));
                }
                Err(e) => {
                    eprintln!("❌ Failed to start server: {}", e);
                    eprintln!("Make sure Node.js is installed and server dependencies are installed.");
                    eprintln!("Run 'npm install' in the server directory.");
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Kill the server process when the window is closed
                if let Ok(mut server_process) = window.state::<ServerProcess>().0.lock() {
                    if let Some(child) = server_process.as_mut() {
                        let _ = child.kill();
                        println!("Server process terminated");
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![greet, get_server_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


