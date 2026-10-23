import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, post } from '../src/api.js';

test('workspace GET reads have a deadline and never retry after it expires', async () => {
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
    globalThis.fetch = async (_input, init) => { attempts++; assert.equal(init?.method, 'POST'); assert.equal(init.signal, undefined); throw new TypeError('Controlled uncertain write'); };
    await assert.rejects(post('/api/action', { fictional: true }), /Controlled uncertain write/); assert.equal(attempts, 1);
  } finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; }
});

test('a transient GET connection failure retries once within the original deadline', async () => {
  const originalFetch = globalThis.fetch; let attempts = 0; let signal: AbortSignal | null | undefined;
  try {
    globalThis.fetch = async (_input, init) => {
      attempts++; assert.ok(init?.signal); assert.equal(init.signal.aborted, false);
      if (attempts === 1) { signal = init.signal; throw new TypeError('Controlled connection reset'); }
      assert.equal(init.signal, signal); return Response.json({ recovered: true });
    };
    assert.deepEqual(await api('/api/cases'), { recovered: true }); assert.equal(attempts, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('repeated GET connection failures stop after two attempts', async () => {
  const originalFetch = globalThis.fetch; let attempts = 0;
  try {
    globalThis.fetch = async () => { attempts++; throw new TypeError('Controlled persistent reset'); };
    await assert.rejects(api('/api/cases'), /Controlled persistent reset/); assert.equal(attempts, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('a cancelled GET is not retried even if fetch reports a network TypeError', async () => {
  const originalFetch = globalThis.fetch; let attempts = 0;
  try {
    globalThis.fetch = async () => { attempts++; throw new TypeError('Controlled cancellation'); };
    await assert.rejects(api('/api/cases', { signal: AbortSignal.abort() }), /Controlled cancellation/); assert.equal(attempts, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('HTTP read errors are surfaced without automatic retries', async () => {
  const originalFetch = globalThis.fetch; let attempts = 0;
  try {
    globalThis.fetch = async () => { attempts++; return Response.json({ error: 'Controlled unavailable workspace' }, { status: 503 }); };
    await assert.rejects(api('/api/cases'), /Controlled unavailable workspace/); assert.equal(attempts, 1);
  } finally { globalThis.fetch = originalFetch; }
});
