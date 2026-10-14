import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { ConverseCommandInput } from '@aws-sdk/client-bedrock-runtime';
import { localModelEndpoint, localModelName, ollamaConverse } from '../server/ollama.js';

const input: ConverseCommandInput = { modelId: 'unused', system: [{ text: 'Use recorded sources.' }], messages: [{ role: 'user', content: [{ text: 'What is missing?' }] }], toolConfig: { tools: [{ toolSpec: { name: 'get_repair_brief', description: 'Read the case', inputSchema: { json: { type: 'object', properties: {} } } } }] } };
const reply = (content = 'The receipt reference is missing.', extra: Record<string, unknown> = {}) => ({ done: true, message: { role: 'assistant', content }, ...extra });
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('Ollama endpoints stay on loopback and reject credentials, paths and redirects', () => {
  assert.equal(localModelEndpoint('http://localhost:11434'), 'http://localhost:11434');
  assert.equal(localModelEndpoint('http://[::1]:11434/'), 'http://[::1]:11434');
  for (const url of ['https://127.0.0.1:11434', 'http://remote.example', 'http://127.0.0.1:11434/api/chat', 'http://user:password@localhost:11434', 'http://localhost:11434/?token=x', 'http://localhost:11434/#x']) assert.throws(() => localModelEndpoint(url));
});

test('Ollama model names reject cloud models and invalid input', () => {
  assert.equal(localModelName('qwen3:4b'), 'qwen3:4b');
  for (const name of ['', 'qwen3:cloud', 'gpt-oss:20b-cloud', 'bad model', '../../cloud/model']) assert.throws(() => localModelName(name));
});

test('Ollama chat uses real HTTP with nonstreaming tools and bounded generation', async () => {
  let received: Record<string, unknown> | undefined;
  const server = createServer(async (req, res) => {
    assert.equal(req.url, '/api/chat'); assert.equal(req.method, 'POST');
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); received = JSON.parse(Buffer.concat(chunks).toString());
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(reply()));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    const result = await ollamaConverse(`http://127.0.0.1:${address.port}`, 'qwen3:4b')(input, AbortSignal.timeout(5000));
    assert.equal(result.output?.message?.content?.[0].text, 'The receipt reference is missing.');
    assert.equal(received?.model, 'qwen3:4b'); assert.equal(received?.stream, false); assert.equal(received?.think, false);
    assert.equal((received?.tools as { function: { name: string } }[])[0].function.name, 'get_repair_brief');
    assert.deepEqual(received?.options, { temperature: 0.1, num_predict: 384, num_ctx: 8192 });
  } finally { server.closeIdleConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('Ollama tool calls and results retain function names without exposing thinking', async () => {
  let body: Record<string, unknown> = {};
  const request: typeof fetch = async (_url, options) => {
    body = JSON.parse(String(options?.body)); assert.equal(options?.redirect, 'error');
    return response(reply('', { message: { role: 'assistant', content: '', thinking: 'PRIVATE reasoning', tool_calls: [{ function: { name: 'get_repair_brief', arguments: {} } }] } }));
  };
  const converse = ollamaConverse('http://127.0.0.1:11434', 'qwen3:4b', request);
  const first = await converse(input, AbortSignal.timeout(5000)); const use = first.output?.message?.content?.[0].toolUse;
  assert.equal(use?.name, 'get_repair_brief'); assert.ok(use?.toolUseId); assert.equal(JSON.stringify(first).includes('PRIVATE'), false);
  await converse({ ...input, messages: [...input.messages!, first.output!.message!, { role: 'user', content: [{ toolResult: { toolUseId: use!.toolUseId!, status: 'success', content: [{ text: '{"nextStep":"Ask for receipt"}' }] } }] }] }, AbortSignal.timeout(5000));
  const messages = body.messages as { role: string; tool_name?: string; content: string }[];
  assert.equal(messages.at(-1)?.role, 'tool'); assert.equal(messages.at(-1)?.tool_name, 'get_repair_brief'); assert.match(messages.at(-1)!.content, /Ask for receipt/);
});

test('Ollama rejects incomplete, truncated, malformed and empty responses', async () => {
  for (const value of [{ done: false, message: { role: 'assistant', content: 'Partial' } }, reply('Partial', { done_reason: 'length' }), reply(''), reply('', { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'get_repair_brief', arguments: 'invalid' } }] } })]) {
    await assert.rejects(ollamaConverse('http://127.0.0.1:11434', 'qwen3:4b', async () => response(value))(input, AbortSignal.timeout(5000)));
  }
});

test('Ollama responses are size-limited and HTTP failures do not leak provider diagnostics', async () => {
  await assert.rejects(ollamaConverse('http://127.0.0.1:11434', 'qwen3:4b', async () => new Response('x'.repeat(1024 * 1024 + 1)))(input, AbortSignal.timeout(5000)), /size limit/);
  await assert.rejects(ollamaConverse('http://127.0.0.1:11434', 'qwen3:4b', async () => new Response('PRIVATE provider diagnostics', { status: 404 }))(input, AbortSignal.timeout(5000)), error => error instanceof Error && error.message.includes('404') && !error.message.includes('PRIVATE'));
});

test('Ollama requests propagate cancellation instead of silently falling back', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(ollamaConverse('http://127.0.0.1:11434', 'qwen3:4b', async (_url, options) => { assert.equal(options?.signal, controller.signal); options?.signal?.throwIfAborted(); return response(reply()); })(input, controller.signal), error => error instanceof Error && error.name === 'AbortError');
});

test('Ollama reasoning blocks never become the user-facing reply', async () => {
  for (const value of ['<think>PRIVATE reasoning</think>The receipt is unconfirmed.', 'PRIVATE prefilled reasoning</think>The receipt is unconfirmed.']) {
    const result = await ollamaConverse('http://127.0.0.1:11434', 'qwen3:4b', async () => response(reply(value)))(input, AbortSignal.timeout(5000));
    assert.equal(result.output?.message?.content?.[0].text, 'The receipt is unconfirmed.'); assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  }
  await assert.rejects(ollamaConverse('http://127.0.0.1:11434', 'qwen3:4b', async () => response(reply('<think>Unfinished reasoning')))(input, AbortSignal.timeout(5000)), /unfinished reasoning/);
});
