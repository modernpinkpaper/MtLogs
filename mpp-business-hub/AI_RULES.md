# AI rules

## Who does what
| Software (deterministic) | Model (meaning only) | Humans |
|---|---|---|
| Ingest, dedupe, timestamps, coverage, episodes, ID extraction, authorization, state machine, notifications, audit | Which step/resource a work episode likely relates to, what progress it suggests, uncertainty, what to verify | Confirm/correct, approve completion of consequential steps, approve plan changes |

## Claim categories
`OBSERVED_ACTION`, `LIKELY_ACTION`, `EMPLOYEE_REPORTED`, `SYSTEM_VERIFIED`, `UNKNOWN_OR_CONFLICTING`. The model may **never** emit `SYSTEM_VERIFIED` (validator rejects it); that needs a verifier record for the correct entity.

## Evidence ladder
Opened = possible activity → saved/repeated = strong activity → script submitted = attempted → processing success = system accepted → authoritative destination state = verified outcome. Employee report is a separate label.

## Safeguards (all tested)
1. No evidence ≠ not started (no finding, “no matching activity detected”).
2. Activity ≠ complete; a finding sets observed fields only.
3. The whole window is examined, not the first failure (FBA_TY001 reports both references in order).
4. Device ≠ person; findings say actor unverified.
5. Output schema is validated; invalid output is rejected and logged, never partially applied.
6. Text in logs/files is data. Instruction-like text is neutralized and flagged.
7. Corrections are stored beside the original; late evidence becomes a new supplement.

## Prompt/schema versions
The replay adapter carries `promptVersion`; every finding stores `modelRunId` and `promptVersion`; each run stores model, tokens, cost, outcome, watermark and errors. A live adapter would load version-controlled prompt files and enforce token and retry limits; it is disabled here.

## Example finding (FBA_TY001)
Facts (chronological): first upload ref 99104020742 “Action required”; corrected file downloaded and selected; later status page shows different ref 99105020742. Inference: resubmission plausible, file-to-reference link unverified, outcome not captured. Needs: processing report and family-membership check. Proposed: ask the employee. Official status unchanged.
