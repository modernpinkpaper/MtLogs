# Merge plan: project hub + clock-in app

Status: PLANNING ONLY. Nothing is built or connected. Dalia approves each decision here before any build starts.
Never touch the live clock-in app. All work happens in a separate test Firebase project.

## What exists
- **Clock-in app** ("MPP Time Clock V4 Firebase", Drive → Scripts and Codes → Apps). React client, Express + tRPC API in a Firebase Cloud Function, Firestore, Firebase Auth, deny-all browser rules. Three areas: office PIN station (`/kiosk`), employee portal (`/portal`), manager area (`/admin`). Already built and tested (112 tests).
- **Hub prototype** (this repo, `mpp-business-hub`). React screens plus a simulated in-browser server. It proves the screens and rules. It has no real database.
- **Print claims**: Firestore project `mpp-claimer`, collection `claims`. Read-only for the hub.

## Decisions made
1. The PIN station stays as its own page on registered office computers.
2. At clock out, people see their print numbers and confirm. A missing number never stops anyone leaving. Dalia can see who confirmed and what they were shown.
3. Team chat is left out.
4. Clock features are not rebuilt. They already exist. The work is placing them inside the new menu and sharing one set of people.

## Recommended build order (Dalia to approve)
The hub's "project database" and the "merge" are one job, not two. The hub needs real sign-in, real people and real storage. The clock app already has all three. Building the hub separately and merging later would mean redoing people, sign-in and permissions.

So: **add the hub inside the clock app's codebase, in a test Firebase project, behind an on/off switch.**

0. Test Firebase project and a copy of the clock app running there. Nothing live is touched.
1. One set of people. The hub uses the clock app's employees (their ids, roles, Paychex worker numbers). Owners: Dalia, and Moe (does not clock in). Customer service permission added.
2. New menu. Clock area = the existing clock pages (station link, My hours, Time off, and the manager area for Dalia), relinked, not rewritten.
3. Projects, steps, files and the Home inbox. The prototype's rules become server routes over Firestore, with the same checks every time (steps belong to their person, owner-only money, history never deleted).
4. Print numbers from claims (read-only from `mpp-claimer`), revenue per hour from clock hours minus confirmed project time.
5. Customer service errors and acknowledgements.
6. Real AI (key with a spending limit, kept as a secret).
7. MT Logs feed.
8. Google Drive files and folders (robot account, practice folder first).
9. Switch on for Dalia only, then one or two people, then everyone.

## Rules that carry over
- Clock in and out are never blocked by the server.
- AI never creates projects or assigns people by itself.
- Employees never see owner-only money, findings or the data behind recommendations.
- Nothing is deleted. Cleared items stay in History.
- The clock app's rules stay as they are: a punch belongs to the day it started, one paid break per shift, overtime past 8 hours.

## Open items
- Per-person start times (late-for-shift alert): the clock app has ONE shift start time, a grace period and working days. Per-person times were never built. Recommend leaving as is.
- Clock-app ideas list: Paychex PTO column waits on three answers from Paychex.
- Does `mpp-claimer` keep all old claims, or only recent ones?
- Is `mpp-claimer` a separate Firebase project from the clock app?
- Where do MT Logs files go today?
- Secrets: a `.env` file sits in Drive. Secrets should move to Firebase secrets / environment settings before anything is shared.

## Information still needed from Dalia
Clock-app repo access, a test Firebase project, read-only access to `mpp-claimer` plus sample claims, an AI key with a limit, Google robot account for Drive, the list of who is who (roles and emails), and where MT Logs files go.
