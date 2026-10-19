import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const viewTab = (page: Page, name: string) => page.getByRole('tab', { name: name === 'Requests' ? /^Requests(?: \d+)?$/ : name, exact: true });

async function checkBrand(page: Page) {
  const brand = page.locator('.brand');
  await expect(brand.locator('.brand-name')).toHaveText('MobilityRelay');
  await expect(brand.locator('.brand-description')).toHaveText('Wheelchair repair coordination');
  await expect(brand.locator('.brand-description')).toBeVisible();
  await expect(brand.locator('.brand-mark')).toHaveAttribute('aria-hidden', 'true');
  const layout = await brand.evaluate(element => {
    const mark = element.querySelector<HTMLElement>('.brand-mark')!;
    const copy = element.querySelector<HTMLElement>('.brand-copy')!;
    const name = element.querySelector<HTMLElement>('.brand-name')!;
    const description = element.querySelector<HTMLElement>('.brand-description')!;
    const close = element.querySelector<HTMLButtonElement>('button');
    return {
      width: mark.getBoundingClientRect().width, height: mark.getBoundingClientRect().height,
      separated: mark.getBoundingClientRect().right <= copy.getBoundingClientRect().left,
      textFits: [name, description].every(text => text.scrollWidth <= text.clientWidth),
      closeFits: !close?.getClientRects().length || copy.getBoundingClientRect().right <= close.getBoundingClientRect().left,
      withinViewport: element.getBoundingClientRect().right <= window.innerWidth,
    };
  });
  expect(layout).toEqual({ width: 40, height: 40, separated: true, textFits: true, closeFits: true, withinViewport: true });
}

test('brand names the repair purpose and fits desktop and mobile navigation', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
    if (width <= 760) await page.getByRole('button', { name: 'Open case navigation', exact: true }).click();
    await checkBrand(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `.data/screenshots/${info.project.name}-brand-navigation-${width}.png`, fullPage: true });
    if (width <= 760) { await page.getByRole('button', { name: 'Close navigation', exact: true }).click(); await expect(page.locator('.sidebar')).not.toBeVisible(); }
  }
  expect(errors).toEqual([]);
});

test('brand stays consistent on the sign-in screen without overflow or accessibility violations', async ({ page }, info) => {
  await page.route('**/api/session', route => route.fulfill({ json: { authenticated: false } }));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace', exact: true })).toBeVisible();
    await checkBrand(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width === 390 || width === 1440) await page.screenshot({ path: `.data/screenshots/${info.project.name}-brand-sign-in-${width}.png`, fullPage: true });
  }
  const access = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(access.violations).toEqual([]);
});

test('next step appears once with readable controls and linked source details', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Was the paperwork received?', exact: true })).toHaveCount(1);
  const next = page.locator('.question-item.next-step');
  await expect(next.getByRole('button', { name: 'Prepare a request', exact: true })).toBeVisible();
  await expect(next.locator('p').first()).toHaveCSS('font-size', '16px');
  const target = await next.getByRole('button', { name: 'Record answer', exact: true }).boundingBox();
  expect(target!.height).toBeGreaterThanOrEqual(44);
  const source = next.locator('.source-links button').first();
  const label = (await source.innerText()).trim();
  await source.click();
  const evidence = page.locator('.evidence.highlighted');
  await expect(evidence.locator('.evidence-meta strong')).toHaveText(label);
  await expect(evidence.locator('.source-id').first()).not.toBeVisible();
  await evidence.getByText('Record details', { exact: true }).click();
  await expect(evidence.locator('.source-id').first()).toContainText('Record ID:');
  await expect(evidence.locator('.source-id').first()).toBeVisible();
});

test('waiting state reports elapsed time without inventing action progress', async ({ page }, info) => {
  await page.clock.install();
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const waiting = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/agent', async route => { started(); await gate; await route.continue(); }, { times: 1 });
  try {
    await page.getByLabel('Message to Relay').fill('What is the next step?');
    await page.getByRole('button', { name: 'Send message', exact: true }).click(); await waiting;
    await expect(page.getByText('Waiting for a response', { exact: true })).toBeVisible();
    const timer = page.getByRole('timer', { name: 'Request elapsed time' });
    await expect(timer).toHaveAttribute('aria-live', 'off');
    await page.clock.fastForward(5000);
    expect(parseInt((await timer.innerText()), 10)).toBeGreaterThanOrEqual(5);
    await expect(page.getByRole('dialog', { name: 'Review request' })).not.toBeVisible();
    release(); await expect(page.getByRole('button', { name: 'Case brief', exact: true })).toBeEnabled();
    await expect(timer).toHaveCount(0);
    await expect(page.getByRole('log')).toContainText('This is a user-maintained record');
  } finally { release(); }
});

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

test('Bedrock-labelled UI can submit local commands without cloud consent and retains a rejected model request', async ({ page }, info) => {
  await page.route('**/api/settings', async route => { const response = await route.fetch(); await route.fulfill({ json: { ...await response.json(), agentMode: 'bedrock' } }); });
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
  const consent = page.getByLabel('Share this case text with Amazon Bedrock'); await expect(consent).not.toBeChecked();
  const response = page.waitForResponse(result => result.url().endsWith('/api/agent') && result.request().method() === 'POST');
  await page.getByLabel('Message to Relay').fill('What is the next step?'); await page.getByRole('button', { name: 'Send message', exact: true }).click();
  const result = await response; expect(result.ok()).toBe(true); expect(result.request().postDataJSON().allowCloud).toBe(false);
  await expect(page.locator('.message-assistant').last()).toContainText('This is a user-maintained record');
  const packetResponse = page.waitForResponse(result => result.url().endsWith('/api/agent') && result.request().method() === 'POST'); const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Case packet', exact: true }).click();
  expect((await packetResponse).request().postDataJSON().allowCloud).toBe(false); expect((await download).suggestedFilename()).toBe('repair-history.html');
  await page.route('**/api/agent', route => route.fulfill({ status: 403, json: { error: 'Consent is required before sharing case text with Amazon Bedrock.' } }), { times: 1 });
  await page.getByLabel('Message to Relay').fill('Prepare a request to the supplier'); await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByLabel('Message to Relay')).toHaveValue('Prepare a request to the supplier');
  const alert = info.project.name === 'mobile' ? page.getByRole('dialog', { name: 'Relay conversation' }).getByRole('alert') : page.getByRole('alert');
  await expect(alert).toContainText('Consent is required'); await expect(consent).not.toBeChecked();
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
