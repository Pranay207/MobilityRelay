import { test, expect } from '@playwright/test';
import type { AgentReply, Brief, RepairCase } from '../shared/types';

test('natural conversation survives reload, prepares only the referenced draft and rejects stale context', async ({ page }, info) => {
  const session = await (await page.request.get('/api/session', { maxRetries: 1 })).json(); const headers = { 'x-relay-csrf': session.csrf };
  const created = await page.request.post('/api/cases', { headers, data: { title: `Fictional conversation ${info.project.name}`, person: 'Fictional tester', equipment: 'Power wheelchair', reference: 'CONVERSATION-TEST', category: 'Paperwork', fictional: true } });
  expect(created.ok()).toBe(true); const repair: RepairCase = await created.json();
  const brief = async (): Promise<Brief> => (await (await page.request.get(`/api/cases/${repair.id}`, { maxRetries: 1 })).json()).data;
  const openRelay = async () => { if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click(); };
  const send = async (text: string): Promise<AgentReply> => {
    await page.getByRole('textbox', { name: 'Message to Relay', exact: true }).fill(text);
    const response = page.waitForResponse(response => response.url().endsWith('/api/agent') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    const result = await response; expect(result.ok()).toBe(true); return result.json();
  };
  try {
    for (const role of ['supplier', 'insurer']) {
      const added = await page.request.post('/api/contacts', { headers, data: { caseId: repair.id, name: `Fictional ${role}`, role, email: `${role}@example.invalid`, verified: false } }); expect(added.ok()).toBe(true);
    }
    for (const event of [
      { party: 'supplier', stage: 'paperwork_sent', text: 'We submitted the estimate.' },
      { party: 'insurer', stage: 'paperwork_requested', text: 'We cannot locate that submission.' },
      { party: 'insurer', stage: 'authorization_pending', text: 'Authorization remains under review.' },
    ]) {
      const recorded = await page.request.post('/api/action', { headers, data: { tool: 'record_repair_event', args: { ...event, caseId: repair.id, requestId: crypto.randomUUID(), source: `Fictional ${event.party}`, channel: 'Email', occurredAt: new Date(Date.now() - 60000).toISOString() } } }); expect(recorded.ok()).toBe(true);
    }
    await page.addInitScript(id => sessionStorage.setItem('mobilityrelay:selected-case', id), repair.id);
    await page.goto('/'); await expect(page.getByRole('heading', { name: repair.title, exact: true })).toBeVisible(); await openRelay();
    const before = await brief();
    const comparison = await send('Compare the reports.'); expect(comparison.focus?.view).toBe('comparison');
    await expect(page.getByRole('log').locator('.message-assistant').last()).toContainText('Latest insurer report');
    expect(await brief()).toEqual(before);
    await page.reload(); await expect(page.getByRole('heading', { name: repair.title, exact: true })).toBeVisible(); await openRelay();
    await expect(page.getByRole('log').locator('.message-user').last()).toContainText('Compare the reports.');
    const prepared = await send('Ask the supplier for that reference.'); expect(prepared.draftId).toBeTruthy();
    expect(prepared.traces.map(trace => trace.tool)).toEqual(['get_repair_brief', 'prepare_repair_request']);
    const review = page.getByRole('dialog', { name: 'Review request', exact: true }); await expect(review).toBeVisible();
    await expect(review.getByRole('button', { name: 'Approve & capture locally', exact: true })).toBeDisabled();
    const state = await brief(); const draft = state.drafts.find(item => item.id === prepared.draftId)!;
    expect(draft.recipient).toBe('supplier@example.invalid'); expect(draft.questionIds).toEqual([comparison.focus?.questionId]);
    expect(draft.status).toBe('draft'); expect(state.events).toEqual(before.events);
    await page.screenshot({ path: `.data/screenshots/${info.project.name}-contextual-request-review.png`, fullPage: true });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click(); await openRelay();
    const question = await send('What is blocking authorization?');
    await expect(page.getByRole('log').locator('.message-assistant').last()).toContainText('Pending does not identify the responsible party');
    expect(question.focus?.view).toBe('question');
    const changed = await page.request.post('/api/action', { headers, data: { tool: 'record_repair_event', args: { caseId: repair.id, requestId: crypto.randomUUID(), party: 'insurer', source: 'Fictional later update', channel: 'Email', stage: 'other', text: 'A later update changes the case version.', occurredAt: new Date().toISOString() } } }); expect(changed.ok()).toBe(true);
    const stale = await send('Draft a request to the insurer about that question.');
    expect(stale.action).toBe('prepare'); expect(stale.draftId).toBeUndefined(); expect(stale.reply).toContain('context is missing, changed');
    expect((await brief()).drafts).toHaveLength(1); expect((await brief()).drafts[0].status).toBe('draft');
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click(); await openRelay();
    const download = page.waitForEvent('download'); const packet = await send('Export my case history'); await download;
    expect(packet.packet?.content).toContain('Identity redaction enabled'); expect(packet.packet?.content).not.toContain(repair.person);
    expect(packet.traces.map(trace => trace.tool)).toEqual(['get_repair_brief', 'export_repair_packet']);
    await page.screenshot({ path: `.data/screenshots/${info.project.name}-natural-conversation.png`, fullPage: true });
  } finally {
    const removed = await page.request.delete(`/api/cases/${repair.id}`, { headers, data: { confirm: repair.title } }); expect(removed.ok()).toBe(true);
  }
});
