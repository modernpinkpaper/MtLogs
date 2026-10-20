# Change requests before the big build

Dalia is collecting fixes and visual changes to the project tracker web app BEFORE the real build starts. Each one is logged here.

## Done
1. **Path bar (like a folder path).** Pages more than one level in now show where you are, for example `Settings › Priorities and sources` or `Projects › P-070 › Step 2`. Every part is a link, and a "← Back" button goes up one level. It shows on phones too. Top-level pages (Home, Projects, Settings and so on) show nothing.

## Process for visual direction (agreed)
Dalia will attach design direction made by ChatGPT. Before changing anything I will:
1. Compare it against the current look and against what the app has to do.
2. List every difference or conflict (for example: a layout that hides something she asked to be visible, a colour that fails readability, a screen the direction does not cover, wording that contradicts the plain-English rule).
3. **Ask Dalia before making any update.** Nothing changes until she answers.

## Proposed, waiting for Dalia's answers
2. **Team right now (owner only).** One row per person, at the top of the Projects page:
   - clocked in or out, last computer activity time, and "Looks like they are working on: P-012, step 3" with how sure the AI is.
   - "Updated 10:30 AM" with a Refresh button. Automatic runs several times a day during work hours; Refresh is for when she wants it now.
   - The AI says "looks like", never "is". It is built from MT Logs. Work away from a computer (printing, inventory) shows as "no computer activity", not "idle".
   - Employees never see each other's activity. The AI never changes a step or a project from this.
   Open: how often (every 30 minutes or hourly), exact hours, and where it sits.
3. **Dalia's own projects.** Already built: Projects has All / Mine / By person, plus an "Assigned to" filter. Private projects show only to her. Nothing to add unless she wants a change.

## Print Team and Projects UX spec (Oct 20): built, Oct 20
Saved as `docs/ux-spec-2026-10-20.md`. Built and published (private copy v15). Details: `docs/ux-spec-implementation-report.md`.
- Done: owner Print Team, My Print Stats, Print verification, Projects > Steps > Step details, step notes, avatars (3 letters + own photo), day tabs, icon cards, sortable table, docked person panel, two-column step workspace.
- Dalia said "everyone listed" on the Print Team table: done.
- NOT done yet:
  - The 28 acceptance tests as a numbered Pass/Fail table.
  - Real order claims and real print logs in the private copy (Dalia will provide them after the layout is approved).
  - Left menu and top bar like the ChatGPT photos (photo shows My Tasks, Resources, Reports, notification bell; not in the spec).
  - Related Links, Priority and a progress bar on the project card (in the photo, not in the spec). Ask first.
  - Print-team tab row is long and cuts off on the right.
  - Item 2 above (Team right now): still waiting for her answers.

## Waiting for more items
Dalia will add more fixes. They are added here as they come.
