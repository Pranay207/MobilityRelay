# Judging Evidence and Remaining Work

The four main criteria are equally weighted. Eligibility and scores remain the
judges' decision; this is an evidence map, not a forecast or a claim of full marks.
[Official criteria](https://amazonappdev2026.devpost.com/rules).

Latest technical, accessibility and real-AI evidence and remaining limits:
[QA report: 2026-10-14](qa-report-2026-10-14.md).

| Criterion | What the project demonstrates | Evidence | Remaining validation |
| --- | --- | --- | --- |
| Tech Implementation | Actual Streamable HTTP MCP initialization, discovery and tool calls; SQLite persistence; exact-message approval; bounded optional AI tool loop. | Wire/domain tests, visible traces, actual Ollama API and desktop/mobile UI verification. | Broader model-quality/latency testing; SMTP delivery to a controlled inbox if claiming delivery. Bedrock is optional and not live-tested. |
| Design | Responsive case workspace, attributed source comparison, speech/text input, correction review, request approval, case export and deletion. | Desktop/mobile browser checks and screenshots; `src/components.tsx`, `src/forms.tsx`. | Physical microphone/speaker check and an unfamiliar person's end-to-end walkthrough. Browser speech may use a vendor service. |
| Potential Impact | A defined wheelchair-user/caregiver coordination task: preserve dates, identify missing receipt information, prepare a supported follow-up and hand over history. | Sourced problem evidence in `README.md`; dated case history and case pack. | Compare against notes/email; no demonstrated time savings, faster repairs or real-user outcomes yet. |
| Quality of the Idea | A persistent, source-backed administrative workflow rather than a one-turn answer bot: capture, clarify, prepare, approve, follow up and export. | Provenance/correction tests, service-generated draft wording, case-isolated conversation context. | Demonstrate the complete loop in under three minutes; do not claim the idea is globally unique. |

## Acceptance Gates

- [x] Live local model reads a fictional case and prepares a persisted, topic-scoped draft via MCP.
- [x] Source-backed AI drafts exclude unsupported model-written claims in regression checks.
- [x] Sending and recording evidence remain behind trusted user review in domain/wire/browser checks.
- [x] Automated desktop/mobile text workflows and simulated voice fallback pass; hardware testing remains open.
- [ ] Email evidence distinguishes local capture, SMTP acceptance and recipient receipt.
- [ ] One unfamiliar person completes a fictional coordination task; record failures too.
- [ ] Public English demo is under three minutes and uses fictional records.
- [ ] Repository access, required fields and honest product feedback are complete.

AWS deployment and AWS Builder are not prerequisites for the Alexa+ main entry.
The FAQ accepts the independently built MCP simulator and a locally runnable
repository with a demo. Bonus eligibility must be documented separately.
[Official FAQ](https://amazonappdev2026.devpost.com/details/faqs).

## Verified on 2026-10-13

TypeScript, 66 backend tests, the production build and all 24 desktop/mobile
browser tests pass. Browser tests now start an isolated, non-watching server
and a fresh fictional database. Earlier runs had a settings-selector ambiguity,
development-server restart failures and one internal fetch failure; the selector
was fixed, the failed evidence test passed alone, and a full run passed. A later
rerun hit a five-second initial case-read timeout before speech interaction.
Its trace showed fast session/list requests but a waiting case-detail request.
Short-lived host MCP clients now request fresh connections, with a wire assertion
covering that policy. The exact cause of the earlier fetch failure is unproven.
After the policy change, all 66 backend tests, the build and all 24 browser
checks pass. A separate Windows development-server restart failed because Vite
hosts shared a locked dependency cache; per-instance caches are now isolated.
The actual AI desktop/mobile check passes again while the demo server is running.

Actual qwen2.5:1.5b verification passes reading, a persisted draft targeting the
supplier/receipt question, a truthful request-status answer, blocked voice send,
evidence-review proposal and redacted HTML export. A separate actual browser
check passes desktop draft review with approval disabled and a mobile persisted
conversation. Neither check approved a message or delivered email.

Initial live attempts timed out, returned an empty draft response, used an
unsuitable question, or narrated action status incorrectly. Bounded summaries,
request-scoped short references, explicit-topic restrictions and trusted host
confirmations address those observed failures. This is a small fictional test
set, not general model accuracy or real-user validation. The latest CPU run took
about 30 seconds to read, 36 to prepare and 34 to export; the actual browser draft
check took about 28 seconds initially and about 25 after the final development
server/transport changes. No real-time voice-performance claim is made.
