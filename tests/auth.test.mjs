import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../public/auth.js', import.meta.url), 'utf8');
function setup(error = null) {
  const nodes = new Map();
  let requests = 0, now = 100000;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', textContent: '', disabled: false, events: new Map(),
      classList: { add() {}, remove() {}, toggle() {} }, focus() {},
      addEventListener(event, fn) { this.events.set(event, fn); }
    });
    return nodes.get(id);
  };
  const client = { auth: {
    onAuthStateChange() {},
    async signInWithOtp() { requests++; return { error }; }
  }};
  vm.runInNewContext(script, {
    document: { getElementById: node }, window: { supabase: { createClient: () => client } },
    Date: { now: () => now }
  });
  node('login-email').value = 'operator@example.invalid';
  return { node, requests: () => requests, advance: ms => { now += ms; },
    send: () => node('login-email-form').events.get('submit')({ preventDefault() {} }) };
}

test('global email quota is distinct from resend cooldown', async () => {
  const app = setup({ code: 'over_email_send_rate_limit', status: 429, message: 'Email rate limit exceeded' });
  await app.send();
  assert.match(app.node('auth-status').textContent, /por hora de todo el equipo/);
  assert.doesNotMatch(app.node('auth-status').textContent, /unos minutos|60 segundos/);
  assert.equal(app.node('send-code').disabled, false);
});
test('legacy email quota message still maps to the hourly limit', async () => {
  const app = setup({ message: 'Email rate limit exceeded' });
  await app.send();
  assert.match(app.node('auth-status').textContent, /por hora de todo el equipo/);
});
test('server resend wait explains the minimum interval', async () => {
  const app = setup({ status: 429, message: 'For security purposes, you can only request this after 50 seconds.' });
  await app.send();
  assert.match(app.node('auth-status').textContent, /60 segundos/);
});
test('request/IP quota does not promise a 60-second reset', async () => {
  const app = setup({ code: 'over_request_rate_limit', status: 429, message: 'Rate limit exceeded' });
  await app.send();
  assert.match(app.node('auth-status').textContent, /demasiadas solicitudes/);
  assert.doesNotMatch(app.node('auth-status').textContent, /60 segundos|por hora/);
});
test('successful send preserves the local 60-second cooldown', async () => {
  const app = setup();
  await app.send(); await app.send();
  assert.equal(app.requests(), 1);
  assert.match(app.node('auth-status').textContent, /60 segundos/);
  app.advance(60000); await app.send();
  assert.equal(app.requests(), 2);
});
test('authorization and unexpected errors remain safely worded', async () => {
  const denied = setup({ message: 'Correo no habilitado' }); await denied.send();
  assert.match(denied.node('auth-status').textContent, /no está habilitado/);
  const failed = setup({ message: 'private diagnostic details' }); await failed.send();
  assert.doesNotMatch(failed.node('auth-status').textContent, /private diagnostic/);
});
