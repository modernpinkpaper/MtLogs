import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Chip } from '../common';
import type { Area } from '../../domain/types';

export function OwnerTeam() {
  const { hub, uid } = useMe();
  const act = useAct();
  const rows = hub.teamOverview(uid);
  const [name, setName] = useState('');
  return (
    <div className="stack">
      <div><h1>Team</h1><p className="muted">Assignments decide who gets what — not job titles. Only people on the real roster are named; placeholders are marked.</p></div>
      <div className="tablewrap card"><table><thead><tr><th>Person</th><th>Today’s assignment</th><th>Clock</th><th>Projects</th><th>Pending reviews</th><th>Notes</th><th></th></tr></thead><tbody>
        {rows.filter((r) => r.user.role === 'EMPLOYEE').map((r) => (
          <tr key={r.user.id}>
            <td><strong>{r.user.name}</strong>{!r.user.active && <> <Chip tone="gray">inactive</Chip></>}</td>
            <td><select aria-label={`Assignment today for ${r.user.name}`} style={{ width: 'auto' }} value={r.areaNow} onChange={(e) => act(() => hub.setAssignmentForToday(uid, r.user.id, e.target.value as Area), 'Assignment updated for today')}>
              {(['PROJECT', 'PRINT', 'MIXED', 'UNASSIGNED'] as Area[]).map((a) => <option key={a}>{a}</option>)}</select></td>
            <td>{r.clockedIn ? <Chip tone="ok" glyph="●">in</Chip> : <Chip tone="gray" glyph="○">out</Chip>}</td>
            <td className="small">{r.projects.map((p) => <Link key={p.id} to={`/projects/${p.id}`} style={{ marginRight: 6 }}>{p.key}{p.shared ? ' (read-only)' : ''}</Link>)}{!r.projects.length && '—'}</td>
            <td>{r.pendingCards}</td>
            <td className="small muted">{r.user.rosterNote ?? r.user.capabilities.join(', ')}</td>
            <td><button onClick={() => act(() => hub.setUserActive(uid, r.user.id, !r.user.active))}>{r.user.active ? 'Deactivate' : 'Reactivate'}</button></td>
          </tr>))}</tbody></table></div>
      <form className="card row" onSubmit={async (e) => { e.preventDefault(); const r = await act(() => hub.addUser(uid, { name, area: 'UNASSIGNED' }), 'Added (demo)'); if (r) setName(''); }}>
        <input type="text" aria-label="New person name" placeholder="Add a person (demo only)" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 280 }} />
        <button type="submit" disabled={!name.trim()}>Add with no duties</button>
        <span className="small muted">New people start with no project or print access.</span>
      </form>
      <div className="card info small">Carolina’s assignment changes by day: set today to <em>Project</em> to give her review cards; set <em>Print</em> to show only daily print figures. Access to authorized records is unchanged either way.</div>
    </div>
  );
}
