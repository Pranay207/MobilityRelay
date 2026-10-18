import 'dotenv/config';
import { SmtpSetupError, verifySmtpConfiguration } from '../server/mail.js';

try {
  const result = await verifySmtpConfiguration();
  console.log(`SMTP connection and TLS verification passed.${result.authentication ? ' Login succeeded.' : ' No SMTP login is configured.'} No email was sent.`);
  console.log('This does not verify sender permission or inbox receipt. Test those through the reviewed approval workflow.');
  console.log(result.mailMode === 'capture' ? 'MAIL_MODE=capture: messages still stay local. Enable smtp only when ready for the approved inbox test.' : 'MAIL_MODE=smtp: approved messages use real email. Test only with fictional content and an inbox you control.');
} catch (error) {
  console.error(`SMTP check failed: ${error instanceof SmtpSetupError ? error.message : 'Check your local SMTP configuration and provider account.'}`);
  console.error('No email was sent. Do not paste passwords or tokens into chat or commit them to Git.');
  process.exitCode = 1;
}
