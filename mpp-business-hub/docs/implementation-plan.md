# Implementation plan (additive; nothing is rewritten)

| Phase | What | Where | Safety net |
|---|---|---|---|
| 0 | Audit, baseline tests (67 pass) | `docs/ux-audit.md` | Existing tests stay unchanged where behavior is unchanged |
| 1 | Pause / resume: three modes, scheduler, reminders, banner, journal + audit, suggest-pause, paused work display | `src/server/pause.ts` + `hub.ts` delegates | New `pause.test.ts` |
| 2 | Navigation, Home, My Work, Projects (list/board/sort/filter), Project page, explained search | `src/ui/*` | UI smoke test in a browser |
| 3 | Review cards and notifications rewrite; plain-language glossary | `Review.tsx`, `Notifications.tsx`, `lang.ts` | Plain-language test, old review tests |
| 4 | Limited tests (pilot checkpoints) | `src/server/pilot.ts` | New `pilot.test.ts` |
| 5 | AI Recommendations: inbox, owner-only impact calculator, approve → assign → simulated workspace, goals & sources | `src/server/manager.ts`, `finance.ts`, `drive.ts` | New `manager.test.ts`, `finance.test.ts`, leak tests |
| 6 | Full regression, docs, republish preview | `docs/*`, `TEST_REPORT.md` | All tests, browser run |

Schema changes are additive (new optional fields, new collections). Saved demo data from an older version is replaced by fresh seed data (new storage key); no production data exists.
