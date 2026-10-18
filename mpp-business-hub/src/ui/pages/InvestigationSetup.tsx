import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Chip, type Tone } from '../common';
import { formatDateTime } from '../../domain/time';
import { SOURCE_CATALOG } from '../../domain/catalog';
import { sourceStateText } from '../../server/investigation';
import type { BusinessGoal, IntelligenceSource, SourceStatus } from '../../domain/types';

const STATE_TONE: Record<SourceStatus, Tone> = { NOT_CONNECTED: 'gray', DEMO_ONLY: 'violet', PENDING_PERMISSION: 'warn', CONNECTED: 'ok', STALE: 'warn', ERROR: 'bad', DISABLED: 'gray' };
const TIER: Record<string, string> = { A: 'Start here', B: 'Add after the first ones work', C: 'Optional and sensitive. Off unless you opt in' };
const PRIORITIES: BusinessGoal['priority'][] = ['HIGH', 'NORMAL', 'LOW'];
const PLABEL = { HIGH: 'High', NORMAL: 'Normal', LOW: 'Low' } as const;

/** One screen for what the AI investigates (priorities) and what it may read (sources). Owner only. */
export function Priorities() {
  const { hub, uid } = useMe();
  const sources = hub.listSources(uid);
  const goals = hub.listGoals(uid);
  const checks = hub.checkLibrary(uid);
  const ready = goals.filter((g) => g.enabled && hub.goalReadiness(uid, g.id).ready).length;
  return (
    <div className="stack">
      <div className="card info small" role="note">
        <strong>How this works.</strong> You choose what the AI looks into and which data it may read. Nothing is turned on for you. If a source is not connected, the AI says what is missing and does not guess. In this copy the AI runs plain rule-based checks on the data listed below. It makes no AI model call, reaches no store or account, and changes nothing outside this app.
      </div>
      <p className="muted" style={{ margin: 0 }}>{goals.filter((g) => g.enabled).length} goals are on. {ready} can run right now. {sources.filter((s) => s.approved).length} of {sources.length} sources are approved.</p>
      <GoalsSection goals={goals} sources={sources} checks={checks} />
      <SourcesSection sources={sources} />
    </div>
  );
}

function SourceChip({ s }: { s: IntelligenceSource }) { return <Chip tone={STATE_TONE[s.status ?? 'NOT_CONNECTED']}>{sourceStateText(s)}</Chip>; }

// ------------------------------------------------------------------ goals
function GoalsSection({ goals, sources, checks }: { goals: BusinessGoal[]; sources: IntelligenceSource[]; checks: ReturnType<ReturnType<typeof useMe>['hub']['checkLibrary']> }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [adding, setAdding] = useState(false);
  const groups: [string, BusinessGoal[]][] = [
    ['Your own goals', goals.filter((g) => g.custom)],
    ...(['A', 'B', 'C'] as const).map((t) => [`${t}. ${TIER[t]}`, goals.filter((g) => !g.custom && g.tier === t)] as [string, BusinessGoal[]]),
  ];
  return (
    <section className="stack" aria-labelledby="pri-h">
      <div className="row between"><h2 id="pri-h" style={{ margin: 0 }}>What the AI investigates</h2><button onClick={() => setAdding(!adding)} aria-expanded={adding}>{adding ? 'Close' : 'Add a goal'}</button></div>
      <p className="muted small" style={{ margin: 0 }}>Write any business question in plain English, pick where the AI may look and what it should check. You do not need anyone to program it.</p>
      {adding && <AddGoal sources={sources} checks={checks} onDone={() => setAdding(false)} />}
      {groups.filter(([, g]) => g.length).map(([title, list]) => (
        <div key={title} className="stack">
          <h3 style={{ margin: '.4rem 0 0' }}>{title}</h3>
          {list.map((g) => <GoalCard key={g.id} g={g} sources={sources} checks={checks} />)}
        </div>
      ))}
      <span hidden>{String(act)}{uid}{String(hub.now)}</span>
    </section>
  );
}

function GoalCard({ g, sources, checks }: { g: BusinessGoal; sources: IntelligenceSource[]; checks: ReturnType<ReturnType<typeof useMe>['hub']['checkLibrary']> }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const rd = hub.goalReadiness(uid, g.id);
  const [edit, setEdit] = useState(false);
  const [q, setQ] = useState(g.question ?? g.description);
  const [brief, setBrief] = useState<string | null>(null);
  const mine = (g.sourceIds ?? []).map((id) => sources.find((s) => s.id === id)).filter(Boolean) as IntelligenceSource[];
  const chosen = checks.filter((c) => (g.checks ?? []).includes(c.id));
  return (
    <div className="card pcard" data-goal={g.id}>
      <div className="top"><span className="name">{g.title}</span><Chip tone={g.priority === 'HIGH' ? 'bad' : 'gray'}>{PLABEL[g.priority]}</Chip>{!g.enabled ? <Chip tone="gray">Off</Chip> : rd.ready ? <Chip tone="ok">{rd.usesSample ? 'Ready (sample data)' : 'Ready'}</Chip> : <Chip tone="warn">Cannot run yet</Chip>}</div>
      <div className="small">{g.question ?? g.description}</div>
      {mine.length > 0 && <div className="meta">{mine.map((s) => <span key={s.id}>{s.name}: <SourceChip s={s} /></span>)}</div>}
      {g.enabled && !rd.ready && <div className="small warnt" role="status">{rd.noChecks && !rd.missing.length ? 'No automatic check is attached yet, so nothing is investigated. Pick a check below, or copy the brief to ask for a custom analysis.' : `Missing: ${rd.missing.join(' ')}`}</div>}
      {g.lastRunNote && <div className="small muted">{g.lastRunAt ? `${formatDateTime(g.lastRunAt)}: ` : ''}{g.lastRunNote}</div>}
      <div className="act">
        <label className="row" style={{ margin: 0, fontWeight: 500 }}><input type="checkbox" checked={g.enabled} onChange={(e) => act(() => hub.updateGoal(uid, g.id, { enabled: e.target.checked }))} /> Investigate this</label>
        <select aria-label={`Importance of ${g.title}`} value={g.priority} onChange={(e) => act(() => hub.updateGoal(uid, g.id, { priority: e.target.value as BusinessGoal['priority'] }))} style={{ width: 'auto', minHeight: 34 }}>{PRIORITIES.map((p) => <option key={p} value={p}>{PLABEL[p]}</option>)}</select>
        <button className="quiet" onClick={() => setEdit(!edit)} aria-expanded={edit}>{edit ? 'Close' : 'Edit'}</button>
      </div>
      {edit && (
        <div className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <div><label htmlFor={`q-${g.id}`}>The question</label><input id={`q-${g.id}`} type="text" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() && q !== (g.question ?? g.description) && act(() => hub.updateGoal(uid, g.id, { question: q.trim() }), 'Saved')} /></div>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}><legend className="small"><strong>Where it may look</strong></legend>
            {sources.map((s) => <label key={s.id} className="row" style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" checked={(g.sourceIds ?? []).includes(s.id)} onChange={(e) => act(() => hub.updateGoal(uid, g.id, { sourceIds: e.target.checked ? [...(g.sourceIds ?? []), s.id] : (g.sourceIds ?? []).filter((x) => x !== s.id) }))} /> {s.name} <SourceChip s={s} /></label>)}
          </fieldset>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}><legend className="small"><strong>What it checks</strong></legend>
            {checks.map((c) => <label key={c.id} className="row" style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" checked={(g.checks ?? []).includes(c.id)} onChange={(e) => act(() => hub.updateGoal(uid, g.id, { checks: e.target.checked ? [...(g.checks ?? []), c.id] : (g.checks ?? []).filter((x) => x !== c.id), params: { ...(g.params ?? {}), ...Object.fromEntries(Object.entries(c.params).map(([k, v]) => [k, g.params?.[k] ?? v.value])) } }))} /> <span><strong>{c.name}.</strong> <span className="muted">{c.what} Reads: {c.sourceCatalogIds.join(' + ')}.</span></span></label>)}
          </fieldset>
          {chosen.flatMap((c) => Object.entries(c.params)).map(([k, v]) => <div key={k}><label htmlFor={`p-${g.id}-${k}`}>{v.label}</label><input id={`p-${g.id}-${k}`} type="number" min={0} style={{ maxWidth: 120 }} value={g.params?.[k] ?? v.value} onChange={(e) => act(() => hub.updateGoal(uid, g.id, { params: { ...(g.params ?? {}), [k]: Number(e.target.value) } }))} /></div>)}
          <div className="row"><button onClick={() => setBrief(hub.goalBrief(uid, g.id))}>Show the brief</button>{g.custom && <button className="quiet" onClick={() => act(() => hub.removeGoal(uid, g.id), 'Goal removed')}>Remove this goal</button>}</div>
          {brief && <pre className="card small" style={{ whiteSpace: 'pre-wrap', margin: 0 }} aria-label="Investigation brief">{brief}</pre>}
          {g.evidenceNeeded && <p className="small muted" style={{ margin: 0 }}><strong>Evidence needed:</strong> {g.evidenceNeeded}{g.projectExamples?.length ? ` Project ideas: ${g.projectExamples.join('; ')}.` : ''}{g.safety ? ` Safety: ${g.safety}` : ''}</p>}
        </div>
      )}
    </div>
  );
}

function AddGoal({ sources, checks, onDone }: { sources: IntelligenceSource[]; checks: ReturnType<ReturnType<typeof useMe>['hub']['checkLibrary']>; onDone: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [t, setT] = useState(''); const [q, setQ] = useState(''); const [p, setP] = useState<BusinessGoal['priority']>('NORMAL');
  const [sel, setSel] = useState<string[]>([]); const [chk, setChk] = useState<string[]>([]);
  const tog = (arr: string[], set: (v: string[]) => void, id: string) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const relevant = checks.filter((c) => c.sourceCatalogIds.some((cat) => sources.some((s) => sel.includes(s.id) && s.catalogId === cat)) || !sel.length);
  return (
    <form className="card stack" onSubmit={async (e) => { e.preventDefault(); const r = await act(() => hub.addInvestigationGoal(uid, { title: t, question: q || t, priority: p, sourceIds: sel, checks: chk }), 'Goal added'); if (r) onDone(); }}>
      <div><label htmlFor="ng-t">Goal, in a few words</label><input id="ng-t" type="text" value={t} onChange={(e) => setT(e.target.value)} placeholder="Example: Which seasonal bundles could raise profit?" /></div>
      <div><label htmlFor="ng-q">The question, in your own words (optional)</label><input id="ng-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Which seasonal bundles could increase contribution profit without extra production complexity?" /></div>
      <label className="row" style={{ margin: 0 }}>How important <select value={p} onChange={(e) => setP(e.target.value as typeof p)} style={{ width: 'auto' }}>{PRIORITIES.map((x) => <option key={x} value={x}>{PLABEL[x]}</option>)}</select></label>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}><legend className="small"><strong>Where may it look?</strong> A source that is not connected is allowed here, but the goal waits until it is.</legend>
        {sources.map((s) => <label key={s.id} className="row" style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" checked={sel.includes(s.id)} onChange={() => tog(sel, setSel, s.id)} /> {s.name} <SourceChip s={s} /></label>)}
      </fieldset>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}><legend className="small"><strong>What should it check?</strong> If nothing fits, leave all empty. The goal is saved as a brief and invents nothing.</legend>
        {relevant.map((c) => <label key={c.id} className="row" style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" checked={chk.includes(c.id)} onChange={() => tog(chk, setChk, c.id)} /> <span><strong>{c.name}.</strong> <span className="muted">{c.what}</span></span></label>)}
      </fieldset>
      <div className="row"><button className="primary" type="submit" disabled={!t.trim()}>Add goal</button><button type="button" className="quiet" onClick={onDone}>Cancel</button></div>
    </form>
  );
}

// ------------------------------------------------------------------ sources
function SourcesSection({ sources }: { sources: IntelligenceSource[] }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [adding, setAdding] = useState(false);
  const o = hub.intakeOverview(uid);
  const groups: [string, IntelligenceSource[]][] = [
    ...(['A', 'B', 'C'] as const).map((t) => [`${t}. ${TIER[t]}`, sources.filter((s) => !s.custom && s.tier === t)] as [string, IntelligenceSource[]]),
    ['Your own sources', sources.filter((s) => s.custom)],
  ];
  return (
    <section className="stack" aria-labelledby="src-h">
      <div className="row between"><h2 id="src-h" style={{ margin: 0 }}>Data the AI may use</h2><button onClick={() => setAdding(!adding)} aria-expanded={adding}>{adding ? 'Close' : 'Add a source'}</button></div>
      <p className="muted small" style={{ margin: 0 }}>Approve each source one at a time. Approving records your permission. It does not connect anything. Read-only access or an export you approve comes first.</p>
      {adding && <AddSource onDone={() => setAdding(false)} />}
      {groups.filter(([, l]) => l.length).map(([title, list]) => (
        <div key={title} className="stack"><h3 style={{ margin: '.4rem 0 0' }}>{title}</h3>{list.map((s) => <SourceCard key={s.id} s={s} />)}</div>
      ))}
      <div className="card"><h3 style={{ marginTop: 0 }}>AI cost and health</h3><p style={{ margin: 0 }}>This month: <strong>${o.monthSpendUsd.toFixed(2)}</strong> of ${o.budget}. This copy spends nothing. <Link to="/owner/data-intake">See computer activity and runs</Link></p></div>
      <span hidden>{String(act)}</span>
    </section>
  );
}

function SourceCard({ s }: { s: IntelligenceSource }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ scope: s.scope ?? '', allowed: s.allowed, excluded: s.excluded ?? '', retention: s.retention ?? '', cadence: s.cadence });
  const save = (patch: Partial<typeof f>) => act(() => hub.updateSource(uid, s.id, patch), 'Saved');
  const cat = SOURCE_CATALOG.find((c) => c.id === s.catalogId);
  const kindText = s.dataKind === 'SYNTHETIC' ? 'Made-up sample data' : s.dataKind === 'REAL_SNAPSHOT' ? 'One-time copy of real data' : 'No data in this copy';
  return (
    <div className="card pcard" data-source={s.id}>
      <div className="top"><span className="name">{s.catalogId ? `${s.catalogId}. ` : ''}{s.name}</span><SourceChip s={s} />{s.sensitivity === 'OWNER_ONLY' && <Chip tone="violet">Owner only</Chip>}{s.visibility === 'WORKER_SAFE' && <Chip tone="gray">Worker-safe</Chip>}</div>
      {s.purpose && <div className="small">{s.purpose}</div>}
      <div className="meta"><span>Data here: {kindText}</span><span>Covers: {s.coverage ?? '—'}</span><span>Delay: {s.lag ?? '—'}</span>{s.lastCheckedAt && <span>Last read {formatDateTime(s.lastCheckedAt)}</span>}<span>How often: {s.cadence}</span><span>Cost: {s.costNote ?? '—'}</span></div>
      <div className="small muted">{s.note}</div>
      <div className="act">
        <label className="row" style={{ margin: 0, fontWeight: 500 }}><input type="checkbox" checked={!!s.approved} onChange={(e) => act(() => hub.setSourceApproval(uid, s.id, e.target.checked), e.target.checked ? 'Approved. Nothing was connected.' : 'Paused')} /> {s.approved ? 'Approved for the AI to read' : 'Let the AI read this'}</label>
        <button className="quiet" onClick={() => setEdit(!edit)} aria-expanded={edit}>{edit ? 'Close' : 'Details and limits'}</button>
        {s.custom && <button className="quiet" onClick={() => act(() => hub.removeSource(uid, s.id), 'Source removed')}>Remove</button>}
      </div>
      {edit && (
        <div className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          {([['scope', 'Exact account, folder or files it may read'], ['allowed', 'What it may read'], ['excluded', 'What is left out'], ['retention', 'How long it is kept'], ['cadence', 'How often']] as const).map(([k, l]) => (
            <div key={k}><label htmlFor={`${s.id}-${k}`}>{l}</label><input id={`${s.id}-${k}`} type="text" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} onBlur={() => f[k] !== (k === 'scope' ? s.scope : k === 'allowed' ? s.allowed : k === 'excluded' ? s.excluded : k === 'retention' ? s.retention : s.cadence) && save({ [k]: f[k] })} /></div>))}
          {s.missing && !sourceUsable(s) && <p className="small warnt" style={{ margin: 0 }}><strong>What is missing:</strong> {s.missing}</p>}
          {s.safety && <p className="small muted" style={{ margin: 0 }}><strong>Safety:</strong> {s.safety}</p>}
          {cat && <div className="small"><strong>Questions this source can help answer</strong><ul style={{ margin: '4px 0 0', paddingLeft: '1.1rem' }}>{cat.examples.map((x) => <li key={x}>{x} <button className="link" onClick={() => act(() => hub.addInvestigationGoal(uid, { title: x.replace(/\?$/, ''), question: x, priority: cat.priority, sourceIds: [s.id], checks: [] }), 'Added as a goal. It waits until a check is chosen.')}>Use as a goal</button></li>)}</ul></div>}
        </div>
      )}
    </div>
  );
}
const sourceUsable = (s: IntelligenceSource) => !!s.approved && (s.dataKind ?? 'NONE') !== 'NONE' && ['DEMO_ONLY', 'CONNECTED', 'STALE'].includes(s.status ?? '');

function AddSource({ onDone }: { onDone: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [v, setV] = useState({ name: '', purpose: '', scope: '', allowed: '' });
  return (
    <form className="card stack" onSubmit={async (e) => { e.preventDefault(); const r = await act(() => hub.addSource(uid, v), 'Source added. Nothing is connected.'); if (r) onDone(); }}>
      {([['name', 'Name'], ['purpose', 'What it would help you find'], ['scope', 'Exact account, folder or files'], ['allowed', 'What it may read']] as const).map(([k, l]) => <div key={k}><label htmlFor={`as-${k}`}>{l}</label><input id={`as-${k}`} type="text" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>)}
      <p className="small muted" style={{ margin: 0 }}>A new source starts as “Not connected”. The app needs a read-only way to get its data before the AI can use it.</p>
      <div className="row"><button className="primary" type="submit" disabled={!v.name.trim()}>Add source</button><button type="button" className="quiet" onClick={onDone}>Cancel</button></div>
    </form>
  );
}
