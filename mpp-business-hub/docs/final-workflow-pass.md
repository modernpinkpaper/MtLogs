# Final workflow, permissions and quality pass (v1.5)

A checkpoint of the version before this pass is the git tag `checkpoint-before-v1-5`. Nothing outside the standalone practice app was touched: no live clock-in app, no Firebase, no Drive, no marketplace. The test suite checks that the source contains no network calls at all.

For each priority: **what was wrong (observed on the checkpoint) → what changed → how it was tested → result → limits.**
Before-results were produced by running a throwaway test against the checkpoint in a separate folder.

## 1. File versions: choose, submit and approve are three different things
- **Before (observed):** Erika calling the approval method on the draft SEO Master → **allowed**, and it became the approved version.
- **Changed:** `selectWorkingVersion` (anyone who can see it, personal, changes nothing official), `submitForApproval` (people on the project, asks Dalia, approves nothing), `approveVersion` (**Dalia only, checked inside the method**), `declineApproval`. States shown: Approved, Draft, Pending approval, Superseded, No approved version, New version, and "Approval not recorded" (see below). Buttons: "Use for my work", "Submit for approval", "Approve version for team use" (Dalia, with a confirm box and an optional "this replaces…").
- **Tested:** `workflow15.test.ts` group 1 (4 tests) and the role matrix; browser: `e2e/workflow15.mjs`.
- **Expected → observed:** Erika can choose and submit; every approval route (direct, old name `setApprovedVersion`, decline, bulk review, other people's files) throws "permission denied"; Dalia's approval records approver, time, old and new version in the audit trail and an append-only journal entry marked "Owner approved"; approving twice adds nothing. **All passed.**
- **Limits:** *simulated test only / requires backend verification.* If someone edits the browser's stored data directly, the app cannot stop them. It does detect it: an approval with no matching record by Dalia shows "Approval not recorded — Do not rely on it".

## 2. Reported complete is not verified complete
- **Before (observed):** Erika reporting step 3 finished moved the counter from "2 of 4 steps done" to "**3 of 4**", with no check and source "NONE". A routine step could also be marked verified by the employee herself.
- **Changed:** one counter everywhere: **"2 of 4 verified complete · 1 reported complete (awaiting check)"**. Employees can only *report*. Verified needs a real check, or Dalia's sign-off. Dalia can choose to let the person sign off a *routine* step; big steps never. The seed data no longer calls employee-confirmed steps "verified" (they are marked signed off by Dalia). Reports are never erased when a step is verified. Owner Home says "N verified complete" and "N reported finished (awaiting a check)" separately.
- **Tested:** group 2 and 3, the role matrix, browser (project page and project list use the same words).
- **Observed after:** reported → "2 of 4 verified complete · 1 reported complete (awaiting check)"; Erika's verify attempt refused; Dalia's own approval without a check refused for a big step; after a (simulated) check the count becomes 3 and Erika's note is still on the step. Checklist ticks never move the count. **All passed.**
- **Limits:** the check in these tests is a simulated "practice" check. The app never contacts Shopify or Amazon.

## 3. Amazon upload stays unverified
- **Tested:** an Amazon card answered "I uploaded it, and Amazon accepted it" → reported complete, 0 verifications, project cannot close, Dalia cannot verify without a real check or an explicit choice, a mismatch check does not verify. A scan of every source file finds **no** `fetch`, `XMLHttpRequest`, `WebSocket` or beacon calls. **Passed.**
- **Limits:** real confirmation needs a real Seller Central integration, which does not exist here.

## 4. Stale tracker plus activity → a confirmation task
- **Before (observed):** My Work listed the step under "Do this next" with "Open this step", the status "Not started" and "We saw computer activity" side by side.
- **Changed:** the hero reads "Confirm where “…” stands", with **"Tracker status: Not started"** and **"Activity detected: Needs confirmation"** labelled separately, **"Why this is next: …before you start over"**, and one button, **Confirm progress**. Every next action now states why it is next.
- **Tested:** group 4 plus browser. **Passed.** After she confirms, it becomes ordinary work.

## 5. Pausing, scheduled resume, reminders and limited tests
- **Tested** in one combined scenario: indefinite pause (31 Dec passes, nothing happens), automatic resume (resumes once; three retries add nothing; one journal entry; one notification), reminder-only (asks Dalia once; never activates), edited and cancelled dates (old date does nothing), with completed steps, notes, checklists, files and journal all preserved (journal only grows). A capped test of 20: out-of-scope items refused, Erika cannot mark verified, and when a scheduled resume date arrives the project resumes **but the test is not widened**; only Dalia's "approve next batch" does that.
- **Added:** "What can people still do while it is paused?" on the pause form, and the paused banner now shows what is allowed and what happens next. **Passed.**

## 6. Owner and employee communication
- **Before (observed):** asking the same question twice made 2 cards; an unsolicited update used the same notification type as a reply.
- **Changed:** duplicates are returned as the same request. Stages: **Requested → Seen → Responded**, and **Overdue** after a due date (Dalia sees it on Home). Unsolicited updates have their own type ("Update from your team"), tracked separately from replies. "I need clarification" added.
- **Tested:** the request survives navigation and a simulated reload, goes Seen when opened, becomes Overdue, one reply notification with a link to the exact step and response, one journal entry. **Passed.** Review-card corrections and "Answer later" were already covered by `ux14.test.ts`.

## 7. Owner phone and employee desktop
- **Changed:** Dalia's phone Home is grouped: Needs your decision · Urgent problems · New replies from your team · Paused projects to review · New AI opportunities. Each item has a short title and a button. Approving a file version asks "Please confirm" first. Employee desktop keeps steps on the left and the step on the right; **all** primary files are always shown (only secondary files fold under "More files").
- **Tested in a browser:** at 1280 and 1024 px the two columns hold, 6 files are visible, no sideways scrolling, text is 15 px. On a 390 px phone Dalia sees the approval request with its button on the first screen. **Passed.** (This test caught a real bug: resizing between desktop and phone crashed Home. Fixed.)

## 8. Authorization, provenance and audit
- `docs/role-action-matrix.md`, plus 14 matrix tests (owner / on the project / not on it). "Owner approved" is now a distinct label next to "Detected in logs", "Employee confirmed" and "Checked in the source system".

## 9–10. Prioritization and the rest
- Next-step order: Dalia's explicit requests (above the list), then confirmation tasks, then due date, then priority, then step order. Paused, blocked, on hold, waiting, reported-awaiting-check, dependency-locked and limited-test-gated steps are never offered as ordinary work (tested for each).
- Private projects and money: lists, search, filters, direct access and the new methods all refuse. **Passed.** *Simulated test only:* in a real system this must be enforced by the server.
- Existing daily reviews, print statistics, AI recommendations, checklists, notifications, history and search still respond. Total: **185 automated tests**, plus three browser runs.

## Questions for Dalia (risky defaults I chose, easy to change)
1. **Routine step sign-off:** employees cannot verify anything by default. You can allow it per step ("Let the person sign this off"). Is that the right default?
2. **Dependencies:** a step whose earlier step is only *reported* complete (not verified) is treated as ready. Should it wait for verification instead?
3. **Approvers:** only you approve file versions. Should anyone else ever be able to?
4. **Seed data:** the four steps that used to be "done by Erika" are now shown as signed off by you. Tell me if that is wrong for your real projects.

## Update after Dalia's answers (v1.6)
Dalia clarified that she does not want to verify or approve routine work. Changed:
- **Done means done.** When someone says a step is done, it counts as done ("3 of 4 steps done"). The app still never claims the result was checked in Amazon, Shopify or anywhere else; it says who reported it. Dalia gets no checking chore. She can choose to check one particular step ("I want to check this one myself"), and only then does it wait for her.
- **File versions are chosen by the person doing the work** (or Dalia): "Use this version for the project". It is recorded (who, when, old and new). Every file shows its name, version and last-modified date and time.
- **Dependencies:** a step whose earlier step is reported done is ready.
- The four seed steps are shown as done by Erika again, not signed off by Dalia.
- Tests rewritten for these rules: 183 pass.
