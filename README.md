# RFID Scanner — ACR122U

Desktop NFC reader app built with Tauri, Rust, and vanilla JavaScript. Reader
communication runs inside the app through the operating system's PC/SC interface.
**Deployment target: Windows with an ACR122U USB reader.** macOS is the current
development machine; Windows hardware testing is still pending.
No Node.js server or Pusher credentials are needed for **Device test**.

For a Windows computer running the packaged app:

1. Manually download **MSI Installer for PC/SC Driver — Windows** from the
   [ACS driver page](https://www.acs.com.hk/en/driver/3/acr122u-usb-nfc-reader/),
   extract the archive, and run its installer for your computer's architecture.
2. Connect the ACR122U and check **Device Manager → Smart card readers** for the
   reader and any driver errors.
3. Ensure the Windows **Smart Card** service is available. If needed, use the
   administrator PowerShell command below from this source checkout.
4. Install/open the packaged RFID Scanner app, select **Device test**, and tap a
   card to verify UID and ATR.

The Windows app needs the WebView2 runtime. End users do not need Node.js, Rust,
Python, or Visual Studio Build Tools for native scanning. Registration/station
reporting still depends on the legacy API described below.

## Install the reader driver

The reader driver and PC/SC service are operating-system components. They are
installed separately from the app, with administrator privileges where required.
Our scripts install prerequisites; use **Device test** afterward to verify an
actual card read. A completed installer alone does not confirm device detection.

Official source: [ACS ACR122U drivers](https://www.acs.com.hk/en/driver/3/acr122u-usb-nfc-reader/).
ACS currently lists macOS driver **1.1.11.1**, Windows driver **4.2.8.0**, and
Linux driver **1.1.11**. Downloads and supported systems can change; check that
page for compatibility with your OS and processor.

### Windows

Connect the reader and open **PowerShell as Administrator**:

```powershell
powershell -NoProfile -File .\scripts\install-reader-driver.ps1
```

This enables demand-start and starts the Windows **Smart Card** service
(`SCardSvr`). It does not download a driver or assert that one is already installed.
If Windows does not detect the reader, download **PC/SC Drivers — Windows** from
ACS, extract the archive, and install its INF packages:

```powershell
powershell -NoProfile -File .\scripts\install-reader-driver.ps1 -DriverPath "C:\Downloads\ACS-drivers"
```

Supply only the extracted driver folder appropriate for your machine's
architecture. The script uses Microsoft's
[PnPUtil](https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/pnputil-examples)
and reports installation errors or reboot requests. Alternatively, run ACS's
**MSI Installer for PC/SC Driver** manually. If PowerShell execution is restricted
by your organization, use the approved installation process.

### macOS

Download **PC/SC Driver Installer — macOS** from the
[official ACS driver page](https://www.acs.com.hk/en/driver/3/acr122u-usb-nfc-reader/)
and extract the archive. Double-click its `.pkg` or `.mpkg` installer and follow
the ACS instructions. Alternatively, install the manually downloaded package
from the project directory:

```bash
bash scripts/install-reader-driver.sh --package "$HOME/Downloads/path/to/ACS.pkg"
```

Use the actual filename from the archive. The script uses Apple's `installer`
tool through `sudo`; it does not download the driver. If the archive contains no
package installer, follow the included ACS instructions instead.

macOS already provides the PC/SC framework used by this app. Installing Homebrew
`pcsc-lite` is not a substitute for the ACS reader driver. Reconnect the reader
after installation and reboot if the installer requests it. If macOS prompts to
allow the USB accessory, allow the reader to connect.

After manual installation, run `npm install` and `npm run dev`, then select
**Device test**. To use full setup with a downloaded package, run
`bash setup.sh --package /path/to/ACS.pkg`.

### Linux

```bash
bash scripts/install-reader-driver.sh
```

The script installs the ACS CCID driver, PC/SC libraries, and diagnostic tools
using the detected package manager, then enables `pcscd.socket` on systemd systems.
It supports these package sets:

| Distribution | Packages |
| --- | --- |
| Debian / Ubuntu | `pcscd`, `libpcsclite-dev`, `libacsccid1`, `pcsc-tools` |
| Fedora | `pcsc-lite`, `pcsc-lite-devel`, `pcsc-lite-acsccid`, `pcsc-tools` |
| Arch | `pcsclite`, `acsccid`, `pcsc-tools` |

Package references: [Ubuntu](https://packages.ubuntu.com/libacsccid1),
[Fedora](https://packages.fedoraproject.org/pkgs/pcsc-lite-acsccid/pcsc-lite-acsccid/),
[Arch](https://archlinux.org/packages/extra/x86_64/acsccid/).
Other distributions or systems without systemd require manual service setup.
Missing packages or service failures stop the script with an error.

## Build and test the app on Windows

Source development requires Node.js/npm, Rust/Cargo, and the
[Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.
Windows Rust builds need the MSVC toolchain; macOS builds need Xcode Command Line
Tools. Driver installation does not install these development tools.

| Use case | Python 3 | Visual Studio C++ Build Tools |
| --- | --- | --- |
| Build the native Tauri app on Windows | No | Yes, Desktop development with C++ workload and Windows SDK |
| Build the native Tauri app on macOS | No | No; use Xcode Command Line Tools |
| Run the packaged native app / install its reader driver | No | No |
| Compile the legacy server's `nfc-pcsc` native module on Windows | Yes | Yes |

Windows development also requires the WebView2 runtime and Rust's MSVC toolchain.
Python is required by the legacy server's `node-gyp` build, not the native reader
implementation. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
and [node-gyp requirements](https://github.com/nodejs/node-gyp#on-windows).

From Command Prompt in the project directory:

```cmd
setup.bat
npm run dev
```

Build a Windows installer on a Windows development machine with `npm run build`.
Find the installer under `src-tauri\target\release\bundle\`. The current
macOS build checks do not validate a Windows executable.

On Linux, `bash setup.sh` installs reader prerequisites followed by app npm
dependencies. On macOS, provide `--package /path/to/ACS.pkg`, or install the
driver manually and run `npm install` separately. On Windows,
`setup.bat` installs app dependencies and prints the administrator PowerShell
command for driver setup. Neither installs legacy server dependencies.

1. Connect the ACR122U reader.
2. Select **Device test** and choose the reader.
3. Tap a compatible NFC card; verify UID and ATR appear.
4. Remove and retap the card; verify another scan is recorded.
5. Disconnect and reconnect the USB reader; verify connection status updates.

The app reads identifiers only and does not write to cards. UIDs are uppercase
hexadecimal without separators. The current UI's `NFC` and `PC/SC` labels are
generic; card-family identification is not implemented. History keeps the most
recent 20 entries in localStorage.

To check PC/SC detection without opening the window:

```bash
cargo run --manifest-path src-tauri/Cargo.toml --example reader_probe
# After Cargo dependencies are available, the script can run the probe offline:
bash scripts/install-reader-driver.sh --check
```

Windows equivalent:

```powershell
powershell -NoProfile -File .\scripts\install-reader-driver.ps1 -Check
```

The check mode does not install drivers or change services. It requires Rust and
previously downloaded Cargo dependencies. The probe distinguishes a service
failure from an available service with no connected readers; it does not read a
card. Use **Device test** for the full card-read check.

## Troubleshooting detection

- **PC/SC service unavailable:** connect the reader, install its driver, and rerun
  the probe. On Windows, run the administrator service script. On Linux, check
  `systemctl status pcscd.socket`. On macOS, use the ACS installer instructions;
  do not launch a separate Homebrew daemon for this app.
- **Service available, no readers:** reconnect the reader, check the USB cable or
  adapter, allow USB accessory access if prompted, and verify the OS sees it.
- **Reader visible, UID fails:** remove and retap a compatible card. Close other
  NFC utilities that might hold the reader. The status displays the reader error.

The development machine's probe reported **Smart card resource manager is not
running** before driver setup. Physical scanning and driver installation on
Windows/Linux have not yet been verified.

## Registration and station reporting (legacy API)

The app includes Registration 1–2 and Station 1–4. Both now receive scans from
Rust, but fetching users and reporting events still use `http://localhost:3001`.
The app does not automatically launch the Node.js server.

For these workflows only, install server dependencies and run it separately:

```bash
cd server
npm install
npm start
```

Copy `server/.env.example` to `server/.env` and configure `PUSHER_APP_ID`,
`PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`, `USERS_API_URL`, and `API_SECRET`.
The legacy server uses `fetch` and `process.loadEnvFile`, so use a Node.js release
that supports both APIs. The users proxy sends the secret in `X-API-Secret`.

Registration: select **Assign** for a user, then tap the card. The API publishes
`nfc-registration` with `{ nfc_code, user_id }`. Station scans publish
`nfc-station` with `{ nfc_code, station_id }`. Success currently confirms Pusher
accepted the event, not that the receiving system saved the operation.

The legacy server still initializes its own NFC worker; avoid concurrent reader
access while testing. Its API has unrestricted CORS, no authentication, and no
explicit loopback binding. It sends scan/user identifiers to external services;
credentials stay on the server. Moving these integrations into Rust is pending.

## Project files

- `src/`: desktop interface and scan history.
- `src-tauri/src/nfc.rs`: native reader monitoring and UID command.
- `src-tauri/examples/reader_probe.rs`: PC/SC reader diagnostic.
- `scripts/install-reader-driver.sh`: macOS/Linux installation and checks.
- `scripts/install-reader-driver.ps1`: Windows driver/service setup and checks.
- `server/`: legacy users/Pusher API and NFC worker.

Run `npm run build` to build the desktop app. Reader communication is compiled
into it; target computers still need their OS reader driver and PC/SC service.
