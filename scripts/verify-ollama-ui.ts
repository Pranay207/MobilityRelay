import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { startServer } from '../server/app.js';
import { readConfig } from '../server/config.js';
import type { AgentReply } from '../shared/types.js';

const config = { ...readConfig(), host: '127.0.0.1', port: 0, password: '', publicOrigin: '', production: false, seed: true, agentMode: 'ollama' as const, mcpToken: randomBytes(32).toString('hex') };
const app = await startServer(config, { mode: 'capture', send: async () => { throw new Error('UI verification must not deliver email.'); } }, { database: ':memory:' });
const browser = await chromium.launch({ channel: 'msedge' });
const pageErrors: string[] = [];
const originalFetch = globalThis.fetch; let modelCalls = 0;
globalThis.fetch = (...args: Parameters<typeof fetch>) => {
  if (String(args[0]) === `${config.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`) modelCalls++;
  return originalFetch(...args);
};
try {
  await mkdir('.data/screenshots', { recursive: true });
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  desktop.on('pageerror', error => pageErrors.push(error.message));
  await desktop.goto(app.url);
  await expect(desktop.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  await expect(desktop.getByRole('complementary', { name: 'Simulated Alexa+ repair conversation' })).toContainText(`Ollama / ${config.ollamaModel}`);
  for (const command of ['Case brief', 'Case packet']) {
    const beforeModelCalls = modelCalls;
    const completion = desktop.waitForResponse(response => response.url().endsWith('/api/agent') && response.request().method() === 'POST', { timeout: 15000 });
    const download = command === 'Case packet' ? desktop.waitForEvent('download') : undefined;
    const began = performance.now(); await desktop.getByRole('button', { name: command, exact: true }).click();
    const response = await completion; assert.equal(response.ok(), true); const reply = await response.json() as AgentReply;
    assert.deepEqual(reply.traces.map(trace => trace.tool), command === 'Case brief' ? ['get_repair_brief'] : ['get_repair_brief', 'export_repair_packet']);
    if (download) { assert.equal((await download).suggestedFilename(), 'repair-history.html'); assert.ok(reply.packet); assert.equal(reply.packet.mime, 'text/html'); assert.equal(reply.packet.content.includes('Maya'), false); }
    else assert.match(reply.reply, /user-maintained record/);
    assert.equal(modelCalls, beforeModelCalls, 'The browser shortcut must not call the model.');
    console.log(`Ollama-mode browser ${command}: ${Math.round(performance.now() - began)} ms; real MCP, no inference required.`);
    await expect(desktop.getByRole('button', { name: command, exact: true })).toBeEnabled();
  }
  const completion = desktop.waitForResponse(response => response.url().endsWith('/api/agent') && response.request().method() === 'POST', { timeout: 180000 });
  await desktop.getByRole('textbox', { name: 'Message to Relay' }).fill('Prepare a request to the supplier asking for the missing estimate reference.');
  const started = performance.now(); await desktop.getByRole('button', { name: 'Send message', exact: true }).click();
  const response = await completion; assert.equal(response.ok(), true);
  assert.ok(modelCalls > 0, 'Draft selection must still exercise real local inference.');
  const result = await response.json() as AgentReply; assert.ok(result.draftId); assert.ok(result.traces.some(trace => trace.tool === 'prepare_repair_request' && trace.ok)); assert.match(result.reply, /explicit approval/);
  const dialog = desktop.getByRole('dialog'); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Approve & capture locally', exact: true })).toBeDisabled();
  await expect(dialog).toContainText('Was the paperwork received?');
  await desktop.screenshot({ path: '.data/screenshots/desktop-real-ollama-review.png', fullPage: true });
  console.log(`Real browser + local AI + MCP draft review passed in ${Math.round(performance.now() - started)} ms; no approval or delivery.`);
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on('pageerror', error => pageErrors.push(error.message));
  await mobile.goto(app.url); await expect(mobile.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  await mobile.getByRole('button', { name: 'Open Relay', exact: true }).click();
  const relay = mobile.getByRole('complementary', { name: 'Simulated Alexa+ repair conversation' });
  await expect(relay).toContainText(`Ollama / ${config.ollamaModel}`); await expect(relay).toContainText('Nothing has been sent');
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.screenshot({ path: '.data/screenshots/mobile-real-ollama-conversation.png', fullPage: true });
  assert.ok(app.store.brief(app.store.cases().find(item => item.reference === 'DEMO-1042')!.id).drafts.every(draft => draft.status === 'draft'));
  assert.deepEqual(pageErrors, [], 'Live AI browser flow must not produce uncaught page errors.');
  console.log('Actual AI desktop review and mobile persisted conversation verified with isolated fictional data.');
} finally { globalThis.fetch = originalFetch; await browser.close(); await app.close(); }
