import type { AnalysisContext, FindingDraft, ModelAdapter } from './adapter';
import { describeEvent } from './adapter';
import type { NormalizedEvent, Step } from '../domain/types';
import { formatTime } from '../domain/time';
import { looksLikeInjection } from './ingest';

/**
 * ReplayAnalyzer — a deterministic stand-in for the LLM. It replays pre-authored, LABELED sample
 * reasoning over the whole event window using generic evidence hints. It is NOT a real model and
 * makes no API calls. It can only OBSERVE; it never proposes completion and never emits SYSTEM_VERIFIED.
 */
export class ReplayAnalyzer implements ModelAdapter {
  readonly name = 'replay-adapter (pre-authored samples, no API)';
  readonly version = '1.0';
  readonly promptVersion = 'replay-prompts/2026-10-17.v1';

  async analyze(ctx: AnalysisContext): Promise<unknown[]> {
    const out: FindingDraft[] = [];
    const matchedEventIds = new Set<string>();

    for (const step of ctx.steps) {
      if (!step.evidenceHints.length) continue;
      const matched = matchEvents(ctx.events, step.evidenceHints);
      if (!matched.length) continue; // No evidence ≠ not started: we simply emit nothing.
      matched.forEach((e) => matchedEventIds.add(e.id));
      const project = ctx.projects.find((p) => p.id === step.projectId);
      const draft = step.evidenceHints.some((h) => h.startsWith('submission:'))
        ? amazonUploadFinding(step, project?.key ?? '', matched, ctx)
        : step.evidenceHints.some((h) => h.startsWith('action:'))
          ? actionFinding(step, project?.key ?? '', matched, ctx)
          : genericFinding(step, project?.key ?? '', matched, ctx);
      out.push(draft);
    }

    // Unmatched meaningful work (e.g. an InDesign save with no tracker step).
    const unmatched = ctx.events.filter((e) => !matchedEventIds.has(e.id) && MEANINGFUL.has(e.eventType));
    const byKey = new Map<string, NormalizedEvent[]>();
    for (const e of unmatched) {
      const k = e.keys.skus[0] ?? e.keys.fileNames[0] ?? e.eventType;
      byKey.set(k, [...(byKey.get(k) ?? []), e]);
    }
    for (const [key, evs] of byKey) {
      const dev = evs[0].deviceId;
      const injected = evs.some((e) => e.keys.fileNames.some((f) => f.includes('instruction-like')));
      out.push({
        findingType: 'AI_UNMATCHED_WORK', claimType: 'OBSERVED_ACTION', projectId: null, stepId: null, deviceId: dev,
        headline: `Work that is not in the tracker: ${key}`,
        observedFacts: evs.map(describeEvent),
        inference: `Someone saved a file that does not match any step. It could be everyday work, part of a project, a new project, or a one-time ask.`,
        uncertainties: [
          'We can only see the computer, not the person. We cannot tell who was working.',
          'The log alone cannot tell us what the work was for.',
          ...(injected ? ['A file name looked like it was giving orders. We treated it as plain text and ignored it.'] : []),
        ],
        verificationNeeded: ['Please say what this work was: add it to a project, make a new step, call it everyday work, or skip it.'],
        proposedUpdate: { kind: 'CLASSIFY_WORK', detail: 'Ask the person what this work was.' },
        confidenceBand: 'LOW', inferenceLevel: 'POSSIBLE_ACTIVITY', sourceEventIds: evs.map((e) => e.id),
        coverageState: ctx.coverageByDevice[dev] ?? 'PROVISIONAL', classification: 'UNCLEAR',
        refs: { skus: [...new Set(evs.flatMap((e) => e.keys.skus))], submissionRefs: [], fileNames: [...new Set(evs.flatMap((e) => e.keys.fileNames))] },
        groupKey: `unmatched:${key}`,
      });
    }
    // Instruction-like text in any cited event is treated as data and flagged, whatever finding cites it.
    for (const d of out) {
      const cited = ctx.events.filter((e) => d.sourceEventIds.includes(e.id));
      if (cited.some((e) => e.keys.fileNames.some((f) => f.includes('instruction-like')) || looksLikeInjection(e.allowedSummary)) && !d.uncertainties.some((u) => /instruction-like/.test(u))) {
        d.uncertainties.push('A file name looked like it was giving orders. We treated it as plain text and ignored it.');
      }
    }
    return out;
  }
}

const MEANINGFUL = new Set(['indesign_doc_saved', 'file_saved', 'file_opened', 'ui_action', 'file_downloaded', 'file_selected']);

function matchEvents(events: NormalizedEvent[], hints: string[]): NormalizedEvent[] {
  const skuHints = hints.filter((h) => h.startsWith('sku:')).map((h) => h.slice(4).toLowerCase());
  const actionHints = hints.filter((h) => h.startsWith('action:')).map((h) => h.slice(7).toLowerCase());
  const docHints = hints.filter((h) => h.startsWith('doc:')).map((h) => h.slice(4));
  const submission = hints.some((h) => h.startsWith('submission:'));
  return events.filter((e) => {
    if (skuHints.length && e.keys.skus.some((s) => skuHints.includes(s.toLowerCase()))) return true;
    if (!submission && actionHints.length && e.keys.actions.some((a) => actionHints.includes(a))) return true;
    if (docHints.length && e.keys.docIds.some((d) => docHints.includes(d))) return true;
    return false;
  });
}

function coverageNote(ctx: AnalysisContext, dev: string): string[] {
  const c = ctx.coverageByDevice[dev];
  return c && c !== 'FINAL' ? [`Data from ${dev} is ${c === 'PROVISIONAL' ? 'not final yet' : c === 'INCOMPLETE' ? 'missing some pieces' : 'missing'}. More facts may change this.`] : [];
}

function actionFinding(step: Pick<Step, 'id' | 'projectId' | 'title' | 'status'>, key: string, evs: NormalizedEvent[], ctx: AnalysisContext): FindingDraft {
  const dev = evs[0].deviceId;
  const clicks = evs.filter((e) => e.eventType === 'ui_action');
  const errors = evs.filter((e) => /error|fail|denied/i.test(e.allowedSummary));
  const official = step.status === 'NOT_STARTED';
  return {
    findingType: official ? 'AI_DISCREPANCY' : 'AI_PROGRESS', claimType: 'OBSERVED_ACTION', projectId: step.projectId, stepId: step.id, deviceId: dev,
    headline: `${key}: we saw activity on “${step.title}”` + (official ? ' (the tracker still says “Not started”)' : ''),
    observedFacts: evs.map(describeEvent),
    inference: `We saw ${clicks.length} test click(s) on this step${errors.length ? ` and ${errors.length} error sign(s)` : ''}. That shows someone tried. It does not show the draft exists or that the step is done.`,
    uncertainties: [
      'We can only see the computer, not the person. We cannot tell who was working.',
      'We cannot tell from clicks if it worked.',
      ...(errors.length ? ['We saw an error sign. Someone needs to check what happened.'] : []),
      ...coverageNote(ctx, dev),
    ],
    verificationNeeded: ['Look in Shopify. Is the test draft really there?'],
    proposedUpdate: { kind: 'ADD_JOURNAL_NOTE', detail: 'Add a note: “test tried, result not known.” Ask the person. The step status will NOT change.' },
    confidenceBand: clicks.length > 1 ? 'MEDIUM' : 'LOW', inferenceLevel: clicks.length > 1 ? 'STRONG_ACTIVITY' : 'POSSIBLE_ACTIVITY',
    sourceEventIds: evs.map((e) => e.id), coverageState: ctx.coverageByDevice[dev] ?? 'PROVISIONAL',
    refs: { skus: [...new Set(evs.flatMap((e) => e.keys.skus))], submissionRefs: [], fileNames: [...new Set(evs.flatMap((e) => e.keys.fileNames))] },
    groupKey: `step:${step.id}`,
  };
}

/**
 * FBA_TY001 regression: examine the WHOLE window. Never stop at the first failure and never say
 * "not resubmitted". Later references are reported; the final outcome stays unverified.
 */
function amazonUploadFinding(step: Pick<Step, 'id' | 'projectId' | 'title' | 'status'>, key: string, evs: NormalizedEvent[], ctx: AnalysisContext): FindingDraft {
  const dev = evs[0].deviceId;
  const sorted = [...evs].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const withRefs = sorted.filter((e) => e.keys.submissionRefs.length);
  const refs = [...new Set(withRefs.flatMap((e) => e.keys.submissionRefs))];
  const first = withRefs[0];
  const firstFailed = first && /action required|error|fail/i.test(first.allowedSummary);
  const later = withRefs.slice(1).filter((e) => e.keys.submissionRefs.some((r) => !first?.keys.submissionRefs.includes(r)));
  const correctedSelected = sorted.some((e) => /corrected/i.test(e.keys.fileNames.join(' ')) && ['file_selected', 'file_downloaded'].includes(e.eventType));
  const bits: string[] = [];
  if (first) bits.push(`The first upload (number ${first.keys.submissionRefs[0]}) ${firstFailed ? 'ended with “Action required”, which means it needs fixing' : 'was seen'}.`);
  if (correctedSelected) bits.push('A fixed file was picked later.');
  if (later.length) bits.push(`A later page shows a DIFFERENT number (${later.flatMap((e) => e.keys.submissionRefs).filter((r) => r !== first?.keys.submissionRefs[0])[0]}), so a second upload was likely sent.`);
  const uncertainties = [
    'We do not know which file made the later number.',
    ...(later.length ? ['We did not see how the later upload ended.'] : ['We have not seen a later upload number yet.']),
    'We can only see the computer, not the person. We cannot tell who was working.',
    ...coverageNote(ctx, dev),
  ];
  return {
    findingType: 'AI_DISCREPANCY', claimType: later.length ? 'LIKELY_ACTION' : 'OBSERVED_ACTION', projectId: step.projectId, stepId: step.id, deviceId: dev,
    headline: `${key}: “${step.title}” — we saw upload tries, but we do not know the final result`,
    observedFacts: sorted.map(describeEvent),
    inference: `${bits.join(' ')} A second try looks likely, but we are not sure. We have not checked that “FBA_TY001” now sits under the new parent. Do not close this step from the log alone.`,
    uncertainties,
    verificationNeeded: [
      `The Amazon report for ${refs.length ? 'number ' + refs.join(' and ') : 'the upload'}`,
      'Check that “FBA_TY001” is now under the NEW parent and not the old one',
    ],
    proposedUpdate: { kind: 'ASK_EMPLOYEE', detail: 'Ask the person what happened and ask for the Amazon report. The step status will NOT change.' },
    confidenceBand: 'MEDIUM', inferenceLevel: 'STRONG_ACTIVITY', sourceEventIds: sorted.map((e) => e.id),
    coverageState: ctx.coverageByDevice[dev] ?? 'PROVISIONAL',
    refs: { skus: [...new Set(sorted.flatMap((e) => e.keys.skus))], submissionRefs: refs, fileNames: [...new Set(sorted.flatMap((e) => e.keys.fileNames))] },
    groupKey: `step:${step.id}`,
  };
}

function genericFinding(step: Pick<Step, 'id' | 'projectId' | 'title'>, key: string, evs: NormalizedEvent[], ctx: AnalysisContext): FindingDraft {
  const dev = evs[0].deviceId;
  const injected = evs.some((e) => e.keys.fileNames.some((f) => f.includes('instruction-like')) || looksLikeInjection(e.allowedSummary));
  return {
    findingType: 'AI_PROGRESS', claimType: 'OBSERVED_ACTION', projectId: step.projectId, stepId: step.id, deviceId: dev,
    headline: `${key}: related file activity on “${step.title}”`,
    observedFacts: evs.map(describeEvent),
    inference: 'Related files were opened or saved. That may mean work happened, but it does not prove the step moved or is done.',
    uncertainties: ['We cannot tell who was at the computer.', ...(injected ? ['A file name looked like it was giving orders. We treated it as plain text.'] : []), ...coverageNote(ctx, dev)],
    verificationNeeded: ['Ask the person what they did.'],
    proposedUpdate: { kind: 'ADD_JOURNAL_NOTE', detail: `Add a note. Last related activity was at ${formatTime(evs[evs.length - 1].occurredAt)}.` },
    confidenceBand: 'LOW', inferenceLevel: 'POSSIBLE_ACTIVITY', sourceEventIds: evs.map((e) => e.id),
    coverageState: ctx.coverageByDevice[dev] ?? 'PROVISIONAL',
    refs: { skus: [...new Set(evs.flatMap((e) => e.keys.skus))], submissionRefs: [], fileNames: [...new Set(evs.flatMap((e) => e.keys.fileNames))] },
    groupKey: `step:${step.id}`,
  };
}
