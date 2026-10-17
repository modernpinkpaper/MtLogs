import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { InferenceLevel, StepStatus, VerificationSource, VerificationState, CoverageState, LinkState, ObservedReviewState } from '../domain/types';

export type Tone = 'gray' | 'ok' | 'warn' | 'bad' | 'info' | 'violet' | 'pink';
export function Chip({ tone = 'gray', glyph, children, title }: { tone?: Tone; glyph?: string; children: ReactNode; title?: string }) {
  return <span className={`chip ${tone}`} title={title}>{glyph ? <span aria-hidden="true">{glyph}</span> : null}{children}</span>;
}

const STATUS: Record<StepStatus, [string, Tone, string]> = {
  NOT_STARTED: ['Not started', 'gray', '○'], IN_PROGRESS: ['In progress', 'info', '◔'], BLOCKED: ['Blocked', 'bad', '⛔'], WAITING: ['Waiting', 'warn', '⏸'],
  REPORTED_COMPLETE: ['Reported complete', 'warn', '◑'], VERIFIED_COMPLETE: ['Complete (confirmed)', 'ok', '✔'], CANCELLED: ['Cancelled', 'gray', '✕'], NOT_APPLICABLE: ['Not applicable', 'gray', '–'], REOPENED: ['Reopened', 'warn', '↺'],
};
export function StatusChip({ status }: { status: StepStatus }) {
  const [label, tone, glyph] = STATUS[status];
  return <Chip tone={tone} glyph={glyph} title="Official status (the tracked state, set by people)">Official: {label}</Chip>;
}
export const statusLabel = (s: StepStatus) => STATUS[s][0];

const VSTATE: Record<VerificationState, [string, Tone, string, string]> = {
  OFFICIAL: ['Official', 'gray', '◆', 'Recorded as the official state.'],
  AI_DETECTED: ['AI Detected', 'violet', '✦', 'Suggested by the AI from observed events. Not confirmed by anyone.'],
  EMPLOYEE_CONFIRMED: ['Employee Confirmed', 'info', '☑', 'A person confirmed or reported this. Not independently verified.'],
  INDEPENDENTLY_VERIFIED: ['Independently Verified', 'ok', '✔', 'Confirmed by an independent source of truth (verifier).'],
  NEEDS_REVIEW: ['Needs Review', 'warn', '!', 'Someone needs to look at this.'],
  UNKNOWN: ['Unknown', 'gray', '?', 'Not enough evidence.'],
};
export function VerifyBadge({ state }: { state: VerificationState }) {
  const [label, tone, glyph, tip] = VSTATE[state];
  return <Chip tone={tone} glyph={glyph} title={tip}>{label}</Chip>;
}

export function SourceChip({ source }: { source: VerificationSource }) {
  const map: Record<VerificationSource, [string, Tone, string]> = {
    NONE: ['No verification', 'gray', '○'], EMPLOYEE_CONFIRMED: ['Employee Confirmed', 'info', '☑'], INDEPENDENT: ['Independently Verified', 'ok', '✔'], OWNER_APPROVED: ['Owner Approved', 'ok', '★'],
  };
  const [l, t, g] = map[source];
  return <Chip tone={t} glyph={g}>{l}</Chip>;
}

const LEVEL: Record<InferenceLevel, [string, string]> = {
  NO_EVIDENCE: ['No matching activity detected', '○'], POSSIBLE_ACTIVITY: ['Possible activity', '◔'], STRONG_ACTIVITY: ['Strong activity observed', '◑'],
  DELIVERABLE_OBSERVED: ['Deliverable observed', '◕'], RESULT_OBSERVED: ['Result observed', '●'], INCONCLUSIVE: ['Inconclusive', '?'],
};
export function ObservedChip({ level, review }: { level: InferenceLevel; review?: ObservedReviewState }) {
  if (level === 'NO_EVIDENCE') return <Chip tone="gray" glyph="○" title="No events matched. This does NOT mean no work happened — coverage may be incomplete.">AI: no matching activity detected</Chip>;
  const [l, g] = LEVEL[level];
  const rv = review && review !== 'NONE' ? ` · ${review.replace(/_/g, ' ').toLowerCase()}` : '';
  return <Chip tone="violet" glyph={g} title="AI observation — separate from the official status.">AI noticed: {l}{rv}</Chip>;
}

export function CoverageChip({ state }: { state: CoverageState }) {
  const m: Record<CoverageState, [string, Tone, string]> = { FINAL: ['Coverage complete', 'ok', '✔'], PROVISIONAL: ['Provisional', 'warn', '…'], INCOMPLETE: ['Coverage incomplete', 'bad', '!'], MISSING: ['No data yet', 'gray', '?'] };
  const [l, t, g] = m[state];
  return <Chip tone={t} glyph={g}>{l}</Chip>;
}
export function LinkChip({ state }: { state: LinkState }) {
  const m: Record<LinkState, [string, Tone, string]> = { VERIFIED: ['Link verified (simulated)', 'ok', '✔'], ACCESS_DENIED: ['Access denied', 'bad', '⛔'], MOVED: ['Moved', 'warn', '→'], MISSING: ['Missing', 'bad', '✕'], UNKNOWN: ['Link unknown', 'gray', '?'], LOCAL_ONLY: ['Local / network path', 'info', '⌂'] };
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
