import { test, expect } from '@playwright/test';

for (const endpoint of ['session', 'settings', 'cases']) test(`startup ${endpoint} failure offers read-only recovery instead of an empty workspace`, async ({ page }, info) => {
  let attempts = 0; let writes = 0;
  page.on('request', request => { if (request.method() === 'POST') writes++; });
  await page.route(`**/api/${endpoint}`, route => ++attempts === 1
    ? route.fulfill({ status: 503, json: { error: `Fictional ${endpoint} startup failure.` } })
    : route.continue());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Workspace could not be loaded', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(`Fictional ${endpoint} startup failure.`);
  await expect(page.getByRole('button', { name: 'New repair case', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace', exact: true })).toHaveCount(0);
  const accessible = await page.getByRole('button', { name: 'Retry loading workspace', exact: true }).boundingBox();
  expect(accessible?.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `.data/screenshots/${info.project.name}-startup-${endpoint}-failure.png`, fullPage: true });
  await page.getByRole('button', { name: 'Retry loading workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  expect(attempts).toBe(2); expect(writes).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.data/screenshots/${info.project.name}-startup-${endpoint}-recovered.png`, fullPage: true });
});

test('one transient browser read failure recovers without replaying writes', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window); let failed = false;
    window.fetch = async (input, init) => {
      if (!failed && String(input) === '/api/cases' && (!init?.method || init.method === 'GET')) { failed = true; throw new TypeError('Fictional connection reset'); }
      return original(input, init);
    };
  });
  let writes = 0; page.on('request', request => { if (request.method() === 'POST') writes++; });
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0); expect(writes).toBe(0);
});

test('a post-login workspace read failure recovers without replaying login', async ({ page }) => {
  const session = await (await page.request.get('/api/session', { maxRetries: 1 })).json();
  let sessions = 0; let logins = 0; let settings = 0;
  await page.route('**/api/session', route => ++sessions === 1 ? route.fulfill({ json: { authenticated: false } }) : route.continue());
  await page.route('**/api/login', route => { logins++; return route.fulfill({ json: { csrf: session.csrf } }); });
  await page.route('**/api/settings', route => ++settings === 1 ? route.fulfill({ status: 503, json: { error: 'Fictional post-login settings failure.' } }) : route.continue());
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Sign in to your workspace', exact: true })).toBeVisible();
  await page.getByLabel('Workspace password', { exact: true }).fill('fictional-ui-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workspace could not be loaded', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry loading workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  expect(logins).toBe(1); expect(sessions).toBe(2); expect(settings).toBe(2);
});
