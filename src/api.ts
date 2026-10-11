import type { ToolTrace } from '../shared/types';

let csrf = '';
export function setCsrf(value: string) { csrf = value; }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-Relay-CSRF': csrf } : {}), ...options.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result as T;
}
export const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const action = <T>(tool: string, args: unknown) => post<{ data: T; traces: ToolTrace[] }>('/api/action', { tool, args });
export function download(packet: { content: string; mime: string; filename: string }) {
  const url = URL.createObjectURL(new Blob([packet.content], { type: packet.mime }));
  const link = document.createElement('a'); link.href = url; link.download = packet.filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
