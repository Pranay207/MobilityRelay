# MobilityRelay

An independently built simulated Alexa+ experience for wheelchair users and
caregivers, backed by a real self-hosted MCP server over Streamable HTTP.

When a supplier reports sending an estimate and an insurer reports not locating
it, MobilityRelay keeps both attributed reports visible, asks what remains
unanswered, and prepares a source-backed follow-up for the user to approve.
It does not assign blame or claim to reduce repair times. The intended benefit
is a clearer record and less administrative effort; that benefit still needs
user validation.

## Problem Evidence

A study published in March 2025 surveyed 301 wheelchair users with spinal cord
injury at nine SCI Model Systems Centers. In that sample, 14% reported none of
their necessary repairs were completed, the median elapsed time before repair
was 14 days, and vendor noncompletion after contact was the most common reported
reason for incomplete repairs. These findings establish a repair-process problem,
not that this app fixes it. They are not population estimates for all wheelchair
users, India-specific results, or a 2026 survey.
[Study abstract and publication details](https://pubmed.ncbi.nlm.nih.gov/39427781/).

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

Recognition is cancelled when submitting a message, opening a review dialog,
leaving the conversation, or hiding the browser tab. Late callbacks from an old
recording are ignored. Spoken replies are opt-in for new responses; enabling
speech does not replay saved conversation history. Review dialogs and tab hiding
stop playback. Case loading discards chat responses for a previously selected case.

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

The conversation pane is explicitly labelled an Alexa+ experience simulator.
Spoken or typed requests reach our Express host, which uses the official MCP SDK
client to initialize, list tools and call them over HTTP. Successful calls are
visible in conversation traces; case records, drafts and follow-ups persist in
SQLite. This is a simulation of the customer workflow, not a clone of Alexa+'s
full language capabilities, voice, branding or device integration.

### Mapping to Native Alexa+

Conceptually, a native Alexa+ client would replace the web simulator/Express
conversation host as the caller of the MCP tools. The trusted approval boundary
would still need a user-review surface and authenticated confirmation. Actual
onboarding also needs partner access, a remote endpoint, and the OAuth 2.1/PKCE
and discovery metadata described in the
[Alexa+ MCP quickstart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html).
Our bearer-token/shared-password MVP does not implement that native account
linking or claim certification. The quickstart's sub-500 ms query target is a
native integration requirement; our local timing checks are not proof of native
or hosted compliance, and do not cover Bedrock generation or SMTP delivery.

## Optional Integrations

Copy the example configuration to your local `.env` using your editor, or set
environment variables in your shell. Never commit credentials.

### Local AI Without an AWS Account

Install [Ollama](https://ollama.com/) separately, then run:

```sh
ollama pull qwen2.5:1.5b
npm run dev:ollama
```

Open http://127.0.0.1:4318. This demo uses a separate fictional database in
`.data/ollama-demo` and always captures email locally; it never delivers it.
For the normal server, set `AGENT_MODE=ollama`,
`OLLAMA_BASE_URL=http://127.0.0.1:11434`, and `OLLAMA_MODEL=qwen2.5:1.5b`.
The adapter accepts loopback HTTP only and rejects cloud-tagged model names.
Model weights are downloaded separately and carry their own license.

The model calls discovered MCP tools through the same bounded host as Bedrock.
It receives a short, same-case conversation history, not authority to record
evidence or send messages. Prepared message content comes from the repair
service's attributed sources, not unrestricted model-generated claims.
Reminder creation cannot turn into cancellation or editing by the model.
Contact/question references are short and case-scoped; the host resolves them to
real IDs and restricts explicit draft topics. Confirmations and direct sending-status
questions use actual MCP state rather than model guesses.
Natural-language replies can still be wrong. Speed and quality depend on the
model and hardware; a successful test is not a general accuracy guarantee.
Local model inference does not make browser speech recognition private:
recognition may still use the browser vendor's service.

```sh
npm run test:ollama
npm run test:ollama:ui
```

This opt-in check calls the actual running local model, the real HTTP MCP tools,
and an isolated fictional in-memory database. Its ignored report is written to
`.data/verification/ollama-live.json`. It does not deliver email or validate
user benefit. Normal regression tests do not require a model download.
The UI check additionally uses installed Edge and an isolated fictional server
to verify real AI draft review and mobile conversation persistence; it never
approves or sends a message. Both checks also pass on 2026-10-14 after QA fixes.
The final CPU run took roughly 22 seconds to explain, 31 to draft and 21 to
export; the separate browser draft took 16 seconds. Earlier runs reached
47-55 seconds. This is not real-time voice latency or a speed guarantee.
See `docs/judging-evidence.md` for failures, mitigations and evidence limits.

### Email and Amazon Bedrock

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

Model tools are restricted by the recognized request: reading, preparing a draft,
managing a follow-up, or exporting. Unrecognized requests are read-only. Evidence
recording and delivery remain trusted user actions. Repeated equivalent writes
reuse one idempotency key within a model conversation. If the model fails after
saving an action, the assistant returns the saved draft handle and successful
traces rather than claiming nothing happened or silently retrying.

## Verify

The [2026-10-14 QA report](docs/qa-report-2026-10-14.md) records reproduced
bugs, fixes, final test results, observed latency and unverified integrations.

```sh
npm run typecheck
npm test
npm run build
npm run test:browser
```

Browser tests start their own non-watching server on port 4319 with a fresh
fictional database and stop it afterwards. Microsoft Edge must be installed.
Set `TEST_PORT` if that port is occupied, or `TEST_BASE_URL` to explicitly test
an existing server. Select another installed Playwright browser channel in
`playwright.config.ts` when necessary. Screenshots and traces are ignored local
test artifacts. Regression tests never send external email or call Bedrock.

Bedrock/Ollama response sequences and browser speech recognition are simulated
in regression tests. These check application behavior, not real model quality,
recognition accuracy, microphone hardware, AWS access, or provider delivery.

### Manual Voice Check

Use a fictional case only. Browser recognition may process audio through the
browser vendor; do not dictate real health records during testing.

1. Open a fictional case in Edge or another browser with speech recognition.
   Start voice input and grant microphone access only if you agree to it.
2. Say `What is the next step?`, then send the recognized text. Check the reply
   against the case's open questions and inspect its successful MCP trace.
3. Enable spoken responses. Existing replies should not be read aloud. Repeat
   the question, confirm the new reply is audible, and check that muting stops it.
4. Say `Record: the supplier said by phone that the replacement part is delayed.`
   Review the proposed fields and report date. Nothing should be saved until
   you explicitly review and submit the form. Cancel if the transcript is wrong.
5. Say `Prepare a request to the supplier.` Review the draft and its cited
   sources. In capture mode, approval must show local capture, not delivery.
6. Say `Remind me tomorrow.` Confirm exactly one new follow-up, reload, select
   the same case, and check that it persists with the displayed time zone.

Also deny microphone permission once and confirm that typed messages still work.
Start recording and open a review dialog (on mobile, close Relay first). Confirm
the microphone stops and no later transcript appears in the form or composer.
Repeat with tab hiding and case switching; check that playback stops and the new
case does not show or speak the previous case's conversation.
These are manual checks to perform, not claims that hardware testing has passed.

## Hosting

Hosting is optional for the Alexa+ hackathon path: the
[official FAQ](https://amazonappdev2026.devpost.com/details/faqs) accepts a locally
runnable repository and functioning demo video. A public deployment could make
review easier, but is not live yet and must use fictional data only for this MVP.

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
`docs/submission-checklist.md`. The four judging criteria and remaining evidence
are mapped in `docs/judging-evidence.md`; the fictional task-testing protocol is
in `docs/validation-protocol.md`. No user validation, measured repair-time savings,
native Alexa+ availability, AWS bonus qualification, or win is claimed.
