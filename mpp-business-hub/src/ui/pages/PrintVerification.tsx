import { useState } from 'react';
import { useAct, useMe } from '../hubContext';
import { Chip, Empty } from '../common';
import { Avatar } from '../avatar';
import { PermissionDeniedView } from './permissionView';
import { formatDateTime } from '../../domain/time';
import { money } from '../printTeamUi';
import type { MatchLevel, OrderLookup } from '../../server/printVerify';

const LEVEL: Record<MatchLevel, [string, 'ok' | 'warn' | 'gray' | 'info']> = {
  EXACT_VERIFIED: ['Exact verified link', 'ok'], PROBABLE: ['Probable match — needs confirmation', 'warn'], SEVERAL: ['Several possible matches', 'warn'], NONE: ['No reliable match', 'gray'],
};

/** Customer service: type an order number, see who claimed it, which print files could belong to it, and what the computer sent to the printer. */
export function PrintVerification({ embedded }: { embedded?: boolean } = {}) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<OrderLookup | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  if (!hub.canVerifyPrints(uid)) return <PermissionDeniedView />;
  const search = async (e: React.FormEvent) => { e.preventDefault(); setCopied(false); const r = await act(() => hub.lookupOrder(uid, q)); if (r) { setRes(r); setPick(r.linkedFile ?? r.candidates[0]?.file ?? null); } };
  const refresh = () => { if (res) setRes(hub.lookupOrder(uid, res.orderId)); };
  const chosen = res?.candidates.find((c) => c.file === pick) ?? null;
  const summary = res?.found ? [
    `Order ${res.orderId}: claimed by ${res.claim!.claimedBy} on ${formatDateTime(res.claim!.claimedAt)}. Ordered quantity: ${res.claim!.orderedQty}.`,
    chosen ? `Print records for “${chosen.file}”: ${chosen.submittedCopies} copies submitted to the printer in ${chosen.jobs} record${chosen.jobs === 1 ? '' : 's'} (${LEVEL[res.level][0].toLowerCase()}).` : `No file is confirmed for this order yet (${LEVEL[res.level][0].toLowerCase()}).`,
    'These are print submissions from the computer log. They do not prove how many finished pieces were packed or delivered.',
  ].join('\n') : '';
  return (
    <div className="stack">
      {!embedded && <div><h1>Print verification</h1></div>}
      <p className="muted" style={{ margin: 0 }}>Find out what was sent to the printer for an order. This helps answer a customer, and it is not a refund decision.</p>
      <form className="row" onSubmit={search} role="search">
        <label htmlFor="pv-q" className="sr-only">Order number</label>
        <input id="pv-q" type="text" placeholder="Search by order number" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} />
        <button className="primary" type="submit" disabled={!q.trim()}>Search</button>
      </form>
      {!res && <Empty>Type an exact order number to start.</Empty>}
      {res && !res.found && <div className="card warn" role="status"><strong>{res.unclaimed ? 'This order was given back.' : 'No active claim found.'}</strong><p style={{ margin: '.3rem 0 0' }}>{res.knows[0].value}</p></div>}
      {res?.found && res.claim && (
        <div className="split">
          <section className="card stack" aria-label="Order record">
            <h2 style={{ margin: 0 }}>Order record</h2>
            <div className="small"><strong>Order #</strong> {res.orderId}</div>
            <div className="small row" style={{ gap: 8 }}><strong>Claimed by</strong> <span className="person"><Avatar uid={res.claim.claimedByUid} size={26} />{res.claim.claimedBy}</span></div>
            <div className="small"><strong>SKU</strong> {res.claim.skus} · <strong>Ordered</strong> {res.claim.orderedQty}</div>
            <div className="small"><strong>Claimed</strong> {formatDateTime(res.claim.claimedAt)} · <strong>Subtotal</strong> {money(res.claim.subtotal)}</div>
            <div className="small"><strong>Buyer</strong> {res.claim.buyer}</div>
            <div className="small"><strong>Personalization file</strong> {res.linkedFile ? <Chip tone="ok">Confirmed: {res.linkedFile}</Chip> : <Chip tone="gray">File name not linked yet</Chip>}</div>
          </section>
          <section className="card stack" aria-label="Print file matches">
            <div className="row between"><h2 style={{ margin: 0 }}>Print file matches</h2><Chip tone={LEVEL[res.level][1]}>{LEVEL[res.level][0]}</Chip></div>
            {!res.coverage.ok && <div className="card warn small" role="status">{res.coverage.note}</div>}
            {res.candidates.length === 0 && res.coverage.ok && <p className="small muted" style={{ margin: 0 }}>No print record looks like this order yet. That is not proof that nothing was printed.</p>}
            {res.candidates.map((c) => (
              <div key={c.file} className={`card flat stack ${pick === c.file ? 'selcard' : ''}`} style={{ gap: 6 }}>
                <div className="row between"><strong>{c.file}</strong>{res.linkedFile === c.file && <Chip tone="ok">Confirmed</Chip>}</div>
                <div className="small muted">{c.why}</div>
                <div className="small">{c.submittedCopies} copies submitted in {c.jobs} print record{c.jobs === 1 ? '' : 's'}{c.qtyInName != null ? ` · the name says ${c.qtyInName}${c.sameQtyAsOrder === false ? ` but the order was for ${res.claim!.orderedQty}` : ''}` : ''}</div>
                <div className="row"><button onClick={() => setPick(c.file)} aria-pressed={pick === c.file}>View details</button>
                  {res.linkedFile !== c.file && <button onClick={async () => { const r = await act(() => hub.confirmFileForOrder(uid, res.orderId, c.file), 'Saved. This file is now linked to the order.'); if (r) refresh(); }}>This is the file for this order</button>}</div>
              </div>))}
          </section>
        </div>
      )}
      {res?.found && chosen && (
        <section className="card stack" aria-label="Raw print history">
          <h2 style={{ margin: 0 }}>Raw print history <span className="small muted" style={{ fontWeight: 400 }}>(read only)</span></h2>
          <div className="tablewrap"><table className="ordtable"><thead><tr><th>When</th><th>Workstation</th><th>Printer</th><th>File</th><th className="num">Copies submitted</th></tr></thead>
            <tbody>{chosen.rows.map((r) => <tr key={r.id}><td>{formatDateTime(r.at)}</td><td>{r.pc}</td><td>{r.printer}</td><td title={r.path}>{r.file}</td><td className="num">{r.copies}</td></tr>)}</tbody>
            <tfoot><tr><td colSpan={4}><strong>Total submitted</strong></td><td className="num"><strong>{chosen.submittedCopies}</strong></td></tr></tfoot></table></div>
          <p className="small muted" style={{ margin: 0 }}>Copies here are what the computer sent to the printer. Repeated identical rows are counted once. Cards and envelopes are separate files and are not added together.</p>
        </section>
      )}
      {res?.found && (
        <section className="card stack" aria-label="What we know">
          <h2 style={{ margin: 0 }}>What we know</h2>
          <ul style={{ margin: '0 0 0 1.1rem' }}>{res.knows.map((k) => <li key={k.label}><strong>{k.label}:</strong> {k.value} {k.proven ? <Chip tone="ok" glyph="✔">Source</Chip> : null}</li>)}</ul>
          <div className="row">
            <button onClick={async () => { try { await navigator.clipboard.writeText(summary); setCopied(true); } catch { setCopied(false); } }}>Copy factual summary</button>{copied && <span className="small" role="status">Copied</span>}
          </div>
          <div><label htmlFor="pv-note">Internal case note</label>
            <div className="row" style={{ alignItems: 'flex-start' }}><textarea id="pv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: Customer says 30 arrived. The log shows 30 copies submitted for the card file." style={{ minHeight: 64, flex: 1 }} />
              <button disabled={!note.trim()} onClick={async () => { const r = await act(() => hub.addCaseNote(uid, res.orderId, note), 'Note saved'); if (r) { setNote(''); refresh(); } }}>Add note</button></div></div>
          {res.notes.map((n) => <div key={n.id} className="small"><span className="muted">{formatDateTime(n.at)} · {hub.userName(n.byUid)}:</span> {n.text}</div>)}
        </section>
      )}
    </div>
  );
}
