import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { RepairCase } from '../shared/types';

const selectionKey = 'mobilityrelay:selected-case';
const heading = (page: Page, title: string) => page.getByRole('heading', { name: title, exact: true });
async function choose(page: Page, title: string) {
  const navigation = page.getByRole('button', { name: 'Open case navigation', exact: true });
  if (await navigation.isVisible()) await navigation.click();
  await page.getByRole('navigation', { name: 'Repair cases' }).getByRole('button', { name: new RegExp(title) }).click();
  await expect(heading(page, title)).toBeVisible();
}
async function session(page: Page) {
  const data = await (await page.request.get('/api/session', { maxRetries: 1 })).json();
  return { 'x-relay-csrf': data.csrf };
}

test('reload restores the selected case without loading the default case first', async ({ page }) => {
  await page.goto('/'); await expect(heading(page, 'Power chair repair')).toBeVisible();
  await choose(page, 'Replacement caster delay');
  const cases: RepairCase[] = await (await page.request.get('/api/cases', { maxRetries: 1 })).json();
  const selected = cases.find(c => c.reference === 'DEMO-2081')!;
  await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), selectionKey)).toBe(selected.id);
  const caseReads: string[] = [];
  page.on('request', request => { const path = new URL(request.url()).pathname; if (/^\/api\/cases\/[^/]+$/.test(path)) caseReads.push(path); });
  await page.reload(); await expect(heading(page, selected.title)).toBeVisible();
  expect(caseReads.length).toBeGreaterThan(0);
  expect(caseReads.every(path => path === `/api/cases/${selected.id}`)).toBe(true);
  const otherTab = await page.context().newPage();
  try { await otherTab.goto('/'); await expect(heading(otherTab, 'Power chair repair')).toBeVisible(); await expect(heading(page, selected.title)).toBeVisible(); }
  finally { await otherTab.close(); }
});

test('an unknown saved case falls back safely and an empty workspace clears the preference', async ({ page }) => {
  await page.addInitScript(key => sessionStorage.setItem(key, 'unavailable-case-id'), selectionKey);
  const reads: string[] = [];
  page.on('request', request => reads.push(new URL(request.url()).pathname));
  await page.goto('/'); await expect(heading(page, 'Power chair repair')).toBeVisible();
  expect(reads.some(path => path.includes('/unavailable-case-id'))).toBe(false);
  await page.route('**/api/cases', route => route.fulfill({ json: [] }));
  await page.reload(); await expect(heading(page, 'Your repair workspace')).toBeVisible();
  expect(await page.evaluate(key => sessionStorage.getItem(key), selectionKey)).toBeNull();
});

test('a deleted selected case falls back without requesting its missing details', async ({ page }, info) => {
  const headers = await session(page);
  const result = await page.request.post('/api/cases', { headers, data: { title: `Deleted selection ${info.project.name} ${Date.now()}`, person: 'Fictional tester', equipment: 'Chair', reference: '', category: 'Other', fictional: true } });
  expect(result.ok()).toBe(true); const repair: RepairCase = await result.json();
  try {
    await page.goto('/'); await expect(heading(page, 'Power chair repair')).toBeVisible(); await choose(page, repair.title);
    await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), selectionKey)).toBe(repair.id);
    expect((await page.request.delete(`/api/cases/${repair.id}`, { headers, data: { confirm: repair.title } })).ok()).toBe(true);
    const reads: string[] = []; page.on('request', request => reads.push(new URL(request.url()).pathname));
    await page.reload(); await expect(heading(page, 'Power chair repair')).toBeVisible();
    expect(reads.includes(`/api/cases/${repair.id}`)).toBe(false);
    expect(await page.evaluate(key => sessionStorage.getItem(key), selectionKey)).not.toBe(repair.id);
  } finally {
    const cases: RepairCase[] = await (await page.request.get('/api/cases', { maxRetries: 1 })).json();
    if (cases.some(c => c.id === repair.id)) await page.request.delete(`/api/cases/${repair.id}`, { headers, data: { confirm: repair.title } });
  }
});

test('case navigation remains usable when tab storage is unavailable', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('Storage blocked', 'SecurityError'); } }); });
  await page.goto('/'); await expect(heading(page, 'Power chair repair')).toBeVisible();
  await choose(page, 'Replacement caster delay');
  await page.reload(); await expect(heading(page, 'Power chair repair')).toBeVisible();
  expect(errors).toEqual([]);
});

test('sign out clears the saved case preference', async ({ page }) => {
  await page.route('**/api/settings', async route => { const response = await route.fetch(); await route.fulfill({ response, json: { ...await response.json(), protected: true } }); });
  await page.goto('/'); await expect(heading(page, 'Power chair repair')).toBeVisible();
  await choose(page, 'Replacement caster delay');
  await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), selectionKey)).not.toBeNull();
  await page.locator('.topbar').getByRole('button', { name: 'Workspace settings', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(heading(page, 'Sign in to your workspace')).toBeVisible();
  expect(await page.evaluate(key => sessionStorage.getItem(key), selectionKey)).toBeNull();
});

test('a new case exposes first update and contact setup before a reviewed draft', async ({ page }, info) => {
  test.setTimeout(90000);
  const title = `Onboarding ${info.project.name} ${Date.now()}`;
  const headers = await session(page);
  try {
    await page.goto('/'); await expect(heading(page, 'Power chair repair')).toBeVisible();
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open case navigation', exact: true }).click();
    await page.getByRole('button', { name: 'New repair case', exact: true }).click();
    await page.getByLabel('Case title', { exact: true }).fill(title);
    await page.getByLabel("Person's preferred name", { exact: true }).fill('Fictional first-time tester');
    await page.getByLabel('Equipment', { exact: true }).fill('Manual wheelchair');
    await page.getByRole('dialog').getByRole('button', { name: 'Create case', exact: true }).click();
    await expect(heading(page, title)).toBeVisible();
    await expect(heading(page, 'No repair updates yet')).toBeVisible();
    await expect(page.getByText('No open questions recorded', { exact: true })).toHaveCount(0);
    const first = page.getByRole('button', { name: 'Record first update', exact: true });
    await expect(first).toBeVisible();
    expect((await first.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `.data/screenshots/${info.project.name}-onboarding-empty.png`, fullPage: true });
    await page.getByRole('tab', { name: 'Evidence', exact: true }).click(); await expect(first).toBeVisible();
    await page.getByRole('tab', { name: 'Overview', exact: true }).click(); await first.click();
    const record = page.getByRole('dialog', { name: 'Record an update', exact: true });
    await record.getByLabel('Source name', { exact: true }).fill('Fictional supplier email');
    await record.getByLabel('What was said?', { exact: true }).fill('The replacement part is delayed. No arrival date is confirmed.');
    await record.getByRole('combobox', { name: 'Reported situation', exact: true }).selectOption('parts_delayed');
    await expect(record.getByRole('button', { name: 'Record update', exact: true })).toBeDisabled();
    await record.getByLabel('I reviewed the source, date, and reported situation.', { exact: true }).check();
    await record.getByRole('button', { name: 'Record update', exact: true }).click(); await expect(record).not.toBeVisible();
    const prompt = page.locator('.contact-prerequisite');
    await expect(prompt).toContainText('Recipient contact needed');
    await expect(page.getByRole('button', { name: 'Prepare a request', exact: true })).toBeDisabled();
    await page.getByRole('tab', { name: /^Requests/ }).click(); await expect(prompt).toBeVisible();
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: `.data/screenshots/${info.project.name}-contact-prerequisite-${width}.png`, fullPage: true });
    }
    await page.setViewportSize(info.project.use.viewport!);
    await prompt.getByRole('button', { name: 'Add contact', exact: true }).click();
    await page.getByLabel('Contact name', { exact: true }).fill('Fictional supplier');
    await page.getByLabel('Email address', { exact: true }).fill('supplier@example.invalid');
    await expect(page.getByLabel('I verified this recipient address.', { exact: true })).not.toBeChecked();
    await page.getByRole('button', { name: 'Save contact', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    await page.getByRole('button', { name: 'Prepare a request', exact: true }).click();
    await page.getByRole('button', { name: 'Prepare draft', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Review request', exact: true });
    await expect(review).toContainText('supplier@example.invalid');
    await expect(review.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(/The replacement part is delayed/);
    await expect(review.getByLabel('I approve this recipient and exact message.', { exact: true })).not.toBeChecked();
    await expect(review.getByRole('button', { name: 'Approve & capture locally', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.reload(); await expect(heading(page, title)).toBeVisible();
    const cases: RepairCase[] = await (await page.request.get('/api/cases', { maxRetries: 1 })).json();
    const repair = cases.find(c => c.title === title)!;
    const brief = (await (await page.request.get(`/api/cases/${repair.id}`, { maxRetries: 1 })).json()).data;
    expect(brief.events).toHaveLength(1); expect(brief.contacts).toHaveLength(1);
    expect(brief.drafts).toHaveLength(1); expect(brief.drafts[0].status).toBe('draft');
  } finally {
    const cases: RepairCase[] = await (await page.request.get('/api/cases', { maxRetries: 1 })).json();
    const repair = cases.find(c => c.title === title && c.fictional);
    if (repair) expect((await page.request.delete(`/api/cases/${repair.id}`, { headers, data: { confirm: title } })).ok()).toBe(true);
  }
});
