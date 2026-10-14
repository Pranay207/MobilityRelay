import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readConfig } from '../server/config.js';

const keys = ['HOST', 'PORT', 'DATA_DIR', 'APP_PASSWORD', 'MCP_TOKEN', 'PUBLIC_ORIGIN', 'NODE_ENV', 'SEED_EXAMPLES', 'AGENT_MODE', 'BEDROCK_MODEL_ID', 'AWS_REGION', 'OLLAMA_BASE_URL', 'OLLAMA_MODEL'];
function withEnv(values: Record<string, string>, check: () => void) {
  const saved = new Map(keys.map(key => [key, process.env[key]]));
  try { for (const key of keys) delete process.env[key]; Object.assign(process.env, values); check(); }
  finally { for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

test('configuration defaults remain local, seeded and loopback-only', () => withEnv({}, () => {
  const config = readConfig(); assert.equal(config.agentMode, 'local'); assert.equal(config.host, '127.0.0.1'); assert.equal(config.port, 4317); assert.equal(config.production, false); assert.equal(config.seed, true); assert.equal(config.dataDir, resolve('.data'));
}));

test('invalid modes and ports fail instead of silently changing behavior', () => {
  withEnv({ AGENT_MODE: 'misspelled' }, () => assert.throws(readConfig));
  for (const port of ['-1', '65536', 'abc', '3.5']) withEnv({ PORT: port }, () => assert.throws(readConfig));
});

test('external and production bindings require explicit strong credentials and HTTPS', () => {
  const bindings: Record<string, string>[] = [{ HOST: '0.0.0.0' }, { NODE_ENV: 'production' }];
  for (const values of bindings) withEnv(values, () => assert.throws(readConfig));
  withEnv({ NODE_ENV: 'production', APP_PASSWORD: 'fictional-password-12345', MCP_TOKEN: 'fixture-token-'.repeat(4), PUBLIC_ORIGIN: 'https://relay.example/' }, () => assert.equal(readConfig().publicOrigin, 'https://relay.example'));
});

test('public origins reject credentials, paths, queries, fragments and incomplete URLs', () => {
  for (const origin of ['https://', 'https://user:secret@relay.example', 'https://relay.example/path', 'https://relay.example/?token=fixture', 'https://relay.example/#fixture', 'http://relay.example']) withEnv({ PUBLIC_ORIGIN: origin }, () => assert.throws(readConfig, /PUBLIC_ORIGIN/));
});

test('data directories cannot be the application root or built/public asset directories', () => {
  for (const directory of ['.', 'dist', 'dist/private', 'public', 'public/private', 'node_modules']) withEnv({ DATA_DIR: directory }, () => assert.throws(readConfig, /DATA_DIR/));
});
