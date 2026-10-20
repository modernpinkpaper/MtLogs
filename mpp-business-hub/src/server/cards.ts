import type { CardType, Finding } from '../domain/types';

const RANK: Record<string, number> = { NO_EVIDENCE: 0, INCONCLUSIVE: 1, POSSIBLE_ACTIVITY: 2, STRONG_ACTIVITY: 3, DELIVERABLE_OBSERVED: 4, RESULT_OBSERVED: 5 };
export function Hub_rank(l: string) { return RANK[l] ?? 0; }
export function cardTypeFor(f: Finding): CardType {
  return f.findingType === 'LATE_EVIDENCE' ? 'LATE_EVIDENCE' : f.findingType;
}
export function cardTitle(f: Finding): string {
  if (f.whilePaused) return 'Activity while the project was paused';
  switch (f.findingType) {
    case 'AI_UNMATCHED_WORK': return 'Work we couldn’t match to a project';
    case 'AI_DISCREPANCY': return 'Activity seen — status differs';
    case 'AI_PROGRESS': return 'Progress noticed';
    case 'AI_COMPLETION_SUGGESTION': return 'Possible completion — needs confirmation';
    default: return f.headline;
  }
}
