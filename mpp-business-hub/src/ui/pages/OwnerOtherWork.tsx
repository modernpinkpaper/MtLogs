import { useState } from 'react';
import { useAct, useMe } from '../hubContext';
import { Chip, Empty, Tabs } from '../common';
import { formatDateTime } from '../../domain/time';

type Tab = 'waiting' | 'everyday' | 'maybeProject' | 'attached' | 'skipped' | 'notMine';
const LABELS: Record<Tab, string> = { waiting: 'Waiting for a person', everyday: 'Everyday work', maybeProject: 'Maybe a new project', attached: 'Added to a project', skipped: 'Skipped', notMine: 'Not them' };

export function OwnerOtherWork({ embedded }: { embedded?: boolean } = {}) {
  const { hub, uid } = useMe();
  const act = useAct();
  const data = hub.otherWork(uid);
  const [tab, setTab] = useState<Tab>('skipped');
  const rows = data[tab];
  return (
    <div className="stack">
      {!embedded && (<div><h1>Other work</h1>
        <p className="muted">Work the system saw that is not part of a tracked step. Nothing disappears when someone skips it. You can always see it here and send it back.</p></div>)}
      <Tabs tabs={(Object.keys(LABELS) as Tab[]).map((t) => ({ id: t, label: `${LABELS[t]} (${data[t].length})` }))} value={tab} onChange={setTab} />
      {rows.length === 0 && <Empty>Nothing here.</Empty>}
      {rows.map((r) => (
        <article key={r.finding.id} className="card stack">
          <div className="row between">
            <strong>{r.logEntry?.title ?? r.finding.headline}</strong>
            <div className="row">
              <Chip tone={r.finding.status === 'DISMISSED' ? 'warn' : r.finding.status === 'PROPOSED' ? 'violet' : 'info'}>{r.finding.status === 'DISMISSED' ? 'Skipped' : r.finding.status === 'NOT_MINE' ? 'Not them' : r.finding.status === 'PROPOSED' ? 'Waiting' : 'Saved'}</Chip>
              {r.linkedTo && <Chip tone="ok">{r.linkedTo}</Chip>}
            </div>
          </div>
          <div className="small muted">Checked by {r.byName}{r.decision ? ` · ${formatDateTime(r.decision.submittedAt)}` : ''}</div>
          {r.decision?.note && <div className="small">Their note: “{r.decision.note}”</div>}
          {r.finding.status === 'DISMISSED' && !r.decision?.note && <div className="small muted">No reason was given.</div>}
          <details><summary className="small">What the computer showed ({r.events.length})</summary>
            <ul className="small" style={{ margin: '.3rem 0 0 1.1rem' }}>{r.events.map((e, i) => <li key={i}>{e}</li>)}</ul>
            <p className="small muted">We can only see the computer, not the person.</p></details>
          {(r.finding.status === 'DISMISSED' || r.finding.status === 'NOT_MINE') && (
            <div><button onClick={() => act(() => hub.restoreFinding(uid, r.finding.id), 'Sent back to them for another look')}>Send back for another look</button></div>
          )}
        </article>
      ))}
    </div>
  );
}
