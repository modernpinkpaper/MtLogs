# Proactive AI Manager — implementation notes

Scope: owner-only layer on top of the existing hub. Pretend data only. No production access.

## Flow
Pretend sources → **findings** (deduped, with urgency) → deterministic **numbers** (`finance.ts`) → **plan draft** → **Dalia approves** → sanitized **employee brief** → **unassigned project** (invisible to employees) → Dalia **assigns** → employee notified → pretend **Drive folders** → **outcome** tracked later.

## Rules enforced in code
- AI never creates a project or assigns a person. Only `approveFinding` / `assignProject`, both `requireOwner`.
- Owner-only collections (findings, models, goals, sources, outcomes, owner notes, money fields) are read only through `requireOwner` methods.
- The employee brief is checked by `findOwnerOnlyTerms`; money words block the send.
- Numbers separate capacity from cash and revenue from profit; missing inputs give "not enough information", never an invented figure.
- Drive provisioning is idempotent; a partial failure can be retried; it makes shortcuts, never copies, and never moves scripts.
- Pausing: no findings are raised as "late"; activity found while paused uses neutral wording.

## Files
`src/server/manager.ts`, `finance.ts`, `drive.ts`, `ownerSeed.ts`, `pause.ts`, `pilot.ts`, `search.ts`; UI `OwnerAI.tsx`, `pauseUi.tsx`.

## Tests
`manager.test.ts` (leak tests across lists, search, journal, notifications, exports), `finance.test.ts`, `pause.test.ts`, `pilot.test.ts`.
