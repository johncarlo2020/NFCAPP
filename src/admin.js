const $ = selector => document.querySelector(selector);
let token = '', apiBase = '', users = [], filter = 'all', page = 1, selectedReader = '', readers = [], readerCards = {}, readerError = '', unlisten;
let activeUser = null, capturedUid = '', busy = false, loading = false, refreshGeneration = 0, confirmTask = null;
let opener;
const cardDialog = $('#card-dialog'), confirmDialog = $('#confirm-dialog');

function message(text, error = false) {
  $('#notice').textContent = text;
  $('#notice').className = `notice${error ? ' error' : ''}`;
  $('#notice').hidden = !text;
}
function showLogin(reason = '') {
  token = ''; users = []; refreshGeneration++; loading = false;
  cardDialog.close(); confirmDialog.close();
  $('#workspace').hidden = true; $('#login-screen').hidden = false;
  $('#login-error').textContent = reason; $('#password').value = '';
}
async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) showLogin('Your session expired. Please sign in again.');
    const errors = Object.values(body.errors || {}).flat().join(' ');
    throw new Error(errors || body.message || (response.status === 429 ? 'Too many attempts. Please try again later.' : `Request failed (${response.status}).`));
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
    token = body.token;
    $('#password').value = ''; $('#admin-name').textContent = body.user?.email || $('#email').value;
    $('#login-screen').hidden = true; $('#workspace').hidden = false;
    message(''); await loadUsers();
  } catch (error) { $('#login-error').textContent = error.message; }
  finally { button.disabled = false; button.innerHTML = 'Sign in <span aria-hidden="true">→</span>'; }
});

async function loadUsers() {
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
function exportRows() { return [['User ID', 'Mobile number', 'NFC UID', 'Status'], ...filteredUsers().map(user => [user.id, user.mobile_number || user.code || '', user.rfid_uid || '', user.rfid_uid ? 'Assigned' : 'Unassigned'])]; }
// Protect spreadsheet imports from formula execution while preserving the visible UID in the app.
function exportValue(value) { const text = String(value); return /^[\s]*[=+@-]/.test(text) ? `'${text}` : text; }
$('#export-csv').addEventListener('click', () => {
  const csv = exportRows().map(row => row.map(value => `"${exportValue(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'nfc-assignments.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); $('#export-menu').open = false; message(`Exported ${filteredUsers().length} filtered users.`);
});
$('#export-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(exportRows().map(row => row.map(value => exportValue(value).replace(/[\t\r\n]/g, ' ')).join('\t')).join('\n')); message(`Copied ${filteredUsers().length} filtered users.`); }
  catch { message('Clipboard access failed. Use Download CSV instead.', true); }
  $('#export-menu').open = false;
});
function openCard(user, button) {
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
  openConfirm('Unassign this card?', `Card ${user.rfid_uid} will be removed from user #${user.id}. You can link a card again later.`, 'Yes, unassign', async () => {
    await request(`/api/admin/users/${encodeURIComponent(user.id)}/nfc`, { method: 'DELETE' }); user.rfid_uid = null; render(); message(`Card unassigned from user #${user.id}.`);
  }, button);
}
$('#logout').addEventListener('click', event => openConfirm('Log out?', 'You will need to sign in again to manage card assignments.', 'Yes, log out', async () => { await request('/api/admin/logout', { method: 'POST' }); showLogin(); }, event.currentTarget));
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
  $('#reader-detail').textContent = readerError || (selectedReader ? 'Ready to read. Select a user to link a card.' : 'Connect a USB reader to link cards.');
  updateCapture();
}
function handleReaderStatus(status) {
  readers = status.readers || []; readerError = status.error || '';
  if (!readers.includes(selectedReader)) { selectedReader = readers.length === 1 ? readers[0] : ''; capturedUid = ''; }
  $('#reader').replaceChildren();
  if (!selectedReader) { const option = new Option(readers.length ? 'Select a reader…' : 'No reader available', ''); $('#reader').append(option); }
  readers.forEach(reader => $('#reader').append(new Option(reader, reader))); $('#reader').value = selectedReader;
  const cards = status.cards || {}, card = cards[selectedReader];
  if (cardDialog.open && !busy && card && card.uid !== readerCards[selectedReader]?.uid) { capturedUid = card.uid; $('#dialog-error').textContent = ''; }
  readerCards = cards; renderReader();
}
$('#reader').addEventListener('change', () => { selectedReader = $('#reader').value; capturedUid = ''; renderReader(); });
async function connectReader() {
  if (!window.__TAURI__) { readerError = 'Open the desktop app to access the USB NFC reader.'; renderReader(); return; }
  try { unlisten = await window.__TAURI__.event.listen('nfc-status', ({ payload }) => handleReaderStatus(payload)); handleReaderStatus(await window.__TAURI__.core.invoke('get_nfc_status')); }
  catch (error) { readerError = `Cannot connect to the reader: ${error}`; renderReader(); }
}
window.addEventListener('beforeunload', () => unlisten?.());
render(); connectReader();
