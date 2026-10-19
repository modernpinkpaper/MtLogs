# Employee view changes (v1.8)

Made from Dalia's walk-through of the employee view. This is the practice copy. Nothing is created in Google Drive.

## What changed
- **Home** is the first page (it replaces "My Work"). It shows notifications first: Dalia's requests, activity the AI saw, files the AI found, and clock in/out reviews. Then "Your projects", each with the last confirmed activity (date and time) and, inside a project, per step and sub step.
- **Projects** page: sort labels are clearer ("Where I left off" and others).
- **Project top**: "Who can see it" and "How we count progress" are gone. It now says "AI last checked your activity: [date, time]" with a **Check my activity now** button. The button reads activity since the last check and makes notifications to confirm. It is on the project, not on steps.
- **Steps**: name, short description, and "Marked done [date, time]". "Employee confirmed" is no longer shown on the step (the history still records who said what). "Checklist" is now **Sub steps**, labeled 4A, 4B, 4AA.
- **Buttons**: **Begin** (only while not started), **Update progress** (pop-up with a note), **Completed** (works in every state, even if already done). Block and Pause are under **More**.
- **Editing**: project name, step names, short descriptions and "what to do" can be edited. Steps can be added (it asks how many and makes blank rows). Drag a step, or use the arrows, to reorder. Numbers and linked file names follow.
- **Files**: **Add file** menu: new Google Sheet (blank, SKU families and columns, or copy of a sheet in the project), new Google Doc, or link an existing file. Names look like `P-012 - project name - 1 Step name - Erika - File 1` and follow step renames and reorders. **All files** is grouped by step.
- **AI-found files** at end of day become notifications: confirm, or move to another step or project (the file is renamed to match). Unmatched activity can be saved or dismissed. The activity log is never deleted.

## Rules kept
- AI never creates projects or assigns people by itself. Clock in and out are never blocked. Owner-only money and findings stay hidden from employees.
- Project-level pause stays with Dalia and project managers. Step-level pause and block are now allowed for the person assigned.
- Real Google Drive creation and renaming only happens in the real version, after Dalia approves it.

## Tests
`src/test/stepwork18.test.ts` and `e2e/emp18.mjs`. Older e2e checks were updated for the new Home page and the "Completed" button.
