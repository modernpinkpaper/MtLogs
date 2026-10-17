# MPP Business Hub — stand-alone prototype

An interactive, runnable prototype of the MPP Business Hub described in the master specification.
**All data is synthetic.** It never connects to the production Firebase clock-in app, Google Sheets/Drive, MT Log,
Amazon, Etsy, Shopify or any paid API. Everything runs inside your browser tab.

## Run it

Prerequisites: Node 20+ and npm.

```bash
cd mpp-business-hub
npm install
npm run dev          # opens http://localhost:5173
```

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs the 59 automated tests (clock/pay, requests, evidence, permissions, resources, print) |
| `npm run typecheck` | TypeScript check |
| `npm run build` then `npx vite preview` | Production build served locally |
| `node e2e/smoke.mjs` | Optional browser smoke test (needs `npm i -D playwright`; the app must be running on port 4173) |

**Reset the demo:** go to *Demo operations → Reset all demo data* (or clear this site's browser storage).

## Switch users

Open the app, pick a demo user on the login screen, and use the **Demo user** dropdown in the top bar to switch at any time.
Dalia (owner), Erika, Arantza, Carolina (assignment changes by day), Print Employee A/B/C, and one Additional Employee with no assumed duties.
This switcher is a demo tool only; it grants no production privileges.

## Guided tour (10 minutes)

See `DEMO_SCENARIOS.md` for click-by-click steps. The headline flow:

1. Sign in as **Dalia** → *Projects* → P-012 → Step 3 → **Request Update** → send.
2. Switch to **Erika** → *Review* → see “Update requested by Dalia” → choose *Still working on it* + note → **Send Requested Update**.
3. Switch to **Dalia** → the bell shows an unread notification → open it → the exact step and response → **Acknowledge**.
4. As **Erika**, *Clock in/out*: clock out with cards pending (it never waits), advance to the next morning in *Demo operations*, clock in, and only then see outstanding reviews.
5. *Demo operations → Ingest FBA_TY001 upload events*: Erika’s review shows both Amazon references in order and keeps the outcome **unverified**.

## Documents

`ARCHITECTURE.md` · `DATA_MODEL.md` · `PRIVACY_AND_PERMISSIONS.md` · `INTEGRATION_PLAN.md` · `DESIGN_DECISIONS.md` · `AI_RULES.md` ·
`DEMO_SCENARIOS.md` · `TEST_REPORT.md` · `IMPLEMENTATION_STATUS.md` · `BACKLOG.md`

## Honest limitations

- Notifications are real stored records, but they live in this browser’s demo store; there is no second signed-in client, email or push.
- AI findings come from a labeled **replay adapter** (deterministic rules), not an LLM. No API calls, $0.
- Firebase Emulator/Firestore rules/Cloud Functions are **not** used. The authorization boundary is an in-browser server-style module (`src/server/hub.ts`) with the same shape, so it can move behind real functions later.
- No real roster, trackers, logs or print data. Unnamed staff are generic placeholders.
