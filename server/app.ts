import express, { type Request, type Response, type NextFunction } from 'express';
import onHeaders from 'on-headers';
import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { z, ZodError } from 'zod';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Store, AppError } from './store.js';
import { RepairService, type MailDelivery } from './service.js';
import { createMcpServer, createMcpHost } from './mcp.js';
import { caseSchema, contactSchema, toolSchemas, type ToolName } from './schemas.js';
import { respond } from './agent.js';
import { seedExamples } from './fixtures.js';
import type { Config } from './config.js';
import type { ChatMessage, Draft, ToolTrace } from '../shared/types.js';

const equal = (a: string, b: string) => {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};
const uuid = z.string().uuid();

export async function startServer(config: Config, mail: MailDelivery, options: { frontend?: boolean; database?: string } = {}) {
  const store = new Store(options.database ?? resolve(config.dataDir, 'mobilityrelay.sqlite'));
  if (config.seed) seedExamples(store);
  const service = new RepairService(store, mail);
  const app = express(); app.disable('x-powered-by');
  const server = createServer(app);
  const sessions = new Map<string, { csrf: string; expires: number }>();
  const loginAttempts = new Map<string, { count: number; until: number }>();
  let localOrigin = `http://127.0.0.1:${config.port}`;
  const origins = () => new Set([localOrigin, `http://localhost:${new URL(localOrigin).port}`, ...(config.publicOrigin ? [config.publicOrigin] : [])]);
  const mcp = createMcpHost(() => `${localOrigin}/mcp`, config.mcpToken);
  const call = mcp.call;
  app.use('/mcp', (_req, res, next) => {
    onHeaders(res, function () {
      // Keep body framing valid even when a host normalizes MCP response headers.
      this.removeHeader('Content-Length'); this.setHeader('Transfer-Encoding', 'chunked');
    });
    next();
  });
  app.use((req, res, next) => {
    const host = req.headers.host;
    const allowedHosts = new Set([...origins()].map(value => new URL(value).host));
    if (!host || !allowedHosts.has(host)) return res.status(403).json({ error: 'Host not allowed.' });
    const origin = req.headers.origin;
    if (origin && !origins().has(origin)) return res.status(403).json({ error: 'Origin not allowed.' });
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'microphone=(self)');
    if (req.path.startsWith('/api') || req.path === '/mcp') res.setHeader('Cache-Control', 'no-store');
    if (config.production) res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    next();
  });
  app.use(express.json({ limit: '180kb' }));
  const sessionFor = (req: Request) => {
    const token = req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith('relay_session='))?.slice('relay_session='.length);
    if (!token) return undefined;
    const session = sessions.get(token);
    if (session && session.expires > Date.now()) return session;
    sessions.delete(token); return undefined;
  };
  const newSession = (res: Response) => {
    for (const [id, session] of sessions) if (session.expires <= Date.now()) sessions.delete(id);
    const id = randomBytes(32).toString('hex'); const session = { csrf: randomBytes(24).toString('hex'), expires: Date.now() + 8 * 60 * 60 * 1000 };
    sessions.set(id, session); res.cookie('relay_session', id, { httpOnly: true, sameSite: 'strict', secure: config.publicOrigin.startsWith('https://'), maxAge: 8 * 60 * 60 * 1000, path: '/' });
    return session;
  };
  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'MobilityRelay', protocol: '2025-11-25', transport: 'Streamable HTTP' }));
  app.get('/api/session', (req, res) => {
    const session = sessionFor(req) ?? (!config.password && !config.production ? newSession(res) : undefined);
    res.json({ authenticated: !!session, csrf: session?.csrf, protected: !!config.password });
  });
  app.post('/api/login', (req, res) => {
    const address = req.socket.remoteAddress ?? 'unknown';
    const attempt = loginAttempts.get(address);
    if (attempt && attempt.until > Date.now() && attempt.count >= 10) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    const input = z.object({ password: z.string().max(512) }).parse(req.body);
    if (!config.password || !equal(config.password, input.password)) {
      loginAttempts.set(address, { count: attempt && attempt.until > Date.now() ? attempt.count + 1 : 1, until: Date.now() + 900_000 });
      return res.status(401).json({ error: 'Incorrect password.' });
    }
    loginAttempts.delete(address); const session = newSession(res); res.json({ authenticated: true, csrf: session.csrf });
  });
  app.all('/mcp', async (req, res, next) => {
    if (!equal(req.headers.authorization ?? '', `Bearer ${config.mcpToken}`)) return res.status(401).json({ error: 'A valid MCP bearer token is required.' });
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'This stateless endpoint does not offer an SSE subscription or session deletion.' }); }
    const server = createMcpServer(service);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.once('close', () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) if (value && !['host', 'content-length', 'connection'].includes(name)) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      const request = new globalThis.Request(`${localOrigin}/mcp`, { method: 'POST', headers, body: JSON.stringify(req.body) });
      const response = await transport.handleRequest(request, { parsedBody: req.body });
      response.headers.forEach((value, name) => res.setHeader(name, value));
      const bytes = Buffer.from(await response.arrayBuffer());
      res.statusCode = response.status;
      res.end(bytes);
    } catch (error) { next(error); }
  });
  app.use('/api', (req, res, next) => {
    const session = sessionFor(req);
    if (!session) return res.status(401).json({ error: 'Sign in to access this workspace.' });
    if (!['GET', 'HEAD'].includes(req.method) && !equal(req.headers['x-relay-csrf']?.toString() ?? '', session.csrf)) return res.status(403).json({ error: 'A valid user-session confirmation is required.' });
    next();
  });
  app.post('/api/logout', (req, res) => {
    const token = req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith('relay_session='))?.slice('relay_session='.length);
    if (token) sessions.delete(token); res.clearCookie('relay_session'); res.json({ ok: true });
  });
  app.get('/api/settings', (_req, res) => res.json({ mailMode: mail.mode, agentMode: config.agentMode, model: config.agentMode === 'ollama' ? config.ollamaModel : undefined, protocol: '2025-11-25', tools: Object.keys(toolSchemas), protected: !!config.password }));
  app.get('/api/cases', (_req, res) => res.json(store.cases()));
  app.post('/api/cases', (req, res) => res.status(201).json(store.createCase(caseSchema.parse(req.body))));
  app.get('/api/cases/:id', async (req, res) => { const traces: ToolTrace[] = []; const data = await call('get_repair_brief', { caseId: uuid.parse(req.params.id) }, traces); res.json({ data, traces }); });
  app.delete('/api/cases/:id', (req, res) => {
    const id = uuid.parse(req.params.id); const c = store.case(id);
    const input = z.object({ confirm: z.string().min(1).max(100) }).strict().parse(req.body);
    if (input.confirm !== c.title) throw new AppError('Type the exact case title to confirm deletion.');
    if (store.list<Draft>('draft', id).some(d => d.status === 'sending')) throw new AppError('Wait for the active delivery attempt to finish before deleting this case.', 409);
    store.deleteCase(id); res.json({ ok: true });
  });
  app.post('/api/contacts', (req, res) => res.status(201).json(store.saveContact(contactSchema.parse(req.body))));
  app.post('/api/questions/:id/answer', (req, res) => {
    const input = z.object({ caseId: uuid, answer: z.string().trim().min(1).max(8000) }).strict().parse(req.body);
    res.json(store.resolveQuestion(input.caseId, uuid.parse(req.params.id), input.answer));
  });
  app.get('/api/cases/:id/chat', (req, res) => res.json(store.list<ChatMessage>('chat', uuid.parse(req.params.id))));
  app.post('/api/action', async (req, res) => {
    const input = z.object({ tool: z.enum(['record_repair_event', 'get_repair_brief', 'prepare_repair_request', 'manage_repair_followup', 'export_repair_packet']), args: z.record(z.unknown()) }).strict().parse(req.body);
    const traces: ToolTrace[] = []; const data = await call(input.tool, input.args, traces); res.json({ data, traces });
  });
  app.post('/api/drafts/:id/send', async (req, res) => {
    const input = z.object({ caseId: uuid, expectedHash: z.string().length(64), confirmed: z.literal(true) }).strict().parse(req.body);
    const draftId = uuid.parse(req.params.id);
    const token = service.issueApproval(input.caseId, draftId, input.expectedHash);
    const traces: ToolTrace[] = [];
    const data = await call('send_approved_request', { caseId: input.caseId, draftId, approvalToken: token }, traces);
    res.json({ data, traces });
  });
  app.post('/api/agent', async (req, res) => {
    const input = z.object({ caseId: uuid, text: z.string().trim().min(1).max(4000), allowCloud: z.boolean().default(false) }).strict().parse(req.body);
    store.case(input.caseId);
    if (config.agentMode === 'bedrock' && !input.allowCloud) throw new AppError('Consent is required before sharing case text with Amazon Bedrock.', 403);
    const history = store.list<ChatMessage>('chat', input.caseId).slice(-6);
    store.chat(input.caseId, 'user', input.text);
    const result = await respond({ ...input, history }, config, call, `${localOrigin}/mcp`, { catalog: () => mcp.catalog() });
    store.chat(input.caseId, 'assistant', result.reply, result.traces); res.json(result);
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  let vite: Awaited<ReturnType<typeof import('vite').createServer>> | undefined;
  if (options.frontend !== false) {
    if (config.production) {
      app.use(express.static(resolve('dist')));
      app.get('/{*splat}', (_req, res) => res.sendFile(resolve('dist/index.html')));
    } else {
      const { createServer: createVite, normalizePath } = await import('vite');
      const cacheKey = config.port ? createHash('sha256').update(`${config.dataDir}:${config.port}`).digest('hex').slice(0, 16) : randomBytes(6).toString('hex');
      const cacheDir = resolve('node_modules', '.vite', `mobilityrelay-${cacheKey}`);
      const deny = ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/.aws/**', '**/.private/**', '**/.data/**', `${normalizePath(resolve(config.dataDir))}/**`];
      vite = await createVite({ cacheDir, publicDir: false, server: { middlewareMode: true, hmr: { server }, fs: { strict: true, deny } }, appType: 'spa' }); app.use(vite.middlewares);
    }
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    if (error && typeof error === 'object' && 'type' in error) {
      if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON.' });
      if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body exceeds the allowed size.' });
    }
    if (error instanceof ZodError) return res.status(400).json({ error: error.issues.map(i => `${i.path.join('.') || 'Input'}: ${i.message}`).join('; ') });
    const status = error instanceof AppError ? error.status : 500;
    if (status === 500) {
      const cause = error instanceof Error ? error.cause : undefined;
      const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : undefined;
      console.error('Request failed:', error instanceof Error ? error.message : 'Unknown error', code ?? '');
    }
    res.status(status).json({ error: error instanceof AppError ? error.message : 'The request failed. No successful action is assumed; refresh the case before retrying.' });
  });
  await new Promise<void>((resolveListen, reject) => { server.once('error', reject); server.listen(config.port, config.host, resolveListen); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('HTTP server did not bind.');
  localOrigin = `http://${address.address === '::1' ? '[::1]' : '127.0.0.1'}:${address.port}`;
  return { server, store, service, mcp, url: localOrigin, close: async () => { await vite?.close(); await mcp.close(); server.closeIdleConnections(); await new Promise<void>((done, reject) => server.close(err => err ? reject(err) : done())); store.close(); } };
}
