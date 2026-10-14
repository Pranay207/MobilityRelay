import { connect } from 'node:net';
import { readConfig } from '../server/config.js';
import { startServer } from '../server/app.js';

const config = { ...readConfig(), host: '127.0.0.1', port: 0, password: '', publicOrigin: '', production: false, seed: false, mcpToken: 'fictional-framing-token' };
const app = await startServer(config, { mode: 'capture', send: async () => { throw new Error('Framing checks never send.'); } }, { frontend: false, database: ':memory:' });
app.server.on('request', (_request, response) => {
  const set = response.setHeader;
  response.setHeader = function (name, value) {
    if (/content-length|transfer-encoding/i.test(name)) console.log('Framing header set:', name, value);
    return set.call(this, name, value);
  };
  response.once('finish', () => console.log('Finished response metadata:', response.getHeaders(), 'chunked:', response.chunkedEncoding));
});
try {
  const url = new URL(app.url);
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'fictional-framing-qa', version: '1' } } });
  const output = await new Promise<string>((resolve, reject) => {
    const socket = connect(Number(url.port), url.hostname); const chunks: Buffer[] = [];
    socket.setTimeout(10000, () => socket.destroy(new Error('Raw HTTP response timed out.')));
    socket.on('error', reject); socket.on('data', chunk => chunks.push(chunk));
    socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    socket.on('connect', () => socket.write(`POST /mcp HTTP/1.1\r\nHost: ${url.host}\r\nAuthorization: Bearer ${config.mcpToken}\r\nAccept: application/json, text/event-stream\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`));
  });
  console.log('Synthetic raw HTTP response (no case records):\n' + output);
} finally { await app.close(); }
