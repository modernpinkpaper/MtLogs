import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { newKey, useAct, useMe } from '../hubContext';
import { Chip, Empty, Modal, Tabs, type Tone } from '../common';
import { RequestUpdateDialog } from '../dialogs';
import { Priorities } from './InvestigationSetup';
import { formatDateTime, formatLocalDate, chicagoDate } from '../../domain/time';
import { confidenceOf, classifyWebSource } from '../../server/finance';
import type { FactLabel, FindingEvidence, ModelVar, OwnerFinding, PlanStepDraft } from '../../domain/types';

type Tab = 'inbox' | 'priorities' | 'results';
const URG: Record<string, [string, Tone]> = { URGENT: ['Urgent', 'bad'], NORMAL: ['Normal', 'gray'], STRATEGIC: ['Longer term', 'violet'] };
const FACT: Record<FactLabel, [string, Tone, string]> = {
  CONFIRMED_SOURCE_FACT: ['Confirmed from a source', 'ok', 'A source we trust shows this.'],
  LIKELY_INFERENCE: ['Likely', 'info', 'A reasonable guess from the facts we have. Not proven.'],
  HYPOTHESIS: ['An idea to test', 'warn', 'A possible explanation. We have no proof yet.'],
  UNKNOWN: ['Not known', 'gray', 'We do not have enough facts.'],
};
const STATUS_LABEL: Record<OwnerFinding['status'], string> = { NEW: 'New', INVESTIGATING: 'Looking into it', APPROVED: 'Made into a project', LINKED: 'Linked to a project', SNOOZED: 'Snoozed', DISMISSED: 'Dismissed', ARCHIVED: 'Archived', INFORMATIONAL: 'Kept as information' };
const money = (n: number | null | undefined, d = 0) => (n == null ? '—' : `$${n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })}`);

/** AI Recommendations (owner only). Things the AI found, in plain words, waiting for Dalia’s decision. */
export function OwnerAI() {
  const { hub, uid } = useMe();
  const act = useAct();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const rawTab = sp.get('tab');
  const tab: Tab = rawTab === 'goals' || rawTab === 'sources' ? 'priorities' : (rawTab as Tab) || 'inbox';
  const [view, setView] = useState<'decision' | 'approved' | 'snoozed' | 'done' | 'all'>('decision');
  const [q, setQ] = useState('');
  const [area, setArea] = useState('');
  const [urgency, setUrgency] = useState('');
  const sum = hub.inboxSummary(uid);
  const list = hub.listFindings(uid, { view, q, area: area || undefined, urgency: urgency || undefined });
  const areas = [...new Set(hub.state.ownerFindings.map((f) => f.area))];
  const [lastScan, setLastScan] = useState<string | null>(null);

  return (
    <div className="stack">
      <div className="row between">
        <div><h1>AI Recommendations</h1><p className="muted" style={{ margin: 0 }}>Things the AI found that may need your decision. Nothing becomes a project or an assignment unless you choose it. Only you can see this.</p></div>
        <button onClick={async () => { const r = await act(() => hub.runAiScan(uid)); if (r) setLastScan(`Investigation finished. ${r.created.length} new, ${r.updated.length} seen again. Only approved sources were used. Goals that could not run are listed under Priorities and sources.`); }}>Investigate now</button>
      </div>
      {lastScan && <div className="card info small" role="status">{lastScan}</div>}
      <Tabs<Tab> tabs={[{ id: 'inbox', label: `Recommendations (${sum.needsDecision})` }, { id: 'priorities', label: 'Priorities and sources' }, { id: 'results', label: 'Results tracker' }]} value={tab} onChange={(t) => setSp({ tab: t })} />

      {tab === 'inbox' && (
        <>
          <div className="tiles">
            {([[sum.needsDecision, 'Need your decision', true], [sum.urgent, 'Urgent', false], [sum.newSinceLastLook, 'New since you last looked', false], [sum.investigating, 'Being looked into', false], [sum.approvedUnassigned, 'Approved, nobody assigned', false], [sum.followUps, 'Follow-ups due', false]] as [number, string, boolean][])
              .filter(([n, , always]) => always || n > 0)
              .map(([n, t]) => <div key={t} className="tile"><div className="n">{n}</div><div className="t">{t}</div></div>)}
          </div>
          <p className="small muted" style={{ margin: 0 }}>{sum.freshness.lastScanAt ? `Last scan ${formatDateTime(sum.freshness.lastScanAt)}. ` : 'No scan has run yet. '}{sum.freshness.coverageNote} <button className="link" onClick={() => hub.markFindingsSeen(uid)}>Mark all as seen</button></p>
          {sum.unassignedProjects.length > 0 && <div className="banner warn">{sum.unassignedProjects.map((p) => <div key={p.id}><strong>{p.key} “{p.title}”</strong> is approved but nobody is assigned. <Link to={`/projects/${p.id}?assign=1`}>Choose who works on it</Link></div>)}</div>}
          <div className="row">
            <input type="search" aria-label="Search recommendations" placeholder="Search recommendations…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
            <div className="row" role="group" aria-label="Show">
              {([['decision', 'Needs a decision'], ['approved', 'Approved'], ['snoozed', 'Snoozed'], ['done', 'Dismissed or archived'], ['all', 'Everything']] as const).map(([k, l]) => <button key={k} className="pill-btn" aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>)}
            </div>
            <details className="small"><summary>More filters</summary><div className="row" style={{ marginTop: 6 }}>
              <select aria-label="Area" style={{ width: 'auto' }} value={area} onChange={(e) => setArea(e.target.value)}><option value="">Area: any</option>{areas.map((a) => <option key={a}>{a}</option>)}</select>
              <select aria-label="How urgent" style={{ width: 'auto' }} value={urgency} onChange={(e) => setUrgency(e.target.value)}><option value="">How urgent: any</option><option value="URGENT">Urgent</option><option value="NORMAL">Normal</option><option value="STRATEGIC">Longer term</option></select></div></details>
          </div>
          {list.length === 0 && <Empty>Nothing here. Try “Everything”, or choose what to investigate under Priorities and sources.</Empty>}
          <div className="card list">
            {list.map((f) => (
              <Link key={f.id} to={`/owner/ai/${f.id}`} className="lrow" aria-label={f.title}>
                <span className="t">{!f.seenByOwner && <i className="newdot" aria-label="New" />}{f.title}</span>
                <span className="s">{f.summary}</span>
                <span className="m">
                  {f.urgency !== 'NORMAL' && <Chip tone={URG[f.urgency][1]}>{URG[f.urgency][0]}</Chip>}
                  {f.isSample && <Chip tone="violet" title="Made-up sample data. Not a real analysis.">Sample finding</Chip>}
                  {f.bucket && <Chip tone="info">{f.bucket}</Chip>}
                  <span>{f.area} · {f.kind}</span>
                  {f.status !== 'NEW' && <span>· {STATUS_LABEL[f.status]}</span>}
                  {f.projectMatch.type === 'ALREADY_COVERED' && <span className="okt">· Already covered by {f.projectMatch.projectKey}</span>}
                  {f.projectMatch.type === 'POSSIBLE_DUPLICATE' && <span className="warnt">· May overlap with {f.projectMatch.projectKey}</span>}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
      {tab === 'priorities' && <Priorities />}
      {tab === 'results' && <Results />}
    </div>
  );
}

// ------------------------------------------------------------------ one recommendation
export function FindingDetail() {
  const { id = '' } = useParams();
  const { hub, uid } = useMe();
  const act = useAct();
  const nav = useNavigate();
  let f: OwnerFinding;
  try { f = hub.getFinding(uid, id); } catch { return <div className="card bad" role="alert"><h1>We could not find that</h1><Link to="/owner/ai">Back to recommendations</Link></div>; }
  const [dlg, setDlg] = useState<null | 'approve' | 'link' | 'snooze' | 'dismiss' | 'ask'>(null);
  const [choices, setChoices] = useState(false);
  const m = hub.findingModel(uid, f.id);
  const open = ['NEW', 'INVESTIGATING'].includes(f.status);
  const projects = hub.listProjects(uid).filter((p) => p.visibility !== 'OWNER_PRIVATE');

  return (
    <div className="stack">
      <nav className="small muted" aria-label="Breadcrumb"><Link to="/owner/ai">AI Recommendations</Link> › {f.code}</nav>
      <header className="card focal stack">
        <div className="row" style={{ gap: '.4rem' }}>
          <span className="eyebrow">{f.code} · {f.kind} · {f.area}</span>
          {f.urgency !== 'NORMAL' && <Chip tone={URG[f.urgency][1]}>{URG[f.urgency][0]}</Chip>}
          <Chip tone={FACT[f.factLabel][1]} title={FACT[f.factLabel][2]}>{FACT[f.factLabel][0]}</Chip>
          {f.status !== 'NEW' && <Chip tone="info">{STATUS_LABEL[f.status]}{f.status === 'SNOOZED' && f.snoozedUntil ? ` until ${formatLocalDate(chicagoDate(f.snoozedUntil))}` : ''}</Chip>}
        </div>
        <h1>{f.title}</h1>
        <p className="lead" style={{ margin: 0 }}>{f.summary}</p>
        <dl className="kv" style={{ marginTop: 'var(--sp-2)' }}>
          <dt>Recommended</dt><dd><strong>{f.recommendedAction}</strong></dd>
          {f.projectMatch.type !== 'NONE' && <><dt>Existing work</dt><dd>{({ ALREADY_COVERED: `Already covered by ${f.projectMatch.projectKey}`, POSSIBLE_DUPLICATE: `May overlap with ${f.projectMatch.projectKey}. Consider linking instead of starting a new project.`, CANDIDATE_NEW: 'No project covers this yet. It could become a new project.', UNASSIGNED_INSIGHT: 'An insight with no project yet.', NONE: '' } as const)[f.projectMatch.type]}</dd></>}
        </dl>
        <p className="small muted" style={{ margin: 0 }}>Found {formatDateTime(f.discoveredAt)} · latest activity {formatDateTime(f.lastEvidenceAt)} · checked {formatDateTime(f.analyzedAt)}</p>
        {f.approvedProjectId && <p style={{ margin: 0 }}>Project created: <Link to={`/projects/${f.approvedProjectId}`}>open it</Link></p>}
        {f.linkedProjectId && <p style={{ margin: 0 }}>Linked to: <Link to={`/projects/${f.linkedProjectId}`}>{hub.state.projects.find((p) => p.id === f.linkedProjectId)?.key}</Link></p>}
        <div className="row" style={{ marginTop: 'var(--sp-2)' }}>
          {open && f.plan && <button className="primary big" onClick={() => setDlg('approve')}>Approve as project</button>}
          {open && !f.plan && <button className="primary big" onClick={() => setDlg('link')}>Link to an existing project</button>}
          {open && f.plan && <button onClick={() => setDlg('link')}>Link to an existing project</button>}
          {f.linkedProjectId && <button onClick={() => setDlg('ask')}>Ask for an update</button>}
          {!open && !['APPROVED'].includes(f.status) && <button onClick={() => act(() => hub.reopenFinding(uid, f.id), 'Back in your list')}>Put it back in my list</button>}
          {open && (
            <div className="menu">
              <button className="quiet" aria-haspopup="menu" aria-expanded={choices} onClick={() => setChoices(!choices)}>Other choices ▾</button>
              {choices && (
                <div role="menu" onClick={() => setChoices(false)}>
                  {f.status !== 'INVESTIGATING' && <button role="menuitem" onClick={() => act(() => hub.investigateMore(uid, f.id), 'We will take a closer look (practice). Nothing changes anywhere.')}>Look into it more</button>}
                  <button role="menuitem" onClick={() => setDlg('snooze')}>Snooze</button>
                  <button role="menuitem" onClick={() => setDlg('dismiss')}>Dismiss</button>
                  <button role="menuitem" onClick={() => act(() => hub.markInformational(uid, f.id), 'Kept as information')}>Keep as information</button>
                  <button role="menuitem" onClick={() => act(() => hub.archiveFinding(uid, f.id), 'Archived')}>Archive</button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <Glance f={f} />

      <section className="stack" aria-labelledby="ev">
        <h2 id="ev" style={{ marginBottom: 0 }}>Why we think so</h2>
        {f.evidence.map((e) => <EvidenceRow key={e.id} e={e} />)}
        {f.uncertainties.length > 0 && <div><h3>What we do not know</h3><ul style={{ margin: 0, paddingLeft: '1.1rem' }}>{f.uncertainties.map((u, i) => <li key={i}>{u}</li>)}</ul></div>}
      </section>

      {m ? <Calculator f={f} /> : <section className="card"><h2>Numbers</h2><p className="muted" style={{ margin: 0 }}>Impact not calculated yet. We need real numbers first, so we do not guess.</p></section>}

      {f.plan && (
        <section aria-labelledby="plan"><details className="soft"><summary id="plan">The proposed plan ({f.plan.steps.length} steps)</summary>
          <ol style={{ margin: '.6rem 0 0 1.2rem' }}>{f.plan.steps.map((s, i) => <li key={i} style={{ marginBottom: 6 }}><strong>{s.title}</strong><div className="small muted">{s.instructions}</div></li>)}</ol>
          {f.plan.risks.length > 0 && <p className="small"><strong>Risks:</strong> {f.plan.risks.join(' ')}</p>}</details></section>
      )}

      <section><details className="soft"><summary>Timeline and your decisions</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          {f.occurrences.map((o, i) => <div key={i} className="small">{formatDateTime(o.at)} — {o.note}</div>)}
          {f.decisions.map((d) => <div key={d.id} className="small"><strong>{d.decision.replace(/_/g, ' ').toLowerCase()}</strong> by {hub.userName(d.actorUid)} · {formatDateTime(d.at)}{d.rationale ? ` — ${d.rationale}` : ''}</div>)}
          {!f.occurrences.length && !f.decisions.length && <span className="muted small">Nothing yet.</span>}
        </div></details></section>

      {dlg === 'approve' && f.plan && <ApproveWizard f={f} onClose={() => setDlg(null)} />}
      {dlg === 'link' && <Modal title="Link to an existing project" onClose={() => setDlg(null)}>
        <LinkPicker onPick={async (pid) => { const r = await act(() => hub.linkFinding(uid, f.id, pid), 'Linked'); if (r) setDlg(null); }} projects={projects} />
      </Modal>}
      {dlg === 'snooze' && <SnoozeDialog f={f} onClose={() => setDlg(null)} />}
      {dlg === 'dismiss' && <DismissDialog f={f} onClose={() => { setDlg(null); }} />}
      {dlg === 'ask' && f.linkedProjectId && <RequestUpdateDialog projectId={f.linkedProjectId} onClose={() => setDlg(null)} />}
      <span hidden>{String(nav)}</span>
    </div>
  );
}

const KIND_TEXT: Record<string, string> = { SYNTHETIC: 'Made-up sample data', REAL_SNAPSHOT: 'One-time copy of real data', NONE: 'No data' };
/** The four things Dalia asked for, in one place: what was found, which data supports it, which project, and the possible impact. */
function Glance({ f }: { f: OwnerFinding }) {
  const impact = f.impact ?? { kind: 'unknown' as const, text: 'Insufficient data to estimate. No sales, cost or time numbers are connected.', math: null, scenarios: null };
  return (
    <section className="stack" aria-labelledby="glance">
      <h2 id="glance" style={{ marginBottom: 0 }}>At a glance</h2>
      {f.isSample && <div className="banner warn" role="note"><strong>Sample finding.</strong> This came from made-up data. It is not a real analysis of any account.</div>}
      <div className="grid2">
        <div className="card stack"><h3 style={{ margin: 0 }}>What the AI found</h3><p style={{ margin: 0 }}>{f.summary}</p>{f.scope && <p className="small muted" style={{ margin: 0 }}><strong>Affects:</strong> {f.scope}</p>}
          {f.bucket && <p className="small" style={{ margin: 0 }}><Chip tone="info">{f.bucket}</Chip> {f.bucketWhy}</p>}</div>
        <div className="card stack"><h3 style={{ margin: 0 }}>Data it used</h3>
          {(f.sourcesUsed ?? []).length ? <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>{f.sourcesUsed!.map((u) => <li key={u.sourceId}><strong>{u.name}</strong> <Chip tone={u.dataKind === 'SYNTHETIC' ? 'violet' : u.dataKind === 'REAL_SNAPSHOT' ? 'warn' : 'gray'}>{KIND_TEXT[u.dataKind]}</Chip>{u.coverage && <div className="small muted">{u.coverage}</div>}</li>)}</ul> : <p className="small muted" style={{ margin: 0 }}>The evidence list below names the data.</p>}
          <p className="small muted" style={{ margin: 0 }}>{f.evidence.length} piece{f.evidence.length === 1 ? '' : 's'} of evidence below.</p></div>
        <div className="card stack"><h3 style={{ margin: 0 }}>Project it recommends</h3>
          {f.plan ? <><p style={{ margin: 0 }}><strong>{f.plan.title}</strong></p><p className="small" style={{ margin: 0 }}>{f.plan.employeeObjective}</p><ol className="small" style={{ margin: 0, paddingLeft: '1.1rem' }}>{f.plan.steps.slice(0, 5).map((st, i) => <li key={i}>{st.title}</li>)}</ol></>
            : <p style={{ margin: 0 }}>{f.recommendedAction}</p>}
          {(f.overlap ?? []).length > 0 && <p className="small" style={{ margin: 0 }}><strong>Related work:</strong> {f.overlap!.join('; ')}</p>}
          {f.validation && <p className="small muted" style={{ margin: 0 }}><strong>How we will know it worked:</strong> {f.validation}</p>}
          <p className="small muted" style={{ margin: 0 }}>Nothing is created or assigned until you choose.</p></div>
        <div className="card stack"><h3 style={{ margin: 0 }}>Possible business impact</h3>
          <p style={{ margin: 0 }}>{impact.text}</p>
          {impact.kind !== 'unknown' && <p className="small muted" style={{ margin: 0 }}>Type: {impact.kind}{impact.math ? `. Math: ${impact.math}` : ''}</p>}
          {(f.alternatives ?? []).length > 0 && <div><strong className="small">What else could explain it</strong><ul className="small" style={{ margin: 0, paddingLeft: '1.1rem' }}>{f.alternatives!.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}</div>
      </div>
    </section>
  );
}

function EvidenceRow({ e }: { e: FindingEvidence }) {
  const cls = e.sourceType === 'WEB' && e.publishedAt && e.retrievedAt ? classifyWebSource({ publishedAt: e.publishedAt, effectiveDate: e.effectiveDate, retrievedAt: e.retrievedAt }) : null;
  const Q: Record<FindingEvidence['quality'], [string, Tone]> = { MEASURED: ['Measured', 'ok'], SOURCED: ['From a source', 'info'], ASSUMPTION: ['Assumption', 'warn'], HYPOTHESIS: ['Idea to test', 'warn'] };
  return (
    <div className="erow small">
      <div className="row between"><strong>{e.label}</strong><Chip tone={Q[e.quality][1]}>{Q[e.quality][0]}</Chip></div>
      <div className="muted">{e.sourceName} · seen {formatDateTime(e.observedAt)}</div>
      {e.sourceType === 'WEB' && (
        <div>
          {e.url && <div>Source: <code>{e.url}</code> (practice example, not a live link)</div>}
          {e.publishedAt && <div>Published {formatDateTime(e.publishedAt)}{e.effectiveDate ? ` · starts ${formatDateTime(e.effectiveDate)}` : ''}{e.retrievedAt ? ` · found ${formatDateTime(e.retrievedAt)}` : ''}</div>}
          {cls && <div><Chip tone={cls.label === 'NEW' || cls.label === 'EFFECTIVE_LATER' ? 'info' : 'gray'}>{cls.text}</Chip></div>}
          {e.excerpt && <div className="muted">“{e.excerpt}”</div>}
          <div className="muted">Not shown to apply to any MPP listing yet.</div>
        </div>
      )}
    </div>
  );
}

function LinkPicker({ onPick, projects }: { onPick: (id: string) => void; projects: { id: string; key: string; title: string }[] }) {
  const [pid, setPid] = useState(projects[0]?.id ?? '');
  return (<div className="stack"><select aria-label="Project" value={pid} onChange={(e) => setPid(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.key} — {p.title.slice(0, 60)}</option>)}</select><div><button className="primary" onClick={() => onPick(pid)}>Link</button></div></div>);
}
function SnoozeDialog({ f, onClose }: { f: OwnerFinding; onClose: () => void }) {
  const { hub, uid } = useMe(); const act = useAct(); const [d, setD] = useState('');
  return <Modal title="Snooze this recommendation" onClose={onClose}><div className="stack"><p className="small muted">It leaves your list and comes back on that morning. Nothing is deleted.</p>
    <input type="date" aria-label="Bring it back on" value={d} onChange={(e) => setD(e.target.value)} style={{ maxWidth: 220 }} />
    <div className="row"><button className="primary" disabled={!d} onClick={async () => { const r = await act(() => hub.snoozeFinding(uid, f.id, d), 'Snoozed'); if (r) onClose(); }}>Snooze</button><button onClick={onClose}>Cancel</button></div></div></Modal>;
}
function DismissDialog({ f, onClose }: { f: OwnerFinding; onClose: () => void }) {
  const { hub, uid } = useMe(); const act = useAct(); const [why, setWhy] = useState('');
  return <Modal title="Dismiss this recommendation" onClose={onClose}><div className="stack"><p className="small muted">The facts are kept. Similar things will not keep coming back as new alerts.</p>
    <div><label htmlFor="dm-why">Why? (if you want)</label><input id="dm-why" type="text" value={why} onChange={(e) => setWhy(e.target.value)} /></div>
    <div className="row"><button className="primary" onClick={async () => { const r = await act(() => hub.dismissFinding(uid, f.id, why), 'Dismissed'); if (r) onClose(); }}>Dismiss</button><button onClick={onClose}>Cancel</button></div></div></Modal>;
}

// ------------------------------------------------------------------ the numbers (owner only)
function Calculator({ f }: { f: OwnerFinding }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const m = hub.findingModel(uid, f.id)!;
  const [sc, setSc] = useState<0 | 1 | 2>(1);
  const r = m.scenarios[sc];
  const conf = { LOW: 'Low', MEDIUM_LOW: 'Medium-low', MEDIUM: 'Medium', HIGH: 'High' }[confidenceOf(m.model)];
  const set = (v: ModelVar, field: 'low' | 'base' | 'high', raw: string) => act(() => hub.updateModelVar(uid, m.model.id, v.key, { [field]: raw === '' ? null : Number(raw) }));
  const QUAL: Record<ModelVar['quality'], string> = { MEASURED: 'Measured', SOURCED: 'From a source', ASSUMPTION: 'Assumption', HYPOTHESIS: 'Idea to test' };
  return (
    <section className="card stack" aria-labelledby="calc">
      <div className="row between"><h2 id="calc">The numbers (only you can see this)</h2><Chip tone="gray">How sure: {conf}</Chip></div>
      <p className="small muted" style={{ margin: 0 }}>{m.model.impactCategory}. {m.model.baselinePeriod} Every number below is calculated by the app from the inputs. Change an input and everything updates.</p>
      <Tabs<'0' | '1' | '2'> tabs={[{ id: '0', label: 'Careful' }, { id: '1', label: 'Expected' }, { id: '2', label: 'Hopeful' }]} value={String(sc) as '0' | '1' | '2'} onChange={(t) => setSc(Number(t) as 0 | 1 | 2)} />
      <div className="tiles">
        {r.hoursPerMonth !== null && <div className="tile"><div className="n">{r.hoursPerMonth.toFixed(1)}</div><div className="t">Hours of work freed each month</div></div>}
        {r.capacityValuePerMonth !== null && <div className="tile"><div className="n">{money(r.capacityValuePerMonth)}</div><div className="t">Value of that freed time (not cash)</div></div>}
        {r.incrementalRevenuePerMonth !== null && <div className="tile"><div className="n">{money(r.incrementalRevenuePerMonth)}</div><div className="t">Extra revenue each month (not profit)</div></div>}
        {r.contributionProfitPerMonth !== null && <div className="tile"><div className="n">{money(r.contributionProfitPerMonth)}</div><div className="t">Extra profit each month</div></div>}
        {r.netMonthlyCashBenefit !== null && <div className="tile"><div className="n">{money(r.netMonthlyCashBenefit)}</div><div className="t">Cash benefit each month</div></div>}
        {r.roiPct !== null && <div className="tile"><div className="n">{r.roiPct.toFixed(0)}%</div><div className="t">Return over 12 months</div></div>}
        {r.paybackMonths !== null && <div className="tile"><div className="n">{r.paybackMonths.toFixed(1)}</div><div className="t">Months to pay back</div></div>}
        {r.implementationLaborValue !== null && <div className="tile"><div className="n">{money(r.implementationLaborValue)}</div><div className="t">Worker time to build it (not cash)</div></div>}
      </div>
      {r.notes.length > 0 && <div className="card warn small"><strong>Read this before you decide</strong><ul style={{ margin: '.3rem 0 0', paddingLeft: '1.1rem' }}>{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}
      {r.missing.length > 0 && <div className="small"><strong>We still need:</strong> {r.missing.join('; ')}.</div>}
      <details><summary>Show how each number is worked out</summary>
        <div className="stack" style={{ marginTop: 8 }}>{r.lines.map((l, i) => <div key={i} className="small card flat"><strong>{l.label}</strong><br />Rule: {l.formula}<br />Working: {l.inputs}<br />Result: <strong>{l.result}</strong></div>)}
          {r.lines.length === 0 && <span className="muted small">Not enough inputs to show any working.</span>}</div></details>
      <details><summary>Change the inputs</summary>
        <div className="tablewrap" style={{ marginTop: 8 }}><table><thead><tr><th>Input</th><th>Careful</th><th>Expected</th><th>Hopeful</th><th>How we know</th></tr></thead><tbody>
          {m.model.variables.map((v) => (
            <tr key={v.key}><td>{v.label}<div className="small muted">{v.unit}</div></td>
              {(['low', 'base', 'high'] as const).map((k) => <td key={k}><input type="number" step="any" min={0} aria-label={`${v.label} (${k})`} defaultValue={v[k] ?? ''} onBlur={(e) => { if (String(v[k] ?? '') !== e.target.value) void set(v, k, e.target.value); }} style={{ width: 90, minHeight: 34 }} /></td>)}
              <td className="small"><Chip tone={v.quality === 'MEASURED' || v.quality === 'SOURCED' ? 'ok' : 'warn'}>{QUAL[v.quality]}</Chip><div className="muted">{v.source}</div></td></tr>))}
        </tbody></table></div>
        <p className="small muted">Version {m.model.version}. Every change is saved in the history. Last change: {m.model.history[m.model.history.length - 1].changed}</p>
      </details>
      <p className="small" style={{ margin: 0 }}><strong>How we will measure it later:</strong> {m.model.measurementPlan}</p>
      <p className="small muted" style={{ margin: 0 }}>Freed time is not cash saved. Revenue is not profit. Two ideas that improve the same thing are never added together.</p>
    </section>
  );
}

// ------------------------------------------------------------------ approve → plan → who → folder
function ApproveWizard({ f, onClose }: { f: OwnerFinding; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const nav = useNavigate();
  const key = useRef(newKey('approve'));
  const plan = f.plan!;
  const [title, setTitle] = useState(plan.title);
  const [goal, setGoal] = useState(plan.employeeObjective);
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH'>('NORMAL');
  const [steps, setSteps] = useState<PlanStepDraft[]>(plan.steps.map((s) => ({ ...s })));
  const [assign, setAssign] = useState<string[]>([]);
  const [folder, setFolder] = useState(true);
  const [tab, setTab] = useState<'plan' | 'who' | 'preview'>('plan');
  const [projKey, setProjKey] = useState('P-095');
  const people = hub.listUsers(uid).filter((u) => u.role === 'EMPLOYEE' && u.active);
  const preview = hub.employeeBriefPreview(uid, { title, employeeObjective: goal, steps });
  const overlap = f.projectMatch.type === 'POSSIBLE_DUPLICATE' || f.projectMatch.type === 'ALREADY_COVERED';
  const upd = (i: number, patch: Partial<PlanStepDraft>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const go = async () => {
    const p = await act(() => hub.approveFindingAsProject(uid, f.id, { title, employeeObjective: goal, priority, deadlineYmd: due || null, key: projKey || undefined, steps, assignUids: assign, createWorkspace: folder, idempotencyKey: key.current }), assign.length ? 'Project created and assigned' : 'Project created. Nobody can see it until you assign it.');
    if (p) { onClose(); nav(`/projects/${p.id}`); }
  };
  return (
    <Modal title={`Approve ${f.code} as a project`} onClose={onClose} wide>
      <div className="stack">
        <Tabs<'plan' | 'who' | 'preview'> tabs={[{ id: 'plan', label: '1. The plan' }, { id: 'who', label: '2. Who and where' }, { id: 'preview', label: '3. What the worker sees' }]} value={tab} onChange={setTab} />
        {overlap && <div className="banner warn small">This may overlap with {f.projectMatch.projectKey}. You can link it instead of making a new project.</div>}
        {tab === 'plan' && (
          <div className="stack">
            <p className="small muted">Write this the way a worker should read it. Keep money, profit and strategy out. Those stay private to you, and the app will stop you if they slip in.</p>
            <div className="grid cols-2"><div><label htmlFor="ap-t">Project name</label><input id="ap-t" type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div><label htmlFor="ap-k">Project number</label><input id="ap-k" type="text" value={projKey} onChange={(e) => setProjKey(e.target.value)} /></div></div>
            <div><label htmlFor="ap-g">What should the worker know about the goal?</label><textarea id="ap-g" value={goal} onChange={(e) => setGoal(e.target.value)} /></div>
            <div className="grid cols-2"><div><label htmlFor="ap-d">Due date (optional)</label><input id="ap-d" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
              <div><label htmlFor="ap-p">Priority</label><select id="ap-p" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option></select></div></div>
            <h3>Steps</h3>
            {steps.map((s, i) => (
              <div key={i} className="card flat stack">
                <div className="row"><strong>Step {i + 1}</strong><span style={{ flex: 1 }} /><button className="link" disabled={i === 0} onClick={() => { const n = [...steps]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setSteps(n); }}>Move up</button><button className="link" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>Remove</button></div>
                <input type="text" aria-label={`Step ${i + 1} name`} value={s.title} onChange={(e) => upd(i, { title: e.target.value })} />
                <textarea aria-label={`Step ${i + 1} instructions`} value={s.instructions} onChange={(e) => upd(i, { instructions: e.target.value })} style={{ minHeight: 60 }} />
                <input type="text" aria-label={`Step ${i + 1} reason`} placeholder="Why this step matters (no money details)" value={s.whyForGoal} onChange={(e) => upd(i, { whyForGoal: e.target.value })} />
              </div>
            ))}
            <div><button onClick={() => setSteps([...steps, { title: 'New step', instructions: '', whyForGoal: '', deliverable: '', tools: [], evidenceDescription: '' }])}>Add a step</button></div>
          </div>
        )}
        {tab === 'who' && (
          <div className="stack">
            <p className="small muted">You can leave this project unassigned for now. Until you assign someone, no employee can see it, and nothing is shared.</p>
            {plan.suggestedAssignees.length > 0 && <div className="card violet small"><strong>Suggestions from the AI (you decide):</strong>{plan.suggestedAssignees.map((s) => <div key={s.uid}>{hub.userName(s.uid)} — {s.caveat}</div>)}</div>}
            <fieldset style={{ border: 'none', padding: 0 }}><legend style={{ fontWeight: 600 }}>Assign to</legend>
              {people.map((u) => <label key={u.id} style={{ fontWeight: 500 }}><input type="checkbox" checked={assign.includes(u.id)} onChange={(e) => setAssign(e.target.checked ? [...assign, u.id] : assign.filter((x) => x !== u.id))} /> {u.name}</label>)}
              <label style={{ fontWeight: 500 }}><input type="checkbox" checked={assign.length === 0} onChange={() => setAssign([])} /> Leave unassigned for now</label>
            </fieldset>
            <label style={{ fontWeight: 500 }}><input type="checkbox" checked={folder} onChange={(e) => setFolder(e.target.checked)} /> Create the project folder now (practice: no real Google Drive is touched)</label>
            {folder && <div className="card flat small"><strong>The folder will have:</strong> “{projKey} — {title}” with 5 subfolders (Instructions &amp; SOPs · Working Documents &amp; Checklists · Images &amp; Input Files · Final Deliverables · Reports &amp; Archive), a shortcut to the shared Shopify SOP (the original stays where it is), and a note of where the script lives (it is not moved).</div>}
          </div>
        )}
        {tab === 'preview' && (
          <div className="stack">
            <p className="small muted">This is everything the worker will see. It is built only from the fields on tab 1. Your numbers, notes and reasoning are not included.</p>
            <div className="card flat"><h3>{preview.title}</h3><p>{preview.objective}</p>
              <ol style={{ margin: '0 0 0 1.2rem' }}>{preview.steps.map((s) => <li key={s.number} style={{ marginBottom: 6 }}><strong>{s.title}</strong><div className="small">{s.instructions}</div>{s.why && <div className="small muted">Why: {s.why}</div>}{s.doneWhen && <div className="small muted">Done when: {s.doneWhen}</div>}</li>)}</ol></div>
          </div>
        )}
        <div className="row"><button className="primary" onClick={go} disabled={!title.trim() || !steps.length}>{assign.length ? 'Create project and assign' : 'Create project (unassigned)'}</button><button onClick={onClose}>Cancel</button></div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ goals / sources / results
function Results() {
  const { hub, uid } = useMe();
  const act = useAct();
  const rows = hub.outcomeTracker(uid);
  const [form, setForm] = useState<{ id: string; period: string; hours: string; limits: string } | null>(null);
  const kids = useMemo(() => rows, [rows]);
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>For projects you approved: what we planned and what was measured. What changed is not the same as what the project caused.</p>
      {kids.length === 0 && <Empty>No approved projects yet.</Empty>}
      {kids.map((r) => (
        <div key={r.finding.id} className="card stack"><div className="row between"><strong>{r.project.key} — {r.project.title}</strong><Link to={`/projects/${r.project.id}`}>Open project</Link></div>
          <div className="small">{r.estimatedHours != null ? `Planned: ${r.estimatedHours.toFixed(1)} hours freed each month (an estimate).` : 'No planned hours.'}</div>
          <div className="small"><strong>{r.comparison}</strong></div>
          <div className="small muted">First review due {formatDateTime(r.reviewDue)}.</div>
          {r.outcomes.map((o) => <div key={o.id} className="small">Measured for {o.period}: {o.actualHours ?? '—'} hours. {o.limitations}</div>)}
          {form?.id === r.finding.id ? (
            <form className="stack" onSubmit={async (e) => { e.preventDefault(); const ok = await act(() => hub.recordOutcome(uid, r.finding.id, { period: form.period, actualHours: form.hours === '' ? null : Number(form.hours), actualOrders: null, limitations: form.limits }), 'Result saved'); if (ok) setForm(null); }}>
              <div className="grid cols-2"><div><label htmlFor="o-p">Period</label><input id="o-p" type="text" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="Example: November 2026" /></div><div><label htmlFor="o-h">Hours of work freed (measured)</label><input id="o-h" type="number" min={0} value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></div></div>
              <div><label htmlFor="o-l">Anything that could change the result? (holidays, ads…)</label><input id="o-l" type="text" value={form.limits} onChange={(e) => setForm({ ...form, limits: e.target.value })} /></div>
              <div className="row"><button className="primary" type="submit" disabled={!form.period.trim()}>Save result</button><button type="button" onClick={() => setForm(null)}>Cancel</button></div>
            </form>
          ) : <div><button onClick={() => setForm({ id: r.finding.id, period: '', hours: '', limits: '' })}>Record a measured result</button></div>}
        </div>
      ))}
    </div>
  );
}
export { formatLocalDate };
