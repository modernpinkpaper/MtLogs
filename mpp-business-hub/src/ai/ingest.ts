import type { MtLogEvent, NormalizedEvent, WorkEpisode } from '../domain/types';
import { minutesBetween } from '../domain/time';

export interface ParseResult {
  events: MtLogEvent[];
  parseFailures: number;
  /** True when the last line was not newline-terminated and did not parse (file still being written). */
  partialTail: boolean;
  completeLines: number;
}

/**
 * Parse an hourly JSONL file that may still be mid-write. A trailing unterminated, unparseable
 * line is held back (not counted as a failure) and picked up on the next revision.
 */
export function parseJsonl(text: string): ParseResult {
  const endsWithNewline = text.endsWith('\n');
  const lines = text.split('\n');
  if (endsWithNewline) lines.pop();
  const events: MtLogEvent[] = [];
  let parseFailures = 0;
  let partialTail = false;
  let completeLines = 0;
  lines.forEach((line, i) => {
    const isLast = i === lines.length - 1;
    if (!line.trim()) return;
    try {
      const obj = JSON.parse(line);
      if (!obj || typeof obj !== 'object' || typeof obj.event_id !== 'string' || typeof obj.timestamp_utc !== 'string') {
        throw new Error('missing required envelope fields');
      }
      events.push(obj as MtLogEvent);
      completeLines++;
    } catch {
      if (isLast && !endsWithNewline) partialTail = true;
      else parseFailures++;
    }
  });
  return { events, parseFailures, partialTail, completeLines };
}

const SKU_RE = /(?<![A-Za-z0-9])(?:FBA_[A-Z]{2}\d{3}|(?!PC\d)[A-Z]{2}\d{3})(?![0-9])/g;
const REF_RE = /\b99\d{9}\b/g;
const INJECTION_RE = /(ignore (all|any|previous|prior)|disregard .*instruction|system prompt|mark .{0,40}(complete|done|verified)|change .{0,20}status|export .{0,30}(data|file)|reveal)/i;
const PII_RE = /([\w.+-]+@[\w-]+\.[\w.]+)|(\b(?:\d[ -]?){13,16}\b)/g;

export function looksLikeInjection(text: string): boolean {
  return INJECTION_RE.test(text);
}

/** Strip control chars, mask PII-like strings, neutralize instruction-like text, truncate. */
export function sanitizeText(text: string, max = 140): string {
  let t = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(PII_RE, '[redacted]');
  if (looksLikeInjection(t)) t = '[instruction-like text omitted — treated as data]';
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function baseName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

export function normalizeEvent(
  raw: MtLogEvent,
  archiveId: string,
  ingestedAt: string,
  knownUserIds: Set<string>,
): NormalizedEvent {
  const m = (raw.metadata ?? {}) as Record<string, unknown>;
  const fileRaw = str(m.file_name) || (str(m.file_path) ? baseName(str(m.file_path)) : '');
  const label = str(m.action_label);
  const pageText = str(m.page_text_summary);
  const hay = [fileRaw, label, pageText, str(m.sku), str(m.window_title)].join(' ');
  const skus = new Set<string>();
  for (const s of hay.match(SKU_RE) ?? []) skus.add(s);
  if (Array.isArray(m.skus)) for (const s of m.skus) if (typeof s === 'string') skus.add(s);
  const refs = new Set<string>();
  for (const r of (str(m.submission_ref) + ' ' + pageText).match(REF_RE) ?? []) refs.add(r);
  const hints = new Set<string>();
  if (typeof m.project_hint === 'string') hints.add(m.project_hint);
  for (const p of hay.match(/\bP-\d{3}\b/g) ?? []) hints.add(p);
  const claimedActor = typeof m.actor_user_id === 'string' && knownUserIds.has(m.actor_user_id) ? m.actor_user_id : null;

  const safeFile = fileRaw ? sanitizeText(fileRaw, 90) : '';
  const parts = [raw.event_type.replace(/_/g, ' ')];
  if (raw.application) parts.push(`in ${sanitizeText(raw.application, 40)}`);
  if (label) parts.push(`“${sanitizeText(label, 40)}”`);
  if (safeFile) parts.push(safeFile);
  if (refs.size) parts.push(`ref ${[...refs].join(', ')}`);
  const stat = str(m.status_text);
  if (stat) parts.push(`status: ${sanitizeText(stat, 40)}`);

  return {
    id: raw.event_id,
    occurredAt: new Date(raw.timestamp_utc).toISOString(),
    ingestedAt,
    deviceId: raw.computer_id,
    actorUid: claimedActor,
    attributionState: claimedActor ? 'ACTOR_KNOWN' : 'DEVICE_ONLY_ACTOR_UNVERIFIED',
    eventType: raw.event_type,
    app: raw.application ?? raw.process_name ?? 'unknown',
    sourceArchiveId: archiveId,
    sequence: typeof raw.sequence === 'number' ? raw.sequence : null,
    watcherRunId: raw.watcher_run_id ?? null,
    allowedSummary: parts.join(' · '),
    keys: {
      skus: [...skus],
      submissionRefs: [...refs],
      fileNames: safeFile ? [safeFile] : [],
      projectHints: [...hints],
      actions: label ? [label.toLowerCase()] : [],
      docIds: str(m.drive_file_id) ? [str(m.drive_file_id)] : [],
    },
    episodeId: null,
  };
}

/** Detect missing sequence numbers per watcher run (evidence of truncated/lagging files). */
export function findSequenceGaps(events: MtLogEvent[]): string[] {
  const byRun = new Map<string, number[]>();
  for (const e of events) {
    if (typeof e.sequence === 'number' && e.watcher_run_id) {
      const arr = byRun.get(e.watcher_run_id) ?? [];
      arr.push(e.sequence);
      byRun.set(e.watcher_run_id, arr);
    }
  }
  const gaps: string[] = [];
  for (const [run, seqs] of byRun) {
    const sorted = [...new Set(seqs)].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] > 1) gaps.push(`${run}: missing sequence ${sorted[i - 1] + 1}–${sorted[i] - 1}`);
    }
  }
  return gaps;
}

const EPISODE_GAP_MIN = 10;

/** Assign unassigned events to bounded work episodes (consecutive events on one device). */
export function assignEpisodes(
  events: NormalizedEvent[],
  episodes: WorkEpisode[],
  newId: () => string,
): { touchedEpisodeIds: string[] } {
  const touched = new Set<string>();
  const pending = events.filter((e) => e.episodeId === null).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  for (const ev of pending) {
    let ep = episodes.find(
      (x) =>
        x.deviceId === ev.deviceId &&
        minutesBetween(x.endedAt, ev.occurredAt) <= EPISODE_GAP_MIN &&
        minutesBetween(ev.occurredAt, x.startedAt) <= EPISODE_GAP_MIN,
    );
    if (!ep) {
      ep = {
        id: newId(), deviceId: ev.deviceId, actorUid: null, actorConfidence: 'NONE',
        startedAt: ev.occurredAt, endedAt: ev.occurredAt, observedApplications: [], skuKeys: [],
        sourceEventIds: [], humanActivityUncertain: true,
        notes: ['Computer activity ≠ full elapsed task time; physical work is not observed.'],
      };
      episodes.push(ep);
    }
    if (ev.occurredAt < ep.startedAt) ep.startedAt = ev.occurredAt;
    if (ev.occurredAt > ep.endedAt) ep.endedAt = ev.occurredAt;
    if (!ep.observedApplications.includes(ev.app)) ep.observedApplications.push(ev.app);
    for (const s of ev.keys.skus) if (!ep.skuKeys.includes(s)) ep.skuKeys.push(s);
    ep.sourceEventIds.push(ev.id);
    ev.episodeId = ep.id;
    touched.add(ep.id);
  }
  return { touchedEpisodeIds: [...touched] };
}

export function hashText(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
