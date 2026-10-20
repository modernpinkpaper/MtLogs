# Targeted UX refinement (v1.4)

Same app, same features, same safeguards. A checkpoint of the version before this work is saved as the git tag `checkpoint-before-v1-4`. To go back: `git checkout checkpoint-before-v1-4`.

## What changed, screen by screen

### Review cards: confirm the activity AND the result
**Before:** "We noticed activity on Step 3 of P-012. Did this happen?" with "Yes, accurate / Something is incorrect / This wasn't my work". It checked the AI, not the outcome.

**Now:** each card asks a question that fits what was detected, with one plain sentence of evidence, then "What happened?".

| What was detected | The question | The answers |
|---|---|---|
| A tool test | "Did you test the Shopify Lister today?" | Completed the test successfully · Tested it, but something went wrong · Still working on it · I didn't work on this · The AI misunderstood what I was doing · I'm not sure / Answer later |
| An Amazon upload | "Did the FBA_TY001 variation change go through successfully?" | I uploaded it, and Amazon accepted it · I uploaded it, but I haven't seen the result yet · I uploaded it, but it did not go through · Still working on it · and the same three last answers |
| A file edit | "Did you finish updating MS066 (…)?" | Finished it · Made progress, not finished · Something went wrong · … |
| Activity on a paused project | "Did you work on this paused project? Why?" | Yes, I worked on it · … (the project stays paused) |
| New activity after a review | "New activity arrived after your review. Does your first answer still hold?" | Yes, it still holds · It changes things · … |
| Work with no project | "What project or task was this work for?" | Save as a small task · Add to a step · New step · Maybe a new project · Skip |
| Dalia's request | "Dalia asked for an update on …" | Completed · Still working · Blocked · Not started · I need clarification |

Under every card: **"Anything else we should know? (Optional)"** with an example.
**"View activity details"** opens a short list of the actions and the time of each, then "Why we matched it here", what we do not know, how sure we are, and **"View technical details"** for IDs.

The two ideas stay separate in the data:
- *Activity accuracy* is the action (confirm, correct, not mine).
- *Outcome* is `outcome` on the decision, and `humanReported.outcome` on the step. It is always "employee-reported", never proof.

What each answer does (one place: `src/domain/reviewKinds.ts`, `outcomeEffect`):
- A passed **test** is progress: the step goes to "In progress", never "Done".
- An **Amazon** "accepted" is reported only: the step shows reported-complete and stays unchecked until a real check is recorded. The project cannot close.
- **Something went wrong** tells Dalia, with the person's own words.
- **I didn't work on this** keeps the activity and does not credit it. The history says "That does not mean no work happened."
- **The AI misunderstood** opens a quick fix: wrong project or step (moves the activity to the right step, the first guess stays), someone else was using this computer (the activity is kept, attribution is disputed, Dalia is told), or something else.
- **Select multiple items → Confirm selected items** only says the activity is accurate. It never completes, verifies or closes anything, and it refuses big or conflicting steps.

### Dalia's Home alerts
**Before:** "P-012 — Use Shopify Lister Tampermonkey script to list the new SKUs: we saw activity, but the tracker still says "Not started"" and "PC-04 13:00 file is missing some events (w-pc04-1016a: missing sequence 3)".

**Now:** a short title, one sentence on why, one button.
- **Shopify listings — Progress needs confirmation** · "Erika tested the Shopify Lister, but the project hasn't been updated." · **Review progress**
- **Some computer activity may be missing** · "Counts and AI guesses from that time may look low. It does not mean nobody worked."
- Project IDs, step names, times, sources and sequence numbers are behind **View technical details**.
- "Also waiting" is now **Other items needing attention (n)**. Two or more answers become one "Two employee updates are ready".

### Step files you can use right away
Each file on a step shows its name, what it is and what it is for, how it relates to the step, an approval label, and a button that does something.
- A verified link: **Open file / Open folder / Open instructions** (a practice preview here).
- A Windows or network path: **Copy folder path** and **Where to find it**. It is never shown as a web link.
- An installed script (Tampermonkey, InDesign): **View installation details**. It stays where it is installed. We never move it into a project folder.
- Unknown: **Location not confirmed** and **Add the location**. We save what you type and mark it "not checked yet". We never make up a link.
- Approval labels: **Approved — Use this version** · **Draft — Still being edited** · **New version — Awaiting approval** · **No approved version yet** (a name like "FINAL" is not an approval).
- If two copies exist and none is approved, the step says so and offers **Use this version**.

### Project page on a phone
Order: compact header → **the current step** (title, main button, instructions, checklist, files) → the full plan as "All steps" → history. The breadcrumb is hidden to save room. No sideways scrolling.

### Counts that agree
One function, `projectCounts`, feeds Home and Projects.
- Home: "4 team projects active, 1 private."
- Projects: "4 team projects active · 1 private · 0 paused."
- Employees never see a private count.

### Project description card
A small "i" beside a project number or name (Home, My Work, Projects, project page, review cards, notifications, history). Tap, click or hover to see what the project is, who is on it, when it is due and what is next. Dalia and the people on the project can **Add a description / Edit description**. A project you cannot see shows nothing at all.

### Log something I did
For small jobs the computer may not have seen ("Dalia remembered something, told Erika, Erika updated a listing"). A button on My Work and Review. Fields: what you did, who asked, about when, what it was for (a small task, a project, or a step), and a note. It never changes a step's status. Dalia sees it under **Other work → Logged by hand**, with who asked.

### Plain words
"Big step" is now **Needs a check or Dalia's approval**. "We noticed activity on Step 3" is now **"We detected a Shopify Lister test"** (in alerts) or a specific question (on cards). Journal lines like "ERIKAPC device; actor unverified" now read "From the computer ERIKAPC. We can't tell who was using it. (AI guess)". The stored record is unchanged.

## Tests for the 15 acceptance items
| # | Test | Where |
|---|---|---|
| 1 | Erika reports the real outcome of the Shopify test | `ux14.test.ts`, `e2e/v11.mjs` |
| 2 | Partial progress never completes the project | `ux14.test.ts` |
| 3 | Wrong step, wrong person, "not my work" fixes | `ux14.test.ts` |
| 4 | Dalia asks, Erika answers, notification and journal | `ux14.test.ts`, `requests.test.ts` |
| 5 | Bulk confirm does not close or verify | `ux14.test.ts` |
| 6 | An Amazon upload stays unverified | `ux14.test.ts`, `e2e/v11.mjs` |
| 7 | Step 3 opens the approved SEO sheet | `ux14.test.ts`, `e2e/v11.mjs` |
| 8 | Script and Windows path controls | `ux14.test.ts`, `e2e/v11.mjs` |
| 9 | Approved and draft are distinct | `ux14.test.ts` |
| 10 | Phone: next step and files first | `e2e/v11.mjs` |
| 11 | One definition of active projects | `ux14.test.ts`, `e2e/v11.mjs` |
| 12 | Pause, schedules, limited tests, private data, journals survive | `pause.test.ts`, `pilot.test.ts`, `permissions.test.ts`, `ux14.test.ts` |
| 13 | Timekeeping never blocked, even with the AI off | `clock.test.ts`, `ux14.test.ts` |
| 14 | Print daily stats and weekly analysis | `print.test.ts`, `ux14.test.ts` |
| 15 | Old navigation and demos still work | `e2e/v11.mjs`, `e2e/smoke.mjs` |

## Still simulated
All integrations. "Open file" shows a practice preview. The AI is a replay of fixed rules. Notifications live only in this browser. Saved demo data from earlier versions is replaced the first time you open this version (the storage key is now v3). Use "Demo operations → Reset" any time.
