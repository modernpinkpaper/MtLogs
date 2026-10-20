# Print Team and Projects UX: implementation report (v1.11)

Dalia's answers override the spec where they differ. Nothing here touches the live clock-in app or any production system.

## What was built
| Area | Result |
|---|---|
| Owner Print Team (Team & Print > Print team) | Day by day, all staff, 3 team numbers (revenue, revenue per productive hour, orders printed), employee table, clickable order lists, drill-down drawer, day notes |
| Employee "My Print Stats" | Own numbers only, recent days, clickable order lists, longer 30/90/180 view in a fold |
| CS "Print verification" | Order number > claim > candidate print files > raw print log rows. Honest match levels, audited |
| Projects > Steps > Step details | Overview = title, status, progress, people, steps only. Step page = compact step list on the left + one workspace on the right |
| Avatars | First 3 letters; each person can add a photo in Settings |
| Step notes | New, belong to one step, shown in history |

## Metric mapping
| Shown as | Source | Rule |
|---|---|---|
| Orders printed | Order claims | One per order. Unclaimed excluded. Latest claim wins, so a reassigned order counts once |
| Revenue | Order claims | Existing date and revenue rules, unchanged |
| Productive hours | Clock-in time minus project time | Breaks stay in the hours. Overlapping project time counts once. Only the part inside clocked time is removed. Never below zero |
| Revenue per productive hour | Revenue / productive hours | Team rate = total revenue / total hours of the people counted, not an average of rates |
| Moe and Dalia hours | First to last MT Log print activity | Minus project work. This is an approximation |
| Raw print copies | Print log CSVs | CS only. Called "submitted", never "packed" or "delivered" |

## Permissions
Owner only: Print Team, drill-down, finance. Employees: own stats only. CS and owner: Print verification. Checked on the server side (`HubServer`), not only hidden in the screen. Clock in and out are never blocked.

## Tests
`tsc` clean. 255 unit tests pass (22 new for this work). End-to-end: the old scripts pass after updating the ones that expected the old project page, plus new `e2e/spec111.mjs` (Print Team, drawer, phone width, verification, My Print Stats, employee blocked from owner page, overview/step navigation, step note). Screenshots: `e2e/out/spec/`.

## Not done / limits (please read)
- The spec's 28 acceptance tests were not run one by one with a Pass/Fail table. The areas above are covered, but a numbered table is still owed.
- Real print logs and real order claims are not loaded into the private real-data copy yet. There the Print Team says "not connected". Demo data only.
- The link from an order to its personalization file name is not known yet. Matching uses the order number or name in the file name. Levels: Confirmed by CS, Probable, Several, None.
- Moe's hours are an approximation (see above).
- Prev/Next on a step page moves between top-level steps only.
- Defaults used where Dalia did not answer (A1 to A6): "done = done" kept; menu unchanged apart from the new items; only 30/90/180 days kept; Print Team table lists all active staff; project tabs and folder kept; "AI last checked" line kept for employees.
