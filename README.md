# MobilityRelay

**A clearer next step when a wheelchair repair gets stuck.**

MobilityRelay helps wheelchair users and caregivers bring scattered repair
updates into one dated record, identify unanswered questions, and prepare a
source-backed follow-up they can review and approve.

Built for the **Alexa+ track** of the Amazon Developer Hackathon: an independent
voice/text **Alexa+ experience simulator**, backed by a real self-hosted MCP
server over Streamable HTTP. Native Alexa+ integration is not claimed.

[Quick Start](#quick-start) | [How It Works](#how-it-works) |
[Verification](#verification) | [Project Guide](docs/project-guide.md)

![MobilityRelay workspace showing two attributed repair reports, unanswered questions and the Alexa+ experience simulator](assets/workspace.png)

*Actual application screenshot using fictional records and the local command
simulator, not native Alexa+ or a live supplier integration.*

## The Problem

> The supplier says, "We sent the estimate."
> The insurer says, "We cannot locate it."
> The user is left to work out what happened and whom to ask next.

MobilityRelay preserves both reports without assigning blame. It turns the gap
into an actionable question: **Was the estimate received, and what reference
can confirm it?** The next request cites the user's recorded sources rather
than inventing an answer.

A 2025 study of 301 wheelchair users with spinal cord injury found vendor
noncompletion after contact was the most common reported reason for incomplete
repairs. This supports the coordination problem, not the effectiveness of our
app or a population estimate for all wheelchair users.
[Read the study](https://pubmed.ncbi.nlm.nih.gov/39427781/).

## How It Works

**Record -> clarify -> prepare -> approve -> follow up -> export**

- **Keep the history:** record attributed, dated updates; corrections preserve the original source.
- **Find the next question:** show missing information and the reports behind it, not a verdict about who is wrong.
- **Review before acting:** prepare a source-backed draft and approve the exact recipient and message. Default mode captures it locally, not by email.
- **Review what changed:** paste a reply or say "The insurer replied: ..."; inspect exact supporting quotations and a before/after preview, then explicitly select and confirm answers. Receipt can be answered while authorization stays pending; stale drafts require a fresh request.
- **Hand over the case:** save persistent follow-ups and export an HTML/JSON history with optional known-identity redaction.

Speech input and spoken replies are optional; text and forms remain available.
Follow-ups are local due items, not autonomous messages or background reminders.
Reply recognition is deliberately narrow and rule-based, not general email
understanding. Ambiguous replies remain evidence only; no inbox connection or
independent verification is claimed.

## Real MCP, Reviewed Actions

```text
React workspace -> Express host -> MCP SDK client over HTTP
                -> /mcp -> validated repair tools -> SQLite
```

The host initializes the server, discovers its tools and calls them over HTTP;
successful calls appear in the conversation trace. Protocol `2025-11-25` is
covered by wire tests.

| MCP tool | Purpose |
| --- | --- |
| `record_repair_event` | Save reviewed evidence and explicitly selected, source-backed reply answers. |
| `get_repair_brief` | Read the history, unanswered questions and next steps. |
| `prepare_repair_request` | Prepare a draft without sending it. |
| `send_approved_request` | Attempt only the exact message with valid user approval. |
| `manage_repair_followup` | Maintain a persistent follow-up item. |
| `export_repair_packet` | Export a source-attributed HTML or JSON case history. |

AI cannot record evidence or send messages through the simulator. Those actions
require trusted user review. The stack is **TypeScript, React, Vite, Express,
SQLite, the official MCP SDK and Zod**, with optional Ollama, Bedrock and SMTP.

## Quick Start

Requires **Node.js 24+ and npm**. No AWS account or API key is needed for the
default local mode, which is a limited command interpreter, not an LLM.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4317**. Five labelled fictional cases are seeded on an
empty database. Local records persist in ignored `.data/mobilityrelay.sqlite`.

### Optional Local AI

Install [Ollama](https://ollama.com/) separately, then:

```sh
ollama pull qwen2.5:1.5b
npm run dev:ollama
```

Open **http://127.0.0.1:4318**. This uses a separate fictional database and local
message capture. CPU inference can take tens of seconds; replies still need
review. Model weights are downloaded separately.

See [configuration and hosting](docs/project-guide.md#2-run-the-project) for
environment variables, Windows installation guidance and optional integrations.

## Verification

Latest working-tree recheck: **October 20, 2026**, including reviewed replies
and fresh-request rebuilding. Tests used isolated fictional records on Windows /
Node 24.11.0. Final GitHub checkout verification is still needed after publishing;
the earlier clean-clone check covered `5e744c2`.

| Check | Result |
| --- | --- |
| Backend tests | 146 passed, including 25 new reply-review, rollback, provenance, stale-preview and real HTTP/MCP checks |
| Desktop/mobile-emulation browser tests | All 60 passed in one 5.3-minute run; no retries or skips |
| TypeScript and production build | Passed |
| Automated accessibility | No detected violations in tested views, review dialogs and sign-in screens; keyboard-focus checks passed |
| Actual local AI + MCP | October 19: seven-scenario Ollama-mode API workflow and real-model desktop review/mobile conversation checks passed; reply review itself uses trusted rules, not inference |
| Production Docker image | Earlier image passed isolated checks; the latest SMTP setup has not been container-retested |
| Clean source installation | Fresh GitHub clone of `5e744c2` and empty-cache `npm ci` passed without local credentials or case records; repeat final checkout verification after pushing the fix |
| Dependency audit | Zero known vulnerabilities reported on October 19 |

```sh
npm run check
npm run test:browser
```

Browser tests require installed Microsoft Edge. Results use isolated fictional
records; automated speech checks are simulated. They do not establish full
accessibility conformance, general model accuracy or real-world benefit.
See [QA evidence and limits](docs/project-guide.md#4-testing-and-latest-results).
For Gmail, use the [connection-only check and controlled inbox test](docs/project-guide.md#gmail-connection-and-inbox-test).
The complete Docker Compose/Ollama stack and public HTTPS deployment are not
verified; see [Docker setup](docs/project-guide.md#docker-and-local-ai).

The workflow recheck fixed stale refreshes hiding new replies/follow-ups,
made the supported tomorrow reminder deterministic across agent modes, and
replaced generated case-status claims with structured MCP-backed summaries.
English recognition/output settings are regression-tested; physical audio is
still unverified. Supported case reads and redacted HTML exports now use real
MCP directly without waiting for inference. The same October 19 API probes
improved from **47.9 seconds to 158 ms** for the case read and **39.9 seconds to
224 ms** for export. Actual Ollama-mode browser shortcuts took **765 ms** for
Case brief and **543 ms** for Case packet, with zero model calls. These are
local spot checks, not speed guarantees. Draft selection and complex requests
still use inference and can be slow; the actual-model browser draft-review
check passed separately in 8.8 seconds.

The October 15 performance fix removes repeated MCP negotiation and redundant
AI completion calls. In the measured workload, median case reads fell from
421 ms to 81 ms; a separate real-AI browser draft review took 13 seconds versus
the earlier 71-second observation. These are local measurements, not a speed
guarantee. See the guide for the before/after setup and limitations.

## Important Boundaries

- **Capture is not delivery.** SMTP and Bedrock adapters are implemented but not live-verified. Native Alexa+, physical speech hardware and public hosting remain unverified.
- **Coordination is not repair.** The app cannot supply parts, approve insurance, force a response, diagnose faults or guarantee a faster repair.
- **Use fictional data.** This is a shared-workspace prototype with plaintext SQLite storage, not a compliant clinical system. Browser speech may use a vendor service. Export redaction is limited and needs review.

## Documentation and License

The **[Project Guide](docs/project-guide.md)** is the single detailed document
for architecture, safety, testing, remaining work, the demo script and product
feedback. User benefit and repair-time savings have not been validated.

Code is available under the [MIT License](LICENSE). Optional model weights have
their own license.
