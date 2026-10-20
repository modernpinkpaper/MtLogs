# UX audit (Phase 0, before any v1.1 change)

Baseline: 21 screens, 25 routes, 8 test files, **67 passing tests**. Everything below was inspected in the running app and in `src/ui`.

## What exists today (must not regress)
Clock in/out with paid-time rules · request-update round trip with real in-app notifications · review cards (AI observations, owner requests, late evidence) · projects with steps/substeps/checklists, instructions editing, status changes with audit · resources with roles, versions, suggested links · one journal with project/step filters · "Other work" (everyday / skip / add to a step, owner can see skipped) · print daily figures + owner weekly report · team assignments (Carolina by day) · opportunities ("Ideas") · data intake / AI runs / budget · settings · demo controls.

## Problems found

### Too much at once
- **Navigation:** 15 flat menu items for an owner, 10 for staff, including technical ones ("Computer data & AI", "What works", "Demo controls") at the same level as daily work.
- **Owner home:** 6 quick buttons, a "what is new" block, a "needs you" list, people cards, and a print table all compete on one screen. Nothing says "do this first".
- **Employee home:** a flat list of every open step. Paused, blocked, waiting and next-to-do work look the same. No reason is shown for why a step is not ready.
- **Project page:** a 5–6 line header table, 6 tabs (Overview, Plan & steps, Files, History, Results, People), and a step panel with 9 sections. Several tabs repeat the same steps.
- **Project cards:** show priority, owner, deadline, a progress bar and two buttons; no grouping, no sorting, no filters beyond text and priority.
- **Review cards:** show up to 6 chips plus four lists ("What we do not know", "Please check", proof, status chips) before the buttons.

### Confusing wording
| Where | Today | Problem |
|---|---|---|
| Review checkbox | "Pick for group confirm" | Unclear what "group confirm" does |
| Review button | "Confirm picked (n)" | Does not say what is being confirmed |
| Review buttons | "Tell my status…", "Skip it", "Later" | "Tell my status" hides a second question; "Skip it" vs "Later" unclear |
| Status chips | "Tracker says", "AI guess", "Person says so", "Double-checked" | Not the agreed vocabulary (detected in logs / employee confirmed / checked in source system) |
| Empty/not-ready | "Not final yet", "All data arrived" | Does not say what to do |
| Menus | "Computer data & AI", "Other work", "Ideas", "Demo controls" | Internal names |
| Notifications | Filter by 9 internal types | Staff do not think in types |
| "Unmatched work" | "Work that is not in the tracker" | Spec wording: "Work that may not belong to a project" |

### Duplicated or scattered
- Owner lists "Weekly printing", "Other work", "Team", "Ideas" as four separate menu items; they are one topic (team and print).
- Project history lives on the project page **and** on a global Journal page with different filter layouts.
- "Edit Plan" is a button that only switches tabs; "Open Instructions" only scrolls.
- Resources appear in three places (project tab, step panel, library) with different layouts.

### Missing
- **No pause/resume** (or reminders, or limited tests).
- No sorting or grouping on Projects; no Board view; no per-user saved view.
- Search finds items but does not say why they matched; it does not search journal text, SKUs from logs, or submission numbers.
- No proactive recommendations inbox, approval-to-project path, or owner-only impact calculator.
- Notifications are a flat list (no grouping of repeated updates).
- Mobile: top menu button hides all navigation; no bottom bar.

### Inert or weak controls
- "Edit Plan" and "Open Instructions" (above). "Demo controls → Add a half-saved file" has no visible result unless you open the data page.
- Review "Later" saves nothing visible to the employee.

## Decisions (what changes)
1. **Navigation:** staff get 5 primary items (My Work, Projects, Review my work, Notifications, Clock or My printing); owner gets 5 (Home, Projects, AI Recommendations, Team & Print, Notifications). Everything else moves under **More**. On phones the 5 primary items become a bottom bar. Old URLs keep working.
2. **Owner home:** one "Needs your decision" list first; "What changed" collapsed to a short summary; counts strip (Active / Paused / Waiting for you).
3. **My Work:** groups: Needs a response · Next to work on · Waiting or blocked · Paused · Recently finished. Each step says why it is not ready.
4. **Projects:** List (default) and Board views; groups and sort per the addendum; filters; compact cards with one next action.
5. **Project page:** Next step first; step plan + step detail is the workplace; tabs reduced to Overview · History · All files · More (people, results, change log).
6. **Review cards:** one question per card, "What the system noticed / What it suggests / What it does not know / What you need to do", evidence behind a button; selecting several items has plain wording.
7. **Language:** one glossary (`docs/interface-language.md`, `src/ui/lang.ts`); every label audited.
8. **Pause/resume + limited tests** and the **AI Recommendations** layer are added without touching existing records.
