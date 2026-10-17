# Architecture

```
React UI (src/ui)  ──calls──▶  HubServer (src/server/hub.ts)  ──▶  HubState (in-memory, mirrored to localStorage)
                                   │  every method takes the caller uid and authorizes it
                                   ├─ ingest (src/ai/ingest.ts)       deterministic JSONL parse/normalize/episodes
                                   ├─ ModelAdapter (src/ai/adapter.ts) typed JSON in/out, strict validation
                                   │    ├─ ReplayAnalyzer (src/ai/replay.ts)  pre-authored deterministic stand-in (default)
                                   │    └─ DisabledLiveAdapter               live LLM seam, disabled, never called
                                   └─ print analytics (src/server/print.ts)
```

## Key rules

- **The UI never reads state directly.** It calls `HubServer` methods that take a `uid`. Hiding a button is never the only control.
- **One write path.** Mutations run through `commit()`, which notifies subscribers and persists.
- **Validate first, then write.** Public mutations check authorization, state and input before the first write, so a rejected call leaves no partial data.
- **Idempotency.** Every create/submit takes an idempotency key; a retry returns the first result with no new side effects (requests, responses, decisions, bulk confirm, clock in/out, notifications).
- **Time.** All instants are UTC ISO strings; display is America/Chicago (DST-aware, tested). Business logic uses a simulated clock (`state.now`), never wall-clock.

## Sequences

**Request → answer → notify**
1. `createUpdateRequest` (owner only): validates recipients are authorized → writes request, one `OWNER_REQUEST` card per recipient, one notification per recipient, one journal event, one audit event.
2. `submitDecision`/`submitUpdateResponse` (assignee): requires an open paid shift for employees → writes response, closes the card, records the decision and paid-shift review session, applies the human-reported state (never `VERIFIED`), writes journal + audit, and creates the owner notification (`n:resp:<id>` key, so retries cannot duplicate).
3. Owner `acknowledge` marks the notification and moves the request to `ACKNOWLEDGED` without touching the answer; `followUp` creates a new linked request.

**Ingest → review**
1. `ingestFile` parses an hourly file (partial tail held back, duplicates skipped by `event_id`, sequence gaps flagged), normalizes events (redacted allow-listed summary, stable keys), assigns work episodes, records a staged `IntakeRun`.
2. `runAnalysis` builds a permission-filtered context per device, calls the adapter, **validates** output, then `ingestFindings` creates/updates findings and cards. Reviewed findings that later get new events produce an immutable `LATE_EVIDENCE` supplement.
3. Findings only ever set parallel “observed” fields on a step; `status` is changed only by people (or recorded verifier results for high-impact steps).

**Clock** — `clockIn` commits the shift, *then* returns outstanding cards. `clockOut` closes the shift; it never reads cards, AI status or logs.

## Reliability and budgets

- AI outage / log outage are first-class demo toggles; clock, requests and notifications are unaffected.
- `runAnalysis` has an overlap guard, bounded behavior on invalid output (rejected and logged), and an optional-work budget circuit-breaker. Replay adapter cost is $0.
- Real deployment would add scheduled functions with locks, `changes.list` cursors, and cheaper-model-first routing (see `INTEGRATION_PLAN.md`).
