import { randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type { MailDelivery } from './service.js';

export class SmtpSetupError extends Error {
  constructor(message: string) { super(message); this.name = 'SmtpSetupError'; }
}

function mailMode(env: NodeJS.ProcessEnv) {
  const mode = env.MAIL_MODE || 'capture';
  if (mode !== 'capture' && mode !== 'smtp') throw new SmtpSetupError('MAIL_MODE must be capture or smtp.');
  return mode;
}

export function readSmtpSettings(env: NodeJS.ProcessEnv = process.env): { from: string; options: SMTPTransport.Options } {
  const host = env.SMTP_HOST?.trim() || ''; const from = env.SMTP_FROM?.trim() || '';
  const user = env.SMTP_USER?.trim() || ''; const gmail = host.toLowerCase() === 'smtp.gmail.com';
  const password = gmail ? (env.SMTP_PASSWORD || '').replace(/\s/g, '') : env.SMTP_PASSWORD || '';
  const missing = [!host && 'SMTP_HOST', !from && 'SMTP_FROM', ((gmail || password) && !user) && 'SMTP_USER', ((gmail || user) && !password) && 'SMTP_PASSWORD'].filter(Boolean);
  if (missing.length) throw new SmtpSetupError(`Complete your private .env: set ${missing.join(', ')}.`);
  if (/[\s/@?#]/.test(host) || /[\r\n]/.test(from)) throw new SmtpSetupError('SMTP_HOST must be a hostname, and SMTP_FROM must not contain line breaks.');
  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new SmtpSetupError('SMTP_PORT must be an integer from 1 to 65535.');
  if (env.SMTP_SECURE && !['true', 'false'].includes(env.SMTP_SECURE)) throw new SmtpSetupError('SMTP_SECURE must be true or false.');
  const secure = env.SMTP_SECURE === 'true';
  if ((port === 465 && !secure) || (port === 587 && secure)) throw new SmtpSetupError('Use SMTP_SECURE=true for port 465, or false for port 587 with required STARTTLS.');
  if (gmail && !/^[a-z0-9]{16}$/i.test(password)) throw new SmtpSetupError('For Gmail, enter a 16-character App Password in SMTP_PASSWORD, not your normal Google password.');
  return { from, options: { host, port, secure, requireTLS: !secure, auth: user ? { user, pass: password } : undefined, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000, dnsTimeout: 15000, tls: { minVersion: 'TLSv1.2' }, disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false } };
}

type VerificationTransport = { verify(): Promise<unknown>; close(): void };
export async function verifySmtpConfiguration(env: NodeJS.ProcessEnv = process.env, factory: (options: SMTPTransport.Options) => VerificationTransport = options => nodemailer.createTransport(options)) {
  const mode = mailMode(env); const settings = readSmtpSettings(env);
  const transport = factory(settings.options);
  try {
    await transport.verify();
    return { mailMode: mode, authentication: Boolean(settings.options.auth) };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const hints: Record<string, string> = {
      EAUTH: 'SMTP login was rejected. Check SMTP_USER and the provider credential. Gmail requires 2-Step Verification and an App Password.',
      EDNS: 'The SMTP hostname could not be resolved. Check SMTP_HOST and your network.',
      ENOTFOUND: 'The SMTP hostname could not be resolved. Check SMTP_HOST and your network.',
      ETIMEDOUT: 'The SMTP connection timed out. Check the host, port, network and firewall.',
      ETLS: 'The required TLS connection could not be established. Check the port and certificate trust; do not disable TLS verification.',
      ESOCKET: 'The SMTP connection failed. Check network access and certificate trust; do not disable TLS verification.',
      ECONNECTION: 'The SMTP connection failed. Check SMTP_HOST, SMTP_PORT and network access.',
    };
    throw new SmtpSetupError(hints[code] || 'SMTP verification failed. Check your provider settings and account permissions. No email was sent.');
  } finally { transport.close(); }
}

export function createMail(env: NodeJS.ProcessEnv = process.env): MailDelivery {
  if (mailMode(env) === 'capture') return { mode: 'capture', send: async () => `local-${randomBytes(8).toString('hex')}` };
  const { from, options } = readSmtpSettings(env);
  const transport = nodemailer.createTransport(options);
  return { mode: 'smtp', send: async draft => {
    const result = await transport.sendMail({ from, to: draft.recipient, subject: draft.subject, text: draft.body, messageId: `<${draft.id}@mobilityrelay.local>` });
    if (!result.accepted?.length || result.rejected?.length) throw new Error('The SMTP provider did not accept this recipient.');
    return result.messageId;
  } };
}
