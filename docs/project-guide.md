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
| What works now? | Case records, reviewed updates, unanswered questions, source-backed drafts, exact-message approval, local message capture, follow-ups and HTML/JSON export. |
| Is MCP real? | Yes. The web host initializes, discovers and calls six tools over HTTP using the official MCP SDK. |
| Is AI real? | Optional local Ollama inference has been tested. Default local mode is a limited command interpreter, not an LLM. |
| What is not verified? | Native Alexa+, live Bedrock, real SMTP delivery, physical speech hardware, public hosting and independent user benefit. |
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

### The User Journey

1. Create a case and add supplier/insurer contacts.
2. Record what someone said, when, through which channel and from which source.
3. Review the recorded situation and its unanswered questions.
4. Prepare a request using those sources; check recipient and wording.
5. Approve the exact message. Default mode captures it locally, not by email.
6. Track a follow-up, record a response or correction, and export the case pack.

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

### Hosting

The project's recorded [hackathon FAQ](https://amazonappdev2026.devpost.com/details/faqs)
permits a locally runnable repository and functioning demo; public hosting is
not a main-track prerequisite. Recheck the official rules before submission.

A public demo can make review easier, but it has not been deployed or TLS-tested.
Use fictional data. Production/public binding requires an `APP_PASSWORD` of at
least 16 characters, a separate `MCP_TOKEN` of at least 32 characters and an HTTPS
`PUBLIC_ORIGIN`. Terminate TLS at a reverse proxy. The Dockerfile targets one
instance with a persistent `/data` volume; an ephemeral serverless filesystem
does not suit this SQLite deployment as-is. Docker runtime has not been tested.

This is a shared-password workspace, not a tenant-isolated healthcare system.
Do not host real sensitive records without further security review, encryption,
access controls and operational policies.

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
| `record_repair_event` | Case, request ID, party, source, channel, report date, statement, situation, optional correction link | Appends an attributed update. Called only after user review in the simulator. |
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

### AI Is Bounded; Actions Are Reviewed

- Both AI modes discover the real MCP catalog. Default local commands also call MCP.
- The host injects the active case, restricts requested operations and resolves short case-scoped contact/question references to real IDs.
- The model cannot record evidence or send messages. Follow-up tools may create only, not edit or cancel existing items.
- Source-backed draft wording comes from the repair service, not arbitrary model-written subject/body claims.
- Read context is bounded: six recent messages, up to 12 current sources, 15 open questions, ten contacts, five request statuses and eight follow-ups. Draft selection receives only scoped contacts/questions and omitted counts, not full reports or chat history; the service still uses the actual reports to produce the reviewed message. This is not a complete AI case audit.
- The loop allows at most five turns/eight attempted tools. Bedrock call/conversation limits are 25/45 seconds; Ollama limits are 90/150 seconds. These are bounds, not speed guarantees.
- Equivalent writes share an idempotency key within a conversation. Provider failure does not silently switch modes or replay a write; a completed action retains its handle and trace.
- The first successful requested action immediately returns its trusted host confirmation, without another inference pass or further actions from that model batch. Direct delivery-status answers also use actual recorded state. Free-form read answers can still overclaim; general model accuracy is not established.

The web host reuses one initialized MCP client and discovered tool catalog for
its lifetime. Concurrent first reads share negotiation. Only schema metadata is
cached: every case read still performs a real HTTP tool call and reads current
storage. The owned Undici dispatcher keeps non-pipelined, closed HTTP connections;
HTTP and tool-request deadlines renew for each operation. Initialization and
discovery are separately bounded. A domain rejection preserves the healthy client;
a transport/protocol failure invalidates it, and only a later request reconnects.
Shutdown closes the client and dispatcher. Standalone diagnostic clients remain
short-lived. There is no automatic write retry or global dispatcher replacement. Read-only
replies refresh chat without a redundant case read; writes/review proposals and
periodic synchronization still refresh case data.

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
are ignored. Spoken replies are opt-in, do not replay history and stop at review
boundaries. Browser recognition may use a vendor cloud even with local inference.

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

**Full QA baseline: October 14, 2026.** These results apply to the tested
implementation committed as `a6995f4`; this documentation consolidation changes
no application code. Tests use isolated fictional records, not real health data.

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

| Check | Latest result | Important limit |
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

### Manual Voice and User Checks

Use fictional records. Grant microphone permission only if comfortable with the
browser's audio processing. Ask `What is the next step?` and inspect its trace.
Enable spoken replies and confirm only a new answer is read; muting must stop it.
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

| Anonymous participant/type | Task order/method | Completed | Seconds | Errors/assistance | Feedback |
| --- | --- | --- | --- | --- | --- |
| Not tested | - | - | - | - | - |

A proxy/student test is not a wheelchair-user outcome study. A self-walkthrough
is not independent validation. Small samples inform design, not population
percentages, cost savings, medical benefits or shorter repairs.

## 5. Remaining Work and Submission

Focus on completing evidence and submission, not adding unrelated features.

- [ ] Verify physical microphone, audible replies and keyboard/screen-reader usability.
- [ ] Review more real local-AI answers for unsupported claims and slow responses.
- [ ] Complete an unfamiliar person's fictional task; record failures and feedback.
- [ ] If claiming delivery, test SMTP to an inbox you control and distinguish acceptance from receipt. Otherwise keep capture labels.
- [ ] Recheck current rules, reviewer access/invitations and submission fields. One reviewer invitation may not cover all requirements.
- [ ] Publish an English video under three minutes, with fictional data and honest integration labels.
- [ ] Submit feedback for every relevant product actually used; fill the log below as observations happen.
- [ ] Verify the latest committed version from a fresh checkout.
- [ ] Optional: deploy over HTTPS with persistent storage and test auth/TLS/end-to-end behavior. Test Docker if using it.
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

| Time | Show and say |
| --- | --- |
| 0:00-0:15 | Open Maya's labelled fictional case. "MobilityRelay is a simulated Alexa+ repair assistant with a real MCP server. The supplier reports sending an estimate; the insurer reports not locating it." |
| 0:15-0:35 | Show both dated sources and the receipt question. "We don't decide who's at fault. We ask what information is missing." |
| 0:35-1:00 | Say/type "Prepare a request to the supplier." Show the real MCP trace and source-backed draft. Disclose text fallback if used. |
| 1:00-1:25 | Show disabled approval/send, review recipient and wording, then approve. "This is local capture, not email delivery." The question remains open. |
| 1:25-1:45 | "Remind me tomorrow." Show the saved due item and reload persistence. Do not promise background messaging. |
| 1:45-2:10 | Switch to coverage refusal or technician shortage. Show a request for a written reason/availability, not a diagnosis or promised repair. |
| 2:10-2:30 | Export and open a redacted HTML case pack with sources and unresolved questions. |
| 2:30-2:45 | Show six tools/protocol evidence. Cite the 301-person study. "We target clearer coordination, not proven faster repairs." |

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
