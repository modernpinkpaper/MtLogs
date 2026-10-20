import type { Step } from './types';

type S = Pick<Step, 'id' | 'projectId' | 'parentStepId' | 'sortOrder'>;

/** A, B, C … Z, AA, AB … */
export function letters(i: number): string {
  let n = i; let out = '';
  do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return out;
}

/** Display numbers that follow the order on screen: 1, 2, 3 … ; sub steps 4A, 4B ; under those 4AA, 4AB.
 * The stored sortOrder is only used to decide the order. It is never shown. */
export function stepLabels(steps: S[]): Map<string, string> {
  const out = new Map<string, string>();
  const byProject = new Map<string, S[]>();
  for (const s of steps) byProject.set(s.projectId, [...(byProject.get(s.projectId) ?? []), s]);
  for (const list of byProject.values()) {
    const kids = (pid: string | null) => list.filter((s) => (s.parentStepId ?? null) === pid).sort((a, b) => a.sortOrder - b.sortOrder);
    const walk = (pid: string | null, prefix: string) => {
      kids(pid).forEach((s, i) => { const label = pid === null ? String(i + 1) : prefix + letters(i); out.set(s.id, label); walk(s.id, label); });
    };
    walk(null, '');
  }
  return out;
}

export function stepLabel(steps: S[], step: S): string {
  return stepLabels(steps.filter((s) => s.projectId === step.projectId)).get(step.id) ?? String(step.sortOrder);
}
