# Interface language (v1.1)

Rule: short words, short sentences, names of things in quotes, no hidden jargon. A test (`src/test/plainlanguage.test.ts`) checks reading level on the main screens.

## Old wording → new wording

| Before | Now |
|---|---|
| Pick for group confirm | **Select this item** / **Select multiple items** |
| Group confirm | **Confirm selected items are accurate** |
| Verified (unclear) | **Checked in the source system** (a real check) vs **Employee confirmed** (a person said so) |
| AI inferred / observed level | **Detected in logs** |
| Tracker status | **Step status** (what the team set) |
| Snooze finding | **Remind me later** |
| Pause (one button) | **Pause project** → "Until I resume it" / "Resume on a date" / "Remind me to decide on a date" |
| Overdue (while paused) | Never shown. Paused projects are not late |
| Evidence tier | **Why we think so** |
| Owner-only data | **Only you can see this** |
| Dismiss | **Skip, do not log** (with an optional reason) |
| Escalate | **Needs Dalia** |
| Pilot / canary | **Limited test** (for example "20 listings") |
| Approve next batch | **Approve the next batch** (owner only) |

## Project status words (one place: `projectWorkStatus`)
Active · Waiting for you · Waiting on someone · Needs a new deadline · Paused · Done · Canceled.

## Buttons that always say what happens
"Send update request", "Mark step done", "Resume project", "Change when it resumes", "Open step", "Show details", "Show fewer".

## Empty and error states
Say what is empty, why, and what to do next. Errors for a forbidden item say only "That item is not available to you." (same text as a missing item, so nothing leaks).

## Glossary
Settings → "Words used in this app" lists every term with one plain sentence. Source: `src/ui/lang.ts` (`WORDS`, `GLOSSARY`).

## v1.4 additions
| Before | Now |
|---|---|
| Big step | Needs a check or Dalia's approval |
| We noticed activity on Step 3 | We detected a Shopify Lister test |
| Did this happen? / Yes, accurate | A specific question, then "What happened?" with outcome answers |
| Also waiting (2) | Other items needing attention (2) |
| w-pc04-1016a: missing sequence 3 | Some computer activity may be missing (details behind "View technical details") |
| ERIKAPC device; actor unverified | From the computer ERIKAPC. We can't tell who was using it. (AI guess) |
| opens from All files | A button that opens the file, copies the path, or shows installation details |
| Tracker and activity do not match | Needs confirmation |
