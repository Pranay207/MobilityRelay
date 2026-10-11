import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import nodemailer from 'nodemailer';
import type { MailDelivery } from './service.js';

export interface Config { host: string; port: number; dataDir: string; password: string; mcpToken: string; publicOrigin: string; production: boolean; seed: boolean; agentMode: 'local' | 'bedrock'; modelId: string; region: string }
export function readConfig(): Config {
  const config: Config = { host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 4317), dataDir: resolve(process.env.DATA_DIR || '.data'), password: process.env.APP_PASSWORD || '', mcpToken: process.env.MCP_TOKEN || randomBytes(32).toString('hex'), publicOrigin: process.env.PUBLIC_ORIGIN || '', production: process.env.NODE_ENV === 'production', seed: process.env.SEED_EXAMPLES !== 'false', agentMode: process.env.AGENT_MODE === 'bedrock' ? 'bedrock' : 'local', modelId: process.env.BEDROCK_MODEL_ID || '', region: process.env.AWS_REGION || 'us-east-1' };
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw new Error('PORT must be a valid port.');
  const external = !['127.0.0.1', 'localhost', '::1'].includes(config.host);
  if ((config.production || external) && (config.password.length < 16 || !process.env.MCP_TOKEN || config.mcpToken.length < 32 || !config.publicOrigin.startsWith('https://'))) throw new Error('Public/production mode requires APP_PASSWORD (16+ characters), MCP_TOKEN (32+ characters) and an HTTPS PUBLIC_ORIGIN.');
  if (config.agentMode === 'bedrock' && !config.modelId) throw new Error('Set BEDROCK_MODEL_ID for Bedrock mode.');
  return config;
}
export function createMail(): MailDelivery {
  if (process.env.MAIL_MODE !== 'smtp') return { mode: 'capture', send: async () => `local-${randomBytes(8).toString('hex')}` };
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) throw new Error('SMTP mode requires SMTP_HOST and SMTP_FROM.');
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', requireTLS: process.env.SMTP_SECURE !== 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined, connectionTimeout: 15000, socketTimeout: 20000, disableFileAccess: true, disableUrlAccess: true });
  return { mode: 'smtp', send: async draft => {
    const result = await transport.sendMail({ from: process.env.SMTP_FROM, to: draft.recipient, subject: draft.subject, text: draft.body, messageId: `<${draft.id}@mobilityrelay.local>` });
    if (!result.accepted?.length || result.rejected?.length) throw new Error('The SMTP provider did not accept this recipient.');
    return result.messageId;
  } };
}
