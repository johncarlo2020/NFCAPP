// RFID Scanner App
const SERVER_URL = 'http://localhost:3001';

const REGISTRATION_COUNT = 2;
const STATION_COUNT = 4;

// State
let eventSource = null;
let scanHistory = [];
let mode = null; // { type: 'registration' | 'station', number: n }
let readers = [];
let selectedReader = '';
let currentCard = null;
let users = [];

// DOM Elements
let modeScreen, scanScreen, modeLabel, subtitle;
let statusIndicator, statusText, readerSelect, scanPrompt, cardDisplay;
let cardUid, cardAtr, cardType, cardStandard, cardTimestamp;
let historyList, clearHistoryBtn;
let registrationSection, scanSection, usersBody, actionMessage;
let assignModal, modalUser, modalIcon, modalStatus, modalCancel;
let assigningUser = null;
let assignBusy = false;

// Initialize app when DOM is ready
window.addEventListener("DOMContentLoaded", () => {
  initializeElements();
  loadHistory();
  buildModeButtons();
  setupEventListeners();
});

function initializeElements() {
  modeScreen = document.querySelector("#mode-screen");
  scanScreen = document.querySelector("#scan-screen");
  modeLabel = document.querySelector("#mode-label");
  subtitle = document.querySelector("#subtitle");
  statusIndicator = document.querySelector("#status-indicator");
  statusText = document.querySelector("#status-text");
  readerSelect = document.querySelector("#reader-select");
  scanPrompt = document.querySelector("#scan-prompt");
  cardDisplay = document.querySelector("#card-display");
  cardUid = document.querySelector("#card-uid");
  cardAtr = document.querySelector("#card-atr");
  cardType = document.querySelector("#card-type");
  cardStandard = document.querySelector("#card-standard");
  cardTimestamp = document.querySelector("#card-timestamp");
  historyList = document.querySelector("#history-list");
  clearHistoryBtn = document.querySelector("#clear-history");
  registrationSection = document.querySelector("#registration-section");
  scanSection = document.querySelector("#scan-section");
  usersBody = document.querySelector("#users-body");
  assignModal = document.querySelector("#assign-modal");
  modalUser = document.querySelector("#modal-user");
  modalIcon = document.querySelector("#modal-icon");
  modalStatus = document.querySelector("#modal-status");
  modalCancel = document.querySelector("#modal-cancel");
  actionMessage = document.querySelector("#action-message");
}

function setupEventListeners() {
  clearHistoryBtn.addEventListener('click', clearHistory);
  document.querySelector("#change-mode").addEventListener('click', showModeScreen);
  readerSelect.addEventListener('change', () => {
    selectedReader = readerSelect.value;
    if (mode) localStorage.setItem(readerStorageKey(), selectedReader);
  });
  document.querySelector("#refresh-users").addEventListener('click', loadUsers);
  modalCancel.addEventListener('click', closeAssignModal);
}

// ---- Mode selection ----

function buildModeButtons() {
  const build = (containerId, count, type, label) => {
    const container = document.querySelector(containerId);
    for (let n = 1; n <= count; n++) {
      const btn = document.createElement('button');
      btn.className = 'mode-btn';
      btn.textContent = `${label} ${n}`;
      btn.addEventListener('click', () => selectMode(type, n));
      container.appendChild(btn);
    }
  };
  build('#registration-buttons', REGISTRATION_COUNT, 'registration', 'Registration');
  build('#station-buttons', STATION_COUNT, 'station', 'Station');
}

function readerStorageKey() {
  return `rfid_reader_${mode.type}_${mode.number}`;
}

function selectMode(type, number) {
  mode = { type, number };
  const label = `${type === 'registration' ? 'Registration' : 'Station'} ${number}`;
  modeLabel.textContent = label;
  subtitle.textContent = label;
  modeScreen.style.display = 'none';
  scanScreen.style.display = 'block';

  const isRegistration = type === 'registration';
  registrationSection.style.display = isRegistration ? 'block' : 'none';
  scanSection.style.display = isRegistration ? 'none' : '';
  if (isRegistration) loadUsers();

  selectedReader = localStorage.getItem(readerStorageKey()) || '';
  resetScanView();
  updateStatus('waiting', 'Connecting...');
  connectToServer();
}

function showModeScreen() {
  mode = null;
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  scanScreen.style.display = 'none';
  modeScreen.style.display = 'block';
  subtitle.textContent = 'ACR122 NFC Reader';
}

function resetScanView() {
  currentCard = null;
  closeAssignModal();
  actionMessage.textContent = '';
  actionMessage.className = 'action-message';
  hideCardDisplay();
}

// ---- Users (registration) ----

function userLabel(user) {
  return user.name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.code || user.email || `User ${user.id}`;
}

function renderUsers(message) {
  usersBody.innerHTML = '';
  if (message || users.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.className = 'table-empty';
    cell.textContent = message || 'All users have an NFC card assigned';
    row.appendChild(cell);
    usersBody.appendChild(row);
    return;
  }

  users.forEach(user => {
    const row = document.createElement('tr');
    [user.id, user.code ?? '-', user.email ?? '-'].forEach(value => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });
    const actionCell = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn-primary btn-small';
    btn.textContent = 'Assign';
    btn.addEventListener('click', () => openAssignModal(user));
    actionCell.appendChild(btn);
    row.appendChild(actionCell);
    usersBody.appendChild(row);
  });
}

async function loadUsers() {
  renderUsers('Loading users...');
  try {
    const response = await fetch(`${SERVER_URL}/api/users`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.success) throw new Error(body.message || `HTTP ${response.status}`);
    users = body.data;
    renderUsers();
  } catch (error) {
    console.error('Failed to load users:', error);
    users = [];
    renderUsers(`Failed to load users: ${error.message}`);
  }
}

// ---- Assign modal ----

function setModalStatus(icon, text, kind = '') {
  modalIcon.textContent = icon;
  modalStatus.textContent = text;
  modalStatus.className = 'modal-status ' + kind;
}

function openAssignModal(user) {
  assigningUser = user;
  assignBusy = false;
  modalUser.textContent = `${userLabel(user)} (ID ${user.id})`;
  modalCancel.textContent = 'Cancel';
  if (!selectedReader) {
    setModalStatus('⚠️', 'No reader selected. Choose a reader first.', 'action-error');
  } else {
    setModalStatus('📱', 'Tap the NFC card on the reader...');
  }
  assignModal.style.display = 'flex';
}

function closeAssignModal() {
  assigningUser = null;
  assignBusy = false;
  assignModal.style.display = 'none';
}

async function assignScannedCard(card) {
  const user = assigningUser;
  assignBusy = true;
  setModalStatus('⏳', `Sending ${card.uid}...`);
  const ok = await postToServer('/api/registration/assign', {
    nfcCode: card.uid,
    userId: user.id,
  });
  if (!ok.success) {
    assignBusy = false;
    setModalStatus('❌', `Failed: ${ok.message}. Tap the card again to retry.`, 'action-error');
    return;
  }

  addToHistory({ ...card, note: `→ ${userLabel(user)}` });
  users = users.filter(u => u.id !== user.id);
  renderUsers();
  showActionMessage(`Assigned ${card.uid} to ${userLabel(user)}`, true);
  setModalStatus('✅', `Assigned ${card.uid}`, 'action-success');
  assignBusy = true;
  setTimeout(() => {
    if (assigningUser === user) closeAssignModal();
  }, 1200);
}

// ---- Server communication ----

async function postToServer(path, payload) {
  try {
    const response = await fetch(`${SERVER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.success) {
      throw new Error(body.message || `HTTP ${response.status}`);
    }
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function showActionMessage(text, success) {
  actionMessage.textContent = text;
  actionMessage.className = 'action-message ' + (success ? 'action-success' : 'action-error');
}

function connectToServer() {
  if (!mode) return;
  console.log('Connecting to server...');

  fetch(`${SERVER_URL}/health`)
    .then(response => response.json())
    .then(data => {
      console.log('Server is online:', data);
      if (mode) startEventStream();
    })
    .catch(error => {
      console.error('Failed to connect to server:', error);
      updateStatus('disconnected', 'Server offline');
      setTimeout(connectToServer, 5000);
    });
}

function startEventStream() {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource(`${SERVER_URL}/api/events`);

  eventSource.onopen = () => {
    console.log('EventSource connected');
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerEvent(data);
    } catch (error) {
      console.error('Failed to parse event data:', error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('EventSource error:', error);
    updateStatus('disconnected', 'Connection lost');
    eventSource.close();
    eventSource = null;
    setTimeout(connectToServer, 5000);
  };
}

function handleServerEvent(event) {
  console.log('Server event:', event);

  switch (event.type) {
    case 'connected':
    case 'reader_connected':
    case 'reader_disconnected':
      setReaders(event.readers || []);
      break;

    case 'card_detected':
      if (isSelectedReader(event.data.reader)) handleCard(event.data);
      break;

    case 'card_removed':
      if (mode.type === 'station' && isSelectedReader(event.reader)) hideCardDisplay();
      break;

    case 'error':
      console.error('Reader error:', event.message);
      updateStatus('error', 'Error: ' + event.message);
      break;
  }
}

// ---- Readers ----

function setReaders(names) {
  readers = names;
  readerSelect.innerHTML = '';

  if (readers.length === 0) {
    selectedReader = '';
    readerSelect.innerHTML = '<option value="">Waiting for reader...</option>';
    updateStatus('waiting', 'Waiting for reader');
    return;
  }

  if (!readers.includes(selectedReader)) {
    selectedReader = readers.length === 1 ? readers[0] : '';
  }

  if (!selectedReader) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a reader...';
    readerSelect.appendChild(placeholder);
  }
  readers.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    readerSelect.appendChild(option);
  });
  readerSelect.value = selectedReader;

  updateStatus(selectedReader ? 'connected' : 'waiting',
    selectedReader ? 'Reader connected' : 'Select a reader');
}

function isSelectedReader(name) {
  return mode && selectedReader && name === selectedReader;
}

// ---- Cards ----

function handleCard(cardData) {
  if (mode.type === 'registration') {
    // Cards are only consumed while the assign modal is open
    if (assigningUser && !assignBusy) assignScannedCard(cardData);
    return;
  }

  currentCard = cardData;
  displayCard(cardData);
  addToHistory(cardData);
  postToServer('/api/station/scan', {
    nfcCode: cardData.uid,
    stationId: mode.number,
  }).then(result => {
    if (result.success) showActionMessage(`Sent ${cardData.uid} from Station ${mode.number}`, true);
    else showActionMessage(`Failed: ${result.message}`, false);
  });
}

function updateStatus(status, text) {
  statusText.textContent = text;
  statusIndicator.className = 'status-indicator status-' + status;
}

function displayCard(cardData) {
  scanPrompt.style.display = 'none';
  cardDisplay.style.display = 'block';

  cardUid.textContent = cardData.uid;
  cardAtr.textContent = cardData.atr || '-';
  cardType.textContent = cardData.type || 'Unknown';
  cardStandard.textContent = cardData.standard || 'Unknown';
  cardTimestamp.textContent = new Date(cardData.timestamp).toLocaleString();

  cardDisplay.style.animation = 'none';
  setTimeout(() => {
    cardDisplay.style.animation = 'fadeIn 0.3s ease-in';
  }, 10);
}

function hideCardDisplay() {
  cardDisplay.style.display = 'none';
  scanPrompt.style.display = 'flex';
}

// ---- History ----

function addToHistory(cardData) {
  scanHistory.unshift({
    ...cardData,
    mode: modeLabel.textContent,
    id: Date.now()
  });

  if (scanHistory.length > 20) {
    scanHistory = scanHistory.slice(0, 20);
  }

  saveHistory();
  renderHistory();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function renderHistory() {
  if (scanHistory.length === 0) {
    historyList.innerHTML = '<p class="no-history">No scans yet</p>';
    return;
  }

  historyList.innerHTML = scanHistory.map(card => `
    <div class="history-item">
      <div class="history-uid">${escapeHtml(card.uid)}</div>
      <div class="history-meta">
        <span>${escapeHtml([card.mode, card.note].filter(Boolean).join(' ') || card.type || 'Unknown')}</span>
        <span>${new Date(card.timestamp).toLocaleTimeString()}</span>
      </div>
    </div>
  `).join('');
}

function clearHistory() {
  if (confirm('Clear all scan history?')) {
    scanHistory = [];
    saveHistory();
    renderHistory();
  }
}

function saveHistory() {
  localStorage.setItem('rfid_scan_history', JSON.stringify(scanHistory));
}

function loadHistory() {
  const saved = localStorage.getItem('rfid_scan_history');
  if (saved) {
    try {
      scanHistory = JSON.parse(saved);
      renderHistory();
    } catch (error) {
      console.error('Failed to load history:', error);
      scanHistory = [];
    }
  }
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (eventSource) {
    eventSource.close();
  }
});
