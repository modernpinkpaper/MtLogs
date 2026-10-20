# Implementation status

Legend: **Implemented** (works, tested or exercised), **Simulated** (works with fake/replay data), **Deferred**, **Blocked**, **Requires owner approval**.

| # | Requirement | Status | Where |
|---|---|---|---|
| 1 | No access to production Firebase/Sheets/MT Log | Implemented | No network code; all data in `src/server/seed.ts` |
| 2 | Clock-in/out unconditional | Implemented | `hub.clockIn/clockOut`; `clock.test.ts` |
| 3 | AI observation ≠ official fact | Implemented | parallel step fields; `evidence.test.ts` |
| 4 | Role-based privacy, owner-private invisible | Implemented | `canReadProject`; `permissions.test.ts` |
| 5 | Device ≠ actor | Implemented | `normalizeEvent`; tests |
| 6 | No start/stop timers | Implemented | none exist |
| 7 | Corrections preserve originals | Implemented | `submitDecision`; tests |
| 8 | No surveillance/punitive ratings | Implemented | no scores; caveats shown |
| 9 | Cost-conscious AI | Simulated | replay adapter $0; budget breaker implemented |
| 10 | Functional controls, no dead buttons | Implemented | all buttons call the data layer |
| 11 | Implementation checklist in the app | Implemented | `/status` |
| 12 | Owner request → card → notification → journal | Implemented | `createUpdateRequest` |
| 13 | Employee reply → owner notification, ack, follow-up, close; idempotent | Implemented | `submitUpdateResponse` |
| 14 | Proactive update | Implemented | `sendProactiveUpdate` |
| 15 | Review cards, bulk confirm for low risk | Implemented | `Review.tsx`, `bulkConfirm` |
| 16 | Step hierarchy, checklists, edit instructions | Implemented | `ProjectDetail.tsx` |
| 17 | Step state machine + audit | Implemented | `transitionStep` |
| 18 | Resource library, roles, versions, discovery | Implemented (providers simulated) | `Resources.tsx`, `parts.tsx` |
| 19 | Journal one log, project/step views, audit | Implemented | `getJournal`, `getAudit` |
| 20 | MT Log v1 ingestion, dedupe, partial tails, gaps | Implemented (synthetic files) | `ingest.ts` |
| 21 | AI findings & FBA_TY001 regression | Simulated (replay) | `replay.ts`; tests |
| 22 | Late evidence supplements | Implemented | `ingestFindings` |
| 23 | Print daily + weekly, episodes, four-state | Implemented (synthetic data) | `print.ts` |
| 24 | Opportunities, expected vs realized | Simulated | `OwnerInsights.tsx` |
| 25 | Owner dashboard, team, data intake, settings | Implemented | `src/ui/pages` |
| 26 | Firebase Emulator, rules, functions | Deferred | see `INTEGRATION_PLAN.md` |
| 27 | Live LLM adapter | Deferred | `DisabledLiveAdapter` only |
| 28 | Sheets/Drive/Docs connectors, tracker import simulator | Deferred / Requires owner approval | — |
| 29 | Production integration | Requires owner approval | never attempted |
| 30 | Teams/email/push | Deferred | in-app only |
| 31 | Real roster for unnamed staff; real print data | Blocked | needs your input |
| 32 | Automated accessibility/keyboard tests | Deferred | manual only |
| 33 | Virtualized long lists | Deferred | lists are bounded and filtered; no 75,000-row views exist |
