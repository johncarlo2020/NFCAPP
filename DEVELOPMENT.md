# Developer Guide

This guide provides detailed information for developers working on the RFID Scanner application.

## Development Environment Setup

### Prerequisites

1. **Node.js** v16 or higher
2. **Rust** (latest stable)
3. **Code Editor**: VS Code recommended with these extensions:
   - Tauri
   - rust-analyzer
   - ESLint
   - Prettier

### Initial Setup

```bash
# Clone and enter directory
cd rfid-scanner

# Run automated setup
./setup.sh  # macOS/Linux
setup.bat   # Windows

# Or manual setup
npm install
cd server && npm install && cd ..
```

## Project Architecture

### Overview

```
┌─────────────────┐
│   Tauri App     │ (Rust - Desktop Shell)
│   (lib.rs)      │
└────────┬────────┘
         │ spawns & manages
         ▼
┌─────────────────┐
│  Node.js Server │ (Express + nfc-pcsc)
│  (server.js)    │ Port 3001
└────────┬────────┘
         │ HTTP/SSE
         ▼
┌─────────────────┐
│  Web Interface  │ (HTML/CSS/JS)
│  (src/)         │
└─────────────────┘
```

### Component Responsibilities

#### 1. Tauri Backend (`src-tauri/src/lib.rs`)

**Responsibilities:**
- Application lifecycle management
- Auto-starting Node.js server
- Process management (spawn, monitor, cleanup)
- Window configuration

**Key Functions:**
- `start_node_server()`: Spawns Node process
- `setup()`: Initialization hook
- `on_window_event()`: Cleanup on close

**Server Launch Logic:**
```rust
// Detects correct working directory
let mut server_path = std::env::current_dir()?;
if server_path.ends_with("src-tauri") {
    server_path.pop();
}
server_path.push("server");

// Platform-specific command
if cfg!(target_os = "windows") {
    Command::new("cmd").args(&["/C", "npm", "start"])
} else {
    Command::new("npm").arg("start")
}
```

#### 2. Node.js Server (`server/server.js`)

**Responsibilities:**
- ACR122 reader communication via nfc-pcsc
- RESTful API for status queries
- Server-Sent Events for real-time updates
- Card data processing

**Key Components:**

**NFC Reader Management:**
```javascript
const nfc = new NFC();

nfc.on('reader', reader => {
    // Reader connected
    reader.on('card', card => { /* Handle card */ });
    reader.on('card.off', card => { /* Card removed */ });
    reader.on('error', err => { /* Handle error */ });
});
```

**API Endpoints:**
- `/api/status` - Current reader/server state
- `/api/last-scan` - Last scanned card info
- `/api/events` - SSE stream
- `/health` - Simple health check

**Event Broadcasting:**
```javascript
function broadcastToClients(data) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    connectedClients.forEach(client => {
        client.write(message);
    });
}
```

#### 3. Web Interface (`src/`)

**Responsibilities:**
- User interface rendering
- Real-time event handling via EventSource
- Local storage for scan history
- Connection management and reconnection

**Key Files:**
- `index.html`: UI structure
- `main.js`: Application logic
- `styles.css`: Styling and animations

**Connection Flow:**
```javascript
// 1. Check server health
fetch(`${SERVER_URL}/health`)

// 2. Start SSE connection
eventSource = new EventSource(`${SERVER_URL}/api/events`)

// 3. Handle events
eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerEvent(data);
}

// 4. Reconnect on failure
eventSource.onerror = () => {
    setTimeout(connectToServer, 5000);
}
```

## Development Workflow

### Running in Development

1. **Start Full Application:**
   ```bash
   npm run dev
   ```
   This starts Tauri, which auto-starts the server.

2. **Run Server Only:**
   ```bash
   npm run server
   ```
   Useful for testing server independently.

3. **Frontend Changes:**
   - Edit files in `src/`
   - Tauri dev mode has hot reload
   - Refresh browser if needed

4. **Backend (Rust) Changes:**
   - Edit files in `src-tauri/src/`
   - Tauri automatically recompiles
   - Window will restart

5. **Server Changes:**
   - Edit `server/server.js`
   - Restart app or run server separately

### Debugging

#### Server Debugging

**Check Server Logs:**
```bash
cd server
npm start
```

**Test Endpoints:**
```bash
# Health check
curl http://localhost:3001/health

# Status
curl http://localhost:3001/api/status

# SSE stream
curl http://localhost:3001/api/events
```

#### Tauri Debugging

**Console Output:**
- Check terminal running `npm run dev`
- Server spawn messages appear here
- Rust panics logged here

**Rust Logs:**
```rust
println!("Debug message");
eprintln!("Error message");
```

#### Frontend Debugging

**Browser DevTools:**
1. Right-click in app → "Inspect Element"
2. Check Console for logs
3. Network tab for SSE connection
4. Application → Local Storage for history

**Console Logging:**
```javascript
console.log('Debug info:', data);
console.error('Error:', error);
```

### Testing Reader Connection

#### Without Physical Reader

For development without ACR122:

1. **Mock Server Mode** (create `server/mock-server.js`):
   ```javascript
   // Simulate card scans every 5 seconds
   setInterval(() => {
       broadcastToClients({
           type: 'card_detected',
           data: {
               uid: '04:' + Math.random().toString(16).slice(2, 8),
               atr: 'MOCK_ATR',
               type: 'TAG_ISO_14443_3',
               standard: 'ISO_14443_3',
               timestamp: new Date().toISOString()
           }
       });
   }, 5000);
   ```

2. **Use Browser Directly:**
   - Run server: `cd server && npm start`
   - Open: `http://localhost:8080` (create simple HTML test page)

#### With Physical Reader

1. Connect ACR122 via USB
2. Verify driver installation:
   ```bash
   # Linux/macOS
   pcsc_scan
   
   # Windows
   # Check Device Manager → Smart card readers
   ```

3. Run app: `npm run dev`
4. Place card on reader

## Building and Distribution

### Development Build

```bash
npm run dev
```

### Production Build

```bash
npm run tauri build
```

**Output locations:**
- Windows: `src-tauri/target/release/bundle/`
- macOS: `src-tauri/target/release/bundle/macos/`
- Linux: `src-tauri/target/release/bundle/appimage/`

### Build Configuration

Edit `src-tauri/tauri.conf.json`:

```json
{
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis", "deb", "appimage", "dmg"],
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256"
    }
  }
}
```

## Code Style and Standards

### JavaScript

- Use modern ES6+ syntax
- Async/await over callbacks
- Descriptive variable names
- Comments for complex logic

### Rust

- Follow Rust naming conventions
- Use `rustfmt` for formatting
- Handle errors properly (no unwrap in prod)
- Document public functions

### HTML/CSS

- Semantic HTML5
- BEM-like class naming
- CSS custom properties for theming
- Mobile-first responsive design

## Common Development Tasks

### Adding a New API Endpoint

1. **Server (`server/server.js`):**
   ```javascript
   app.get('/api/new-endpoint', (req, res) => {
       res.json({ data: 'value' });
   });
   ```

2. **Frontend (`src/main.js`):**
   ```javascript
   async function callNewEndpoint() {
       const response = await fetch(`${SERVER_URL}/api/new-endpoint`);
       const data = await response.json();
       console.log(data);
   }
   ```

### Adding a New Event Type

1. **Server:** Emit new event
   ```javascript
   broadcastToClients({ 
       type: 'new_event', 
       data: {} 
   });
   ```

2. **Frontend:** Handle in `handleServerEvent()`
   ```javascript
   case 'new_event':
       // Handle new event
       break;
   ```

### Modifying UI

1. Edit `src/index.html` for structure
2. Edit `src/styles.css` for styling
3. Edit `src/main.js` for behavior
4. Test in dev mode (hot reload)

### Changing Server Port

1. **Server:** Edit `server/server.js`
   ```javascript
   const PORT = 3002; // Change from 3001
   ```

2. **Frontend:** Edit `src/main.js`
   ```javascript
   const SERVER_URL = 'http://localhost:3002';
   ```

## Performance Considerations

### Memory Management

- **Server:** EventSource connections cleaned up on disconnect
- **Frontend:** LocalStorage limited to 20 scans
- **Rust:** Server process killed on app close

### Network Efficiency

- SSE instead of polling (more efficient)
- Single long-lived connection
- Minimal data in events

### UI Performance

- CSS animations for smooth UX
- Virtual scrolling for large history (future enhancement)
- Debouncing rapid card scans

## Security Considerations

### Local-Only Server

Server binds to `localhost` only:
```javascript
app.listen(PORT, 'localhost', () => { /* ... */ });
```

### Data Handling

- No card data sent to external servers
- LocalStorage data stays on device
- RFID data processed in memory only

### CORS Policy

Server allows all origins (since it's local):
```javascript
app.use(cors());
```

In production, restrict if needed:
```javascript
app.use(cors({ origin: 'http://localhost:1420' }));
```

## Troubleshooting Development Issues

### Port Already in Use

**Problem:** Server fails to start on port 3001

**Solution:**
```bash
# Find process using port
# Windows
netstat -ano | findstr :3001

# macOS/Linux  
lsof -i :3001

# Kill process
kill -9 <PID>
```

### Rust Compilation Errors

**Problem:** Tauri won't build

**Solutions:**
1. Update Rust: `rustup update`
2. Clean build: `cd src-tauri && cargo clean`
3. Check syntax in `lib.rs`

### NFC Module Build Fails

**Problem:** `nfc-pcsc` won't install

**Solutions:**
1. Install build tools (see README prerequisites)
2. Clear npm cache: `npm cache clean --force`
3. Delete `node_modules` and reinstall

## Resources

### Documentation

- [Tauri Docs](https://tauri.app/v1/guides/)
- [nfc-pcsc GitHub](https://github.com/pokusew/nfc-pcsc)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Server-Sent Events MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

### Useful Tools

- **pcsc_scan**: Test PC/SC reader connectivity
- **curl**: Test API endpoints
- **Postman**: API testing
- **Rust Analyzer**: VS Code extension for Rust

## Contributing Guidelines

1. Fork the repository
2. Create a feature branch
3. Make changes with descriptive commits
4. Test thoroughly (all platforms if possible)
5. Update documentation
6. Submit pull request

---

Happy coding! 🚀
