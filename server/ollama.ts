import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ConverseCommandInput, ConverseCommandOutput, Message } from '@aws-sdk/client-bedrock-runtime';

export function localModelEndpoint(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('OLLAMA_BASE_URL must be a loopback HTTP origin without credentials or a path.');
  }
  return url.origin;
}

export function localModelName(value: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,150}$/.test(value) || /(?:^|[-:/])cloud(?:$|[-:/])/i.test(value)) throw new Error('OLLAMA_MODEL must name a downloaded local model, not a cloud model.');
  return value;
}

const chatResponse = z.object({
  done: z.literal(true), done_reason: z.string().optional(),
  prompt_eval_count: z.number().int().nonnegative().optional(), eval_count: z.number().int().nonnegative().optional(), total_duration: z.number().nonnegative().optional(),
  message: z.object({ role: z.literal('assistant'), content: z.string().max(65536), tool_calls: z.array(z.object({ function: z.object({ name: z.string().min(1).max(160), arguments: z.record(z.unknown()) }) })).max(16).optional() }),
});
interface LocalMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_name?: string; tool_calls?: { type: 'function'; function: { name: string; arguments: unknown } }[] }

// Reuse the bounded agent transcript; only the provider's wire format changes.
function localMessages(input: ConverseCommandInput): LocalMessage[] {
  const result: LocalMessage[] = []; const names = new Map<string, string>();
  if (input.system?.length) result.push({ role: 'system', content: input.system.flatMap(block => block.text ? [block.text] : []).join('\n') });
  for (const message of input.messages ?? []) {
    const content = message.content?.flatMap(block => block.text !== undefined ? [block.text] : []).join('\n') ?? '';
    const calls = message.content?.flatMap(block => block.toolUse ? [block.toolUse] : []) ?? [];
    for (const call of calls) names.set(call.toolUseId!, call.name!);
    if (content || calls.length) result.push({ role: message.role!, content, ...(calls.length ? { tool_calls: calls.map(call => ({ type: 'function' as const, function: { name: call.name!, arguments: call.input ?? {} } })) } : {}) });
    for (const block of message.content ?? []) {
      if (!block.toolResult) continue;
      const name = names.get(block.toolResult.toolUseId!);
      if (!name) throw new Error('A model tool result has no matching call.');
      result.push({ role: 'tool', tool_name: name, content: JSON.stringify({ status: block.toolResult.status, result: block.toolResult.content?.flatMap(item => item.text !== undefined ? [item.text] : []) }) });
    }
  }
  return result;
}

async function boundedJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The local model returned no response body.');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 1024 * 1024) { await reader.cancel(); throw new Error('The local model response exceeded its size limit.'); }
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally { reader.releaseLock(); }
}

export function ollamaConverse(baseUrl: string, model: string, request: typeof fetch = fetch) {
  const endpoint = `${localModelEndpoint(baseUrl)}/api/chat`; localModelName(model);
  return async (input: ConverseCommandInput, signal: AbortSignal): Promise<ConverseCommandOutput> => {
    const tools = input.toolConfig?.tools?.flatMap(tool => tool.toolSpec ? [{ type: 'function', function: { name: tool.toolSpec.name, description: tool.toolSpec.description, parameters: tool.toolSpec.inputSchema?.json } }] : []) ?? [];
    const response = await request(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, redirect: 'error',
      body: JSON.stringify({ model, messages: localMessages(input), tools, stream: false, think: false, keep_alive: '5m', options: { temperature: input.inferenceConfig?.temperature ?? 0.1, num_predict: Math.min(input.inferenceConfig?.maxTokens ?? 384, 384), num_ctx: 8192 } }),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Local model request failed (${response.status}).`); }
    const data = chatResponse.parse(await boundedJson(response));
    if (data.done_reason === 'length') throw new Error('The local model response was truncated.');
    const content: NonNullable<Message['content']> = [];
    const endOfThinking = data.message.content.lastIndexOf('</think>');
    const text = (endOfThinking >= 0 ? data.message.content.slice(endOfThinking + '</think>'.length) : data.message.content).trim();
    if (text.includes('<think>')) throw new Error('The local model returned unfinished reasoning rather than a final answer.');
    if (text) content.push({ text });
    for (const call of data.message.tool_calls ?? []) content.push({ toolUse: { toolUseId: randomUUID(), name: call.function.name, input: call.function.arguments as NonNullable<NonNullable<Message['content']>[number]['toolUse']>['input'] } });
    if (!content.length) throw new Error('The local model returned no reply or tool call.');
    return { $metadata: {}, output: { message: { role: 'assistant', content } }, stopReason: data.message.tool_calls?.length ? 'tool_use' : 'end_turn', usage: { inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0, totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0) }, metrics: { latencyMs: (data.total_duration ?? 0) / 1000000 } };
  };
}
