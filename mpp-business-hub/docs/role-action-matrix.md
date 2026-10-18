# Who may do what (role and action matrix)

Dalia is the owner. "On the project" means an employee who is assigned to or shares that project. These rules are checked inside the server layer (`src/server/hub.ts`), not only by hiding buttons. A test for every row is in `src/test/workflow15.test.ts` ("Role/action matrix").

**Important:** this is a practice app that runs in one browser. The server layer is simulated. Switching users with the "Demo user" box is a testing convenience, not real sign-in. Real enforcement needs a real backend that checks the signed-in person on every request. Anything marked "simulated test only" below cannot be proven safe in a browser.

| Action | Dalia | Employee on the project | Employee not on it |
|---|---|---|---|
| See a team project | yes | yes | no |
| See a private (Dalia-only) project, finances, ROI, strategy | yes | **no** | **no** |
| Report a step finished ("reported complete") | yes | yes (own steps) | no |
| Mark a step **verified complete** (routine step) | yes | **no**, unless Dalia allowed it for that step | no |
| Mark a big step verified complete | yes, with a real check or her explicit approval | **no** | no |
| Record a check in the source system | yes | no | no |
| Report "blocked", "still working", "need clarification" | yes | yes | no |
| Answer an update request, send an unsolicited update | n/a | yes | no |
| Ask for an update | yes | no | no |
| **Select a working version of a file** ("Use for my work") | yes | yes | no |
| **Submit a file version for approval** | n/a | yes | no |
| **Approve a file version for team use** | **yes (only Dalia)** | **no** | no |
| Decline an approval request | yes | no | no |
| Edit a project description | yes | yes | no |
| Add or edit steps, substeps, instructions, checklists | yes | yes (on the project; step plan edits follow the project) | no |
| Assign people to a project | yes | no | no |
| Approve an AI-proposed project | yes | no | no |
| Pause, resume, change a pause date | yes (or a manager she names) | no (can only suggest) | no |
| Approve the next batch of a limited test | **yes (only Dalia)** | no | no |
| Let a person sign off a routine step | yes | no | no |
| Correct an AI guess (wrong step, wrong person, not mine) | yes | yes (own cards) | no |
| Log something I did | n/a | yes | no |
| Clock in and out | n/a | always, never blocked by reviews or the AI | n/a |
| Weekly print analysis | yes | no (they see their own daily numbers) | no |

## Four words that are never mixed up
| Label | Who said it | Meaning |
|---|---|---|
| **Detected in logs** (AI observed) | the AI | The computer showed activity. No person has confirmed it. |
| **Employee confirmed / reported** | an employee | A person says so. It is not proof. |
| **Owner approved** | Dalia | Dalia reviewed it and signed it off. It is a decision, not a check in another system. |
| **Checked in the source system** (externally verified) | a separate system | A real check matched. The practice app never invents one. |

Every approval or sign-off is a new entry in the project journal with who, when, the old state, the new state and the evidence. Entries are only ever added.
