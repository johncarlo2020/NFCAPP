import express from 'express';
import cors from 'cors';
import { fork } from 'child_process';
import Pusher from 'pusher';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
    process.loadEnvFile(join(__dirname, '.env'));
} catch {
    // .env is optional
}

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

// Names of connected readers
const readers = new Set();
let lastCardData = null;
let connectedClients = [];

// Pusher configuration (see .env.example)
const pusher = process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET
    ? new Pusher({
        appId: process.env.PUSHER_APP_ID,
        key: process.env.PUSHER_KEY,
        secret: process.env.PUSHER_SECRET,
        cluster: process.env.PUSHER_CLUSTER || 'mt1',
        useTLS: true
    })
    : null;
const PUSHER_CHANNEL = process.env.PUSHER_CHANNEL || 'nfc';
const PUSHER_REGISTRATION_EVENT = process.env.PUSHER_REGISTRATION_EVENT || 'nfc-registration';
const PUSHER_STATION_EVENT = process.env.PUSHER_STATION_EVENT || 'nfc-station';

function readerNames() {
    return [...readers].sort();
}

// NFC readers run in a child process: initialising PC/SC can block the whole
// process (e.g. Smart Card service not running) and must not stop the HTTP API.
let nfcWorker = null;

function startNfcWorker() {
    const worker = nfcWorker = fork(join(__dirname, 'nfc-worker.js'));

    worker.on('message', msg => {
        switch (msg.type) {
            case 'reader':
                console.log(`Reader detected: ${msg.name}`);
                readers.add(msg.name);
                broadcastToClients({ type: 'reader_connected', reader: msg.name, readers: readerNames() });
                break;

            case 'card': {
                console.log(`Card detected on ${msg.name}:`, msg.card.uid);
                lastCardData = {
                    uid: msg.card.uid,
                    atr: msg.card.atr,
                    standard: msg.card.standard || 'Unknown',
                    type: msg.card.type || 'Unknown',
                    reader: msg.name,
                    timestamp: new Date().toISOString()
                };
                broadcastToClients({ type: 'card_detected', data: lastCardData });
                break;
            }

            case 'card.off':
                console.log(`Card removed from ${msg.name}:`, msg.uid);
                broadcastToClients({ type: 'card_removed', uid: msg.uid, reader: msg.name });
                lastCardData = null;
                break;

            case 'reader.error':
                console.error(`Reader error (${msg.name}):`, msg.message);
                broadcastToClients({ type: 'error', message: msg.message, reader: msg.name });
                break;

            case 'reader.end':
                console.log(`Reader disconnected: ${msg.name}`);
                readers.delete(msg.name);
                broadcastToClients({ type: 'reader_disconnected', reader: msg.name, readers: readerNames() });
                break;

            case 'nfc.error':
                console.error('NFC error:', msg.message);
                break;
        }
    });

    worker.on('exit', code => {
        console.error(`NFC worker exited (code ${code}); restarting in 5s`);
        readers.clear();
        broadcastToClients({ type: 'reader_disconnected', readers: [] });
        setTimeout(startNfcWorker, 5000);
    });

    return worker;
}

startNfcWorker();
// Broadcast function for SSE
function broadcastToClients(data) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    connectedClients.forEach(client => {
        client.write(message);
    });
}

async function triggerPusher(event, payload, res) {
    if (!pusher) {
        res.status(503).json({ success: false, message: 'Pusher is not configured. Set PUSHER_* values in server/.env' });
        return;
    }
    try {
        await pusher.trigger(PUSHER_CHANNEL, event, payload);
        res.json({ success: true });
    } catch (err) {
        console.error('Pusher error:', err.message);
        res.status(502).json({ success: false, message: 'Failed to send to Pusher: ' + err.message });
    }
}

// REST API endpoints
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        readerConnected: readers.size > 0,
        readers: readerNames(),
        lastCard: lastCardData,
        pusherConfigured: pusher !== null
    });
});

app.get('/api/last-scan', (req, res) => {
    if (lastCardData) {
        res.json({
            success: true,
            data: lastCardData
        });
    } else {
        res.json({
            success: false,
            message: 'No card data available'
        });
    }
});

// Users without an NFC code yet (proxied so the API secret stays on the server)
app.get('/api/users', async (req, res) => {
    const url = process.env.USERS_API_URL;
    if (!url) {
        return res.status(503).json({ success: false, message: 'USERS_API_URL is not set in server/.env' });
    }
    try {
        const response = await fetch(url, {
            headers: {
                'X-API-Secret': process.env.API_SECRET || '',
                'Accept': 'application/json'
            }
        });
        if (!response.ok) {
            return res.status(502).json({ success: false, message: `Users API returned HTTP ${response.status}` });
        }
        const body = await response.json();
        res.json({ success: true, data: Array.isArray(body) ? body : (body.data || body.users || []) });
    } catch (err) {
        console.error('❌ Users API error:', err.message);
        res.status(502).json({ success: false, message: 'Failed to load users: ' + err.message });
    }
});

// Registration: assign an NFC code to a user
app.post('/api/registration/assign', (req, res) => {
    const { nfcCode, userId } = req.body || {};
    if (!nfcCode || userId === undefined || userId === null || userId === '') {
        return res.status(400).json({ success: false, message: 'nfcCode and userId are required' });
    }
    triggerPusher(PUSHER_REGISTRATION_EVENT, { nfc_code: nfcCode, user_id: userId }, res);
});

// Station: report a scanned NFC code from a station
app.post('/api/station/scan', (req, res) => {
    const { nfcCode, stationId } = req.body || {};
    if (!nfcCode || stationId === undefined || stationId === null || stationId === '') {
        return res.status(400).json({ success: false, message: 'nfcCode and stationId are required' });
    }
    triggerPusher(PUSHER_STATION_EVENT, { nfc_code: nfcCode, station_id: stationId }, res);
});

// Server-Sent Events endpoint for real-time updates
app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Add client to connected clients list
    connectedClients.push(res);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ 
        type: 'connected',
        readerConnected: readers.size > 0,
        readers: readerNames()
    })}\n\n`);

    // Remove client when connection is closed
    req.on('close', () => {
        connectedClients = connectedClients.filter(client => client !== res);
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`🚀 NFC RFID Server running on http://localhost:${PORT}`);
    console.log('👀 Waiting for ACR122 reader...');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down server...');
    if (nfcWorker) nfcWorker.kill();
    process.exit(0);
});
