# Quick start — Windows native reader test

The deployment target is **Windows with an ACR122U USB NFC reader**.

## Run the packaged app

1. Manually download the Windows **MSI Installer for PC/SC Driver** from the
   [ACS driver page](https://www.acs.com.hk/en/driver/3/acr122u-usb-nfc-reader/),
   extract it, and run the appropriate installer.
2. Connect the reader; check Windows Device Manager for driver errors.
3. Install/open RFID Scanner, with the WebView2 runtime available.
4. Select **Device test** and tap a card.

Python, Visual Studio Build Tools, Rust, and Node.js are not required on a
computer that only runs the packaged app's native scanning workflow.

## Develop or build on Windows

Install Node.js/npm, Rust's MSVC toolchain, Visual Studio Build Tools with the
**Desktop development with C++** workload and Windows SDK, and WebView2. See
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#windows).
**Python is not required for the native app.**

From Command Prompt in the project folder:

```cmd
setup.bat
npm run dev
```

If the Smart Card service needs setup, open PowerShell as Administrator and run:

```powershell
powershell -NoProfile -File .\scripts\install-reader-driver.ps1
```

For manually downloaded and extracted INF drivers, supply
`-DriverPath "C:\Downloads\ACS-drivers"`. See [README.md](README.md#install-the-reader-driver).

Connect the ACR122U, select **Device test**, choose your reader, and tap a card.
Verify UID and ATR appear, then remove and retap the card.

To check reader detection without opening the window:

```bash
cargo run --manifest-path src-tauri/Cargo.toml --example reader_probe
```

To build the Windows app, run on a Windows development machine:

```bash
npm run build
```

A computer running the packaged app needs the reader driver, PC/SC service, and
platform runtime dependencies; it does not need Python or Visual Studio Build Tools.

Registration and station reporting still use the separate legacy API. Installing
that server's `nfc-pcsc` native dependency requires Python and a C/C++ build toolchain
through [node-gyp](https://github.com/nodejs/node-gyp#installation). On Windows, this
means Python 3 plus Visual Studio C++ Build Tools. This requirement applies when
building the server dependency, not to the native Device test workflow.

See [README.md](README.md) for setup scripts and troubleshooting. The older
[DEVELOPMENT.md](DEVELOPMENT.md) describes the legacy server architecture.

Windows reader/card testing is pending; compilation checks so far ran on macOS.
