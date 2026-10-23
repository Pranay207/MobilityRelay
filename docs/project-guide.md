# MobilityRelay Project Guide

Everything about the project is kept here: what it does, how it works, how to
run it, what has been tested, and what remains before submission.

Jump to: [Problem](#1-the-problem-and-our-solution) |
[Setup](#2-run-the-project) | [Technical approach](#3-technical-approach) |
[Testing](#4-testing-and-latest-results) | [Remaining work](#5-remaining-work-and-submission) |
[Demo](#6-demo-script-target-245) | [Product feedback](#7-product-feedback-and-friction-log).

## At a Glance

**MobilityRelay helps wheelchair users and caregivers keep track of a stalled
repair and prepare a clear, evidence-backed follow-up.**

It is an independently built **Alexa+ experience simulator** with a real
self-hosted MCP server. It is not a native Alexa+ skill or certified integration.

| Question | Short answer |
| --- | --- |
| Who is it for? | Wheelchair users, caregivers and their chosen advocates. |
| What problem does it address? | Repair updates are scattered across calls, emails and organisations; the user has to remember what was said and chase missing information. |
| What works now? | Case records, source-quoted reply review with before/after changes, unanswered questions, fresh source-backed drafts, exact-message approval, local capture, follow-ups and HTML/JSON export. |
| Is MCP real? | Yes. The web host initializes, discovers and calls six tools over HTTP using the official MCP SDK. |
| Is AI real? | Optional local Ollama inference has been tested. Default local mode is a limited command interpreter, not an LLM. |
| What is not verified? | Native Alexa+, live Bedrock, real SMTP delivery, physical microphone accuracy, broad audio/accessibility compatibility, public hosting and independent user benefit. The creator reported hearing a reply after the speaker fix; this is a narrow playback check. |
| Does it guarantee a repair or a win? | No. It coordinates information; it cannot force an organisation to act. |

## 1. The Problem and Our Solution

Example: the supplier says an estimate was sent; the insurer says it cannot
locate it. Neither statement alone tells the user what to do next.

MobilityRelay keeps both dated reports visible and asks: **Was the estimate
received, and what reference can confirm that?** It does not decide who is lying.
The user can prepare a follow-up quoting the recorded sources, review it,
approve it, schedule a next check, and export the history for an advocate.

A March 2025 study surveyed 301 wheelchair users with spinal cord injury at
nine SCI Model Systems Centers. In that sample, 14% reported none of their
necessary repairs were completed; median elapsed time before repair was 14
days. Vendor noncompletion after contact was the most common reported reason
for incomplete repairs. These are sample findings, not estimates for all
wheelchair users or India, and not evidence that our app improves outcomes.
[Study abstract](https://pubmed.ncbi.nlm.nih.gov/39427781/).

Existing suppliers already offer repair workflows. Our proposed advantage is a
user-maintained, cross-party history and reviewed follow-up, not a claim that
repair tracking is new or that this approach is globally unique.
[Example supplier workflow](https://www.nsm-seating.com/service-repair/).

### Existing Options and Our Testable Difference

Public product documentation reviewed **October 23, 2026**. These are documented
capabilities, not hands-on accounts or a complete market census. "Not documented"
does not mean a feature is absent. Supplier-connected information can be more
authoritative than our manually entered reports.

| Existing Option | What Its Own Documentation Describes | Boundary of Our Comparison |
| --- | --- | --- |
| [myNumotion](https://www.numotion.com/about-mynumotion-app) | Order information, notifications, service requests, appointments, estimates, invoices and live chat. | Tracking and communication already exist. The cited overview does not establish whether it supports our exact cross-party reply-review and stale-draft workflow; that is unknown, not a claimed missing feature. |
| [NSM / MyNSMOrder](https://www.nsm-seating.com/stay-connected/) | Text updates and order status/details, accessed with work-order ID and last name. | We are not a replacement for the supplier's system. Its overview is not evidence for or against user-owned reconciliation across multiple organisations. |
| [MyPermobil](https://www.permobil.com/en-gb/permobil-produkte/elektrorollstuehle/functions/mypermobil) | Battery, distance and seat-use information, with remote chair data available to the service centre. | Connected equipment diagnostics are valuable and outside our scope. We have no equivalent live chair data or remote repair capability. |
| [CareSource's Alexa skill](https://www.caresource.com/oh/members/tools-resources/caresource-amazon-alexa-skill/medicaid/) | Account-linked questions about benefits, refills, care-manager contacts and related support. | Healthcare voice access is not new. This is an advertised Alexa skill, not a verified Alexa+ MCP repair-workflow integration; current device behaviour was not tested. |
| [Solace advocates](https://www.solace.health/contact-us) | Human help coordinating care, organising records, following up and resolving insurance problems. | People already perform cross-party coordination. MobilityRelay is a bounded record/follow-up aid, not a substitute for an advocate's expertise, authority or relationships. |
| [ProPublica Claim File Helper](https://projects.propublica.org/claimfile/) | A customisable letter requesting the records used for an insurance denial. | Evidence-request letters already exist. Our coverage-refusal question is not a legal claim-file request or an appeal service. |
| Notes and email | A person can manually retain reports, compose messages and assemble a handover. | This is the practical baseline to test. We do not assume that a dedicated app is faster or easier for every person. |

**What we can demonstrate in our own implementation:** retain both dated
reports -> ask for missing receipt information -> quote a reply for user review
-> answer receipt without answering authorization -> block approval of the old
draft -> prepare a fresh follow-up -> export the attributed history. This is a
specific workflow claim supported by tests, not proof that competitors lack it.

The proposed benefit is less reconstruction and fewer stale/unsupported
follow-ups. It remains a hypothesis until an independent person attempts an
equivalent task with notes/email and with the app. No measured time saving,
shorter repair, clinical outcome, worldwide novelty or winning probability is
claimed.

Targeted public searches included `wheelchair repair MCP`, GitHub wheelchair
repair/MCP queries, Alexa wheelchair repair skills and the official MCP Registry.
This limited scan did not establish an exact equivalent; it cannot inspect
private projects, unindexed skills, unreleased products or every registry entry.
[Official MCP Registry](https://registry.modelcontextprotocol.io/).

**Submission wording:** "MobilityRelay demonstrates a user-maintained,
source-backed wheelchair-repair coordination workflow through six real MCP
tools. It preserves disagreements as questions, requires reviewed answers and
fresh message approval, and produces a handover history."

### The User Journey

1. Create a case and add supplier/insurer contacts.
2. Record what someone said, when, through which channel and from which source.
3. Review the recorded situation and its unanswered questions.
4. Prepare a request using those sources; check recipient and wording.
5. Approve the exact message. Default mode captures it locally, not by email.
6. Track a follow-up, record a response or correction, and export the case pack.

Overview puts the current unanswered question and **Prepare a request** ahead of
supporting reports. Expand **Reported paperwork updates** or **Recent evidence**
when needed; **Evidence** always retains the full history. The compact case
header keeps the record readable without taking over the first screen. Relay
fits the remaining desktop height, with its message input fixed inside the
panel. Export and record-update commands use download/plus icons with accessible
names and tooltips; review reply remains a labelled command. The sidebar keeps
the selected case visible within its own list. On tablet/mobile or short windows,
the labelled **Relay** button opens the conversation in a dialog. Chat scrolling
stays inside the conversation; its empty state is simply **No messages yet**.

The case workspace appears without waiting for chat history. Settings and the
case list load together; Relay shows **Loading conversation...** until history
is ready. Its speech controls initialize with that history so it is not treated
as a new spoken response. History errors leave the loaded case visible.

Exported histories label obsolete unsent requests **Stale draft**, retain their
original wording and explain that fresh review is needed. HTML links use the
same numbered sources as the workspace and lead to attributed-history entries;
corrections link to their original source. Record IDs remain available for
provenance. JSON keeps the original message `status` and adds `stale`,
`displayStatus` and readable `sourceLabels`; export does not change stored data.
Reviewed-answer text also uses readable source numbers in Overview and HTML,
with a direct source link in Overview. Only the service-generated answer footer
is formatted; quotations and manually entered answers are not rewritten. JSON
retains `answer` and its source ID and adds `displayAnswer`. Technical event IDs
are available under **Record details** in the workspace and HTML.

New request drafts use recipient-facing questions for all twelve administrative
question kinds. Workspace instructions remain beside the question in the app,
not in the generated request. The original attributed reports are still quoted
verbatim. Existing drafts, user-edited wording and message hashes are not
rewritten; every new or edited draft still requires exact-message approval.

### Review a Reply: What Changed?

Use **Review reply**, or say/type **"The insurer replied: We received the
estimate. Reference AB-47. Authorization is still pending."** The conversation
opens a review form; it does not save evidence or answer a question. Confirm
the source role/name, channel, report date and reply text. Add AB-47 as the reply
reference if appropriate; references are not extracted automatically.

Preview shows the original text, exact supporting quotation, before/after stage,
unanswered questions and drafts that will require fresh review. Answer selections
start unchecked. Select the receipt answer and confirm the review to save. In
the example, receipt is answered but authorization remains pending. With no
answers selected, only the attributed reply is recorded.

The persistent **What changed?** section links to the reply and shows the
historical review result. **Prepare next request** uses current open questions.
Old drafts remain in history with stale approval blocked; **Prepare fresh draft**
opens current question/recipient selection instead of reusing old wording.

Recognition is deliberately narrow: an affirmative insurer sentence such as
"We received the estimate." can propose a receipt answer; explicit pending
authorization can suggest that situation. A supplier reply such as **"Your
repair appointment is confirmed for 2026-10-28 at 14:30 UTC+05:30."** can propose
an answer to an existing open visit-date-and-time question. The exact quotation
is shown; nothing is selected or saved automatically. Use a valid calendar
date, 24-hour time and explicit UTC offset, with the visit after the report time.
An optional `Reference VISIT-47.` sentence is accepted, but references still
need manual entry in the reference field. This is intentionally a strict format,
not general natural-language scheduling or a calendar integration.

Appointment time and parts/accessibility readiness are separate questions.
Confirming time does not answer readiness, authorization or repair completion.
A first appointment report creates those open questions; answering a newly
created question uses the existing manual review form. Automatic answer proposals
only target existing open questions. Older replies cannot answer a newer visit
question. Corrections to the answer source reopen it; old draft approvals remain
blocked after the case changes.

Negated, conditional, conflicting, wrong-party, missing-time-zone, unsupported
and ambiguous wording proposes no answer. Other reply kinds can be
logged without answering anything, or answered with the existing manual review
form. This is not general email NLP, autonomous inbox ingestion or independently
verified receipt or appointment. Source text is always treated as data, never permission.

Supported situations include missing paperwork, coverage refusals, unavailable
parts or technicians, assessment requests, appointment delays, ignored requests
and temporary-equipment questions. All use this same coordination workflow.

We can request a written coverage reason, availability, a professional assessment
or a loaner-chair discussion. We cannot approve insurance, supply missing parts,
repair a chair, guarantee equipment suitability, force a response, diagnose a
fault, or make medical/legal decisions. Faster repairs and reduced effort are
intended benefits, not measured results.

## 2. Run the Project

Requires **Node.js 24+ and npm**. Use fictional data only.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4317**. One process serves the workspace and `/mcp`.
Five labelled fictional cases are seeded only when the database is empty.
Records persist in ignored `.data/mobilityrelay.sqlite`.

On Windows, if installation fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, set
`NODE_USE_SYSTEM_CA=1` in the shell and retry using the OS trust store. Do not
disable TLS verification.

### Optional Local AI

Install [Ollama](https://ollama.com/) separately, then:

```sh
ollama pull qwen2.5:1.5b
npm run dev:ollama
```

Open **http://127.0.0.1:4318**. This demo uses a separate fictional database in
`.data/ollama-demo` and always captures messages locally. Model weights are not
in the repository and have their own license.

For the normal server, set `AGENT_MODE=ollama`,
`OLLAMA_BASE_URL=http://127.0.0.1:11434` and `OLLAMA_MODEL=qwen2.5:1.5b`.
Only loopback HTTP is accepted; redirects and cloud-tagged models are rejected.

### Configuration

Use `.env.example` as the configuration reference. Keep credentials in a local
ignored `.env` or environment variables, never in Git.

| Option | Purpose and current status |
| --- | --- |
| `AGENT_MODE=local` | Default limited deterministic commands; no AWS account or model required. |
| `AGENT_MODE=ollama` | Actual local AI with tested fictional MCP workflows. Responses can still be wrong or slow. |
| `AGENT_MODE=bedrock` | Optional AWS Converse adapter; set `AWS_REGION` and an enabled `BEDROCK_MODEL_ID`, use the SDK credential chain and explicit case-sharing consent. May incur charges; live execution remains unverified. |
| `MAIL_MODE=capture` | Default. Stores the approved message locally; nothing is delivered. |
| `MAIL_MODE=smtp` | Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` and credentials. Test an inbox you control. SMTP acceptance is not proof of receipt; live delivery remains unverified. |
| `MCP_TOKEN` | Independent bearer token for external MCP clients. Sending still needs separate user approval. A private random token is generated for the built-in host when unset. |

### Gmail Connection and Inbox Test

SMTP uses the same validated, TLS-required settings for the app and the
connection-only checker. No connection check sends a message or proves that a
particular sender is allowed, a recipient received it, or a repair progressed.

1. In your ignored `.env`, set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`,
   `SMTP_SECURE=false`, `SMTP_USER` and `SMTP_FROM` to your sender address, and
   `SMTP_PASSWORD` to a Google App Password. Google requires 2-Step Verification
   for App Passwords, and some managed/protected accounts cannot use them.
   Do not use your normal Google password or paste credentials into chat.
2. Keep `MAIL_MODE=capture`, then run `npm run mail:verify`. This checks the
   connection, required TLS and configured login without sending. Missing or
   invalid settings fail before connecting; provider errors are sanitized.
3. Only after a successful check, set `MAIL_MODE=smtp` and
   `DATA_DIR=.data/smtp-test` for an isolated fictional inbox test. Restart with
   `npm run dev` and open the configured port (4317 by default). Both
   `npm run dev:ollama` and Compose deliberately force capture mode; neither is
   the SMTP test launcher. For inference, set `AGENT_MODE=ollama` in `.env` and
   still use the normal `npm run dev` launcher.
4. In a fictional case, add an inbox you control under Contacts, confirm the
   actual address with the verification checkbox, and select it for a fresh
   draft. Seeded `.example` addresses are blocked from external sending.
   Review the exact recipient/content and use **Approve & send** once.
5. Check the received message and spam folder manually. Record provider
   acceptance and observed receipt separately; an `SMTP accepted` status is not
   proof of receipt. If the app reports an unknown outcome, check the inbox and
   provider before attempting another message. There is no automatic retry.
6. Return to `MAIL_MODE=capture` after the test. Never commit `.env`, private
   logs, raw provider responses or credentials. Revoke an unused App Password.

Port 587 uses required STARTTLS, not plaintext delivery. Port 465 requires
`SMTP_SECURE=true`; certificate checks stay enabled. A successful connection
check does not enable sending. Live Gmail acceptance and inbox receipt remain
unverified until this controlled test actually succeeds.
[Google App Passwords](https://support.google.com/accounts/answer/185833?hl=en),
[Nodemailer verification and TLS](https://nodemailer.com/smtp).

### Hosting

The project's recorded [hackathon FAQ](https://amazonappdev2026.devpost.com/details/faqs)
permits a locally runnable repository and functioning demo; public hosting is
not a main-track prerequisite. Recheck the official rules before submission.

A public demo can make review easier, but it has not been deployed or TLS-tested.
Use fictional data. Production/public binding requires an `APP_PASSWORD` of at
least 16 characters, a separate `MCP_TOKEN` of at least 32 characters and an HTTPS
`PUBLIC_ORIGIN`. Terminate TLS at a reverse proxy. The Dockerfile targets one
instance with a persistent `/data` volume; an ephemeral serverless filesystem
does not suit this SQLite deployment as-is. The app image now passes an isolated
Linux-container smoke test; the complete Ollama Compose stack and public TLS
still need end-to-end validation.

This is a shared-password workspace, not a tenant-isolated healthcare system.
Do not host real sensitive records without further security review, encryption,
access controls and operational policies.

### Docker and Local AI

The app image does not include a model server. `compose.yaml` supplies a pinned
Ollama service and model-initialization task. The app shares that service's
network namespace, so `127.0.0.1:11434` reaches Ollama without weakening the
adapter's loopback-only origin check. Ollama's API is not published. Only the
app's port is bound to host loopback. See
[Compose network modes](https://docs.docker.com/compose/how-tos/networking/) and
[Ollama Docker setup](https://docs.ollama.com/docker).

1. Configure a unique `APP_PASSWORD` (16+ characters), a separate random
   `MCP_TOKEN` (32+ characters), and your reverse proxy's actual HTTPS
   `PUBLIC_ORIGIN` in your environment or ignored `.env`.
2. Build with `docker build -t mobilityrelay:local .`.
3. Run `docker compose up -d --no-build`. The first run downloads the pinned
   Ollama image and `qwen2.5:1.5b`; this can require several GB and is not instant.
4. Connect your existing HTTPS reverse proxy to `127.0.0.1:4317`, then open
   `PUBLIC_ORIGIN`. Set `RELAY_HOST_PORT` if host port 4317 is occupied.
5. `docker compose down` stops the stack without deleting its named model/case
   volumes. Do not add `-v` unless you intend to permanently delete those records.

This is not public hosting or an included TLS proxy. Plain HTTP is not the
supported production login route: production cookies are Secure. Use fictional
data only. Capture mode is enforced in Compose. No complete containerized-model
run or cloud deployment is claimed yet.

For an independently testable app image, run:

```sh
npm run test:container -- mobilityrelay:local
```

The verifier uses a fresh named volume, an unprivileged app process, an
unpublished network-isolated container, fictional records, a nondefault port,
and capture-only mail. It checks authentication, real MCP, approval, production
assets, health and persistence, then removes only its own container/volume.
It does not call a real model or test public TLS.

A container may not trust the same corporate/local inspection certificates as
its host. Do not disable verification. Export the **already-trusted public CA**
to a local PEM file and build with:

```sh
docker build --secret id=npm_ca,src=/path/to/trusted-ca.pem -t mobilityrelay:local .
```

The optional BuildKit secret is used by `NODE_EXTRA_CA_CERTS` during `npm ci`
only, not copied into the runtime image. No private key is required. Only use
a CA your organisation/machine already trusts. On the tested Windows host,
the normal build reproduced `UNABLE_TO_VERIFY_LEAF_SIGNATURE`; the build-only
trusted-root bundle succeeded with TLS verification enabled.
[BuildKit secrets](https://docs.docker.com/build/building/secrets/).

## 3. Technical Approach

```text
Voice or text in React
  -> authenticated Express conversation host
  -> official MCP SDK client over HTTP
  -> /mcp: validated tools
  -> repair service
  -> SQLite + local capture or optional SMTP
```

| Layer | Technology |
| --- | --- |
| Interface | React, TypeScript, Vite, Lucide icons, optional browser speech APIs |
| Host | Node.js 24+, Express, session authentication and CSRF protection |
| MCP | Official TypeScript SDK, Streamable HTTP, protocol `2025-11-25` tested |
| Data | Built-in Node SQLite; cases, evidence, contacts, questions, drafts, follow-ups and chat |
| Validation | Strict Zod schemas, deterministic workflow rules |
| Optional inference | Ollama `/api/chat` or AWS Bedrock Converse |
| Optional email | Nodemailer SMTP; capture is the default |
| Testing | Node tests, Playwright with Edge, axe accessibility checks, actual local-AI verification |

### Six Real MCP Tools

Exact schemas are in `server/schemas.ts`; business rules are in
`server/service.ts`; the HTTP client is in `server/mcp.ts`.

| Tool | Main inputs | Result and boundary |
| --- | --- | --- |
| `record_repair_event` | Case, request ID, party, source, channel, report date, statement, situation, optional correction link or `replyReview` | Appends an attributed update. Reviewed replies can atomically answer selected source-backed questions; explicit confirmation is required. |
| `get_repair_brief` | Case ID | Reads history, questions, drafts and follow-ups. An unanswered question is not proof of fault. |
| `prepare_repair_request` | Case, request ID, recipient, question IDs | Persists a source-backed draft; does not send it. |
| `send_approved_request` | Case, draft ID, approval token | Attempts the exact approved message. No valid approval means no send; capture is not delivery. |
| `manage_repair_followup` | Case, request ID, action, relevant item/question, title, time and timezone | Creates, reschedules, completes or cancels a due item. No background messaging. |
| `export_repair_packet` | Case, HTML/JSON format, redaction setting | Returns an attributed case packet. Assistant exports always use known-identity redaction. |

The server is stateless, with one server/transport per POST and JSON responses.
Optional GET subscriptions return 405; this is not SSE streaming. An
`on-headers` hook ensures Node-generated chunk framing across success,
notification and error responses. Independent wire tests cover this behavior.
Host/Origin checks and bearer authentication protect `/mcp`.
[Transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
[official SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x).

### Reply Review Implementation

`POST /api/replies/preview` requires the authenticated session and CSRF token.
It reads the case through real MCP `get_repair_brief`; the host also supplies
retained question history so reactivated questions keep their existing order.
`server/replies.ts` clones the case into an in-memory Store and applies the
existing question rules there. Preview does not write case data or send mail.

The save uses the existing MCP `record_repair_event` with optional `replyReview`
(expected version, source/candidate hash, selected question IDs and explicit
confirmation). The service recomputes permitted candidates and rejects stale,
changed, duplicate, unsupported or cross-case selections. Evidence, selected
answers and a safe review summary commit in one SQLite transaction. Nested
operations use savepoints; a failure rolls back all changes and retry keys.
An identical request ID/payload returns the original result, not another event.

The saved question links to the exact source; correcting that source reopens
the answer. Draft case-version checks invalidate old approvals. The assistant
cannot call the evidence tool, so voice can open review but cannot commit it.
No new cloud/model call, library, seventh MCP tool or automatic message is added.

### AI Is Bounded; Actions Are Reviewed

- Whole-request supplier/insurer report queries read the current MCP brief without inference. They quote the latest non-superseded report by occurrence time, with stable source number, source name, channel and UTC date. Long text is explicitly an excerpt. Comparing reports never establishes fault; absent reports are stated as missing. Unsupported local questions no longer receive a generic status answer.
- Model-assisted operations in both AI modes discover the real MCP catalog. Supported status/next-step/follow-up reads and redacted HTML history exports call real MCP without inference in every mode. Exact whole-request matching keeps compound requests and different formats on their existing bounded path; there is no case-result cache.
- Exact draft commands such as "Prepare a request to the supplier about missing estimate reference" also use real MCP without inference in every mode. A closed topic list selects current questions; exactly one contact must match the explicit role. Missing/ambiguous matches do not guess a recipient or fall back to model execution. Source-backed wording and exact-message approval are unchanged. More complex wording still follows the bounded model path.
- Bedrock consent is enforced immediately before the model path. Local commands do not share case text or require cloud consent; a genuine model request without consent still receives 403. The composer lets the server decide rather than disabling all typed requests in Bedrock mode.
- The host injects the active case, restricts requested operations and resolves short case-scoped contact/question references to real IDs.
- The model cannot record evidence or send messages. Follow-up tools may create only, not edit or cancel existing items.
- Source-backed draft wording comes from the repair service, not arbitrary model-written subject/body claims.
- Supported `Remind me tomorrow` / next-day commands use the existing 24-hour rule in every agent mode. They confirm only after a successful MCP write; no model or cloud consent is needed for this local operation.
- Read interpretation initially receives only the reported stage, up to 15 open question references/titles/kinds, available report parties and omitted counts, not full source quotations or contact details. Up to six same-case messages, each capped at 500 characters, are included only for referential reads without an explicit topic; old conversations must not override a new question. Other bounded tool summaries can contain up to 12 current sources, ten contacts, five request statuses and eight follow-ups. Draft selection receives only scoped contacts/questions and omitted counts, not full reports or chat history; the service still uses actual reports to produce the reviewed message. This is not a complete AI case audit.
- The loop allows at most five turns/eight attempted tools. Bedrock call/conversation limits are 25/45 seconds; Ollama limits are 90/150 seconds. These are bounds, not speed guarantees.
- Equivalent writes share an idempotency key within a conversation. Provider failure does not silently switch modes or replay a write; a completed action retains its handle and trace.
- The first successful requested action immediately returns its trusted host confirmation, without another inference pass or further actions from that model batch. Delivery status and read replies use recorded state: read text is rendered from the latest structured MCP brief, not model outcome predictions. This is a bounded case assistant, not open-ended factual Q&A; general model accuracy is not established.
- `server/conversation.ts` validates read selections and renders the chosen reports, next step, saved follow-ups or an open question's explanation and dated sources. It never displays arbitrary model-written factual text. Ollama read interpretation uses `/api/chat` structured output with an explicit JSON schema and no model action tools; the actual MCP brief has already been read. Malformed/unknown selections ask for clarification. Bedrock's equivalent selection path is controlled-test-only, not live-verified.
- Read replies persist a case-version-bound focus with a question reference. A complete command such as "Ask the supplier for that reference" or "Draft a request to the insurer about that question" can prepare only that still-open question for an explicit, uniquely matched recipient. Changed, missing, cross-case, unrelated or ambiguous context opens manual selection; it cannot grant approval, send, record evidence or create a reminder. Earlier chats without focus metadata require a fresh read.
- Future-outcome questions about approval, arrival, responses or completion receive a deterministic limitation before inference. The assistant does not predict insurer or provider decisions.

The UI ignores refresh results/errors superseded by a newer action, selection
or refresh. This prevents a slow poll from hiding an already-saved reply or
follow-up; it does not cache or change the underlying case record.

The web host reuses one initialized MCP client and discovered tool catalog for
its lifetime. Concurrent first reads share negotiation. Only schema metadata is
cached: every case read still performs a real HTTP tool call and reads current
storage. The owned Undici dispatcher keeps non-pipelined, closed HTTP connections;
HTTP and tool-request deadlines renew for each operation. Initialization and
discovery are separately bounded. A domain rejection preserves the healthy client;
a transport/protocol failure invalidates it, and only a later request reconnects.
Shutdown closes the client and dispatcher. Standalone diagnostic clients remain
short-lived. There is no automatic write retry or global dispatcher replacement. Read-only
replies and read-only review proposals refresh chat without a redundant case
read; actual mutations and periodic synchronization still refresh case data.

### Privacy and Approval

Evidence corrections preserve the original source and link the replacement.
Questions use explicit reviewed situations, not semantic guesses about blame.
Dates are reported chronology, not verified facts or legal deadlines. New reports
can reopen a question; answering one is not recorded as a successful repair.

A draft digest binds recipient, subject, body, sources and case version.
Authenticated, CSRF-protected confirmation issues a hashed, single-use approval
capability valid for two minutes. The model never receives it. Sending atomically
consumes it and records the attempt; expired, changed, concurrent or replayed
approvals are rejected. Interrupted/uncertain sends remain `unknown` and are not
retried blindly. This is not an exactly-once email guarantee.

SQLite records are plaintext. Whole-case deletion cascades related records.
Assistant exports redact known identities; manual export has an explicit
unredacted option. Redaction is limited, not complete anonymization: review
before sharing. Development middleware blocks private storage, credentials and
keys, disables public-directory serving and keeps Vite caches outside case data.

Speech is optional and text/forms remain available. Recognition is cancelled
on submission, review, tab hiding, case switching and unmount; stale callbacks
are ignored. Spoken replies are opt-in. Enabling them explicitly reads the latest
assistant reply and then new replies; loading history alone remains silent.
Mute, recording, review boundaries and tab/case changes stop playback. Available
English voices are preferred, paused synthesis is resumed, and browser-reported
playback shows Speaking. If no start event arrives within six seconds, playback
is cancelled and a retryable error appears. Browser start events do not prove
that device volume is audible. Browser recognition may use a vendor cloud even
with local inference.
For latest supplier/insurer report reads and comparisons, optional `spokenText`
contains a brief source/date/user-recorded situation and uncertainty warning.
It is stored alongside the written conversation, not generated by an LLM.
It is not a paraphrase or verification of the report. The written reply still
quotes the reports (labelled excerpts when long); Evidence has the full text.
Other replies and older messages without this field retain their normal text
playback. No historical messages automatically replay.

### Alexa+ Track Boundary

The interface clearly says **Alexa+ experience simulator** and shows actual MCP
tool traces. It does not reproduce Alexa+'s full capabilities or claim native
onboarding. Conceptually, an Alexa+ client would replace our web caller; native
deployment would also need partner access, a remote endpoint, OAuth 2.1/PKCE,
discovery metadata and an appropriate trusted approval surface. Our bearer/shared
password prototype does not implement that account linking. Local timing does
not establish the native toolkit's sub-500 ms query target.
[Alexa+ quickstart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html).

## 4. Testing and Latest Results

### Submission-Day Implementation Audit: October 23

The current scope is a **working hackathon prototype**, not a production-ready
repair service or a proven real-world intervention. There is no defensible
single completion percentage across code, validation and submission.

| Area | Current Evidence | Remaining Limit |
| --- | --- | --- |
| Tech Implementation | Six real Streamable HTTP MCP tools; persistence, reviewed writes, exact-message approval, grounded conversation and exports; production build and 231/231 unit/integration tests pass. Actual Ollama read interpretation, the six-tool workflow and an earlier fresh production-container baseline passed. | General model accuracy is not established; complex inference may be slow. The latest client patch has not had a fresh image test. Native Alexa+, Bedrock, SMTP delivery and the full Ollama/HTTPS Compose stack are not live-verified. |
| Design | The complete post-fix Edge audit passed 142/142 in 15.5 minutes across desktop and mobile, with no failures, skips or whole-test retries. Focused startup, review and post-login regressions also passed. Earlier failed attempts remain below. | Read-only requests may retry once; connection-reset root cause is not conclusively isolated. Controlled speech is not physical microphone, screen-reader or independent usefulness validation. |
| Potential Impact | Sourced coordination problem and a complete fictional case from conflicting reports to reviewed follow-up and export. | No independent user study, measured benefit versus notes/email, or evidence of shorter repairs. |
| Quality of the Idea | Neutral cross-party records, source-backed questions and receipt-versus-authorization review form a coherent workflow. | Global uniqueness and a competition score are not established. |

### Submission Reliability Fixes: October 23

The subsequent complete rerun passed **127/130**, not a clean result. One
startup read timed out and its cleanup hit a reset; one persona failed during
an API fixture's session read; one voice-review form appeared after the
five-second assertion window. Its trace showed an unnecessary case read taking
**4,583 ms** before the form opened. These observations do not establish the
root cause of the intermittent connection resets. Retained report:
`.data/verification/browser-submission-recheck-2026-10-23.json`.

Changes made from those observations:

- GET connection failures retry once within the original ten-second deadline;
  HTTP errors, cancellation and writes are not automatically retried.
- Failed session/settings/case-list startup has an explicit recovery screen,
  not an apparently empty workspace. Recovery is read-only, including after
  login; case refresh waits for successful initialization.
- Read-only record/reply/recipient-selection proposals update conversation and
  open review without a redundant case reload. Actual mutations still refresh
  the case, and saving/sending still requires the existing user controls.
- Playwright fixture GETs allow one `ECONNRESET` retry using the supported
  `maxRetries` option. POST/DELETE requests, assertions and test timeouts are
  unchanged. This is a read-request retry, not a whole-test retry.
  [Playwright request options](https://playwright.dev/docs/api/class-apirequestcontext).

Two read-recovery unit tests failed before the change; all six API-helper tests
then passed, including no replay of an uncertain POST. Build/backend result:
**231/231 passed**, log
`.data/verification/check-submission-reliability-2026-10-23.log`.
The initial focused startup run passed **8/8**; the review/refresh run passed
**8/8**. A controlled post-login failure then reproduced a loading-state race
on both viewports. Gating case refresh on initialized workspace state fixed it;
the unchanged test passed **2/2 in 32.2 seconds**. The authentication response is
controlled in that UI test; real password/session enforcement has separate
backend coverage. Reports:

- `.data/verification/browser-startup-recovery-2026-10-23.json`
- `.data/verification/browser-review-recovery-2026-10-23.json`
- `.data/verification/browser-post-login-recovery-2026-10-23.json` (failed attempt)
- `.data/verification/browser-post-login-recovery-fixed-2026-10-23.json`

The complete post-fix suite passed **142/142 desktop/mobile checks in 15.5
minutes** on commit `2e8916d`, with **zero failures, skips, flaky tests or runner
errors**. Both projects had whole-test retries set to zero. The bounded
read-request retries described above remain enabled; this is not a claim of
zero network retries or a diagnosis of the original resets. Final report:
`.data/verification/browser-submission-reliability-final-2026-10-23.json`.

This run includes the full fictional case journey, all five fictional personas,
startup and post-login recovery, reviewed replies, stale approvals, persistence,
exports, keyboard focus, automated accessibility and controlled speech at
desktop/mobile sizes. It does not establish physical microphone accuracy,
independent user benefit, real email delivery or native Alexa+ access. The final
production build also passed; log:
`.data/verification/build-submission-reliability-final-2026-10-23.log`.

### End-to-End QA Audit: October 23

This pass used isolated fictional records. It did not change the Relay layout,
contact suppliers or insurers, deliver email, or modify the creator's existing
case history. The two fixes are separate commits: `60651d0` for the dependency
patch and `c5696d6` for timestamp handling.

**Chronology defect reproduced and fixed:** valid offset timestamps were sorted
as strings. For example, `2026-01-02T00:30:00+05:30` occurs before
`2026-01-01T23:30:00Z`, despite its later-looking date. This could select the
wrong current stage, reorder evidence or choose a later follow-up. The backend,
Evidence view, Follow-ups view and next-follow-up selection now compare actual
instants, using recorded time to break equal event times. Explicit UTC source
dates are normalized before labelling. Original evidence timestamps and already
reviewed draft bodies are preserved, not rewritten.

Four backend regression tests failed before the fix and pass afterward. The
new browser workflow also passed on desktop and mobile, exercising real MCP
writes, evidence ordering, stage selection, follow-up order, conversation after
reload and original timestamp preservation. Focused result: **2/2 passed in
36.1 seconds**; report:
`.data/verification/browser-offset-qa-2026-10-23.json`.

**Dependency audit:** `npm audit` identified one moderate transitive advisory in
`ip-address@10.7.3`. The compatible update to `10.7.4` changes only the lockfile;
the production audit and full audit including development dependencies then
reported **zero known advisories**. The registry initially failed certificate
verification on this host; enabling Node's system trust roots resolved it
without disabling TLS. The advisory concerns quadratic IPv6 zone parsing, not
an established exploit against MobilityRelay.
[Advisory GHSA-rxp7-6hxx-x8q5](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5).
Reports: `.data/verification/dependency-audit-patched-2026-10-23.json` and
`.data/verification/dependency-audit-all-2026-10-23.json`.

**Build and backend:** `npm run check` passed TypeScript, the production build
and **227/227 tests**, with no failures or skips. The security-fixture shutdown
logged a Vite dependency-scan cancellation warning; the run completed with exit
code zero. Expected private-file canary denials also appear in that log. Evidence:
`.data/verification/check-end-to-end-qa-2026-10-23.log`.

**Browser audit and recovery:** the complete 130-check run finished with
**123 passed and seven failed in 21.1 minutes**, without skips or automatic
retries. Failures affected the desktop new-case journey and mobile conversation
and five-persona journeys. Traces showed timing/refresh failures; a separate
desktop reproduction also timed out, but at a different UI action. The QA server
still answered a health probe in 293 ms. Low free memory and a stuck Docker
shutdown were observed, but their causal role is not established.

After finishing shutdown of the QA-started Docker instance and ending the
parallel isolated run, the affected journeys and their desktop/mobile
counterparts passed **14/14 in 2.8 minutes**, with no failures, skips, retries or
runner errors. No application code, assertions or timeout limits changed
between those attempts. A subsequent clean complete 130-check run has **not**
been completed; the focused success does not erase observed flakiness or prove
its root cause. Reports:

- Full attempt: `.data/verification/browser-end-to-end-qa-2026-10-23.json`;
  retained failure traces in ignored `test-results/`.
- Isolated attempt: `.data/verification/browser-isolated-journey-2026-10-23.json`.
- Focused recovery: `.data/verification/browser-end-to-end-recovery-2026-10-23.json`.

**Fresh production container:** built `mobilityrelay:qa-20261023` from the
Linux Node 24 base using a clean `npm ci` and production build. A trusted public
CA bundle was mounted only as a BuildKit secret; it was not copied into the
image. `npm run test:container -- mobilityrelay:qa-20261023` passed non-root
execution, custom-port health, anonymous access denial, authenticated real MCP,
unapproved-send rejection, private-file/build-secret exclusions and retained
records after restart. The disposable container had no external network or
published port and was removed with its QA volume. No messages were delivered.
Compose configuration validation passed, but the complete model/HTTPS stack
was not started. Evidence:
`.data/verification/container-end-to-end-qa-2026-10-23.log`.

**Actual local AI rerun:** all seven fictional conversation steps passed with
three real `qwen2.5:1.5b` inference calls and real Streamable HTTP MCP. The
interpreted comparison took **13,949 ms** end to end; the receipt and
authorization explanations took **1,785 and 1,639 ms**. The contextual draft
took **265 ms** without inference, and the export took **208 ms**. These are
development observations during QA, not a clean performance benchmark or a
general accuracy guarantee. No evidence was automatically saved or message
approved. Report:
`.data/verification/conversation-qwen2.5-1.5b-1792770302432.json`.

**Six-tool UI journey rerun:** the reviewed receipt answer left authorization
open, stale approval was blocked, a fresh reviewed request was locally captured,
one due item survived reload and a redacted HTML history was downloaded. All
six MCP tools were called, with no unexpected page/API failures. The scripted
wall task clock was **8,310 ms**, excluding setup and human reading or decisions;
this is not a human completion time, time saved or independent usefulness test.
Final fixture: five events, two drafts, one local capture, one due item and zero
delivered emails. Results and checked export:
`.data/verification/usefulness-end-to-end-qa-2026-10-23/`.

### Grounded Conversation and Audible Replay: October 23

The actual stored request `Compare the reports.` exposed an overly narrow
command matcher, even after punctuation recovery was installed. Short report
comparisons, "What did each side say?", and whole-request repair-delay questions
now use a current MCP read without inference. Negated, compound and extra-action
wording does not match these shortcuts. The Relay panel layout is unchanged.

Specific question explanations now use that question's title, authored
explanation and numbered/dated evidence. Model-assisted reads select a validated
view rather than being replaced by an unrelated generic status. A comparison
can be followed by "Ask the supplier for that reference"; the persisted focus
survives reload but becomes unusable after the case changes. Review and exact
approval remain necessary, and no conversational instruction authorizes delivery.

**Live failures retained:** the initial tool-enabled small-model attempt took
about 31.5 seconds and failed interpretation after an unnecessary invalid tool
request. The first structured attempt selected an invalid view/question pairing.
A later attempt answered an authorization question with the comparison view,
and the installed `qwen3:4b-instruct` model asked for clarification on the receipt
question while taking about 20.5 seconds for its first comparison. The small
model also selected a recorded question for a future approval request. No
generated prediction or automatic send reached the user: read text stayed
host-rendered. These are integration/model-choice observations, not proven
Ollama-runtime defects. Failed reports remain in ignored `.data/verification/`.

**Changes from those observations:** JSON-schema-constrained read selection
without model tools; smaller classification context; no irrelevant old report
text when the user names a new topic; and deterministic future-outcome refusal.
The warm `qwen2.5:1.5b` rerun passed all seven API steps: interpreted comparison,
contextual review-only draft, interpreted receipt explanation, interpreted
authorization explanation, future-outcome refusal, next-step read and redacted
HTML export. There were **three actual model calls**, taking **970, 857 and
803 ms end to end** in this run. The contextual draft took **103 ms**. This tiny
development sample is not a latency guarantee, unseen-utterance accuracy study
or user-benefit result. Report:
`.data/verification/conversation-qwen2.5-1.5b-1792767849734.json`.

The separate actual-model browser workflow passed: source-backed draft review
opened with approval disabled in **8,464 ms**; a mobile browser loaded the
persisted conversation without overflow or uncaught page errors. No message was
approved or delivered. Reproduce with running local Ollama and downloaded model:

```sh
npm run test:conversation
npm run test:ollama:ui
```

**Audio recovery:** enabling the speaker now replays the latest response.
Paused synthesis resumes; playback failures and a six-second silent-start
deadline leave the readable reply and offer retry. All 18 focused desktop/mobile
audio/report checks passed in 1.1 minutes, including mute, stale callbacks,
review boundaries and controlled no-start behavior. The creator then reported
"I can hear the reply" after refreshing and toggling sound. This confirms a
reported playback result on that device, not microphone accuracy, independent
user feedback or full accessibility conformance. Report:
`.data/verification/browser-audio-recovery-2026-10-23.json`.

All five fictional personas and the new reload/context-staleness conversation
passed on desktop/mobile: **12/12 focused checks in 2.3 minutes**. These are
scripted fixtures, not 12 people. Report:
`.data/verification/browser-contextual-conversation-2026-10-23.json`.
The production build and 223/223 backend tests pass; log:
`.data/verification/check-final-conversation-2026-10-23.log`.

**Final complete browser run:** after the conversation and speech changes, all
**128/128 desktop/mobile checks passed in 10.8 minutes**, with zero failures,
skips, retries, flaky results or runner errors. Coverage includes all five
personas, reply review, stale approvals, fresh drafts, persisted context,
cross-case/async recovery, microphone denial, spoken replay, silent-start
feedback, source navigation, exports, timezone editing, keyboard focus and
automated accessibility/layout checks. These remain controlled fictional tests,
not physical speech accuracy or independent user-benefit evidence. Report:
`.data/verification/browser-final-conversation-2026-10-23.json`.

The final six-tool scripted browser workflow also passed on this implementation:
receipt answered from reviewed evidence, authorization still open, an obsolete
draft blocked, one fresh approved **local capture**, one saved due item and an
actual redacted HTML history. There were no unexpected API/page failures. The
automated task clock was **5,040 ms**, excluding setup and human reading or
decisions; it is not time saved or a usability study. All six MCP tools were
called. Results and the checked export are in ignored
`.data/verification/usefulness-final-conversation-2026-10-23/`.

### Earlier Checks: October 23

**Bug found and fixed:** saving an HTML verification export under `.data`
caused Vite's development watcher to reload connected workspaces. This could
discard unsent input and made a saved result screenshot show a loading screen.
A new browser regression failed before the fix. Private storage, the configured
data directory and test-report directories are now excluded from file watching;
the same check passes on desktop and mobile. Demo tests also wait for the case
and closed export dialog before capturing the result. Production file-serving
denials and approval rules remain in place.

**Earlier failure retained:** the broader 120-test attempt was stopped after
44 completed checks: 43 passed and one appointment-review check failed while
waiting for its dialog to close. Its unchanged desktop/mobile tests passed in
the subsequent 22-check focused run. The trace showed a pending action request;
that timeout's root cause is not conclusively established or proved to be the
watcher bug. That interrupted attempt is not a pass. A subsequent complete
**122/122-test run passed in 12.3 minutes**, with no failures, skips or retries.
Its report is in ignored `.data/verification/browser-complete-2026-10-23.json`;
the earlier focused report is `browser-focused-final-2026-10-23.json`.

**Physical speech attempt:** the user reported an unmatched comparison. Its
stored text was `Compare the. Issue and supplier. Reports.` rather than the
intended supplier/insurer comparison. No audio was inspected, so the acoustic
cause and physical recognition accuracy are not established. The original local
parser rejected it without changing repair records.

**Recovery implemented:** periods between known report-command words are now
tolerated for reads only. Narrow ambiguous wording such as this example asks
whether the user meant supplier/insurer reports and offers **Compare reports**.
It never silently substitutes "insurer" for "issue" or executes the suggested
read without the user's click. The original transcript and typed suggestion
persist across reload. Clicking uses the current case's real MCP read; it does
not record evidence, prepare/send a message or create a reminder. The Relay
panel layout, dimensions and quick actions are unchanged. Punctuation recovery
does not broaden write-command matching.

Earlier on October 23, after the punctuation/clarification change, the production build and **199/199 unit/integration tests**
passed, including no-model clarification checks in all three assistant modes.
**16/16 focused desktop/mobile checks passed in 1.5 minutes**, with zero skips
or retries. They cover the reproduced transcript, explicit confirmation,
history persistence, report playback, voice lifecycle, accessibility and
case-isolation regressions. Report:
`.data/verification/browser-speech-recovery-2026-10-23.json`. The full 122-check
run above precedes that change; no full 124-check rerun was claimed at that point. The
real microphone must be retried and independently observed feedback is pending.

**Fresh scripted workflow:** `npm run measure:usefulness -- submission-2026-10-23`
completed all six stages and exercised all six real MCP tools without an
unexpected request or page error. The final history has receipt answered,
authorization open, one local capture, one due item and a labelled stale draft.
Known-identity redaction and source links were checked in the actual HTML export.
The automated task clock was 9,341 ms; this excludes browser startup and human
reading/decisions and is not evidence of time saved. Results and export are in
ignored `.data/verification/usefulness-submission-2026-10-23/`. No independent
participant, external email delivery or completed repair is claimed.

**Current speed spot check:** ten exact draft commands across five fictional
personas took **142-498 ms**, with model calls explicitly forbidden. Twenty
local case reads had a 632 ms first read, 105 ms median and 154 ms p95. These
small local measurements are not user completion times, production promises
or a native Alexa latency certification. The separately tested actual model
path below still took about twenty seconds. Report:
`.data/verification/performance-direct-drafts-final-2026-10-23.json`.

The core implementation is ready for rehearsal. Finish physical English voice
checks, private-repo reviewer access, the public video and Devpost fields before
calling the submission complete. Independent user testing remains recommended,
not replaced by the five fictional personas. Do not add unrelated features or
claim optional integrations that were not exercised.

### Reliability and Five Demo Personas: October 22

**Common draft requests no longer wait for Ollama.** Exact commands with an
explicit supplier/insurer and supported topic read the fresh MCP brief and call
`prepare_repair_request` directly. Negative, compound, unknown-topic and custom
instructions do not match this fast path. Multiple recipients open the selection
form; no matching question/contact means no draft. A failed write is not retried.
This removes unnecessary inference, not the cost of model generation itself.
The real model path remains separately tested with wording outside this grammar.

Ten warmed local MCP draft samples, two for each fictional persona, took
**94-166 ms**, with inference explicitly forbidden and no approval or delivery.
The accompanying twenty case reads had a 306 ms first read, 73 ms median and
108 ms p95. These are small developer measurements, not production/native Alexa
latency guarantees or user completion times. A separate actual `qwen2.5:1.5b`
tool-selection request passed in **20,084 ms**, leaving an unapproved draft.
Complex model requests can still be slow. Reproduce the separate checks with:

```sh
npm run measure:performance -- direct-drafts-check --commands --drafts --expect-direct
npm run test:ollama -- --draft-only
npm run test:demo
```

**Loading recovery:** initial selection reuses the case list already returned
by the server instead of requesting it again before the MCP brief. It does not
cache case results. GET reads have a ten-second deadline; a failed initial case
read shows a recoverable error and **Retry loading case**, not an endless spinner.
Retry validates the current case list. POST actions receive no automatic read
deadline or retry; approval/send ambiguity safeguards remain unchanged. Older
case/generation guards still reject late responses for another case. The earlier
isolated branding load timeout did not recur in the focused branding checks;
its original environmental cause was not conclusively established.

**Speech feedback:** an English recognition session ending with no transcript
now explains that outcome, keeps typed text and allows another recording.
Dictation still never submits or approves by itself. Tests use controlled browser
transcripts, not physical audio or a speech-recognition accuracy benchmark.

| Fictional Persona | Scripted Outcome |
| --- | --- |
| Maya | Conflicting reports -> unapproved receipt draft -> reviewed receipt answer -> authorization still open -> old approval disabled -> fresh approved local capture -> due item -> redacted HTML history. |
| Alex | Temporary-equipment request includes only the loaner question; parts remain delayed and both questions unresolved. |
| Sam | Follow-up asks for a named responder; it does not invent a supplier response. |
| Jordan | Request asks for a written refusal reason/review process, not an insurance decision or legal appeal. |
| Ravi | Request asks for qualified assessment/alternative arrangements, not mechanical instructions. |

All five journeys passed on desktop and mobile: **ten scripted runs, not ten
human participants**. Original reports remain quoted, approval starts unchecked,
exports retain unresolved issues, and no email or completed repair is claimed.
Only Maya's explicit approval captures a message locally. Fixtures are isolated
and deleted after each test. Screenshots, actual exported histories and labelled
machine-readable results are in ignored
`.data/verification/demo-users-2026-10-22/`. Automated task timings exclude human
reading/decision time and do not prove real-world usefulness or savings.

`npm run check` passed the production build and **195 unit/integration tests**.
The focused Edge run passed **18/18 checks in 2.1 minutes**, covering the ten
persona runs, safe loading retries/timeouts, branding and empty speech feedback.
No real SMTP, AWS, native Alexa+, physical audio or independent-user benefit is
established by these tests. Both previews retain their fictional databases and
capture-only configuration after restart.

### Compact Layout Pass: October 22

Narrowed the desktop sidebar from 246px to 228px, tightened workspace padding
and reduced the leading question's excess spacing. Relay now uses a compact
title/provider header, a smaller two-line composer and a responsive height cap
of 700px instead of 560px. It still fits below the actual case header; short
windows and mobile use the conversation dialog. Main reading text remains
16px and primary, voice, send and shortcut targets remain at least 44px.
At 320px, **View evidence** becomes a familiar file icon with an accessible
name and tooltip, avoiding an extra header row. Reduced mobile header/metric
spacing keeps **Prepare a request** visible at 320x700 without hiding reports
or shrinking reading text. No repair rules, approval or AI logic changed.

Measured with the same fictional case and browser viewport before/after:

| Viewport | Previous conversation height | New conversation height |
| --- | --- | --- |
| 1248x680 | 133px | 203px |
| 1440x1000 | 263px | 461px |

These are layout measurements, not user outcomes or audio/model performance.
`npm run check` passed the production build and **188 backend tests**; a final
production build/typecheck also passed after the narrow-screen correction.
The new dedicated Edge check passed **2/2 projects in 59.2 seconds**, each
covering 1248x680, 1440x1000, 1920x1080, 390x844, 320x700 and 1366x600.
It checks visible actions/input, conversation capacity, text sizes, 44px targets,
nonoverlapping regions, no horizontal overflow and automated accessibility.
Measurements are saved in ignored `.data/verification/layout-density-2026-10-22/`.
Desktop and narrow Relay screenshots were visually inspected. README images
use a separate in-memory fictional server with real MCP reads and no delivery.

The first exploratory run found the 320px action below the fold; that was fixed
in the UI, not by weakening the assertion. A separate branding check timed out
waiting for the case to load while another screenshot server was running; its
cause was not established. The longer rerun was stopped after three passing
desktop checks when the user requested a faster finish. It was not a completed
32-check run, and the branding load timeout was not fully reinvestigated.
The full browser suite, physical audio, independent usability, fresh install,
Docker, actual SMTP and native Alexa+ were not reverified by this layout pass.

### Message Wording and Readable Sources: October 22

Updated newly prepared messages to address the recipient directly instead of
copying internal advice such as "Ask what remains under review." All twelve
question kinds have bounded wording, with no generated diagnosis, legal
conclusion, deadline or promise. Exact reports, custom wording and historical
messages remain untouched; the same explicit approval boundary applies.

Latest-report voice playback uses the source number, UTC date and user-recorded
situation rather than reading a long quotation. The shorter text persists
through the real agent/chat HTTP path, while the written quote and MCP trace
remain available. Existing no-replay, mute, recording-cancellation and review
boundaries remain in place. This is controlled speech testing, not physical
microphone or speaker verification.

The same formatter makes service-generated answer footers readable in Overview
and HTML, including older stored answers. Source buttons open the matching
Evidence entry; technical IDs remain in collapsed record details. JSON retains
raw `answer` and adds `displayAnswer`. Only the exact generated trailing footer
is substituted; an identical ID inside a quotation or manual answer is preserved.
Export remains read-only and retains HTML escaping and known-identity redaction.

`npm run check` passed the production build and **188/188 backend tests**, with
no failures or skips. Tests cover all twelve draft kinds, preserved user wording,
exact-message hashes, generated-footer-only formatting, older/missing sources,
spoken-text persistence, read-only exports and existing approval/MCP safeguards.
Existing Vite shutdown diagnostics still occur in isolated security fixtures.

The complete Edge run finished in **6.7 minutes: 100 passed, 2 failed**. Both
failures were in the new playback test, which incorrectly expected the original
seed's `Source 2` after another regression test had corrected that report to
`Source 4`. The production comparison correctly followed the correction. The
playback test now creates and deletes its own fictional case, checks both exact
source labels and reported situations, and verifies preserved written text,
real MCP history, shorter opt-in playback and no replay after reload. That
isolated rerun passed **2/2 desktop/mobile checks in 16.2 seconds**. No production
workaround, skipped test, relaxed assertion or increased timeout was used.
The entire suite was not repeated after this test-fixture-only correction;
these results must not be described as a single clean 102-check run.

All other checks in that full run passed, including generated request wording,
unchecked approval, readable reviewed-answer sources, navigation into the exact
Evidence entry, collapsed record IDs, downloaded HTML, corrected-source handling,
case restoration, first-use setup, keyboard focus, responsive layout and axe
checks. Desktop and emulated-mobile request-review screenshots were inspected,
along with the desktop answered-source view. This is not independent human
feedback or physical device/audio testing.

Both existing preview servers were restarted with their fictional databases
preserved and capture-only settings. Real HTTP/MCP report reads passed in both
local and Ollama mode: 554 written characters versus 311 spoken characters for
the seed comparison. This is one example, not a benchmark, new model-inference
test or a measurement of physical playback duration. Ollama inference latency,
real email delivery and independent user benefit remain unverified by this change.

### Walkthrough UX Fixes: October 22

Fixed the three issues found in the first-use walkthrough below:

- The last successfully loaded case ID is remembered in `sessionStorage` for
  that browser tab. Startup/sign-in checks it against the server-returned case
  list before loading details. Unknown/deleted IDs fall back safely, empty
  workspaces clear the preference, and logout or case deletion clears it.
  Only an opaque ID is stored, not names, reports or credentials. Navigation
  still works if browser storage is blocked, but restoration is unavailable.
- Overview and Requests show **Recipient contact needed** and **Add contact**
  when an open question has no recipient. The existing contact form opens
  directly; saving returns to the same view and enables request preparation.
  It does not prepare, approve, send or verify an address automatically.
- An empty Overview uses a neutral document state and **Record first update**.
  Empty Evidence offers the same action. Cases with evidence but no open
  questions retain the existing incomplete-repair disclaimer.

`npm run check` passed the production build and **183/183 backend tests**.
The focused Edge run passed **32/32 checks in 5.1 minutes**, equally split
between desktop and mobile. Twelve new checks cover restoration, tab isolation,
unknown/deleted cases, an empty list, blocked storage, logout cleanup and the
first-update/contact/draft path. Existing startup, reply review, full case,
case-isolation, long-field and compact-layout regressions also passed.
The new controls passed the tested 320px/1440px axe/layout checks; screenshots
were inspected. Approval remains unchecked and capture disabled until review.

An earlier focused attempt was stopped after the new walkthrough test waited
on an incorrect label selector for the situation dropdown. It was corrected to
the same accessible combobox selector used by existing tests. No application
workaround, retry, skipped check or extended assertion timeout was needed;
the final 32-check run completed cleanly. Existing Vite shutdown diagnostics
still occur in backend security fixtures without failed assertions.

The full browser suite, physical speech, independent usability, fresh install,
complete Docker stack, real SMTP/AWS and native Alexa+ were not reverified by
this focused UI change. The earlier walkthrough remains agent-authored evidence,
not an independent human outcome study.

### First-Use UI Walkthrough with Ollama: October 22

At implementation commit `260f282`, an agent walked through the running
Ollama app on port 4318 using visible UI controls rather than replaying only
the prepared demo. A new fictional case (`UX-20261022`) was created with two
contacts and conflicting supplier/insurer reports. Real `qwen2.5:1.5b` inference
selected a supplier request through MCP; that single browser request took
28.488 seconds. This is an observed wait, not a general performance benchmark
or a human task-completion measurement.

The task completed: inspect the source comparison, review the unapproved
draft, review an insurer receipt reply, explicitly answer receipt, replace the
stale draft, approve a fresh authorization request for local capture, schedule
a follow-up, reload and export the history. Final read-only checks confirmed
four events, two requests, one captured message and one scheduled local due
item. Receipt was answered; authorization remained open. No email was
delivered and no repair was marked complete. Unapproved/stale capture controls
were blocked, and the proposed reply answer started unchecked.

The downloaded HTML removed the checked known identity fields, labelled the
stale draft and linked numbered sources to their history entries. The case and
persisted conversation were also inspected at a 390x844 mobile viewport with
no horizontal page overflow. Desktop/mobile screenshots were visually checked.
No uncaught page errors or HTTP API error responses were observed.

| Priority | Observed first-use issue | Needed improvement |
| --- | --- | --- |
| Medium | Reload opened Maya's `DEMO-1042` instead of the selected new case. The records and follow-up were still present when the new case was selected again. | Restore a valid previously selected case, with safe fallback when it is unavailable. |
| Medium | With no contacts, Overview disabled **Prepare a request** without explaining the prerequisite or offering an add-contact action. | Give an actionable contact-setup path beside the blocked task. |
| Low | The new case showed a success-style **No open questions recorded** state; its first-update action was only the header icon. | Show a primary first-update action in the empty Overview. |

Draft wording also includes internal question-explanation phrasing such as
"Ask what remains under review"; the quoted sources are correct, but a human
should still edit the outbound wording for the recipient.

Local evidence is in
`.data/verification/agent-user-walkthrough-2026-10-22/summary.json`, alongside
screenshots and the actual downloaded HTML. Automation adjustments (modal
selector scoping, an attempted disabled click and correcting the harness's
relative API URL) are recorded separately from application failures.

This is an agent-authored, implementation-informed walkthrough, not an
independent participant test. It does not establish physical microphone or
speaker behavior, accessibility conformance, human time saved, clinical
benefit or shorter repairs. No functional code changed during that review;
the three observed UI issues were fixed afterward as recorded above.

### Grounded Conversation and Speech Recovery: October 22

Added bounded, read-only answers for `What did the supplier say?`,
`Read the latest insurer report` and `Compare the supplier and insurer reports`.
They use real MCP case data in all three agent modes without inference, new
consent requirements or writes. Corrected records are excluded; adding an older
report later does not make it the latest report. Quotes remain attributed and
untrusted. This does not expand the app into general natural-language Q&A.

Speech startup exceptions are contained, microphone/service errors preserve
typed text, and failed playback leaves the written response available. Missing
speech-output APIs disable that control. Output failures reset the opt-in toggle;
late errors from an old utterance cannot alter the current playback state.
Controlled speech tests are not physical microphone or speaker verification.

After the user reported poor microphone capture, changed dictation to continuous
English (`en-IN`) with live interim results. Revisions replace earlier interim
words; multiple final segments are preserved rather than reading only the first
changed result. Stop remains explicit, manual editing cancels recording, and
voice never submits itself. Recording also stops at the message-length limit
with a visible warning. These changes address application capture behavior,
not browser-service accuracy, permissions or microphone hardware. Physical
capture is an open issue until the user retests successfully.

An initial backend run caught missing question routing for `Will my insurer
approve coverage?`; it now gets the explicit local limitation rather than a
generic fallback. The first focused browser run passed five of eight checks;
three failures were test assumptions about persisted history or clicking a
desktop control behind the mobile dialog. The tests now compare the existing
message count and exercise recovery through the active conversation. No
assertion deadlines were extended.

The subsequent 86-check full browser run was deliberately stopped after 46
passing checks to address that microphone report. It was not a completed pass.

Final verification after the microphone changes: `npm run check` passed the
production build and **183/183 backend tests**. The focused Edge run passed
**16/16 desktop/mobile checks in 1.9 minutes**, including continuous/interim
dictation, revised words, multiple segments, manual corrections, the length
limit, no automatic submission, source reads, input/output failures, stale
callbacks, reviewed evidence and permission denial.

The expanded **88-check** run then passed all **44 desktop** checks and the
first **14 mobile** checks, with no assertion failures, before being deliberately
stopped when the user asked to finish faster. Thus **58 checks passed; the full
run is incomplete**, not 88/88. No retries, skipped tests or relaxed assertions
are counted as success. The previous implementation's complete 78/78 result is
historical and does not substitute for the remaining 30 checks on these changes.
The capture-only preview was restarted on port 4317 with the existing fictional
database. No new live-model, SMTP, AWS, native Alexa+, physical-audio or
independent-usability success is claimed.

### Export and Startup Fixes: October 22

The production build and **178 backend tests passed** using `npm run check`.
Four new backend tests cover stale/fresh drafts, unchanged attempt statuses,
stable source numbering after backdated updates/corrections, exact message
preservation, escaping and read-only export behavior. Two earlier parallel-file
runs each failed a different existing two-second MCP fixture. Running the same
assertions with sequential test files passed; `npm test` now makes this scheduling
explicit. MCP deadlines, no-replay assertions and deliberate overlapping-request
tests remain unchanged. Host contention is a suspected contributor, not a proven
cause of every earlier wait failure. Vite shutdown diagnostics still occur in
the isolated security fixtures without failed assertions in the final run.

The final complete Edge run passed **78/78 browser checks in 7.2 minutes**, with
no retries or skips. New tests cover simultaneous settings/case-list loading,
a usable case while chat history is held back, history-fetch errors, silent
historical replies with opt-in speech for new replies, and downloaded HTML
source links/stale labels at 1100px and 320px. Both desktop and mobile projects
passed, along with the existing approval, case-isolation, correction, source,
follow-up, speech-callback and accessibility checks. Screenshots of the exported
document were inspected. An exploratory 76-check run was stopped before the
final history guard; it had wait failures and is not counted as a passing run.
Its local failure artifacts remain under
`.data/verification/export-startup-2026-10-22/interrupted-browser-run/`.

The updated scripted fictional case completed with zero page errors or failed
requests and successful traces for all six MCP tools. It verifies the actual
downloaded stale-draft label and that source links resolve, as well as known-
identity redaction, local capture, a persistent due item and authorization left
open. Evidence:
`.data/verification/usefulness-export-startup-fixed-2026-10-22/summary.json`.
Its 8.940 wall seconds / 7.105 summed step seconds are automation timings, not
human completion times or evidence of time saved. No email was delivered.

These changes remove a verified startup dependency; the root cause of every
earlier intermittent initial-load delay is not established. Physical speech,
independent usability, live email/AWS, native Alexa+ and production-load behavior
remain unverified. No new deployment or fresh-install verification is claimed.

### Application Review: October 22

Rechecked the application after the README/branding updates; no feature code
changed during this review. The production build and **174 backend tests passed**.
Vite emitted dependency-scanner shutdown diagnostics during isolated security-test
teardown; the suite returned success with no failed assertions.

The full Edge browser run passed **69/70 checks in 8.3 minutes**. One desktop
stale-preview test exceeded its five-second wait for the initial **Power chair
repair** heading, before selecting the test case or opening reply review.
Its final snapshot showed the case, but the cause of the delay is not established.
The trace is preserved locally at
`.data/verification/ui-review-2026-10-22/initial-load-failure-trace.zip`.
A fresh run passed all **four desktop/mobile stale-preview and complete-case
checks in 1.2 minutes**, with no assertion/timeout changes. This does not establish
an uninterrupted 70/70 run or fix the initial-load timing issue.

Desktop/mobile screenshots of the overview, conversation and reply review were
inspected. Checks covered accessible dialogs, responsive layout, source expansion,
reply/appointment review, exact-message approval, local capture, due-item persistence,
export, deletion, case isolation and controlled speech callbacks. Physical voice,
independent usability, real email, AWS and native Alexa+ remain unverified.

The scripted fictional task also completed with **zero page errors or failed
requests** and successful traces for all six MCP tools. Receipt was answered,
authorization remained open, one message was captured locally and one due item
persisted. No email was delivered and no repair completion was recorded. The
downloaded HTML was rendered and known-identity checks passed, not proof of full
anonymization. Evidence:
`.data/verification/usefulness-app-review-2026-10-22/summary.json`.
Automation took 7.898 wall seconds / 6.726 summed step seconds; these are not
human completion times or evidence of time saved.

Inspection of the actual export confirmed two existing clarity gaps: the obsolete
request is labelled `draft`, not `Stale draft`, and message citations such as
`[source 1]` must be matched against history entries labelled with UUIDs. These
remain recommended handover improvements, not newly fixed features.

### Compact Workspace Refinement: October 21

The header now uses 44px export/update icon commands with accessible names and
tooltips, a smaller title and tighter spacing. Sidebar rows are more compact;
selecting a case scrolls only its navigation list as needed. Main question copy
remains 16px. Relay's empty state no longer has a large illustration or clipped
tagline: **No messages yet** fits inside the available conversation area.

The production build and **174 backend tests passed**. The latest full browser
run passed **69 of 70 checks**. One desktop accessibility check timed out while
switching from Requests to Follow-ups; the runner also reported an internal
fixture-step error. The cause is not established. A fresh run passed all **four
desktop/mobile compact-layout and accessibility checks in 57.2 seconds**, without
changing assertions or timeouts. This is not an uninterrupted 70/70 suite pass.

The new sizing check covers the fictional assessment case at 1248x680, 1440x900
and 390x844 CSS pixels. It verifies icon sizes/tooltips, selected-case visibility,
desktop header/metric heights, readable body text, an unclipped empty log and a
visible message input. Automated accessibility scans found no violations in
these tested states. Desktop/mobile screenshots were inspected and the README
image refreshed. These are automated checks, not independent-user validation.

### Task-First Workspace: October 21

The final production build, **174 backend tests** and all **68 desktop/mobile
browser tests passed**, with the browser suite completing in one 9.3-minute run
without retries or skips. First-screen checks assert a fully visible request
action and Relay input at 1248x680, 1440x900, 768x900, 390x844 and 1366x600 CSS
pixels. They also check primary-action styling, no horizontal overflow, a visible
new reply and no page-scroll jump after chat. Tablet/mobile and short windows
use the labelled conversation dialog; desktop fits Relay to the available height.

Supporting reports and recent evidence start collapsed, expand by keyboard and
retain source navigation. Existing approval, correction, stale-draft, controlled
speech, case-isolation, accessibility and long-field regressions still pass.
Viewport screenshots were inspected and the README screenshot was refreshed.
An initial focused run exposed a clipped action in a short window and an overly
broad test selector; both were corrected before the final full run.

The complete scripted fictional task also passed after the layout change:
12.742 wall seconds / 11.058 summed step seconds, including the actual local
capture adapter, reload and inspection of the downloaded export. Evidence:
`.data/verification/usefulness-20261021145652/summary.json`. These are automation
timings, not human completion times or a demonstrated usability improvement.
No independent-user, physical-voice, live email, AWS or native Alexa+ validation
is added by these checks. The earlier clean-install check remains historical.

### Supplier Appointment Review: October 21

Working-tree verification passed the production build and **174 backend tests**,
including 28 additional appointment checks. The full browser run passed **63 of
64 tests** in six minutes: one existing desktop long-field test timed out waiting
for case navigation, before its layout assertions. Its failure screenshot showed
the requested case after the wait; the cause is not proven. An unchanged targeted
rerun passed all **six desktop/mobile checks** (that test plus both new appointment
scenarios) in 1.7 minutes. Assertions/timeouts were not relaxed. This is not a
claim of an uninterrupted 64/64 browser run.

- Supplier-only, exact-format confirmation validates calendar date, 24-hour time,
  UTC offset and a visit after the report time; older reports cannot answer newer
  appointment questions.
- Preview is read-only, quotes the source, starts unchecked and requires explicit
  confirmation. Missing/invalid dates or time zones, wrong parties, conflicting
  sentences and unsupported wording propose no answer.
- Only the existing open visit-time question can be answered. Parts/accessibility
  readiness and authorization remain open; no repair-completion event is inferred.
- Source correction reopens the question. Duplicate saves are idempotent; stale
  previews, edited times and unsupported answer selections are rejected. Old draft
  approvals remain blocked after the update.
- Both new browser scenarios passed in the full run and targeted rerun. Preview
  screenshots at 320px and 1440px were inspected; dialog axe scans and overflow
  assertions passed. Tests used isolated fictional data, local mode and capture.

Evidence: `tests/replies.test.ts`, `tests/reply-review.spec.ts` and ignored
`.data/screenshots/*-appointment-preview.png`. No new live email, Bedrock, native
Alexa+, physical speech or independent user-benefit verification is claimed.
The October 20 clean-checkout results below concern the earlier published code,
not this later working-tree enhancement.

### Published Release Check: October 20

Verified implementation **`40b4da8`** from an actual GitHub clone, not the
original working directory. The new temporary checkout initially contained no
`.env`, `.data`, `.private` or `node_modules`. No private settings, dependencies
or case database were copied into it. A documentation-only follow-up records
these results; it does not change the tested implementation.

| Check | Observed result |
| --- | --- |
| Clean installation | Empty-cache `npm ci` installed 265 packages in 51 seconds. Windows system-CA guidance was used; strict TLS remained enabled and certificate rejection was not disabled. |
| Build and backend | Production bundle and all **146 tests passed**, with no failures or skips. |
| Browser workflows | All **60 desktop/mobile-emulation tests passed in one 7.8-minute run**, without retries or skips. |
| Interface checks | Exact-quote reply review, stale approval, fresh drafting, reload persistence, controlled English speech, keyboard focus, axe and responsive checks passed; fresh-checkout screenshots were inspected. |
| Source hygiene | The cloned tracked tree stayed clean after generated test files. `.env` and private case storage were absent. npm reported **zero known vulnerabilities**, not a security guarantee. |
| Repository access | Authenticated GitHub API confirmed the repository remains **private**, with an MIT license. Reviewer invitations/acceptance must be checked separately; a successful owner clone does not prove judge access. |

The local read-burst spot check during overlapping test activity reported a
536 ms median and 1,231 ms p95. These are host/load-specific observations, not
native Alexa+ latency certification or a production SLA. All data was fictional;
no live email, Bedrock, native Alexa+ or independent user-benefit test is claimed.

### Reviewed Reply Workflow: October 20

Final working-tree verification passed the production build, **146 backend
tests** and all **60 desktop/mobile-emulation browser tests in one 5.3-minute
run**, without retries or skips. This adds 25 backend and 12 browser checks.
Tests used isolated fictional data on Windows / Node 24.11.0 / installed Edge.

- Preview leaves case records, approvals and request keys unchanged; supporting quotes are exact source substrings.
- Negated, conditional, conflicting, wrong-party and unsupported wording cannot propose an answer. Empty selection records evidence only.
- Stale versions, edited source/hash, unsupported or duplicate IDs, false confirmation and changed draft lists are rejected without writes.
- Injected save failure rolls back evidence, answers, version and retry keys. Identical retries do not create another event.
- Receipt can be answered while authorization remains open. Correcting the answer source reopens receipt; ordinary notes preserve its source link.
- Old message approval is blocked. Fresh-request selection excludes answered receipt and replaces old wording with current source-backed content.
- Desktop/mobile tests cover reload persistence, confirmation resets, cancelled-preview case isolation, controlled English speech, keyboard focus and axe scans.
- Screenshots at 320, 390, 768 and 1440px confirmed wrapping and no horizontal overflow. A preview scroll reset keeps the dialog title/close control visible.

Evidence: `tests/replies.test.ts`, `tests/reply-review.spec.ts` and ignored
`.data/screenshots/*-reply-review*.png`. Earlier incomplete browser runs exposed
test-locator mistakes and the narrow-screen scroll issue; the final full run
passed after correction, not by ignoring failures or relaxing assertions.
The development server can emit dependency-scan shutdown diagnostics during
isolated security-test teardown; no backend assertion failed.

No mail was delivered. Physical microphone/speaker behavior, native Alexa+,
live Bedrock, a new live Ollama run, public HTTPS and independent user benefit
remain unverified. The published implementation's fresh installation is now
verified above. Reply review does not require a model or an inbox connection.

### Case Command Speed Fix: October 19

The **working-tree fix after `5e744c2`** removes unnecessary model interpretation
for supported case commands. It does not replace MCP with fixtures: each read
calls `get_repair_brief`, and history export also calls `export_repair_packet`
with HTML format and identity redaction enabled. There is no model call, cached
case result, new evidence, draft or follow-up write on these direct paths. The
HTTP conversation host still records chat locally as before.

| Same API probe | Before fix | After fix |
| --- | --- | --- |
| `Help me understand what is holding up this repair.` | 47,941 ms | **158 ms** |
| `Export my case history` | 39,878 ms | **224 ms** |

The separate warmed-MCP command benchmark ran each of four supported commands
twice: status/next-step/holding-up reads took **79-89 ms** and HTML export
**166-179 ms**, with **zero model calls** and unchanged case data. Actual
Ollama-mode browser shortcuts took **765 ms** for Case brief and **543 ms** for
Case packet, also asserting zero model calls. These are sequential local spot
checks on fictional data, not controlled population statistics, a production
SLA or native Alexa+ latency certification.

Verification passed the build and **121 backend tests**, **48 desktop/mobile
browser tests in 8.4 minutes** without retries/skips, all seven Ollama-mode API
scenarios, and actual-model desktop draft review/mobile conversation. Five of
six focused pre-fix routing checks failed before the implementation change;
the completed suite passes without relaxing assertions. Tests cover fresh data,
no unintended writes, redaction, failure without a ready packet, exact matching
and the HTTP cloud-consent boundary. Adversarial model tests use non-shortcut
wording and still assert actual model execution, not a bypassed test.

Draft selection and unrecognised/compound or different-format model requests
are not made faster by this fix. Actual draft selection took 24.8 seconds in
the API check and 8.8 seconds in a separate warmed browser check; general model
latency/accuracy remain unevaluated. No email was delivered and live Bedrock
was not tested. Keep those boundaries in the demo and submission.

Reproduce the command benchmark with:

```sh
node --import tsx scripts/verify-performance.ts fast-commands-oct19 --commands --expect-direct --ai
```

`--expect-direct` requires zero model calls for supported reads/exports;
`--ai` separately verifies actual local inference for a persisted, unapproved
draft. It needs the documented local Ollama model. Evidence is in ignored
`.data/verification/performance-fast-commands-oct19.json`, the newer
`.data/verification/ollama-live.json`, and actual-model screenshots under
`.data/screenshots/`. The earlier GitHub-audit artifacts below remain separate.
These results were collected from the working tree after `5e744c2`. Verify the
final published revision from a fresh checkout before submission; the earlier
checkout covered only the pre-fix version.

### One-by-One Recheck: October 19

Tested the pushed GitHub revision **`5e744c2`**, not a copy of the working
directory: a fresh clone, empty npm cache, no private `.env` and no existing case
database. Host: Windows x64, Node 24.11.0, installed Edge. This is agent-run
software verification, not independent user research or proof of repair benefit.

| Check | Observed result |
| --- | --- |
| Fresh installation | `npm ci` installed 265 packages. `NODE_USE_SYSTEM_CA=1` used the Windows trust store; TLS verification stayed enabled. |
| TypeScript/build/backend | `npm run check` passed the production build and all **105 tests**, with no skipped tests or changed assertions. |
| Desktop/mobile browser workflows | All **46 tests passed in 5.7 minutes**, without retries or skips, on an isolated port and fictional database. |
| Accessibility/layout | Tested axe scans found no violations; modal keyboard focus, long text and responsive layouts passed. Desktop/mobile screenshots were inspected. This is not full accessibility certification. |
| Actual MCP | Real HTTP initialization, discovery and calls to the six-tool server passed, including authentication, approval boundaries, framing and persistence tests. |
| Actual local AI | All seven Ollama-mode API scenarios passed with `qwen2.5:1.5b`; some supported commands are deterministic, not seven model calls. Real-model desktop draft review and mobile persisted conversation also passed, with no approval or delivery. |
| Response speed | API spot checks: read **47,941 ms**, draft selection **10,778 ms**, export **39,878 ms**, trusted tomorrow reminder **402 ms**. Separate real-browser draft review: **6,823 ms**. Model-assisted reads/exports remain slow; this audit did not fix them. |
| Dependency audit | Fresh `npm audit` reported **zero known vulnerabilities**. This is not a penetration test or guarantee of security. |
| Gmail | Connection-only checker stopped before connecting because `SMTP_FROM`, `SMTP_USER` and `SMTP_PASSWORD` are blank. No message sent; real login and inbox receipt remain unverified. |
| Physical speech | Controlled English browser speech tests passed; real microphone, speakers and assistive-technology behavior remain unverified. |
| Independent user benefit | Not tested. The agent-run workflow below is not a participant testimonial or a measurement of human effort saved. |
| Repository access | Authenticated clone succeeded. GitHub's unauthenticated repository API returned 404; public visibility and accepted reviewer invitations could not be verified. |
| Video/submission | At this audit, no public video or completed submission link was supplied. See Section 6 for the subsequently generated cut and October 24 YouTube link; completed Devpost submission remains unverified. |
| Latest container / optional AWS | Docker engine was unavailable, so the latest image was not rebuilt/retested. Earlier dated container results remain below. Live Bedrock/AWS Builder use is still unverified. |

The initial sandboxed build failed with subprocess `EPERM`; the unchanged
command passed with the required execution permission. Backend output also
included Vite dependency-scan warnings while a short-lived security-test server
was closing. All assertions passed; this was not a warning-free log. No timeout
or assertion was relaxed to obtain the results above.

**Fictional task outputs confirmed by software tests:**

| Task | Confirmed output |
| --- | --- |
| Clarify conflicting paperwork reports | Both dated sources and the receipt question appear, without assigning fault. |
| Prepare a supplier request | Real model/MCP draft is persisted with source citations and opens for review; nothing is sent. |
| Review/approve | The full desktop/mobile workflow requires exact-message approval and records local capture, not email delivery; the question stays open. |
| Follow up | A due item persists after reload; the supported tomorrow command saves one item and promises no automatic message. |
| Handover/delete | HTML download and case deletion pass in the full workflow; real-model export also verifies known-identity redaction. |

Reproduce with `npm ci`, `npm run check`, `npm run test:browser`,
`npm run test:ollama` and `npm run test:ollama:ui`. Actual-model checks need a
running local Ollama server and the documented model. All use fictional data;
the verification scripts cannot deliver email. Generated reports/screenshots
are retained locally under ignored `.data/verification/github-audit-2026-10-19/`.
That checkout covered only `5e744c2`. The later speed fix and benchmark above
were verified separately in the working tree, not in that checkout.

### SMTP Setup Recheck: October 18

The production build, TypeScript and **105 backend tests passed**, including
ten new mail-configuration/verification tests. The checker and app share the
same TLS-required SMTP settings. Tests cover capture defaults, invalid settings,
Gmail App Password normalization, sanitized errors, transport closure and a real
local TCP fixture that refuses STARTTLS. That fixture received no authentication
or mail commands. Successful authentication is simulated in unit tests, not
established against Gmail.

The first full backend run hit the existing two-second MCP reconnection test's
deadline. The isolated test and the next complete run passed unchanged; no
assertion or deadline was relaxed. The cause of the first timeout is unproven.

Four targeted desktop/mobile browser checks also passed, including case views
and the evidence/draft/approval/capture/follow-up/export/delete workflow. These
used isolated fictional records and capture mode, not real email delivery.

`npm run mail:verify` was also exercised with the private blank Gmail template.
It failed safely before connecting, listed the missing sender/login fields and
sent no email. The local `.env` stays in capture mode and is excluded from Git
and Docker. Actual Gmail login, sender acceptance and observed inbox receipt
remain unverified until the user enters credentials locally and approves a
controlled test. The earlier AI and container results below retain their dates;
this recheck does not establish native Alexa+, public hosting or real user impact.

### Latest Workflow Recheck: October 15

The finished source passes **95 backend tests**, TypeScript and the production
build, plus **42 desktop/mobile-emulation browser tests in one 6.4-minute run**.
There were no retries, skipped tests or increased assertion timeouts. The
rebuilt non-root Docker image also passed authentication, real MCP, unapproved
send rejection, custom-port health and persistence after restart. A fresh npm
audit reported zero known vulnerabilities. Tests used fictional records only.

Three problems were reproduced and fixed:

- A delayed poll could hide a newer chat reply or saved follow-up. Four new desktop/mobile regression cases failed before the generation guard and passed afterward. The old response affected display state, not persisted records.
- The real small model replied to `Remind me tomorrow` without creating a due item. The supported command now calls real MCP with the trusted 24-hour rule in every mode. Tests cover all three modes and a rejected write without a saved confirmation.
- A real read reply incorrectly predicted insurer authorization. Read responses now render the latest structured MCP stage/next question or follow-up list. Adversarial tests in both model modes reject generated outcome wording and verify that a later MCP brief supersedes the initial snapshot.

The expanded **seven-scenario Ollama-mode API run passed**, including grounded
status, draft preparation, delivery-status read, blocked voice send, reviewed
update proposal, correctly dated tomorrow reminder, and redacted export.
Simple safety/short-command paths are deterministic, not seven model calls.
Actual-model desktop draft review and mobile persisted conversation also passed;
the draft stayed unapproved and no email was delivered. English `en-IN` input
and output settings are checked in controlled browser speech tests.

One local run measured approximately 27.4 seconds for an AI read, 4.4 seconds
for draft selection, 325 ms for the trusted reminder and 36.7 seconds for an
AI export; separate actual-browser draft review took 7.0 seconds. These are
spot checks, not latency guarantees. Manual export/local mode remain available.
Physical microphone/speakers, independent user benefit, live SMTP/Bedrock,
complete Compose inference and public HTTPS are still unverified.

Ignored evidence includes `.data/verification/workflow-audit-final-check.log`,
`workflow-audit-release-browser.log`, `workflow-audit-live-final.log`,
`workflow-audit-live-ui.log`, `workflow-audit-docker-build.log` and
`workflow-audit-dependencies.log`. Earlier failing probes remain separate in
`workflow-audit-refresh-before.log` and `workflow-audit-live-model.log`.
Do not publish raw machine logs or trust bundles.

### October 14 Baseline

These earlier results apply to implementation `a6995f4`. That documentation
consolidation changed no application code. They are historical results, not
the latest workflow gate above.

```sh
npm run check
npm run test:browser -- --reporter=line
npm audit
```

With a running local model, optional checks are:

```sh
npm run test:ollama
npm run test:ollama:ui
npx tsx scripts/verify-http-framing.ts
```

| Check | October 14 result | Important limit |
| --- | --- | --- |
| Backend, TypeScript and production build | 84 tests passed; typecheck/build passed | Does not validate external services. |
| Browser workflows | All 34 desktop/mobile-emulation tests passed in one full run, 3.6 minutes, no retries | Edge on this Windows host, not physical mobile devices. |
| Accessibility | 21 axe scans, no detected violations under the tested WCAG 2/2.1 A/AA tags | Not full WCAG certification or screen-reader validation. |
| Layout | Passed widths 320, 390, 768, 1440 and 1920 pixels, including long content | Tested views/screenshots only. |
| Dependencies | Audit: zero known vulnerabilities; no invalid top-level dependencies | Not proof of complete security. |
| Actual Ollama + MCP | Six-scenario API run and desktop/mobile AI UI check passed | Small fictional set; no general model-accuracy claim. |
| Concurrent local reads | 25 requests, batches of five; median 346 ms, p95 489 ms | Includes initialization/discovery/tool calls; not sustained load or native/cloud latency proof. |
| Docker, Bedrock, SMTP, public TLS | Not verified | Do not claim these integrations have passed. |

Latest actual CPU inference took about 22 seconds to explain, 31 to draft and
21 to export; a separate browser draft took 16 seconds. Earlier runs took
47-55 seconds. Ollama was 0.40.4 with `qwen2.5:1.5b`. Speed depends on hardware;
the experience is not proven real-time. Natural-language read accuracy remains
an open concern despite safe action boundaries.

Browser tests start an isolated server on port 4319 and fresh fictional storage.
Edge must be installed. Use `TEST_PORT` for a different port or `TEST_BASE_URL`
to explicitly test an existing server. Screenshots, reports and traces are
ignored local artifacts. Regression AI/speech responses use controlled
substitutes; the optional Ollama scripts separately exercise real inference.

Earlier fresh-checkout testing of commit `e2639ee` passed installation, 39 backend
and ten browser tests with an empty npm cache. It does not count as fresh-checkout
verification of the current version. Earlier failures are not erased by a later
pass: tests reproduced layout/contrast defects, HTTP stalls and an invalid
HTML-only export-verifier assumption before fixes and complete reruns.

### QA Fixes That Matter

| Reproduced issue | Fix and evidence |
| --- | --- |
| Anonymous development access to a fictional private-file canary | Private-file denial and separated cache; direct, encoded, query and `@fs` regressions in `tests/security.test.ts`. |
| Malformed/oversized JSON and deletion confirmation errors | 400/413 responses without payload echo; strict deletion validation. |
| IPv6 MCP origin and unsafe storage/public-origin settings | Use bound address; normalize HTTPS origins; reject unsafe paths/storage locations. |
| Dialog focus escaped, pale text and narrow-screen overflow | Explicit focus wrap/restore, contrast fixes and constrained wrapping; browser/axe checks. |
| Model export requested unredacted data while claiming redaction | Host forces assistant redaction; both AI adapters have regressions. |
| Intermittent stalls and inconsistent wire framing | Owned dispatchers/deadlines and uniform native chunk framing; six HTTP status paths and raw TCP checks. Vendor root cause is unknown. |
| Completed read left interface busy during redundant refresh | Chat-only refresh for successful read-only replies; desktop/mobile regressions. |

Backend coverage includes all tools, protocol negotiation/discovery, auth,
CSRF/throttling, cross-case checks, persistence, corrections, approval expiration,
replay/concurrency, uncertain delivery, escaped/redacted export and deletion.
Browser coverage includes the complete lifecycle, source comparison, trace
visibility, review, input recovery, case switching and controlled speech events.
The timeout tests verify actual cancellation and one unanswered request, not
just any rejection. Docker exclusions additionally protect credential/database
files; no container build was claimed.

Evidence lives in `tests/*.test.ts`, `tests/*.spec.ts` and `scripts/verify-*.ts`.
Ignored outputs include `.data/verification/*` and `.data/screenshots/*`.
[Accessibility testing](https://playwright.dev/docs/accessibility-testing),
[Vite file denial](https://vite.dev/config/server-options#server-fs-deny),
[Node fetch dispatchers](https://nodejs.org/docs/latest/api/globals.html#fetch),
[Undici Agent](https://github.com/nodejs/undici/blob/main/docs/docs/api/Agent.md).

### User-Workflow Recheck: October 15, 2026

The existing Edge tests were rerun with isolated fictional storage and local
message capture. No external messages were sent and the running demo cases
were not modified. This was automated workflow testing and screenshot review,
not independent user validation or physical speech testing.

| Check | Result |
| --- | --- |
| Actual Ollama + MCP browser workflow | Passed: a source-backed supplier draft opened for review with approval disabled; mobile conversation persisted and no uncaught page errors were reported. |
| Actual AI draft wait | 71,192 ms from submitting the request through review verification on this host. This is too slow for a smooth voice interaction; the cause and cold/warm-start contribution are not established. |
| Full desktop/mobile suite | 33 passed, one failed, 5.8 minutes. Desktop/mobile case lifecycle, captured-message review, follow-ups, persistence, answer recording and export passed. |
| Failure investigation | The mobile simulated-speech test failed before speech interaction while waiting five seconds for the initial case heading. The case-detail response took about 4,691 ms; other session/settings/list requests were much faster. The later failure snapshot contained the expected case. |
| Unchanged focused rerun | The failed mobile scenario passed in isolation; the run reported 24.6 seconds. No test timeouts were increased and no application fix was made. |

**Assessment:** the tested workflow works, but this run does not establish
consistent responsiveness. Investigate the slow AI request and intermittent
initial case read before describing the experience as fast or fully reliable.
The focused pass does not turn that full run into a 34/34 pass. This is the
pre-fix observation; the changes and subsequent measurements are recorded below.

### Performance Fix: October 15, 2026

The pre-fix implementation initialized MCP and rediscovered its schemas for each
tool call. It also sent full report context for simple draft selection and made
another model call after a successful action, although the host replaced that
reply with a fixed confirmation. The fix reuses protocol/schema metadata,
minimizes draft-selection context and stops after the accepted action. Approval,
source-backed service wording, fresh case reads and no automatic transport replay
remain in place. The original browser assertions/timeouts have not been widened.

The same isolated 20-read workload and actual local-model request were measured
before and after. These are observations on one Windows host, not a controlled
performance study, a cold-start guarantee, or native Alexa+ latency certification.

| Measurement | Before | After |
| --- | --- | --- |
| HTTP requests to `/mcp` for 20 case reads | 100 | 24 |
| First case read | 1,250 ms | 435 ms |
| Median case read | 421 ms | 81 ms |
| p95 case read in this small sample | 1,250 ms | 184 ms |
| Actual AI draft, API benchmark | 33,378 ms; two model calls | 3,166 ms; one model call |
| First model input in that benchmark | 1,256 tokens | 524 tokens |
| Separate actual-AI browser draft review | Earlier user-workflow check: 71,192 ms | 13,012 ms; approval disabled, no page errors; desktop/mobile check passed |

Model loading, prompt caching and machine load affect timings. The API and
browser measurements are different runs; do not treat the faster API figure as
a promise of browser speed. Read/explanation requests still use broader context
and have not acquired a universal low-latency guarantee.

Reproduce the benchmark with:

```sh
npx tsx scripts/verify-performance.ts current --ai
```

This uses an in-memory fictional database and refuses email delivery. Reports
are ignored `.data/verification/performance-*.json`; they contain timing/token
metadata and traces, not messages or credentials. Baseline reports were captured
before changing application code. The script now uses the optimized host.

The backend/type/build gate passes **89 tests**. Added regressions cover shared
discovery, noncached case updates, single-pass action completion, reviewed draft
grounding despite compact inference context, renewed idle deadlines, domain
errors, transport reconnects and no replay of an ambiguous write. An early test
fixture reproduced this host's existing chunk-framing mismatch; setting its
fake MCP server to explicit native chunking corrected the fixture. This was not
a new application transport failure. The subsequent full browser run passed
**all 34 desktop/mobile tests in 2.6 minutes**, with no automatic retries or
longer assertion timeouts. The formerly failing mobile speech/review scenario
also passed six separate repetitions in 42.4 seconds with unchanged assertions.
This is a finite stability check, not proof that latency cannot recur.
Physical voice, external services and long-duration
reliability remain separate validation work.

### October 15 Usability and Packaging Follow-up

The workspace now presents one leading next-step question instead of repeating
it in two sections. Reading/form text is 16 px, principal action targets are at
least 44 px, and mobile actions wrap. Each record has a consistent `Source N`
label across question links, history and newly prepared default drafts.
Technical IDs remain available under **Record details**; attribution, immutable
records and approval protections are unchanged. Waiting replies show real
elapsed time, not invented progress or claims that an action has completed.
The timer is excluded from repeated live announcements.

| Check | Completed result and limits |
| --- | --- |
| Full browser regression | **38/38 passed in 3.4 minutes**, desktop and mobile emulation, no retries or increased assertion timeouts. Includes new next-step/source/readability and delayed-response timer checks. |
| Layout/accessibility | Long-field checks at 320, 390, 768, 1440 and 1920 px passed. Automated accessibility scans detected no violations in the tested states. Desktop/mobile screenshots were visually inspected; this is not physical-device or full accessibility certification. |
| Actual local-AI UI | Installed `qwen2.5:1.5b` prepared a source-backed draft through real MCP and opened disabled-until-approved review in **14,447 ms**. Mobile persisted conversation and no uncaught page errors also passed. In-memory fictional data, no approval/delivery; one local observation, not a latency guarantee. |
| Clean installation | A working-tree source snapshot with no dependencies/build output used a fresh npm cache and `NODE_USE_SYSTEM_CA=1`. `npm ci` installed 265 packages with zero reported vulnerabilities; `npm run check` built that source and passed all **89** backend tests. This was an earlier source snapshot on this Windows host, not a fresh GitHub checkout of the latest fixes or another OS. Generated snapshot removed after checking; logs retained locally. |
| Build/test order | `npm run check` now builds before the HTTP tests that need production assets, so it does not depend on an old `dist` directory. |
| Docker image | Final image built with the optional build-only CA secret. The isolated verifier passed non-root execution, a nondefault-port health check, protected APIs, real HTTP MCP, unapproved-send rejection, private-file exclusions, and case/event/draft persistence after restart. No network access or mail delivery was enabled. |
| Compose | `docker compose config --quiet` passed with placeholder settings. Full model download/inference inside Compose and reverse-proxy HTTPS remain **untested**. |

Earlier runs are not hidden: the first browser run passed 36/38 with two exact
waiting-label lookup failures; separating the visible label from its timer
fixed the markup, and both focused checks passed. Another run passed 36/38 with
speech-workflow failures while setup work was running. The desktop trace shows
a Vite page reload between transcript review and send; the mobile request was
still waiting at its assertion deadline. Do not infer a common root cause or
general stability from these observations. After setup finished, the full
38-test run above passed without changing assertions/timeouts. Avoid concurrent
source-copy/build work during browser verification.

Ignored `.data/verification/fresh-usability-install.log`,
`fresh-usability-check.log`, `usability-browser-final.log`, and
`docker-build-final.log` record this local run. The actual-model UI check is in
`usability-ollama-ui.log`. Do not publish raw machine logs
or trusted-root bundles as submission evidence.

### Scripted Fictional Task: October 21

**Agent-authored browser check, not independent user feedback or measured human
usefulness.** Completed the real UI with isolated in-memory fictional records,
Edge at 1440x1000, Asia/Kolkata, local command mode and the actual capture-only
mail adapter. No network replies were mocked and all six MCP tools appeared in
successful UI response traces. Startup/setup, human reading and decision time
are excluded. Artifact inspection took place after the task clock stopped.

| Final completed run | Scripted seconds |
| --- | ---: |
| Inspect both conflicting source reports | 0.628 |
| Prepare an initial source-backed receipt request | 0.424 |
| Review the insurer reply and answer only receipt | 0.825 |
| Replace the stale request, review and approve local capture | 1.053 |
| Save a due item and verify it after reload | 1.385 |
| Download redacted HTML history | 0.814 |
| Sum of timed steps | **5.129** |
| Wall task time, including between-step screenshots | **6.184** |

An earlier completed run took 7.355 wall seconds; two runs are not a latency
distribution or a benchmark. **Do not present these automated times as a human
completion time, time saved, or evidence of faster repairs.** No notes/email
baseline, unfamiliar participant or wheelchair-user outcome was measured.

Verified outcome: five retained events (including local capture), receipt
answered with provenance, authorization still open, two requests (old draft and
one captured follow-up), one persistent local due item and a downloaded HTML
history. The export was rendered and inspected; original reports, reviewed
receipt, unresolved authorization and message/follow-up history were retained.
Sample known identities were absent, not proof of complete anonymization.
The completed run had **zero unexpected UI/API failures** and no delivered email.

Author-observed clarity risks, not participant complaints:
- Requests stores messages, while Follow-ups stores due items; the terminology
  needs an unfamiliar-user check.
- A changed case requires fresh drafting and approval; these extra steps are
  intentional safeguards, not errors to count as user mistakes.
- Export message history calls the obsolete request `draft`, without the
  workspace's `Stale draft` label. This could make the old request look current.
- Exported messages cite numbered sources, while attributed-history entries show
  UUIDs; matching citations is less direct than in the workspace.

One earlier attempt failed because the new harness mistakenly rejected local
capture along with external email. The harness was corrected to use
`createMail({ MAIL_MODE: 'capture' })`; no application fix was required. This
failed attempt is retained separately, not counted as a successful task or user
mistake. Repeat with `npm run measure:usefulness`; timestamped JSON, screenshots
and the actual downloaded HTML are saved under ignored
`.data/verification/usefulness-*`. Final evidence is
`usefulness-20261021093826/summary.json`; the first completed run is
`usefulness-20261021093709`, and the failed harness attempt is
`usefulness-20261021093620`.

### Manual Voice and User Checks

Use fictional records. Grant microphone permission only if comfortable with the
browser's audio processing. Ask `What is the next step?` and inspect its trace.
Enable spoken replies and confirm the latest answer is read, followed by new
answers; muting must stop it. Loading/reloading alone must not start audio.
Try `Record: the supplier said by phone that the replacement part is delayed.`
Check the review fields/date before saving. Prepare a supplier request and verify
capture is not labelled delivery. Try `Remind me tomorrow`, reload and check one
persistent due item. Deny microphone access once and verify typing still works.
Open review, hide the tab and switch cases while recording/speaking; no stale
transcript, playback or previous-case response should leak into the new view.
These physical checks are still incomplete.

For independent validation, obtain consent and give an unfamiliar participant
two fictional reports. Ask them to identify the missing receipt information,
prepare a neutral follow-up, schedule a check and hand over the history without
step-by-step coaching. Compare with notes/email on an equivalent fictional case;
alternate task order. Never email a real supplier. Record completion, seconds,
wrong sources/recipients/dates, unsupported claims and assistance. Ask what was
confusing; keep objections, not just compliments.

#### Matched Fictional Tasks: Notes/Email Versus MobilityRelay

This is a **ready-to-run protocol, not a completed study**. Use anonymous
participant codes and their consent. Do not collect disability, health or
insurance details. A student/friend can test clarity but cannot establish
wheelchair-user outcomes.

Give one case to notes/email and the other to MobilityRelay. Flip a coin for
the first method; reverse the method order for the next participant. Provide
the same type of source text and task goals in both methods. Include reading,
data entry, corrections and handover preparation in the clock; do not compare
a prefilled app against an empty notes document. Do not send any email.

| Fictional Input | Case A | Case B |
| --- | --- | --- |
| Person / repair reference | Robin / STUDY-A | Taylor / STUDY-B |
| Supplier / address | Pine Mobility / supplier-a@example.invalid | Lake Mobility / supplier-b@example.invalid |
| Insurer / address | Cedar Cover / insurer-a@example.invalid | Elm Cover / insurer-b@example.invalid |
| Supplier email, Oct 21 at 10:00 UTC | "We sent the repair estimate to your insurer." | "We submitted the repair estimate to your insurer." |
| Insurer email, Oct 22 at 10:00 UTC | "We cannot locate the estimate. Please ask the supplier for its submission reference." | "The estimate is not in our records. Please obtain the submission reference from the supplier." |
| Insurer email, Oct 22 at 11:00 UTC | "Authorization is pending." | "Authorization is still pending." |
| Give only after the initial draft | "We received the estimate. Reference A-47. Authorization is still pending." | "We received the estimate. Reference B-62. Authorization is still pending." |

Participant task: understand the two accounts, prepare a neutral follow-up,
incorporate the later insurer reply, update the follow-up appropriately,
schedule a next check and produce a history another person can understand.
Give goals, not button-by-button instructions. Log any coaching requested.
Stop each trial at ten minutes if unfinished and record it as incomplete.

Use the same outcome checklist for both methods:

1. Both original reports are attributed and dated, without assigning blame.
2. The first draft requests the missing submission/receipt information from
   an appropriate contact; every quoted statement matches its source.
3. The later receipt is recorded as a report, not proof of authorization or
   repair completion.
4. The obsolete request is replaced or explicitly labelled for revision.
5. The next follow-up concerns authorization, with an explicit future due time.
6. The handover preserves sources, the receipt reference, remaining uncertainty
   and local-only message status; no actual supplier or insurer is contacted.

Record completion, elapsed seconds, checklist items met (0-6), wrong
recipients/dates/quotes, unsupported claims, unintended sends and assistance.
Ask which step was hardest and what they would do differently. Keep exact
anonymous observations, including negative feedback. Leave the result table
below empty until a real participant completes the task. With a tiny sample,
report individual attempts rather than percentages or general time savings.

Independent user testing is recommended evidence for Design/Potential Impact,
not a listed submission prerequisite. The agent-run checks above confirm
software outputs only; do not enter them as an independent participant below.
[Submission and judging rules](https://amazonappdev2026.devpost.com/rules).

| Anonymous participant/type | Task order/method | Completed | Seconds | Errors/assistance | Feedback |
| --- | --- | --- | --- | --- | --- |
| Not tested | - | - | - | - | - |

A proxy/student test is not a wheelchair-user outcome study. A self-walkthrough
is not independent validation. Small samples inform design, not population
percentages, cost savings, medical benefits or shorter repairs.

## 5. Remaining Work and Submission

Focus on completing evidence and submission, not adding unrelated features.

### Final Submission Order: October 23

The deadline is **October 23, 12:00 pm PDT**, equivalent to **October 24,
12:30 am IST**. Aim to submit at least one hour earlier, leaving time to fix
missing fields or inaccessible links. [Official rules](https://amazonappdev2026.devpost.com/rules).

1. Finish the final build/tests and push the verified source. Freeze features;
   fix only a reproduced submission-blocking defect.
2. Rehearse Maya's fictional case and physically check English dictation and
   playback. If speech fails, use the honest text/form fallback, not a staged
   recording presented as live recognition.
3. Check private-repo access for all five Amazon reviewers and the Devpost
   reviewer specified in the FAQ. Re-send expired invitations through GitHub;
   do not assume an old invitation is still valid.
4. Record the existing 2:45 script below. Show source disagreement, real MCP
   traces, reviewed receipt, authorization still open, invalidated old draft,
   fresh approval, local capture and exported history. Upload the English video
   publicly to YouTube or Vimeo and test its link while signed out.
5. Complete the Devpost description, Alexa+ track selection, setup/testing
   instructions, screenshots, product feedback and optional friction log.
   Claim neither live Bedrock nor SMTP delivery. Only select a mini-challenge
   when its separate requirements have actually been met.
6. Submit and verify the submitted state, repository URL and playable video.
   Do not leave the entry as a saved draft until the final minutes.

Public hosting is **optional**, and partner-only Alexa+ tooling is not required
for our own simulator. Do not spend the remaining submission window attempting
a new deployment or cloud migration. Five scripted personas are test fixtures,
not independent user feedback. [Official FAQ](https://amazonappdev2026.devpost.com/details/faqs).

- [x] Restore the selected case on reload, with validation and a safe fallback (October 22).
- [x] Make the missing-contact prerequisite actionable from Overview and Requests instead of silently disabling request preparation.
- [x] Add a primary first-update action to the empty case Overview and Evidence views.
- [x] Label obsolete drafts clearly in exported case packs, not only in the workspace (October 22).
- [x] Match exported numbered citations to linked, readable attributed-history source labels (October 22).
- [x] Remove the verified chat-history startup dependency and parallelize settings/case-list loading; delayed/error-history and speech-history regressions pass. Earlier intermittent wait failures do not have a conclusively established root cause.
- [ ] Verify physical microphone accuracy, broader speaker/device compatibility and keyboard/screen-reader usability.
- [x] Creator reported hearing the latest reply after the October 23 replay fix. This is a single reported playback check; microphone accuracy, device compatibility and screen-reader usability remain open.
- [x] Add and test question-specific grounded read selection, case-version-bound conversation focus and narrowly scoped contextual drafts; future-outcome questions cannot become predictions (October 23).
- [x] Ground supported supplier/insurer read questions in dated MCP sources; make unsupported local questions explicit and contain speech-service/playback failures (October 22). Physical verification is still required for hardware claims.
- [x] Remove model waits for supported case reads and redacted HTML history exports; October 19 working-tree verification is recorded above.
- [x] Remove inference waits for supported exact recipient/topic draft requests; separately test the actual model path and preserve approval (October 22).
- [x] Bound failed case reads, provide safe retry and remove the duplicate initial case-list request (October 22).
- [x] Complete five fictional-persona workflows on desktop/mobile, preserving the distinction from human usability evidence (October 22).
- [x] Reproduce and prevent private verification exports from reloading the development workspace or discarding unsent text; desktop/mobile regressions pass (October 23).
- [ ] Review broader model behavior and slow complex requests; the spot checks do not establish general accuracy or fast inference.
- [ ] Recommended, not compulsory: complete an unfamiliar person's fictional task; record failures and feedback.
- [x] Complete a scripted fictional UI task, record timings/clarity risks and inspect the actual export (October 21). This does not replace the unfamiliar-person check.
- [ ] If claiming delivery, test SMTP to an inbox you control and distinguish acceptance from receipt. Otherwise keep capture labels.
- [x] Recheck current rules and FAQ (October 23): the own-simulator route is accepted and public hosting is optional. Private-repo reviewers and the public demo still need verification.
- [x] Add bounded read-only connection recovery and explicit startup retry, including controlled post-login recovery; remove the redundant case fetch before read-only review proposals (October 23).
- [ ] Confirm reviewer access/invitations and submission fields. One reviewer invitation may not cover all requirements. For a private repo, check the current required reviewer list and accepted invitations; otherwise verify public access and detectable licensing.
- [ ] Publish an English video under three minutes, with fictional data and honest integration labels.
- [ ] Submit feedback for every relevant product actually used; fill the log below as observations happen.
- [x] Verify the published implementation from a fresh GitHub checkout (`40b4da8`, October 20): clean install, build, 146 backend tests and 60 browser tests passed. Repeat relevant checks if implementation changes again.
- [ ] Optional: deploy over HTTPS with persistent storage and test auth/TLS/end-to-end behavior. The app image smoke test passes; verify the complete Ollama Compose stack if using it.
- [ ] Optional AWS Builder: actually validate Bedrock and current bonus eligibility before claiming it. Code alone is not live use.
- [ ] Optional Open Source: keep MIT licensing and check the mini-challenge separately; a license alone may not satisfy additional contribution requirements.

No native Alexa+ account linking, supplier/insurer APIs, multi-user tenancy,
background chasing, OS notifications, attachment ingestion or certified
medical/legal/privacy compliance is implemented. Firefox, Safari, physical mobile
devices, another OS, sustained/adversarial load and penetration testing remain
unverified. These gaps must not be presented as working features.

### How the Project Supports Judging

| Criterion | Demonstrated strength | Remaining evidence |
| --- | --- | --- |
| Tech Implementation | Real MCP HTTP calls, six tools, persistence, bounded AI and reviewed approval | Broader model-quality tests; any external integration claimed must be live-tested. |
| Design | Responsive workspace, attributed reports, correction/review, voice/text and export | Physical accessibility and an unfamiliar-user walkthrough. |
| Potential Impact | A defined coordination task for wheelchair users/caregivers with sourced problem evidence | Measure task effort/errors; no established real-world savings yet. |
| Quality of the Idea | A complete source-backed workflow, not only a Q&A bot | Show the full loop clearly; do not claim global uniqueness. |

Eligibility, bonus awards and scores are the judges' decision. This is an
evidence map, not a winning probability or promise of full marks.
[Rules](https://amazonappdev2026.devpost.com/rules),
[resources](https://amazonappdev2026.devpost.com/resources),
[FAQ](https://amazonappdev2026.devpost.com/details/faqs).

## 6. Demo Script: Target 2:45

### Generated Cut: October 23

A narrated cut is generated: **177.1 seconds (2:57.1), 1920x1080,
H.264 video with stereo AAC audio, approximately 13 MB**.

**YouTube demo:** [Watch MobilityRelay](https://youtu.be/5D_LI0jyQ2o).
The creator supplied this uploaded-video link on October 24. YouTube's public
oEmbed endpoint returned video metadata without authentication. Complete
signed-out playback and completed Devpost submission have not been verified.
Local output files are intentionally ignored by Git:

- `.data/demo-video-2026-10-23/MobilityRelay-demo-upload.mp4`: latest captioned upload cut with the shortened source credit.
- `.data/demo-video-2026-10-23/MobilityRelay-demo-1080p.mp4`: previous captioned cut; Windows kept it locked during the final credit edit.
- `.data/demo-video-2026-10-23/MobilityRelay-demo-narrated.mp4`: narration without burned captions.
- `.data/demo-video-2026-10-23/captions.srt`: optional uploadable captions.
- `.data/demo-video-2026-10-23/narration.txt`: the spoken text.
- `.data/demo-video-2026-10-23/capture.json` and `video-report.json`: provenance and checks.
- `.data/demo-video-2026-10-23/video-upload-report.json`: checks and exact path for the latest upload cut.

`scripts/record-demo.ts` uses a separate in-memory seeded workspace and records
actual Edge interactions. No existing user cases are modified. The capture
asserted all six real MCP tools, one actual Ollama interpretation, receipt
answered with authorization still open, one local capture and a persistent due
item. It recorded zero application errors. Typed inputs are shown; no physical
microphone recording or email delivery is implied.

`scripts/render-demo.mjs` creates original title graphics, chapter headers,
computer-generated English narration and captions. Startup pauses are trimmed
and frames can be held; action footage is not sped up. The narrator is the
installed Microsoft David Desktop voice, not a cloned person. Captions use
estimated phrase timing and should be reviewed. There is no background music.

Checks passed: TypeScript, JavaScript syntax, full FFmpeg decode, browser media
metadata at 1920x1080 and under 180 seconds, and inspection of representative
frames. Audio decoding passed with mean volume -21.7 dB and peak -4.1 dB. These
machine checks do not replace the creator listening to the complete video or
confirming the captions. They also do not establish independent user benefit.

To reproduce on this Windows setup with Edge, System.Speech, and
`qwen2.5:1.5b` already available in local Ollama:

```powershell
$env:DOTENV_CONFIG_PATH='NUL'
$env:NODE_USE_SYSTEM_CA='1'
npx playwright install ffmpeg
npm install --prefix .data/demo-tools --no-save --package-lock=false ffmpeg-static@5.3.0
node --import tsx scripts/record-demo.ts
node scripts/render-demo.mjs
```

The encoder is separate ignored tooling, not a new application dependency.
The README now links the supplied YouTube URL through the project thumbnail.
Review the complete uploaded video while signed out and use that same URL in
Devpost. The local scripts generate files; they do not upload or submit them.

### Judge-to-Demo Verification: October 23

The [official rules](https://amazonappdev2026.devpost.com/rules) were rechecked
against the implemented code and actual capture. The four criteria are equally
weighted. This is a submission audit, not a prediction of judging results:

| Criterion | Evidence shown in the final cut | What this does not establish |
| --- | --- | --- |
| Tech Implementation | All six MCP tools called over Streamable HTTP; an actual Ollama interpretation; a reviewed reply updates receipt but not authorization; stale approval is disabled; fresh exact-message approval leads to local capture. | Native Alexa+ access, live email delivery or AWS execution. |
| Design | Source-linked reports, preview before recording, explicit approval, a visible two-open-to-one-open change, a saved due item surviving reload and a readable export. | Independent usability results or physical microphone accuracy. |
| Potential Impact | A specific repair-coordination task, published problem evidence and a source-linked history that can be handed over. | Measured repair acceleration or proven real-world benefit. |
| Quality of the Idea | Stateful repair coordination with source attribution and evidence-bound approvals, rather than a single-turn Q&A demonstration. | Global uniqueness or a guaranteed shortlist or win. |

The introduction cites [Worobey et al.'s repair study](https://experts.umn.edu/en/publications/wheelchair-repairs-delays-causes-and-associated-outcomes/)
(2025, DOI `10.1016/j.apmr.2024.10.001`). Among 301 wheelchair users with spinal
cord injury reporting repairs, vendor noncompletion after contact was the most
common reason for incomplete repairs. This supports the problem context, not
MobilityRelay's effectiveness; it is not a prevalence claim about all users.
The on-screen credit is shortened to "Source: Worobey et al., 2025."; the full
reference and its scope remain here rather than crowding the video.
That credit-only revision is saved as `MobilityRelay-demo-upload.mp4` because
Windows locked the earlier `MobilityRelay-demo-1080p.mp4`. Use the upload file;
its duration, narration, captions and walkthrough are unchanged.

The first cut made the stale-warning text visible but framed the disabled
approval control poorly. The retake scrolls the actual disabled checkbox into
view and holds it for six seconds, keeps reviewed-reply controls visible and
shows the before/after question counts. Representative final encoded frames
were inspected, not only raw screenshots. The retake again recorded zero
application errors, all six tools and one real model inference.

The final closing describes implemented features only. Fictional-case,
computer-narration and local-capture labels remain so the footage cannot be
mistaken for a live supplier/insurer integration. The final MP4 and sidecars
replaced the earlier files at the paths above; the original cut is retained
under `.data/demo-video-2026-10-23/first-cut/`. The creator subsequently supplied
the YouTube link above. Complete uploaded-video playback, private-repository
reviewer access and completed submission still need external confirmation.

### Original 2:45 Recording Plan

| Time | Show and say |
| --- | --- |
| 0:00-0:15 | Open Maya's labelled fictional case. "MobilityRelay is a simulated Alexa+ repair assistant with a real MCP server. The supplier reports sending an estimate; the insurer reports not locating it." |
| 0:15-0:35 | With the tested Ollama model enabled, ask/type "Put the accounts from the two organizations side by side." Show both dated source quotations and the real MCP trace. This wording exercises model interpretation into a validated read view; the source text comes from records, not generated facts. Warm the model first and retain honest wait timing. |
| 0:35-0:55 | Ask/type "Ask the supplier for that reference." Show real `prepare_repair_request`, one scoped receipt question and source-backed wording. Explain that this contextual action uses the current, version-bound conversation focus and deterministic MCP routing, not a second inference call. Leave it unapproved. |
| 0:55-1:20 | Say/type "The insurer replied: We received the estimate. Reference AB-47. Authorization is still pending." Label this a fictional reply. Confirm source/date, add the reply reference and open Preview changes. No evidence is saved yet. |
| 1:20-1:40 | Show the exact receipt quotation. Select the receipt answer and explicitly confirm. "Received is not approved. Authorization is still unanswered." Show the real `record_repair_event` trace and persistent What changed summary. |
| 1:40-2:00 | Open the old request: approval is disabled. Prepare a fresh draft from current questions; show authorization included and receipt excluded. Nothing is sent automatically. |
| 2:00-2:20 | Review and approve the fresh draft: "This is local capture, not email delivery." Then say "Remind me tomorrow" and show the saved local due item. |
| 2:20-2:35 | Export a redacted HTML history with sources, the reviewed answer and remaining authorization question. |
| 2:35-2:45 | Cite the 301-person study. "Six real MCP tools; user-reviewed information, not a promise of approval, faster repairs or supplier response." |

Use only features that actually work. Do not pass fixtures off as real records,
capture off as delivery, or optional Bedrock code off as tested AWS use. For local
AI, show the Ollama/model badge, warm the model and measure the wait. If the video
edits out waiting, disclose it; do not imply real-time speed. Use a separate case
for approval-failure demonstrations. The public English video must stay under
three minutes.

## 7. Product Feedback and Friction Log

These are recorded observations, not invented vendor feedback. Where the cause
is uncertain or our own configuration, say so. The bonus is discretionary.
Add version, reproduction, impact, workaround and a concrete suggestion for
each submission-relevant product used. Attach sanitized evidence only.

### Product Feedback Answers

These are developer assessments, not independent user testimonials. Unexercised
service paths are explicitly marked. The table covers purpose, onboarding,
positives, friction and whether we would use the tool again.

| Product / purpose | Onboarding and what worked | What needs work / limits observed | Would build again? |
| --- | --- | --- | --- |
| Alexa+ docs / track integration | Compared resources, quickstart and FAQ; the own-simulator route enabled development without partner access. | Access context is not equally prominent on every setup page. No native SDK/device testing was possible. | Yes for the simulator route; native access is unevaluated. |
| MCP TypeScript SDK / runtime tools | Registered six Zod-backed tools and initialized/discovered/called them over HTTP. Typed contracts and traces are useful. | Our bridge needed framing tests on this host; vendor cause is unknown. Repeated negotiation was our inefficiency, now fixed. | Yes, with protocol/lifecycle tests. |
| Ollama / local inference | Downloaded a model, adapted `/api/chat` tool calls and verified real browser draft review without AWS. | CPU latency, truncated reasoning output and small-model choices needed bounded prompts and trusted confirmations. | Yes, with explicit hardware/model limits. |
| Bedrock Runtime SDK / optional inference | Implemented typed Converse/tool-use input and tested controlled responses. | No live AWS/model access. Service setup, cost, latency and reliability are unverified; no usage bonus claimed. | Yes for the typed adapter; live evaluation is pending. |
| React / review workspace | Built views, forms, dialogs and conversation state. Components support explicit review. | Async speech/focus lifecycles needed application tests, not a demonstrated React defect. | Yes, with browser regressions. |
| Vite / assets | Integrated Express middleware and produced the production bundle. | Our initial configuration exposed a fictional canary. Cache isolation and private-file denials were needed. | Yes, with separate private-storage boundaries. |
| TypeScript and Zod / contracts | Types and schemas validate tools, forms and configuration; malformed inputs have tests. | Types do not verify model claims or authorize writes. No separate product defect reproduced. | Yes for compile/runtime boundaries. |
| Node.js / SQLite | Node 24 avoids a separate database server. Restart, correction, deletion and interrupted-send behavior pass tests. | SQLite is marked experimental on this host. Plaintext/shared-workspace storage is not clinical-grade isolation. | Yes for a bounded prototype, not a compliance claim. |
| Express / host | Wired sessions, CSRF, Host/Origin checks, API routes and assets around MCP. | Middleware ordering, parser errors and file boundaries needed explicit application checks. | Yes, with a reviewed middleware stack. |
| Undici and on-headers / HTTP | Owned dispatchers, cancellation and framing hooks support the tested transport. | Avoid creation-time deadlines and repeated client setup. Header-normalization source remains unknown. | Yes, with wire/reconnect/no-replay tests. |
| Browser speech / optional voice | Added review, opt-in replies and text fallback; controlled callbacks pass tests. | Hardware/accuracy unverified; browser availability and vendor processing vary. | Yes as progressive enhancement, retaining forms/text. |
| Playwright and axe / verification | Installed Edge supports desktop/mobile, keyboard, layout and accessibility checks. | Registry resolution needed a pin. Automated scans do not replace real assistive-technology/user tests. | Yes, with coverage limits disclosed. |
| Playwright recording and FFmpeg / demo production | Captured real UI interactions, encoded a 1080p H.264/AAC cut and checked full decoding. Separate ignored encoder tooling kept application dependencies unchanged. | The recording binary was not initially installed. Caption timing is our estimated edit, not word alignment or an encoder defect. | Yes, with a complete playback review before publishing. |
| Windows System.Speech / demo narration | Installed Microsoft David Desktop voice generated English WAV narration locally without API credentials. | Computer-generated delivery and estimated captions still need the creator's listening review. This is video narration, not evidence of working physical microphone input. | Yes for an explicitly labelled narrated cut. |
| Docker and Compose / packaging | Built a non-root image; isolated production/MCP/volume checks pass. Shared namespace configuration preserves loopback access. | Container npm lacked host trust roots. A build-only CA secret fixed TLS. Full Ollama/TLS stack is untested. | Yes, with documented trust/network setup. |
| Nodemailer / optional SMTP | Implemented TLS-required SMTP and distinct capture/provider states around reviewed messages. | No provider configured or live acceptance/receipt demonstrated. Capture is not delivery. | Yes for the adapter; test a controlled inbox first. |
| Lucide / icons | Used familiar action icons with labels/tooltips. | No product defect reproduced; sizing/tap areas are our responsibility. | Yes for consistent controls. |
| Git/GitHub / handover | Pushed source, license, assets, tests and one guide; private data is ignored. | Confirm reviewer access if private. Local testing is not fresh-OS validation. | Yes; verify access at submission. |

### Detailed Friction Examples

| Task / reproduction | Expected vs actual | Severity / workaround / suggestion |
| --- | --- | --- |
| Determine Alexa+ access: read resources/setup docs, cross-check FAQ. | Expected consistent guidance; FAQ confirms preview tooling is unavailable to entrants. | Important: used our simulator; suggest access banners on quickstarts. |
| Build image: run `docker build`, observe `npm ci`, retry with already-trusted public roots as a BuildKit secret. | Expected verified registry downloads; initial certificate-chain failure, then success with the mounted CA bundle. | Important, environment-specific: keep TLS enabled; document trusted corporate-root setup instead of disabling SSL. |
| Historical Vite check: put a fictional canary in private storage, request without API authentication. | Expected denial; initial configuration served it. Current direct/encoded/`@fs` checks deny access. | Critical application bug, fixed: deny private paths and separate storage/cache; suggest a full-stack private-storage example. |
| Historical MCP check: exercise success/error/notification paths and raw TCP. | Expected valid framing; some responses advertised chunking without matching chunks. | Important, cause unproven: native framing and wire tests; suggest success/error bridge examples. |

| Date/product | Observation | Workaround and suggestion | Evidence |
| --- | --- | --- | --- |
| Oct 11: Alexa+ docs/Devpost | Recorded FAQ said entrant SDK/Toolkit/CLI/Web Simulator access was unavailable; setup pages lacked that context. | Built an independent simulator. Suggest an access banner on quickstarts. | [FAQ](https://amazonappdev2026.devpost.com/details/faqs); no native integration claimed. |
| Oct 11: Node/npm on Windows | Registry TLS failed with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` on this host. | `NODE_USE_SYSTEM_CA=1`; verification stayed enabled. Suggest platform-specific system-CA guidance. | Local installation observations; omit machine paths/private logs. |
| Oct 11: npm/Playwright registry | Floating range selected an unavailable `playwright-core@1.62.1`. | Pinned Playwright 1.56.1 and used installed Edge. Suggest clearer missing-transitive-version errors. | Recorded `ETARGET`. |
| Oct 11: npm | Interrupted installation led to `Invalid Version` during optional Rollup deduplication. Vendor cause unproven. | Scoped clean dependency/lockfile install. Suggest detecting incomplete optional metadata. | Local installation failure. |
| Oct 11: MCP SDK/Express bridge | Invalid chunk-size error on this Windows host; cause not isolated to SDK. | Official transport plus Node framing and real wire tests. Suggest tested Express bridge examples. | `server/app.ts`, `tests/http.test.ts`. |
| Oct 13: Ollama 0.40.3/qwen3:4b | Minimal greeting with `think:false` and then `/no_think` returned reasoning-like content and exhausted output limit. | Reject unfinished output; switched to qwen2.5:1.5b. Suggest model/version-specific smoke examples. | `server/ollama.ts`, `tests/ollama.test.ts`. |
| Oct 13: Ollama/qwen2.5:1.5b | Full-record prompts timed out/returned empty drafts; some choices/status narration were wrong. Not a proven Ollama bug. | Bounded summaries, scoped references/topics and trusted confirmations. Suggest constrained small-model tool examples and diagnostics. CPU latency remains slow. | `scripts/verify-ollama.ts`, `scripts/verify-ollama-ui.ts`; fictional checks. |
| Oct 14: Vite middleware | Our configuration served a fictional private-file canary anonymously. | Deny private paths, disable public directory, separate cache. Suggest a full-stack private-storage example. | `tests/security.test.ts`; [Vite docs](https://vite.dev/config/server-options#server-fs-deny). |
| Oct 14: MCP/Express HTTP framing | Raw TCP saw chunked headers without matching chunks despite local content-length metadata; normalization cause unknown. POST-only fix missed error paths. | Uniform `on-headers` hook and native chunks. Suggest success/error framing tests and no write retries. | `scripts/verify-http-framing.ts`, `tests/http.test.ts`; status paths 200/202/405/401/403/400. |
| Oct 15: Ollama/qwen2.5:1.5b | A live run missed the reminder write and generated an unsupported authorization prediction. These are model/application integration observations, not a proven Ollama-runtime defect. | Trusted short-command routing and structured case-read rendering; suggest small-model examples that test actual writes and unsupported factual claims, not just HTTP success. | `tests/agent.test.ts`, `scripts/verify-ollama.ts`; seven-scenario rerun passed with fictional data. |
| Oct 19: application command routing | The host waited for model interpretation before returning a structured case brief or standard HTML export: 47.9/39.9 seconds in local API probes. This was application overhead, not a demonstrated MCP/Ollama defect. | Route exact supported commands through real MCP without inference; retain inference for draft selection and ambiguous requests. Suggest documenting separate tool, model and browser timings. | `scripts/verify-performance.ts`, `tests/agent.test.ts`, `tests/http.test.ts`; same API probes now 158/224 ms, with local spot-check limits above. |
| Oct 20: application reply review / React / Playwright | Inspection found that the old stale-draft button reused old question IDs/body. A 320px screenshot also showed the preview retaining an offscreen title. New exact-label test selectors failed on populated nested controls; this was test code, not a proven vendor defect. | Fresh drafts now select current questions, preview resets scroll without stealing focus, and tests use accessible roles/names. Suggest testing before/after review, rejected saves and narrow-screen transitions together. | `server/replies.ts`, `tests/replies.test.ts`, `tests/reply-review.spec.ts`; fictional cases only, no delivered mail or independent user feedback. |
| Oct 22: application routing, loading and browser speech | Common draft selection still waited for a model despite an explicit role/topic. Failed reads could leave a loading spinner; an empty speech session could end silently. These are application observations, not proven MCP/Ollama/browser defects. | Strict direct MCP draft commands, bounded read-only loading with retry, no-transcript feedback and five fictional-persona workflows. Keep complex-model latency, physical audio and independent usefulness claims separate. | `tests/demo-users.spec.ts`, `tests/api.test.ts`, `tests/agent.test.ts`, `tests/qa.spec.ts`; labelled scripted results, no human testimonials. |
| Oct 23: application Vite watch configuration | Saving private verification HTML triggered development page reloads and could discard unsent input. A controlled browser regression reproduced it. | Exclude private data and generated test reports from file watching; keep private-file serving denied. Suggest testing generated exports with unsent input present. | Regression fails before the fix and passes on desktop/mobile afterward; final focused run 22/22, not a completed full-suite claim. |
| Oct 23: application conversation / local model | The short comparison was rejected; an unnecessary tool call, invalid read pairing, irrelevant conversation context and wrong read views were observed in actual model tests. These are not established SDK/runtime defects. | Support natural read shortcuts; use JSON-schema-constrained view selection, minimal read context and deterministic outcome limits. Version-bound focus scopes contextual drafts. Suggest examples measuring correct interpretation, not just schema-valid output. | `tests/conversation.test.ts`, `tests/conversation.spec.ts`, `scripts/verify-conversation.ts`; failed attempts retained and later seven-step run passed with three real inference calls. |
| Oct 23: application speech playback | Enabling sound after a reply did not replay it; the creator reported no audible output. | Replay the latest reply on explicit opt-in, prefer available English voices, resume paused synthesis and report silent startup. Suggest testing opt-in after history has loaded, not only before a new reply. | 18/18 focused browser checks passed. Creator subsequently reported hearing the reply; not an independent speech-accuracy study. |
| Oct 23: application timestamp handling | String ordering of valid ISO timestamps with different UTC offsets selected the wrong stage or next follow-up. Source dates could be labelled UTC without conversion. | Compare instants consistently and normalize explicit UTC labels while preserving raw evidence and reviewed messages. Suggest offset-crossing and equal-instant fixtures, not just `Z` timestamps. | Four regressions failed before the fix and pass afterward; targeted real-MCP desktop/mobile checks passed 2/2. |
| Oct 23: npm / transitive dependency | The current audit reported a moderate `ip-address@10.7.3` advisory. Registry TLS initially failed on this Windows host. | Updated the compatible transitive dependency to 10.7.4 and used Node system trust roots, keeping TLS verification enabled. Suggest separating environment trust errors from actual audit results. | Production and full npm audits then reported zero known advisories; [upstream advisory](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5). This is not proof of complete security. |
| Oct 23: application startup and review latency | A failed startup could look like an empty workspace. Read-only proposals waited for a redundant case read; one measured 4,583 ms. A controlled post-login failure also exposed an initialization race. | Explicit read-only recovery, one bounded GET connection retry and initialized-state gating; review-only proposals no longer reload unchanged case data. Fixture GETs allow one documented reset retry, never write replay. | Regression attempts and focused results are retained in the submission reliability section. The original connection-reset cause is not established; no unconditional smoothness claim. |
| Oct 23: local demo recording/encoding setup | No FFmpeg was on PATH and Playwright's recording binary was absent. These were setup prerequisites, not reproduced product defects. | Installed Playwright FFmpeg and a separate `ffmpeg-static@5.3.0` encoder under ignored tooling. Suggest a recording preflight that checks the recorder and final export encoder separately. | Actual six-tool capture and final 177.1-second MP4 passed decoding/metadata checks; listening review and public upload remain separate. |
| Oct 23: demo presentation review | The first cut showed the stale warning but made its disabled approval checkbox easy to miss; reviewed form controls needed clearer framing. This was a capture issue, not a reproduced application defect. | Retook real interactions with explicit scrolling, a six-second disabled-control hold and a visible two-open-to-one-open result. | Final encoded frames inspected; full playback approval remains the creator's check. |
| Pending: Bedrock | No real account/model-enabled run observed. | Record access, tool use, latency/cost only after a controlled live test. No live AWS qualification claimed. | Optional `server/agent.ts` adapter, not live evidence. |
| Pending: SMTP provider | No real provider delivery test observed. | Keep capture labels; record TLS setup, acceptance/error and receipt separately after testing. | No provider feedback claimed yet. |

Add further reproduced speech/MCP issues here. Do not upload credentials,
identifying records or raw private logs. Keep application defects separate from
environment restrictions and proven product defects.

## Reference Links

- [Repair-delay study](https://pubmed.ncbi.nlm.nih.gov/39427781/)
- [Hackathon rules](https://amazonappdev2026.devpost.com/rules)
- [Hackathon resources](https://amazonappdev2026.devpost.com/resources)
- [Hackathon FAQ](https://amazonappdev2026.devpost.com/details/faqs)
- [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Alexa+ MCP quickstart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html)
- [Bedrock Converse](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/command/ConverseCommand/)
- [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs)
