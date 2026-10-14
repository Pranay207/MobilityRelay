import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const viewTab = (page: Page, name: string) => page.getByRole('tab', { name: name === 'Requests' ? /^Requests(?: \d+)?$/ : name, exact: true });

test('read-only assistant replies update conversation without a redundant case reload', async ({ page }, info) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
  const caseReads: string[] = [];
  page.on('request', request => { if (/\/api\/cases\/[a-f0-9-]{36}$/.test(new URL(request.url()).pathname)) caseReads.push(request.url()); });
  const response = page.waitForResponse(result => result.url().endsWith('/api/agent') && result.request().method() === 'POST');
  await page.getByRole('button', { name: 'Case brief', exact: true }).click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByRole('button', { name: 'Case brief', exact: true })).toBeEnabled();
  await expect(page.locator('.message-assistant').last()).toContainText('This is a user-maintained record');
  expect(caseReads).toEqual([]);
});

test('case views and review dialogs pass automated accessibility checks', async ({ page }, info) => {
  test.setTimeout(180000);
  const findings: { state: string; rule: string; targets: unknown[]; details: string[] }[] = [];
  const scan = async (state: string) => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    findings.push(...result.violations.map(item => ({ state, rule: item.id, targets: item.nodes.map(node => node.target), details: item.nodes.map(node => node.failureSummary ?? '') })));
  };
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  for (const view of ['Overview', 'Evidence', 'Requests', 'Follow-ups', 'Contacts']) {
    await viewTab(page, view).click(); await scan(view);
  }
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  for (const name of ['Record update', 'Prepare a request', 'Export history']) {
    await page.getByRole('button', { name, exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await scan(name);
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  }
  if (info.project.name === 'mobile') { await page.getByRole('button', { name: 'Open Relay', exact: true }).click(); await scan('Mobile conversation'); await page.getByRole('button', { name: 'Close dialog', exact: true }).click(); }
  await info.attach('accessibility-findings', { body: JSON.stringify(findings, null, 2), contentType: 'application/json' });
  await mkdir('.data/verification', { recursive: true });
  await writeFile(`.data/verification/accessibility-${info.project.name}.json`, JSON.stringify(findings, null, 2));
  expect(findings.length, JSON.stringify(findings.map(({ state, rule, targets }) => ({ state, rule, targets })))).toBe(0);
});

test('modal keyboard focus stays inside and returns to its trigger', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Record update', exact: true });
  await trigger.focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible();
  for (let index = 0; index < 18; index++) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({ inside: !!document.activeElement?.closest('dialog'), element: document.activeElement?.outerHTML.slice(0, 250) }));
    expect(focus.inside, `Tab ${index}: ${focus.element}`).toBe(true);
  }
  for (let index = 0; index < 18; index++) { await page.keyboard.press('Shift+Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true); }
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible(); await expect(trigger).toBeFocused();
});

test('failed assistant requests retain typed input and never narrate success', async ({ page }, info) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
  await page.route('**/api/agent', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Fictional QA: assistant unavailable.' }) }));
  await page.getByLabel('Message to Relay').fill('Prepare a request to the supplier'); await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByLabel('Message to Relay')).toHaveValue('Prepare a request to the supplier');
  const alert = info.project.name === 'mobile' ? page.getByRole('dialog', { name: 'Relay conversation' }).getByRole('alert') : page.getByRole('alert');
  await expect(alert).toContainText('Fictional QA: assistant unavailable.'); await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog', { name: 'Review request' })).not.toBeVisible();
});

test('long case fields and request review fit narrow and wide viewports', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  const session = await (await page.request.get('/api/session')).json(); const headers = { 'x-relay-csrf': session.csrf };
  const title = 'LongCaseName'.repeat(8);
  const response = await page.request.post('/api/cases', { headers, data: { title, person: 'FictionalLongName'.repeat(4), equipment: 'WheelchairDescription'.repeat(4), reference: 'Reference'.repeat(8), category: 'LongCategory'.repeat(6), fictional: true } });
  expect(response.ok()).toBe(true); const repair = await response.json();
  const checkWidth = async (target: Page) => {
    const layout = await target.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll<HTMLElement>('body *')].filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && getComputedStyle(el).position !== 'fixed').slice(0, 15).map(el => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right })) }));
    expect(layout.width).toBe(target.viewportSize()!.width);
    expect(layout.scroll <= layout.width, JSON.stringify(layout)).toBe(true);
  };
  try {
    const contactResponse = await page.request.post('/api/contacts', { headers, data: { caseId: repair.id, name: 'Fictional supplier', role: 'supplier', email: `${'x'.repeat(64)}@${'b'.repeat(50)}.example`, verified: false } }); expect(contactResponse.ok()).toBe(true); const contact = await contactResponse.json();
    const event = await page.request.post('/api/action', { headers, data: { tool: 'record_repair_event', args: { caseId: repair.id, requestId: crypto.randomUUID(), party: 'supplier', source: 'FictionalSource'.repeat(10), channel: 'Email', occurredAt: new Date(Date.now() - 60000).toISOString(), stage: 'parts_delayed', text: 'LongUnbrokenSourceText'.repeat(60) } } }); expect(event.ok()).toBe(true);
    const brief = (await (await page.request.get(`/api/cases/${repair.id}`)).json()).data;
    const prepared = await page.request.post('/api/action', { headers, data: { tool: 'prepare_repair_request', args: { caseId: repair.id, requestId: crypto.randomUUID(), recipientId: contact.id, questionIds: brief.questions.map((question: { id: string }) => question.id) } } }); expect(prepared.ok()).toBe(true);
    for (const width of [320, 390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 }); await page.reload(); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
      if (width <= 760) await page.getByRole('button', { name: 'Open case navigation', exact: true }).click();
      await page.getByRole('button', { name: new RegExp(title) }).click(); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      for (const view of ['Overview', 'Evidence', 'Requests', 'Follow-ups', 'Contacts']) { await viewTab(page, view).click(); await checkWidth(page); }
      await viewTab(page, 'Requests').click(); await page.locator('.request-row').first().click();
      await expect(page.getByRole('dialog', { name: 'Review request', exact: true })).toBeVisible(); await checkWidth(page);
      await expect(page.getByRole('button', { name: 'Approve & capture locally', exact: true })).toBeDisabled();
      if (width === 390 || width === 1440) {
        const access = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(access.violations.length, JSON.stringify(access.violations.map(item => ({ rule: item.id, targets: item.nodes.map(node => node.target) })))).toBe(0);
      }
      await page.screenshot({ path: `.data/screenshots/${info.project.name}-qa-width-${width}.png` });
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    }
  } finally { expect((await page.request.delete(`/api/cases/${repair.id}`, { headers, data: { confirm: title } })).ok()).toBe(true); }
});
