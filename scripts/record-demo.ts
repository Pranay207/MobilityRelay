import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect, type Page } from '@playwright/test';
import { startServer } from '../server/app.js';
import type { Config } from '../server/config.js';
import type { AgentReply, ToolTrace } from '../shared/types.js';

const directory = resolve(process.argv[2] || '.data/demo-video-2026-10-23');
const story = JSON.parse(await readFile('scripts/demo-story.json', 'utf8')) as { scenes: { id: string; seconds: number }[] };
await mkdir(resolve(directory, 'raw'), { recursive: true });
const config: Config = { host: '127.0.0.1', port: 0, dataDir: directory, password: '', mcpToken: randomBytes(32).toString('hex'), publicOrigin: '', production: false, seed: true, agentMode: 'ollama', modelId: '', region: 'us-east-1', ollamaBaseUrl: 'http://127.0.0.1:11434', ollamaModel: 'qwen2.5:1.5b' };
const app = await startServer(config, { mode: 'capture', send: async () => `demo-local-${Date.now()}` }, { database: ':memory:' });
const browser = await chromium.launch({ channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 1600, height: 800 }, timezoneId: 'Asia/Kolkata', recordVideo: { dir: resolve(directory, 'raw'), size: { width: 1600, height: 800 } } });
const repair = app.store.cases().find(c => c.reference === 'DEMO-1042')!;
await context.addInitScript(id => sessionStorage.setItem('mobilityrelay:selected-case', id), repair.id);
const scenes: Record<string, unknown>[] = [];
const traces: ToolTrace[] = [];
const errors: string[] = [];
let inferenceCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (...args: Parameters<typeof fetch>) => {
  if (String(args[0]) === `${config.ollamaBaseUrl}/api/chat`) inferenceCalls++;
  return originalFetch(...args);
};
const send = async (page: Page, text: string): Promise<AgentReply> => {
  const pending = page.waitForResponse(r => r.url().endsWith('/api/agent') && r.request().method() === 'POST', { timeout: 170000 });
  const input = page.getByRole('textbox', { name: 'Message to Relay', exact: true });
  await input.fill(''); await input.pressSequentially(text, { delay: 33 });
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  const response = await pending; assert.ok(response.ok(), `Assistant HTTP ${response.status()}`);
  return response.json();
};
const record = async (id: string, setup: (page: Page) => Promise<void>, action: (page: Page) => Promise<void>) => {
  console.log(`Recording ${id}`);
  const page = await context.newPage(); const opened = performance.now();
  page.on('pageerror', e => errors.push(e.message));
  const pending: Promise<void>[] = [];
  page.on('response', r => {
    if (!r.url().startsWith(`${app.url}/api/`)) return;
    if (r.status() >= 400) errors.push(`${r.request().method()} ${new URL(r.url()).pathname}: ${r.status()}`);
    pending.push(r.json().then(data => { if (Array.isArray(data.traces)) traces.push(...data.traces); }).catch(() => {}));
  });
  await page.goto(app.url);
  await expect(page.getByRole('heading', { name: repair.title, exact: true })).toBeVisible();
  await setup(page); await page.waitForTimeout(400);
  const start = (performance.now() - opened) / 1000;
  const began = performance.now(); await page.waitForTimeout(700);
  await action(page);
  const target = story.scenes.find(s => s.id === id)!.seconds;
  await page.waitForTimeout(Math.max(1200, target * 1000 - (performance.now() - began)));
  const duration = (performance.now() - began) / 1000;
  await page.screenshot({ path: resolve(directory, `${id}.png`) });
  await Promise.all(pending);
  const video = page.video()!; await page.close();
  const path = resolve(directory, `${id}.webm`); await video.saveAs(path);
  scenes.push({ id, path, start, duration });
  await writeFile(resolve(directory, 'capture.json'), JSON.stringify({ scenes, errors, inferenceCalls, traces }, null, 2));
};
const noop = async () => {};
try {
  // Warm the local model before recording; inference in the comparison remains real.
  await originalFetch(`${config.ollamaBaseUrl}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.ollamaModel, prompt: 'Reply with OK.', stream: false, options: { num_predict: 3 } }), signal: AbortSignal.timeout(90000) });
  await record('compare', noop, async page => {
    const result = await send(page, 'Put the accounts from the two organizations side by side.');
    assert.equal(result.focus?.view, 'comparison'); assert.ok(inferenceCalls > 0);
    const message = page.getByRole('log').locator('.message-assistant').last();
    await expect(message).toContainText('Latest insurer report');
    await message.locator('.tool-trace summary').click();
    await expect(message).toContainText('get_repair_brief');
    await page.getByRole('region', { name: 'Reported paperwork sources', exact: true }).locator('summary').click();
  });
  await record('draft', noop, async page => {
    const result = await send(page, 'Ask the supplier for that reference.');
    assert.ok(result.draftId); assert.ok(result.traces.some(t => t.tool === 'prepare_repair_request' && t.ok));
    await expect(page.getByRole('dialog', { name: 'Review request', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve & capture locally', exact: true })).toBeDisabled();
    await expect(page.getByRole('dialog')).toContainText('Was the paperwork received?');
    await page.getByRole('button', { name: 'Approve & capture locally', exact: true }).scrollIntoViewIfNeeded();
  });
  const inputReply = async (page: Page) => {
    await page.getByRole('button', { name: 'Review reply', exact: true }).click();
    await page.getByRole('combobox', { name: 'Reply from', exact: true }).selectOption('insurer');
    await page.getByRole('textbox', { name: 'Source name', exact: true }).fill('Harbor Health - fictional reply');
    await page.getByRole('textbox', { name: 'Reply reference', exact: true }).fill('AB-47');
    await page.getByRole('textbox', { name: 'Reply text', exact: true }).pressSequentially('We received the estimate. Reference AB-47. Authorization is still pending.', { delay: 35 });
    await page.getByRole('button', { name: 'Preview changes', exact: true }).click();
    await expect(page.locator('.reply-answer blockquote')).toHaveText('We received the estimate.');
    await page.getByRole('button', { name: 'Record reviewed reply', exact: true }).scrollIntoViewIfNeeded();
  };
  await record('review', noop, async page => {
    await inputReply(page);
    await expect(page.getByRole('checkbox', { name: 'Was the paperwork received?', exact: true })).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Record reviewed reply', exact: true })).toBeDisabled();
  });
  await record('confirm', inputReply, async page => {
    await page.getByRole('checkbox', { name: 'Was the paperwork received?', exact: true }).check();
    await page.waitForTimeout(800);
    await page.getByRole('checkbox', { name: 'I reviewed the source and selected answers.', exact: true }).check();
    await page.getByRole('button', { name: 'Record reviewed reply', exact: true }).click();
    await expect(page.getByRole('region', { name: 'What changed', exact: true })).toContainText('What is blocking authorization?');
    await page.getByRole('region', { name: 'What changed', exact: true }).scrollIntoViewIfNeeded();
    const brief = app.store.brief(repair.id);
    assert.ok(brief.questions.find(q => q.kind === 'receipt')?.resolved);
    assert.equal(brief.questions.find(q => q.kind === 'approval')?.resolved, false);
  });
  await record('stale', async page => {
    await page.getByRole('tab', { name: /^Requests/ }).click();
  }, async page => {
    await page.getByRole('button', { name: /Repair DEMO-1042: clarification requested/ }).click();
    await expect(page.getByRole('checkbox', { name: 'I approve this recipient and exact message.', exact: true })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'I approve this recipient and exact message.', exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(6000);
    await page.getByRole('button', { name: 'Prepare fresh draft', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: /Was the paperwork received/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Prepare draft', exact: true }).click();
    const body = await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue();
    assert.ok(body.includes('What is blocking authorization?')); assert.ok(!body.includes('Was the paperwork received?'));
  });
  await record('capture', async page => {
    await page.getByRole('tab', { name: /^Requests/ }).click();
    const fresh = app.store.brief(repair.id).drafts.find(d => d.status === 'draft' && d.caseVersion === app.store.brief(repair.id).repairCase.version)!;
    assert.ok(fresh, 'Fresh current draft missing');
    await page.getByRole('button', { name: /Repair DEMO-1042: clarification requested/ }).filter({ hasText: 'draft' }).first().click();
  }, async page => {
    await expect(page.getByRole('dialog')).toContainText('Local capture only. No email will be delivered.');
    await page.getByRole('button', { name: 'Approve & capture locally', exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    await page.getByRole('checkbox', { name: 'I approve this recipient and exact message.', exact: true }).check();
    await page.getByRole('button', { name: 'Approve & capture locally', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('Local capture', { exact: true })).toBeVisible();
  });
  await record('followup', noop, async page => {
    const result = await send(page, 'Remind me tomorrow');
    assert.ok(result.traces.some(t => t.tool === 'manage_repair_followup' && t.ok));
    await page.getByRole('tab', { name: 'Follow-ups', exact: true }).click();
    await expect(page.getByText('Follow up: What is blocking authorization?', { exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByRole('heading', { name: repair.title, exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Follow-ups', exact: true }).click();
    await expect(page.getByText('Follow up: What is blocking authorization?', { exact: true })).toBeVisible();
  });
  await record('export', noop, async page => {
    const downloading = page.waitForEvent('download');
    const result = await send(page, 'Export my case history');
    assert.ok(result.traces.some(t => t.tool === 'export_repair_packet' && t.ok));
    const download = await downloading; await download.saveAs(resolve(directory, 'repair-history.html'));
    await page.waitForTimeout(3000);
    const html = await readFile(resolve(directory, 'repair-history.html'), 'utf8');
    assert.ok(!html.includes('Maya')); assert.ok(html.includes('Identity redaction enabled'));
    await page.setContent(html);
    await expect(page.getByRole('heading', { name: 'MobilityRelay case history', exact: true })).toBeVisible();
    await page.waitForTimeout(2500); await page.mouse.wheel(0, 430);
  });
  await context.close();
  const state = app.store.brief(repair.id);
  for (const tool of ['get_repair_brief', 'prepare_repair_request', 'record_repair_event', 'send_approved_request', 'manage_repair_followup', 'export_repair_packet']) assert.ok(traces.some(t => t.ok && t.tool === tool), `Missing real tool ${tool}`);
  assert.deepEqual(errors, []);
  assert.equal(state.drafts.filter(d => d.status === 'captured').length, 1);
  assert.equal(state.followups.filter(f => f.status === 'scheduled').length, 1);
  await writeFile(resolve(directory, 'capture.json'), JSON.stringify({ completed: true, scenes, errors, inferenceCalls, traces, evidence: { fictional: true, mode: 'ollama', model: config.ollamaModel, input: 'Typed UI commands; no physical microphone recording', email: 'Local capture only; no email delivered', receiptAnswered: true, authorizationOpen: true } }, null, 2));
  console.log(`Capture complete: ${directory}`);
} finally {
  globalThis.fetch = originalFetch;
  await context.close().catch(() => {}); await browser.close(); await app.close();
}
