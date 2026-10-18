# UX overhaul (v1.2)

Same app, same features, same safeguards. Only the way things are shown changed. Nothing was removed.

## Audit: what was wrong (from real screenshots, both roles, desktop and phone)
| # | Problem | Where |
|---|---|---|
| 1 | Nine near-identical cards, each with the same big "Open this step" button; one project repeated five times; no "do this first" | Employee Home ("My Work") |
| 2 | The same step shown three times (a "Next step" card, the step list and the step panel); "Latest in this project" repeated the step's own activity; up to six chips per step | Project page |
| 3 | Two columns squeezed to one word per line; the page scrolled sideways | Project page on a phone |
| 4 | Four labelled text blocks above the answer buttons; you scrolled before you could answer | Review cards |
| 5 | A big "Open" button on every row, three or four badges per row, tiles showing zeros | AI Recommendations, Projects, Owner Home |
| 6 | Four equal buttons on every notification | Notifications |
| 7 | A tall banner, a top bar with a duplicate bell, and a "Demo user" label took about 250px before any content | Every screen |

## What changed
- **My Work**: one "Do this next" card with one big button. Everything after it is a quiet list grouped by project. The whole row is the link. "Waiting", "Paused", "Recently finished" and "Other work you saved" fold away. A single pink bar says if Dalia asked for something or items need checking.
- **Project page**: the next step is the step that is already open, marked "Next". The step list and the step panel sit side by side on a computer. On a phone the list folds into "All steps" and the step gets the whole screen. The main buttons ("I finished this step", "Update progress", "Ask for help", or "Ask for an update" for Dalia) sit right under the step title. Activity found by the AI is one short line with "Check it". History, files you do not need yet, and extra options are in open-and-close sections.
- **Review cards**: question, one plain sentence, then the answer buttons. "Why we think so, and what we do not know" and the proof list are one expandable section underneath. The "Detected in logs / Employee confirmed / Checked in the source system" labels are unchanged. "Select multiple items" and "Confirm selected items are accurate" still work.
- **Lists** (Projects, AI Recommendations, Owner Home "Needs your decision"): compact rows, the whole row is the link, a badge only when something is unusual (urgent, paused, private, needs attention). Buttons only where they are the real next action ("Resume project", "Choose who works on it", "Answer Dalia").
- **Notifications**: "Open" is the one button. "Mark as read", "Remind me in 1 hour" and "Dismiss" are quiet links.
- **Top of every screen**: one-line "Practice copy" strip, no duplicate bell on a computer, shorter phone header.
- **Quiet status**: a coloured dot and a word replace a full badge on every row.

## What did not change
Pause and resume, scheduled resume, limited tests, owner approvals, employee confirmations, request-update flow, notifications, clock in/out rules, privacy permissions, print reports, AI Recommendations, project documents, all history and proof.

## How to check it
1. Sign in as **Erika**. My Work shows one big button. Open "Review my work": the buttons are on the first screen.
2. Open P-012. The next step is already open. Make the window narrow: the step list folds into "All steps".
3. Sign in as **Dalia**. Projects, AI Recommendations and Home are lists with no repeated "Open" buttons.
4. Run `node e2e/v11.mjs` (app on port 4173). It now has checks for each of these.
