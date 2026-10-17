# Integration plan (NOT authorized yet)

Nothing here has been done. Each step needs your separate, explicit approval. The prototype never guesses a production Firebase project id.

## Order of work (mirrors the spec’s Phase 6)
1. **Inspect, don’t change:** framework, Auth and time-clock design, Firestore layout and rules, deployment, secrets, backups of the existing clock-in app. Adapt to what exists rather than replace it.
2. Decide embed (module/micro-frontend) vs merge. Time-clock reliability comes first: the hub must be able to crash without affecting clock in/out.
3. Create a **staging** Firebase project with restricted test users; port `HubServer` methods behind callable functions + default-deny Firestore rules; test with the emulator.
4. **Read-only** import of the team and private trackers using a simulator first (exceptions report, parity counts, P-ID collision check). Private tracker stays private; no bidirectional sync loops; keep originals and a rollback.
5. **Log-only pilot** from Drive for one PC and period: `changes.list` cursors, checksums, per-device watermarks; compare with verified ground truth. Print data alongside.
6. Pilot daily confirmation with Erika/Arantza and Dalia for a few weeks; measure corrections, misses, time-to-ready, cost.
7. Instrument **one** script with structured outcome events; verify source-to-business correlation.
8. Allow approved low-risk write-backs only behind evidence/human gates and rollback.
9. Expand to other staff, Carolina’s mixed days, weekly print reports, improvement suggestions.

## Source of truth during migration
Shadow/read-only first; one authoritative system at a time; deliberate retirement or update of Apps Script bridges; no automatic rewriting of existing triggers.

## Connectors (all mocked today)
Drive/Docs/Sheets metadata (read-only), MT Log JSONL v1/v2 adapter, print logs, Amazon/Shopify/Etsy verifiers (read-only lookups), optional Teams (consented, with message ids; “possible follow-up request detected — approve?” only).

## MT Log recommendations (no changes made)
P0 structured script outcome events; completeness/idempotency checks; secure actor attribution; durable external ids (Amazon batch reference, processing status, family relationship; Shopify product id/state). P1 canonical file metadata and project hints without timers. P2 print-job correlation, logger heartbeat, opt-in SOP recording. Pilot on one PC and one script with a rollback installer; audit repository history for credentials before connecting anything.

## Rollback
Revert routing and source-of-truth flags; original Sheets and audit copies remain under existing permissions; no data loss path.

## Owner decisions needed later
Real roster and print employees, Auth identities, payroll source of truth, Teams approvals, Drive folder allowlist, SOP screenshot consent, script repository scope, email opt-in, retention, hard spending cap.


## v1.1 integration notes
Sources for AI Recommendations (sales, ads, listings, Sheets, Drive) are pretend connectors with an off switch. A real move needs: read-only scopes first, a scheduled function for `processSchedules` at 06:00 Chicago, owner approval per source, and a separate private Drive root. Drive folder creation must stay idempotent and never move or copy scripts.
