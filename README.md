# MobilityRelay

A voice-first repair follow-up assistant for wheelchair users and caregivers.

## Project Status

Initial repository setup. The application is not implemented yet.

## Intended Scope

Help users maintain a source-backed repair history, identify unanswered
questions, and complete approved follow-ups across organisations.

Planned case types include paperwork clarification, funding questions,
parts delays, appointment delays, unanswered requests, and questions about
temporary equipment.

The shared workflow is:

Capture evidence -> review interpretation -> prepare a request -> approve
and send -> track the response -> export a redacted case history.

## Planned Alexa+ Implementation

An independently built voice/text web simulator connected to a self-hosted
MCP server using Streamable HTTP and protocol version 2025-11-25 or later.
Native Alexa+ integration is not assumed or claimed.

## Boundaries

- No mechanical diagnosis or medical advice.
- No automatic funding decisions or legal-deadline determinations.
- No guaranteed repair, provider response, booking, or temporary equipment.
- Outbound messages require approval of the exact recipient and content.
- Development scenarios will be labelled fictional; no real health records
  or credentials belong in this repository.

## Next Milestone

Build and test three complete workflows: paperwork clarification,
parts-delay follow-up, and an unanswered-request case summary.
