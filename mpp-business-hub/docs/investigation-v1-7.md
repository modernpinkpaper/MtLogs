# v1.7 Investigation priorities and data sources (owner only)

Built on the existing AI Manager. No new top-level screen. The old "Goals" and "Where it looks" tabs are now one tab, **Priorities and sources**.

## What was already there (kept)
AI inbox, finding detail, approve / link / snooze / dismiss, owner-only models and numbers, goals list, sources list, results tracker. The old sample scan still works, but each sample item now needs its matching source to be approved and to hold made-up data, and it is labeled "Sample finding".

## What was added
- **Catalog** (`src/domain/catalog.ts`): the 17 sources (A1–A5, B1–B9, C1–C3) and 19 goals from the investigation document, with purpose, what is read, what is left out, retention, cadence, cost, safety text, example questions, and what is missing.
- **Source registry**: status (Not connected, Demo only, Pending permission, Connected, Connected but stale, Error, Disabled), coverage, delay, last read, approve / pause, editable scope and limits, add your own source. **Approving a source only records permission. It never connects anything.** A source with no data in this build becomes "Pending permission".
- **Goals**: plain-English question, chosen sources, chosen checks, editable numbers (for example "days with no update"), priority, on/off, add or remove your own. A goal with no check is saved as a brief. It invents nothing. "Show the brief" gives text you can hand to Claude for a custom analysis.
- **Check library** (`CHECK_LIBRARY`): 10 plain rule-based checks. New goals combine them without code.
- **Runner** (`src/server/investigation.ts`): reads only approved sources that hold data, says what is missing for the rest, de-duplicates, respects dismissed and snoozed decisions unless the evidence changed, never restarts a paused project, never creates a project, assigns anyone or notifies staff.
- **Finding fields**: what was found, affected scope, data used (with "Sample" or "Copy of real data" and its coverage), alternative explanations, recommended project and steps, expected benefit (always "Insufficient data to estimate" unless real numbers exist), how we will know it worked, related work, employee-safe brief, priority score and group (Urgent, Needs decision, Follow up, Worth testing, Background idea).

## What is real and what is simulated
- Checks run on whatever data is in the build: made-up data in the demo, a one-time copy of real tracker and computer logs in the private build.
- No AI model call, no network call, no store or account is touched. B-tier and C-tier sources have no connector. They show "Not connected" or "Pending permission".
- Employees cannot call any of these methods. Tested in the data layer.

## Tests
`src/test/investigation17.test.ts` (14 tests) and `e2e/inv17.mjs` (browser). Full suite: 197 passing.
