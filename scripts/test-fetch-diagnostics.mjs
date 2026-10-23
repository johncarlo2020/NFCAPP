import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/admin.js', import.meta.url), 'utf8');
const requestSource = source.slice(source.indexOf('async function request('), source.indexOf('\nfunction validateAccount('));
let response, failure, loginReason;
const context = vm.createContext({
  URL, token: 'PRIVATE_TOKEN', apiBase: 'https://user:PRIVATE_PASSWORD@example.test',
  window: { location: { origin: 'http://tauri.localhost' } }, navigator: { onLine: true },
  showLogin: reason => { loginReason = reason; },
  fetch: async () => { if (failure) throw failure; return response; },
});
vm.runInContext(requestSource, context);
const request = () => vm.runInContext("request('/api/admin/users/by-rfid?rfid_uid=PRIVATE_CARD#PRIVATE_FRAGMENT', { method: 'POST', body: 'PRIVATE_BODY' })", context);
async function expectFailure(pattern) {
  let error;
  try { await request(); } catch (caught) { error = caught; }
  assert.ok(error, 'Request must reject');
  assert.match(error.message, pattern);
  assert.match(error.message, /POST https:\/\/example.test\/api\/admin\/users\/by-rfid/);
  assert.match(error.message, /App origin: http:\/\/tauri.localhost/);
  assert.match(error.message, /Elapsed: \d+ ms/);
  assert.doesNotMatch(error.message, /PRIVATE_/);
  return error;
}
failure = new TypeError('Failed to fetch');
await expectFailure(/exact network cause/);
assert.match((await expectFailure(/CORS/)).message, /HTTP status: unavailable/);
context.navigator.onLine = false;
await expectFailure(/offline/);
context.navigator.onLine = true;
failure = { name: 'AbortError' };
await expectFailure(/cancelled/);
failure = null;
const reply = (status, body, contentType = 'application/json') => ({
  status, ok: status < 400, statusText: status === 502 ? 'Bad Gateway' : '',
  headers: { get: () => contentType }, json: async () => body,
});
response = reply(502, {});
await expectFailure(/HTTP: 502 Bad Gateway/);
response = reply(401, { message: 'Unauthenticated' });
assert.equal((await expectFailure(/Unauthenticated/)).status, 401);
assert.match(loginReason, /session expired/);
response = reply(422, { status: 'prerequisites_not_met', errors: { card: ['Complete stations first'] } });
assert.equal((await expectFailure(/Complete stations first/)).apiStatus, 'prerequisites_not_met');
response = reply(200, null, 'text/html');
response.json = async () => { throw new SyntaxError('PRIVATE_RAW_HTML'); };
await expectFailure(/invalid JSON response/);
response.status = 502; response.ok = false;
await expectFailure(/not a valid JSON object/);
response = reply(200, null);
await expectFailure(/Expected a JSON object/);
response = reply(204, undefined);
response.json = () => { throw new Error('Must not parse a 204 response'); };
assert.equal(JSON.stringify(await request()), '{}');
response = reply(200, { data: [] });
assert.equal(JSON.stringify(await request()), '{"data":[]}');
console.log('Passed network, offline, cancellation, HTTP, invalid JSON, session expiry, redaction, and success diagnostics checks.');
