import type { Finding, Project, ResponseChoice, ReviewKindId, ReviewOutcome, Step } from './types';

/**
 * Review questions that fit what was detected. Two ideas are kept apart on purpose:
 *  1. Activity accuracy: did the AI see the right thing, on the right project, step and person?
 *  2. Outcome: what happened with the work? An employee's answer is "employee-reported". It is never proof.
 * Pure functions only, so the same rules run in the server, the screen and the tests.
 */

export interface KindChoice { outcome: ReviewOutcome; label: string }
export interface ReviewSpec {
  kind: ReviewKindId;
  /** The one question at the top of the card. */
  question: string;
  /** One short sentence about what was detected. */
  evidence: string;
  /** Plain name for alerts, like "We detected a Shopify Lister test". */
  detected: string;
  choices: KindChoice[];
  notePlaceholder: string;
}

const NOT_ME: KindChoice = { outcome: 'NOT_ME', label: 'I didn’t work on this' };
const MISREAD: KindChoice = { outcome: 'MISREAD', label: 'The AI misunderstood what I was doing' };
const NOT_SURE: KindChoice = { outcome: 'NOT_SURE', label: 'I’m not sure / Answer later' };

export function reviewKind(f: Finding, step: Step | null): ReviewKindId {
  if (f.findingType === 'AI_UNMATCHED_WORK') return 'UNMATCHED';
  if (f.findingType === 'LATE_EVIDENCE') return 'LATE';
  if (f.whilePaused) return 'PAUSED';
  if (f.refs.submissionRefs.length > 0 || step?.evidenceHints.some((h) => h.startsWith('submission:'))) return 'AMAZON_UPLOAD';
  if (step?.evidenceHints.some((h) => h.startsWith('action:')) || /test click/i.test(f.inference)) return 'AUTOMATION_TEST';
  if (f.refs.fileNames.length > 0) return 'FILE_EDIT';
  return 'GENERAL';
}

/** "MPP Shopify Lister (Tampermonkey)" becomes "Shopify Lister". */
export function plainToolName(label: string | null | undefined): string {
  if (!label) return 'the tool';
  return label.replace(/\s*\(.*?\)\s*/g, ' ').replace(/^MPP\s+/i, '').trim() || 'the tool';
}

export function shortProjectName(p: Pick<Project, 'title' | 'key'> & { shortName?: string }): string {
  if (p.shortName) return p.shortName;
  const first = p.title.split(' — ')[0].trim();
  return first.length > 38 ? first.slice(0, 36) + '…' : first;
}

const firstSentence = (t: string) => (t.match(/^[^.!?]+[.!?]/)?.[0] ?? t).trim();

export function reviewSpec(f: Finding, step: Step | null, tool?: string | null): ReviewSpec {
  const kind = reviewKind(f, step);
  const toolName = plainToolName(tool);
  const errors = f.observedFacts.some((x) => /error|fail|denied/i.test(x));
  switch (kind) {
    case 'AUTOMATION_TEST':
      return {
        kind, question: `Did you test ${toolName === 'the tool' ? 'the automation' : `the ${toolName}`} today?`,
        evidence: errors ? 'We detected a test attempt and a sign of an error. We can’t tell what happened.' : 'We detected a test attempt, but couldn’t confirm whether it created a listing.',
        detected: `We detected a ${toolName === 'the tool' ? 'tool' : toolName} test`,
        choices: [{ outcome: 'DONE', label: 'Completed the test successfully' }, { outcome: 'PROBLEM', label: 'Tested it, but something went wrong' }, { outcome: 'WORKING', label: 'In progress' }, NOT_ME, MISREAD, NOT_SURE],
        notePlaceholder: 'Example: The draft showed up in Shopify, but the price was empty.',
      };
    case 'AMAZON_UPLOAD': {
      const sku = f.refs.skus[0] ?? step?.title ?? 'the';
      return {
        kind, question: `Did the ${sku} variation change go through successfully?`,
        evidence: `We saw ${f.refs.submissionRefs.length || 'some'} Amazon upload number${f.refs.submissionRefs.length === 1 ? '' : 's'}. The logs can’t show whether Amazon accepted the change.`,
        detected: 'We detected an Amazon upload',
        choices: [{ outcome: 'DONE', label: 'I uploaded it, and Amazon accepted it' }, { outcome: 'DONE_PART', label: 'I uploaded it, but I haven’t seen the result yet' }, { outcome: 'PROBLEM', label: 'I uploaded it, but it did not go through' }, { outcome: 'WORKING', label: 'In progress' }, NOT_ME, MISREAD, NOT_SURE],
        notePlaceholder: 'Example: Amazon showed “Action required” on the first try. I sent a fixed file.',
      };
    }
    case 'FILE_EDIT': {
      const file = f.refs.fileNames[0] ?? 'the file';
      return {
        kind, question: `Did you finish updating ${f.refs.skus[0] ? f.refs.skus[0] + ' (' + file + ')' : file}?`,
        evidence: `We saw “${file}” opened and saved. The logs can’t tell us whether the work is finished.`,
        detected: `We detected work on ${file}`,
        choices: [{ outcome: 'DONE', label: 'Finished it' }, { outcome: 'DONE_PART', label: 'Made progress, not finished' }, { outcome: 'PROBLEM', label: 'Something went wrong' }, NOT_ME, MISREAD, NOT_SURE],
        notePlaceholder: 'Example: The front artwork is done. The back still needs the new text.',
      };
    }
    case 'PAUSED':
      return {
        kind, question: 'Did you work on this paused project? Why?',
        evidence: 'We saw activity on a project that is paused. The project stays paused either way.',
        detected: 'We detected activity on a paused project',
        choices: [{ outcome: 'WORKED_PAUSED', label: 'Yes, I worked on it' }, NOT_ME, MISREAD, NOT_SURE],
        notePlaceholder: 'Example: Dalia asked me to fix one listing while we wait.',
      };
    case 'LATE':
      return {
        kind, question: 'New activity arrived after your review. Does your first answer still hold?',
        evidence: firstSentence(f.headline.replace(/^New facts came in after your review:\s*/i, '')),
        detected: 'We found new activity after your review',
        choices: [{ outcome: 'DONE', label: 'Yes, my first answer still holds' }, { outcome: 'DONE_PART', label: 'It changes things (I’ll explain)' }, NOT_ME, MISREAD, NOT_SURE],
        notePlaceholder: 'Example: The second upload was mine. It was for a different file.',
      };
    case 'UNMATCHED':
      return {
        kind, question: 'What project or task was this work for?',
        evidence: 'We saw a file that does not match any step.',
        detected: 'We found work that is not in any project',
        choices: [], notePlaceholder: 'Example: Fixed the front artwork for “MS066”.',
      };
    default:
      return {
        kind: 'GENERAL', question: step ? `Did you work on “${step.title.length > 60 ? step.title.slice(0, 58) + '…' : step.title}” today?` : 'Did you do this work?',
        evidence: firstSentence(f.inference),
        detected: 'We detected some work',
        choices: [{ outcome: 'DONE', label: 'Finished my part' }, { outcome: 'DONE_PART', label: 'Made progress' }, { outcome: 'PROBLEM', label: 'Ran into a problem' }, { outcome: 'WORKING', label: 'In progress' }, NOT_ME, MISREAD, NOT_SURE],
        notePlaceholder: 'Example: I finished the first batch. The rest is for tomorrow.',
      };
  }
}

export interface OutcomeEffect {
  /** The step status the employee is reporting (never VERIFIED). Null means leave the status alone. */
  status: ResponseChoice | null;
  /** Tell Dalia that something went wrong. */
  problem: boolean;
  /** Plain sentence for the history. */
  text: string;
  /** Always true for results: an employee answer is a report, not proof. */
  needsCheck: boolean;
}

/** What a person's answer does. A passed test is progress, not a finished step. */
export function outcomeEffect(kind: ReviewKindId, outcome: ReviewOutcome, step: Pick<Step, 'impact'> | null): OutcomeEffect {
  switch (outcome) {
    case 'DONE':
      if (kind === 'AUTOMATION_TEST') return { status: 'IN_PROGRESS', problem: false, text: 'reported the test worked. The step is still in progress. A test is not the whole step.', needsCheck: true };
      if (kind === 'AMAZON_UPLOAD') return { status: 'COMPLETED', problem: false, text: 'reported that Amazon accepted the change. This has not been checked in Seller Central.', needsCheck: true };
      if (kind === 'LATE') return { status: null, problem: false, text: 'said the first answer still holds.', needsCheck: false };
      return { status: 'COMPLETED', problem: false, text: step?.impact === 'HIGH' ? 'reported finishing the work. This is a big step, so it still needs a check in the source system or Dalia’s approval.' : 'reported finishing the work.', needsCheck: true };
    case 'DONE_PART':
      return { status: kind === 'LATE' ? null : 'IN_PROGRESS', problem: false, text: kind === 'AMAZON_UPLOAD' ? 'uploaded it but has not seen the result yet. The result is still unverified.' : kind === 'LATE' ? 'said the new activity changes things.' : 'made progress. The step is not finished.', needsCheck: true };
    case 'PROBLEM':
      return { status: 'IN_PROGRESS', problem: true, text: 'ran into a problem.', needsCheck: true };
    case 'WORKING':
      return { status: 'IN_PROGRESS', problem: false, text: 'is still working on it.', needsCheck: false };
    case 'WORKED_PAUSED':
      return { status: null, problem: false, text: 'said they worked on this while it was paused. The project stays paused.', needsCheck: false };
    case 'NOT_ME':
      return { status: null, problem: false, text: 'said this was not their work. That does not mean no work happened.', needsCheck: false };
    case 'MISREAD':
      return { status: null, problem: false, text: 'said the AI misunderstood what they were doing.', needsCheck: false };
    default:
      return { status: null, problem: false, text: 'is not sure yet.', needsCheck: false };
  }
}

/** Plain sentence: why the AI thought this belonged to this step. Never claims more than a guess. */
export function matchReason(f: Finding, step: Step | null, label?: string): string | null {
  if (!step || f.findingType === 'AI_UNMATCHED_WORK') return null;
  const bits: string[] = [];
  for (const h of step.evidenceHints) {
    if (h.startsWith('sku:') && f.refs.skus.some((x) => x.toLowerCase() === h.slice(4).toLowerCase())) bits.push(`the product code ${h.slice(4).toUpperCase()}`);
    else if (h.startsWith('action:')) bits.push(`the action “${h.slice(7).replace(/_/g, ' ')}”`);
    else if (h.startsWith('doc:')) bits.push('a document this step uses');
    else if (h.startsWith('submission:')) bits.push('an Amazon upload number');
  }
  const uniq = [...new Set(bits)];
  if (!uniq.length) return `We matched this to Step ${label ?? step.sortOrder} because the activity looked related to it. This is a guess.`;
  return `We matched this to Step ${label ?? step.sortOrder} because the activity shows ${uniq.join(' and ')}. This step lists those as signs of the work. It is a guess, and we can only see the computer, not the person.`;
}
