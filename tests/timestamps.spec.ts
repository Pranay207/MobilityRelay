import { test, expect } from '@playwright/test';
import type { AgentReply, Brief, RepairCase } from '../shared/types';

test('MCP offset timestamps agree across stage, evidence order, next follow-up and conversation after reload', async ({ page }, info) => {
  const session = await (await page.request.get('/api/session')).json(); const headers = { 'x-relay-csrf': session.csrf };
  const created = await page.request.post('/api/cases', { headers, data: { title: `Fictional offset QA ${info.project.name}`, person: 'Fictional tester', equipment: 'Chair', reference: 'OFFSET-BROWSER-QA', category: 'Time zones', fictional: true } });
  expect(created.ok()).toBe(true); const repair: RepairCase = await created.json();
  const brief = async (): Promise<Brief> => (await (await page.request.get(`/api/cases/${repair.id}`)).json()).data;
  const action = async (tool: string, args: unknown) => { const response = await page.request.post('/api/action', { headers, data: { tool, args } }); expect(response.ok()).toBe(true); return (await response.json()).data; };
  try {
    await action('record_repair_event', { caseId: repair.id, requestId: crypto.randomUUID(), party: 'insurer', source: 'Fictional earlier approval', channel: 'Email', text: 'Earlier approval report.', stage: 'authorization_approved', occurredAt: '2026-01-02T00:30:00+05:30' });
    const pending = await action('record_repair_event', { caseId: repair.id, requestId: crypto.randomUUID(), party: 'insurer', source: 'Fictional later pending report', channel: 'Email', text: 'The revised request remains pending.', stage: 'authorization_pending', occurredAt: '2026-01-01T23:30:00Z' });
    const early = new Date(Date.now() + 86400000); early.setUTCHours(22, 30, 0, 0);
    const earlierOffset = `${new Date(early.getTime() + 14 * 3600000).toISOString().slice(0, -1)}+14:00`;
    const later = new Date(early.getTime() + 3600000).toISOString();
    for (const [title, dueAt] of [['Earlier offset follow-up', earlierOffset], ['Later UTC follow-up', later]]) await action('manage_repair_followup', { caseId: repair.id, requestId: crypto.randomUUID(), action: 'create', title, dueAt, timezone: 'Asia/Kolkata' });
    await page.addInitScript(id => sessionStorage.setItem('mobilityrelay:selected-case', id), repair.id);
    await page.goto('/'); await expect(page.getByRole('heading', { name: repair.title, exact: true })).toBeVisible();
    await expect(page.locator('.case-metrics > div').first()).toContainText('Authorization pending');
    const expectedTime = await page.evaluate(value => new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }), earlierOffset);
    await expect(page.locator('.case-metrics > div').nth(3)).toContainText(expectedTime);
    await page.getByRole('tab', { name: 'Evidence', exact: true }).click();
    await expect(page.locator('.view-section .evidence').first()).toHaveAttribute('id', `event-${pending.id}`);
    await page.getByRole('tab', { name: 'Follow-ups', exact: true }).click();
    await expect(page.locator('.followup-row strong')).toHaveText(['Earlier offset follow-up', 'Later UTC follow-up']);
    await page.reload(); await expect(page.getByRole('heading', { name: repair.title, exact: true })).toBeVisible();
    await expect(page.locator('.case-metrics > div').nth(3)).toContainText(expectedTime);
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
    await page.getByRole('textbox', { name: 'Message to Relay', exact: true }).fill('Show my follow-ups');
    const response = page.waitForResponse(response => response.url().endsWith('/api/agent') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    const result = await (await response).json() as AgentReply;
    expect(result.reply).toContain('Next: Earlier offset follow-up'); expect(result.traces.map(trace => trace.tool)).toEqual(['get_repair_brief']);
    const state = await brief(); expect(state.followups).toHaveLength(2); expect(state.followups[0].dueAt).toBe(earlierOffset);
    expect(state.events[0].occurredAt).toBe('2026-01-02T00:30:00+05:30');
    await page.screenshot({ path: `.data/screenshots/${info.project.name}-offset-qa.png`, fullPage: true });
  } finally {
    const removed = await page.request.delete(`/api/cases/${repair.id}`, { headers, data: { confirm: repair.title } }); expect(removed.ok()).toBe(true);
  }
});
