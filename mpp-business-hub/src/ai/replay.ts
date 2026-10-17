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
        headline: `Work not in the tracker: ${key}`,
        observedFacts: evs.map(describeEvent),
        inference: `A file was saved/edited that does not match any tracked step. It may be routine production, part of an existing project, a new project, or an ad hoc request.`,
        uncertainties: [
          'Actor is unverified: this is activity on the device, not a confirmed person.',
          'Purpose of the work cannot be determined from the log alone.',
          ...(injected ? ['Source text contained instruction-like content; it was treated as data and ignored.'] : []),
        ],
        verificationNeeded: ['Employee classification: link to a project, create a step, mark routine, or dismiss.'],
        proposedUpdate: { kind: 'CLASSIFY_WORK', detail: 'Ask the employee to classify this work.' },
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
        d.uncertainties.push('Source text contained instruction-like content; it was treated as data and ignored.');
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
  return c && c !== 'FINAL' ? [`Log coverage for ${dev} is ${c}; later or missing events may change this picture.`] : [];
}

function actionFinding(step: Pick<Step, 'id' | 'projectId' | 'title' | 'status'>, key: string, evs: NormalizedEvent[], ctx: AnalysisContext): FindingDraft {
  const dev = evs[0].deviceId;
  const clicks = evs.filter((e) => e.eventType === 'ui_action');
  const errors = evs.filter((e) => /error|fail|denied/i.test(e.allowedSummary));
  const official = step.status === 'NOT_STARTED';
  return {
    findingType: official ? 'AI_DISCREPANCY' : 'AI_PROGRESS', claimType: 'OBSERVED_ACTION', projectId: step.projectId, stepId: step.id, deviceId: dev,
    headline: `${key}: activity observed on “${step.title}”` + (official ? ' (official status: Not Started)' : ''),
    observedFacts: evs.map(describeEvent),
    inference: `${clicks.length} test action(s) were observed on this step${errors.length ? `, and ${errors.length} error indication(s)` : ''}. This shows an attempt, not that the product/draft exists or that the step is finished.`,
    uncertainties: [
      'Actor is unverified: the log shows the device, not which person was signed in.',
      'The result of the attempt is unknown from clicks alone.',
      ...(errors.length ? ['An error indication was seen; the final state still needs checking.'] : []),
      ...coverageNote(ctx, dev),
    ],
    verificationNeeded: ['Check the destination (e.g. does the test draft actually exist in Shopify?).'],
    proposedUpdate: { kind: 'ADD_JOURNAL_NOTE', detail: 'Add a journal note “test attempted — result unknown” and ask the employee. Official status is NOT changed.' },
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
  if (first) bits.push(`The first upload (ref ${first.keys.submissionRefs[0]}) ${firstFailed ? 'ended with “Action required” (needs attention)' : 'was seen'}.`);
  if (correctedSelected) bits.push('A corrected file was later downloaded/selected.');
  if (later.length) bits.push(`A later upload-status page shows a DIFFERENT reference (${later.flatMap((e) => e.keys.submissionRefs).filter((r) => r !== first?.keys.submissionRefs[0])[0]}), so another submission is likely.`);
  const uncertainties = [
    'Which file produced the later reference is not verified.',
    ...(later.length ? ['The outcome of the later submission was not captured in the log.'] : ['No later submission reference has been seen yet in the available logs.']),
    'Actor is unverified: the log shows the device, not which person was signed in.',
    ...coverageNote(ctx, dev),
  ];
  return {
    findingType: 'AI_DISCREPANCY', claimType: later.length ? 'LIKELY_ACTION' : 'OBSERVED_ACTION', projectId: step.projectId, stepId: step.id, deviceId: dev,
    headline: `${key}: ${step.title} — upload attempts observed, final outcome NOT verified`,
    observedFacts: sorted.map(describeEvent),
    inference: `${bits.join(' ')} A resubmission is plausible but unconfirmed; the final family relationship (FBA_TY001 under the new parent) has not been verified. This step must not be closed from log evidence alone.`,
    uncertainties,
    verificationNeeded: [
      `Amazon processing report for ${refs.length ? 'reference ' + refs.join(' and ') : 'the submission'}`,
      'Confirm FBA_TY001 is a child of the NEW parent (family membership) and no longer under the old parent',
    ],
    proposedUpdate: { kind: 'ASK_EMPLOYEE', detail: 'Ask the employee what happened and request the processing report. Official status is NOT changed.' },
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
    inference: 'Related files were opened or saved. This is possible activity, not proof the step progressed or is finished.',
    uncertainties: ['Actor is unverified.', ...(injected ? ['Source text contained instruction-like content; treated as data.'] : []), ...coverageNote(ctx, dev)],
    verificationNeeded: ['Employee confirmation of what was done.'],
    proposedUpdate: { kind: 'ADD_JOURNAL_NOTE', detail: `Add a journal note (last related activity ${formatTime(evs[evs.length - 1].occurredAt)}).` },
    confidenceBand: 'LOW', inferenceLevel: 'POSSIBLE_ACTIVITY', sourceEventIds: evs.map((e) => e.id),
    coverageState: ctx.coverageByDevice[dev] ?? 'PROVISIONAL',
    refs: { skus: [...new Set(evs.flatMap((e) => e.keys.skus))], submissionRefs: [], fileNames: [...new Set(evs.flatMap((e) => e.keys.fileNames))] },
    groupKey: `step:${step.id}`,
  };
}
