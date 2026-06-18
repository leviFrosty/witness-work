# Routing ministry data through a third-party LLM under contractual zero-retention

## Context

Notes Import must interpret free-form text into structured records, which requires a third-party LLM (`deepseek-v4-flash`). That text contains contact names, home addresses, and a person's religious activity — exactly the data that is dangerous for Jehovah's Witnesses in jurisdictions where the work is restricted. The cheapest path (DeepSeek's first-party API) is China-hosted with data-retention terms.

## Decision

Serve the model via a **Western (US/EU) inference host with a contractual zero-data-retention term**, reached through `ww-proxy` over an OpenAI-compatible interface (provider-agnostic, AI SDK). The DeepSeek first-party API is rejected. The proxy persists only `{contentHash → usage counter}` — never the notes text or the parsed output — and the replayable parsed result is cached **client-side only**. Together these let us tell users, truthfully, that Notes Import uses a third-party LLM under zero data retention and that the data does not leave a privacy-friendly jurisdiction.

## Consequences

- Each candidate host's ZDR terms must be read and accepted before launch; the model/host can be swapped via config without app changes.
- Because nothing is retained server-side, a re-import after the client ledger is lost (e.g. reinstall) re-runs the model rather than replaying — accepted as the cost of the privacy posture.
- The privacy-disclosure copy shown in the wizard is load-bearing and must match the actual host's contract.
