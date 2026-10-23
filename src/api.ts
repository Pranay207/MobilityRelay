import type { ToolTrace } from '../shared/types';

let csrf = '';
export function setCsrf(value: string) { csrf = value; }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const deadline = (options.method ?? 'GET').toUpperCase() === 'GET' ? AbortSignal.timeout(10000) : undefined;
  const request = { ...options, ...(deadline ? { signal: options.signal ? AbortSignal.any([deadline, options.signal]) : deadline } : {}), headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-Relay-CSRF': csrf } : {}), ...options.headers } };
  try {
    let response: Response;
    for (let attempt = 0; ; attempt++) {
      try { response = await fetch(path, request); break; }
      catch (error) {
        // Only a failed read connection may retry, within its original budget.
        if (deadline && attempt === 0 && error instanceof TypeError && !deadline.aborted && !options.signal?.aborted) continue;
        throw error;
      }
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result as T;
  } catch (error) {
    if (deadline?.aborted) throw new Error('The workspace read timed out. Try loading the case again.');
    throw error;
  }
}
export const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const action = <T>(tool: string, args: unknown) => post<{ data: T; traces: ToolTrace[] }>('/api/action', { tool, args });
export function download(packet: { content: string; mime: string; filename: string }) {
  const url = URL.createObjectURL(new Blob([packet.content], { type: packet.mime }));
  const link = document.createElement('a'); link.href = url; link.download = packet.filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
