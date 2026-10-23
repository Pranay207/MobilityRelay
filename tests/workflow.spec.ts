import { test, expect, type Page } from '@playwright/test';

async function mockSpeech(page: Page, result: { transcript?: string; error?: string }) {
  await page.addInitScript(value => {
    class TestRecognition {
      lang = ''; continuous = false; interimResults = false;
      onresult: ((event: { resultIndex: number; results: { transcript: string }[][] }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() { setTimeout(() => { if (value.error) this.onerror?.({ error: value.error }); else this.onresult?.({ resultIndex: 0, results: [[{ transcript: value.transcript ?? '' }]] }); this.onend?.(); }, 20); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: TestRecognition });
  }, result);
}

async function mockVoiceLifecycle(page: Page) {
  await page.addInitScript(() => {
    const state = { sessions: [] as { result: ((event: { resultIndex: number; results: { transcript: string }[][] }) => void) | null; end: (() => void) | null }[], languages: [] as string[], recordingModes: [] as { continuous: boolean; interimResults: boolean }[], aborted: 0, spoken: [] as string[], spokenLanguages: [] as string[], speaking: false };
    class TestRecognition {
      lang = ''; continuous = false; interimResults = false;
      onresult: ((event: { resultIndex: number; results: { transcript: string }[][] }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() { state.languages.push(this.lang); state.recordingModes.push({ continuous: this.continuous, interimResults: this.interimResults }); state.sessions.push({ result: this.onresult, end: this.onend }); }
      stop() { this.onend?.(); }
      abort() { state.aborted++; this.onend?.(); }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: TestRecognition });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      cancel() { state.speaking = false; },
      speak(utterance: SpeechSynthesisUtterance) { state.spoken.push(utterance.text); state.spokenLanguages.push(utterance.lang); state.speaking = true; },
    } });
    Object.assign(window, { voiceLifecycle: state });
  });
}

test('live dictation replaces interim words, preserves segments and never sends itself', async ({ page }, info) => {
  await mockVoiceLifecycle(page);
  let submitted = 0; page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/agent') submitted++; });
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
  const text = page.getByRole('textbox', { name: 'Message to Relay' });
  await text.fill('Record:'); await page.getByRole('button', { name: 'Start voice input', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { voiceLifecycle: { recordingModes: unknown[] } }).voiceLifecycle.recordingModes)).toEqual([{ continuous: true, interimResults: true }]);
  const emit = (segments: string[], resultIndex = 0, session = 0) => page.evaluate(({ segments, resultIndex, session }) => {
    const state = (window as unknown as { voiceLifecycle: { sessions: { result: (event: { resultIndex: number; results: { transcript: string }[][] }) => void }[] } }).voiceLifecycle;
    state.sessions[session].result({ resultIndex, results: segments.map(transcript => [{ transcript }]) });
  }, { segments, resultIndex, session });
  await emit(['the supplier sent']); await expect(text).toHaveValue('Record: the supplier sent');
  await emit(['the supplier said']); await expect(text).toHaveValue('Record: the supplier said');
  await emit(['the supplier said', 'the paperwork was sent'], 1);
  await expect(text).toHaveValue('Record: the supplier said the paperwork was sent');
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start voice input', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start voice input', exact: true }).click();
  await emit(['yesterday'], 0, 1); await expect(text).toHaveValue('Record: the supplier said the paperwork was sent yesterday');
  await text.fill('Manual correction');
  await expect(page.getByRole('button', { name: 'Start voice input', exact: true })).toBeVisible();
  await emit(['late unwanted words'], 0, 1); await expect(text).toHaveValue('Manual correction');
  await page.getByRole('button', { name: 'Start voice input', exact: true }).click();
  await emit(['x'.repeat(4100)], 0, 2);
  expect((await text.inputValue()).length).toBe(4000);
  await expect(page.getByRole('alert').filter({ hasText: '4000-character limit' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start voice input', exact: true })).toBeVisible();
  expect(submitted).toBe(0);
});

test('specific report questions show dated sources and unsupported questions stay honest', async ({ page }, info) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message to Relay' }).fill('Compare the supplier and insurer reports');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  const answer = page.getByRole('log').locator('.message-assistant').last();
  await expect(answer).toContainText('Latest supplier report, Source'); await expect(answer).toContainText('Latest insurer report, Source');
  await expect(answer).toContainText('not independently verified'); await expect(answer).toContainText('do not establish who is at fault');
  await page.getByRole('textbox', { name: 'Message to Relay' }).fill('Will my insurer approve coverage?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('log').locator('.message-assistant').last()).toContainText('cannot answer that specific question');
  await page.screenshot({ path: `.data/screenshots/${info.project.name}-grounded-conversation.png`, fullPage: true });
});

test('report playback uses short attributed situations while written quotations and MCP history remain', async ({ page }, info) => {
  await mockVoiceLifecycle(page);
  const session = await (await page.request.get('/api/session')).json(); const headers = { 'x-relay-csrf': session.csrf };
  const created = await page.request.post('/api/cases', { headers, data: { title: `Fictional playback ${info.project.name}`, person: 'Fictional Speaker', equipment: 'Power chair', reference: 'VOICE-TEST', category: 'Paperwork', fictional: true } });
  expect(created.ok()).toBe(true); const repair = await created.json();
  try {
    for (const event of [
      { party: 'supplier', stage: 'authorization_pending', text: 'The repair is waiting for authorization. We do not have a receipt reference to share yet.' },
      { party: 'insurer', stage: 'paperwork_requested', text: 'We cannot locate the repair estimate. Please provide the submission reference and recipient.' },
    ]) {
      const recorded = await page.request.post('/api/action', { headers, data: { tool: 'record_repair_event', args: { ...event, caseId: repair.id, requestId: crypto.randomUUID(), source: `Fictional ${event.party}`, channel: 'Email', occurredAt: new Date(Date.now() - 60000).toISOString() } } });
      expect(recorded.ok()).toBe(true);
    }
    await page.addInitScript(id => sessionStorage.setItem('mobilityrelay:selected-case', id), repair.id);
    await page.goto('/'); await expect(page.getByRole('heading', { name: repair.title, exact: true })).toBeVisible();
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
    await page.getByRole('button', { name: 'Enable spoken responses', exact: true }).click();
    await page.getByRole('textbox', { name: 'Message to Relay' }).fill('Compare the supplier and insurer reports');
    const response = page.waitForResponse(response => response.url().endsWith('/api/agent') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    const result = await (await response).json();
    const answer = page.getByRole('log').locator('.message-assistant').last();
    await expect(answer.locator('p')).toHaveText(result.reply);
    await expect(answer).toContainText('Latest supplier report, Source 1'); await expect(answer).toContainText('Latest insurer report, Source 2');
    await expect(answer.locator('.tool-trace')).toContainText('1 MCP call');
    await expect.poll(() => page.evaluate(() => (window as unknown as { voiceLifecycle: { spoken: string[] } }).voiceLifecycle.spoken.length)).toBe(1);
    expect(await page.evaluate(() => (window as unknown as { voiceLifecycle: { spoken: string[] } }).voiceLifecycle.spoken[0])).toBe(result.spokenText);
    expect(result.spokenText.length).toBeLessThan(result.reply.length);
    for (const text of ['Source 1', 'Source 2', 'Reported situation: Authorization pending', 'Reported situation: Paperwork requested', 'not independently verified']) expect(result.spokenText).toContain(text);
    expect(result.spokenText).not.toContain('We do not have a receipt reference');
    await page.reload(); await expect(page.getByRole('heading', { name: repair.title, exact: true })).toBeVisible();
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
    await expect(page.getByRole('log').locator('.message-assistant').last().locator('p')).toHaveText(result.reply);
    expect(await page.evaluate(() => (window as unknown as { voiceLifecycle: { spoken: string[] } }).voiceLifecycle.spoken)).toEqual([]);
  } finally {
    const removed = await page.request.delete(`/api/cases/${repair.id}`, { headers, data: { confirm: repair.title } }); expect(removed.ok()).toBe(true);
  }
});

test('speech service errors preserve typed text and never submit or write evidence', async ({ page }, info) => {
  await mockSpeech(page, { error: 'network' });
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
  const text = page.getByRole('textbox', { name: 'Message to Relay' });
  const messageCount = await page.getByRole('log').locator('.message').count();
  await text.fill('My unfinished repair question');
  await page.getByRole('button', { name: 'Start voice input', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'The speech service could not connect.' }).first()).toBeVisible();
  await expect(text).toHaveValue('My unfinished repair question');
  await expect(page.getByRole('button', { name: 'Start voice input', exact: true })).toBeEnabled();
  await expect(page.getByRole('log').locator('.message')).toHaveCount(messageCount);
});

test('an empty speech session ends with recoverable feedback instead of silently losing typed text', async ({ page }, info) => {
  await mockSpeech(page, {}); let writes = 0;
  page.on('request', request => { if (request.method() === 'POST') writes++; });
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message to Relay' }).fill('Keep this unfinished question');
  await page.getByRole('button', { name: 'Start voice input', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Recording ended without a transcript' }).first()).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message to Relay' })).toHaveValue('Keep this unfinished question');
  await expect(page.getByRole('button', { name: 'Start voice input', exact: true })).toBeEnabled(); expect(writes).toBe(0);
});

test('failed spoken output leaves a readable reply and ignores old playback errors', async ({ page }, info) => {
  await page.addInitScript(() => {
    const utterances: SpeechSynthesisUtterance[] = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      cancel() {}, speak(utterance: SpeechSynthesisUtterance) { utterances.push(utterance); },
    } });
    Object.assign(window, { testUtterances: utterances });
  });
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
  await page.getByRole('button', { name: 'Enable spoken responses', exact: true }).click();
  await page.getByRole('button', { name: 'Case brief', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { testUtterances: unknown[] }).testUtterances.length)).toBe(1);
  await page.evaluate(() => {
    const utterance = (window as unknown as { testUtterances: SpeechSynthesisUtterance[] }).testUtterances[0];
    utterance.onerror?.({ error: 'audio-busy' } as SpeechSynthesisErrorEvent);
  });
  await expect(page.getByRole('alert').filter({ hasText: 'Spoken response could not play.' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable spoken responses', exact: true })).toBeVisible();
  await expect(page.getByRole('log').locator('.message-assistant').last()).toContainText('user-maintained record');
  await page.getByRole('button', { name: 'Enable spoken responses', exact: true }).click();
  await page.getByRole('button', { name: 'Case brief', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { testUtterances: unknown[] }).testUtterances.length)).toBe(2);
  await page.evaluate(() => {
    const utterance = (window as unknown as { testUtterances: SpeechSynthesisUtterance[] }).testUtterances[0];
    utterance.onerror?.({ error: 'network' } as SpeechSynthesisErrorEvent);
  });
  await expect(page.getByRole('button', { name: 'Mute spoken responses', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('speech startup failures are contained and missing output is disabled', async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class { constructor() { throw new Error('Fictional microphone constructor failed'); } } });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: undefined });
  });
  const pageErrors: string[] = []; page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Spoken responses unavailable', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Start voice input', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'The microphone could not start.' }).first()).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message to Relay' })).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test('slow initial history cannot be mistaken for a new spoken reply', async ({ page }, info) => {
  await mockVoiceLifecycle(page);
  let release!: () => void; let initial = true;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/cases/*/chat', async route => {
    if (!initial) { await route.continue(); return; }
    initial = false;
    const caseId = new URL(route.request().url()).pathname.split('/')[3];
    await gate;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ id: 'fictional-historical-reply', caseId, role: 'assistant', text: 'Historical reply must stay silent.', createdAt: '2026-01-01T10:00:00Z', traces: [] }]) });
  });
  try {
    await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Loading conversation...' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enable spoken responses', exact: true })).toHaveCount(0);
    release();
    await expect(page.getByRole('log')).toContainText('Historical reply must stay silent.');
    await page.getByRole('button', { name: 'Enable spoken responses', exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { voiceLifecycle: { spoken: string[] } }).voiceLifecycle.spoken)).toEqual([]);
    await page.getByRole('button', { name: 'Case brief', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { voiceLifecycle: { spoken: string[] } }).voiceLifecycle.spoken.length)).toBe(1);
    expect(await page.evaluate(() => (window as unknown as { voiceLifecycle: { spoken: string[] } }).voiceLifecycle.spoken[0])).not.toContain('Historical reply must stay silent.');
  } finally { release(); }
});

test('voice callbacks from an interrupted request cannot change a new recording', async ({ page }, info) => {
  await mockVoiceLifecycle(page);
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay' }).click();
  await page.getByRole('button', { name: 'Start voice input', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { voiceLifecycle: { languages: string[] } }).voiceLifecycle.languages)).toEqual(['en-IN']);
  await page.getByRole('button', { name: 'Case brief', exact: true }).click();
  await expect(page.getByRole('log').getByText(/This is a user-maintained record/).last()).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { voiceLifecycle: { aborted: number } }).voiceLifecycle.aborted)).toBe(1);
  await page.getByRole('button', { name: 'Start voice input', exact: true }).click();
  await page.evaluate(() => {
    const state = (window as unknown as { voiceLifecycle: { sessions: { result: (event: { resultIndex: number; results: { transcript: string }[][] }) => void; end: () => void }[] } }).voiceLifecycle;
    state.sessions[0].result({ resultIndex: 0, results: [[{ transcript: 'Late text from the previous recording' }]] }); state.sessions[0].end();
  });
  await expect(page.getByLabel('Message to Relay')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const state = (window as unknown as { voiceLifecycle: { sessions: { result: (event: { resultIndex: number; results: { transcript: string }[][] }) => void; end: () => void }[] } }).voiceLifecycle;
    state.sessions[1].result({ resultIndex: 0, results: [[{ transcript: 'Current recording' }]] }); state.sessions[1].end();
  });
  await expect(page.getByLabel('Message to Relay')).toHaveValue('Current recording');
  await expect(page.getByRole('button', { name: 'Start voice input', exact: true })).toBeVisible();
});

test('spoken replies are opt-in for new responses and stop at review boundaries', async ({ page }, info) => {
  await mockVoiceLifecycle(page);
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay' }).click();
  await page.getByRole('button', { name: 'Case brief', exact: true }).click();
  await expect(page.getByRole('log').getByText(/This is a user-maintained record/).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Case brief', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Enable spoken responses', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { voiceLifecycle: { spoken: string[] } }).voiceLifecycle.spoken)).toEqual([]);
  await page.getByRole('button', { name: 'Case brief', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Case brief', exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as unknown as { voiceLifecycle: { spoken: string[] } }).voiceLifecycle.spoken.length)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { voiceLifecycle: { spokenLanguages: string[] } }).voiceLifecycle.spokenLanguages)).toEqual(['en-IN']);
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Record update', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: 'Record an update', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { voiceLifecycle: { speaking: boolean } }).voiceLifecycle.speaking)).toBe(false);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay' }).click();
  expect(await page.evaluate(() => (window as unknown as { voiceLifecycle: { spoken: string[] } }).voiceLifecycle.spoken.length)).toBe(1);
});

test('review dialogs stop the microphone and discard queued transcripts', async ({ page }, info) => {
  await mockVoiceLifecycle(page);
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay' }).click();
  await page.getByRole('button', { name: 'Start voice input', exact: true }).click();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Record update', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: 'Record an update', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { voiceLifecycle: { aborted: number } }).voiceLifecycle.aborted)).toBe(1);
  await page.evaluate(() => {
    const state = (window as unknown as { voiceLifecycle: { sessions: { result: (event: { resultIndex: number; results: { transcript: string }[][] }) => void; end: () => void }[] } }).voiceLifecycle;
    state.sessions[0].result({ resultIndex: 0, results: [[{ transcript: 'Unwanted transcript from a closed recording' }]] }); state.sessions[0].end();
  });
  await expect(page.getByLabel('What was said?')).toHaveValue('');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay' }).click();
  await expect(page.getByLabel('Message to Relay')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Start voice input', exact: true })).toBeVisible();
});

test('a delayed chat response cannot overwrite another case conversation', async ({ page }, info) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  const cases: { id: string; title: string; reference: string }[] = await (await page.request.get('/api/cases')).json();
  const previous = cases.find(c => c.reference === 'DEMO-2081')!;
  const current = cases.find(c => c.reference === 'DEMO-4015')!;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const waiting = new Promise<void>(resolve => { started = resolve; });
  const marker = 'Fictional transcript belonging only to the previous case.';
  await page.route(`**/api/cases/${previous.id}/chat`, async route => {
    started(); await gate;
    await route.fulfill({ json: [{ id: crypto.randomUUID(), caseId: previous.id, role: 'assistant', text: marker, createdAt: new Date().toISOString(), traces: [] }] });
  }, { times: 1 });
  try {
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open case navigation' }).click();
    await page.getByRole('button', { name: new RegExp(previous.title) }).click(); await waiting;
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open case navigation' }).click();
    await page.getByRole('button', { name: new RegExp(current.title) }).click();
    await expect(page.getByRole('heading', { name: current.title, exact: true })).toBeVisible();
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay' }).click();
    const response = page.waitForResponse(r => r.url().endsWith(`/api/cases/${previous.id}/chat`));
    release(); await (await response).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole('heading', { name: current.title, exact: true })).toBeVisible();
    await expect(page.getByRole('log')).not.toContainText(marker);
    await page.screenshot({ path: `.data/screenshots/${info.project.name}-case-isolation.png`, fullPage: true });
  } finally { release(); }
});

for (const activity of ['chat reply', 'follow-up save'] as const) {
  test(`a delayed background refresh cannot undo a newer ${activity}`, async ({ page }, info) => {
    test.setTimeout(60000);
    await page.clock.install();
    const session = await (await page.request.get('/api/session')).json(); const headers = { 'x-relay-csrf': session.csrf };
    const title = `Refresh test ${activity} ${info.project.name} ${Date.now()}`;
    const created = await page.request.post('/api/cases', { headers, data: { title, person: 'Fictional refresh tester', equipment: 'Chair', reference: '', category: 'Other', fictional: true } });
    expect(created.ok()).toBe(true); const repair = await created.json();
    let release = () => {};
    try {
      await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
      if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open case navigation' }).click();
      await page.getByRole('button', { name: new RegExp(title) }).click(); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      const chatPath = `/api/cases/${repair.id}/chat`;
      const gate = new Promise<void>(resolve => { release = resolve; });
      let started!: () => void; const waiting = new Promise<void>(resolve => { started = resolve; });
      await page.route(`**${chatPath}`, async route => { const response = await route.fetch(); started(); await gate; await route.fulfill({ response }); }, { times: 1 });
      await page.clock.fastForward(20000); await waiting;
      if (activity === 'chat reply') {
        if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay', exact: true }).click();
        await page.getByRole('button', { name: 'Case brief', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Case brief', exact: true })).toBeEnabled();
        await expect(page.locator('.message')).toHaveCount(2);
      } else {
        await page.getByRole('tab', { name: 'Follow-ups', exact: true }).click();
        await page.getByRole('button', { name: 'Schedule', exact: true }).click();
        await page.getByLabel('Follow-up title').fill('Preserve this newly saved follow-up');
        await page.getByRole('button', { name: 'Schedule follow-up', exact: true }).click();
        await expect(page.getByRole('dialog')).not.toBeVisible();
        await expect(page.getByText('Preserve this newly saved follow-up', { exact: true })).toBeVisible();
      }
      const response = page.waitForResponse(result => result.url().endsWith(chatPath));
      release(); await (await response).finished();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      if (activity === 'chat reply') await expect(page.locator('.message')).toHaveCount(2);
      else await expect(page.getByText('Preserve this newly saved follow-up', { exact: true })).toBeVisible();
    } finally {
      release();
      expect((await page.request.delete(`/api/cases/${repair.id}`, { headers, data: { confirm: title } })).ok()).toBe(true);
    }
  });
}

test('simulator framing and paired reports expose source dates and real MCP calls', async ({ page }, info) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  const reports = page.getByRole('region', { name: 'Reported paperwork sources', exact: true });
  await reports.locator('summary').click();
  await expect(reports).toBeVisible(); await expect(reports.getByText('Receipt question open', { exact: true })).toBeVisible();
  await expect(reports.getByText('Supplier report', { exact: true })).toBeVisible(); await expect(reports.getByText('Insurer report', { exact: true })).toBeVisible();
  await expect(reports).toContainText('We submitted the repair estimate to your insurer.');
  await expect(reports).toContainText('We cannot locate the repair estimate under this reference.');
  await expect(reports.locator('time')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `.data/screenshots/${info.project.name}-simulator-evidence.png`, fullPage: true });
  await reports.getByRole('button', { name: 'View insurer source', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Evidence', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.evidence.highlighted')).toContainText('Harbor Health - email');
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay' }).click();
  const assistant = page.getByRole('complementary', { name: 'Simulated Alexa+ repair conversation', exact: true });
  await expect(assistant.getByText('Alexa+ experience simulator', { exact: true })).toBeVisible();
  await expect(assistant.getByText('Local command simulator', { exact: true })).toBeVisible();
  await assistant.getByRole('button', { name: 'Case brief', exact: true }).click();
  await expect(assistant.getByRole('button', { name: 'Case brief', exact: true })).toBeEnabled();
  const trace = assistant.getByRole('log').locator('details').last(); await trace.locator('summary').click();
  await expect(trace).toContainText('get_repair_brief'); await expect(trace).not.toContainText('Failed');
  await page.screenshot({ path: `.data/screenshots/${info.project.name}-simulator-trace.png`, fullPage: true });
});

test('Ollama provider label fits the workspace and does not request Bedrock consent', async ({ page }, info) => {
  await page.route('**/api/settings', async route => { const result = await route.fetch(); await route.fulfill({ response: result, json: { ...await result.json(), agentMode: 'ollama', model: 'fixture/local-tool-model:4b' } }); });
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay' }).click();
  const assistant = page.getByRole('complementary', { name: 'Simulated Alexa+ repair conversation', exact: true });
  await expect(assistant.getByText('Ollama / fixture/local-tool-model:4b', { exact: true })).toBeVisible();
  await expect(assistant.getByText('Share this case text with Amazon Bedrock', { exact: true })).toHaveCount(0);
  expect(await assistant.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: `.data/screenshots/${info.project.name}-ollama-label-fixture.png`, fullPage: true });
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('banner').getByRole('button', { name: 'Workspace settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Workspace settings' })).toContainText('Ollama / fixture/local-tool-model:4b');
});

test('paired reports use corrected evidence and disappear when the question is answered', async ({ page }, info) => {
  test.setTimeout(60000);
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  const session = await (await page.request.get('/api/session')).json(); const headers = { 'x-relay-csrf': session.csrf };
  const title = `Report provenance test ${info.project.name} ${Date.now()}`;
  const created = await page.request.post('/api/cases', { headers, data: { title, person: 'Fictional test user', equipment: 'Test chair', reference: '', category: 'Paperwork clarification', fictional: true } });
  expect(created.ok()).toBe(true); const c = await created.json();
  try {
    for (const event of [
      { party: 'supplier', stage: 'paperwork_sent', source: 'Fictional supplier', text: 'The fictional estimate was submitted to the insurer.' },
      { party: 'insurer', stage: 'paperwork_requested', source: 'Fictional insurer', text: 'Original fictional report: we cannot locate the estimate.' },
    ]) {
      const result = await page.request.post('/api/action', { headers, data: { tool: 'record_repair_event', args: { ...event, caseId: c.id, requestId: crypto.randomUUID(), channel: 'Email', occurredAt: new Date(Date.now() - 60000).toISOString() } } }); expect(result.ok()).toBe(true);
    }
    await page.reload(); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open case navigation' }).click();
    await page.getByRole('button', { name: new RegExp(title) }).click(); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    const reports = page.getByRole('region', { name: 'Reported paperwork sources', exact: true });
    await reports.locator('summary').click();
    await expect(reports).toContainText('Original fictional report: we cannot locate the estimate.');
    await reports.getByRole('button', { name: 'View insurer source', exact: true }).click();
    await page.locator('.evidence.highlighted').getByRole('button', { name: 'Correct source', exact: true }).click();
    await page.getByLabel('What was said?').fill('Corrected fictional report: please confirm the submission reference.');
    await page.getByLabel('I reviewed the source, date, and reported situation.').check(); await page.getByRole('button', { name: 'Save correction', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible(); await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await expect(reports).toContainText('Corrected fictional report: please confirm the submission reference.');
    await expect(reports).not.toContainText('Original fictional report:');
    await page.getByRole('tab', { name: 'Evidence', exact: true }).click();
    await expect(page.locator('.evidence.superseded')).toContainText('Original fictional report:');
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await page.getByRole('button', { name: 'Record answer', exact: true }).click();
    await page.getByLabel('Answer, source, and date').fill('Fictional insurer email, recorded today: receipt is confirmed under test reference.');
    await page.getByRole('dialog').getByRole('button', { name: 'Record answer', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible(); await expect(reports).not.toBeVisible();
    await expect(page.getByText('No open questions recorded', { exact: true })).toBeVisible();
  } finally {
    const result = await page.request.delete(`/api/cases/${c.id}`, { headers, data: { confirm: title } }); expect(result.ok()).toBe(true);
  }
});

test('case workspace renders, stays within the viewport, and exposes evidence', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Was the paperwork received?', exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `.data/screenshots/${info.project.name}-workspace.png`, fullPage: true });
  await page.getByRole('tab', { name: 'Evidence', exact: true }).click();
  await expect(page.getByText('Harbor Health - email', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Workspace settings', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByText('Streamable HTTP / 2025-11-25')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible(); expect(errors).toEqual([]);
});
test('new case runs evidence, draft, approval, follow-up, answer, export and deletion', async ({ page }, info) => {
  test.setTimeout(60000);
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open case navigation' }).click();
  await page.getByRole('button', { name: 'New repair case', exact: true }).click();
  const title = `Browser test ${info.project.name} ${Date.now()}`;
  try {
  await page.getByLabel('Case title').fill(title); await page.getByLabel("Person's preferred name").fill('Test person'); await page.getByLabel('Equipment', { exact: true }).fill('Manual wheelchair');
  await page.getByRole('dialog').getByRole('button', { name: 'Create case', exact: true }).click(); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Contacts', exact: true }).click(); await page.getByRole('button', { name: 'Add contact', exact: true }).click();
  await page.getByLabel('Contact name').fill('Test supplier'); await page.getByLabel('Email address').fill('test@supplier.example'); await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Record update', exact: true }).click(); await page.getByLabel('Source name').fill('Supplier email'); await page.getByLabel('What was said?').fill('The part is unavailable and no arrival date has been confirmed.'); await page.getByRole('combobox', { name: 'Reported situation', exact: true }).selectOption('parts_delayed'); await page.getByLabel('I reviewed the source, date, and reported situation.').check(); await page.getByRole('button', { name: 'Record update', exact: true }).last().click();
  await expect(page.getByRole('dialog')).not.toBeVisible(); await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'When will the part be available?', exact: true }).first()).toBeVisible(); await page.getByRole('button', { name: 'Prepare a request', exact: true }).click(); await page.getByRole('button', { name: 'Prepare draft', exact: true }).click();
  if (info.project.name === 'desktop') await page.route('**/api/drafts/*/send', async route => {
    const response = await route.fetch(); expect(response.status()).toBe(200);
    await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated lost capture response. Check the saved case status.' }) });
  }, { times: 1 });
  const approve = page.getByRole('button', { name: 'Approve & capture locally' }); await expect(approve).toBeDisabled(); await page.getByLabel('I approve this recipient and exact message.').check(); await approve.click(); await expect(page.getByRole('dialog').getByText('Local capture', { exact: true })).toBeVisible();
  await expect(approve).not.toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click(); await expect(page.getByRole('heading', { name: 'Unanswered questions 1' })).toBeVisible();
  await page.getByRole('tab', { name: 'Follow-ups', exact: true }).click(); await page.getByRole('button', { name: 'Schedule', exact: true }).click(); await page.getByLabel('Follow-up title').fill('Ask for the next update'); await page.getByRole('button', { name: 'Schedule follow-up', exact: true }).click(); await expect(page.getByText('Ask for the next update', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record answer', exact: true }).click(); await page.getByLabel('Answer, source, and date').fill('Supplier reports arrival next Friday. Source: test email, recorded today.'); await page.getByRole('button', { name: 'Record answer', exact: true }).last().click(); await expect(page.getByText('No open questions recorded')).toBeVisible();
  await page.getByRole('button', { name: 'Export history', exact: true }).click(); const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download history' }).click(); expect((await download).suggestedFilename()).toBe('repair-history.html');
  await page.getByRole('button', { name: 'Delete case', exact: true }).click(); await page.getByLabel(`Type "${title}" to confirm`).fill(title); await page.getByRole('button', { name: 'Delete case', exact: true }).last().click(); await expect(page.getByRole('dialog')).not.toBeVisible();
  } finally {
    const session = await (await page.request.get('/api/session')).json();
    const cases = await (await page.request.get('/api/cases')).json();
    const created = cases.find((c: { title: string; fictional: boolean }) => c.title === title && c.fictional);
    if (created) await page.request.delete(`/api/cases/${created.id}`, { headers: { 'x-relay-csrf': session.csrf }, data: { confirm: title } });
  }
});

test('simulated browser speech calls real MCP and requires review before recording evidence', async ({ page }, info) => {
  const statement = 'Northbridge Mobility said by phone that the replacement part is delayed.';
  await mockSpeech(page, { transcript: `Record: ${statement}` });
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay' }).click();
  await page.getByLabel('Message to Relay').fill('What is the next step?'); await page.getByRole('button', { name: 'Send message', exact: true }).click();
  const reply = page.getByRole('log').getByText(/This is a user-maintained record/).last();
  await expect(reply).toBeVisible(); await expect(reply).toBeInViewport();
  await expect(page.locator('.message.message-assistant').last()).toHaveCSS('position', 'static');
  await page.getByRole('button', { name: 'Start voice input', exact: true }).click();
  await expect(page.getByLabel('Message to Relay')).toHaveValue(`Record: ${statement}`);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Record an update', exact: true })).toBeVisible(); await expect(page.getByLabel('What was said?')).toHaveValue(statement);
  await expect(page.getByLabel('Source name')).toHaveValue('Northbridge Mobility');
  await expect(page.getByRole('combobox', { name: 'Who said it?', exact: true })).toHaveValue('supplier');
  await expect(page.getByRole('combobox', { name: 'Channel', exact: true })).toHaveValue('Phone');
  await expect(page.getByRole('combobox', { name: 'Reported situation', exact: true })).toHaveValue('parts_delayed');
  const save = page.getByRole('button', { name: 'Record update', exact: true }).last();
  await expect(save).toBeDisabled(); await page.screenshot({ path: `.data/screenshots/${info.project.name}-evidence-review.png`, fullPage: true });
  await page.getByLabel('I reviewed the source, date, and reported situation.').check(); await expect(save).toBeEnabled();
  await page.getByLabel('What was said?').fill(`${statement} A further update is pending.`); await expect(save).toBeDisabled();
  await expect(page.getByLabel('I reviewed the source, date, and reported situation.')).not.toBeChecked();
  await page.getByRole('button', { name: 'Close dialog' }).click();
});

test('microphone denial keeps the text workflow usable', async ({ page }, info) => {
  await mockSpeech(page, { error: 'not-allowed' });
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open Relay' }).click();
  await page.getByRole('button', { name: 'Start voice input', exact: true }).click();
  await expect(page.getByRole('alert').getByText('Microphone access was denied. You can use text instead.', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Message to Relay').fill('What reminders are due tomorrow?'); await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('log').getByText(/No new reminder was created/).last()).toBeVisible();
});

test.describe('follow-up editing across time zones', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('stored time zones render correctly and rescheduling saves all reviewed details', async ({ page }, info) => {
    await page.goto('/'); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
    const session = await (await page.request.get('/api/session')).json();
    const headers = { 'x-relay-csrf': session.csrf };
    const title = `Follow-up test ${info.project.name} ${Date.now()}`;
    const created = await page.request.post('/api/cases', { headers, data: { title, person: 'Fictional timezone test', equipment: 'Chair', reference: '', category: 'Other', fictional: true } });
    expect(created.ok()).toBe(true); const c = await created.json();
    try {
      for (const stage of ['parts_delayed', 'loaner_needed']) {
        const result = await page.request.post('/api/action', { headers, data: { tool: 'record_repair_event', args: { caseId: c.id, requestId: crypto.randomUUID(), party: 'supplier', source: 'Fictional supplier', channel: 'Email', occurredAt: new Date(Date.now() - 60000).toISOString(), text: 'Fictional update for testing.', stage } } });
        expect(result.ok()).toBe(true);
      }
      const brief = (await (await page.request.get(`/api/cases/${c.id}`)).json()).data;
      const parts = brief.questions.find((q: { kind: string }) => q.kind === 'parts');
      const loaner = brief.questions.find((q: { kind: string }) => q.kind === 'loaner');
      const dueAt = new Date(Date.now() + 172800000).toISOString();
      const scheduled = await page.request.post('/api/action', { headers, data: { tool: 'manage_repair_followup', args: { caseId: c.id, requestId: crypto.randomUUID(), action: 'create', title: 'Check arrival date', questionId: parts.id, dueAt, timezone: 'Asia/Kolkata' } } });
      expect(scheduled.ok()).toBe(true); const followup = (await scheduled.json()).data;
      await page.reload(); await expect(page.getByRole('heading', { name: 'Power chair repair', exact: true })).toBeVisible();
      if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open case navigation' }).click();
      await page.getByRole('button', { name: new RegExp(title) }).click();
      await page.getByRole('tab', { name: 'Follow-ups', exact: true }).click();
      const expectedTime = new Date(dueAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
      await expect(page.getByText(`${expectedTime} / Asia/Kolkata`, { exact: true })).toBeVisible();
      const nextFollowup = page.locator('.case-metrics > div').filter({ hasText: 'Next follow-up' });
      await expect(nextFollowup).toContainText(expectedTime); await expect(nextFollowup).toContainText('Asia/Kolkata');
      await page.getByRole('button', { name: 'Reschedule Check arrival date', exact: true }).click();
      await page.getByLabel('Follow-up title').fill('Ask about temporary equipment');
      await page.getByLabel('Related question').selectOption(loaner.id);
      await page.getByRole('button', { name: 'Reschedule', exact: true }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await expect(page.getByText('Ask about temporary equipment', { exact: true })).toBeVisible();
      const updated = (await (await page.request.get(`/api/cases/${c.id}`)).json()).data.followups.find((f: { id: string }) => f.id === followup.id);
      expect(updated.title).toBe('Ask about temporary equipment'); expect(updated.questionId).toBe(loaner.id); expect(updated.timezone).toBe('America/New_York');
      expect(updated.dueAt.slice(0, 16)).toBe(dueAt.slice(0, 16));
      await page.getByRole('button', { name: 'Reschedule Ask about temporary equipment', exact: true }).click();
      await page.getByLabel('Related question').selectOption(''); await page.getByRole('button', { name: 'Reschedule', exact: true }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
      const cleared = (await (await page.request.get(`/api/cases/${c.id}`)).json()).data.followups.find((f: { id: string }) => f.id === followup.id);
      expect(cleared.questionId).toBeNull();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `.data/screenshots/${info.project.name}-followup-timezone.png`, fullPage: true });
    } finally {
      const result = await page.request.delete(`/api/cases/${c.id}`, { headers, data: { confirm: title } }); expect(result.ok()).toBe(true);
    }
  });
});
