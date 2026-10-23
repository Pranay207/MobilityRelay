<p>
  <img src="assets/logo.svg" alt="MobilityRelay logo" width="64" height="64">
</p>

# MobilityRelay

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-222222?style=flat-square&logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=flat-square&logo=zod&logoColor=white)
![MCP Streamable HTTP](https://img.shields.io/badge/MCP-Streamable_HTTP-176B52?style=flat-square)

**Wheelchair repair coordination.**

MobilityRelay helps wheelchair users and caregivers turn scattered repair
updates into a dated case history, clear next questions and reviewed follow-ups.
It preserves what each party reported without deciding who is right.

The name combines **Mobility**, reflecting wheelchair users and independence,
with **Relay**, reflecting the exchange of updates between users, caregivers,
suppliers and insurers. It describes coordination, not a repair service.

Built for the **Alexa+ track** of the Amazon Developer Hackathon: an independent
voice/text **Alexa+ experience simulator**, backed by a real self-hosted MCP
server over **Streamable HTTP**. Native Alexa+ integration is not claimed.

[Overview](#the-problem) | [Quick Start](#quick-start) |
[MCP Integration](#mcp-integration) | [Verification](#verification) |
[Project Guide](docs/project-guide.md)

## Product Preview

### Desktop

![Desktop workspace with the next repair question, source links, reviewed actions and the Relay conversation](assets/workspace.png)

### Mobile

Repair workspace and Relay conversation:

<p>
  <img src="assets/workspace-mobile.png" alt="Mobile repair workspace showing the paperwork receipt question, request action and source links" width="260">
  <img src="assets/relay-mobile.png" alt="Mobile Alexa+ experience simulator showing a completed case brief with a real MCP call" width="260">
</p>

Actual application captures using fictional records and the local command
simulator. Mobile views use a 390x844 browser-emulated viewport, not a physical
device. These are not native Alexa+ or live supplier integrations.

## The Problem

> The supplier says, "We sent the estimate."
>
> The insurer says, "We cannot locate it."
>
> The user is left to work out what happened and whom to ask next.

MobilityRelay keeps both reports and turns the gap into a practical question:
**Was the estimate received, and what reference can confirm it?** A follow-up
can cite the recorded sources instead of inventing an answer or assigning blame.

A 2025 study of 301 wheelchair users with spinal cord injury found vendor
noncompletion after contact was the most common reported reason for incomplete
repairs. This supports the coordination problem, not the effectiveness of our
app or a population estimate for all wheelchair users.
[Read the study](https://pubmed.ncbi.nlm.nih.gov/39427781/).

## How It Works

1. **Record:** add attributed, dated updates. Corrections preserve the original source.
2. **Clarify:** see the next unanswered question, with supporting evidence available on demand.
3. **Prepare:** create a source-backed request without sending it.
4. **Approve:** review the exact recipient and message before authorizing an attempt. The default mode captures messages locally, not by email.
5. **Review replies:** inspect quotations and a before/after preview, then explicitly select and confirm answers. Receipt can be answered while authorization remains pending; outdated drafts require a fresh request.
6. **Follow up and export:** save local due items and download an attributed HTML/JSON history, with optional known-identity redaction. Exports identify stale drafts and use readable source numbers; HTML source links lead to the corresponding history entries.

The selected case survives reload in the same browser tab. New cases show a
**Record first update** action; a missing recipient contact has a direct
**Add contact** action beside the blocked request workflow.
The compact desktop layout gives more space to the conversation, with a narrower
sidebar and less header padding. Main reading text remains 16px and primary
controls retain 44px targets. Narrow screens use a labelled evidence icon.
New drafts ask the recipient direct questions rather than copying workspace
instructions. Reviewed answers use readable source numbers linked to Evidence;
technical record IDs remain available under **Record details**.

English speech input and spoken replies are optional; text and forms remain
available. Dictation shows live words, keeps listening across speech segments,
and requires a separate send action. Manual editing cancels recording. Browser
speech-service and microphone accuracy still need physical verification.
An empty recording now gives recoverable feedback and preserves typed text.
Report reads tolerate inserted periods between known command words. Supported
ambiguous comparisons offer an explicit **Compare reports** confirmation rather
than silently changing a misheard word; the original transcript stays in history.
Relay can read the latest supplier or insurer report, or compare
both with dated source numbers. Corrected records are excluded and long reports
are labelled as excerpts. Optional report playback gives the source, date and
user-recorded situation with an uncertainty warning, rather than reading the
long quotations aloud. Written quotations remain in the conversation and full
reports in Evidence. Unsupported local questions receive an explicit
limitation instead of an unrelated summary. Reply recognition is deliberately narrow: supported insurer receipt
statements and supplier appointment confirmations with an explicit date, time
and UTC offset. Ambiguous wording remains evidence only. No connected inbox or
independent verification is claimed.

## MCP Integration

```text
React workspace -> Express host -> MCP SDK client over HTTP
                -> /mcp server -> validated repair tools -> SQLite
```

The host initializes the MCP connection, discovers tools and calls them through
Streamable HTTP. Tool results appear in the conversation trace. Wire tests cover
protocol **`2025-11-25`**; this is not a UI-only simulation of tool calls.

| Tool | Responsibility |
| --- | --- |
| `record_repair_event` | Save reviewed evidence and explicitly selected, source-backed reply answers. |
| `get_repair_brief` | Read the history, unanswered questions and next steps. |
| `prepare_repair_request` | Prepare a request without sending it. |
| `send_approved_request` | Attempt only the exact message with valid user approval. |
| `manage_repair_followup` | Maintain a persistent local follow-up item. |
| `export_repair_packet` | Export an attributed HTML or JSON case history. |

**User review remains the authority.** AI cannot independently record evidence
or send messages through the simulator. Approval is bound to the reviewed
message; changed case information can invalidate a draft.

**Stack:** TypeScript, React, Vite, Lucide, Express, SQLite, the official MCP SDK
and Zod. Optional adapters support Ollama, Amazon Bedrock and SMTP. Local mode is
a limited command interpreter, not an LLM.

## Quick Start

Requires **Node.js 24+ and npm**. The default local mode needs no AWS account,
API key or email credentials.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4317**. An empty database is seeded with five labelled
fictional cases. Local records persist in ignored `.data/mobilityrelay.sqlite`.

Start with **Power chair repair**: inspect the receipt question, prepare a
request, review its sources and export the history. In Relay, **Case brief**
reads the case through MCP.

Try **"What did the supplier say?"** or **"Compare the supplier and insurer
reports"** for attributed evidence, without a model wait. These are reported
statements, not a verdict on responsibility or a prediction of approval.

**"Prepare a request to the supplier about missing estimate reference"** prepares
a reviewed draft through real MCP without an inference wait, even with Ollama
or Bedrock configured. Supported whole-request commands require one matching
recipient and current open questions; ambiguous recipients open the selection
form. Nothing is approved or sent by voice. Other AI requests can still take
tens of seconds, and Bedrock model requests still require consent.

Workspace reads have a timeout and a retry action instead of an endless loading
state. Retrying reloads the case list; it never repeats a message or other write.
Private data and verification exports are excluded from development file watching
so saving an HTML history there does not reload the workspace or discard input.

<details>
<summary>Optional local AI with Ollama</summary>

Install [Ollama](https://ollama.com/) separately, then run:

```sh
ollama pull qwen2.5:1.5b
npm run dev:ollama
```

Open **http://127.0.0.1:4318**. This uses a separate fictional database and local
message capture. CPU inference can take tens of seconds; generated content
still needs review. Model weights are downloaded separately.

</details>

See the [setup and configuration guide](docs/project-guide.md#2-run-the-project)
for environment variables, Windows instructions, Gmail testing and Docker.

## Verification

Latest code verification: **October 23, 2026**, using isolated fictional data on
Windows, Node 24.11.0 and installed Microsoft Edge.

| Check | Recorded result |
| --- | --- |
| TypeScript and production build | Passed. |
| Unit and integration | **199 tests passed**, including real HTTP/MCP calls, direct drafts, bounded reads, comparison clarification, provenance, approval, reply review and export integrity. Test files run sequentially; explicit concurrency checks remain covered. |
| Browser workflows | **122/122 full desktop/mobile checks passed** before the final speech-recovery change. **16/16 focused checks passed afterward** in 1.5 minutes, including the actual misheard wording, confirmation persistence, report reads, speech lifecycle, accessibility and case isolation. Physical recognition and independent usefulness remain unverified. Earlier failures are retained in the guide. |
| Accessibility and responsive layout | No automated violations in tested states. Keyboard focus, readable text, 44px header icon controls and desktop/mobile layout checks passed. |

```sh
npm run check
npm run test:browser
npm run test:demo
npm run measure:usefulness
```

Browser tests require installed Microsoft Edge. Speech tests use simulated
callbacks, not physical audio. The measurement script exercises a fictional
case through reviewed follow-up, local capture and export; its timings are not
human completion times or proof of repair-time savings. Automated checks do not
establish full accessibility conformance or general model accuracy.

The demo suite covers Maya's paperwork conflict, Alex's loaner request, Sam's
unanswered request, Jordan's coverage clarification and Ravi's assessment.
Maya's full flow verifies receipt answered, authorization still open, stale
approval blocked, a fresh reviewed follow-up and an exported history. These
are scripted fictional personas, not recruited users or evidence of time saved.

A real Ollama/MCP fictional-case walkthrough completed on October 22, before
these UI fixes. The latest changes have not had a fresh clean-install or
complete Docker-stack verification. Detailed
results, historical measurements and remaining work are in the
[QA section of the project guide](docs/project-guide.md#4-testing-and-latest-results).

## Scope and Privacy

- **Coordination, not repair:** the app cannot supply parts, diagnose faults, approve insurance, force a response or guarantee a faster repair.
- **Capture, not delivery:** default messages stay in a local outbox. SMTP and Bedrock adapters are implemented but not live-verified. Follow-ups are local due items, not autonomous messages or background reminders.
- **Prototype, not a clinical system:** this is a shared workspace with plaintext SQLite storage. Use fictional data. Browser speech may use a vendor service, and export redaction is limited and needs review.
- **Explicit access limits:** native Alexa+, physical speech hardware and public hosting remain unverified. Independent user benefit has not been validated.

## Repository Guide

```text
src/                    React workspace, forms and conversation UI
server/                 HTTP host, MCP tools, repair rules and persistence
shared/                 Shared TypeScript types
tests/                  Backend, MCP and browser regression tests
scripts/                Integration checks and workflow measurements
docs/project-guide.md   Architecture, configuration, QA, demo and friction log
```

The **[Project Guide](docs/project-guide.md)** is the single detailed document
for contributors and reviewers. It includes the demo script, product feedback,
safety decisions and submission checklist.

## License

[MIT](LICENSE). Optional model weights have their own license.
