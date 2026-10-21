import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Brief, Draft, RepairCase } from '../shared/types';

async function fixture(page: Page, project: string) {
  const session = await (await page.request.get('/api/session')).json(); const headers = { 'x-relay-csrf': session.csrf };
  const create = await page.request.post('/api/cases', { headers, data: { title: `Reply review ${project} ${Date.now()}`, person: 'Fictional Reviewer', equipment: 'Power wheelchair', reference: 'REPLY-TEST', category: 'Paperwork clarification', fictional: true } });
  expect(create.ok()).toBe(true); const repair: RepairCase = await create.json();
  const call = async <T,>(tool: string, args: object): Promise<T> => { const response = await page.request.post('/api/action', { headers, data: { tool, args } }); expect(response.ok(), await response.text()).toBe(true); return (await response.json()).data; };
  const event = (stage: string, text: string, party = stage === 'paperwork_sent' ? 'supplier' : 'insurer') => call('record_repair_event', { caseId: repair.id, requestId: crypto.randomUUID(), party, source: 'Fictional source', channel: 'Email', occurredAt: new Date(Date.now() - 60000).toISOString(), text, stage });
  await event('paperwork_sent', 'We sent the estimate.'); await event('paperwork_requested', 'We cannot locate the estimate.'); await event('authorization_pending', 'Authorization is pending.');
  const contactResponse = await page.request.post('/api/contacts', { headers, data: { caseId: repair.id, name: 'Fictional Insurer', role: 'insurer', email: 'test@insurer.example', verified: false } }); expect(contactResponse.ok()).toBe(true);
  const contact = await contactResponse.json();
  const brief = async (): Promise<Brief> => (await (await page.request.get(`/api/cases/${repair.id}`)).json()).data;
  const oldDraft = await call<Draft>('prepare_repair_request', { caseId: repair.id, requestId: crypto.randomUUID(), recipientId: contact.id, questionIds: (await brief()).questions.filter(q => !q.resolved).map(q => q.id), subject: 'Old receipt request', body: 'OLD DRAFT BODY asking about receipt.' });
  const choose = async () => { if ((await page.viewportSize())!.width <= 760) await page.getByRole('button', { name: 'Open case navigation', exact: true }).click(); await page.getByRole('button', { name: new RegExp(repair.title) }).click(); await expect(page.getByRole('heading', { name: repair.title, exact: true })).toBeVisible(); };
  const open = async () => { await page.getByRole('button', { name: 'Review reply', exact: true }).click(); await page.getByRole('combobox', { name: 'Reply from', exact: true }).selectOption('insurer'); await page.getByRole('textbox', { name: 'Source name', exact: true }).fill('Fictional Insurer'); await page.getByRole('textbox', { name: 'Reply text', exact: true }).fill('We received the estimate. Reference AB-47. Authorization is still pending.'); await page.getByRole('textbox', { name: 'Reply reference', exact: true }).fill('AB-47'); };
  const cleanup = async () => { const response = await page.request.delete(`/api/cases/${repair.id}`, { headers, data: { confirm: repair.title } }); expect(response.ok()).toBe(true); };
  return { repair, brief, oldDraft, choose, open, event, cleanup };
}

test('supplier appointment review answers only the visit time with an exact quote and explicit confirmation', async ({ page }, info) => {
  test.setTimeout(60000);
  const f = await fixture(page, info.project.name);
  try {
    await f.event('appointment_scheduled', 'A visit was offered; its time needs confirmation.', 'supplier');
    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const text = `Your repair appointment is confirmed for ${date} at 14:30 UTC+05:30.`;
    await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible(); await f.choose();
    const before = await f.brief(); await f.open();
    await page.getByRole('combobox', { name: 'Reply from', exact: true }).selectOption('supplier');
    await page.getByRole('textbox', { name: 'Source name', exact: true }).fill('Fictional Supplier');
    await page.getByRole('textbox', { name: 'Reply text', exact: true }).fill(text);
    await page.getByRole('button', { name: 'Preview changes', exact: true }).click();
    const time = page.getByRole('checkbox', { name: 'Is the repair visit date and time confirmed?', exact: true });
    const confirm = page.getByRole('checkbox', { name: 'I reviewed the source and selected answers.', exact: true });
    await expect(time).not.toBeChecked(); await expect(page.locator('.reply-answer blockquote')).toHaveText(text);
    await expect(page.locator('.reply-remaining')).toContainText('Are parts and accessibility arrangements ready for the visit?');
    await expect(page.getByText('A confirmed appointment time does not confirm parts, accessibility arrangements or repair completion.', { exact: false })).toBeVisible();
    expect(await f.brief()).toEqual(before);
    await confirm.check(); await time.check(); await expect(confirm).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Record reviewed reply', exact: true })).toBeDisabled();
    await expect(page.getByRole('region', { name: 'Before and after preview' })).toContainText('3 open');
    await confirm.check();
    await page.setViewportSize({ width: info.project.name === 'mobile' ? 320 : 1440, height: 900 });
    expect(await page.locator('dialog[open]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual([]);
    await page.screenshot({ path: `.data/screenshots/${info.project.name}-appointment-preview.png`, fullPage: true });
    await page.getByRole('button', { name: 'Record reviewed reply', exact: true }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
    const after = await f.brief(); const appointment = after.questions.find(q => q.kind === 'appointment')!;
    expect(appointment.resolved).toBe(true); expect(appointment.answer).toContain(text);
    expect(after.events.find(e => e.id === appointment.answerSourceId)?.text).toBe(text);
    for (const kind of ['receipt', 'approval', 'visit_readiness']) expect(after.questions.find(q => q.kind === kind)?.resolved).toBe(false);
    expect(after.events.some(e => e.stage === 'repair_completed')).toBe(false);
    await page.reload(); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible(); await f.choose();
    await expect(page.getByRole('region', { name: 'What changed', exact: true })).toContainText('Is the repair visit date and time confirmed?');
  } finally { await f.cleanup(); }
});

test('appointment without a time zone remains evidence-only and requires review to save', async ({ page }, info) => {
  const f = await fixture(page, info.project.name);
  try {
    await f.event('appointment_scheduled', 'A visit was offered; its time needs confirmation.', 'supplier');
    await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible(); await f.choose(); await f.open();
    await page.getByRole('combobox', { name: 'Reply from', exact: true }).selectOption('supplier');
    await page.getByRole('textbox', { name: 'Source name', exact: true }).fill('Fictional Supplier');
    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    await page.getByRole('textbox', { name: 'Reply text', exact: true }).fill(`Your repair appointment is confirmed for ${date} at 14:30.`);
    await page.getByRole('button', { name: 'Preview changes', exact: true }).click();
    await expect(page.getByText('No supported answer proposed.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record reviewed reply', exact: true })).toBeDisabled();
    expect((await f.brief()).events).toHaveLength(4);
    await page.getByRole('checkbox', { name: 'I reviewed the source and selected answers.', exact: true }).check();
    await page.getByRole('button', { name: 'Record reviewed reply', exact: true }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
    const after = await f.brief(); expect(after.events).toHaveLength(5);
    expect(after.questions.find(q => q.kind === 'appointment')?.resolved).toBe(false);
    expect(after.questions.find(q => q.kind === 'visit_readiness')?.resolved).toBe(false);
  } finally { await f.cleanup(); }
});

test('reviewed reply closes only selected receipt, persists changes and rebuilds stale request', async ({ page }, info) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const f = await fixture(page, info.project.name);
  try {
    await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible(); await f.choose();
    const before = await f.brief(); await f.open(); await page.getByRole('button', { name: 'Preview changes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review proposed changes', exact: true })).toBeFocused();
    const confirm = page.getByRole('checkbox', { name: 'I reviewed the source and selected answers.', exact: true });
    const receipt = page.getByRole('checkbox', { name: 'Was the paperwork received?', exact: true });
    await expect(receipt).not.toBeChecked(); await expect(page.getByRole('button', { name: 'Record reviewed reply', exact: true })).toBeDisabled();
    expect(await f.brief()).toEqual(before);
    await confirm.check(); await receipt.check(); await expect(confirm).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Record reviewed reply', exact: true })).toBeDisabled();
    await expect(page.getByRole('region', { name: 'Before and after preview' })).toContainText('1 open');
    await expect(page.getByRole('heading', { name: 'Still unanswered', exact: true })).toBeVisible();
    await expect(page.locator('.reply-answer blockquote')).toHaveText('We received the estimate.');
    await confirm.check();
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual([]);
    await page.screenshot({ path: `.data/screenshots/${info.project.name}-reply-review-preview.png`, fullPage: true });
    await page.getByRole('button', { name: 'Record reviewed reply', exact: true }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
    const after = await f.brief(); expect(after.events.length).toBe(before.events.length + 1); expect(after.questions.find(q => q.kind === 'receipt')?.resolved).toBe(true); expect(after.questions.find(q => q.kind === 'approval')?.resolved).toBe(false);
    await expect(page.getByRole('region', { name: 'What changed', exact: true })).toContainText('1 open');
    await page.reload(); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible(); await f.choose();
    await expect(page.getByRole('region', { name: 'What changed', exact: true })).toContainText('What is blocking authorization?');
    await page.screenshot({ path: `.data/screenshots/${info.project.name}-reply-review-saved.png`, fullPage: true });
    await page.getByRole('tab', { name: /^Requests/ }).click(); await page.getByRole('button', { name: /Old receipt request/ }).click();
    await expect(page.getByRole('checkbox', { name: 'I approve this recipient and exact message.' })).toBeDisabled();
    await page.getByRole('button', { name: 'Prepare fresh draft', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Prepare a request', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Was the paperwork received/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Prepare draft', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(/Authorization is still pending\./);
    const body = await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(); expect(body).not.toContain('OLD DRAFT BODY'); expect(body).not.toContain('Was the paperwork received?');
    expect((await f.brief()).drafts.every(d => d.status === 'draft')).toBe(true);
    expect(errors).toEqual([]);
  } finally { await f.cleanup(); }
});

test('stale preview is rejected without an answer and can be re-reviewed', async ({ page }, info) => {
  const f = await fixture(page, info.project.name);
  try {
    await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible(); await f.choose(); await f.open();
    await page.getByRole('button', { name: 'Preview changes', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Was the paperwork received?', exact: true }).check();
    await page.getByRole('checkbox', { name: 'I reviewed the source and selected answers.', exact: true }).check();
    await f.event('other', 'An intervening fictional update.');
    await page.getByRole('button', { name: 'Record reviewed reply', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert').filter({ hasText: /case changed after this preview/ })).toBeVisible();
    expect((await f.brief()).questions.find(q => q.kind === 'receipt')?.resolved).toBe(false);
    await page.getByRole('button', { name: 'Edit reply', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Reply text', exact: true })).toHaveValue(/We received the estimate/);
    await page.getByRole('button', { name: 'Preview changes', exact: true }).click(); await expect(page.getByRole('checkbox', { name: 'Was the paperwork received?', exact: true })).not.toBeChecked();
    await page.getByRole('checkbox', { name: 'I reviewed the source and selected answers.', exact: true }).check();
    await page.getByRole('button', { name: 'Record reviewed reply', exact: true }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
    expect((await f.brief()).questions.filter(q => !q.resolved)).toHaveLength(2);
  } finally { await f.cleanup(); }
});

test('reply review fits narrow and wide viewports with long sources and ambiguous wording', async ({ page }, info) => {
  test.setTimeout(60000);
  const f = await fixture(page, info.project.name);
  try {
    await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible(); await f.choose();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await f.open();
      await page.getByRole('textbox', { name: 'Source name', exact: true }).fill('LongFictionalSource'.repeat(8));
      await page.getByRole('textbox', { name: 'Reply text', exact: true }).fill('We have not received the estimate. ' + 'UnresolvedFictionalReference'.repeat(16));
      await page.getByRole('button', { name: 'Preview changes', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Review incoming reply', exact: true })).toBeInViewport();
      await expect(page.getByRole('button', { name: 'Close dialog', exact: true })).toBeInViewport();
      await expect(page.getByText('No supported answer proposed.', { exact: false })).toBeVisible();
      expect(await page.locator('dialog[open]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual([]);
      await page.screenshot({ path: `.data/screenshots/${info.project.name}-reply-review-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    }
    expect((await f.brief()).events.length).toBe(3);
  } finally { await f.cleanup(); }
});

test('typed insurer reply opens review without recording it', async ({ page }, info) => {
  const f = await fixture(page, info.project.name);
  try {
    await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible(); await f.choose();
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
    await page.getByLabel('Message to Relay', { exact: true }).fill('The insurer replied: We received the estimate. Authorization is still pending.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Review incoming reply', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Reply from', exact: true })).toHaveValue('insurer'); await expect(page.getByRole('textbox', { name: 'Source name', exact: true })).toHaveValue('Fictional Insurer');
    await expect(page.getByRole('textbox', { name: 'Reply text', exact: true })).toHaveValue('We received the estimate. Authorization is still pending.');
    expect((await f.brief()).events.length).toBe(3);
  } finally { await f.cleanup(); }
});

test('a cancelled preview cannot open review in another case or save evidence', async ({ page }, info) => {
  const f = await fixture(page, info.project.name);
  let release = () => {}; const gate = new Promise<void>(resolve => { release = resolve; });
  let started = () => {}; const waiting = new Promise<void>(resolve => { started = resolve; });
  let finished = () => {}; const completed = new Promise<void>(resolve => { finished = resolve; });
  try {
    await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible(); await f.choose(); await f.open();
    await page.route('**/api/replies/preview', async route => {
      try { const response = await route.fetch(); started(); await gate; await route.fulfill({ response }); }
      catch { /* The browser may cancel the request when the review closes. */ }
      finally { finished(); }
    }, { times: 1 });
    await page.getByRole('button', { name: 'Preview changes', exact: true }).click(); await waiting;
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open case navigation', exact: true }).click();
    await page.getByRole('button', { name: /M Power chair repair Maya/ }).click(); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
    release(); await completed;
    await expect(page.getByRole('dialog')).not.toBeVisible(); expect((await f.brief()).events.length).toBe(3);
  } finally { release(); await f.cleanup(); }
});

test('controlled English speech opens the same review boundary without saving', async ({ page }, info) => {
  const f = await fixture(page, info.project.name);
  await page.addInitScript(() => {
    class Recognition {
      lang = ''; continuous = false; interimResults = false;
      onresult: ((event: { resultIndex: number; results: { transcript: string }[][] }) => void) | null = null;
      onerror = null; onend: (() => void) | null = null;
      start() { if (this.lang !== 'en-IN') throw new Error('Expected English'); this.onresult?.({ resultIndex: 0, results: [[{ transcript: 'The insurer replied: We received the estimate. Authorization is still pending.' }]] }); this.onend?.(); }
      stop() { this.onend?.(); } abort() { this.onend?.(); }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: Recognition });
  });
  try {
    await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible(); await f.choose();
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
    await page.getByRole('button', { name: 'Start voice input', exact: true }).click();
    await expect(page.getByLabel('Message to Relay', { exact: true })).toHaveValue(/The insurer replied/);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Review incoming reply', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Reply text', exact: true })).toHaveValue('We received the estimate. Authorization is still pending.');
    expect((await f.brief()).events.length).toBe(3);
  } finally { await f.cleanup(); }
});
