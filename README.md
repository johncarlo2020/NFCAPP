# 🔖 RFID Scanner - ACR122 Desktop App

A powerful desktop application built with Tauri for scanning RFID/NFC cards using the ACR122 reader. The app features a modern web interface with real-time card detection and automatic server management.

## ✨ Features

- 🚀 **Auto-Start Server**: Node.js RFID server automatically launches with the app
- 📱 **Real-Time Scanning**: Live card detection with Server-Sent Events (SSE)
- 🎨 **Modern UI**: Beautiful, responsive interface with dark theme
- 📊 **Scan History**: Automatic tracking of scanned cards with localStorage persistence
- 🔌 **Hot Plug Support**: Automatically detects when reader is connected/disconnected
- 💾 **Card Information**: Displays UID, ATR, card type, and standard information
- 🖥️ **Cross-Platform**: Works on Windows, macOS, and Linux

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

1. **Node.js** (v16 or higher)
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify installation: `node --version`

2. **Rust** (for Tauri)
   - Install from [rustup.rs](https://rustup.rs/)
   - Verify installation: `rustc --version`

3. **ACR122 RFID Reader**
   - Connect via USB before running the app

### Platform-Specific Requirements

#### Windows

- **Python 3** and **Visual Studio Build Tools** with the **Desktop development with C++** workload (required to compile the `nfc-pcsc` native module)

- **ACR122U Driver**
  - Download from [ACS Driver Page](https://www.acs.com.hk/en/driver/3/acr122u-usb-nfc-reader/)
  - Install before first use

#### macOS

- **Xcode Command Line Tools**
  ```bash
  xcode-select --install
  ```

- **PC/SC Lite** (via Homebrew)
  ```bash
  brew install pcsc-lite
  ```

#### Linux

- **PC/SC Daemon**
  ```bash
  # Ubuntu/Debian
  sudo apt-get install pcscd libpcsclite-dev
  sudo systemctl start pcscd
  sudo systemctl enable pcscd

  # Fedora/RHEL
  sudo dnf install pcsc-lite pcsc-lite-devel
  
  # Arch Linux
  sudo pacman -S pcsclite
  ```

## 🚀 Quick Start

### Automated Setup (Recommended)

#### Windows
```bash
setup.bat
```

#### macOS/Linux
```bash
chmod +x setup.sh
./setup.sh
```

The setup script will:
1. Check Node.js installation
2. Install Tauri app dependencies
3. Install RFID prerequisites
4. Install server dependencies

### Manual Setup

1. **Install Tauri dependencies**
   ```bash
   npm install
   ```

2. **Run the prerequisites installer** (installs platform prerequisites before server dependencies)
   ```bash
   cd server
   npm run install-prerequisites
   cd ..
   ```

## 🎛️ Scan Modes & Pusher

On launch, choose a scan type: **Registration 1–2** or **Station 1–4**, then pick which connected reader this screen uses.

- **Registration**: select a user, scan a card, press *Assign to user*. Pusher event `nfc-registration` is sent with `{ nfc_code, user_id }`.
- **Station**: every scan is sent automatically as `nfc-station` with `{ nfc_code, station_id }`.

Copy `server/.env.example` to `server/.env` and fill in the `PUSHER_*` credentials (events go to channel `nfc` by default). Set `USERS_API_URL` and `API_SECRET` there too; the server fetches the user list (sending `X-API-Secret`) so the secret never reaches the frontend.

## 🎮 Usage

### Development Mode

Start the app in development mode with hot reload:

```bash
npm run dev
# or
npm run tauri dev
```

The app will:
1. Automatically start the Node.js RFID server on port 3001
2. Open the Tauri window with the web interface
3. Wait for ACR122 reader connection

### Running Server Separately (Optional)

If you want to run the server independently:

```bash
npm run server
```

### Building for Production

Create a production build:

```bash
npm run build
# or
npm run tauri build
```

The built application will be in `src-tauri/target/release/`.

## 📁 Project Structure

```
rfid-scanner/
├── src/                    # Web interface (HTML, CSS, JS)
│   ├── index.html         # Main UI
│   ├── main.js            # Frontend logic
│   └── styles.css         # Styles
├── server/                # Node.js RFID server
│   ├── server.js          # Express server with NFC handling
│   ├── install-prerequisites.js
│   └── package.json
├── src-tauri/             # Tauri backend (Rust)
│   ├── src/
│   │   ├── main.rs
│   │   └── lib.rs         # Auto-start server logic
│   ├── tauri.conf.json    # Tauri configuration
│   └── Cargo.toml
├── setup.bat              # Windows setup script
├── setup.sh               # macOS/Linux setup script
└── package.json
```

## 🔧 How It Works

### Architecture

1. **Tauri App (Rust)**: Desktop application shell
   - Launches Node.js server on startup
   - Manages server process lifecycle
   - Displays web interface

2. **Node.js Server**: RFID communication layer
   - Uses `nfc-pcsc` library for ACR122 communication
   - Exposes REST API and SSE endpoints
   - Runs on `http://localhost:3001`

3. **Web Interface**: User interaction layer
   - Connects to server via EventSource (SSE)
   - Displays real-time card information
   - Stores scan history in localStorage

### API Endpoints

- `GET /api/status` - Get reader and server status
- `GET /api/last-scan` - Get last scanned card data
- `GET /api/events` - Server-Sent Events stream for real-time updates
- `GET /health` - Health check endpoint

### Event Types

The server sends real-time events:
- `connected` - Client connected to server
- `reader_connected` - ACR122 reader detected
- `reader_disconnected` - ACR122 reader removed
- `card_detected` - RFID card scanned
- `card_removed` - Card removed from reader
- `error` - Error occurred

## 🛠️ Troubleshooting

### Server Won't Start

**Issue**: "Failed to start server" error

**Solutions**:
1. Ensure Node.js is installed: `node --version`
2. Install server dependencies: `cd server && npm install`
3. Check if port 3001 is available
4. Run server manually to see errors: `cd server && npm start`

### Reader Not Detected

**Issue**: "Waiting for reader..." message persists

**Solutions**:
1. **Windows**: Install ACR122U driver from ACS website
2. **Linux**: Ensure pcscd service is running:
   ```bash
   sudo systemctl status pcscd
   sudo systemctl start pcscd
   ```
3. Reconnect the USB reader
4. Try a different USB port
5. Check reader with: `pcsc_scan` (install via `apt-get install pcsc-tools`)

### Build Errors (Windows)

**Issue**: Node-gyp or native module build errors

**Solutions**:
1. Install Python 3 and ensure it is available to `node-gyp`.
2. Install Visual Studio Build Tools with the **Desktop development with C++** workload.
3. Restart your terminal/IDE and rerun `setup.bat`.

The deprecated `windows-build-tools` npm package and a global `node-gyp` install are not required.

### Permission Errors (Linux)

**Issue**: Cannot access PC/SC daemon

**Solutions**:
1. Add your user to the `pcscd` group:
   ```bash
   sudo usermod -a -G pcscd $USER
   ```
2. Restart or log out and back in

## 📝 Card Data Format

When a card is scanned, you'll receive:

```json
{
  "uid": "04:A1:B2:C3:D4:E5:F6",
  "atr": "3B8F8001804F0CA0000003060300030000000068",
  "type": "TAG_ISO_14443_3",
  "standard": "ISO_14443_3",
  "timestamp": "2026-08-31T10:30:45.123Z"
}
```

## 🔐 Security Notes

- The server runs on `localhost:3001` only (not exposed to network)
- No sensitive data is transmitted over the internet
- Scan history is stored locally in browser localStorage
- RFID data is handled in-memory only

## 📦 Dependencies

### Main Technologies

- **Tauri v2**: Desktop application framework
- **Node.js**: Server runtime
- **Express**: Web server framework
- **nfc-pcsc**: NFC/RFID reader library
- **CORS**: Cross-origin resource sharing

### Development Tools

- **Rust**: Tauri backend language
- **Cargo**: Rust package manager
- **npm**: Node.js package manager

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

## 📄 License

MIT License - Feel free to use this project for personal or commercial purposes.

## 🆘 Support

For issues and questions:
1. Check the [Troubleshooting](#-troubleshooting) section
2. Review [nfc-pcsc documentation](https://github.com/pokusew/nfc-pcsc)
3. Check [Tauri documentation](https://tauri.app)

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - Application framework
- [nfc-pcsc](https://github.com/pokusew/nfc-pcsc) - NFC library
- [ACS](https://www.acs.com.hk/) - ACR122 reader manufacturer

---

Made with ❤️ using Tauri + Node.js
