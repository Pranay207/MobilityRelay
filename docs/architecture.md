# Architecture and Boundaries

## Request Path

Browser -> authenticated Express host -> MCP SDK client -> `/mcp` -> six validated
tools -> repair service -> SQLite and optional SMTP.

Bedrock mode discovers the MCP catalog and uses Converse tool calls. The host
injects the active case ID, limits tool steps, and excludes the record and send
tools from the model's action set. Evidence recording uses an explicitly reviewed
form. Local mode routes a limited set of commands through the same MCP client.

Host intent routing restricts cloud tools to one requested operation plus reading;
read questions and unrecognized requests are read-only. The model has at most five
turns and eight attempted tools, with per-request Converse timeouts and a 45-second
model conversation deadline. Equivalent validated writes reuse an idempotency key
inside that conversation. A model failure after a successful write preserves the
review handle and traces. This is not live-cloud validation or an exactly-once
guarantee across separately submitted requests.

The server uses stateless Streamable HTTP with one MCP server/transport per POST.
The wire test negotiates 2025-11-25 and exercises tools/list. Subsequent SDK calls
negotiate a supported version. Origin/Host checks and independent bearer auth
protect the MCP endpoint. Session cookies are HttpOnly and SameSite=Strict;
mutations additionally require a session-bound CSRF token.

## Data Model

Cases own evidence, questions, contacts, drafts, follow-ups and chat records.
SQLite foreign keys cascade whole-case deletion. Evidence is append-only within
a case: corrections link to their predecessor. Whole-case deletion remains
available. Records are plaintext on disk; this is not encrypted clinical storage.

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

## Primary References

- [MCP Streamable HTTP specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x)
- [Bedrock Converse command](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/command/ConverseCommand/)
- [Hackathon FAQ](https://amazonappdev2026.devpost.com/details/faqs)
