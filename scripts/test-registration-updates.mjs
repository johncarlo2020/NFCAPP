import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/admin.js', import.meta.url), 'utf8');
const realtimeSource = source.slice(source.indexOf('function stopRegistrationUpdates('), source.indexOf('async function restoreSession('));
const status = { textContent: '' }, clients = [], timers = new Map(), requests = [];
let now = 100000, timerId = 0, loads = 0, authorizeError, authorizePending, loadPending;
class Pusher {
  constructor(key, options) {
    this.key = key; this.options = options; this.events = {}; this.connectionEvents = {};
    this.connection = { bind: (name, callback) => { this.connectionEvents[name] = callback; } };
    clients.push(this);
  }
  subscribe(name) { this.channel = name; return { bind: (event, callback) => { this.events[event] = callback; } }; }
  disconnect() { this.disconnected = true; }
}
const context = vm.createContext({
  window: { Pusher }, token: 'staff-token', canAssign: () => true,
  registrationClient: undefined, registrationTimer: undefined, registrationDirty: false, registrationLastRefresh: 0,
  searchTimer: undefined, loading: false, busy: false, authenticating: false,
  cardDialog: { open: false }, confirmDialog: { open: false }, lookupDialog: { open: false },
  $: selector => { assert.equal(selector, '#registration-live-status'); return status; },
  Date: { now: () => now },
  setTimeout: (callback, delay) => { timers.set(++timerId, { callback, at: now + delay }); return timerId; },
  clearTimeout: id => timers.delete(id),
  request: async (path, options) => { requests.push({ path, options }); if (authorizePending) await authorizePending; if (authorizeError) throw authorizeError; return { auth: 'signed-auth' }; },
  loadUsers: async () => { loads++; context.loading = true; try { if (loadPending) await loadPending; } finally { context.loading = false; } },
});
vm.runInContext(realtimeSource, context);
const run = code => vm.runInContext(code, context);
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
async function advance(ms) {
  now += ms;
  const due = [...timers].filter(([, timer]) => timer.at <= now);
  for (const [id, timer] of due) { timers.delete(id); void timer.callback(); }
  await settle();
}
const config = { key: 'public-key', cluster: 'ap1' }; context.config = config;
run('startRegistrationUpdates(null)'); assert.equal(clients.length, 0); assert.match(status.textContent, /unavailable/);
context.canAssign = () => false; run('startRegistrationUpdates(config)'); assert.equal(clients.length, 0);
context.canAssign = () => true; run('startRegistrationUpdates(config)');
const first = clients.at(-1);
assert.equal(first.key, 'public-key'); assert.equal(first.options.forceTLS, true);
assert.equal(first.channel, 'private-nfc-registrations');
assert.equal(loads, 0, 'Do not poll while waiting for an event or subscription');
let authorization;
await first.options.channelAuthorization.customHandler({ socketId: '123.456', channelName: first.channel }, (error, data) => { authorization = { error, data }; });
assert.equal(authorization.error, null); assert.equal(authorization.data.auth, 'signed-auth');
assert.equal(requests[0].path, '/api/admin/broadcasting/auth');
assert.equal(requests[0].options.method, 'POST');
assert.deepEqual(JSON.parse(requests[0].options.body), { socket_id: '123.456', channel_name: 'private-nfc-registrations' });
first.events['pusher:subscription_succeeded']();
for (let i = 0; i < 20; i++) first.events['attendee.registered']({ user_id: i });
assert.equal(timers.size, 1, 'Batch a registration burst and connection catch-up into one reload');
await advance(500); assert.equal(loads, 1); assert.equal(timers.size, 0);
assert.match(status.textContent, /automatically/);
first.events['attendee.registered'](); await advance(4999); assert.equal(loads, 1);
await advance(1); assert.equal(loads, 2, 'Reload at most once every five seconds');

// Defer updates during searches, in-flight loads, and card/confirmation/lookup work.
for (const busyState of ['busy', 'loading', 'authenticating', 'searchTimer', 'cardDialog', 'confirmDialog', 'lookupDialog']) {
  if (busyState.endsWith('Dialog')) context[busyState].open = true;
  else context[busyState] = busyState === 'searchTimer' ? 42 : true;
  const before = loads;
  first.events['attendee.registered'](); await advance(5000); assert.equal(loads, before, busyState);
  if (busyState.endsWith('Dialog')) context[busyState].open = false;
  else context[busyState] = busyState === 'searchTimer' ? undefined : false;
  await advance(500); assert.equal(loads, before + 1, busyState);
}
let finishLoad;
loadPending = new Promise(resolve => { finishLoad = resolve; });
first.events['attendee.registered'](); await advance(5000);
const inFlightLoads = loads;
first.events['attendee.registered'](); await advance(5000);
assert.equal(loads, inFlightLoads, 'Never overlap registration reloads');
finishLoad(); loadPending = undefined; await settle(); await advance(500);
assert.equal(loads, inFlightLoads + 1, 'Do not miss an event arriving while reloading');

first.connectionEvents.state_change({ current: 'disconnected' }); assert.match(status.textContent, /disconnected/);
first.events['pusher:subscription_succeeded'](); await advance(5000);
assert.match(status.textContent, /automatically/, 'Catch up after reconnecting');
first.events['pusher:subscription_error'](); assert.match(status.textContent, /unavailable/);
authorizeError = new Error('Unauthorized');
await first.options.channelAuthorization.customHandler({ socketId: '123.456', channelName: first.channel }, (error) => { authorization = { error }; });
assert.equal(authorization.error, authorizeError); authorizeError = undefined;

first.events['attendee.registered'](); const beforeStop = loads;
run('stopRegistrationUpdates()'); assert.equal(first.disconnected, true); assert.equal(timers.size, 0);
first.events['attendee.registered'](); await advance(10000); assert.equal(loads, beforeStop, 'Ignore events from a disconnected session');
run('startRegistrationUpdates(config)'); assert.equal(clients.length, 2);
let finishAuth;
authorizePending = new Promise(resolve => { finishAuth = resolve; });
const pendingAuth = clients.at(-1).options.channelAuthorization.customHandler({ socketId: '123.456', channelName: first.channel }, (error, data) => { authorization = { error, data }; });
run('stopRegistrationUpdates()'); context.token = 'different-token'; finishAuth(); await pendingAuth; authorizePending = undefined;
assert.match(authorization.error.message, /Session changed/); assert.equal(authorization.data, null);
context.token = ''; run('startRegistrationUpdates(config)'); assert.equal(clients.length, 2);
console.log('Passed private subscription/auth, registration batching, reload cap, busy/search deferral, reconnect, outage, and session cleanup checks.');
