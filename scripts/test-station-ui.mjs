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
const context = vm.createContext({ console, document: { querySelector: select, querySelectorAll: () => [], createElement: node }, Option: function(text, value) { this.textContent = text; this.value = value; }, window: { addEventListener() {}, __TAURI__: { core: { invoke: async () => 'https://example.test' } } }, fetch: async (url, options) => {
  calls.push({ url, options });
  if (url.endsWith('/login')) return { ok: true, status: 200, json: async () => ({ token: user.email, user }) };
  if (url.includes('/users?')) return { ok: true, status: 200, json: async () => ({ data: [], last_page: 1 }) };
  if (pending) await pending;
  return { ok: httpStatus < 400, status: httpStatus, json: async () => reply };
} });
vm.runInContext(source.replace('render(); connectReader();', ''), context);
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
await tap('CARD1'); assert.equal(calls.length, 1, 'Held card must not resubmit');
await tap(''); reply = { status: 'duplicate', message: 'Already checked in' }; await tap('CARD1');
assert.equal(select('#station-result').textContent, 'Already checked in');
await tap(''); reply = { status: 'prerequisites_not_met', message: 'Complete stations first' }; httpStatus = 422; await tap('CARD1');
assert.equal(select('#station-result').className, 'notice error'); assert.equal(select('#station-result').textContent, reply.message);
await tap(''); httpStatus = 500; await tap('CARD1'); assert.match(select('#station-result').textContent, /outcome uncertain/);
const failureCalls = calls.length; await tap('CARD1'); assert.equal(calls.length, failureCalls);
await tap(''); httpStatus = 200; reply = { status: 'error', message: 'Not confirmed' }; await tap('CARD1'); assert.equal(select('#station-result').className, 'notice error');
await tap(''); let release; pending = new Promise(resolve => { release = resolve; }); await tap('CARD1');
const inFlight = calls.length; await tap(''); await tap('CARD2'); assert.equal(calls.length, inFlight, 'Only one check-in may run at a time');
run('showLogin()'); release(); pending = null; await settle(); assert.equal(select('#station-result').hidden, true); assert.equal(select('#station-card-uid').textContent, 'Waiting for card…');
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

console.log('Passed navigation session preservation, RFID modal lookup, UID encoding, customer detail rendering, unknown/forbidden/invalid responses, stale request suppression, lookup access, and station routing, permission guards, tap deduplication, check-in responses, in-flight guard, session reset, and admin/registration regression checks.');
