import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { InferenceLevel, StepStatus, VerificationSource, VerificationState, CoverageState, LinkState, ObservedReviewState } from '../domain/types';

export type Tone = 'gray' | 'ok' | 'warn' | 'bad' | 'info' | 'violet' | 'pink';
export function Chip({ tone = 'gray', glyph, children, title }: { tone?: Tone; glyph?: string; children: ReactNode; title?: string }) {
  return <span className={`chip ${tone}`} title={title}>{glyph ? <span aria-hidden="true">{glyph}</span> : null}{children}</span>;
}

const STATUS: Record<StepStatus, [string, Tone, string]> = {
  NOT_STARTED: ['Not started', 'gray', '○'], IN_PROGRESS: ['In progress', 'info', '◔'], BLOCKED: ['Blocked', 'bad', '⛔'], WAITING: ['Waiting', 'warn', '⏸'],
  REPORTED_COMPLETE: ['Reported done · awaiting check', 'warn', '◑'], VERIFIED_COMPLETE: ['Verified complete', 'ok', '✔'], CANCELLED: ['Canceled', 'gray', '✕'], NOT_APPLICABLE: ['Not needed', 'gray', '–'], REOPENED: ['Reopened', 'warn', '↺'],
};
/** The official status of a step, in plain words. */
export function StatusChip({ status, hold }: { status: StepStatus; hold?: boolean }) {
  const [label, tone, glyph] = STATUS[status];
  return <Chip tone={tone} glyph={glyph} title="This is the step’s status in the tracker. People set it.">{label}{hold ? ' · on hold' : ''}</Chip>;
}
/** Quiet status: a coloured dot and a word. Used in lists, where a full chip on every row is noise. */
export function StepState({ status, hold }: { status: StepStatus; hold?: boolean }) {
  const [label, tone] = STATUS[status];
  return <span className={`state ${tone}`}><i aria-hidden="true" />{label}{hold ? ' · on hold' : ''}</span>;
}
export const statusLabel = (s: StepStatus) => STATUS[s][0];

import type { ProjectWorkStatus } from '../domain/types';
const PSTATUS: Record<ProjectWorkStatus, [string, Tone, string]> = {
  NOT_STARTED: ['Not started', 'gray', '○'], IN_PROGRESS: ['In progress', 'info', '◔'], PAUSED: ['Paused', 'violet', '⏸'], COMPLETED: ['Completed', 'ok', '✔'], CANCELED: ['Canceled', 'gray', '✕'],
};
export function ProjectStatusChip({ status }: { status: ProjectWorkStatus }) {
  const [label, tone, glyph] = PSTATUS[status];
  return <Chip tone={tone} glyph={glyph}>{label}</Chip>;
}

const VSTATE: Record<VerificationState, [string, Tone, string, string]> = {
  OFFICIAL: ['Recorded', 'gray', '◆', 'Saved in the tracker.'],
  AI_DETECTED: ['Detected in logs', 'violet', '✦', 'The system saw this in computer activity. No person has confirmed it.'],
  EMPLOYEE_CONFIRMED: ['Employee confirmed', 'info', '☑', 'A person said or confirmed this. It has not been checked in the source system.'],
  OWNER_APPROVED: ['Owner approved', 'ok', '★', 'Dalia reviewed this and signed it off. It is a person’s decision, not a check in another system.'],
  INDEPENDENTLY_VERIFIED: ['Checked in the source system', 'ok', '✔', 'A separate system looked and it matches.'],
  NEEDS_REVIEW: ['Needs a look', 'warn', '!', 'Someone needs to look at this.'],
  UNKNOWN: ['Not known', 'gray', '?', 'We do not have enough facts.'],
};
export function VerifyBadge({ state }: { state: VerificationState }) {
  const [label, tone, glyph, tip] = VSTATE[state];
  return <Chip tone={tone} glyph={glyph} title={tip}>{label}</Chip>;
}

export function SourceChip({ source }: { source: VerificationSource }) {
  const map: Record<VerificationSource, [string, Tone, string]> = {
    NONE: ['Not checked in the source system', 'gray', '○'], EMPLOYEE_CONFIRMED: ['Employee confirmed', 'info', '☑'], INDEPENDENT: ['Checked in the source system', 'ok', '✔'], OWNER_APPROVED: ['Approved by Dalia', 'ok', '★'],
  };
  const [l, t, g] = map[source];
  return <Chip tone={t} glyph={g}>{l}</Chip>;
}

const LEVEL: Record<InferenceLevel, [string, string]> = {
  NO_EVIDENCE: ['No matching computer activity found', '○'], POSSIBLE_ACTIVITY: ['Maybe some activity', '◔'], STRONG_ACTIVITY: ['Clear activity', '◑'],
  DELIVERABLE_OBSERVED: ['A finished file was seen', '◕'], RESULT_OBSERVED: ['A result was seen', '●'], INCONCLUSIVE: ['Not clear', '?'],
};
export function ObservedChip({ level, review }: { level: InferenceLevel; review?: ObservedReviewState }) {
  if (level === 'NO_EVIDENCE') return <Chip tone="gray" glyph="○" title="We saw nothing that matches. That does NOT mean no work happened. Some activity may not have arrived yet.">No matching computer activity found</Chip>;
  const [l, g] = LEVEL[level];
  const RV: Record<string, string> = { PENDING_EMPLOYEE: 'waiting for you to confirm', EMPLOYEE_CONFIRMED: 'employee confirmed', CORRECTED: 'employee corrected it', DISMISSED: 'skipped', EXTERNALLY_VERIFIED: 'checked in the source system' };
  const rv = review && review !== 'NONE' ? ` · ${RV[review] ?? ''}` : '';
  return <Chip tone="violet" glyph={g} title="This is what the system saw in computer activity. It is separate from the step’s status.">Detected in logs: {l}{rv}</Chip>;
}

export function CoverageChip({ state }: { state: CoverageState }) {
  const m: Record<CoverageState, [string, Tone, string]> = { FINAL: ['All activity received', 'ok', '✔'], PROVISIONAL: ['Checking today’s work', 'warn', '…'], INCOMPLETE: ['Some activity is missing', 'bad', '!'], MISSING: ['No activity received yet', 'gray', '?'] };
  const [l, t, g] = m[state];
  return <Chip tone={t} glyph={g}>{l}</Chip>;
}
export function LinkChip({ state }: { state: LinkState }) {
  const m: Record<LinkState, [string, Tone, string]> = { VERIFIED: ['Link works (practice)', 'ok', '✔'], ACCESS_DENIED: ['No access', 'bad', '⛔'], MOVED: ['Moved', 'warn', '→'], MISSING: ['Missing', 'bad', '✕'], UNKNOWN: ['Link not known', 'gray', '?'], LOCAL_ONLY: ['On a company computer', 'info', '⌂'] };
  const [l, t, g] = m[state];
  return <Chip tone={t} glyph={g}>{l}</Chip>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={wide ? { width: 'min(900px,100%)' } : undefined}>
        <div className="row between"><h2>{title}</h2><button className="ghost" onClick={onClose} aria-label="Close dialog">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card flat muted" style={{ textAlign: 'center', padding: '1.5rem' }}>{children}</div>;
}

export function Copy({ text, label = 'Copy path' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={async () => { try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ } setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? 'Copied ✔' : label}
    </button>
  );
}

/** True on phone-sized screens. Employees work on desktop PCs; Dalia's phone gets a decision-focused layout. */
export function useNarrow(max = 900) {
  const q = `(max-width: ${max}px)`;
  const [n, setN] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const f = () => setN(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, [q]);
  return n;
}
