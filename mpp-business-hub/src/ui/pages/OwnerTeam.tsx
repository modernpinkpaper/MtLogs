import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Chip } from '../common';

export function OwnerTeam({ embedded }: { embedded?: boolean } = {}) {
  const { hub, uid } = useMe();
  const act = useAct();
  const rows = hub.teamOverview(uid);
  const [name, setName] = useState('');
  return (
    <div className="stack">
      {!embedded && (<div><h1>Team</h1><p className="muted">Everyone can see both project work and their own printing numbers. What the logs show decides what is useful, so nobody has to be set to a job. Made-up names are marked.</p></div>)}
      <div className="tablewrap card"><table><thead><tr><th>Person</th><th>Clock</th><th>Projects</th><th>Reviews waiting</th><th>Customer service</th><th>Notes</th><th></th></tr></thead><tbody>
        {rows.filter((r) => r.user.role === 'EMPLOYEE' || r.user.noClock).map((r) => (
          <tr key={r.user.id}>
            <td><strong>{r.user.name}</strong>{!r.user.active && <> <Chip tone="gray">inactive</Chip></>}</td>
            <td>{r.user.noClock ? <Chip tone="gray">does not clock in</Chip> : r.clockedIn ? <Chip tone="ok" glyph="●">in</Chip> : <Chip tone="gray" glyph="○">out</Chip>}</td>
            <td className="small">{r.projects.map((p) => <Link key={p.id} to={`/projects/${p.id}`} style={{ marginRight: 6 }}>{p.key}{p.shared ? ' (read-only)' : ''}</Link>)}{!r.projects.length && '—'}</td>
            <td>{r.pendingCards}</td>
            <td>{r.user.role === 'OWNER' ? <span className="muted small">Owner</span> : <label style={{ fontWeight: 500 }}><input type="checkbox" aria-label={`${r.user.name} can log errors`} checked={!!r.user.permissions?.includes('CUSTOMER_SERVICE')} onChange={(e) => act(() => hub.setCustomerService(uid, r.user.id, e.target.checked), e.target.checked ? `${r.user.name} can now log errors` : 'Permission removed')} /> Can log errors</label>}</td>
            <td className="small muted">{r.user.rosterNote ?? r.user.capabilities.join(', ')}</td>
            <td><button className="quiet" onClick={() => act(() => hub.setUserActive(uid, r.user.id, !r.user.active))}>{r.user.active ? 'Deactivate' : 'Reactivate'}</button></td>
          </tr>))}</tbody></table></div>
      <form className="card row" onSubmit={async (e) => { e.preventDefault(); const r = await act(() => hub.addUser(uid, { name, area: 'UNASSIGNED' }), 'Added (demo)'); if (r) setName(''); }}>
        <input type="text" aria-label="New person name" placeholder="Add a person (demo only)" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 280 }} />
        <button type="submit" disabled={!name.trim()}>Add with no jobs</button>
        <span className="small muted">New people start with no access to anything.</span>
      </form>
    </div>
  );
}
