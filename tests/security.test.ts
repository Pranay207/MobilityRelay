import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startServer } from '../server/app.js';
import type { Config } from '../server/config.js';

const config: Config = { host: '127.0.0.1', port: 0, dataDir: '.data/test', password: 'fictional-qa-password-123', mcpToken: 'fictional-qa-token-'.repeat(4), publicOrigin: '', production: false, seed: false, agentMode: 'local', modelId: '', region: 'us-east-1', ollamaBaseUrl: 'http://127.0.0.1:11434', ollamaModel: 'qwen2.5:1.5b' };
const mail = { mode: 'capture' as const, send: async () => { throw new Error('Security checks must not send mail.'); } };

test('development middleware never serves private storage through HTTP or @fs', { timeout: 60000 }, async () => {
  await mkdir('.data', { recursive: true });
  const directory = await mkdtemp(resolve('.data', 'qa-files-'));
  const file = resolve(directory, 'canary.json'); const marker = `FICTIONAL_QA_CANARY_${randomUUID()}`;
  await writeFile(file, JSON.stringify({ marker }));
  const app = await startServer({ ...config, dataDir: directory }, mail, { database: ':memory:' });
  try {
    assert.equal((await fetch(`${app.url}/api/cases`)).status, 401);
    const direct = `/${relative(process.cwd(), file).replaceAll('\\', '/')}`;
    for (const path of [direct, `${direct}?raw`, direct.replace('/.data/', '/%2edata/'), `/@fs/${file.replaceAll('\\', '/')}`, `/@fs/${file.replaceAll('\\', '/')}?raw`]) {
      const response = await fetch(`${app.url}${path}`); const text = await response.text();
      assert.notEqual(response.status, 200, `Private fixture exposed via ${path}`); assert.equal(text.includes(marker), false);
    }
  } finally { await app.close(); }
});

test('production serves built assets with security headers but no anonymous case data', async () => {
  const app = await startServer({ ...config, production: true, publicOrigin: 'https://relay.example' }, mail, { database: ':memory:' });
  try {
    const response = await fetch(app.url); assert.equal(response.status, 200);
    const html = await response.text(); assert.match(html, /id="root"/); assert.match(html, /\/assets\//);
    assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    const asset = /src="([^" ]+\.js)"/.exec(html)?.[1]; assert.ok(asset);
    assert.equal((await fetch(new URL(asset, app.url))).status, 200);
    assert.equal((await fetch(`${app.url}/api/cases`)).status, 401);
    assert.equal((await fetch(`${app.url}/api/session`)).headers.get('set-cookie'), null);
    const blocked = await fetch(app.url, { headers: { Origin: 'https://untrusted.example' } }); assert.equal(blocked.status, 403);
  } finally { await app.close(); }
});

test('malformed and oversized JSON are client errors without parser details', async () => {
  const app = await startServer(config, mail, { frontend: false, database: ':memory:' });
  try {
    const malformed = await fetch(`${app.url}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"secret-test-marker":' });
    assert.equal(malformed.status, 400); assert.equal((await malformed.text()).includes('secret-test-marker'), false);
    const oversized = await fetch(`${app.url}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'x'.repeat(190000) }) });
    assert.equal(oversized.status, 413);
  } finally { await app.close(); }
});

test('case deletion rejects missing, mismatched and extra confirmation fields without deleting data', async () => {
  const app = await startServer({ ...config, password: '' }, mail, { frontend: false, database: ':memory:' });
  try {
    const session = await fetch(`${app.url}/api/session`); const { csrf } = await session.json();
    const headers = { Cookie: session.headers.get('set-cookie')!.split(';')[0], 'X-Relay-CSRF': csrf, 'Content-Type': 'application/json' };
    const created = await fetch(`${app.url}/api/cases`, { method: 'POST', headers, body: JSON.stringify({ title: 'Fictional deletion QA', person: 'QA', equipment: 'Test chair', reference: 'QA', category: 'repair', fictional: true }) });
    assert.equal(created.status, 201); const repair = await created.json();
    for (const body of [undefined, JSON.stringify({ confirm: 'wrong' }), JSON.stringify({ confirm: repair.title, extra: true })]) {
      const rejected = await fetch(`${app.url}/api/cases/${repair.id}`, { method: 'DELETE', headers, body });
      assert.equal(rejected.status, 400);
      assert.equal((await fetch(`${app.url}/api/cases/${repair.id}`, { headers })).status, 200);
    }
    assert.equal((await fetch(`${app.url}/api/cases/${repair.id}`, { method: 'DELETE', headers, body: JSON.stringify({ confirm: repair.title }) })).status, 200);
    assert.equal((await fetch(`${app.url}/api/cases`, { headers })).status, 200);
    assert.equal((await app.store.cases()).length, 0);
  } finally { await app.close(); }
});
