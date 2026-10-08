# 🚀 Quick Start Guide

Get your RFID Scanner up and running in 5 minutes!

## Step 1: Check Requirements ✅

Before starting, make sure you have:

- [ ] **Node.js installed** (v16+)
  - Test: Open terminal and run `node --version`
  - If not installed: [Download Node.js](https://nodejs.org/)

- [ ] **Rust installed** (for Tauri)
  - Test: Run `rustc --version`
  - If not installed: [Install Rust](https://rustup.rs/)

- [ ] **ACR122 RFID Reader** connected via USB

- [ ] **Windows only: Python 3 and Visual Studio Build Tools**
  - The server's `nfc-pcsc` dependency compiles a native module using `node-gyp`.
  - Install Python 3 and Visual Studio Build Tools with the **Desktop development with C++** workload before running setup.

## Step 2: Run Setup 🔧

### Windows

Open Command Prompt or PowerShell in the project folder:

```cmd
setup.bat
```

### macOS / Linux

Open Terminal in the project folder:

```bash
chmod +x setup.sh
./setup.sh
```

Wait for the setup to complete (2-5 minutes).

## Step 3: Install RFID Driver (Windows Only) 🪟

If you're on Windows, download and install the ACR122U driver:

👉 [Download ACR122U Driver](https://www.acs.com.hk/en/driver/3/acr122u-usb-nfc-reader/)

## Step 4: Start the App 🎯

```bash
npm run dev
```

This will:
1. ✅ Start the Node.js RFID server
2. ✅ Launch the Tauri desktop app
3. ✅ Open the scanning interface

## Step 5: Scan Your First Card 📱

1. The app window will open
2. You should see "Reader connected" status (green dot)
3. Place an RFID card on the ACR122 reader
4. Watch the card information appear on screen!

## Common Issues & Quick Fixes 🔧

### "Server offline" message

**Fix:** Make sure port 3001 is not in use:
```bash
# Test if server is accessible
curl http://localhost:3001/health
```

### "Waiting for reader..." message

**Fix:**
1. Unplug and replug the ACR122 reader
2. On Linux, check pcscd service:
   ```bash
   sudo systemctl start pcscd
   ```
3. On Windows, ensure driver is installed

### Dependency install errors on Windows

The `nfc-pcsc` dependency includes a native module that `node-gyp` must compile. Install Python 3 and Visual Studio Build Tools with the **Desktop development with C++** workload, then reopen the terminal and run `setup.bat` again. The deprecated `windows-build-tools` npm package is not required.

## What's Next? 📚

- ✅ Scan multiple cards and see history
- ✅ Click "Clear History" to reset
- ✅ Card data is automatically saved locally

### Build Production Version

When ready to create a standalone app:

```bash
npm run tauri build
```

Find your app in `src-tauri/target/release/bundle/`

## Need More Help? 💡

Check these files:
- **README.md** - Detailed documentation
- **DEVELOPMENT.md** - Developer guide
- **Troubleshooting** - Full troubleshooting guide in README

## Architecture Overview 🏗️

```
Tauri App (Desktop) 
    ↓ auto-starts
Node.js Server (Port 3001)
    ↓ connects to
ACR122 RFID Reader (USB)
```

The app automatically manages everything for you!

---

**That's it!** You're ready to scan RFID cards. Enjoy! 🎉
