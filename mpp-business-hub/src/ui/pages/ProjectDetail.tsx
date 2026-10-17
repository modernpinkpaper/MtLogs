import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { newKey, useAct, useMe } from '../hubContext';
import { Chip, Empty, Modal, ObservedChip, SourceChip, StatusChip, Tabs, VerifyBadge, statusLabel } from '../common';
import { JournalList, ResourceCard } from '../parts';
import { JournalFilters } from './Journal';
import { RequestUpdateDialog, SendUpdateDialog } from '../dialogs';
import { progressOf } from '../progress';
import { formatDate, formatDateTime } from '../../domain/time';
import { CHOICE_LABEL, TERMINAL } from '../../server/hub';
import type { Step, StepStatus } from '../../domain/types';

type Tab = 'overview' | 'plan' | 'resources' | 'journal' | 'results' | 'people';

export function ProjectDetail() {
  const { projectId = '', stepId } = useParams();
  const { hub, uid, me } = useMe();
  const [tab, setTab] = useState<Tab>('overview');
  const [reqOpen, setReqOpen] = useState(false);
  const [updOpen, setUpdOpen] = useState(false);
  const nav = useNavigate();

  let project;
  try { project = hub.getProject(uid, projectId); } catch {
    // Same message for "not found" and "not allowed": nothing about the item is revealed.
    return <div className="card bad" role="alert"><h1>Permission denied</h1><p>You don’t have access to this page.</p><Link to="/projects">Back to projects</Link></div>;
  }
  const steps = hub.projectSteps(uid, projectId);
  const pr = progressOf(steps);
  const canWork = hub.canWorkOnProject(me, project);
  const selected = steps.find((s) => s.id === stepId) ?? steps.find((s) => !TERMINAL.includes(s.status)) ?? steps[0];
  const blockers = steps.filter((s) => s.status === 'BLOCKED');
  const openReq = hub.state.updateRequests.filter((r) => r.projectId === projectId && ['OPEN', 'PARTIALLY_RESPONDED'].includes(r.state) && (me.role === 'OWNER' || r.recipientUids.includes(uid)));
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' }, { id: 'plan', label: 'Plan & Steps' }, { id: 'resources', label: 'Resources' }, { id: 'journal', label: 'Journal' }, { id: 'results', label: 'Results & Impact' },
    ...(me.role === 'OWNER' ? [{ id: 'people' as Tab, label: 'People & Permissions' }] : []),
  ];

  return (
    <div className="stack">
      <div className="small muted"><Link to="/projects">Projects</Link> › {project.key}{stepId && selected ? <> › Step {selected.sortOrder}</> : null}</div>
      <header className="card">
        <div className="row between">
          <div>
            <h1>{project.key} — {project.title}</h1>
            <p className="muted">{project.objective}</p>
          </div>
          <div className="row">
            {me.role === 'OWNER' && project.visibility !== 'OWNER_PRIVATE' && <button className="primary" onClick={() => setReqOpen(true)}>Request Update</button>}
            {me.role === 'EMPLOYEE' && canWork && <button className={openReq.length ? 'primary' : ''} onClick={() => setUpdOpen(true)}>Send Update to Dalia</button>}
            {canWork && <button onClick={() => setTab('plan')}>Edit Plan</button>}
          </div>
        </div>
        <dl className="kv">
          <dt>Owner / team</dt><dd>{hub.userName(project.ownerUid)} · {project.memberUids.map((m) => hub.userName(m)).join(', ') || '—'}{project.sharedWithUids.length ? ` (shared read-only: ${project.sharedWithUids.map((m) => hub.userName(m)).join(', ')})` : ''}</dd>
          <dt>Privacy</dt><dd>{project.visibility === 'OWNER_PRIVATE' ? <Chip tone="violet" glyph="🔒">Owner private</Chip> : project.visibility === 'TEAM_SHARED' ? 'Team shared' : 'Assigned people only'}</dd>
          <dt>Deadline</dt><dd>{project.deadlineAt ? formatDate(project.deadlineAt) : 'None set'}</dd>
          <dt>Progress (method)</dt><dd>{pr.label}<div className="small muted">Counted by confirmed top-level steps; effort is not weighted. No percentages are guessed from activity.</div></dd>
          <dt>Last verified update</dt><dd>{project.lastVerifiedAt ? formatDateTime(project.lastVerifiedAt) : 'No independent verification yet'}</dd>
          <dt>Current blockers / risk</dt><dd>{blockers.length ? blockers.map((b) => `${b.title}: ${b.blockerReason}`).join('; ') : project.currentRisk ?? 'None recorded'}</dd>
        </dl>
        {openReq.length > 0 && <div className="card pink small" style={{ marginTop: 8 }}>{openReq.length} update request(s) open on this project.</div>}
      </header>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)' }}>
          <div className="stack">
            <section className="card">
              <h2>Next action & blockers</h2>
              {selected && !TERMINAL.includes(selected.status) ? <p>Next: <strong>Step {selected.sortOrder} — {selected.title}</strong></p> : <p className="muted">All steps are finished or closed.</p>}
              {blockers.map((b) => <div key={b.id} className="card bad small">⛔ {b.title}: {b.blockerReason}</div>)}
              {steps.filter((s) => s.observedReview === 'PENDING_EMPLOYEE' && s.observedLevel !== 'NO_EVIDENCE').map((s) => <div key={s.id} className="small">✦ AI finding waiting for review on Step {s.sortOrder}</div>)}
            </section>
            <section className="card">
              <h2>Step plan</h2>
              <StepList steps={steps} projectId={project.id} selectedId={selected?.id} onPick={(id) => nav(`/projects/${project.id}/steps/${id}`)} />
            </section>
          </div>
          <div className="stack">{selected && <StepPanel key={selected.id} step={selected} canWork={canWork} />}</div>
        </div>
      )}
      {tab === 'overview' && (
        <div className="grid cols-2">
          <section className="card"><h2>Recent history</h2><JournalList events={hub.getJournal(uid, { projectId }).slice(0, 5)} /></section>
          <section className="card"><h2>Linked resources</h2>
            {hub.projectResources(uid, projectId).slice(0, 5).map((x) => <div key={x.link.id} className="small"><Chip tone="gray">{x.link.role.replace(/_/g, ' ').toLowerCase()}</Chip> {x.resource.label}</div>)}
            {hub.projectResources(uid, projectId).length === 0 && <span className="muted">None yet.</span>}
            <p><button className="link" onClick={() => setTab('resources')}>See all</button></p>
            <h3>Outcome / impact</h3>
            <p className="small">{project.impactPlan ? <>Target: {project.impactPlan.target}. Observed: {project.impactPlan.observed ?? <em>Not yet measured</em>}</> : <em>Not yet measured</em>}</p>
          </section>
        </div>
      )}

      {tab === 'plan' && <PlanTab projectId={project.id} steps={steps} canWork={canWork} />}
      {tab === 'resources' && (
        <div className="grid cols-2">{(() => {
          const byRes = new Map<string, ReturnType<typeof hub.projectResources>>();
          hub.projectResources(uid, projectId).forEach((x) => byRes.set(x.resource.id, [...(byRes.get(x.resource.id) ?? []), x]));
          if (!byRes.size) return <Empty>No resources linked yet.</Empty>;
          return [...byRes.values()].map((xs) => <ResourceCard key={xs[0].resource.id} resource={xs[0].resource} links={xs.map((x) => ({ ...x.link, projectKey: project.key, stepTitle: x.stepTitle }))} />);
        })()}</div>
      )}
      {tab === 'journal' && (
        <div className="stack">
          <div className="row"><label className="row" style={{ margin: 0, fontWeight: 500 }}>View: <select style={{ width: 'auto' }} value={stepId ?? ''} onChange={(e) => nav(e.target.value ? `/projects/${projectId}/steps/${e.target.value}` : `/projects/${projectId}`)}><option value="">Whole project</option>{steps.map((s) => <option key={s.id} value={s.id}>Step {s.sortOrder}: {s.title.slice(0, 50)}</option>)}</select></label>
            <span className="small muted">Same stored entries, filtered — not a separate diary.</span></div>
          <JournalFilters key={stepId ?? 'all'} projectId={projectId} stepId={stepId} />
          {me.role === 'OWNER' && <AuditPanel projectId={projectId} />}
        </div>
      )}
      {tab === 'results' && <ResultsTab projectId={project.id} steps={steps} />}
      {tab === 'people' && me.role === 'OWNER' && <PeopleTab projectId={project.id} />}

      {reqOpen && <RequestUpdateDialog projectId={project.id} stepId={selected?.id} onClose={() => setReqOpen(false)} />}
      {updOpen && <SendUpdateDialog projectId={project.id} stepId={selected?.id} onClose={() => setUpdOpen(false)} />}
    </div>
  );
}

function StepList({ steps, projectId, selectedId, onPick }: { steps: Step[]; projectId: string; selectedId?: string; onPick: (id: string) => void }) {
  const kids = (id: string | null) => steps.filter((s) => s.parentStepId === id);
  const render = (s: Step, depth: number): React.ReactNode => (
    <div key={s.id} className={depth ? 'substep' : ''}>
      <button className={`step ${selectedId === s.id ? 'sel' : ''}`} onClick={() => onPick(s.id)} aria-current={selectedId === s.id} data-project={projectId}>
        <div className="row"><span className="num">{depth ? '↳' : s.sortOrder}</span><strong style={{ flex: 1 }}>{s.title}</strong>{s.newActivityAt && s.observedReview === 'PENDING_EMPLOYEE' && <Chip tone="violet" glyph="✦" title="New AI-detected activity awaiting review">New activity detected · awaiting review</Chip>}</div>
        <div className="row" style={{ marginTop: 4 }}><StatusChip status={s.status} />{s.observedLevel !== 'NO_EVIDENCE' && <ObservedChip level={s.observedLevel} review={s.observedReview} />}{s.impact === 'HIGH' && <Chip tone="warn" glyph="!">High impact</Chip>}</div>
      </button>
      {kids(s.id).map((k) => render(k, depth + 1))}
    </div>
  );
  return <div className="stack">{kids(null).map((s) => render(s, 0))}</div>;
}

const NEXT: Partial<Record<StepStatus, StepStatus[]>> = {
  NOT_STARTED: ['IN_PROGRESS', 'REPORTED_COMPLETE', 'NOT_APPLICABLE'], IN_PROGRESS: ['BLOCKED', 'WAITING', 'REPORTED_COMPLETE', 'NOT_APPLICABLE'], BLOCKED: ['IN_PROGRESS'], WAITING: ['IN_PROGRESS'],
  REPORTED_COMPLETE: ['VERIFIED_COMPLETE', 'IN_PROGRESS', 'REOPENED'], VERIFIED_COMPLETE: ['REOPENED'], REOPENED: ['IN_PROGRESS', 'BLOCKED', 'WAITING', 'REPORTED_COMPLETE'],
};

function StepPanel({ step, canWork }: { step: Step; canWork: boolean }) {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const [sp] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(step.instructions);
  const [reason, setReason] = useState('');
  const [help, setHelp] = useState(false);
  const [upd, setUpd] = useState(false);
  const [req, setReq] = useState(false);
  const [verify, setVerify] = useState(false);
  const [showFiles, setShowFiles] = useState(true);
  const responseId = sp.get('response');
  const resources = hub.stepResources(uid, step.id);
  const journal = hub.getJournal(uid, { stepId: step.id }).slice(0, 3);
  const owner = me.role === 'OWNER';
  const project = hub.getProject(uid, step.projectId);
  const assigned = step.assignedUids.includes(uid) || owner;
  const choices = (NEXT[step.status] ?? []).filter((t) => owner || (assigned && ['IN_PROGRESS', 'BLOCKED', 'WAITING', 'REPORTED_COMPLETE', 'NOT_APPLICABLE', 'VERIFIED_COMPLETE'].includes(t) && !(t === 'VERIFIED_COMPLETE' && step.impact === 'HIGH')));
  const lockedHigh = step.impact === 'HIGH' && step.status === 'REPORTED_COMPLETE' && !owner;

  const move = (to: StepStatus, ownerApproval = false) => act(() => hub.transitionStep(uid, step.id, to, { reason, ownerApproval }), `Step is now ${statusLabel(to)}`);

  return (
    <section className="card stack" aria-label={`Step ${step.sortOrder} details`}>
      {responseId && <ResponseDetail responseId={responseId} />}
      <div><h2>Step {step.sortOrder}: {step.title}</h2>
        <div className="row"><StatusChip status={step.status} /><SourceChip source={step.verificationSource} />{step.impact === 'HIGH' && <Chip tone="warn" glyph="!" title="High-impact: needs independent verification or owner approval">High impact</Chip>}</div></div>
      {step.observedLevel !== 'NO_EVIDENCE' ? (
        <div className="card violet small"><strong>AI noticed activity on Step {step.sortOrder}</strong> <ObservedChip level={step.observedLevel} review={step.observedReview} />
          <div>{step.observedNote}</div>
          <div className="muted">Official status above is separate and unchanged until a person (or an independent verifier) updates it.</div></div>
      ) : (
        <div className="small muted">AI: no matching activity detected. That does not mean nothing happened — log coverage may be incomplete.</div>
      )}
      {step.humanReported && <div className="small"><Chip tone="info" glyph="☑">Employee-reported</Chip> {hub.userName(step.humanReported.byUid)}: {CHOICE_LABEL[step.humanReported.choice]} · {formatDateTime(step.humanReported.at)}{step.humanReported.note ? ` — “${step.humanReported.note}”` : ''}</div>}
      {step.blockerReason && <div className="card bad small">{step.status === 'BLOCKED' ? 'Blocked' : 'Waiting'}: {step.blockerReason}</div>}

      <div className="row">
        <button onClick={() => { setEditing(false); setShowFiles(false); document.getElementById(`ins-${step.id}`)?.scrollIntoView(); }}>Open Instructions</button>
        <button onClick={() => setShowFiles(!showFiles)}>Files</button>
        {canWork && me.role === 'EMPLOYEE' && <button onClick={() => setUpd(true)}>Report Progress</button>}
        {canWork && me.role === 'EMPLOYEE' && assigned && ['NOT_STARTED', 'IN_PROGRESS', 'REOPENED'].includes(step.status) && <button onClick={() => move('REPORTED_COMPLETE')}>Mark Done (reported)</button>}
        {canWork && me.role === 'EMPLOYEE' && <button onClick={() => setHelp(true)}>Ask for Help</button>}
        {owner && project.visibility !== 'OWNER_PRIVATE' && <button className="primary" onClick={() => setReq(true)}>Request Update</button>}
      </div>

      <div id={`ins-${step.id}`}>
        <div className="row between"><h3>Instructions</h3>{canWork && <button className="link" onClick={() => { setEditing(!editing); setText(step.instructions); }}>{editing ? 'Cancel' : 'Edit'}</button>}</div>
        {editing ? (<div className="stack"><textarea aria-label="Instructions" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 140 }} /><div><button className="primary" onClick={async () => { const r = await act(() => hub.updateInstructions(uid, step.id, text), 'Instructions saved'); if (r) setEditing(false); }}>Save</button></div></div>) : <p style={{ whiteSpace: 'pre-wrap' }}>{step.instructions || <span className="muted">No instructions yet.</span>}</p>}
        {step.objective && <p className="small"><strong>Objective:</strong> {step.objective} <strong>Acceptance:</strong> {step.acceptance}</p>}
        {step.dependencyIds.length > 0 && <p className="small muted">Depends on: {step.dependencyIds.map((d) => { const s = hub.state.steps.find((x) => x.id === d); return s ? `Step ${s.sortOrder}` : ''; }).join(', ')}</p>}
      </div>

      {step.checklist.length > 0 && (
        <div><h3>Checklist</h3>{step.checklist.map((c) => (
          <label key={c.id} style={{ fontWeight: 500, display: 'flex', gap: 8 }}><input type="checkbox" checked={c.done} disabled={!canWork} onChange={() => act(() => hub.toggleChecklist(uid, step.id, c.id))} /> {c.text}</label>))}</div>
      )}

      {showFiles && (
        <div><h3>Files & tools for this step</h3>
          {resources.length === 0 && <span className="muted small">No resources linked.</span>}
          {resources.map(({ link, resource }) => (
            <div key={link.id} className="small" style={{ marginBottom: 4 }}><Chip tone="gray">{link.role.replace(/_/g, ' ').toLowerCase()}</Chip> <strong>{resource.label}</strong> {link.associationState === 'SUGGESTED' && <Chip tone="violet" glyph="✦">AI suggested</Chip>}
              {resource.checklistSummary && <span className="muted"> · {resource.checklistSummary.yes}/{resource.checklistSummary.total} Yes ({resource.checklistSummary.sourceNote})</span>}
              {resource.suggestedVersion && <Chip tone="warn" glyph="!">newer version, not approved</Chip>}
              {resource.canonicalUrl === null && resource.normalizedPath && <span className="muted"> · local path (copy in Resources)</span>}</div>))}
          <Link className="small" to="/resources">Open resource library</Link>
        </div>
      )}

      {step.verifications.length > 0 && (
        <div><h3>Independent verification</h3>{step.verifications.map((v) => (
          <div key={v.id} className="small"><VerifyBadge state={v.result === 'CONFIRMED' ? 'INDEPENDENTLY_VERIFIED' : 'NEEDS_REVIEW'} /> {v.verifier} (simulated) — {v.entity}: <strong>{v.result.replace(/_/g, ' ')}</strong>. {v.detail} · {formatDateTime(v.at)}</div>))}</div>
      )}

      <div>
        <h3>Change status</h3>
        {lockedHigh && <p className="small muted">This is a high-impact step. It can only be confirmed by independent verification or the owner’s explicit approval.</p>}
        {choices.length === 0 ? <span className="muted small">No further status changes available to you.</span> : (
          <div className="stack">
            <input type="text" aria-label="Reason or note" placeholder="Reason / note (required for Blocked)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="row">{choices.map((t) => <button key={t} onClick={() => move(t)}>{statusLabel(t)}</button>)}
              {owner && step.status === 'REPORTED_COMPLETE' && step.impact === 'HIGH' && !step.verifications.some((v) => v.result === 'CONFIRMED') && <button className="danger" onClick={() => move('VERIFIED_COMPLETE', true)}>Owner-approve without verification</button>}</div>
          </div>
        )}
        {owner && <div style={{ marginTop: 8 }}><button onClick={() => setVerify(true)}>Record verifier result (demo simulator)…</button></div>}
      </div>

      <div><h3>Last 3 journal entries</h3><JournalList events={journal} /></div>

      {upd && <SendUpdateDialog projectId={step.projectId} stepId={step.id} onClose={() => setUpd(false)} />}
      {req && <RequestUpdateDialog projectId={step.projectId} stepId={step.id} onClose={() => setReq(false)} />}
      {help && <HelpDialog step={step} onClose={() => setHelp(false)} />}
      {verify && <VerifyDialog step={step} onClose={() => setVerify(false)} />}
    </section>
  );
}

function ResponseDetail({ responseId }: { responseId: string }) {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const [fu, setFu] = useState(false);
  const [q, setQ] = useState('');
  const fuKey = useRef(newKey('fu'));
  const resp = hub.state.updateResponses.find((r) => r.id === responseId && (me.role === 'OWNER' || r.fromUid === uid));
  if (!resp) return null;
  const req = resp.requestId ? hub.getRequest(uid, resp.requestId) : null;
  const note = hub.listNotifications(uid).find((n) => n.sourceEntityId === resp.id);
  return (
    <div className="card pink stack" role="region" aria-label="Response detail">
      <div className="row between"><strong>{resp.requestId ? 'Response to your update request' : 'Update sent without a request'}</strong><Chip tone="info" glyph="☑">Employee-reported (not independently verified)</Chip></div>
      {req && <div className="small"><span className="muted">Your question:</span> “{req.question ?? 'Status requested'}” · {formatDateTime(req.createdAt)}</div>}
      <div><strong>{hub.userName(resp.fromUid)}</strong> answered <strong>{CHOICE_LABEL[resp.choice]}</strong> · {formatDateTime(resp.submittedAt)}</div>
      {resp.note && <blockquote style={{ margin: 0, paddingLeft: 10, borderLeft: '3px solid var(--pink)' }}>{resp.note}</blockquote>}
      {resp.evidenceLinks.length > 0 && <div className="small">Evidence: {resp.evidenceLinks.join(', ')}</div>}
      {me.role === 'OWNER' && (
        <div className="row">
          {note && !note.acknowledgedAt && <button className="primary" onClick={() => act(() => hub.acknowledge(uid, note.id), 'Acknowledged')}>Acknowledge</button>}
          {note?.acknowledgedAt && <Chip tone="ok" glyph="✔">Acknowledged {formatDateTime(note.acknowledgedAt)}</Chip>}
          {req && <button onClick={() => setFu(true)}>Ask follow-up</button>}
          {req && req.state !== 'CLOSED' && <button onClick={() => act(() => hub.closeRequest(uid, req.id), 'Request closed')}>Close request</button>}
          {req && <span className="small muted">Request state: {req.state.toLowerCase()}</span>}
        </div>
      )}
      {fu && req && (
        <Modal title="Ask a follow-up" onClose={() => setFu(false)}>
          <div className="stack"><p className="small muted">This creates a new request. {hub.userName(resp.fromUid)}’s earlier answer stays exactly as it is.</p>
            <textarea aria-label="Follow-up question" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="row"><button className="primary" disabled={!q.trim()} onClick={async () => { const r = await act(() => hub.followUp(uid, req.id, q, fuKey.current), 'Follow-up sent'); if (r) setFu(false); }}>Send follow-up</button></div></div>
        </Modal>
      )}
    </div>
  );
}

function HelpDialog({ step, onClose }: { step: Step; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const key = useRef(newKey('help'));
  const [note, setNote] = useState('');
  return (
    <Modal title="Ask Dalia for help" onClose={onClose}>
      <div className="stack">
        <p className="small">This sends Dalia a blocker notification for Step {step.sortOrder}. Your step status stays as it is unless you change it.</p>
        <textarea aria-label="What do you need?" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What do you need help with?" />
        <div className="row"><button className="primary" disabled={!note.trim()} onClick={async () => { const r = await act(() => hub.sendProactiveUpdate(uid, { projectId: step.projectId, stepId: step.id, choice: 'BLOCKED', note, needsOwnerHelp: true, idempotencyKey: key.current }), 'Dalia has been notified'); if (r) onClose(); }}>Send</button></div>
      </div>
    </Modal>
  );
}

function VerifyDialog({ step, onClose }: { step: Step; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [result, setResult] = useState<'CONFIRMED' | 'NOT_FOUND' | 'MISMATCH'>('CONFIRMED');
  const [entity, setEntity] = useState(step.projectId === 'prj-081' ? 'FBA_TY001 → PC107' : 'MA041 draft product');
  const [detail, setDetail] = useState('');
  return (
    <Modal title="Record verifier result (demo simulator)" onClose={onClose}>
      <div className="stack">
        <div className="card violet small">Stands in for a trusted connector (Shopify/Amazon lookup). It records a verification alongside earlier observations and never rewrites them. It does not complete the step by itself.</div>
        <div><label htmlFor="v-e">Entity checked</label><input id="v-e" type="text" value={entity} onChange={(e) => setEntity(e.target.value)} /></div>
        <div><label htmlFor="v-r">Result</label><select id="v-r" value={result} onChange={(e) => setResult(e.target.value as typeof result)}><option value="CONFIRMED">Confirmed (state is correct)</option><option value="NOT_FOUND">Not found</option><option value="MISMATCH">Mismatch</option></select></div>
        <div><label htmlFor="v-d">Detail</label><input id="v-d" type="text" value={detail} onChange={(e) => setDetail(e.target.value)} /></div>
        <button className="primary" onClick={async () => { const r = await act(() => hub.recordVerification(uid, step.id, { verifier: step.projectId === 'prj-081' ? 'Amazon family lookup' : 'Shopify product lookup', entity, result, detail: detail || (result === 'CONFIRMED' ? 'Matches expected state' : 'Does not match expected state') }), 'Verification recorded'); if (r) onClose(); }}>Record</button>
      </div>
    </Modal>
  );
}

function PlanTab({ projectId, steps, canWork }: { projectId: string; steps: Step[]; canWork: boolean }) {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const [title, setTitle] = useState('');
  const [parent, setParent] = useState('');
  return (
    <div className="stack">
      <div className="card"><h2>Plan & steps</h2><StepList steps={steps} projectId={projectId} onPick={(id) => { window.location.hash = `#/projects/${projectId}/steps/${id}`; }} /></div>
      {canWork && (
        <form className="card stack" onSubmit={async (e) => { e.preventDefault(); const r = await act(() => hub.addStep(uid, projectId, { title, parentStepId: parent || null }), 'Step added'); if (r) setTitle(''); }}>
          <h3>{me.role === 'OWNER' ? 'Add a step or substep' : 'Add a substep under one of your steps'}</h3>
          <div className="grid cols-2">
            <div><label htmlFor="as-t">Title</label><input id="as-t" type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div><label htmlFor="as-p">Parent step</label><select id="as-p" value={parent} onChange={(e) => setParent(e.target.value)}>{me.role === 'OWNER' && <option value="">Top-level step</option>}{steps.filter((s) => !s.parentStepId && (me.role === 'OWNER' || s.assignedUids.includes(uid))).map((s) => <option key={s.id} value={s.id}>Under: {s.title.slice(0, 40)}</option>)}</select></div>
          </div>
          <div><button className="primary" type="submit" disabled={!title.trim() || (me.role !== 'OWNER' && !parent)}>Add</button></div>
          <p className="small muted">AI may suggest plan changes, but only a person can approve reordering or reassignment.</p>
        </form>
      )}
    </div>
  );
}

function ResultsTab({ projectId, steps }: { projectId: string; steps: Step[] }) {
  const { hub, uid } = useMe();
  const p = hub.getProject(uid, projectId);
  const verified = steps.flatMap((s) => s.verifications.map((v) => ({ s, v })));
  return (
    <div className="stack">
      <div className="card"><h2>Target vs observed</h2><p>{p.impactPlan ? <>Target: {p.impactPlan.target}<br />Observed: {p.impactPlan.observed ?? <em>Not yet measured</em>}</> : <em>Not yet measured. No savings or benefits are assumed.</em>}</p></div>
      <div className="card"><h2>Independent verifications</h2>{verified.length === 0 ? <span className="muted">None yet.</span> : verified.map(({ s, v }) => <div key={v.id} className="small">Step {s.sortOrder}: {v.entity} — {v.result.replace(/_/g, ' ')} ({v.verifier}, simulated) · {formatDateTime(v.at)}</div>)}</div>
    </div>
  );
}

function PeopleTab({ projectId }: { projectId: string }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const p = hub.getProject(uid, projectId);
  const employees = hub.listUsers(uid).filter((u) => u.role === 'EMPLOYEE' && u.active);
  const log = hub.getJournal(uid, { projectId, types: ['ACCESS'] });
  return (
    <div className="stack">
      {p.visibility === 'OWNER_PRIVATE' ? <div className="card violet">Owner-private: no employee can see this project, its resources, journal, counts or notifications. It cannot be assigned or shared without changing its visibility.</div> : (
        <div className="card"><h2>Who can see this project</h2>
          <div className="tablewrap"><table><thead><tr><th>Person</th><th>Assigned (can work)</th><th>Shared (read-only)</th></tr></thead><tbody>
            {employees.map((u) => (
              <tr key={u.id}><td>{u.name}</td>
                <td><input type="checkbox" aria-label={`${u.name} assigned`} checked={p.memberUids.includes(u.id)} onChange={(e) => act(() => hub.setProjectMembers(uid, p.id, e.target.checked ? [...p.memberUids, u.id] : p.memberUids.filter((m) => m !== u.id)))} /></td>
                <td><input type="checkbox" aria-label={`${u.name} shared`} checked={p.sharedWithUids.includes(u.id)} onChange={(e) => act(() => hub.shareProject(uid, p.id, u.id, e.target.checked))} /></td></tr>))}
          </tbody></table></div>
          <p className="small muted">Access is checked on every read. Removing someone takes effect immediately, even for old links.</p></div>
      )}
      <div className="card"><h2>Access & assignment changes</h2><JournalList events={log} /></div>
    </div>
  );
}

function AuditPanel({ projectId }: { projectId: string }) {
  const { hub, uid } = useMe();
  const [open, setOpen] = useState(false);
  const rows = open ? hub.getAudit(uid, projectId).slice(0, 40) : [];
  return (
    <div className="card flat"><button className="link" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} technical audit history (owner only)</button>
      {open && <div className="tablewrap"><table><thead><tr><th>Time</th><th>Entity</th><th>Action</th><th>Actor</th><th>Before → After</th><th>Reason</th></tr></thead><tbody>
        {rows.map((a) => <tr key={a.id}><td>{formatDateTime(a.recordedAt)}</td><td>{a.entityType}</td><td>{a.action}</td><td>{a.actorLabel}</td><td className="small"><code>{JSON.stringify(a.before)?.slice(0, 80)}</code> → <code>{JSON.stringify(a.after)?.slice(0, 80)}</code></td><td>{a.reason}</td></tr>)}
      </tbody></table></div>}</div>
  );
}
