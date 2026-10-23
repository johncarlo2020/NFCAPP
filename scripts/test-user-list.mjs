import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/admin.js', import.meta.url), 'utf8');
const listSource = source.slice(source.indexOf('async function loadUsers('), source.indexOf('function openCard('));
const elements = new Map();
function node() {
  return { value: '', textContent: '', children: [], addEventListener(type, handler) { this[type] = handler; },
    setAttribute() {}, append(...items) { this.children.push(...items); }, replaceChildren() { this.children = []; } };
}
const select = selector => { if (!elements.has(selector)) elements.set(selector, node()); return elements.get(selector); };
select('#page-size').value = '25';
const filters = ['all', 'assigned', 'unassigned', 'redeemed'].map(filter => Object.assign(node(), { dataset: { filter } }));
let timerId = 0, reply, respond, failure;
const timers = new Map(), calls = [], notices = [];
const counts = { all: 1000, assigned: 400, unassigned: 500, redeemed: 100 };
const result = (id, page = 1, total = 251, last = 11) => ({ data: [{ id, rfid_uid: null }], current_page: page, last_page: last, total, counts });
const context = vm.createContext({
  URLSearchParams, token: 'token', canAssign: () => true, refreshGeneration: 0,
  searchTimer: undefined, loading: false, users: [], filter: 'all', page: 1,
  listTotal: 0, listLastPage: 1, listCounts: { all: 0, assigned: 0, unassigned: 0, redeemed: 0 },
  $: select, document: { createElement: node, querySelectorAll: () => filters },
  message: (...args) => notices.push(args),
  setTimeout: (callback, delay) => { assert.equal(delay, 300); timers.set(++timerId, callback); return timerId; },
  clearTimeout: id => timers.delete(id),
  request: async path => { calls.push(new URL(path, 'https://example.test')); if (failure) throw failure; return respond ? await respond() : reply; },
});
vm.runInContext(listSource, context);
const run = code => vm.runInContext(code, context);
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const flushSearch = async () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); await settle(); };

reply = result(900);
await run('loadUsers()');
assert.equal(calls.length, 1, 'Load only one page, even when last_page is 11');
assert.equal(calls[0].searchParams.get('per_page'), '25');
assert.equal(select('#total-count').textContent, 1000, 'Use global API counts, not current-page length');
assert.equal(select('#unassigned-count').textContent, 500);
assert.equal(select('#result-count').textContent, '1–1 of 251 users');
reply = result(899, 2);
select('#next').click(); await settle();
assert.equal(calls.at(-1).searchParams.get('page'), '2');
assert.equal(select('#page-label').textContent, 'Page 2 of 11');
assert.equal(select('#result-count').textContent, '26–26 of 251 users');
reply = result(900);
select('#previous').click(); await settle();
assert.equal(calls.at(-1).searchParams.get('page'), '1');

const beforeTyping = calls.length;
select('#search').value = '00'; select('#search').input();
select('#search').value = '  00AB+&  '; select('#search').input();
assert.equal(calls.length, beforeTyping, 'Typing must wait for debounce');
assert.equal(timers.size, 1, 'Keep only the latest search timer');
reply = result(88, 1, 1, 1); await flushSearch();
assert.equal(calls.length, beforeTyping + 1);
assert.equal(calls.at(-1).searchParams.get('search'), '00AB+&', 'Preserve and encode card UID characters');
assert.equal(context.users[0].id, 88, 'Do not apply local search to server results');
for (const button of filters) {
  button.click(); await settle();
  assert.equal(calls.at(-1).searchParams.get('assignment_status'), button.dataset.filter);
  assert.equal(calls.at(-1).searchParams.get('page'), '1');
}
select('#page-size').value = '10'; select('#page-size').change(); await settle();
assert.equal(calls.at(-1).searchParams.get('per_page'), '10');
assert.equal(calls.at(-1).searchParams.get('search'), '00AB+&');

let resolveOld;
respond = () => new Promise(resolve => { resolveOld = resolve; });
const oldRequest = run('loadUsers()');
select('#search').value = 'new'; select('#search').input();
resolveOld(result(1)); await oldRequest;
assert.equal(context.users.length, 0, 'Ignore old response even before debounce fires');
respond = undefined; reply = result(2, 1, 1, 1); await flushSearch();
assert.equal(context.users[0].id, 2);
assert.equal(select('#refresh').disabled, false);

// A delayed old failure cannot replace a newer result or show a stale notice.
let rejectOld;
respond = () => new Promise((resolve, reject) => { rejectOld = reject; });
const oldFailure = run('loadUsers()');
respond = undefined; reply = result(3, 1, 1, 1); await run('loadUsers()');
const beforeFailure = notices.length; rejectOld(new Error('Old request failed')); await oldFailure;
assert.equal(notices.length, beforeFailure); assert.equal(context.users[0].id, 3);

context.page = 2;
respond = () => calls.at(-1).searchParams.get('page') === '2' ? result(1, 2, 1, 1) : result(4, 1, 1, 1);
await run('loadUsers()'); respond = undefined;
assert.equal(context.page, 1); assert.equal(context.users[0].id, 4, 'Reload the last valid page after a result is removed');

failure = new Error('Server unavailable'); await run('loadUsers()'); failure = undefined;
assert.match(notices.at(-1)[0], /Could not refresh users.*Server unavailable/);
assert.equal(context.users.length, 0); assert.equal(context.loading, false);
reply = { ...result(5), counts: undefined }; await run('loadUsers()');
assert.match(notices.at(-1)[0], /Update the server API/);
reply = { ...result(5), current_page: 0 }; await run('loadUsers()');
assert.match(notices.at(-1)[0], /invalid pagination/);
context.token = ''; const beforeLogout = calls.length; await run('loadUsers()'); assert.equal(calls.length, beforeLogout);
context.token = 'token'; context.canAssign = () => false; await run('loadUsers()'); assert.equal(calls.length, beforeLogout);
console.log('Passed server search, debounce, filters, pagination, counts, stale response/error, page correction, failure, and access checks.');
