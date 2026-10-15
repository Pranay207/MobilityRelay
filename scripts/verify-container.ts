import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';

const execute = promisify(execFile);
const image = process.argv[2] || 'mobilityrelay:local';
const suffix = randomUUID(); const name = `mobilityrelay-qa-${suffix}`;
const volume = `${name}-data`; const reference = `CONTAINER-QA-${suffix}`;
const docker = async (...args: string[]) => (await execute('docker', args, { timeout: 120000, maxBuffer: 1024 * 1024 })).stdout.trim();
const probe = `
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const origin = 'http://127.0.0.1:' + process.env.PORT;
assert.equal(typeof process.getuid, 'function'); assert.notEqual(process.getuid(), 0);
const login = await fetch(origin + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.APP_PASSWORD }) });
assert.equal(login.status, 200);
const session = await login.json();
const headers = { Cookie: login.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json', 'X-Relay-CSRF': session.csrf };
const get = async path => { const response = await fetch(origin + path, { headers }); assert.equal(response.status, 200); return response.json(); };
const post = async (path, data) => { const response = await fetch(origin + path, { method: 'POST', headers, body: JSON.stringify(data) }); assert.equal(response.status, 200, await response.clone().text()); return response.json(); };
assert.equal((await fetch(origin + '/api/cases')).status, 401);
assert.equal((await fetch(origin)).status, 200);
assert.equal(existsSync('/run/secrets/npm_ca'), false);
assert.equal(process.env.NODE_EXTRA_CA_CERTS, undefined);
assert.equal(existsSync('/app/.env'), false);
assert.equal(existsSync('/app/.git'), false);
if (process.argv[1] === 'initial') {
  const response = await fetch(origin + '/api/cases', { method: 'POST', headers, body: JSON.stringify({ title: 'Container QA case', person: 'Fictional tester', equipment: 'Chair', reference: process.env.QA_REFERENCE, category: 'Parts delay', fictional: true }) });
  assert.equal(response.status, 201); const repair = await response.json();
  const contactResponse = await fetch(origin + '/api/contacts', { method: 'POST', headers, body: JSON.stringify({ caseId: repair.id, name: 'Fictional supplier', role: 'supplier', email: 'repair@supplier.example', verified: false }) });
  assert.equal(contactResponse.status, 201); const contact = await contactResponse.json();
  await post('/api/action', { tool: 'record_repair_event', args: { caseId: repair.id, requestId: randomUUID(), party: 'supplier', source: 'Fictional email', channel: 'Email', occurredAt: new Date().toISOString(), text: 'The part is delayed.', stage: 'parts_delayed' } });
  const brief = (await get('/api/cases/' + repair.id)).data;
  const prepared = await post('/api/action', { tool: 'prepare_repair_request', args: { caseId: repair.id, requestId: randomUUID(), recipientId: contact.id, questionIds: brief.questions.map(question => question.id) } });
  assert.ok(prepared.traces.some(trace => trace.tool === 'prepare_repair_request' && trace.ok));
  assert.equal(prepared.data.status, 'draft'); assert.match(prepared.data.body, /\\[source 1\\]/);
  const rejected = await fetch(origin + '/api/drafts/' + prepared.data.id + '/send', { method: 'POST', headers, body: JSON.stringify({ caseId: repair.id, expectedHash: prepared.data.hash, confirmed: false }) });
  assert.equal(rejected.status, 400);
} else {
  const repair = (await get('/api/cases')).find(repair => repair.reference === process.env.QA_REFERENCE);
  assert.ok(repair); const result = await get('/api/cases/' + repair.id);
  assert.equal(result.data.events.length, 1); assert.equal(result.data.drafts.length, 1);
  assert.equal(result.data.drafts[0].status, 'draft'); assert.equal(result.traces[0].ok, true);
}
console.log('Container ' + process.argv[1] + ' checks passed. No messages delivered.');
`;

const healthy = async () => {
  for (let attempt = 0; attempt < 30; attempt++) {
    const status = await docker('inspect', '--format', '{{.State.Health.Status}}', name);
    if (status === 'healthy') return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Container health check did not become healthy.');
};

try {
  await docker('volume', 'create', volume);
  await docker('run', '--detach', '--rm', '--init', '--network', 'none', '--name', name,
    '--mount', `type=volume,source=${volume},target=/data`, '--health-interval=2s', '--health-start-period=1s',
    '-e', 'PORT=4321', '-e', `APP_PASSWORD=${randomBytes(20).toString('hex')}`, '-e', `MCP_TOKEN=${randomBytes(32).toString('hex')}`,
    '-e', 'PUBLIC_ORIGIN=https://relay.example', '-e', 'AGENT_MODE=local', '-e', 'MAIL_MODE=capture', image);
  await healthy();
  console.log(await docker('exec', '-e', `QA_REFERENCE=${reference}`, name, 'node', '--input-type=module', '-e', probe, 'initial'));
  await docker('restart', name); await healthy();
  console.log(await docker('exec', '-e', `QA_REFERENCE=${reference}`, name, 'node', '--input-type=module', '-e', probe, 'persisted'));
  console.log('Non-root production container, custom-port health check, private-file exclusions, authenticated real MCP and persistent volume verified.');
} finally {
  await docker('rm', '--force', name).catch(() => {});
  await docker('volume', 'rm', volume).catch(() => {});
}
