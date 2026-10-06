// Owner decision, 7 October 2026: reading a scope needs an account, and the AI reads every
// scope. Signed out, the page asks the user to sign in and reads the scope once they have; the
// keyword quick read (/api/scope) is no longer used by the page. The page scripts run in a
// small stand-in for the browser (fake-dom.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, settle } = require('./fake-dom');

const SCOPE = 'Supply and fix roof sheeting to the new carport.';
const READING = {
  id: 'r1',
  status: 'done',
  reading: { activities: [{ package: 'Roofing', activity: 'Fix roof sheeting', type: 'Work', clause: '2.1', quotes: [SCOPE] }], packages: [], conflicts: [] },
  checks: { passed: true },
};

// The server: signed in once Face ID has been used, with the AI reading on or off.
function server({ aiEnabled = true } = {}) {
  let signedIn = false;
  return (method, route) => {
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
    if (route === '/api/auth/passkey/login/options') return { body: { options: { challenge: 'AA' }, challengeId: 'c1' } };
    if (route === '/api/auth/passkey/login') { signedIn = true; return { body: { token: 'token' } }; }
    if (route === '/api/me') return signedIn ? { body: { user: { email: 'a@b.example', name: 'Sam', hasPasskey: true }, company: { name: 'Co', abn: '1', hasAccess: true, planStatus: 'active' } } } : { status: 401, body: {} };
    if (route === '/api/sites') return { body: { sites: [] } };
    if (route === '/api/swms') return { body: { swms: [] } };
    if (route === '/api/steps') return { body: { groups: [] } };
    if (route === '/api/scope/ai' && method === 'GET') return { body: { enabled: aiEnabled } };
    if (route === '/api/scope/ai' && method === 'POST') return { body: READING };
    return { body: {} };
  };
}

// Face ID signs in on the same page, as the email link does in a new tab.
function faceId(p) {
  const buffer = () => new ArrayBuffer(1);
  p.window.navigator.credentials = {
    get: async () => ({ id: 'k', rawId: buffer(), type: 'public-key', response: { clientDataJSON: buffer(), authenticatorData: buffer(), signature: buffer(), userHandle: null }, getClientExtensionResults: () => ({}) }),
  };
  p.document.getElementById('faceid-signin').click();
}

async function readScope(p) {
  p.document.getElementById('scope-file').files = [];
  p.document.getElementById('scope-text').value = SCOPE;
  p.document.getElementById('scope-read').click();
  await settle();
}

const results = (p) => p.document.getElementById('scope-results').innerHTML;
const quickReads = (p) => p.calls.filter((call) => call.route === '/api/scope');

test('signed out, a pasted scope asks the user to sign in, and the AI reads it once they have', async () => {
  const p = loadPage(['app.js', 'account.js', 'scope.js'], server());
  await settle();
  await readScope(p);
  assert.match(results(p), /Sign in, or start the free trial, to have the AI read this scope/);
  assert.match(results(p), /data-open="signin"/);
  assert.equal(p.calls.filter((call) => call.route.startsWith('/api/scope')).length, 0, 'nothing is read while signed out');
  faceId(p);
  await settle(40);
  const reads = p.calls.filter((call) => call.route === '/api/scope/ai' && call.method === 'POST');
  assert.equal(reads.length, 1);
  assert.equal(reads[0].body.text, SCOPE);
  assert.match(results(p), /The AI found 1 activities in 1 work packages/);
  assert.equal(quickReads(p).length, 0);
});

test('signed in with the AI reading off, the page says so and does not fall back to the quick read', async () => {
  const p = loadPage(['app.js', 'account.js', 'scope.js'], server({ aiEnabled: false }));
  await settle();
  faceId(p);
  await settle(40);
  await readScope(p);
  assert.match(results(p), /not switched on just now\. Try again later\. Or write the tasks in the Task box below\./);
  assert.doesNotMatch(results(p), /quick read/);
  assert.equal(quickReads(p).length, 0);
});
