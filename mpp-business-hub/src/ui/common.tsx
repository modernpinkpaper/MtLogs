import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { InferenceLevel, StepStatus, VerificationSource, VerificationState, CoverageState, LinkState, ObservedReviewState } from '../domain/types';

export type Tone = 'gray' | 'ok' | 'warn' | 'bad' | 'info' | 'violet' | 'pink';
export function Chip({ tone = 'gray', glyph, children, title }: { tone?: Tone; glyph?: string; children: ReactNode; title?: string }) {
  return <span className={`chip ${tone}`} title={title}>{glyph ? <span aria-hidden="true">{glyph}</span> : null}{children}</span>;
}

const STATUS: Record<StepStatus, [string, Tone, string]> = {
  NOT_STARTED: ['Not started', 'gray', '○'], IN_PROGRESS: ['In progress', 'info', '◔'], BLOCKED: ['Blocked', 'bad', '⛔'], WAITING: ['Waiting', 'warn', '⏸'],
  REPORTED_COMPLETE: ['Says it is done', 'warn', '◑'], VERIFIED_COMPLETE: ['Done and confirmed', 'ok', '✔'], CANCELLED: ['Cancelled', 'gray', '✕'], NOT_APPLICABLE: ['Not applicable', 'gray', '–'], REOPENED: ['Reopened', 'warn', '↺'],
};
export function StatusChip({ status }: { status: StepStatus }) {
  const [label, tone, glyph] = STATUS[status];
  return <Chip tone={tone} glyph={glyph} title="This is what the tracker says. People set it.">Tracker says: {label}</Chip>;
}
export const statusLabel = (s: StepStatus) => STATUS[s][0];

const VSTATE: Record<VerificationState, [string, Tone, string, string]> = {
  OFFICIAL: ['Tracker says', 'gray', '◆', 'This is what the tracker says.'],
  AI_DETECTED: ['AI guess', 'violet', '✦', 'The AI made this guess from computer activity. No person has checked it.'],
  EMPLOYEE_CONFIRMED: ['Person says so', 'info', '☑', 'A person said or confirmed this. No system has double-checked it.'],
  INDEPENDENTLY_VERIFIED: ['Double-checked', 'ok', '✔', 'A separate system checked this and it matches.'],
  NEEDS_REVIEW: ['Needs a look', 'warn', '!', 'Someone needs to look at this.'],
  UNKNOWN: ['Not known', 'gray', '?', 'We do not have enough facts.'],
};
export function VerifyBadge({ state }: { state: VerificationState }) {
  const [label, tone, glyph, tip] = VSTATE[state];
  return <Chip tone={tone} glyph={glyph} title={tip}>{label}</Chip>;
}

export function SourceChip({ source }: { source: VerificationSource }) {
  const map: Record<VerificationSource, [string, Tone, string]> = {
    NONE: ['Not double-checked', 'gray', '○'], EMPLOYEE_CONFIRMED: ['Person says so', 'info', '☑'], INDEPENDENT: ['Double-checked', 'ok', '✔'], OWNER_APPROVED: ['Owner approved', 'ok', '★'],
  };
  const [l, t, g] = map[source];
  return <Chip tone={t} glyph={g}>{l}</Chip>;
}

const LEVEL: Record<InferenceLevel, [string, string]> = {
  NO_EVIDENCE: ['No matching activity seen', '○'], POSSIBLE_ACTIVITY: ['Maybe some activity', '◔'], STRONG_ACTIVITY: ['Clear activity', '◑'],
  DELIVERABLE_OBSERVED: ['Finished file seen', '◕'], RESULT_OBSERVED: ['Result seen', '●'], INCONCLUSIVE: ['Not clear', '?'],
};
export function ObservedChip({ level, review }: { level: InferenceLevel; review?: ObservedReviewState }) {
  if (level === 'NO_EVIDENCE') return <Chip tone="gray" glyph="○" title="We saw nothing that matches. That does NOT mean no work happened. Some data may be missing.">AI: no matching activity seen</Chip>;
  const [l, g] = LEVEL[level];
  const RV: Record<string, string> = { PENDING_EMPLOYEE: 'waiting for a person to check', EMPLOYEE_CONFIRMED: 'a person said yes', CORRECTED: 'a person fixed it', DISMISSED: 'skipped', EXTERNALLY_VERIFIED: 'double-checked' };
  const rv = review && review !== 'NONE' ? ` · ${RV[review] ?? ''}` : '';
  return <Chip tone="violet" glyph={g} title="This is what the AI saw. It is separate from the tracker.">AI saw: {l}{rv}</Chip>;
}

export function CoverageChip({ state }: { state: CoverageState }) {
  const m: Record<CoverageState, [string, Tone, string]> = { FINAL: ['All data arrived', 'ok', '✔'], PROVISIONAL: ['Not final yet', 'warn', '…'], INCOMPLETE: ['Some data missing', 'bad', '!'], MISSING: ['No data yet', 'gray', '?'] };
  const [l, t, g] = m[state];
  return <Chip tone={t} glyph={g}>{l}</Chip>;
}
export function LinkChip({ state }: { state: LinkState }) {
  const m: Record<LinkState, [string, Tone, string]> = { VERIFIED: ['Link works (pretend)', 'ok', '✔'], ACCESS_DENIED: ['No access', 'bad', '⛔'], MOVED: ['Moved', 'warn', '→'], MISSING: ['Missing', 'bad', '✕'], UNKNOWN: ['Link not known', 'gray', '?'], LOCAL_ONLY: ['On a company computer', 'info', '⌂'] };
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
