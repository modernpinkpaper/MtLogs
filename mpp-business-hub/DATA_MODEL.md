# Data model

Types live in `src/domain/types.ts`; the state shape is `src/server/state.ts`. Collections mirror the specification’s logical Firestore schema so a later move to Firestore is mechanical.

| Collection | Notes |
|---|---|
| `users`, `assignments` | Role (OWNER/EMPLOYEE) and area (PROJECT/PRINT/MIXED/UNASSIGNED); time-bound assignments override the default, so Carolina’s routing follows the day |
| `projects` | Opaque ids; human key `P-012`. `visibility`: OWNER_PRIVATE / ASSIGNED_ONLY / TEAM_SHARED. Access = membership (`memberUids` work, `sharedWithUids` read-only). `ownerUid` alone grants nothing to employees |
| `steps` | `parentStepId` for substeps; official `status`; parallel `observedLevel`/`observedReview`; `verificationSource`; `impact` ROUTINE/HIGH; `verifications[]`; `humanReported` |
| `resources`, `resourceLinks` | One canonical record per file (identity = provider id, not filename); many links with roles; `approvedVersion` vs `suggestedVersion` |
| `archives`, `events`, `episodes`, `intakeRuns` | Source file revisions, normalized redacted events (not raw copies), bounded work episodes, staged processing history |
| `findings`, `reviewCards`, `reviewDecisions` | Findings are immutable proposals; decisions are separate append-only records |
| `updateRequests`, `updateResponses`, `notifications` | Notifications have their own delivery/read/ack state, separate from the journal |
| `projectEvents` | **The single journal.** Project view = filter by project; step view = filter by `stepIds` (junction); no second diary |
| `auditEvents` | Technical history: entity, action, before, after, actor, reason, evidence refs |
| `shifts` | Clock record plus review sessions inside the paid shift |
| `printJobs`, `printerProblems`, `activityBins`, `stations` | Synthetic print data; problems stored as snapshots and grouped into episodes at read time |
| `aiRuns`, `opportunities`, `settings` | Cost/outcome per run; owner-approved improvement proposals; configuration |

## State machines

Step: `NOT_STARTED → IN_PROGRESS ⇄ BLOCKED/WAITING → REPORTED_COMPLETE → VERIFIED_COMPLETE`, plus `CANCELLED`, `NOT_APPLICABLE`, `REOPENED`. (Shortcut `NOT_STARTED → REPORTED_COMPLETE` is allowed for an employee reporting finished work.) Employees may reach `VERIFIED_COMPLETE` only on ROUTINE steps (label *Employee Confirmed*). HIGH-impact steps need a recorded independent verification or explicit owner approval (*Owner Approved*). Blocked requires a reason. Every transition writes an audit row with before/after, actor and reason.

Update request: `OPEN → PARTIALLY_RESPONDED/RESPONDED → ACKNOWLEDGED → CLOSED`.
Notification: `DELIVERED → READ → ACKNOWLEDGED` (or `DISMISSED`).
Finding: `PROPOSED → CONFIRMED/CORRECTED/DISMISSED/NOT_MINE` or `SUPERSEDED`.

## Event envelope

MT Log v1 fields are preserved (`event_id`, `timestamp_utc`, `computer_id`, `employee_id`, `watcher_run_id`, `sequence`, `metadata`, nullable `task_context_id`). `employee_id` may be a device label such as `ERIKAPC`, so normalization always sets `actorUid = null` and `DEVICE_ONLY_ACTOR_UNVERIFIED` unless an explicit, known `actor_user_id` is present. Optional v2 fields are accepted backward-compatibly.

## Indexes (for a Firestore move)
`(recipientUid,status,dueAt)`, `(projectId,occurredAt)`, `(projectId,stepId,occurredAt)` via the step junction, `(sourceArchiveId,sourceEventId)`, `(sourceProvider,sourceId)`, `(updateRequestId,submittedAt)`. No broad indexes over raw events.


## v1.1 additions (additive only)
`Project.pause` (`ProjectPauseState`: mode, resumeDateLocal, reason, scheduleVersion), `Project.pilot` (checkpoints and rows; only rows checked in the source system count), `Project.employeeBrief`, `Project.origin/category/pinned/managerUids/canceledAt`, `Step.onHold/whyForGoal`. Owner-only collections: findings, opportunity models, goals, intelligence sources, outcome measurements, project workspaces (pretend Drive). New journal types: PAUSE_REQUESTED, PROJECT_PAUSED, PAUSE_SCHEDULE_CHANGED, RESUME_REMINDER_SENT, PROJECT_RESUMED, PILOT. New notification types: PROJECT_PAUSED, PROJECT_RESUMED, RESUME_REMINDER, PAUSE_SUGGESTION, PILOT_REACHED, AI_FINDING, PROJECT_ASSIGNED. Status is derived (`projectWorkStatus`), not stored.
