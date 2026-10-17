# Demo scenarios (click by click)

Start: `npm run dev`. Use the **Demo user** dropdown to switch. Demo time starts Fri Oct 16, 2026, 3:00 PM CT. “Demo operations” has the playback buttons.

## A. Requested update in-app
1. Dalia → Projects → P-012 → select Step 3 → **Request Update** → question “Did the test product get created?” → **Send Request**.
2. Switch to Erika → **Review** → card “Update requested by Dalia” (also in her notifications) → choose **Still working on it** → note “Test attempted; investigating permissions” → **Send Requested Update**.
3. Switch to Dalia → bell shows unread → **Notifications → Open** → the step opens with the response panel (original question, answer, time) → **Acknowledge** (or **Ask follow-up**).
4. Try double-clicking Send: only one response and one notification exist.

## B. Paid clock-out and next-day review
1. Erika → **Clock in/out** → “Before you go” shows cards with **Review now** and **Clock out now / Review next shift**. Choose clock-out: it succeeds immediately; cards stay pending.
2. Demo operations → **Advance to next business morning** → Erika → **Clock in**: confirmation first, then the overlay about outstanding reviews.
3. Demo operations → tick **AI provider outage** and **Log sync outage** → clock in/out still works; the text says data may be missing, never “0 work”.
4. Off the clock, Erika can read cards but cannot submit (reviews are paid work).

## C. AI vs official status
P-012 Step 3 shows *Official: Not started* and *AI noticed: Strong activity*. Erika confirms the card → official status stays Not started. Dalia → Step 3 → **Record verifier result** → Not found → still not done; earlier observation intact.

## D. FBA_TY001
Demo operations → **Ingest FBA_TY001 upload events**. Erika’s P-081 card (Provisional) lists both references in order, “outcome NOT verified”. Dalia requests an update on P-081 Step 2; Erika answers *Completed* → Dalia’s notification says “employee-reported, not independently verified”. Step 3 stays unverified until **Record verifier result → Confirmed**.

## E. Resources and journal
Dalia → Demo operations → **Resource discovery** → Erika → Resources: accept or reject suggested links. **New version of SEO Master** → asks “Set approved final?”; nothing is replaced silently. Open P-012 → Journal → switch Whole project / Step 3 (same entries, filtered). Windows/network paths show **Copy path**, not an invented link.

## F. Private project
Dalia sees “Owner Private Planning”. As Erika, Arantza or Carolina it is absent from lists, search (“private”, “planning”), counts and notifications. Demo operations → **Simulate permission denial**, or open `#/projects/prj-priv` → “Permission denied”.

## G. Print
Print Employee A → **My print stats** (own figures, coverage note, grouped problems). Dalia → **Weekly print review** (deduplicated incidents, four-state bars, a logger gap shown as *no coverage*, no cross-person ranking). Team → switch Carolina’s assignment for today between Project and Print.

## H. Proactive update
Erika → P-012 → Step 2 → **Report Progress** → Completed + note → Dalia gets a notification and a journal entry.

## I. Late sync
Erika confirms the Step 3 card. Demo operations → **Simulate late event** → a **Late evidence** card appears; her earlier confirmation is unchanged.

## J. Work that is not part of a project
As Erika, open Review and find “Work that is not in the tracker: MS066”. Choose one: save it as everyday work (goes in her “Other work you saved” list on My Work, Dalia can see it), add it to a project step, make a new step, or flag it as maybe a new project (Dalia gets a notification). Or skip it and do not log it, with an optional reason. As Dalia, open “Other work” in the menu: tabs show waiting, everyday, maybe a new project, added to a project, skipped, and not them. Skipped items stay visible with who skipped them and why, and “Send back for another look” puts the card back in front of the employee. The first decision stays in the history.


## v1.1 scenarios (sign in as Dalia unless noted)
K. **Pause with no end date.** Projects → P-070 → More actions → Pause project → "Until I resume it". Banner shows "Paused". Erika no longer sees it as late work. Resume project: next step comes back.
L. **Auto-resume on a date.** Pause → "Resume on a date" → pick a date. Demo operations → advance to that date. Project resumes at 06:00 Chicago, one notification.
M. **Remind me to decide.** Pause → "Remind me to decide on a date". On that date a reminder appears once; the project stays paused until you choose.
N. **Limited test.** Open the project with a 20-listing test. At 19 of 20 it is quiet; at 20 of 20 Dalia gets one notice and the test pauses. Only rows "Checked in the source system" count. Approve the next batch.
O. **Next step.** Open any project: the "Next step" card is first; open a step to see instructions, substeps, files and recent history.
P. **Select multiple items (Erika → Review).** Select this item on easy cards, then Confirm selected items are accurate. Cards needing a note stay out of the group.
Q. **Request Update (Dalia → Erika).** Step panel → Request Update. Erika gets a card and a notification; her answer notifies Dalia.
R. **AI Recommendations.** More → AI Recommendations → open AF-001 → read "Why we think so" and "The numbers" → Approve. Check the employee brief has no money. Project is unassigned and invisible to Erika.
S. **Assign.** Assign to Erika. She gets a notification and sees the brief only.
T. **Pretend Drive folders.** Project → Files → set up folders. Run again: nothing duplicates.
U. **Privacy.** Switch to Erika: no AI Recommendations, no private projects, no money in search.
V. **Search.** Press the search box, type "FBA": each result says why it matched.
