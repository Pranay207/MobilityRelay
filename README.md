# MobilityRelay

A voice-first repair follow-up assistant for wheelchair users and caregivers.

## Run Locally

Requires Node.js 24+ and npm. No AWS account or API key is needed for local mode.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4317. The same process serves the React workspace and the
authenticated MCP endpoint at `/mcp`. Five explicitly fictional cases are seeded
only when the database is empty. Create your own case through the workspace.

If Windows reports `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, enable Node's system trust
store with `NODE_USE_SYSTEM_CA=1` for your shell and retry. Do not disable TLS
certificate verification.

The app stores records in ignored `.data/mobilityrelay.sqlite`. Local mode is a
single-device, shared workspace, not a multi-user healthcare system. Do not place
real sensitive records on an unprotected or shared machine.

## Working Scope

The workspace supports evidence corrections, open questions, contact management,
exact-message approval, request history, persistent follow-ups, and redacted
HTML/JSON exports. The six MCP tools are implemented in `server/schemas.ts` and
`server/service.ts`; the web host calls them through the SDK's actual HTTP client
in `server/mcp.ts`, not by invoking service methods directly.

Local conversation mode is a limited deterministic command interpreter, not an
LLM. Browser speech recognition and speech synthesis are optional; text and form
controls remain available. Browser recognition may process audio through the
browser vendor's service. Recognition availability varies by browser.

Explicit recording commands open a review form with the original wording and
conservative role/channel/situation suggestions. No source date is extracted or
guessed from speech. Ambiguous fields must be reviewed, and saving requires a
fresh confirmation after any edit. Questions and negated commands do not create
local reminders or drafts. Local reminder creation accepts explicit wording such
as `Remind me tomorrow`; it does not resolve arbitrary natural-language dates.

Follow-ups are persistent due items shown in the workspace. They do not send
messages, OS notifications, or start autonomous chasing while the app is closed.

## Intended Scope

Help users maintain a source-backed repair history, identify unanswered
questions, and complete approved follow-ups across organisations.

Supported reported situations include paperwork clarification, funding questions
and coverage refusals, unavailable parts or technicians, professional-assessment
requests, appointment delays, unanswered requests, and temporary-equipment
questions. They share one coordination workflow; the software does not remove
the physical, staffing, coverage, or communication barrier itself.

The shared workflow is:

Capture evidence -> review interpretation -> prepare a request -> approve
and send -> track the response -> export a redacted case history.

## Alexa+ Track

An independently built voice/text web simulator connected to a self-hosted
MCP server using Streamable HTTP and protocol version 2025-11-25 or later.
Native Alexa+ integration is not assumed or claimed. Entrant access limitations
and the own-simulator route are described in the
[official FAQ](https://amazonappdev2026.devpost.com/details/faqs).

## Optional Integrations

Copy the example configuration to your local `.env` using your editor, or set
environment variables in your shell. Never commit credentials.

- Email: `MAIL_MODE=capture` is the default. Approval captures the exact message
  locally; **nothing is delivered**. For actual delivery, configure
  `MAIL_MODE=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and SMTP credentials.
  Confirm the recipient address in Contacts. SMTP uses TLS; a provider acceptance
  is not proof of receipt. Uncertain sends are recorded as `unknown` and are not
  automatically retried. Test with an address you control first.
- AWS: set `AGENT_MODE=bedrock`, `AWS_REGION`, and an enabled tool-capable
  `BEDROCK_MODEL_ID`. Use the SDK credential chain. This path calls Bedrock
  Converse with tool schemas discovered from the real MCP server. It requires
  explicit case-sharing consent and may incur AWS charges. An AWS account,
  accessible model, and credits are not supplied by this project. Live Bedrock
  execution has not been verified without credentials.
- External MCP clients: set an independent `MCP_TOKEN` and connect with
  `Authorization: Bearer <token>`. The built-in web host creates a private random
  token when none is set. A token is not permission to send: external messages
  require a separate short-lived approval issued by the user-session host.

Cloud tools are restricted by the recognized request: reading, preparing a draft,
managing a follow-up, or exporting. Unrecognized requests are read-only. Evidence
recording and delivery remain trusted user actions. Repeated equivalent writes
reuse one idempotency key within a model conversation. If the model fails after
saving an action, the assistant returns the saved draft handle and successful
traces rather than claiming nothing happened or silently retrying.

## Verify

```sh
npm run typecheck
npm test
npm run build
npm run test:browser
```

Browser tests expect a running app on port 4317 and Microsoft Edge. Set
`TEST_BASE_URL` for another port; select another installed Playwright browser
channel in `playwright.config.ts` when necessary. Screenshots and traces are
ignored local test artifacts. Tests use isolated databases or temporary fictional
cases, never send external email, and never call Bedrock.

Bedrock response sequences and browser speech recognition are simulated in
regression tests. These check application behavior, not real model quality,
recognition accuracy, microphone hardware, AWS access, or provider delivery.

## Hosting

`Dockerfile` builds a single-instance deployment with a persistent `/data`
volume. Production/public binding refuses to start without an `APP_PASSWORD`
of at least 16 characters, a separate `MCP_TOKEN` of at least 32 characters, and
an HTTPS `PUBLIC_ORIGIN`. Terminate HTTPS at a reverse proxy. SQLite requires a
persistent disk; an ephemeral/serverless filesystem is not suitable as-is.

This is a shared-password MVP, not tenant-isolated OAuth account linking. Do not
deploy it publicly with real health data without additional security review,
encryption, access controls, operational policies, and user testing.

## Boundaries

- No mechanical diagnosis or medical advice.
- No automatic funding decisions or legal-deadline determinations.
- No guaranteed repair, provider response, booking, or temporary equipment.
- Outbound messages require approval of the exact recipient and content.
- Development scenarios will be labelled fictional; no real health records
  or credentials belong in this repository.

## Submission Materials

See `docs/demo-script.md`, `docs/friction-log.md`, `docs/architecture.md`, and
`docs/submission-checklist.md`. No user validation, measured repair-time savings,
native Alexa+ availability, AWS bonus qualification, or win is claimed.
