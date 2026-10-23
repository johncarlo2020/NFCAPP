const $ = selector => document.querySelector(selector);
let token = '', apiBase = '', users = [], filter = 'all', page = 1, selectedReader = '', readers = [], readerCards = {}, readerError = '', unlisten;
let activeUser = null, capturedUid = '', busy = false, loading = false, refreshGeneration = 0, confirmTask = null;
let opener, account = null, stationJob = null;
let authenticating = false;
let searchTimer, listTotal = 0, listLastPage = 1;
let listCounts = { all: 0, assigned: 0, unassigned: 0, redeemed: 0 };
let registrationClient, registrationTimer, registrationDirty = false, registrationLastRefresh = 0;
let devMode = false, manualEnabled = false;
const isManual = () => devMode && manualEnabled;
const readerReady = () => isManual() || (Boolean(selectedReader) && !readerError);
const sessionStorageKey = 'nfc_staff_session';
const canAssign = () => account?.role === 'admin' || account?.staff_function === 'register';
const isStation = () => account?.role !== 'admin' && account?.staff_function === 'station';
const cardDialog = $('#card-dialog'), confirmDialog = $('#confirm-dialog'), lookupDialog = $('#lookup-dialog');
const rewardDialog = $('#reward-dialog');
$('#reward-close').addEventListener('click', () => rewardDialog.close());
rewardDialog.addEventListener('close', () => { renderManualControls(); if (token && isStation()) $('#reader').focus(); });

function showRewardIneligible(status, uid) {
  if (status !== 'prerequisites_not_met' || !isStation() || Number(account.station_id) !== 4) return;
  $('#reward-card-uid').textContent = uid;
  if (!rewardDialog.open) rewardDialog.showModal();
  renderManualControls();
  $('#reward-close').focus();
}
let lookupJob = null;

function message(text, error = false) {
  $('#notice').textContent = text;
  $('#notice').className = `notice${error ? ' error' : ''}`;
  $('#notice').hidden = !text;
}
function renderAccount(user = {}) {
  const role = user.role === 'admin' ? 'Admin account'
    : user.staff_function === 'register' ? 'Registration staff account'
    : user.staff_function === 'station' ? 'Station staff account'
    : 'Staff account';
  const station = user.role !== 'admin' && user.staff_function === 'station'
    ? (user.station_id != null && String(user.station_id).trim() !== '' ? `Station ${user.station_id}` : 'Station not assigned')
    : '';
  $('#account-role').textContent = role;
  $('#account-station').textContent = station;
  $('#account-station').hidden = !station;
  $('#session-account').textContent = station ? `${role} · ${station}` : role;
}

function clearLookup() {
  lookupJob = null;
  $('#lookup-details').hidden = true; $('#lookup-error').textContent = '';
  $('#lookup-uid').textContent = 'Waiting for card…';
  for (const id of ['lookup-name', 'lookup-user-id', 'lookup-mobile', 'lookup-email', 'lookup-code', 'lookup-card', 'lookup-role']) $(`#${id}`).textContent = '';
}
function renderLookupReader() {
  $('#lookup-reader').replaceChildren();
  if (!selectedReader) $('#lookup-reader').append(new Option(readers.length ? 'Select a reader…' : 'No reader available', ''));
  for (const reader of readers) $('#lookup-reader').append(new Option(reader, reader));
  $('#lookup-reader').value = selectedReader;
  if (!lookupJob) $('#lookup-status').textContent = isManual() ? 'Enter a card UID and simulate a tap.' : readerError || (!selectedReader ? 'Connect and select an NFC reader first.' : $('#lookup-details').hidden ? 'Tap a card on the selected reader.' : 'Customer found. Tap another card to search again.');
}
$('#card-assignments').addEventListener('click', () => {
  if (!token || !canAssign()) return;
  lookupDialog.close(); renderWorkspace();
});
$('#rfid-lookup').addEventListener('click', () => {
  if (!token || !canAssign() || busy || cardDialog.open || confirmDialog.open) return;
  clearLookup(); renderLookupReader(); lookupDialog.showModal(); $('#lookup-close').focus();
});
$('#lookup-close').addEventListener('click', () => lookupDialog.close());
lookupDialog.addEventListener('close', () => { clearLookup(); $('#rfid-lookup').focus(); });
lookupDialog.addEventListener('cancel', clearLookup);
$('#lookup-reader').addEventListener('change', () => { selectedReader = $('#lookup-reader').value; $('#reader').value = selectedReader; clearLookup(); renderReader(); });
async function lookupCard(uid) {
  if (!token || !canAssign() || !lookupDialog.open || !readerReady()) return;
  clearLookup(); const job = { token }; lookupJob = job;
  renderManualControls();
  $('#lookup-uid').textContent = uid; $('#lookup-status').textContent = 'Looking up customer…';
  try {
    const body = await request(`/api/admin/users/by-rfid?rfid_uid=${encodeURIComponent(uid)}`);
    if (lookupJob !== job || token !== job.token || !lookupDialog.open) return;
    const user = body.data;
    if (!user || typeof user !== 'object' || Array.isArray(user) || user.id == null) throw new Error('The server returned invalid customer details.');
    const name = user.name || [user.first_name, user.last_name].filter(Boolean).join(' ');
    $('#lookup-name-row').hidden = !name; $('#lookup-name').textContent = name;
    $('#lookup-user-id').textContent = String(user.id);
    $('#lookup-mobile').textContent = user.mobile_number || user.code || '—';
    $('#lookup-email').textContent = user.email || '—'; $('#lookup-code').textContent = user.code || '—';
    $('#lookup-card').textContent = user.rfid_uid || uid; $('#lookup-role').textContent = user.role || 'Customer';
    $('#lookup-details').hidden = false; $('#lookup-status').textContent = 'Customer found. Tap another card to search again.';
  } catch (error) {
    if (lookupJob !== job || token !== job.token || !lookupDialog.open) return;
    $('#lookup-status').textContent = 'Tap another card to search again.';
    $('#lookup-error').textContent = error.status === 404 ? 'No customer is linked to this card.' : error.message;
  } finally { if (lookupJob === job) lookupJob = null; renderManualControls(); }
}

function renderWorkspace() {
  const station = isStation();
  for (const id of ['assignments', 'assignment-stats', 'assignment-nav', 'assignment-note']) $(`#${id}`).hidden = !canAssign();
  $('#station-view').hidden = !station;
  $('#page-title').textContent = station ? `Station ${account.station_id}` : 'Card assignments';
  $('#page-description').textContent = station ? 'Tap NFC cards to check in attendees at your assigned station.' : 'Manage the cards that connect your users.';
  $('#station-title').textContent = station ? `Station ${account.station_id} check-in` : 'Station check-in';
  renderReader();
}
async function checkInCard(uid) {
  if (!token || !isStation() || stationJob || rewardDialog.open || !readerReady()) return;
  const job = { token }; stationJob = job;
  renderManualControls();
  $('#station-card-uid').textContent = uid;
  $('#station-result').hidden = false; $('#station-result').className = 'notice';
  $('#station-result').textContent = 'Checking in…';
  try {
    const body = await request('/api/admin/stations/check-in', { method: 'POST', body: JSON.stringify({ rfid_uid: uid }) });
    if (stationJob !== job || token !== job.token) return;
    const accepted = body.status === 'success' || body.status === 'duplicate';
    $('#station-result').className = accepted ? 'notice' : 'notice error';
    $('#station-result').textContent = body.message || (body.status === 'success' ? 'Station checked in successfully.' : body.status === 'duplicate' ? 'Already checked in at this station.' : 'Check-in was not confirmed. Verify the result before tapping again.');
    showRewardIneligible(body.status, uid);
  } catch (error) {
    if (stationJob !== job || token !== job.token) return;
    $('#station-result').className = 'notice error';
    $('#station-result').textContent = error.status >= 500 || !error.status
      ? `Check-in outcome uncertain. Verify the result before tapping again. ${error.message}`
      : error.message;
    showRewardIneligible(error.apiStatus, uid);
  } finally { if (stationJob === job) stationJob = null; renderManualControls(); }
}

function showLogin(reason = '') {
  stopRegistrationUpdates();
  clearTimeout(searchTimer);
  searchTimer = undefined;
  listTotal = 0; listLastPage = 1; page = 1;
  listCounts = { all: 0, assigned: 0, unassigned: 0, redeemed: 0 };
  localStorage.removeItem(sessionStorageKey);
  $('#restore-session').hidden = true;
  token = ''; account = null; stationJob = null; users = []; refreshGeneration++; loading = false;
  manualEnabled = false; $('#manual-mode').checked = false; capturedUid = '';
  for (const id of ['manual-assignment-uid', 'manual-station-uid', 'manual-lookup-uid']) $(`#${id}`).value = '';
  $('#manual-station-error').textContent = '';
  $('#station-result').hidden = true; $('#station-result').textContent = ''; $('#station-card-uid').textContent = 'Waiting for card…';
  renderAccount(); $('#admin-name').textContent = 'Staff';
  clearLookup(); lookupDialog.close(); cardDialog.close(); confirmDialog.close(); rewardDialog.close();
  $('#workspace').hidden = true; $('#login-screen').hidden = false;
  $('#login-error').textContent = reason; $('#password').value = '';
  renderReader();
}
async function request(path, options = {}) {
  const requestToken = token;
  const started = Date.now();
  const method = (options.method || 'GET').toUpperCase();
  // Exclude credentials, query values (including scanned UIDs), and fragments.
  const endpoint = new URL(`${apiBase}${path}`);
  endpoint.username = ''; endpoint.password = ''; endpoint.search = ''; endpoint.hash = '';
  const origin = window.location?.origin || 'unavailable';
  const details = response => [
    `Request: ${method} ${endpoint.href}.`,
    `App origin: ${origin}.`,
    `Elapsed: ${Date.now() - started} ms.`,
    response ? `HTTP: ${response.status}${response.statusText ? ` ${response.statusText}` : ''}. Content-Type: ${response.headers?.get('content-type') || 'not provided'}.`
      : 'HTTP status: unavailable (no response accessible to the app).',
  ].join(' ');
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch (cause) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const reason = cause?.name === 'AbortError' ? 'The request was cancelled.'
      : offline ? 'The device reports that it is offline.'
      : 'The browser could not complete the request; it does not expose the exact network cause.';
    throw new Error(`Fetch failed. ${reason} ${details()} Check NFC_API_BASE_URL and server availability, DNS, firewall/proxy settings, and the HTTPS certificate. The API must allow the app origin through CORS, including OPTIONS preflight, the request method, and the Authorization and Content-Type headers. Check the webview Network/Console and server logs to distinguish connection, TLS, CORS, or blocked-content failures.`, { cause });
  }
  let body = {}, invalidJson = false;
  if (response.status !== 204) {
    try { body = await response.json(); }
    catch { invalidJson = true; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) { body = {}; invalidJson = true; }
  }
  if (!response.ok) {
    if (response.status === 401 && token && token === requestToken) showLogin('Your session expired. Please sign in again.');
    const errors = Object.values(body.errors || {}).flat().join(' ');
    const summary = errors || body.message || (response.status === 429 ? 'Too many attempts. Please try again later.' : `Request failed (${response.status}).`);
    const error = new Error(`${summary} ${details(response)}${invalidJson ? ' The response was not a valid JSON object. Check the API route, reverse proxy, and server logs.' : ''}`);
    error.status = response.status; error.apiStatus = body.status; throw error;
  }
  if (invalidJson) {
    throw new Error(`The API returned an invalid JSON response. ${details(response)} Expected a JSON object. Check the API route and server/proxy logs; an HTML login or error page may have been returned.`);
  }
  return body;
}
function validateAccount(user) {
  if (!user || !(user.role === 'admin' || ['register', 'station'].includes(user.staff_function))) throw new Error('The server did not return a supported account type.');
  if (user.role !== 'admin' && user.staff_function === 'station' && !(Number(user.station_id) > 0)) throw new Error('No station is assigned to this account.');
}
async function enterWorkspace(user, realtime) {
  account = user; refreshGeneration++; page = 1;
  renderWorkspace();
  $('#password').value = ''; $('#admin-name').textContent = user.email || $('#email').value;
  renderAccount(user);
  $('#restore-session').hidden = true;
  $('#login-screen').hidden = true; $('#workspace').hidden = false;
  message(''); startRegistrationUpdates(realtime); if (canAssign()) await loadUsers();
}

function stopRegistrationUpdates() {
  const client = registrationClient;
  registrationClient = undefined;
  client?.disconnect();
  clearTimeout(registrationTimer); registrationTimer = undefined;
  registrationDirty = false; registrationLastRefresh = 0;
  $('#registration-live-status').textContent = '';
}
function queueRegistrationRefresh() {
  if (!token || !canAssign()) return;
  registrationDirty = true;
  if (registrationTimer !== undefined) return;
  registrationTimer = setTimeout(flushRegistrationRefresh, Math.max(500, 5000 - (Date.now() - registrationLastRefresh)));
}
async function flushRegistrationRefresh() {
  registrationTimer = undefined;
  if (!registrationDirty || !token || !canAssign()) return;
  // Wait for active searches and dialogs so live updates do not interrupt card work.
  if (loading || busy || authenticating || searchTimer !== undefined || cardDialog.open || confirmDialog.open || lookupDialog.open) {
    registrationTimer = setTimeout(flushRegistrationRefresh, 500);
    return;
  }
  registrationDirty = false; registrationLastRefresh = Date.now();
  await loadUsers();
  if (registrationDirty) queueRegistrationRefresh();
}
function startRegistrationUpdates(config) {
  stopRegistrationUpdates();
  if (!token || !canAssign()) return;
  const status = $('#registration-live-status');
  if (!config?.key || !config.cluster || typeof window.Pusher !== 'function') {
    status.textContent = 'Live updates unavailable. Search again to get the latest users.';
    return;
  }
  const sessionToken = token;
  status.textContent = 'Connecting live registration updates…';
  try {
    const client = new window.Pusher(config.key, {
      cluster: config.cluster, forceTLS: true,
      // Use the existing bearer-token API rather than browser session cookies.
      channelAuthorization: { customHandler: async ({ socketId, channelName }, callback) => {
        if (registrationClient !== client || token !== sessionToken) { callback(new Error('Session changed'), null); return; }
        try {
          const auth = await request('/api/admin/broadcasting/auth', { method: 'POST', body: JSON.stringify({ socket_id: socketId, channel_name: channelName }) });
          if (registrationClient !== client || token !== sessionToken) { callback(new Error('Session changed'), null); return; }
          callback(null, auth);
        } catch (error) { callback(error, null); }
      } },
    });
    registrationClient = client;
    const current = () => registrationClient === client && token === sessionToken;
    client.connection.bind('state_change', ({ current: state }) => {
      if (!current() || state === 'connected') return;
      status.textContent = 'Live updates disconnected. Search again to get the latest users.';
    });
    const channel = client.subscribe('private-nfc-registrations');
    channel.bind('pusher:subscription_succeeded', () => {
      if (!current()) return;
      status.textContent = 'New registrations update automatically.';
      // Catch registrations missed while initially connecting or reconnecting.
      queueRegistrationRefresh();
    });
    channel.bind('attendee.registered', () => { if (current()) queueRegistrationRefresh(); });
    channel.bind('pusher:subscription_error', () => {
      if (current()) status.textContent = 'Live updates unavailable. Search again to get the latest users.';
    });
  } catch {
    stopRegistrationUpdates();
    status.textContent = 'Live updates unavailable. Search again to get the latest users.';
  }
}
async function restoreSession() {
  if (!window.__TAURI__ || authenticating) return;
  authenticating = true;
  const button = $('#sign-in'), retry = $('#restore-session');
  button.disabled = true; retry.disabled = true; button.textContent = 'Restoring session…';
  try {
    const saved = localStorage.getItem(sessionStorageKey);
    if (!saved) return;
    let session;
    try { session = JSON.parse(saved); } catch { showLogin(); return; }
    if (!session || typeof session.token !== 'string' || !session.token || typeof session.apiBase !== 'string') { showLogin(); return; }
    apiBase = await window.__TAURI__.core.invoke('get_api_base_url');
    // Never send a saved token to a different server after configuration changes.
    if (session.apiBase !== apiBase) { showLogin(); return; }
    token = session.token;
    const body = await request('/api/admin/user');
    try { validateAccount(body.data); } catch (error) { showLogin(error.message); return; }
    $('#login-error').textContent = '';
    await enterWorkspace(body.data, body.realtime);
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      showLogin('Your session expired or access changed. Please sign in again.');
    } else {
      // Keep the saved session during outages so retrying does not require a password.
      token = ''; account = null;
      $('#login-error').textContent = `Could not restore your session. ${error.message || error}`;
      retry.hidden = false;
    }
  } finally {
    authenticating = false;
    button.disabled = false; retry.disabled = false;
    button.innerHTML = 'Sign in <span aria-hidden="true">→</span>';
  }
}
$('#restore-session').addEventListener('click', restoreSession);
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (authenticating) return;
  authenticating = true;
  $('#restore-session').disabled = true; $('#login-error').textContent = '';
  const button = $('#sign-in'); button.disabled = true; button.textContent = 'Signing in…';
  try {
    if (!window.__TAURI__) throw new Error('Open the desktop app to sign in.');
    apiBase = await window.__TAURI__.core.invoke('get_api_base_url');
    const body = await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ email: $('#email').value.trim(), password: $('#password').value, device_name: 'NFC desktop' }) });
    if (!body.token) throw new Error('The server did not return a login token.');
    validateAccount(body.user);
    localStorage.setItem(sessionStorageKey, JSON.stringify({ token: body.token, apiBase }));
    token = body.token;
    await enterWorkspace(body.user, body.realtime);
  } catch (error) { $('#login-error').textContent = error.message; }
  finally { authenticating = false; $('#restore-session').disabled = false; button.disabled = false; button.innerHTML = 'Sign in <span aria-hidden="true">→</span>'; }
});

async function loadUsers() {
  if (!token || !canAssign()) return;
  clearTimeout(searchTimer);
  searchTimer = undefined;
  const generation = ++refreshGeneration;
  const params = new URLSearchParams({ per_page: $('#page-size').value, page: String(page), assignment_status: filter });
  const search = $('#search').value.trim();
  if (search) params.set('search', search);
  loading = true; users = []; $('#loading').textContent = 'Loading users…'; render();
  try {
    const body = await request(`/api/admin/users?${params}`);
    if (generation !== refreshGeneration) return;
    if (!Array.isArray(body.data)) throw new Error('The server returned an invalid user list.');
    if (!Number.isInteger(body.total) || body.total < 0 || !Number.isInteger(body.current_page) || body.current_page < 1 || !Number.isInteger(body.last_page) || body.last_page < 1) throw new Error('The server returned invalid pagination.');
    if (!body.counts || ['all', 'assigned', 'unassigned', 'redeemed'].some(key => !Number.isInteger(body.counts[key]) || body.counts[key] < 0)) throw new Error('The server did not return valid assignment counts. Update the server API.');
    listTotal = body.total; listLastPage = body.last_page; listCounts = body.counts;
    page = body.current_page;
    // Removing the last result on a page can reduce the number of pages.
    if (page > listLastPage) { page = listLastPage; return await loadUsers(); }
    users = body.data;
  } catch (error) { if (token && generation === refreshGeneration) message(`Could not load users. ${error.message}`, true); }
  finally {
    if (generation === refreshGeneration) { loading = false; $('#loading').textContent = ''; render(); }
  }
}
function hasRedeemed(user) {
  return user.redeemed === true || (Array.isArray(user.completed_station_ids) && user.completed_station_ids.map(Number).includes(4));
}
function canLinkUser(user) {
  return !hasRedeemed(user) && user.can_link_nfc !== false;
}
function stationProgress(user) {
  if (!Array.isArray(user.completed_station_ids)) return hasRedeemed(user) ? 'Reward redeemed' : 'Progress unavailable';
  const completed = new Set(user.completed_station_ids.map(Number).filter(id => [1, 2, 3, 4].includes(id)));
  return completed.size === 3 && [1, 2, 3].every(id => completed.has(id)) ? 'Ready for reward · 3/4' : `${completed.size}/4 stations completed`;
}
function cell(row, text, className = '') {
  const td = document.createElement('td'); td.textContent = text; td.className = className; row.append(td); return td;
}
function render() {
  $('#total-count').textContent = listCounts.all; $('#assigned-count').textContent = listCounts.assigned;
  $('#unassigned-count').textContent = listCounts.unassigned; $('#all-filter-count').textContent = listCounts.all;
  const size = Number($('#page-size').value), start = (page - 1) * size;
  $('#users-body').replaceChildren();
  if (!users.length) {
    const row = document.createElement('tr'); const td = cell(row, '', 'empty'); td.colSpan = 6;
    const tile = document.createElement('span'); tile.className = 'tile'; tile.textContent = '▣'; tile.setAttribute('aria-hidden', 'true');
    const title = document.createElement('strong'); title.textContent = loading ? 'Loading users…' : 'No users found';
    const description = document.createElement('p'); description.textContent = loading ? 'Fetching the latest card assignments.' : 'Try a different search or assignment filter.';
    td.append(tile, title, description); $('#users-body').append(row);
  }
  for (const user of users) {
    const row = document.createElement('tr'); cell(row, `#${user.id}`); cell(row, user.mobile_number || user.code || '—'); cell(row, user.rfid_uid || '—', 'uid');
    const redeemed = hasRedeemed(user);
    const status = cell(row, ''); const badge = document.createElement('span'); badge.className = `badge ${redeemed || user.rfid_uid ? 'success' : 'neutral'}`; badge.textContent = redeemed ? 'Reward redeemed' : user.rfid_uid ? 'Assigned' : 'Unassigned'; status.append(badge);
    const progress = cell(row, ''); const progressBadge = document.createElement('span'); progressBadge.className = `badge ${redeemed ? 'success' : 'neutral'}`; progressBadge.textContent = stationProgress(user); progress.append(progressBadge);
    const actions = cell(row, ''); const group = document.createElement('div'); group.className = 'row-actions';
    if (canLinkUser(user)) {
      const link = document.createElement('button'); link.className = 'link-action'; link.disabled = loading; link.textContent = user.rfid_uid ? 'Replace card' : 'Link card'; link.setAttribute('aria-label', `${link.textContent} for user ${user.id}`); link.addEventListener('click', () => openCard(user, link)); group.append(link);
    } else { const closed = document.createElement('span'); closed.className = 'linking-closed'; closed.textContent = 'Linking closed'; group.append(closed); }
    if (user.rfid_uid) { const unlink = document.createElement('button'); unlink.className = 'danger'; unlink.disabled = loading; unlink.textContent = 'Unassign'; unlink.setAttribute('aria-label', `Unassign card for user ${user.id}`); unlink.addEventListener('click', () => openUnassign(user, unlink)); group.append(unlink); }
    actions.append(group); $('#users-body').append(row);
  }
  $('#result-count').textContent = loading ? 'Loading users…' : users.length ? `${start + 1}–${start + users.length} of ${listTotal} users` : '0 users';
  $('#page-label').textContent = `Page ${page} of ${listLastPage}`; $('#previous').disabled = loading || page <= 1; $('#next').disabled = loading || page >= listLastPage;
}
$('#search').addEventListener('input', () => {
  clearTimeout(searchTimer); refreshGeneration++; page = 1; users = [];
  loading = true; render();
  searchTimer = setTimeout(() => { message(''); void loadUsers(); }, 300);
});
$('#page-size').addEventListener('change', () => { page = 1; message(''); void loadUsers(); });
$('#previous').addEventListener('click', () => { if (!loading && page > 1) { page--; message(''); void loadUsers(); } });
$('#next').addEventListener('click', () => { if (!loading && page < listLastPage) { page++; message(''); void loadUsers(); } });
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter; page = 1; document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); message(''); void loadUsers();
}));
function openCard(user, button) {
  if (!canAssign()) return;
  if (!canLinkUser(user)) { message('This attendee has already redeemed their reward. Card linking is closed.', true); return; }
  activeUser = user; capturedUid = ''; busy = false; opener = button;
  $('#manual-assignment-uid').value = '';
  $('#dialog-title').textContent = user.rfid_uid ? 'Replace card' : 'Link card';
  $('#dialog-user').textContent = `User #${user.id} · ${user.mobile_number || user.code || user.email || 'No mobile number'}`;
  $('#dialog-error').textContent = ''; $('#replace-warning').hidden = !user.rfid_uid;
  $('#replace-warning').textContent = `Current UID: ${user.rfid_uid}. Linking a new card will replace this assignment.`;
  $('#link-card').textContent = user.rfid_uid ? 'Confirm replacement' : 'Link card';
  updateCapture(); cardDialog.showModal(); $('#card-cancel').focus();
}
function updateCapture() {
  $('#captured-uid').textContent = capturedUid || 'Waiting for card…';
  $('#capture-status').textContent = isManual() ? (capturedUid ? 'Manual UID ready. Review it before linking.' : 'Enter a card UID above.') : readerError || (!selectedReader ? 'Connect and select an NFC reader first.' : capturedUid ? 'Card captured. Review the UID before linking.' : 'Place a card on the selected reader.');
  $('#link-card').disabled = busy || !capturedUid || !readerReady() || !activeUser || !canLinkUser(activeUser);
  renderManualControls();
}
$('#card-cancel').addEventListener('click', () => { if (!busy) cardDialog.close(); });
cardDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
cardDialog.addEventListener('close', () => { activeUser = null; capturedUid = ''; opener?.focus(); });
$('#link-card').addEventListener('click', async () => {
  if (!token || !canAssign() || busy || !activeUser || !capturedUid || !readerReady() || !canLinkUser(activeUser)) return;
  const user = activeUser, uid = capturedUid; busy = true; updateCapture(); $('#card-cancel').disabled = true; $('.dialog-close').disabled = true; $('#link-card').textContent = 'Linking…';
  try {
    await request(`/api/admin/users/${encodeURIComponent(user.id)}/nfc`, { method: 'PUT', body: JSON.stringify({ rfid_uid: uid }) });
    user.rfid_uid = uid; message(`Card ${uid} assigned to user #${user.id}.`); cardDialog.close(); await loadUsers();
  } catch (error) { $('#dialog-error').textContent = error.message; }
  finally { busy = false; $('#card-cancel').disabled = false; $('.dialog-close').disabled = false; $('#link-card').textContent = user.rfid_uid ? 'Confirm replacement' : 'Link card'; updateCapture(); }
});
function openConfirm(title, description, label, task, button) {
  opener = button; confirmTask = task; $('#confirm-title').textContent = title; $('#confirm-description').textContent = description; $('#confirm-action').textContent = label; $('#confirm-error').textContent = ''; confirmDialog.showModal(); $('#confirm-cancel').focus();
}
function openUnassign(user, button) {
  if (!canAssign()) return;
  openConfirm('Unassign this card?', `Card ${user.rfid_uid} will be removed from user #${user.id}. You can link a card again later.`, 'Yes, unassign', async () => {
    await request(`/api/admin/users/${encodeURIComponent(user.id)}/nfc`, { method: 'DELETE' }); user.rfid_uid = null; message(`Card unassigned from user #${user.id}.`); await loadUsers();
  }, button);
}
$('#logout').addEventListener('click', event => openConfirm('Log out?', 'You will need to sign in again to use the workspace.', 'Yes, log out', async () => { await request('/api/admin/logout', { method: 'POST' }); showLogin(); }, event.currentTarget));
$('#confirm-cancel').addEventListener('click', () => { if (!busy) confirmDialog.close(); });
confirmDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); }); confirmDialog.addEventListener('close', () => opener?.focus());
$('#confirm-action').addEventListener('click', async () => {
  if (busy) return; busy = true; const button = $('#confirm-action'), label = button.textContent; button.disabled = true; $('#confirm-cancel').disabled = true; button.textContent = 'Please wait…';
  try { await confirmTask(); confirmDialog.close(); } catch (error) { $('#confirm-error').textContent = error.message; }
  finally { busy = false; button.disabled = false; $('#confirm-cancel').disabled = false; button.textContent = label; }
});

function renderReader() {
  const connected = readerReady();
  $('#reader-status').textContent = isManual() ? 'Manual NFC mode' : connected ? 'Reader connected' : 'Reader disconnected'; $('#reader-status').className = `badge ${connected ? 'success' : 'neutral'}`;
  $('#reader-detail').textContent = isManual() ? 'Development testing: type a card UID to simulate NFC.' : readerError || (selectedReader ? (isStation() ? 'Ready to read. Tap an NFC card to check in.' : 'Ready to read. Select a user to link a card.') : 'Connect a USB NFC reader.');
  $('#reader').disabled = isManual(); $('#lookup-reader').disabled = isManual();
  updateCapture(); renderLookupReader();
}
function handleReaderStatus(status) {
  readers = status.readers || []; readerError = status.error || '';
  if (!readers.includes(selectedReader)) { selectedReader = readers.length === 1 ? readers[0] : ''; if (!isManual()) capturedUid = ''; }
  $('#reader').replaceChildren();
  if (!selectedReader) { const option = new Option(readers.length ? 'Select a reader…' : 'No reader available', ''); $('#reader').append(option); }
  readers.forEach(reader => $('#reader').append(new Option(reader, reader))); $('#reader').value = selectedReader;
  const cards = status.cards || {}, card = cards[selectedReader];
  if (!isManual() && cardDialog.open && !busy && card && card.uid !== readerCards[selectedReader]?.uid) { capturedUid = card.uid; $('#dialog-error').textContent = ''; }
  const newTap = !isManual() && card && card.uid !== readerCards[selectedReader]?.uid;
  const stationTap = isStation() && !lookupDialog.open && newTap;
  const lookupTap = canAssign() && lookupDialog.open && newTap;
  readerCards = cards; renderReader();
  if (lookupTap) void lookupCard(card.uid);
  else if (stationTap) void checkInCard(card.uid);
}
$('#reader').addEventListener('change', () => { selectedReader = $('#reader').value; capturedUid = ''; renderReader(); });
async function connectReader() {
  if (!window.__TAURI__) { readerError = 'Open the desktop app to access the USB NFC reader.'; renderReader(); return; }
  try { unlisten = await window.__TAURI__.event.listen('nfc-status', ({ payload }) => handleReaderStatus(payload)); handleReaderStatus(await window.__TAURI__.core.invoke('get_nfc_status')); }
  catch (error) { readerError = `Cannot connect to the reader: ${error}`; renderReader(); }
}
window.addEventListener('beforeunload', () => { stopRegistrationUpdates(); unlisten?.(); });
render(); connectReader();
void restoreSession();
void initializeDevMode();

async function initializeDevMode() {
  try { devMode = window.__TAURI__ && await window.__TAURI__.core.invoke('is_dev_mode') === true; }
  catch { devMode = false; }
  renderManualControls();
}
function renderManualControls() {
  const manual = isManual();
  $('#dev-controls').hidden = !devMode;
  $('#manual-mode').disabled = busy || Boolean(stationJob) || Boolean(lookupJob);
  $('#manual-assignment').hidden = !manual;
  $('#manual-assignment-uid').disabled = busy;
  $('#manual-station').hidden = !manual || !isStation();
  $('#manual-station-tap').disabled = !token || Boolean(stationJob) || rewardDialog.open;
  $('#manual-lookup').hidden = !manual;
  $('#manual-lookup-tap').disabled = !token || Boolean(lookupJob);
  $('#station-instructions').textContent = manual ? 'Enter an assigned card UID and click Simulate tap to check in.' : "Tap an attendee's NFC card on the selected reader to check in. Remove the card before the next tap.";
}
$('#manual-mode').addEventListener('change', () => {
  if (busy || stationJob || lookupJob) { $('#manual-mode').checked = isManual(); return; }
  manualEnabled = devMode && $('#manual-mode').checked;
  $('#manual-mode').checked = isManual(); capturedUid = '';
  $('#manual-assignment-uid').value = ''; $('#dialog-error').textContent = '';
  clearLookup(); renderReader();
});
function manualUid(selector) {
  const uid = $(selector).value.trim();
  if (!uid || uid.length > 64) throw new Error('Enter a card UID between 1 and 64 characters.');
  return uid;
}
$('#manual-assignment-uid').addEventListener('input', () => {
  if (!isManual() || busy || !cardDialog.open) return;
  try { capturedUid = manualUid('#manual-assignment-uid'); $('#dialog-error').textContent = ''; }
  catch (error) { capturedUid = ''; $('#dialog-error').textContent = error.message; }
  updateCapture();
});
$('#manual-station').addEventListener('submit', async event => {
  event.preventDefault();
  if (!isManual() || !token || !isStation() || stationJob || rewardDialog.open) return;
  try { const uid = manualUid('#manual-station-uid'); $('#manual-station-error').textContent = ''; await checkInCard(uid); }
  catch (error) { $('#manual-station-error').textContent = error.message; }
});
$('#manual-lookup').addEventListener('submit', async event => {
  event.preventDefault();
  if (!isManual() || !token || !canAssign() || !lookupDialog.open || lookupJob) return;
  try { await lookupCard(manualUid('#manual-lookup-uid')); }
  catch (error) { $('#lookup-error').textContent = error.message; }
});
