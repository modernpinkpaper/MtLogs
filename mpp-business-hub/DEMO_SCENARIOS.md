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
