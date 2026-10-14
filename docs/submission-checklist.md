# Submission Checklist

## Technical Evidence

The latest local security, accessibility and end-to-end results, reproduced bugs
and remaining manual checks are in [QA report: 2026-10-14](qa-report-2026-10-14.md).
Final local QA passes 84 backend tests, all 34 desktop/mobile browser tests,
TypeScript and the production build. The final six-scenario actual Ollama/MCP
run and actual AI browser check also pass with isolated fictional data. These
are not native Alexa+, live AWS/SMTP, hardware-speech or impact validation.

- [x] Run type checks, domain and wire tests, production build and browser tests.
- [x] Record real MCP initialization, tools/list and tools/call behavior in automated tests.
- [x] Verify npm ci, backend tests and build in a fresh GitHub clone with an empty npm cache.
- [ ] Manually verify microphone recognition and spoken replies using fictional data.
- [ ] Keep fictional fixtures, capture mode, and integration limits visible.
- [x] Label the independent Alexa+ simulator and expose real MCP call traces.
- [x] Show attributed paperwork reports with dates and links to current evidence.
- [ ] If claiming AWS Builder, configure and actually validate the Bedrock path,
      document its role and consult the current eligibility rules. Code alone is
      not a substitute for a demonstrated integration.

Local checks on 2026-10-11: 39 backend tests, ten desktop/mobile browser tests,
TypeScript and the production build pass. Speech and Bedrock responses are
simulated where needed; actual local MCP HTTP calls are exercised. These are
developer/synthetic checks, not external email delivery, live Bedrock testing,
speech-accuracy evaluation, or validation with users.

Additional checks cover follow-up title/question edits, clearing a related
question, and rendering saved follow-up time zones in a browser configured for
another region. Production HTML/assets, security headers, blocked anonymous API
access, and protected login pass an isolated loopback smoke check. This does not
validate a public deployment, TLS termination, or real provider integrations.

Synthetic loopback timing checks exercise real MCP calls with 10 and 1,000
history entries in isolated in-memory SQLite. They are local responsiveness
measurements, not disk-storage, browser-rendering, cloud-latency, or production
capacity guarantees.

Fresh-checkout verification on 2026-10-12 used GitHub commit `e2639ee` in a new
temporary directory on this Windows host, with Node 24.11.0 and npm 11.6.1.
There was no `.env`, database, dependency tree, or build output before testing.
`npm ci` used a separate empty cache and Windows system certificates, reported
zero vulnerabilities, and left the lockfile unchanged. All 39 backend tests,
ten desktop/mobile browser tests against the clone's own database, and the
production build passed. The app started using local/capture defaults with
Streamable HTTP protocol `2025-11-25`. This is fresh-checkout verification on the
existing host, not testing on a fresh OS, another platform, or a clean virtual
machine. AWS and SMTP remain unconfigured and unverified.

Voice-safety verification on 2026-10-12 passes TypeScript, all 39 backend tests,
the production build and 18 desktop/mobile browser tests. Eight new browser
checks cover cancelling recognition on submission and review, rejecting queued
callbacks from an old recording, speaking only new responses after opt-in,
stopping playback at review boundaries, and ignoring delayed chat loads after
case switching. Desktop and mobile screenshots were inspected. These recognition
and synthesis checks use controlled browser substitutes, not a live microphone
or audible speaker test. The earlier fresh-checkout run covered commit `e2639ee`,
not these subsequent local changes.

Simulator/evidence verification on 2026-10-12 passes TypeScript, all 39 backend
tests, the production build and all 22 desktop/mobile browser tests in one full
run. Four new browser checks cover the explicit simulator label, real MCP brief
traces, dated source links, corrected-report provenance and hiding the comparison
after an answer. Desktop and mobile screenshots were inspected. An earlier run
hit one five-second mobile UI wait timeout; its isolated rerun and this full run
passed. These results do not establish a latency guarantee, live AWS/email
operation, native Alexa+ compatibility, or user benefit. Fresh-checkout evidence
above still applies to the earlier commit, not this update.

## Repository and Video

Current criteria evidence and remaining gates are in
[`judging-evidence.md`](judging-evidence.md). On 2026-10-13, TypeScript, 66 backend
tests, the build and all 24 desktop/mobile browser tests pass with a fresh
fictional database. Optional Ollama inference calls real local AI without an AWS
account. The actual six-step local-model verification and a desktop/mobile AI
browser check pass with isolated fictional data; slow CPU inference must still
be disclosed. They do not establish general model accuracy. SMTP, physical speech testing and
validation with unfamiliar users remain unverified.

- [ ] Ensure reviewer access to the private GitHub repository, or publish it with
      the included MIT license. Do not expose credentials or real case records.
- [ ] Verify all required reviewer invitations close to submission; invitations
      may expire. Adding one reviewer does not cover all reviewer requirements.
- [ ] Record and publish an English demo shorter than three minutes.
- [ ] Fill the required Devpost fields and include setup/configuration instructions.
- [ ] Provide product feedback for every submission-relevant tool actually used.
- [ ] Submit the real friction log; do not assume the discretionary bonus.
- [ ] Check Open Source mini-challenge requirements separately. A main-repo license
      alone should not be treated as sufficient evidence of an additional contribution.

## Impact Honesty

The research supports the reality of repair delays, not the effectiveness or
uniqueness of this app. Measure synthetic task steps/errors first; conduct
consented user testing before claiming time savings or faster repairs.

- [ ] Compare a fictional repair-coordination task using MobilityRelay against
      ordinary notes and email. Ask participants to identify the missing receipt
      information, prepare a supported follow-up, and hand over the case history.
      Record task completion, errors and effort; do not present synthetic-case
      results as evidence of shorter repairs or real wheelchair-user outcomes.

[Repair-delay study](https://pubmed.ncbi.nlm.nih.gov/39427781/),
[existing supplier repair workflow](https://www.nsm-seating.com/service-repair/).

There is no guaranteed score, shortlisting, or win.

[Official rules](https://amazonappdev2026.devpost.com/rules),
[resources](https://amazonappdev2026.devpost.com/resources),
[FAQ](https://amazonappdev2026.devpost.com/details/faqs).
