# Changes made in v1.1 (Proactive AI Manager addendum)

Nothing from v1.0 was removed. The app was extended in place. Old data in the browser store is carried forward (the storage key moved to `mpp-hub-demo-state-v2`; use *Demo operations → Reset all demo data* if a screen looks odd).

## Summary
1. **Pause and resume** — three modes, scheduler, reminders, limited tests with owner approval.
2. **Simpler screens** — five main menu items per role plus "More"; Home shows what needs you; details live in open-and-close sections.
3. **Plain wording everywhere** — see `docs/interface-language.md`.
4. **Step-centered project page** — next step first, then step plan, step panel, files, history.
5. **Easy AI review cards** — three kinds of truth kept apart; real in-app "Request Update" flow unchanged.
6. **AI Recommendations (owner only)** — findings inbox, numbers, plan, approve, employee brief, pretend Drive folders, goals, sources, outcomes.
7. **Safeguards kept and tested** — see `PRIVACY_AND_PERMISSIONS.md`.

## Before / after (main screens)
| Screen | Before | After |
|---|---|---|
| Owner Home | Long list of everything | Tiles (Active / Paused / Waiting), "Needs your decision" (top 5), "What changed", collapsed "Who is doing project work today" |
| Projects | One flat list | Grouped ("Needs your attention", "In progress", "Paused", "Done"), sort, list or board view, scope filter; choices remembered per person |
| Project page | Many panels at once | Status banner, "Next step" card, tabs, step plan with step panel |
| Review | Many buttons per card | Clear answers per card; **Select this item**, **Select multiple items**, **Confirm selected items are accurate** |
| Team & Print | Separate pages | One page with tabs; daily print stats and weekly analysis stay separate |
| Search | None | One search box with "why this matched" |
| Owner menu | 10+ items | Home · Projects · Review · Team & Print · AI Recommendations · More |

## New routes
`/owner/ai` (inbox), `/owner/ai/:id` (finding), `/team-print`, project page tabs, search overlay. Old routes redirect (see `App.tsx`).

## New data (all additive, see `DATA_MODEL.md`)
`Project.pause`, `Project.pilot`, `Project.employeeBrief`, `Step.onHold`, findings, models, goals, sources, outcomes, drive simulation, new journal and notification types.

## Migration notes
Existing projects load with no pause state (they are Active). Old notification and journal types still render. New settings: `statusRunLocalTime` (default 06:00 Chicago).

## Tests
121 automated tests in 13 files plus a browser run (`e2e/v11.mjs`). See `TEST_REPORT.md`.

## Unresolved / not built
- Real AI model, real Drive/Sheets/Etsy/Amazon/Shopify connections (all pretend).
- Real push/email for notifications (in-app only).
- Real roster and print data.
- Server-side scheduler (the demo advances a pretend clock; production would use a scheduled function).

## How to run and test
`npm install && npm run dev`, sign in as Dalia, then follow *Login → Try this* or `DEMO_SCENARIOS.md` (scenarios K–V cover v1.1).

## v1.2 UX overhaul
See `docs/ux-overhaul-v1-2.md` for the audit, what changed, and how to check it. Summary: one "Do this next" card for employees, a calmer project page (no repeated blocks, phone layout fixed), review cards that put the answer first, compact lists with one clear action, and quieter notifications. No features were removed. All 121 tests and the browser run pass.
