import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, post } from '../src/api.js';

test('workspace GET reads have a deadline and never automatically retry', async () => {
  const originalFetch = globalThis.fetch; const originalTimeout = AbortSignal.timeout; let attempts = 0;
  try {
    AbortSignal.timeout = milliseconds => { assert.equal(milliseconds, 10000); return AbortSignal.abort(new DOMException('Controlled timeout', 'TimeoutError')); };
    globalThis.fetch = async (_input, init) => { attempts++; assert.ok(init?.signal?.aborted); throw init.signal.reason; };
    await assert.rejects(api('/api/cases'), /workspace read timed out/); assert.equal(attempts, 1);
  } finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; }
});

test('action posts are never given a read deadline, retried or silently replaced', async () => {
  const originalFetch = globalThis.fetch; const originalTimeout = AbortSignal.timeout; let attempts = 0;
  try {
    AbortSignal.timeout = () => { throw new Error('A write must not inherit the GET deadline.'); };
    globalThis.fetch = async (_input, init) => { attempts++; assert.equal(init?.method, 'POST'); assert.equal(init.signal, undefined); throw new Error('Controlled uncertain write'); };
    await assert.rejects(post('/api/action', { fictional: true }), /Controlled uncertain write/); assert.equal(attempts, 1);
  } finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; }
});
