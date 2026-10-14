# MobilityRelay

A simulated Alexa+ experience with a real MCP server, helping wheelchair users
and caregivers record repair updates and prepare reviewed, source-backed
follow-ups.

## Start Here

**[Read the Project Guide](docs/project-guide.md).** It is the single document
for the problem, workflow, architecture, setup, QA, remaining work, demo and
product feedback.

## Quick Start

Requires Node.js 24+ and npm. No AWS account is needed for the default mode.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4317. Use fictional data only.

For optional local AI, install Ollama, then:

```sh
ollama pull qwen2.5:1.5b
npm run dev:ollama
```

Open http://127.0.0.1:4318.

## Important Boundaries

Default messages are captured locally, not emailed. This is an independent
simulator, not native Alexa+ integration. Live Bedrock, SMTP, public deployment
and user benefit remain unverified. It cannot guarantee coverage, provider
responses or repairs. See the guide for test results and privacy limitations.

MIT licensed.
