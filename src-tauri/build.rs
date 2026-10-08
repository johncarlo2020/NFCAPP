use std::{env, fs, path::PathBuf};

fn main() {
    // Embed server/.env into the binary so a built app still has its config when it
    // is run from a folder that has no .env next to it.
    let source = PathBuf::from("../server/.env");
    let out = PathBuf::from(env::var("OUT_DIR").unwrap()).join("embedded.env");
    let contents = fs::read_to_string(&source).unwrap_or_default();
    fs::write(out, contents).unwrap();
    println!("cargo:rerun-if-changed=../server/.env");

    tauri_build::build()
}
