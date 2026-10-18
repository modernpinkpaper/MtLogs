# Who may do what (role and action matrix)

Dalia is the owner. "On the project" means an employee who is assigned to or shares that project. These rules are checked inside the server layer (`src/server/hub.ts`), not only by hiding buttons. A test for every row is in `src/test/workflow15.test.ts` ("Role/action matrix").

**Important:** this is a practice app that runs in one browser. The server layer is simulated. Switching users with the "Demo user" box is a testing convenience, not real sign-in. Real enforcement needs a real backend that checks the signed-in person on every request. Anything marked "simulated test only" below cannot be proven safe in a browser.

| Action | Dalia | Employee on the project | Employee not on it |
|---|---|---|---|
| See a team project | yes | yes | no |
| See a private (Dalia-only) project, finances, ROI, strategy | yes | **no** | **no** |
| Report a step finished ("reported complete") | yes | yes (own steps) | no |
| Say a step is done | yes | yes (own steps). It counts as done. | no |
| Mark a step **checked** (an outside check) | yes, with a real check or her explicit choice | no | no |
| Choose to check one particular step herself | yes | no | no |
| Record a check in the source system | yes | no | no |
| Report "blocked", "still working", "need clarification" | yes | yes | no |
| Answer an update request, send an unsolicited update | n/a | yes | no |
| Ask for an update | yes | no | no |
| **Choose which version of a file the project uses** | yes | **yes** (recorded: who, when, old and new) | no |
| Edit a project description | yes | yes | no |
| Add or edit steps, substeps, instructions, checklists | yes | yes (on the project; step plan edits follow the project) | no |
| Assign people to a project | yes | no | no |
| Approve an AI-proposed project | yes | no | no |
| Pause, resume, change a pause date | yes (or a manager she names) | no (can only suggest) | no |
| Approve the next batch of a limited test | **yes (only Dalia)** | no | no |
| Correct an AI guess (wrong step, wrong person, not mine) | yes | yes (own cards) | no |
| Log something I did | n/a | yes | no |
| Clock in and out | n/a | always, never blocked by reviews or the AI | n/a |
| Weekly print analysis | yes | no (they see their own daily numbers) | no |

## Four words that are never mixed up
| Label | Who said it | Meaning |
|---|---|---|
| **Detected in logs** (AI observed) | the AI | The computer showed activity. No person has confirmed it. |
| **Employee confirmed / reported** | an employee | A person says so. It is not proof. |
| **Owner approved** | Dalia | Dalia chose to check this one and approved it. It is a decision, not a check in another system. |
| **Checked in the source system** (externally verified) | a separate system | A real check matched. The practice app never invents one. |

Every approval or sign-off is a new entry in the project journal with who, when, the old state, the new state and the evidence. Entries are only ever added.

*Updated after Dalia's answers: when someone says a step is done, it is done, and Dalia is not asked to check unless she chooses to for a specific step. The person doing the work (or Dalia) chooses which version of a file to use.*
