// Hardware diagnostic without opening the desktop window.
fn main() {
    let context = match pcsc::Context::establish(pcsc::Scope::User) {
        Ok(context) => context,
        Err(error) => {
            eprintln!("PC/SC service unavailable: {error}");
            std::process::exit(1);
        }
    };
    match context.list_readers_owned() {
        Ok(readers) if !readers.is_empty() => {
            for reader in readers {
                println!("Reader: {}", reader.to_string_lossy());
            }
        }
        Ok(_) | Err(pcsc::Error::NoReadersAvailable) => {
            println!("PC/SC is available; no readers detected. Connect the ACR122U.")
        }
        Err(error) => {
            eprintln!("Cannot enumerate readers: {error}");
            std::process::exit(1);
        }
    }
}
