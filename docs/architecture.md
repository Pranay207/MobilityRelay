# Architecture and Boundaries

## Request Path

Browser -> authenticated Express host -> MCP SDK client -> `/mcp` -> six validated
tools -> repair service -> SQLite and optional SMTP.

Bedrock and Ollama modes discover the MCP catalog and use the same bounded
tool-call loop. Bedrock uses Converse; the local adapter translates that
transcript to Ollama's non-streaming `/api/chat` format. The host
injects the active case ID, limits tool steps, and excludes the record and send
tools from the model's action set. Evidence recording uses an explicitly reviewed
form. Local mode routes a limited set of commands through the same MCP client.

Host intent routing restricts model tools to one requested operation plus reading;
read questions and unrecognized requests are read-only. The model has at most five
turns and eight attempted tools. Bedrock has a 25-second call timeout and
45-second conversation deadline; CPU-based Ollama has 90/150-second limits.
These are maximum bounds, not responsiveness guarantees. Equivalent validated writes reuse an idempotency key
inside that conversation. A model failure after a successful write preserves the
review handle and traces. This is not live-cloud validation or an exactly-once
guarantee across separately submitted requests.

Only six recent same-case messages, each capped at 1,000 characters, are included
as untrusted context. Model-generated subject/body fields are removed before
preparing a request; the service derives draft wording from attributed sources.
Model follow-up calls may create only, never edit or cancel an existing item.
The model can still produce an incorrect read answer; prompts are not proof of
accuracy. A failed provider call is surfaced, not silently changed to local mode.

Write/export confirmations come from verified host handles and successful MCP
traces, not unrestricted model narration. A draft confirmation explicitly says
nothing was sent and approval is required. A model claiming success without an
accepted action gets a host response stating the action was not completed.

The model summary contains at most 12 nonsuperseded sources (1,200 characters
each), 15 open questions, ten contact identities, five request statuses and eight
scheduled follow-ups. It explicitly reports omitted counts and truncated source
text. Draft bodies and contact email addresses are not needed in this inference
summary. Full records and exact-message review remain in the workspace. A model
read tool gets the same bounded summary; this is not a complete case audit.

Contact/question choices use short, request-scoped references such as C1/Q1 in
the model schema. The host resolves them to actual case-owned UUIDs before the
real MCP call. Unknown references are rejected; native MCP schemas and database
identity remain unchanged. This reduces model copying errors, not authorization
requirements or the need to review the selected recipient/questions.

An explicitly named supplier/insurer and supported draft topic restrict the
model's available references. For example, an estimate-reference request cannot
substitute an authorization question. Unmatched topics ask for form review.
Direct "Have you sent that email?" questions use recorded request statuses
without inference. Capture, SMTP acceptance and recipient receipt stay distinct.

Ollama accepts a loopback HTTP origin only, refuses redirects and cloud-tagged
model names, and limits response bytes, tool counts and output tokens. Truncated,
malformed or unfinished-reasoning responses fail closed. Model weights are a
separate installation. Local inference does not guarantee that browser speech
recognition stays on the device.

The server uses stateless Streamable HTTP with one MCP server/transport per POST.
The SDK supplies JSON responses. An `on-headers` hook makes Node frame all MCP
responses consistently as chunked HTTP, including notifications and error/405
paths, to withstand an observed host header-normalization mismatch. This is not
SSE streaming; optional GET subscriptions remain unsupported and return 405.
The wire test negotiates 2025-11-25 and exercises tools/list. Subsequent SDK calls
negotiate a supported version. Origin/Host checks and independent bearer auth
protect the MCP endpoint. Session cookies are HttpOnly and SameSite=Strict;
mutations additionally require a session-bound CSRF token.

The Node host's short-lived SDK clients own separate Undici dispatchers, use
non-pipelined fresh HTTP connections, and destroy their dispatcher on completion.
An overall 30-second HTTP deadline is combined with the SDK's abort signal; the
global dispatcher is unchanged. This hardens an observed intermittent case-read
stall/socket-error path without replaying writes. It is not proof of a vendor
bug or a latency guarantee. Model inference has its separate limits above.

Read-only assistant replies refresh persisted conversation history without a
redundant case reload. Data-changing actions and review proposals still refresh
the case; the workspace also retains its periodic case synchronization.

Assistant exports always enable known-identity redaction, regardless of a
model-supplied flag. An unredacted export requires the explicit case form.
Redaction is still limited and must be reviewed before sharing.

## Data Model

Development Vite caches are separated by data directory and port (with a random
instance suffix for ephemeral ports) under `node_modules/.vite`, outside case
storage. Middleware denies private data and credential files and disables the
public directory. Configuration rejects storage inside built/public assets.
This prevents concurrent demo/test hosts
from re-optimizing and removing the same Windows-locked dependency cache.

Cases own evidence, questions, contacts, drafts, follow-ups and chat records.
SQLite foreign keys cascade whole-case deletion. Evidence is append-only within
a case: corrections link to their predecessor. Whole-case deletion remains
available. Records are plaintext on disk; this is not encrypted clinical storage.

The overview pairs supplier and insurer paperwork reports only when both are
cited by a current unanswered receipt question. It shows the recorded wording,
source and date, with links to the evidence history. Superseded sources are
excluded; corrections can replace the displayed report, and answering the
question removes the comparison. This is a request for clarification, not a
contradiction verdict or evidence that either party is wrong.

Question generation uses explicit user-selected reported situations, not free-text
semantic contradiction inference. Source dates establish reported chronology,
not independently verified facts or legal deadlines. Current unresolved questions
require human answers. Corrections replace the source citations used by new drafts;
questions that no longer apply are retained internally but removed from the current
brief. That is not recorded as an answer or a successful repair. New evidence can
reopen a question; old answers remain in the evidence history. Later pending reports
are not suppressed by an earlier approval. A future visit date belongs in the
statement, separately from the date the appointment was reported.

Voice/text update proposals preserve the user's wording. Role, named contact,
channel, and situation suggestions come from bounded deterministic matches, not
an independently verified interpretation. Ambiguous and negated stage wording
does not get a confident suggestion. The review checkbox starts unchecked and
is cleared after field changes; only the reviewed form calls the recording tool.

## Voice Lifecycle

Each mounted conversation owns its recognition session. Submission, review
dialogs, unmounting and tab hiding detach callbacks before aborting recognition.
Callbacks also check session identity so a queued result or end event cannot
change a later recording. Case switching remounts the conversation; delayed chat
loads check the currently selected case again before updating the workspace.

Spoken replies start disabled and do not replay history when enabled. New replies
may be spoken only after the request finishes and while the conversation is
visible, not recording, and not covered by a review dialog. Muting, review,
recording, tab hiding and unmounting cancel playback. Browser tests substitute
recognition and synthesis callbacks; they do not validate a physical microphone,
speaker output or browser-vendor recognition accuracy.

## Approval Boundary

Drafts bind recipient, subject, body, source IDs and case version in a SHA-256
digest. Approval requires an authenticated user session, CSRF token, confirmation
and the reviewed digest. It creates a two-minute, single-use random capability
stored hashed in SQLite. The assistant never receives this capability.

The MCP send tool validates the capability, version and contact, then atomically
consumes approval and marks the attempt in progress before SMTP. Concurrent/replayed
sends of the same draft are rejected. Unknown outcomes and interrupted sends are
not automatically retried. This is not a promise of exactly-once email delivery;
users must check their mail provider before manually creating a new request.

## Scope

- Parts/technician shortages: ask for availability, update dates and arrangements.
- Coverage refusals: request the written reason and review process; no coverage decision.
- Mechanical problems: request a professional assessment; no diagnosis or instructions.
- Ignored requests: preserve attempts, schedule a due item, export to a chosen advocate.
- Temporary equipment: request availability and professional suitability assessment.

## Production Gaps

No native Alexa+ account linking, supplier/insurer APIs, multi-user tenancy,
background outbound chasing, OS notifications, attachment ingestion, or certified
medical/legal/privacy compliance. Bedrock and SMTP are implemented optional paths,
not live-tested integrations until actual accounts are configured. A local Docker
deployment with a persistent disk is supported by configuration; no cloud
deployment or infrastructure provisioning has been performed.

The independently built conversation is explicitly labelled as an Alexa+
experience simulator. It calls real MCP tools through the web host, but does
not reproduce Alexa+'s full language capabilities or satisfy native onboarding
requirements by itself. Local command routing remains a bounded fallback;
Bedrock mode needs an actual account and live validation. Ollama provides an
optional actual local AI path without an AWS account; its opt-in verification
uses fictional records and does not establish user benefit.

## Primary References

- [MCP Streamable HTTP specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x)
- [Bedrock Converse command](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/command/ConverseCommand/)
- [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)
- [Hackathon FAQ](https://amazonappdev2026.devpost.com/details/faqs)
