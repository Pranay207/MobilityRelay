# Submission Checklist

## Technical Evidence

- [x] Run type checks, domain and wire tests, production build and browser tests.
- [x] Record real MCP initialization, tools/list and tools/call behavior in automated tests.
- [ ] Confirm the repository builds from npm ci on a clean machine.
- [ ] Keep fictional fixtures, capture mode, and integration limits visible.
- [ ] If claiming AWS Builder, configure and actually validate the Bedrock path,
      document its role and consult the current eligibility rules. Code alone is
      not a substitute for a demonstrated integration.

Local checks on 2026-10-11: 38 backend tests, eight desktop/mobile browser tests,
TypeScript and the production build pass. Speech and Bedrock responses are
simulated where needed; actual local MCP HTTP calls are exercised. These are
developer/synthetic checks, not external email delivery, live Bedrock testing,
speech-accuracy evaluation, or validation with users.

## Repository and Video

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

[Repair-delay study](https://pubmed.ncbi.nlm.nih.gov/39427781/),
[existing supplier repair workflow](https://www.nsm-seating.com/service-repair/).

There is no guaranteed score, shortlisting, or win.

[Official rules](https://amazonappdev2026.devpost.com/rules),
[resources](https://amazonappdev2026.devpost.com/resources),
[FAQ](https://amazonappdev2026.devpost.com/details/faqs).
