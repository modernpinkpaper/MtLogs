import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Chip, Empty, Modal } from '../common';
import { formatDate } from '../../domain/time';
import { RequestUpdateDialog } from '../dialogs';
import { progressOf } from '../progress';
import type { Project } from '../../domain/types';

export function Projects() {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('');
  const [priority, setPriority] = useState('');
  const [adding, setAdding] = useState(false);
  const [reqFor, setReqFor] = useState<string | null>(null);
  const list = hub.listProjects(uid).filter((p) => (!q || `${p.key} ${p.title}`.toLowerCase().includes(q.toLowerCase())) && (!owner || p.memberUids.includes(owner)) && (!priority || p.priority === priority));
  return (
    <div className="stack">
      <div className="row between"><div><h1>Projects</h1><p className="muted">{me.role === 'OWNER' ? 'All company projects, plus your private ones.' : 'Projects you work on or can look at.'}</p></div>
        {me.role === 'OWNER' && <button className="primary" onClick={() => setAdding(true)}>New project (practice)</button>}</div>
      <div className="row">
        <input type="search" aria-label="Filter projects" placeholder="Filter by text…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
        {me.role === 'OWNER' && <select aria-label="Filter by person" style={{ width: 'auto' }} value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Anyone</option>{hub.listUsers(uid).filter((u) => u.role === 'EMPLOYEE').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
        <select aria-label="Filter by priority" style={{ width: 'auto' }} value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">Any priority</option><option>HIGH</option><option>NORMAL</option><option>LOW</option></select>
      </div>
      {list.length === 0 && <Empty>No projects match.</Empty>}
      <div className="grid cols-2">{list.map((p) => <ProjectCard key={p.id} p={p} onRequest={() => setReqFor(p.id)} />)}</div>
      {adding && <NewProject onClose={() => setAdding(false)} act={act} />}
      {reqFor && <RequestUpdateDialog projectId={reqFor} onClose={() => setReqFor(null)} />}
    </div>
  );
}

function ProjectCard({ p, onRequest }: { p: Project; onRequest: () => void }) {
  const { hub, uid, me } = useMe();
  const steps = hub.projectSteps(uid, p.id);
  const pr = progressOf(steps);
  return (
    <div className="card">
      <div className="row between"><strong><Link to={`/projects/${p.id}`}>{p.key}</Link></strong>
        <span className="row">{p.visibility === 'OWNER_PRIVATE' && <Chip tone="violet" glyph="🔒">Only Dalia</Chip>}<Chip tone={p.priority === 'HIGH' ? 'bad' : 'gray'}>{p.priority.toLowerCase()} importance</Chip></span></div>
      <h3 style={{ marginTop: 4 }}>{p.title}</h3>
      <div className="small muted">{p.memberUids.map((m) => hub.userName(m)).join(', ') || (p.visibility === 'OWNER_PRIVATE' ? 'Only you' : 'No one assigned')}{p.deadlineAt ? ` · due ${formatDate(p.deadlineAt)}` : ''}</div>
      <div style={{ margin: '.6rem 0' }}><div className="progressbar" aria-hidden="true"><span style={{ width: `${(pr.verified / Math.max(1, pr.total)) * 100}%`, background: 'var(--ok)' }} /><span style={{ width: `${(pr.reported / Math.max(1, pr.total)) * 100}%`, background: '#e0a526' }} /></div>
        <div className="small">{pr.label}</div></div>
      <div className="row"><Link to={`/projects/${p.id}`}>Open</Link>{me.role === 'OWNER' && p.visibility !== 'OWNER_PRIVATE' && <button onClick={onRequest}>Ask for an update</button>}</div>
    </div>
  );
}

function NewProject({ onClose, act }: { onClose: () => void; act: ReturnType<typeof useAct> }) {
  const { hub, uid } = useMe();
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [member, setMember] = useState('');
  const [priv, setPriv] = useState(false);
  return (
    <Modal title="New project (practice)" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); const p = await act(() => hub.createProject(uid, { title, objective, memberUids: member ? [member] : [], visibility: priv ? 'OWNER_PRIVATE' : 'ASSIGNED_ONLY' }), 'Project created'); if (p) onClose(); }}>
        <div><label htmlFor="np-t">Title</label><input id="np-t" type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label htmlFor="np-o">Objective</label><textarea id="np-o" value={objective} onChange={(e) => setObjective(e.target.value)} /></div>
        <label style={{ fontWeight: 500 }}><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Private (employees cannot see it anywhere)</label>
        {!priv && <div><label htmlFor="np-m">Assign to</label><select id="np-m" value={member} onChange={(e) => setMember(e.target.value)}><option value="">Nobody yet</option>{hub.listUsers(uid).filter((u) => u.role === 'EMPLOYEE' && u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>}
        <div className="row"><button className="primary" type="submit" disabled={!title.trim()}>Create</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}
