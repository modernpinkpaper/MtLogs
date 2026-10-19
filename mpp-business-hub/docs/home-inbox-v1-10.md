# One inbox, reassigning, AI ideas to the team (v1.10)

## Home is the only inbox
Alerts, review cards, errors, AI recommendations and reminders all land on Home, in groups that are closed until opened (the count is on the line). The goal is inbox zero. The Notifications page and "Review my work" are gone from the menu; the bell goes to Home. The old `/notifications` address redirects to Home.

**Dalia:** Team members · Errors logged by customer service · AI project recommendations (Growth opportunities · Cost and time savers: computer work · Cost and time savers: not computer work · Other) · Needs your attention · Reminders · Other alerts.
**Employees:** Dalia asked you · Confirm what the AI saw · Files · Errors in your log · Reminders · Other alerts.

Answering a request clears the alert about it. "I saw this" / "Got it" clear an item from Home.
**History** now holds everything: project notes, every alert (cleared or not), errors and their acknowledgements, and AI recommendation decisions and dismissals (Dalia only). People see only what was theirs.

## Steps belong to a person
A person can change only the steps assigned to them (rename, instructions, files, sub steps, status). Everyone on the project can read the rest. Dalia can change any step.
- **Give a step to someone else** (More on the step): they get access to the project, and only their own steps.
- **Give a project to someone else** (More on the project): steps not done move over; done steps stay done and keep who did them; the new person sees them as done; the old person loses access.

## Status: one button
Update status → In progress · Completed (once started) · Archive (kept in the list, marked Archived) · Blocked (a reason is needed; an optional day brings it back on Home). The current choice is greyed out. "Update progress" and "Ask for help" are gone from steps.

## Files
- Remove from step: the original file is never deleted. If the step is already done and the person asking is not the one who did it (for example Dalia), the person who did it gets a Yes / Keep it card on Home first.
- Linking an existing file keeps it where it is. If the project has a folder, a shortcut goes in the folder (practice in this copy).

## AI ideas
- Approving a recommendation as a project has a note to the team, shown at the top of the project. Dalia can write or change it later (More → Write a note to the team).
- The reasons and data stay with Dalia. The team never sees them.
- **Send to team…** sends the idea and its steps, with Dalia's note, to the people she picks. No numbers or evidence.

## Tests
`src/test/v110.test.ts`, `e2e/v110.mjs`.
