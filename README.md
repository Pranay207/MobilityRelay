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

Built for the **Alexa+ track** of the Amazon Developer Hackathon: an independent
voice/text **Alexa+ experience simulator**, backed by a real self-hosted MCP
server over **Streamable HTTP**.

[Overview](#the-problem) | [Quick Start](#quick-start) |
[MCP Integration](#mcp-integration) | [Verification](#verification) |
[Demo Script](docs/project-guide.md#6-demo-script-target-245) |
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

Actual application captures with fictional records and the local command
simulator. Mobile screenshots use a 390x844 browser-emulated viewport.

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

1. **Record:** add dated updates attributed to their sources; corrections preserve the original.
2. **Clarify:** see the next unanswered question and the evidence behind it.
3. **Prepare:** draft a source-backed request without sending it.
4. **Approve:** review the exact recipient and message; the default outbox captures it locally.
5. **Review replies:** inspect the proposed changes and explicitly confirm answers. Received does not mean approved; changed evidence invalidates outdated drafts.
6. **Follow up and export:** save local due items and download a source-linked HTML/JSON history, with optional known-identity redaction.

English dictation and spoken replies are optional. Users can always type or use
the reviewed forms; recording speech never submits it automatically.

## Quick Start

Requires **Node.js 24+ and npm**. In a local checkout:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4317**. The default mode needs no AWS account, API key or
email credentials. An empty database receives five labelled fictional cases;
records persist in ignored `.data/mobilityrelay.sqlite`.

Start with **Power chair repair**: inspect the receipt question, prepare a
request, review its sources and export the history. Try this in Relay:

> Compare the reports.
>
> Ask the supplier for that reference.

The first request reads attributed evidence through MCP. The second prepares a
review-only draft using the current conversation context. Ambiguous or stale
context opens a selection form instead of guessing. Nothing is approved or sent
by voice. **Case brief** offers a button-based starting point.

<details>
<summary>Optional local AI with Ollama</summary>

Install [Ollama](https://ollama.com/) separately, then run:

```sh
ollama pull qwen2.5:1.5b
npm run dev:ollama
```

Open **http://127.0.0.1:4318**. This uses a separate fictional database and local
message capture. The model interprets read requests into validated views; the
host renders facts from current MCP records. Model weights download separately.

</details>

See the [setup guide](docs/project-guide.md#2-run-the-project) for configuration,
Windows instructions, Gmail testing and Docker.

## MCP Integration

```text
React workspace -> Express host -> MCP SDK client over HTTP
                -> /mcp server -> validated repair tools -> SQLite
```

The host initializes an MCP connection, discovers tools and calls them over
Streamable HTTP using the official SDK. Conversation traces expose actual tool
results. Wire tests cover protocol **`2025-11-25`**.

| Tool | Responsibility |
| --- | --- |
| `record_repair_event` | Save reviewed evidence and explicitly selected, source-backed reply answers. |
| `get_repair_brief` | Read the history, unanswered questions and next steps. |
| `prepare_repair_request` | Prepare a request without sending it. |
| `send_approved_request` | Attempt only the exact message with valid user approval. |
| `manage_repair_followup` | Maintain a persistent local follow-up item. |
| `export_repair_packet` | Export an attributed HTML or JSON case history. |

**User review remains the authority.** AI cannot independently save evidence or
send messages through the simulator. Approval is bound to the exact message and
case version; writes are never automatically replayed after a connection failure.

**Stack:** TypeScript, React, Vite, Lucide, Express, SQLite, the official MCP SDK
and Zod. Optional adapters support Ollama, Amazon Bedrock and SMTP. Local mode is
a limited command interpreter, not an LLM.

## Verification

Latest code verification: **October 23, 2026**, using isolated fictional data on
Windows, Node 24.11.0 and installed Microsoft Edge.

| Check | Recorded result |
| --- | --- |
| TypeScript and production build | Passed. |
| Unit and integration | **231 passed**, including real HTTP/MCP, persistence, approval boundaries, reviewed replies, recovery and UTC-offset chronology. |
| Browser workflows | **142/142 passed in 15.5 minutes**, desktop/mobile, with no failures, skips or whole-test retries. Read-only requests may retry one connection reset. |
| Actual local AI | Seven-step fictional API journey passed, including three real Ollama inference calls. Separate desktop draft review and mobile persisted-conversation checks passed. |
| Accessibility and layout | Keyboard focus and responsive checks passed; no automated accessibility violations in tested states. |
| Production container | Earlier `c5696d6` Linux image passed clean build, non-root/auth/MCP/approval checks and restart persistence. Latest client changes have not had a fresh image test. |
| Dependency audit | Production and full npm audits reported **zero known advisories** at check time; this is not a security certification. |

```sh
npm run check
npm run test:browser
# Optional, requires running Ollama and its downloaded local model:
npm run test:conversation
```

Browser tests require installed Microsoft Edge. The fictional workflows cover
paperwork, temporary equipment, unanswered requests, coverage and assessment.
Full results, latency measurements, earlier failed attempts and fixes are in the
[QA section of the project guide](docs/project-guide.md#4-testing-and-latest-results).

## Current Status and Privacy

- **Alexa+ simulator:** real MCP, but no native Alexa+ integration, connected inbox or live supplier/insurer systems.
- **Local capture:** approved messages stay in the local outbox by default. SMTP and Bedrock adapters are not live-verified; follow-ups are local due items, not autonomous messages or background reminders.
- **Optional AI:** local mode is a limited command interpreter. Ollama is tested on small fictional scenarios, not general accuracy; CPU inference can take tens of seconds. The full Ollama/HTTPS Compose stack and a fresh host checkout remain unverified.
- **Fictional data only:** the shared prototype stores plaintext SQLite records. Browser speech may use a vendor service; export redaction is limited and needs review before sharing.
- **Validation limits:** speech tests use controlled callbacks, not physical audio. Microphone accuracy, broad device support, public hosting, full accessibility conformance and independent user benefit are unverified.
- **Coordination, not repair:** no diagnosis, coverage decisions, guaranteed response or evidence of shorter repairs. The app cannot supply missing parts or technicians.

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
