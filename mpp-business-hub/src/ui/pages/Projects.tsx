import { useEffect, useMemo, useState } from 'react';
import { ProjectInfo } from '../projectRef';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Chip, Empty, Modal, ProjectStatusChip } from '../common';
import { RequestUpdateDialog } from '../dialogs';
import { ResumeDialog } from '../pauseUi';
import { pilotSummaryLine } from '../pauseUi';
import { deadlineInfo, nextStep, pauseLine, progressCounts, projectWorkStatus } from '../../domain/projectStatus';
import { formatDate, formatDateTime } from '../../domain/time';
import type { Project, ProjectWorkStatus, Step } from '../../domain/types';

type View = 'list' | 'board';
type Sort = 'suggested' | 'due' | 'updated' | 'priority' | 'name' | 'left';
type Scope = 'all' | 'mine' | 'byPerson';
interface Prefs { view: View; sort: Sort; scope: Scope }
const DEFAULT: Prefs = { view: 'list', sort: 'suggested', scope: 'all' };

/** Each person keeps their own layout. Stored in this browser only; the page works without it. */
function usePrefs(uid: string): [Prefs, (p: Partial<Prefs>) => void] {
  const key = `mpp-hub-prefs-${uid}`;
  const [prefs, set] = useState<Prefs>(() => { try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(key) ?? '{}') }; } catch { return DEFAULT; } });
  useEffect(() => { try { set({ ...DEFAULT, ...JSON.parse(localStorage.getItem(key) ?? '{}') }); } catch { set(DEFAULT); } }, [key]);
  return [prefs, (p) => set((cur) => { const n = { ...cur, ...p }; try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* ignore */ } return n; })];
}

const SORTS: { id: Sort; label: string }[] = [
  { id: 'suggested', label: 'Suggested order' }, { id: 'due', label: 'Due soonest' }, { id: 'updated', label: 'Last change' }, { id: 'priority', label: 'Priority' }, { id: 'name', label: 'Name, A to Z' }, { id: 'left', label: 'Where I left off' },
];
const PRI = { HIGH: 0, NORMAL: 1, LOW: 2 } as const;

interface Row { p: Project; steps: Step[]; status: ProjectWorkStatus; attention: string | null; next: Step | null; needsResponse: boolean; verifyPending: boolean; last: { at: string; stepId: string | null; text: string } | null }

export function Projects() {
  const { hub, uid, me } = useMe();
  const [sp, setSp] = useSearchParams();
  const [prefs, setPrefs] = usePrefs(uid);
  const [q, setQ] = useState('');
  const [assignee, setAssignee] = useState('');
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState('');
  const [needsReq, setNeedsReq] = useState(false);
  const [needsCheck, setNeedsCheck] = useState(false);
  const [adding, setAdding] = useState(false);
  const [reqFor, setReqFor] = useState<string | null>(null);
  const [resumeFor, setResumeFor] = useState<Project | null>(null);
  const owner = me.role === 'OWNER';
  const mineOnly = sp.get('mine') === '1';

  const attentionByProject = useMemo(() => {
    const m = new Map<string, string>();
    if (!owner) return m;
    for (const item of hub.ownerOverview(uid).queue) { const mt = item.link.match(/^\/projects\/([^/?]+)/); if (mt && !m.has(mt[1])) m.set(mt[1], item.chip); }
    return m;
  }, [hub, uid, owner, hub.getVersion()]);
  const myCards = hub.outstandingCards(uid);

  const rows: Row[] = hub.listProjects(uid).map((p) => {
    const steps = hub.projectSteps(uid, p.id);
    const hasReq = myCards.some((c) => c.cardType === 'OWNER_REQUEST' && c.projectId === p.id) || (owner && hub.state.updateRequests.some((r) => r.projectId === p.id && ['OPEN', 'PARTIALLY_RESPONDED'].includes(r.state)));
    const attention = owner ? attentionByProject.get(p.id) ?? (p.origin === 'AI_RECOMMENDATION' && !p.memberUids.length && !p.closedAt ? 'Choose who works on it' : null) : (myCards.some((c) => c.projectId === p.id && c.cardType === 'OWNER_REQUEST') ? 'Needs a response' : null);
    return { p, steps, status: projectWorkStatus(p, steps), attention, next: nextStep(steps, p), last: hub.lastConfirmed(uid, p.id), needsResponse: hasReq, verifyPending: steps.some((s) => s.status === 'REPORTED_COMPLETE' && s.impact === 'HIGH' && !s.verifications.some((v) => v.result === 'CONFIRMED')) };
  });

  const today = hub.now;
  const filtered = rows.filter((r) => {
    if (q && !`${r.p.key} ${r.p.title} ${r.steps.map((s) => s.title).join(' ')}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (assignee && !(assignee === 'none' ? !r.p.memberUids.length : r.p.memberUids.includes(assignee))) return false;
    if (status && r.status !== status) return false;
    if (priority && r.p.priority !== priority) return false;
    if (needsReq && !r.needsResponse) return false;
    if (needsCheck && !r.verifyPending) return false;
    if (due === 'overdue' && !(r.p.deadlineAt && r.p.deadlineAt < today && !r.p.pause?.isPaused)) return false;
    if (due === 'week' && !(r.p.deadlineAt && r.p.deadlineAt >= today && r.p.deadlineAt < new Date(new Date(today).getTime() + 7 * 864e5).toISOString())) return false;
    if ((prefs.scope === 'mine' || mineOnly) && owner && !(r.p.visibility === 'OWNER_PRIVATE' || r.steps.some((s) => s.assignedUids.includes(uid)))) return false;
    return true;
  });

  const cmp = (a: Row, b: Row): number => {
    const byKey = a.p.key.localeCompare(b.p.key);
    switch (prefs.sort) {
      case 'due': return (a.p.deadlineAt ?? '9').localeCompare(b.p.deadlineAt ?? '9') || byKey;
      case 'updated': return b.p.updatedAt.localeCompare(a.p.updatedAt) || byKey;
      case 'priority': return PRI[a.p.priority] - PRI[b.p.priority] || (a.p.deadlineAt ?? '9').localeCompare(b.p.deadlineAt ?? '9') || byKey;
      case 'name': return a.p.title.localeCompare(b.p.title) || byKey;
      case 'left': return (b.last?.at ?? '').localeCompare(a.last?.at ?? '') || byKey;
      default: // Suggested: pinned, then needs a response, then due soonest, then priority, then last update. Stable tie-break by number.
        return Number(b.p.pinned) - Number(a.p.pinned) || Number(!!b.attention) - Number(!!a.attention) || (a.p.deadlineAt ?? '9').localeCompare(b.p.deadlineAt ?? '9') || PRI[a.p.priority] - PRI[b.p.priority] || b.p.updatedAt.localeCompare(a.p.updatedAt) || byKey;
    }
  };

  const pausedOrder = (a: Row, b: Row) => {
    // Imminent resume date or review first, then most recently paused.
    const ad = a.p.pause?.resumeDateLocal ?? '9999', bd = b.p.pause?.resumeDateLocal ?? '9999';
    return ad.localeCompare(bd) || (b.p.pause?.pausedAt ?? '').localeCompare(a.p.pause?.pausedAt ?? '');
  };

  const groups: { id: string; title: string; hint?: string; rows: Row[]; collapsed?: boolean }[] = (() => {
    if (owner && prefs.scope === 'byPerson') {
      const people = hub.listUsers(uid).filter((u) => u.role === 'EMPLOYEE');
      const g = people.map((u) => ({ id: u.id, title: u.name, rows: filtered.filter((r) => r.p.memberUids.includes(u.id)).sort(cmp) })).filter((x) => x.rows.length);
      const un = filtered.filter((r) => !r.p.memberUids.length).sort(cmp);
      return [...g, ...(un.length ? [{ id: 'none', title: 'Nobody assigned', rows: un }] : [])];
    }
    const attention = filtered.filter((r) => r.attention && !['COMPLETED', 'CANCELED'].includes(r.status)).sort(cmp);
    const rest = filtered.filter((r) => !attention.includes(r));
    return [
      { id: 'attn', title: owner ? 'Needs your attention' : 'Needs a response', hint: owner ? 'Replies, decisions and problems. This is a view, not a status.' : 'Dalia asked for an update.', rows: attention },
      { id: 'prog', title: 'In progress', rows: rest.filter((r) => r.status === 'IN_PROGRESS').sort(cmp) },
      { id: 'soon', title: 'Not started / Coming up', rows: rest.filter((r) => r.status === 'NOT_STARTED').sort(cmp) },
      { id: 'paused', title: 'Paused', rows: rest.filter((r) => r.status === 'PAUSED').sort(pausedOrder) },
      { id: 'done', title: 'Completed / Canceled', rows: rest.filter((r) => ['COMPLETED', 'CANCELED'].includes(r.status)).sort(cmp), collapsed: true },
    ].filter((g) => g.rows.length || g.id === 'prog');
  })();
  const pc = hub.projectCounts(uid);

  return (
    <div className="stack">
      <div className="row between">
        <div><h1>Projects</h1>
          <p className="muted" style={{ margin: 0 }}>{pc.team} team project{pc.team === 1 ? '' : 's'} active{owner ? ` · ${pc.private} private` : ''} · {pc.paused} paused</p></div>
        {owner && <button className="primary" onClick={() => setAdding(true)}>New project</button>}
      </div>

      <div className="row">
        <input type="search" aria-label="Search projects" placeholder="Search by name, number, step or file…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
        <div className="row" role="group" aria-label="View">
          <button className="pill-btn" aria-pressed={prefs.view === 'list'} onClick={() => setPrefs({ view: 'list' })}>List</button>
          <button className="pill-btn" aria-pressed={prefs.view === 'board'} onClick={() => setPrefs({ view: 'board' })}>Board</button>
        </div>
        {owner && (
          <div className="row" role="group" aria-label="Whose projects">
            {(['all', 'mine', 'byPerson'] as Scope[]).map((s) => <button key={s} className="pill-btn" aria-pressed={prefs.scope === s} onClick={() => { setPrefs({ scope: s }); if (mineOnly) setSp({}); }}>{s === 'all' ? 'All' : s === 'mine' ? 'Mine' : 'By employee'}</button>)}
          </div>
        )}
        <label className="row" style={{ margin: 0, fontWeight: 500 }}>Sort by
          <select aria-label="Sort by" value={prefs.sort} title="Suggested order shows work that needs a response first, then upcoming deadlines and priority." style={{ width: 'auto' }} onChange={(e) => setPrefs({ sort: e.target.value as Sort })}>{SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
      </div>
      <details className="small"><summary>More filters</summary>
        <div className="row" style={{ marginTop: 8 }}>
          {owner && <select aria-label="Assigned to" style={{ width: 'auto' }} value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Assigned to: anyone</option>{hub.listUsers(uid).filter((u) => u.role === 'EMPLOYEE').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}<option value="none">Nobody</option></select>}
          <select aria-label="Status" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Status: any</option><option value="NOT_STARTED">Not started</option><option value="IN_PROGRESS">In progress</option><option value="PAUSED">Paused</option><option value="COMPLETED">Completed</option><option value="CANCELED">Canceled</option></select>
          <select aria-label="Due date" style={{ width: 'auto' }} value={due} onChange={(e) => setDue(e.target.value)}><option value="">Due: any time</option><option value="week">Due in the next 7 days</option><option value="overdue">Past due</option></select>
          <select aria-label="Priority" style={{ width: 'auto' }} value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">Priority: any</option><option value="HIGH">High</option><option value="NORMAL">Normal</option><option value="LOW">Low</option></select>
          <label className="row" style={{ margin: 0, fontWeight: 500 }}><input type="checkbox" checked={needsReq} onChange={(e) => setNeedsReq(e.target.checked)} /> Waiting for an update</label>
          <label className="row" style={{ margin: 0, fontWeight: 500 }}><input type="checkbox" checked={needsCheck} onChange={(e) => setNeedsCheck(e.target.checked)} /> Needs a check in the source system</label>
          <button className="link" onClick={() => { setQ(''); setAssignee(''); setStatus(''); setDue(''); setPriority(''); setNeedsReq(false); setNeedsCheck(false); setSp({}); }}>Clear filters</button>
        </div>
      </details>

      {filtered.length === 0 && <Empty>No projects match. Try clearing the filters.</Empty>}

      {prefs.view === 'list' ? groups.map((g) => (
        <section key={g.id} aria-label={g.title}>
          {g.collapsed ? (
            <details><summary className="group-title" style={{ cursor: 'pointer' }}>{g.title} <span className="count">{g.rows.length}</span></summary>
              <div className="stack">{g.rows.map((r) => <PCard key={r.p.id} r={r} onAsk={setReqFor} onResume={setResumeFor} />)}</div></details>
          ) : (
            <>
              <h2 className="group-title">{g.title} <span className="count">{g.rows.length}</span></h2>
              {g.hint && <p className="small muted" style={{ margin: '-.3rem 0 .5rem' }}>{g.hint}</p>}
              {g.rows.length === 0 ? <p className="muted small">Nothing here right now.</p> : <div className="stack">{g.rows.map((r) => <PCard key={r.p.id} r={r} onAsk={setReqFor} onResume={setResumeFor} />)}</div>}
            </>
          )}
        </section>
      )) : (
        <div className="board">
          {([['Not started', 'NOT_STARTED'], ['In progress', 'IN_PROGRESS'], ['Paused', 'PAUSED'], ['Completed / Canceled', 'DONE']] as const).map(([title, st]) => {
            const col = filtered.filter((r) => (st === 'DONE' ? ['COMPLETED', 'CANCELED'].includes(r.status) : r.status === st)).sort(st === 'PAUSED' ? pausedOrder : cmp);
            return <div key={st} className="col"><h3>{title} <span className="count">{col.length}</span></h3><div className="stack">{col.map((r) => <PCard key={r.p.id} r={r} compact onAsk={setReqFor} onResume={setResumeFor} />)}{!col.length && <p className="small muted">None.</p>}</div></div>;
          })}
        </div>
      )}

      {adding && <NewProject onClose={() => setAdding(false)} />}
      {reqFor && <RequestUpdateDialog projectId={reqFor} onClose={() => setReqFor(null)} />}
      {resumeFor && <ResumeDialog project={resumeFor} onClose={() => setResumeFor(null)} />}
    </div>
  );
}

export function PCard({ r, compact, mostRecent, onAsk, onResume }: { r: { p: Project; steps: Step[]; status: ProjectWorkStatus; attention: string | null; next: Step | null; last?: { at: string; stepId: string | null; text: string } | null }; compact?: boolean; mostRecent?: boolean; onAsk: (id: string) => void; onResume: (p: Project) => void }) {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const nav = useNavigate();
  const { p, steps, status, attention, next } = r;
  const owner = me.role === 'OWNER';
  const pr = progressCounts(steps);
  const di = deadlineInfo(p, hub.now);
  const pilot = pilotSummaryLine(p);
  const people = p.memberUids.map((m) => hub.userName(m)).join(', ') || (p.visibility === 'OWNER_PRIVATE' ? 'Only Dalia' : 'Nobody yet');
  // Only three situations get a button on the row. Everything else: the whole row opens the project.
  let action: { label: string; go: () => void; primary?: boolean } | null = null;
  if (status === 'PAUSED' && owner && hub.canControlProject(uid, p.id)) action = { label: 'Resume project', go: () => onResume(p) };
  else if (owner && p.origin === 'AI_RECOMMENDATION' && !p.memberUids.length && !p.closedAt) action = { label: 'Choose who works on it', go: () => nav(`/projects/${p.id}?assign=1`), primary: true };
  else if (!owner && attention === 'Needs a response') action = { label: 'Answer Dalia', go: () => nav('/review'), primary: true };
  void act; void onAsk;
  const labels = hub.stepLabelsFor(uid, p.id);
  const nextText = next && status !== 'COMPLETED' && status !== 'CANCELED' ? `${status === 'PAUSED' ? 'Next when resumed' : 'Next'}: Step ${labels.get(next.id)} “${next.title.length > 70 ? next.title.slice(0, 68) + '…' : next.title}”` : null;
  const when = status === 'PAUSED' ? pauseLine(p, owner) : di ? (compact && p.deadlineAt ? `Due ${formatDate(p.deadlineAt)}` : di.text) : null;
  return (
    <article className="prow" aria-label={`${p.key} ${p.title}`}>
      <Link to={`/projects/${p.id}`} className="main">
        <span className="t">{p.key} — {p.title}{p.pinned && <span title="Pinned" aria-label="Pinned"> 📌</span>}</span>
        {nextText && !compact && <span className="s">{nextText}</span>}
        <span className="m">{[people, when, pr.label, pilot].filter(Boolean).join(' · ')}</span>
        {r.last && !compact && <span className="s small" style={{ color: 'var(--muted)' }}>{mostRecent && <Chip tone="info">Most recent</Chip>} Last confirmed activity: {formatDateTime(r.last.at)} · {r.last.text}</span>}
      </Link>
      <span className="end">
        <ProjectInfo projectId={p.id} label={p.key} />
        {status !== 'IN_PROGRESS' && <ProjectStatusChip status={status} />}
        {attention && status !== 'PAUSED' && <Chip tone="pink" glyph="!">{attention}</Chip>}
        {p.visibility === 'OWNER_PRIVATE' && <Chip tone="violet" glyph="🔒">Only Dalia</Chip>}
        {action && <button className={action.primary ? 'primary' : ''} onClick={action.go}>{action.label}</button>}
      </span>
    </article>
  );
}

function NewProject({ onClose }: { onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [member, setMember] = useState('');
  const [priv, setPriv] = useState(false);
  return (
    <Modal title="New project" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); const p = await act(() => hub.createProject(uid, { title, objective, memberUids: member ? [member] : [], visibility: priv ? 'OWNER_PRIVATE' : 'ASSIGNED_ONLY' }), 'Project created'); if (p) onClose(); }}>
        <div><label htmlFor="np-t">Project name</label><input id="np-t" type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label htmlFor="np-o">What is the goal?</label><textarea id="np-o" value={objective} onChange={(e) => setObjective(e.target.value)} /></div>
        <label style={{ fontWeight: 500 }}><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Private. Only you can see it.</label>
        {!priv && <div><label htmlFor="np-m">Who works on it?</label><select id="np-m" value={member} onChange={(e) => setMember(e.target.value)}><option value="">Nobody yet</option>{hub.listUsers(uid).filter((u) => u.role === 'EMPLOYEE' && u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>}
        <div className="row"><button className="primary" type="submit" disabled={!title.trim()}>Create project</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}
