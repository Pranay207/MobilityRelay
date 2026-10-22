import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect, type Browser } from '@playwright/test';
import { startServer } from '../server/app.js';
import type { Config } from '../server/config.js';
import { createMail } from '../server/mail.js';
import type { ToolTrace } from '../shared/types.js';

const label = process.argv[2] || new Date().toISOString().replace(/\D/g, '').slice(0, 14);
assert.match(label, /^[a-z0-9-]+$/);
const directory = resolve('.data/verification', `usefulness-${label}`);
await mkdir(directory, { recursive: true });
const config: Config = { host: '127.0.0.1', port: 0, dataDir: directory, password: '', mcpToken: randomBytes(32).toString('hex'), publicOrigin: '', production: false, seed: false, agentMode: 'local', modelId: '', region: 'us-east-1', ollamaBaseUrl: 'http://127.0.0.1:1', ollamaModel: 'unused' };
const app = await startServer(config, createMail({ MAIL_MODE: 'capture' }), { database: ':memory:' });
let browser: Browser | undefined;
const steps: { name: string; milliseconds: number; outcome: string }[] = [];
const pageErrors: string[] = []; const failedRequests: string[] = []; const traces: ToolTrace[] = [];
const pendingResponses: Promise<void>[] = [];
const report: Record<string, unknown> = {
  type: 'Agent-authored scripted browser task, not an independent user study',
  startedAt: new Date().toISOString(), fictional: true, mode: 'local', mail: 'capture',
  method: 'One preplanned desktop run in Edge at 1440x1000, Asia/Kolkata. No speech, model, inbox or supplier integration. In-memory setup and browser startup excluded. Step times include automation, assertions and application waits, not human reading or decision time. Wall time also includes screenshots between steps.',
  steps,
};
try {
  const repair = app.store.createCase({ title: 'Fictional coordination walkthrough', person: 'Fictional Casey', equipment: 'Power wheelchair', reference: 'MEASURE-1042', category: 'Paperwork clarification', fictional: true });
  for (const contact of [{ name: 'Fictional Supplier', role: 'supplier' as const, email: 'supplier@example.invalid' }, { name: 'Fictional Insurer', role: 'insurer' as const, email: 'insurer@example.invalid' }]) app.store.saveContact({ ...contact, caseId: repair.id, verified: false });
  const sources = [
    { party: 'supplier' as const, source: 'Fictional Supplier', stage: 'paperwork_sent' as const, text: 'We sent the estimate.', age: 48 },
    { party: 'insurer' as const, source: 'Fictional Insurer', stage: 'paperwork_requested' as const, text: 'We cannot locate the estimate.', age: 24 },
    { party: 'insurer' as const, source: 'Fictional Insurer', stage: 'authorization_pending' as const, text: 'Authorization is pending.', age: 12 },
  ].map(({ age, ...source }) => app.store.recordEvent({ ...source, caseId: repair.id, requestId: randomUUID(), channel: 'Email', occurredAt: new Date(Date.now() - age * 3600000).toISOString(), reference: '', supersedesId: null }));
  browser = await chromium.launch({ channel: 'msedge' });
  report.runtime = { node: process.version, platform: process.platform, browser: browser.version(), viewport: '1440x1000', timezone: 'Asia/Kolkata' };
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Kolkata' });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`));
  page.on('response', response => {
    if (!response.url().startsWith(`${app.url}/api/`)) return;
    if (response.status() >= 400) failedRequests.push(`${response.request().method()} ${new URL(response.url()).pathname}: HTTP ${response.status()}`);
    pendingResponses.push(response.json().then(data => { if (Array.isArray(data.traces)) traces.push(...data.traces); }).catch(() => {}));
  });
  await page.goto(app.url);
  await expect(page.getByRole('heading', { name: repair.title, exact: true })).toBeVisible();
  const started = performance.now();
  report.taskStartedAt = new Date().toISOString();
  const step = async (name: string, outcome: string, action: () => Promise<void>) => {
    const began = performance.now(); await action();
    const item = { name, milliseconds: Math.round(performance.now() - began), outcome }; steps.push(item);
    console.log(`${name}: ${item.milliseconds} ms`);
    await page.screenshot({ path: resolve(directory, `${steps.length}-workspace.png`), fullPage: true });
  };
  await step('Inspect conflicting reports', 'Both dated sources inspected; receipt is unanswered and no fault assigned.', async () => {
    const paired = page.getByRole('region', { name: 'Reported paperwork sources', exact: true });
    await paired.locator('summary').click();
    await expect(paired).toContainText(sources[0].text); await expect(paired).toContainText(sources[1].text);
    await page.getByRole('button', { name: 'View supplier source', exact: true }).click();
    await expect(page.locator(`#event-${sources[0].id}`)).toContainText(sources[0].text);
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await paired.locator('summary').click();
    await page.getByRole('button', { name: 'View insurer source', exact: true }).click();
    await expect(page.locator(`#event-${sources[1].id}`)).toContainText(sources[1].text);
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Was the paperwork received?', exact: true })).toBeVisible();
  });
  await step('Prepare initial receipt request', 'A source-backed receipt request is saved as an unapproved draft.', async () => {
    await page.getByRole('button', { name: 'Prepare a request', exact: true }).click();
    await page.getByRole('button', { name: 'Prepare draft', exact: true }).click();
    const body = await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue();
    assert.ok(body.includes(sources[0].text) && body.includes(sources[1].text));
    await expect(page.getByRole('button', { name: 'Approve & capture locally', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  });
  const reply = 'We received the estimate. Reference AB-47. Authorization is still pending.';
  await step('Review incoming insurer reply', 'Only receipt is answered from an exact quotation; authorization remains open.', async () => {
    await page.getByRole('button', { name: 'Review reply', exact: true }).click();
    await page.getByRole('combobox', { name: 'Reply from', exact: true }).selectOption('insurer');
    await page.getByRole('textbox', { name: 'Source name', exact: true }).fill('Fictional Insurer');
    await page.getByRole('textbox', { name: 'Reply reference', exact: true }).fill('AB-47');
    await page.getByRole('textbox', { name: 'Reply text', exact: true }).fill(reply);
    await page.getByRole('button', { name: 'Preview changes', exact: true }).click();
    const receipt = page.getByRole('checkbox', { name: 'Was the paperwork received?', exact: true });
    await expect(receipt).not.toBeChecked();
    await expect(page.locator('.reply-answer blockquote')).toHaveText('We received the estimate.');
    await expect(page.getByRole('button', { name: 'Record reviewed reply', exact: true })).toBeDisabled();
    await receipt.check();
    await page.getByRole('checkbox', { name: 'I reviewed the source and selected answers.', exact: true }).check();
    await page.getByRole('button', { name: 'Record reviewed reply', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('region', { name: 'What changed', exact: true })).toContainText('What is blocking authorization?');
    const brief = app.store.brief(repair.id);
    assert.equal(brief.questions.find(q => q.kind === 'receipt')?.resolved, true);
    assert.equal(brief.questions.find(q => q.kind === 'approval')?.resolved, false);
  });
  await step('Replace stale draft and approve current follow-up', 'Old approval is blocked; current authorization request is reviewed and captured, not emailed.', async () => {
    await page.getByRole('tab', { name: /^Requests/ }).click();
    await page.getByRole('button', { name: /Repair MEASURE-1042: clarification requested/ }).click();
    await expect(page.getByRole('checkbox', { name: 'I approve this recipient and exact message.', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Prepare fresh draft', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: /Was the paperwork received/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Prepare draft', exact: true }).click();
    const message = await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue();
    assert.ok(message.includes(reply) && message.includes('What is blocking authorization?'));
    assert.ok(!message.includes('Was the paperwork received?'));
    await expect(page.getByRole('dialog')).toContainText('insurer@example.invalid');
    await expect(page.getByRole('dialog')).toContainText('Local capture only. No email will be delivered.');
    await page.getByRole('checkbox', { name: 'I approve this recipient and exact message.', exact: true }).check();
    await page.getByRole('button', { name: 'Approve & capture locally', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('Local capture', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  });
  await step('Schedule and reload a follow-up', 'One local due item survives reload; it is not an automatic chase or notification.', async () => {
    await page.getByRole('tab', { name: 'Follow-ups', exact: true }).click();
    await page.getByRole('button', { name: 'Schedule', exact: true }).click();
    await page.getByRole('textbox', { name: 'Follow-up title', exact: true }).fill('Check authorization response');
    await page.getByRole('combobox', { name: 'Related question', exact: true }).selectOption({ label: 'What is blocking authorization?' });
    await page.getByRole('button', { name: 'Schedule follow-up', exact: true }).click();
    await expect(page.getByText('Check authorization response', { exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByRole('heading', { name: repair.title, exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Follow-ups', exact: true }).click();
    await expect(page.getByText('Check authorization response', { exact: true })).toBeVisible();
  });
  let exportPath = '';
  await step('Download redacted case history', 'Printable HTML history downloaded with identity redaction enabled.', async () => {
    await page.getByRole('button', { name: 'Export history', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Redact known names and contact details', exact: true })).toBeChecked();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download history', exact: true }).click();
    const download = await downloading; assert.equal(download.suggestedFilename(), 'repair-history.html');
    exportPath = resolve(directory, download.suggestedFilename()); await download.saveAs(exportPath);
  });
  report.wallTaskMs = Math.round(performance.now() - started);
  report.taskFinishedAt = new Date().toISOString();
  report.summedStepMs = steps.reduce((sum, item) => sum + item.milliseconds, 0);
  // Verify the actual downloaded artifact after stopping the task clock.
  const exported = await readFile(exportPath, 'utf8');
  for (const secret of ['Fictional Casey', 'MEASURE-1042', 'supplier@example.invalid', 'insurer@example.invalid']) assert.ok(!exported.includes(secret));
  const history = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  await history.setContent(exported);
  await expect(history.getByRole('heading', { name: 'MobilityRelay case history', exact: true })).toBeVisible();
  await expect(history.getByRole('listitem').filter({ hasText: 'Was the paperwork received?' })).toContainText('Answered:');
  await expect(history.getByRole('listitem').filter({ hasText: 'What is blocking authorization?' })).toContainText('Unresolved');
  for (const source of sources) await expect(history.locator('body')).toContainText(source.text);
  await expect(history.locator('body')).toContainText(reply);
  await expect(history.locator('body')).toContainText('captured');
  await expect(history.locator('body')).toContainText('Check authorization response');
  await expect(history.locator('article:has(.stale)')).toHaveCount(1);
  await expect(history.locator('article:has(.stale)')).toContainText('Stale draft');
  await expect(history.locator(`[id="source-${sources[0].id}"] > strong`)).toContainText('Source 1 |');
  assert.equal(await history.locator('a[href^="#source-"]').evaluateAll(links => links.every(link => document.getElementById((link as HTMLAnchorElement).hash.slice(1)))), true);
  await history.screenshot({ path: resolve(directory, '7-exported-history.png'), fullPage: true });
  const brief = app.store.brief(repair.id);
  assert.equal(brief.events.length, 5); assert.equal(brief.drafts.length, 2);
  assert.equal(brief.questions.find(q => q.kind === 'receipt')?.resolved, true);
  assert.equal(brief.questions.find(q => q.kind === 'approval')?.resolved, false);
  assert.equal(brief.drafts.filter(d => d.status === 'captured').length, 1);
  assert.equal(brief.followups.filter(f => f.status === 'scheduled').length, 1);
  assert.ok(!brief.events.some(e => e.stage === 'repair_completed'));
  await Promise.all(pendingResponses);
  assert.deepEqual(pageErrors, []); assert.deepEqual(failedRequests, []); assert.ok(traces.every(t => t.ok));
  for (const tool of ['get_repair_brief', 'prepare_repair_request', 'record_repair_event', 'send_approved_request', 'manage_repair_followup', 'export_repair_packet']) assert.ok(traces.some(t => t.tool === tool), `Missing real MCP trace: ${tool}`);
  Object.assign(report, {
    completed: true, completedAt: new Date().toISOString(), unexpectedFailures: 0,
    intentionallyTestedSafeguards: ['Unapproved draft cannot be captured', 'Reply answer starts unchecked', 'Stale draft approval is disabled'],
    operatorContext: 'Author knew the implementation and preselected selectors. No searching, human deliberation or independent participant feedback was measured.',
    observerFriction: [
      'The source-backed follow-up is called a request in the Requests view; the separately named Follow-ups view stores due items, not messages.',
      'After the reply changes the case, the user must open the old request, choose Prepare fresh draft, then review and approve the new message.',
      'Receipt and authorization are separate review outcomes. Recording the reply does not automatically select its proposed answer.',
      'Exported stale drafts and numbered source links are checked, but independent handover comprehension remains untested.',
    ],
    outcome: { eventCount: brief.events.length, receiptAnswered: true, authorizationOpen: true, draftCount: brief.drafts.length, locallyCapturedMessages: 1, scheduledLocalDueItems: 1, deliveredEmails: 0, repairCompleted: false },
    export: { filename: 'repair-history.html', bytes: Buffer.byteLength(exported), sha256: createHash('sha256').update(exported).digest('hex'), knownIdentityChecksPassed: true, staleDraftLabelChecked: true, sourceLinksChecked: true, fullAnonymizationClaimed: false },
    toolCounts: Object.fromEntries([...new Set(traces.map(t => t.tool))].map(tool => [tool, traces.filter(t => t.tool === tool).length])),
    limitations: 'One scripted run; no manual baseline, independent human, wheelchair-user validation, reading time, physical voice check, real email delivery or evidence of shorter repairs. Timing is not a human usability result, production benchmark or quantified benefit.',
  });
  console.log(JSON.stringify({ completed: true, wallTaskMs: report.wallTaskMs, summedStepMs: report.summedStepMs, report: resolve(directory, 'summary.json'), export: exportPath }));
} catch (error) {
  report.completed = false; report.error = error instanceof Error ? error.message : 'Walkthrough failed';
  throw error;
} finally {
  await writeFile(resolve(directory, 'summary.json'), JSON.stringify({ ...report, pageErrors, failedRequests }, null, 2));
  await browser?.close(); await app.close();
}
