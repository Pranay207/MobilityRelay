import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createMail, readSmtpSettings, SmtpSetupError, verifySmtpConfiguration } from '../server/mail.js';

const fixture = { MAIL_MODE: 'capture', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'fictional.sender@gmail.com', SMTP_PASSWORD: 'abcd efgh ijkl mnop', SMTP_FROM: 'fictional.sender@gmail.com' };

test('capture stays the default and incomplete SMTP settings cannot enable delivery', () => {
  assert.equal(createMail({}).mode, 'capture');
  assert.equal(createMail({ MAIL_MODE: 'capture', SMTP_HOST: 'smtp.gmail.com' }).mode, 'capture');
  for (const mode of ['smpt', 'SMTP', 'other']) assert.throws(() => createMail({ MAIL_MODE: mode }), /MAIL_MODE/);
  assert.throws(() => createMail({ MAIL_MODE: 'smtp' }), /SMTP_HOST.*SMTP_FROM/);
});

test('Gmail settings require a complete App Password configuration without leaking supplied values', () => {
  for (const key of ['SMTP_HOST', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD']) {
    assert.throws(() => readSmtpSettings({ ...fixture, [key]: '' }), error => error instanceof SmtpSetupError && error.message.includes(key) && !error.message.includes(fixture.SMTP_USER));
  }
  assert.throws(() => readSmtpSettings({ ...fixture, SMTP_PASSWORD: 'PRIVATE_NORMAL_PASSWORD_MUST_NOT_APPEAR' }), error => error instanceof SmtpSetupError && /App Password/.test(error.message) && !error.message.includes('PRIVATE_NORMAL_PASSWORD'));
});

test('SMTP settings preserve required encryption and disable protocol, file and URL logging/access', () => {
  const { from, options } = readSmtpSettings(fixture);
  assert.equal(from, fixture.SMTP_FROM); assert.equal(options.port, 587); assert.equal(options.secure, false); assert.equal(options.requireTLS, true);
  assert.deepEqual(options.auth, { user: fixture.SMTP_USER, pass: 'abcdefghijklmnop' });
  assert.equal(options.tls?.minVersion, 'TLSv1.2'); assert.notEqual(options.tls?.rejectUnauthorized, false);
  assert.equal(options.disableFileAccess, true); assert.equal(options.disableUrlAccess, true);
  assert.equal(options.logger, false); assert.equal(options.debug, false);
  const implicit = readSmtpSettings({ ...fixture, SMTP_PORT: '465', SMTP_SECURE: 'true' });
  assert.equal(implicit.options.secure, true); assert.equal(implicit.options.requireTLS, false);
});

test('invalid ports, TLS flags, hostnames and partial credentials fail before connecting', () => {
  for (const port of ['0', '-1', '65536', 'abc', '587.5']) assert.throws(() => readSmtpSettings({ ...fixture, SMTP_PORT: port }), /SMTP_PORT/);
  for (const flag of ['yes', '1', 'FALSE']) assert.throws(() => readSmtpSettings({ ...fixture, SMTP_SECURE: flag }), /SMTP_SECURE/);
  assert.throws(() => readSmtpSettings({ ...fixture, SMTP_PORT: '465' }), /SMTP_SECURE/);
  assert.throws(() => readSmtpSettings({ ...fixture, SMTP_SECURE: 'true' }), /SMTP_SECURE/);
  for (const host of ['smtp://private:secret@host', 'mail.example/path', 'mail.example?secret', 'mail example']) assert.throws(() => readSmtpSettings({ ...fixture, SMTP_HOST: host }), /SMTP_HOST/);
  assert.throws(() => readSmtpSettings({ ...fixture, SMTP_FROM: 'sender@example.com\r\nBcc:other@example.com' }), /SMTP_FROM/);
  assert.throws(() => readSmtpSettings({ SMTP_HOST: 'relay.example', SMTP_FROM: 'sender@example.com', SMTP_USER: 'user' }), /SMTP_PASSWORD/);
});

test('explicit relay settings can omit login without claiming authentication', async () => {
  let closed = false;
  const result = await verifySmtpConfiguration({ SMTP_HOST: 'relay.example', SMTP_FROM: 'sender@example.com' }, options => {
    assert.equal(options.auth, undefined); assert.equal(options.requireTLS, true);
    return { verify: async () => true, close: () => { closed = true; } };
  });
  assert.deepEqual(result, { mailMode: 'capture', authentication: false }); assert.equal(closed, true);
});

test('SMTP verification authenticates without a send operation and does not enable SMTP mode', async () => {
  let checked = 0; let closed = 0;
  const result = await verifySmtpConfiguration(fixture, options => {
    assert.deepEqual(options.auth, { user: fixture.SMTP_USER, pass: 'abcdefghijklmnop' });
    return { verify: async () => { checked++; return true; }, close: () => { closed++; } };
  });
  assert.deepEqual(result, { mailMode: 'capture', authentication: true });
  assert.equal(checked, 1); assert.equal(closed, 1); assert.equal(fixture.MAIL_MODE, 'capture');
});

test('incomplete verification settings never create a connection', async () => {
  let connections = 0;
  await assert.rejects(verifySmtpConfiguration({}, () => { connections++; throw new Error('Must not connect.'); }), /SMTP_HOST/);
  assert.equal(connections, 0);
});

test('verification failures close transport and omit raw server responses and credentials', async () => {
  for (const code of ['EAUTH', 'EDNS', 'ETIMEDOUT', 'ETLS', 'ESOCKET', 'ECONNECTION', 'UNKNOWN']) {
    let closed = false;
    await assert.rejects(verifySmtpConfiguration(fixture, () => ({
      verify: async () => { throw Object.assign(new Error(`PRIVATE_PROVIDER_RESPONSE ${fixture.SMTP_PASSWORD}`), { code, response: `PRIVATE_PROVIDER_RESPONSE ${fixture.SMTP_USER}` }); },
      close: () => { closed = true; },
    })), error => error instanceof SmtpSetupError && !/PRIVATE_PROVIDER_RESPONSE|fictional.sender|abcd/.test(error.message));
    assert.equal(closed, true);
  }
});

test('a server without STARTTLS cannot receive credentials or a message during verification', async () => {
  const commands: string[] = []; const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.on('error', () => {});
    socket.write('220 localhost ESMTP fictional verification fixture\r\n'); let pending = '';
    socket.on('data', chunk => {
      pending += String(chunk);
      let end: number;
      while ((end = pending.indexOf('\r\n')) !== -1) {
        const line = pending.slice(0, end); pending = pending.slice(end + 2); const command = line.split(' ')[0]; commands.push(command);
        if (command === 'EHLO') socket.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (command === 'STARTTLS') socket.write('454 4.7.0 TLS unavailable in fictional fixture\r\n');
        else socket.write('500 Command rejected\r\n');
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    await assert.rejects(verifySmtpConfiguration({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(address.port), SMTP_FROM: 'sender@example.com', SMTP_USER: 'fixture-only-user', SMTP_PASSWORD: 'fixture-only-password' }), SmtpSetupError);
    assert.ok(commands.includes('EHLO')); assert.ok(commands.includes('STARTTLS'));
    assert.equal(commands.some(command => ['AUTH', 'MAIL', 'RCPT', 'DATA'].includes(command)), false);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('the CLI reports configuration failures without printing secrets or a stack trace', async () => {
  const run = promisify(execFile);
  await assert.rejects(run(process.execPath, ['--import', 'tsx', 'scripts/verify-smtp.ts'], {
    env: { ...process.env, MAIL_MODE: 'capture', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_FROM: '', SMTP_USER: 'private-cli-fixture@gmail.com', SMTP_PASSWORD: 'PRIVATE_CLI_SECRET' }, timeout: 15000,
  }), error => {
    const result = error as Error & { code: number; stdout: string; stderr: string };
    assert.equal(result.code, 1); assert.match(result.stderr, /SMTP_FROM/); assert.match(result.stderr, /No email was sent/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /PRIVATE_CLI_SECRET|private-cli-fixture|at .*verify-smtp/);
    return true;
  });
});
