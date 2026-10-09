const $ = selector => document.querySelector(selector);
let token = '', apiBase = '', users = [], filter = 'all', page = 1, selectedReader = '', readers = [], readerCards = {}, readerError = '', unlisten;
let activeUser = null, capturedUid = '', busy = false, loading = false, refreshGeneration = 0, confirmTask = null;
let opener, account = null, stationJob = null;
const canAssign = () => account?.role === 'admin' || account?.staff_function === 'register';
const isStation = () => account?.role !== 'admin' && account?.staff_function === 'station';
const cardDialog = $('#card-dialog'), confirmDialog = $('#confirm-dialog'), lookupDialog = $('#lookup-dialog');
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
  if (!lookupJob) $('#lookup-status').textContent = readerError || (!selectedReader ? 'Connect and select an NFC reader first.' : $('#lookup-details').hidden ? 'Tap a card on the selected reader.' : 'Customer found. Tap another card to search again.');
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
  if (!token || !canAssign() || !lookupDialog.open || !selectedReader || readerError) return;
  clearLookup(); const job = { token }; lookupJob = job;
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
  } finally { if (lookupJob === job) lookupJob = null; }
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
  if (!token || !isStation() || stationJob || !selectedReader || readerError) return;
  const job = { token }; stationJob = job;
  $('#station-card-uid').textContent = uid;
  $('#station-result').hidden = false; $('#station-result').className = 'notice';
  $('#station-result').textContent = 'Checking in…';
  try {
    const body = await request('/api/admin/stations/check-in', { method: 'POST', body: JSON.stringify({ rfid_uid: uid }) });
    if (stationJob !== job || token !== job.token) return;
    const accepted = body.status === 'success' || body.status === 'duplicate';
    $('#station-result').className = accepted ? 'notice' : 'notice error';
    $('#station-result').textContent = body.message || (body.status === 'success' ? 'Station checked in successfully.' : body.status === 'duplicate' ? 'Already checked in at this station.' : 'Check-in was not confirmed. Verify the result before tapping again.');
  } catch (error) {
    if (stationJob !== job || token !== job.token) return;
    $('#station-result').className = 'notice error';
    $('#station-result').textContent = error.status >= 500 || !error.status
      ? 'Check-in outcome uncertain. Verify the result before tapping again.'
      : error.message;
  } finally { if (stationJob === job) stationJob = null; }
}

function showLogin(reason = '') {
  token = ''; account = null; stationJob = null; users = []; refreshGeneration++; loading = false;
  $('#station-result').hidden = true; $('#station-result').textContent = ''; $('#station-card-uid').textContent = 'Waiting for card…';
  renderAccount(); $('#admin-name').textContent = 'Staff';
  clearLookup(); lookupDialog.close(); cardDialog.close(); confirmDialog.close();
  $('#workspace').hidden = true; $('#login-screen').hidden = false;
  $('#login-error').textContent = reason; $('#password').value = '';
}
async function request(path, options = {}) {
  const requestToken = token;
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token && token === requestToken) showLogin('Your session expired. Please sign in again.');
    const errors = Object.values(body.errors || {}).flat().join(' ');
    const error = new Error(errors || body.message || (response.status === 429 ? 'Too many attempts. Please try again later.' : `Request failed (${response.status}).`));
    error.status = response.status; throw error;
  }
  return body;
}
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#login-error').textContent = '';
  const button = $('#sign-in'); button.disabled = true; button.textContent = 'Signing in…';
  try {
    if (!window.__TAURI__) throw new Error('Open the desktop app to sign in.');
    apiBase = await window.__TAURI__.core.invoke('get_api_base_url');
    const body = await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ email: $('#email').value.trim(), password: $('#password').value, device_name: 'NFC desktop' }) });
    if (!body.token) throw new Error('The server did not return a login token.');
    if (!body.user || !(body.user.role === 'admin' || ['register', 'station'].includes(body.user.staff_function))) throw new Error('The server did not return a supported account type.');
    if (body.user.role !== 'admin' && body.user.staff_function === 'station' && !(Number(body.user.station_id) > 0)) throw new Error('No station is assigned to this account.');
    token = body.token; account = body.user; refreshGeneration++;
    renderWorkspace();
    $('#password').value = ''; $('#admin-name').textContent = body.user?.email || $('#email').value;
    renderAccount(body.user || {});
    $('#login-screen').hidden = true; $('#workspace').hidden = false;
    message(''); if (canAssign()) await loadUsers();
  } catch (error) { $('#login-error').textContent = error.message; }
  finally { button.disabled = false; button.innerHTML = 'Sign in <span aria-hidden="true">→</span>'; }
});

async function loadUsers() {
  if (!token || !canAssign()) return;
  const generation = ++refreshGeneration;
  loading = true; $('#loading').textContent = 'Refreshing users…'; $('#refresh').disabled = true; render();
  try {
    const result = []; let nextPage = 1, lastPage = 1;
    do {
      const body = await request(`/api/admin/users?per_page=100&page=${nextPage}`);
      if (generation !== refreshGeneration) return;
      if (!Array.isArray(body.data)) throw new Error('The server returned an invalid user list.');
      result.push(...body.data); lastPage = Number(body.last_page || 1);
      if (!Number.isInteger(lastPage) || lastPage < 1) throw new Error('The server returned invalid pagination.');
      nextPage++;
    } while (nextPage <= lastPage);
    users = [...new Map(result.map(user => [user.id, user])).values()];
  } catch (error) { if (token && generation === refreshGeneration) message(`Could not refresh users. ${error.message}`, true); }
  finally {
    if (generation === refreshGeneration) { loading = false; $('#loading').textContent = ''; $('#refresh').disabled = false; render(); }
  }
}
function filteredUsers() {
  const search = $('#search').value.trim().toLowerCase();
  return users.filter(user => {
    const assigned = Boolean(user.rfid_uid);
    const mobile = String(user.mobile_number || user.code || '').toLowerCase();
    return (filter === 'all' || (filter === 'assigned' ? assigned : !assigned)) && (!search || String(user.id) === search || mobile.includes(search));
  });
}
function cell(row, text, className = '') {
  const td = document.createElement('td'); td.textContent = text; td.className = className; row.append(td); return td;
}
function render() {
  $('#total-count').textContent = users.length; $('#assigned-count').textContent = users.filter(user => user.rfid_uid).length;
  $('#unassigned-count').textContent = users.filter(user => !user.rfid_uid).length; $('#all-filter-count').textContent = users.length;
  const filtered = filteredUsers(), size = Number($('#page-size').value), pages = Math.max(1, Math.ceil(filtered.length / size));
  page = Math.min(page, pages); const start = (page - 1) * size;
  $('#users-body').replaceChildren();
  if (!filtered.length) {
    const row = document.createElement('tr'); const td = cell(row, '', 'empty'); td.colSpan = 5;
    const tile = document.createElement('span'); tile.className = 'tile'; tile.textContent = '▣'; tile.setAttribute('aria-hidden', 'true');
    const title = document.createElement('strong'); title.textContent = loading ? 'Loading users…' : 'No users found';
    const description = document.createElement('p'); description.textContent = loading ? 'Fetching the latest card assignments.' : 'Try a different search or assignment filter.';
    td.append(tile, title, description); $('#users-body').append(row);
  }
  for (const user of filtered.slice(start, start + size)) {
    const row = document.createElement('tr'); cell(row, `#${user.id}`); cell(row, user.mobile_number || user.code || '—'); cell(row, user.rfid_uid || '—', 'uid');
    const status = cell(row, ''); const badge = document.createElement('span'); badge.className = `badge ${user.rfid_uid ? 'success' : 'neutral'}`; badge.textContent = user.rfid_uid ? 'Assigned' : 'Unassigned'; status.append(badge);
    const actions = cell(row, ''); const group = document.createElement('div'); group.className = 'row-actions';
    const link = document.createElement('button'); link.className = 'link-action'; link.disabled = loading; link.textContent = user.rfid_uid ? 'Replace card' : 'Link card'; link.setAttribute('aria-label', `${link.textContent} for user ${user.id}`); link.addEventListener('click', () => openCard(user, link)); group.append(link);
    if (user.rfid_uid) { const unlink = document.createElement('button'); unlink.className = 'danger'; unlink.disabled = loading; unlink.textContent = 'Unassign'; unlink.setAttribute('aria-label', `Unassign card for user ${user.id}`); unlink.addEventListener('click', () => openUnassign(user, unlink)); group.append(unlink); }
    actions.append(group); $('#users-body').append(row);
  }
  $('#result-count').textContent = filtered.length ? `${start + 1}–${Math.min(start + size, filtered.length)} of ${filtered.length} users` : '0 users';
  $('#page-label').textContent = `Page ${page} of ${pages}`; $('#previous').disabled = page <= 1; $('#next').disabled = page >= pages;
}
$('#refresh').addEventListener('click', () => { message(''); loadUsers(); });
$('#search').addEventListener('input', () => { page = 1; render(); });
$('#page-size').addEventListener('change', () => { page = 1; render(); });
$('#previous').addEventListener('click', () => { page--; render(); }); $('#next').addEventListener('click', () => { page++; render(); });
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter; page = 1; document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); render();
}));
function openCard(user, button) {
  if (!canAssign()) return;
  activeUser = user; capturedUid = ''; busy = false; opener = button;
  $('#dialog-title').textContent = user.rfid_uid ? 'Replace card' : 'Link card';
  $('#dialog-user').textContent = `User #${user.id} · ${user.mobile_number || user.code || user.email || 'No mobile number'}`;
  $('#dialog-error').textContent = ''; $('#replace-warning').hidden = !user.rfid_uid;
  $('#replace-warning').textContent = `Current UID: ${user.rfid_uid}. Linking a new card will replace this assignment.`;
  $('#link-card').textContent = user.rfid_uid ? 'Confirm replacement' : 'Link card';
  updateCapture(); cardDialog.showModal(); $('#card-cancel').focus();
}
function updateCapture() {
  $('#captured-uid').textContent = capturedUid || 'Waiting for card…';
  $('#capture-status').textContent = readerError || (!selectedReader ? 'Connect and select an NFC reader first.' : capturedUid ? 'Card captured. Review the UID before linking.' : 'Place a card on the selected reader.');
  $('#link-card').disabled = busy || !capturedUid || !selectedReader || Boolean(readerError);
}
$('#card-cancel').addEventListener('click', () => { if (!busy) cardDialog.close(); });
cardDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
cardDialog.addEventListener('close', () => { activeUser = null; capturedUid = ''; opener?.focus(); });
$('#link-card').addEventListener('click', async () => {
  if (busy || !activeUser || !capturedUid) return;
  const user = activeUser, uid = capturedUid; busy = true; updateCapture(); $('#card-cancel').disabled = true; $('.dialog-close').disabled = true; $('#link-card').textContent = 'Linking…';
  try {
    await request(`/api/admin/users/${encodeURIComponent(user.id)}/nfc`, { method: 'PUT', body: JSON.stringify({ rfid_uid: uid }) });
    user.rfid_uid = uid; render(); message(`Card ${uid} assigned to user #${user.id}.`); cardDialog.close();
  } catch (error) { $('#dialog-error').textContent = error.message; }
  finally { busy = false; $('#card-cancel').disabled = false; $('.dialog-close').disabled = false; $('#link-card').textContent = user.rfid_uid ? 'Confirm replacement' : 'Link card'; updateCapture(); }
});
function openConfirm(title, description, label, task, button) {
  opener = button; confirmTask = task; $('#confirm-title').textContent = title; $('#confirm-description').textContent = description; $('#confirm-action').textContent = label; $('#confirm-error').textContent = ''; confirmDialog.showModal(); $('#confirm-cancel').focus();
}
function openUnassign(user, button) {
  if (!canAssign()) return;
  openConfirm('Unassign this card?', `Card ${user.rfid_uid} will be removed from user #${user.id}. You can link a card again later.`, 'Yes, unassign', async () => {
    await request(`/api/admin/users/${encodeURIComponent(user.id)}/nfc`, { method: 'DELETE' }); user.rfid_uid = null; render(); message(`Card unassigned from user #${user.id}.`);
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
  const connected = Boolean(selectedReader) && !readerError;
  $('#reader-status').textContent = connected ? 'Reader connected' : 'Reader disconnected'; $('#reader-status').className = `badge ${connected ? 'success' : 'neutral'}`;
  $('#reader-detail').textContent = readerError || (selectedReader ? (isStation() ? 'Ready to read. Tap an NFC card to check in.' : 'Ready to read. Select a user to link a card.') : 'Connect a USB NFC reader.');
  updateCapture(); renderLookupReader();
}
function handleReaderStatus(status) {
  readers = status.readers || []; readerError = status.error || '';
  if (!readers.includes(selectedReader)) { selectedReader = readers.length === 1 ? readers[0] : ''; capturedUid = ''; }
  $('#reader').replaceChildren();
  if (!selectedReader) { const option = new Option(readers.length ? 'Select a reader…' : 'No reader available', ''); $('#reader').append(option); }
  readers.forEach(reader => $('#reader').append(new Option(reader, reader))); $('#reader').value = selectedReader;
  const cards = status.cards || {}, card = cards[selectedReader];
  if (cardDialog.open && !busy && card && card.uid !== readerCards[selectedReader]?.uid) { capturedUid = card.uid; $('#dialog-error').textContent = ''; }
  const newTap = card && card.uid !== readerCards[selectedReader]?.uid;
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
window.addEventListener('beforeunload', () => unlisten?.());
render(); connectReader();
