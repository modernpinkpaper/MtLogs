import type { HubServer } from './hub';
import type { CsCaseNote, OrderFileLink, PrintClaim, PrintLogRow } from '../domain/types';
import { HubError, PermissionDenied } from './errors';
import { addMinutes, chicagoDate, chicagoToUtc } from '../domain/time';
import { canLogErrors } from './errorLog';
import { activeClaims } from './printStats';

// Customer service: an order number goes in, and what we can PROVE comes out.
// A claim says who took the order and what was ordered. A print log row says what was SUBMITTED to a printer.
// Neither proves how many finished pieces were packed or arrived. This page never says "delivered".

export const canVerify = (hub: HubServer, uid: string) => canLogErrors(hub, uid);

/** Parse one PC print log CSV (the format the shop’s logger writes). Original text stays with the caller. */
export function parsePrintLogCsv(text: string): PrintLogRow[] {
  const out: PrintLogRow[] = [];
  const lines = text.replace(/\\([<>_*#-])/g, '$1').split(/\r?\n/);
  const head = lines.findIndex((l) => /^Date,File Name,Copies,PC,Printer,File Path/i.test(l.trim()));
  if (head < 0) return out;
  for (let i = head + 1; i < lines.length; i++) {
    const cells = [...lines[i].matchAll(/"((?:[^"]|"")*)"|([^,]+)/g)].map((m) => (m[1] ?? m[2] ?? '').replace(/""/g, '"').trim());
    if (cells.length < 6) continue;
    const [date, file, copies, pc, printer, path] = cells;
    const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}):(\d{2})/.exec(date); if (!m) continue;
    const n = parseInt(copies, 10); if (!Number.isFinite(n)) continue;
    out.push({ id: `pl-${out.length}`, at: chicagoToUtc(m[1], `${m[2]}`) , file, copies: n, pc, printer, path });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\.indd$|\.pdf$/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** “Lynn Hawkey - 20 - FLAT.indd” → name, number in the name, style. */
export function parseFileName(file: string): { name: string; qty: number | null; style: string } {
  const m = /^(.*?)\s+-\s+(\d+)\s+-\s+(.*?)(?:\.\w+)?$/.exec(file.trim());
  return m ? { name: m[1].trim(), qty: parseInt(m[2], 10), style: m[3].trim() } : { name: file.replace(/\.\w+$/, '').trim(), qty: null, style: '' };
}

export type MatchLevel = 'EXACT_VERIFIED' | 'PROBABLE' | 'SEVERAL' | 'NONE';
export interface Candidate { file: string; level: 'CONFIRMED_BY_STAFF' | 'ORDER_NUMBER_IN_NAME' | 'NAME_MATCH' | 'PARTIAL_NAME'; why: string; rows: PrintLogRow[]; submittedCopies: number; jobs: number; qtyInName: number | null; sameQtyAsOrder: boolean | null }

const dayRange = (iso: string, days = 1): [string, string] => [addMinutes(iso, -days * 1440), addMinutes(iso, (days + 1) * 1440)];

function dedupe(rows: PrintLogRow[]): PrintLogRow[] { const seen = new Set<string>(); return rows.filter((r) => { const k = `${r.at}|${r.path}|${r.copies}`; if (seen.has(k)) return false; seen.add(k); return true; }); }

export interface OrderLookup {
  orderId: string; found: boolean; unclaimed: boolean;
  claim: null | { claimedByUid: string; claimedBy: string; claimedAt: string; buyer: string; skus: string; orderedQty: number; subtotal: number };
  candidates: Candidate[]; level: MatchLevel; linkedFile: string | null;
  coverage: { ok: boolean; note: string };
  knows: { label: string; value: string; proven: boolean }[];
  notes: CsCaseNote[];
}

export function lookupOrder(hub: HubServer, uid: string, orderIdRaw: string): OrderLookup {
  if (!canVerify(hub, uid)) throw new PermissionDenied();
  const orderId = orderIdRaw.trim();
  if (!orderId) throw new HubError('VALIDATION', 'Type an order number.');
  const st = hub.state;
  const claim: PrintClaim | undefined = activeClaims(hub).find((c) => c.orderId === orderId);
  const unclaimedOnly = !claim && (st.claims ?? []).some((c) => c.orderId === orderId);
  hub.commit(() => { (st.csSearches ??= []).push({ id: hub.nid('cs'), byUid: uid, at: st.now, orderId, found: !!claim }); });
  const notes = (st.csCaseNotes ?? []).filter((n) => n.orderId === orderId);
  const link: OrderFileLink | undefined = (st.orderFileLinks ?? []).filter((l) => l.orderId === orderId).pop();
  const base = { orderId, notes, linkedFile: link?.file ?? null };
  if (!claim) {
    return { ...base, found: false, unclaimed: unclaimedOnly, claim: null, candidates: [], level: 'NONE', coverage: { ok: false, note: st.claims ? 'No active claim has this order number.' : 'Claimed orders are not connected to this copy yet.' },
      knows: [{ label: 'Order claim', value: unclaimedOnly ? 'This order was claimed once but has been given back (unclaimed), so it counts for nobody.' : st.claims ? 'Not found in the active claims.' : 'Not connected yet.', proven: false }] };
  }
  const claimant = hub.userName(claim.uid); const dev = hub.user(claim.uid).primaryDeviceId;
  const orderedQty = claim.items.reduce((t, i) => t + i.quantity, 0);
  const [from, to] = dayRange(claim.claimedAt, 1);
  const all = (st.printLogs ?? []);
  const window = all.filter((r) => r.at >= from && r.at < to);
  const sameDay = all.filter((r) => chicagoDate(r.at) === chicagoDate(claim.claimedAt) && (!dev || r.pc === dev));
  const buyerN = norm(claim.buyer); const buyerTokens = buyerN.split(' ').filter((t) => t.length > 1);
  const byFile = new Map<string, PrintLogRow[]>();
  for (const r of window) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);
  const cands: Candidate[] = [];
  for (const [file, rowsRaw] of byFile) {
    const p = parseFileName(file); const nameN = norm(p.name);
    const rows = dedupe(rowsRaw).sort((a, b) => a.at.localeCompare(b.at));
    let level: Candidate['level'] | null = null; let why = '';
    if (link && link.file === file) { level = 'CONFIRMED_BY_STAFF'; why = 'Chosen by a person at customer service.'; }
    else if (norm(file).includes(norm(orderId)) || rows.some((r) => norm(r.path).includes(norm(orderId)))) { level = 'ORDER_NUMBER_IN_NAME'; why = 'The order number appears in the file name or path.'; }
    else if (nameN && nameN === buyerN) { level = 'NAME_MATCH'; why = 'The name in the file matches the buyer name on the claim. A name alone is not proof.'; }
    else if (buyerTokens.length && buyerTokens.some((t) => nameN.split(' ').includes(t) && t.length > 3)) { level = 'PARTIAL_NAME'; why = 'Part of the name matches.'; }
    if (!level) continue;
    cands.push({ file, level, why, rows, submittedCopies: rows.reduce((t, r) => t + r.copies, 0), jobs: rows.length, qtyInName: p.qty, sameQtyAsOrder: p.qty == null ? null : p.qty === orderedQty });
  }
  const rank = { CONFIRMED_BY_STAFF: 0, ORDER_NUMBER_IN_NAME: 1, NAME_MATCH: 2, PARTIAL_NAME: 3 } as const;
  cands.sort((a, b) => rank[a.level] - rank[b.level] || a.file.localeCompare(b.file));
  // Same name, same quantity as another claim in the window: a name cannot tell them apart.
  const twins = activeClaims(hub).filter((c) => c.orderId !== orderId && norm(c.buyer) === buyerN && c.claimedAt >= from && c.claimedAt < to).length;
  let level: MatchLevel = 'NONE';
  if (cands.some((c) => c.level === 'CONFIRMED_BY_STAFF' || c.level === 'ORDER_NUMBER_IN_NAME')) level = 'EXACT_VERIFIED';
  else if (cands.length === 1 && cands[0].level === 'NAME_MATCH' && twins === 0) level = 'PROBABLE';
  else if (cands.length >= 1) level = 'SEVERAL';
  const coverage = sameDay.length > 0 ? { ok: true, note: `${sameDay.length} print records exist for ${claimant}'s computer that day.` } : { ok: false, note: `Insufficient log coverage: there are no print records for ${claimant}'s computer on that day. That does not mean nothing was printed.` };
  const chosen = cands.find((c) => c.level === 'CONFIRMED_BY_STAFF') ?? (level === 'EXACT_VERIFIED' || level === 'PROBABLE' ? cands[0] : null);
  const knows: OrderLookup['knows'] = [
    { label: 'Customer ordered', value: `${orderedQty} (${claim.items.map((i) => `${i.sku} × ${i.quantity}`).join(', ')})`, proven: true },
    { label: 'Order claimed by', value: `${claimant}, ${chicagoDate(claim.claimedAt)}`, proven: true },
    { label: 'Print submissions', value: chosen ? `${chosen.submittedCopies} copies submitted in ${chosen.jobs} print record${chosen.jobs === 1 ? '' : 's'} for “${chosen.file}”` : level === 'SEVERAL' ? 'Several possible files. A person must choose one.' : coverage.ok ? 'No reliable match to a file yet.' : 'Cannot say: not enough log coverage.', proven: !!chosen && (level === 'EXACT_VERIFIED') },
    { label: 'Finished pieces packed or delivered', value: 'NOT proven by the log. The log shows what was sent to the printer.', proven: false },
  ];
  return { ...base, found: true, unclaimed: false, claim: { claimedByUid: claim.uid, claimedBy: claimant, claimedAt: claim.claimedAt, buyer: claim.buyer, skus: claim.items.map((i) => i.sku).join(', '), orderedQty, subtotal: claim.subtotal }, candidates: cands, level, coverage, knows };
}

/** A person at customer service says which file belongs to the order. Saved with who and when. Never automatic. */
export function confirmFileForOrder(hub: HubServer, uid: string, orderId: string, file: string): OrderFileLink {
  if (!canVerify(hub, uid)) throw new PermissionDenied();
  const look = lookupOrder(hub, uid, orderId);
  if (!look.found) throw new HubError('NOT_FOUND', 'That order has no active claim.');
  if (!look.candidates.some((c) => c.file === file)) throw new HubError('VALIDATION', 'That file is not one of the possible matches.');
  return hub.commit(() => {
    const l: OrderFileLink = { id: hub.nid('ofl'), orderId: orderId.trim(), file, byUid: uid, at: hub.state.now };
    (hub.state.orderFileLinks ??= []).push(l);
    hub.audit({ entityType: 'order', entityId: orderId.trim(), action: 'CS_FILE_CONFIRMED', before: null, after: { file }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Customer service chose the file for this order', evidenceRefs: [], projectId: null });
    return l;
  });
}

export function addCaseNote(hub: HubServer, uid: string, orderId: string, text: string): CsCaseNote {
  if (!canVerify(hub, uid)) throw new PermissionDenied();
  const t = text.trim(); if (!t) throw new HubError('VALIDATION', 'Write the note first.');
  return hub.commit(() => { const n: CsCaseNote = { id: hub.nid('cn'), orderId: orderId.trim(), byUid: uid, at: hub.state.now, text: t }; (hub.state.csCaseNotes ??= []).push(n); hub.audit({ entityType: 'order', entityId: n.orderId, action: 'CS_CASE_NOTE', before: null, after: { text: t }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Investigation note', evidenceRefs: [], projectId: null }); return n; });
}
