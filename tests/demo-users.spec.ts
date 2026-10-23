import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { AgentReply, Brief, Contact, RepairCase, Stage } from '../shared/types';

const scenarios: { name: string; task: string; topic: string; role: 'supplier' | 'insurer'; kinds: string[]; events: { stage: Stage; party: 'supplier' | 'insurer' | 'user'; text: string }[] }[] = [
  { name: 'Maya', task: 'Clarify estimate receipt', topic: 'missing estimate reference', role: 'supplier', kinds: ['receipt'], events: [
    { stage: 'paperwork_sent', party: 'supplier', text: 'We sent the estimate.' },
    { stage: 'paperwork_requested', party: 'insurer', text: 'We cannot locate the estimate.' },
    { stage: 'authorization_pending', party: 'insurer', text: 'Authorization is pending.' },
  ] },
  { name: 'Alex', task: 'Request temporary equipment', topic: 'temporary equipment', role: 'supplier', kinds: ['loaner'], events: [
    { stage: 'parts_delayed', party: 'supplier', text: 'The part is delayed. No arrival date is confirmed.' },
    { stage: 'loaner_needed', party: 'user', text: 'I need suitable temporary equipment while waiting.' },
  ] },
  { name: 'Sam', task: 'Chase an unanswered request', topic: 'response', role: 'supplier', kinds: ['response'], events: [
    { stage: 'provider_silent', party: 'user', text: 'I followed up twice but have not received an answer.' },
  ] },
  { name: 'Jordan', task: 'Ask for a written refusal reason', topic: 'coverage refusal', role: 'insurer', kinds: ['coverage'], events: [
    { stage: 'coverage_refused', party: 'insurer', text: 'This repair request was not approved. No written reason has been provided.' },
  ] },
  { name: 'Ravi', task: 'Request a professional assessment', topic: 'assessment', role: 'supplier', kinds: ['assessment', 'technician'], events: [
    { stage: 'assessment_needed', party: 'user', text: 'I need a qualified professional to assess my chair.' },
    { stage: 'technician_unavailable', party: 'supplier', text: 'Our technician is unavailable. No alternative arrangement is confirmed.' },
  ] },
];

for (const scenario of scenarios) test(`fictional ${scenario.name}: ${scenario.task}`, async ({ page }, info) => {
  if (scenario.name === 'Maya') test.setTimeout(60000);
  const session = await (await page.request.get('/api/session')).json(); const headers = { 'x-relay-csrf': session.csrf };
  const title = `Fictional ${scenario.name} - ${scenario.task}`;
  const created = await page.request.post('/api/cases', { headers, data: { title, person: `Fictional ${scenario.name}`, equipment: ['Alex', 'Jordan'].includes(scenario.name) ? 'Manual wheelchair' : 'Power wheelchair', reference: `DEMO-USER-${scenario.name.toUpperCase()}`, category: scenario.task, fictional: true } });
  expect(created.ok()).toBe(true); const repair: RepairCase = await created.json();
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const directory = `.data/verification/demo-users-2026-10-22/${info.project.name}-${scenario.name.toLowerCase()}`;
  const brief = async (): Promise<Brief> => (await (await page.request.get(`/api/cases/${repair.id}`)).json()).data;
  const contacts: Contact[] = [];
  try {
    await mkdir(directory, { recursive: true });
    for (const role of ['supplier', 'insurer'] as const) {
      const added = await page.request.post('/api/contacts', { headers, data: { caseId: repair.id, name: `Fictional ${role}`, role, email: `${role}@example.invalid`, verified: false } });
      expect(added.ok()).toBe(true); contacts.push(await added.json());
    }
    for (const event of scenario.events) {
      const recorded = await page.request.post('/api/action', { headers, data: { tool: 'record_repair_event', args: { ...event, caseId: repair.id, requestId: crypto.randomUUID(), source: `Fictional ${event.party}`, channel: 'Email', occurredAt: new Date(Date.now() - 60000).toISOString() } } });
      expect(recorded.ok()).toBe(true);
    }
    const command = `Prepare a request to the ${scenario.role} about ${scenario.topic}`;
    await page.addInitScript(({ id, command }) => {
      sessionStorage.setItem('mobilityrelay:selected-case', id);
      class FictionalSpeech {
        lang = ''; continuous = false; interimResults = false;
        onresult: ((event: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null = null;
        onerror: ((event: { error: string }) => void) | null = null; onend: (() => void) | null = null;
        start() { setTimeout(() => { this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: command } }] }); this.onend?.(); }, 10); }
        stop() { this.onend?.(); } abort() { this.onend?.(); }
      }
      Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: FictionalSpeech });
    }, { id: repair.id, command });
    await page.goto('/'); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByText('FICTIONAL CASE', { exact: true })).toBeVisible();
    const started = performance.now();
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
    await page.getByRole('button', { name: 'Start voice input', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Message to Relay' })).toHaveValue(command);
    expect((await brief()).drafts).toHaveLength(0);
    const response = page.waitForResponse(response => response.url().endsWith('/api/agent') && response.request().method() === 'POST');
    const draftStarted = performance.now();
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    const agent = await (await response).json() as AgentReply; const draftMilliseconds = Math.round(performance.now() - draftStarted);
    expect(agent.draftId).toBeTruthy(); expect(agent.traces.map(t => t.tool)).toEqual(['get_repair_brief', 'prepare_repair_request']);
    expect(agent.traces.every(t => t.ok)).toBe(true);
    await expect(page.getByRole('dialog', { name: 'Review request', exact: true })).toBeVisible();
    const state = await brief(); const draft = state.drafts.find(d => d.id === agent.draftId)!;
    expect(draft.status).toBe('draft'); expect(draft.recipient).toBe(`${scenario.role}@example.invalid`);
    expect(state.questions.filter(q => draft.questionIds.includes(q.id)).map(q => q.kind).sort()).toEqual([...scenario.kinds].sort());
    for (const id of draft.sourceIds) expect(draft.body).toContain(state.events.find(e => e.id === id)!.text);
    await expect(page.getByRole('checkbox', { name: 'I approve this recipient and exact message.', exact: true })).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Approve & capture locally', exact: true })).toBeDisabled();
    await page.screenshot({ path: `${directory}/review.png`, fullPage: true });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    if (scenario.name === 'Maya') {
      await page.getByRole('button', { name: 'Review reply', exact: true }).click();
      await page.getByRole('combobox', { name: 'Reply from', exact: true }).selectOption('insurer');
      await page.getByRole('textbox', { name: 'Source name', exact: true }).fill('Fictional insurer');
      await page.getByRole('textbox', { name: 'Reply text', exact: true }).fill('We received the estimate. Reference DEMO-47. Authorization is still pending.');
      await page.getByRole('button', { name: 'Preview changes', exact: true }).click();
      const receipt = page.getByRole('checkbox', { name: 'Was the paperwork received?', exact: true });
      await expect(receipt).not.toBeChecked(); await expect(page.locator('.reply-answer blockquote')).toHaveText('We received the estimate.');
      await receipt.check(); await page.getByRole('checkbox', { name: 'I reviewed the source and selected answers.', exact: true }).check();
      await page.getByRole('button', { name: 'Record reviewed reply', exact: true }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
      expect((await brief()).questions.find(q => q.kind === 'receipt')?.resolved).toBe(true);
      expect((await brief()).questions.find(q => q.kind === 'approval')?.resolved).toBe(false);
      await page.getByRole('tab', { name: /^Requests/ }).click();
      await page.getByRole('button', { name: new RegExp(`Repair ${repair.reference}: clarification requested`) }).click();
      await expect(page.getByRole('checkbox', { name: 'I approve this recipient and exact message.', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: 'Prepare fresh draft', exact: true }).click();
      await page.getByRole('combobox', { name: 'Recipient', exact: true }).selectOption(contacts.find(c => c.role === 'insurer')!.id);
      await expect(page.getByRole('checkbox', { name: 'Was the paperwork received?', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Prepare draft', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(/What remains under review/);
      await page.getByRole('checkbox', { name: 'I approve this recipient and exact message.', exact: true }).check();
      await page.getByRole('button', { name: 'Approve & capture locally', exact: true }).click();
      await expect(page.getByRole('dialog').getByText('Local capture', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await page.getByRole('tab', { name: 'Follow-ups', exact: true }).click();
      await page.getByRole('button', { name: 'Schedule', exact: true }).click();
      await page.getByRole('textbox', { name: 'Follow-up title', exact: true }).fill('Check authorization - fictional case');
      await page.getByRole('button', { name: 'Schedule follow-up', exact: true }).click();
      await expect(page.getByText('Check authorization - fictional case', { exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Export history', exact: true }).click();
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download history', exact: true }).click();
    const file = await download; await file.saveAs(`${directory}/repair-history.html`);
    const html = await readFile(`${directory}/repair-history.html`, 'utf8');
    expect(html).toContain('FICTIONAL DEMONSTRATION CASE'); expect(html).toContain('Identity redaction enabled');
    expect(html).not.toContain(repair.person); expect(html).not.toContain(`${scenario.role}@example.invalid`);
    const final = await brief(); expect(final.events.some(e => e.stage === 'repair_completed')).toBe(false);
    expect(final.drafts.every(d => d.status === 'draft' || d.status === 'captured')).toBe(true);
    if (scenario.name === 'Maya') { expect(html).toContain('Stale draft'); expect(final.drafts.filter(d => d.status === 'captured')).toHaveLength(1); }
    else { expect(final.drafts.filter(d => d.status === 'captured')).toHaveLength(0); expect(final.questions.every(q => !q.resolved)).toBe(true); }
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await page.screenshot({ path: `${directory}/result.png`, fullPage: true }); expect(errors).toEqual([]);
    await writeFile(`${directory}/result.json`, JSON.stringify({ type: 'Agent-authored scripted fictional persona; not independent user feedback', persona: scenario.name, task: scenario.task, project: info.project.name, speech: 'Controlled English transcript, not physical recognition', draftMilliseconds, scriptedTaskMilliseconds: Math.round(performance.now() - started), realMcpTraces: agent.traces, answered: final.questions.filter(q => q.resolved).map(q => q.kind), stillOpen: final.questions.filter(q => !q.resolved).map(q => q.kind), captured: final.drafts.filter(d => d.status === 'captured').length, emailsDelivered: 0, repairCompleted: false }, null, 2));
  } finally {
    const removed = await page.request.delete(`/api/cases/${repair.id}`, { headers, data: { confirm: repair.title } }); expect(removed.ok()).toBe(true);
  }
});
