# Product Feedback and Friction Log

Log observations as they happen. Do not invent testing or attribute our own bugs
to a vendor. Feedback is required for each submission-relevant product used; a
bonus is discretionary, not promised. Include version, reproduction, impact,
workaround, and a concrete suggestion. Attach sanitized evidence only.

| Date | Product | Observation | Impact / Workaround | Suggested Improvement | Evidence |
| --- | --- | --- | --- | --- | --- |
| 2026-10-11 | Alexa+ developer tools / Devpost docs | The official FAQ says entrant access to the Category SDK, MCP Toolkit, CLI and Amazon Web Simulator is unavailable. Individual technical setup pages can appear actionable without that context. | Chose an independently built web simulator calling a real self-hosted MCP server. Native integration is not claimed. | Put a prominent access/eligibility banner on each quickstart. | [FAQ](https://amazonappdev2026.devpost.com/details/faqs) |
| 2026-10-11 | Node/npm on Windows | Registry requests failed with UNABLE_TO_VERIFY_LEAF_SIGNATURE on this host. | NODE_USE_SYSTEM_CA=1 allowed installation using the OS trust store. TLS checks remained enabled. This is environment-specific. | Surface the system-CA option in the error's platform-specific guidance. | Local command output; do not upload full machine paths/logs. |
| 2026-10-11 | npm / package registry | A floating Playwright range resolved a package whose matching playwright-core version was unavailable from the registry. | Pinned Playwright 1.56.1; selected installed Edge for browser checks. | Fail early with a direct missing-transitive-version explanation. | ETARGET for playwright-core@1.62.1. |
| 2026-10-11 | npm | After interrupted installation, audit fix failed with Invalid Version during optional Rollup dependency deduplication. | Replaced only the generated dependency tree and lockfile, then performed a clean install. | Detect incomplete optional-package metadata and suggest a scoped clean install. | Local npm error; no vendor root cause is proven. |
| 2026-10-11 | MCP TypeScript SDK / Express adapter | The initial Streamable HTTP integration returned invalid chunk framing on this Windows host; the SDK client rejected the response with an invalid chunk-size error. Root cause was not isolated to the SDK. | Kept the official WebStandard transport and used explicit Node-managed chunked response framing. Real initialize, tools/list, and tools/call wire tests now pass. | Include a tested Express response bridge example and recommend protocol-level smoke tests. | `server/app.ts`, `tests/http.test.ts`; sanitized local failure observations. |
| Pending live test | Amazon Bedrock | Not yet observed with a funded, model-enabled account. | Optional Converse/tool-use adapter is implemented. Do not claim live feedback or AWS qualification yet. | Record real model access, tool use, latency and costs after testing. | Add sanitized actual results. |
| Pending live test | SMTP provider | No real provider account configured. | Local capture mode is explicitly not delivery. | Record actual TLS setup, acceptance and error behavior after testing. | Add sanitized actual results. |

Add additional observed MCP SDK and browser speech issues here when reproduced.
Submission prose should distinguish tool friction, environmental restrictions,
and application defects we corrected.
