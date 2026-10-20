# Privacy and permissions

## Enforcement point
Every `HubServer` method takes the caller uid and authorizes on every call (no cached grants). Errors for “not found” and “not allowed” are identical (`permission denied`), so ids cannot be probed. The UI shows the same page for both cases.

## Matrix (as built and tested)
| Action | Dalia | Assigned employee | Unassigned employee |
|---|---|---|---|
| Read company project | Yes | If assigned or shared | No |
| Read **owner-private** project, steps, journal, resources, notifications, counts, search hits | Yes | **Never** | **Never** |
| Work on a project (status, instructions, substeps, responses) | Yes | Only if assigned (shared = read-only) | No |
| Create update request / follow-up / close | Yes | No | No |
| Answer a request | — | Only the addressed recipient | No |
| Mark a high-impact step verified | Owner approval or independent verification | No | No |
| Record verifier results (demo) | Yes | No | No |
| Weekly print report, audit, data intake, team, insights, budget | Yes | No | No |
| Own print figures | Yes (all) | Own only | Own only |

## Owner-private protection
Private projects have no members, cannot be shared without changing visibility, and are excluded from lists, search, counts, journals, resource library, notification creation, AI retrieval (`aiRetrievalFor` and the analysis context are filtered **before** a model sees anything) and direct id access. See `src/test/permissions.test.ts`.

## Identity
Device ≠ signed-in user ≠ event actor ≠ person confirming. Logs only ever prove device activity; findings say “Device activity; actor unverified”. “Not my work” keeps activity unattributed. The default reviewer for a device is a routing hint, not attribution.

## Employee fairness
No keystroke scores, no automatic ratings. Missing activity is never “did no work”; missing coverage is shown separately from “neither observed”. Print four-state windows are observed digital states with explicit caveats. Stats are not payroll truth.

## Data minimization
Events are normalized to a redacted allow-listed summary (emails/long digit runs masked; instruction-like text replaced). Raw JSONL stays in the file store (here, a stand-in map). No screenshots, keystrokes or private messages exist in the prototype.

## Prompt-injection stance
Log text and file names are untrusted data. Instruction-like text is neutralized at normalization, flagged in findings, and the validator rejects model output that claims `SYSTEM_VERIFIED` or proposes completion. Tested with a hostile file name.

## Production notes (not built)
Firestore rules default-deny with membership checks; Admin SDK functions must re-check role and membership; Drive sharing is independent of internal links; time-clock PIN alone must not unlock business data; audit access and role changes; retention to be set with legal advice.


## v1.1 additions
- Only the owner can: pause or resume, approve a limited-test batch, read/approve/dismiss AI findings, assign an AI-proposed project, see numbers, goals, sources, outcomes, and Drive private root.
- Employees see only the sanitized brief and their own assigned steps. A forbidden project returns the same "permission denied" as a missing one.
- Leak tests check lists, search, journal, notifications, AI context and exports for owner-only words and values.
- Clock in/out is never blocked by reviews, AI, logs, or pause state.
