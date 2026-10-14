import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../src/admin.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
const elements = new Map();
function node() { return { value: '', textContent: '', hidden: false, open: false, children: [], addEventListener(type, fn) { if (type === 'close') this.onclose = fn; else this[type] = fn; }, append(...items) { this.children.push(...items); }, replaceChildren() { this.children = []; }, setAttribute() {}, close() { this.open = false; this.onclose?.(); }, focus() {}, showModal() { this.open = true; } }; }
function select(selector) {
  if (selector.startsWith('#')) assert.ok(ids.has(selector.slice(1)), 'Missing element ' + selector);
  if (!elements.has(selector)) elements.set(selector, node());
  return elements.get(selector);
}
select('#page-size').value = '25';
let user, reply = { status: 'success', message: 'Checked in' }, httpStatus = 200, pending;
const calls = [];
const storage = new Map();
const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
let context = vm.createContext({ console, localStorage, document: { querySelector: select, querySelectorAll: () => [], createElement: node }, Option: function(text, value) { this.textContent = text; this.value = value; }, window: { addEventListener() {}, __TAURI__: { core: { invoke: async () => 'https://example.test' } } }, fetch: async (url, options) => {
  calls.push({ url, options });
  if (url.endsWith('/login')) return { ok: true, status: 200, json: async () => ({ token: user.email, user }) };
  if (url.endsWith('/api/admin/user')) return { ok: httpStatus < 400, status: httpStatus, json: async () => ({ data: user }) };
  if (url.includes('/users?')) return { ok: true, status: 200, json: async () => ({ data: [], last_page: 1 }) };
  if (pending) await pending;
  return { ok: httpStatus < 400, status: httpStatus, json: async () => reply };
} });
const testSource = source.replace('render(); connectReader();', '').replace('void restoreSession();', '').replace('void initializeDevMode();', '');
vm.runInContext(testSource, context);
const run = code => vm.runInContext(code, context);
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
async function login(account) { user = account; select('#email').value = account.email; await select('#login-form').submit({ preventDefault() {} }); assert.equal(select('#login-error').textContent, ''); }
async function tap(uid) { context.status = { readers: ['USB'], cards: uid ? { USB: { uid } } : {} }; run('handleReaderStatus(status)'); await settle(); }
for (const station of [1, 2, 3, 4]) {
  run('showLogin()'); calls.length = 0;
  await login({ email: 'station' + station, role: 'staff', staff_function: 'station', station_id: station });
  assert.equal(calls.length, 1, 'Station login must only request login');
  for (const id of ['assignments', 'assignment-stats', 'assignment-nav', 'assignment-note']) assert.equal(select('#' + id).hidden, true);
  assert.equal(select('#station-view').hidden, false);
  assert.equal(select('#page-title').textContent, 'Station ' + station);
  await run('loadUsers()'); assert.equal(calls.length, 1);
}
await tap(''); calls.length = 0;
await tap('CARD1'); assert.equal(calls.length, 1);
assert.ok(calls[0].url.endsWith('/stations/check-in'));
assert.deepEqual(JSON.parse(calls[0].options.body), { rfid_uid: 'CARD1' });
assert.equal(calls[0].options.headers.Authorization, 'Bearer station4');
assert.equal(select('#station-result').textContent, 'Checked in');
assert.equal(select('#reward-dialog').open, false, 'Successful check-in must not show ineligibility');
await tap('CARD1'); assert.equal(calls.length, 1, 'Held card must not resubmit');
await tap(''); reply = { status: 'duplicate', message: 'Already checked in' }; await tap('CARD1');
assert.equal(select('#station-result').textContent, 'Already checked in');
assert.equal(select('#reward-dialog').open, false, 'Duplicate check-in must not show ineligibility');
await tap(''); reply = { status: 'prerequisites_not_met', message: 'Complete stations first' }; httpStatus = 422; await tap('CARD1');
assert.equal(select('#station-result').className, 'notice error'); assert.equal(select('#station-result').textContent, reply.message);
assert.equal(select('#reward-dialog').open, true); assert.equal(select('#reward-card-uid').textContent, 'CARD1');
const modalCalls = calls.length; await tap(''); await tap('CARD2'); assert.equal(calls.length, modalCalls, 'Dismiss the reward modal before processing another card');
select('#reward-close').click(); assert.equal(select('#reward-dialog').open, false);
await tap(''); httpStatus = 200; await tap('CARD1'); assert.equal(select('#reward-dialog').open, true, 'Inspect prerequisite status even on HTTP 200');
run('showLogin()'); assert.equal(select('#reward-dialog').open, false, 'Reset reward modal when session ends');
await login({ email: 'station4', role: 'staff', staff_function: 'station', station_id: 4 });
await tap(''); httpStatus = 500; reply = { status: 'error', message: 'Server error' }; await tap('CARD1'); assert.match(select('#station-result').textContent, /outcome uncertain/);
assert.equal(select('#reward-dialog').open, false, 'An uncertain error must not claim ineligibility');
const failureCalls = calls.length; await tap('CARD1'); assert.equal(calls.length, failureCalls);
await tap(''); httpStatus = 200; reply = { status: 'error', message: 'Not confirmed' }; await tap('CARD1'); assert.equal(select('#station-result').className, 'notice error');
await tap(''); let release; pending = new Promise(resolve => { release = resolve; }); await tap('CARD1');
const inFlight = calls.length; await tap(''); await tap('CARD2'); assert.equal(calls.length, inFlight, 'Only one check-in may run at a time');
run('showLogin()'); release(); pending = null; await settle(); assert.equal(select('#station-result').hidden, true); assert.equal(select('#station-card-uid').textContent, 'Waiting for card…');
await login({ email: 'station4-stale', role: 'staff', staff_function: 'station', station_id: 4 });
await tap(''); httpStatus = 422; reply = { status: 'prerequisites_not_met', message: 'Complete stations first' };
pending = new Promise(resolve => { release = resolve; }); await tap('STALE'); run('showLogin()'); release(); pending = null; await settle();
assert.equal(select('#reward-dialog').open, false, 'A late prerequisite response cannot reopen the modal after logout');
await login({ email: 'station1-prerequisite', role: 'staff', staff_function: 'station', station_id: 1 });
await tap(''); await tap('EARLY'); assert.equal(select('#reward-dialog').open, false, 'Reward modal only applies to station 4'); run('showLogin()');
httpStatus = 200; reply = { status: 'success', message: 'Checked in' };
for (const account of [{ email: 'register', role: 'staff', staff_function: 'register' }, { email: 'admin', role: 'admin' }]) {
  calls.length = 0; await login(account); assert.ok(calls.some(call => call.url.includes('/users?')));
  assert.equal(select('#assignments').hidden, false); assert.equal(select('#station-view').hidden, true);
  await tap(''); const before = calls.length; await tap('REGISTER-CARD'); assert.equal(calls.length, before, 'Registration/admin taps must not check in');
  run('showLogin()');
}

await login({ email: 'lookup-register', role: 'staff', staff_function: 'register' });
await tap(''); calls.length = 0;
select('#rfid-lookup').click(); assert.equal(select('#lookup-dialog').open, true); assert.equal(select('#lookup-details').hidden, true);
reply = { data: { id: 123, name: '<script>customer</script>', email: 'customer@example.test', mobile_number: '+639171234567', code: 'REG001', rfid_uid: '00AB+&', role: 'client' } }; httpStatus = 200;
await tap('00AB+&'); assert.equal(calls.length, 1); assert.ok(calls[0].url.endsWith('/users/by-rfid?rfid_uid=00AB%2B%26')); assert.equal(calls[0].options.headers.Authorization, 'Bearer lookup-register'); assert.equal(calls[0].options.method, undefined);
assert.equal(select('#lookup-details').hidden, false); assert.equal(select('#lookup-user-id').textContent, '123'); assert.equal(select('#lookup-card').textContent, '00AB+&'); assert.equal(select('#lookup-name').textContent, '<script>customer</script>');
await tap('00AB+&'); assert.equal(calls.length, 1);
await tap(''); reply = { message: 'Not found' }; httpStatus = 404; await tap('UNKNOWN'); assert.equal(select('#lookup-details').hidden, true); assert.equal(select('#lookup-user-id').textContent, ''); assert.match(select('#lookup-error').textContent, /No customer/);
await tap(''); httpStatus = 403; reply = { message: 'Not authorized' }; await tap('FORBIDDEN'); assert.equal(select('#lookup-error').textContent, 'Not authorized');
await tap(''); httpStatus = 200; reply = { data: null }; await tap('INVALID'); assert.match(select('#lookup-error').textContent, /invalid customer/);
await tap(''); pending = new Promise(resolve => { release = resolve; }); reply = { data: { id: 555, rfid_uid: 'PENDING' } }; await tap('PENDING');
select('#lookup-dialog').close(); release(); pending = null; await settle(); assert.equal(select('#lookup-details').hidden, true); assert.equal(select('#lookup-user-id').textContent, '');
const afterClose = calls.length; await tap(''); await tap('CLOSED'); assert.equal(calls.length, afterClose);
select('#rfid-lookup').click(); assert.equal(select('#lookup-uid').textContent, 'Waiting for card…');
await tap(''); pending = new Promise(resolve => { release = resolve; }); await tap('EXPIRED'); run('showLogin()'); release(); pending = null; await settle(); assert.equal(select('#lookup-dialog').open, false); assert.equal(select('#lookup-details').hidden, true);
await login({ email: 'lookup-station', role: 'staff', staff_function: 'station', station_id: 1 }); select('#rfid-lookup').click(); assert.equal(select('#lookup-dialog').open, false); run('showLogin()');
await login({ email: 'lookup-admin', role: 'admin' }); select('#rfid-lookup').click(); assert.equal(select('#lookup-dialog').open, true); select('#lookup-dialog').close();


await login({ email: 'lookup-race', role: 'staff', staff_function: 'register' });
await tap(''); select('#rfid-lookup').click();
const originalFetch = context.fetch; let resolveOld;
context.fetch = async (url, options) => {
  calls.push({ url, options });
  if (url.endsWith('rfid_uid=OLD')) return await new Promise(resolve => { resolveOld = resolve; });
  return { ok: true, status: 200, json: async () => ({ data: { id: 888, rfid_uid: 'NEW' } }) };
};
await tap('OLD'); await tap(''); await tap('NEW'); assert.equal(select('#lookup-user-id').textContent, '888');
resolveOld({ ok: true, status: 200, json: async () => ({ data: { id: 111, rfid_uid: 'OLD' } }) }); await settle(); assert.equal(select('#lookup-user-id').textContent, '888', 'Older response cannot overwrite latest customer');
context.fetch = originalFetch; select('#lookup-dialog').close();
context.status = { readers: [], cards: {} }; run('handleReaderStatus(status)'); select('#rfid-lookup').click(); assert.match(select('#lookup-status').textContent, /Connect and select/); select('#lookup-dialog').close();
run('showLogin()');

await login({ email: 'navigation-register', role: 'staff', staff_function: 'register' });
const navigationToken = run('token'), navigationRequests = calls.length;
select('#rfid-lookup').click(); select('#card-assignments').click();
assert.equal(select('#lookup-dialog').open, false);
assert.equal(select('#workspace').hidden, false);
assert.equal(select('#assignments').hidden, false);
assert.equal(run('token'), navigationToken, 'Assignment navigation must preserve login');
assert.equal(calls.length, navigationRequests, 'Assignment navigation must not reload or request login');
assert.ok(!/<a[^>]*href="index.html"/.test(html), 'Assignment control must not navigate to a new document');

// A new JavaScript context simulates closing and reopening the app, sharing only disk storage.
async function restart(overrides = {}) {
  select('#workspace').hidden = true; select('#login-screen').hidden = false;
  const app = vm.createContext({ ...context, ...overrides });
  vm.runInContext(testSource, app);
  await vm.runInContext('restoreSession()', app);
  return app;
}
const savedKey = 'nfc_staff_session';
for (const profile of [
  { email: 'remember-admin', role: 'admin' },
  { email: 'remember-register', role: 'staff', staff_function: 'register' },
  { email: 'remember-station', role: 'staff', staff_function: 'station', station_id: 4 },
]) {
  await login(profile);
  const saved = JSON.parse(storage.get(savedKey));
  assert.deepEqual(saved, { token: profile.email, apiBase: 'https://example.test' });
  calls.length = 0;
  const app = await restart();
  assert.equal(vm.runInContext('token', app), profile.email);
  assert.equal(select('#workspace').hidden, false);
  assert.equal(select('#login-screen').hidden, true);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${profile.email}`);
  assert.ok(calls[0].url.endsWith('/api/admin/user'));
  assert.ok(!calls.some(call => call.url.endsWith('/login')), 'Reopening must not require credentials');
  assert.equal(select('#station-view').hidden, profile.staff_function !== 'station');
}
let app = await restart({ fetch: async () => { throw new Error('Offline'); } });
assert.ok(storage.has(savedKey), 'Outages must preserve the saved session');
assert.equal(vm.runInContext('token', app), '');
assert.equal(select('#workspace').hidden, true);
assert.equal(select('#restore-session').hidden, false);
app.fetch = context.fetch;
await select('#restore-session').click();
assert.equal(select('#workspace').hidden, false, 'Retry must restore without a password');
httpStatus = 401; app = await restart();
assert.equal(storage.has(savedKey), false, 'Expired tokens must be forgotten');
assert.equal(select('#workspace').hidden, true);
assert.match(select('#login-error').textContent, /expired/);
httpStatus = 200;
await login({ email: 'forbidden-station', role: 'staff', staff_function: 'station', station_id: 1 });
httpStatus = 403; await restart(); assert.equal(storage.has(savedKey), false); httpStatus = 200;
await login({ email: 'logout-station', role: 'staff', staff_function: 'station', station_id: 1 });
select('#logout').click({ currentTarget: select('#logout') }); await select('#confirm-action').click();
assert.equal(storage.has(savedKey), false, 'Explicit logout must clear persisted credentials');
calls.length = 0; await restart(); assert.equal(calls.length, 0, 'Logged-out startup must not restore');
storage.set(savedKey, '{broken'); await restart(); assert.equal(storage.has(savedKey), false);
storage.set(savedKey, 'null'); await restart(); assert.equal(storage.has(savedKey), false);
storage.set(savedKey, JSON.stringify({ token: 'secret', apiBase: 'https://old-server.test' }));
calls.length = 0; await restart(); assert.equal(calls.length, 0, 'Never send saved credentials to a different server');
assert.equal(storage.has(savedKey), false);
await login({ email: 'changed-role', role: 'staff', staff_function: 'station', station_id: 1 });
user = { email: 'changed-role', role: 'client' }; await restart();
assert.equal(storage.has(savedKey), false, 'Unsupported accounts must not be restored');
assert.equal(select('#workspace').hidden, true);

// Development-only manual entry must work with no connected reader, using the real API paths.
context = vm.createContext({ ...context });
vm.runInContext(testSource, context);
context.window.__TAURI__.core.invoke = async command => command === 'is_dev_mode' ? false : 'https://example.test';
await run('initializeDevMode()');
assert.equal(select('#dev-controls').hidden, true);
select('#manual-mode').checked = true; select('#manual-mode').change();
assert.equal(run('isManual()'), false, 'Release builds must reject manual mode');
context.window.__TAURI__.core.invoke = async command => command === 'is_dev_mode' ? true : 'https://example.test';
await run('initializeDevMode()'); assert.equal(select('#dev-controls').hidden, false);
run('showLogin()');
await login({ email: 'manual-register', role: 'staff', staff_function: 'register' });
context.status = { readers: [], cards: {}, error: 'No hardware' }; run('handleReaderStatus(status)');
select('#manual-mode').checked = true; select('#manual-mode').change();
assert.equal(select('#reader-status').textContent, 'Manual NFC mode');
context.fixture = { id: 987, mobile_number: '+639171111111', rfid_uid: null };
run('users = [fixture]; openCard(fixture, $("#card-assignments"))');
assert.equal(select('#manual-assignment').hidden, false);
select('#manual-assignment-uid').value = ' '.repeat(3); select('#manual-assignment-uid').input();
assert.equal(select('#link-card').disabled, true);
select('#manual-assignment-uid').value = 'X'.repeat(65); select('#manual-assignment-uid').input();
assert.equal(select('#link-card').disabled, true);
select('#manual-assignment-uid').value = '  00AB+&  '; select('#manual-assignment-uid').input();
assert.equal(select('#captured-uid').textContent, '00AB+&');
assert.equal(select('#link-card').disabled, false, 'Manual assignment needs no hardware');
context.status = { readers: [], cards: {}, error: 'Reader unavailable' }; run('handleReaderStatus(status)');
assert.equal(run('capturedUid'), '00AB+&', 'Reader status must not erase manual capture');
calls.length = 0; reply = { status: 'success' }; await select('#link-card').click();
assert.equal(calls.length, 1); assert.ok(calls[0].url.endsWith('/users/987/nfc'));
assert.equal(calls[0].options.method, 'PUT');
assert.deepEqual(JSON.parse(calls[0].options.body), { rfid_uid: '00AB+&' });
assert.equal(context.fixture.rfid_uid, '00AB+&');
select('#rfid-lookup').click(); select('#manual-lookup-uid').value = '00AB+&';
reply = { data: context.fixture }; calls.length = 0;
await select('#manual-lookup').submit({ preventDefault() {} });
assert.ok(calls[0].url.endsWith('rfid_uid=00AB%2B%26'));
assert.equal(select('#lookup-user-id').textContent, '987'); select('#lookup-dialog').close();
select('#manual-mode').checked = false; select('#manual-mode').change();
assert.equal(select('#manual-assignment').hidden, true);
run('openCard(fixture, $("#card-assignments"))');
assert.equal(select('#link-card').disabled, true, 'Hardware requirements must return when manual mode is off');
run('showLogin()');
for (const station of [1, 2, 3, 4]) {
  await login({ email: 'manual-station' + station, role: 'staff', staff_function: 'station', station_id: station });
  select('#manual-mode').checked = true; select('#manual-mode').change();
  assert.equal(select('#manual-station').hidden, false);
  select('#manual-station-uid').value = '  TEST0001  ';
  reply = { status: 'success', message: 'Manual check-in complete' }; calls.length = 0;
  await select('#manual-station').submit({ preventDefault() {} });
  assert.equal(calls.length, 1); assert.ok(calls[0].url.endsWith('/stations/check-in'));
  assert.deepEqual(JSON.parse(calls[0].options.body), { rfid_uid: 'TEST0001' });
  assert.equal(select('#station-result').textContent, 'Manual check-in complete');
  await select('#manual-station').submit({ preventDefault() {} });
  assert.equal(calls.length, 2, 'Each manual submit is a new tap, even for the same UID');
  select('#manual-station-uid').value = ' '; await select('#manual-station').submit({ preventDefault() {} });
  assert.equal(calls.length, 2); assert.match(select('#manual-station-error').textContent, /between 1 and 64/);
  await tap('HARDWARE'); assert.equal(calls.length, 2, 'Ignore physical card taps while manual mode is active');
  run('showLogin()'); assert.equal(run('isManual()'), false);
}
await login({ email: 'manual-busy', role: 'staff', staff_function: 'station', station_id: 4 });
select('#manual-mode').checked = true; select('#manual-mode').change();
select('#manual-station-uid').value = 'PENDING'; calls.length = 0;
pending = new Promise(resolve => { release = resolve; });
const manualSubmit = select('#manual-station').submit({ preventDefault() {} }); await settle();
assert.equal(select('#manual-station-tap').disabled, true);
await select('#manual-station').submit({ preventDefault() {} }); assert.equal(calls.length, 1);
select('#manual-mode').checked = false; select('#manual-mode').change(); assert.equal(run('isManual()'), true);
reply = { status: 'prerequisites_not_met', message: 'Complete stations first' }; httpStatus = 422;
release(); pending = null; await manualSubmit;
assert.equal(select('#reward-dialog').open, true);
const beforeRewardDismiss = calls.length; await select('#manual-station').submit({ preventDefault() {} });
assert.equal(calls.length, beforeRewardDismiss);
select('#reward-close').click(); assert.equal(select('#manual-station-tap').disabled, false);
httpStatus = 200; run('showLogin()');

await login({ email: 'redemption-register', role: 'staff', staff_function: 'register' });
context.profiles = [
  { id: 1, rfid_uid: null, redeemed: true, completed_station_ids: [1, 2, 3, 4], can_link_nfc: false },
  { id: 2, rfid_uid: 'READY', redeemed: false, completed_station_ids: [1, 1, 2, 3], can_link_nfc: true },
  { id: 3, rfid_uid: null, redeemed: false, completed_station_ids: [1], can_link_nfc: true },
  { id: 4, rfid_uid: null },
  { id: 5, rfid_uid: 'OLD', completed_station_ids: ['4'] },
];
run('users = profiles; filter = "all"; render()');
let rows = select('#users-body').children;
assert.equal(rows[0].children[3].children[0].textContent, 'Reward redeemed');
assert.equal(rows[0].children[4].children[0].textContent, '4/4 stations completed');
assert.equal(rows[0].children[5].children[0].children[0].textContent, 'Linking closed');
assert.ok(!rows[0].children[5].children[0].children.some(item => item.textContent === 'Link card'));
assert.equal(rows[1].children[4].children[0].textContent, 'Ready for reward · 3/4');
assert.equal(rows[2].children[4].children[0].textContent, '1/4 stations completed');
assert.equal(rows[3].children[4].children[0].textContent, 'Progress unavailable');
assert.equal(rows[4].children[3].children[0].textContent, 'Reward redeemed');
assert.equal(select('#unassigned-count').textContent, 2, 'Redeemed users must not count as awaiting a card');
run('filter = "unassigned"'); assert.deepEqual(Array.from(run('filteredUsers().map(user => user.id)')), [3, 4]);
run('filter = "redeemed"'); assert.deepEqual(Array.from(run('filteredUsers().map(user => user.id)')), [1, 5]);
run('filter = "assigned"'); assert.deepEqual(Array.from(run('filteredUsers().map(user => user.id)')), [2]);
run('openCard(profiles[0], $("#card-assignments"))');
assert.equal(select('#card-dialog').open, false, 'Redeemed attendee cannot open assignment dialog');
select('#manual-mode').checked = true; select('#manual-mode').change();
run('openCard(profiles[2], $("#card-assignments"))');
select('#manual-assignment-uid').value = 'STALE'; select('#manual-assignment-uid').input();
assert.equal(select('#link-card').disabled, false);
context.profiles[2].redeemed = true; run('updateCapture()');
assert.equal(select('#link-card').disabled, true, 'Redemption while dialog is open must block linking');
const beforeBlockedLink = calls.length; await select('#link-card').click();
assert.equal(calls.length, beforeBlockedLink, 'Redeemed attendee cannot submit an assignment');
run('showLogin()');

console.log('Passed station progress, redeemed labels/filter, linking guards, card counts, manual NFC, persistent login, and existing station/card regression checks.');
