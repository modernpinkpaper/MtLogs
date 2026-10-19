import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { newKey, useAct, useMe } from '../hubContext';
import { Chip, Empty, Modal, ObservedChip, useNarrow, ProjectStatusChip, SourceChip, StatusChip, StepState, Tabs, VerifyBadge, statusLabel } from '../common';
import { JournalList, ResourceCard, StepResourceRow } from '../parts';
import { JournalFilters } from './Journal';
import { RequestUpdateDialog, SendUpdateDialog } from '../dialogs';
import { ProjectInfo } from '../projectRef';
import { AddStepsDialog, EditableText, LinkFileDialog, NewFileDialog } from '../stepTools';
import { ChangeScheduleDialog, PauseBanner, PauseDialog, PilotPanel, PilotSetupDialog, ResumeDialog, SuggestDialog } from '../pauseUi';
import { deadlineInfo, nextStep, notReadyReason, pauseLine, progressCounts, projectWorkStatus } from '../../domain/projectStatus';
import { formatDate, formatDateTime } from '../../domain/time';
import { CHOICE_LABEL, TERMINAL } from '../../server/hub';
import type { Project, ResourceRole, Step, StepStatus } from '../../domain/types';

type Tab = 'overview' | 'history' | 'files' | 'more';

export function ProjectDetail() {
  const { projectId = '', stepId } = useParams();
  const [sp, setSp] = useSearchParams();
  const { hub, uid, me } = useMe();
  const nav = useNavigate();
  const tab = (sp.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); n.set('tab', t); setSp(n, { replace: true }); };
  const [dlg, setDlg] = useState<null | 'request' | 'update' | 'pause' | 'resume' | 'schedule' | 'suggestPause' | 'suggestResume' | 'pilot' | 'assign' | 'deadline'>(sp.get('assign') && me.role === 'OWNER' ? 'assign' : null);
  const [menu, setMenu] = useState(false);
  const owner = me.role === 'OWNER';

  let project: Project;
  try { project = hub.getProject(uid, projectId); } catch {
    // The same page for "not found" and "not allowed": nothing about the item is revealed.
    return <div className="card bad" role="alert"><h1>Permission denied</h1><p>You cannot open this page.</p><Link to="/projects">Back to projects</Link></div>;
  }
  const steps = hub.projectSteps(uid, projectId);
  const labels = hub.stepLabelsFor(uid, projectId);
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState('');
  const checked = hub.activityCheckedAt(uid, projectId);
  const status = projectWorkStatus(project, steps);
  const paused = status === 'PAUSED';
  const pr = progressCounts(steps);
  const canWork = hub.canWorkOnProject(me, project);
  const canControl = hub.canControlProject(uid, projectId);
  const next = nextStep(steps, project);
  const selected = steps.find((s) => s.id === stepId) ?? next ?? steps[0];
  const blockers = steps.filter((s) => s.status === 'BLOCKED');
  const myReq = hub.outstandingCards(uid).filter((c) => c.cardType === 'OWNER_REQUEST' && c.projectId === projectId);
  const ownerOpenReq = owner ? hub.state.updateRequests.filter((r) => r.projectId === projectId && ['OPEN', 'PARTIALLY_RESPONDED'].includes(r.state)) : [];
  const di = deadlineInfo(project, hub.now);
  const unassigned = owner && project.origin === 'AI_RECOMMENDATION' && !project.memberUids.length && !project.closedAt;
  const [showDetails, setShowDetails] = useState(false);
  const narrow = useNarrow();
  const recentEvents = hub.getJournal(uid, { projectId }).slice(0, 3);
  const latestEvent = recentEvents[0];

  const tabs: { id: Tab; label: string }[] = [{ id: 'overview', label: 'Overview' }, { id: 'history', label: 'History' }, { id: 'files', label: 'All files' }, ...(owner ? [{ id: 'more' as Tab, label: 'More' }] : [])];

  return (
    <div className="stack">
      <nav className="small muted" aria-label="Breadcrumb"><Link to="/projects">Projects</Link> › <Link to={`/projects/${projectId}`}>{project.key}</Link>{stepId && selected ? <> › Step {labels.get(selected.id)}</> : null}</nav>

      <header className="card stack">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, flex: '1 1 340px' }}>
            <div className="row" style={{ gap: '.4rem' }}>
              <span className="eyebrow">{project.key}</span><ProjectInfo projectId={project.id} label={project.key} />
              {status !== 'IN_PROGRESS' && <ProjectStatusChip status={status} />}
              {paused && <Chip tone="violet">{pauseLine(project, owner)}</Chip>}
              {project.visibility === 'OWNER_PRIVATE' && <Chip tone="violet" glyph="🔒">Only Dalia</Chip>}
              {project.pinned && <Chip tone="gray" glyph="📌">Pinned</Chip>}
            </div>
            <h1 style={{ margin: '.2rem 0 0', fontSize: '1.5rem' }}><EditableText value={project.title} canEdit={canWork && !project.closedAt} label="project name" onSave={async (v) => { try { hub.renameProject(uid, project.id, v); return true; } catch (e) { alert((e as Error).message); return false; } }} /></h1>
            <p className="muted proj-obj" style={{ margin: '.35rem 0 0', maxWidth: '64ch' }}>{project.description ?? project.objective}</p>
          </div>
          <div className="row">
            {owner && project.visibility !== 'OWNER_PRIVATE' && <button onClick={() => setDlg('request')}>Ask for an update</button>}
            {!owner && canWork && <button onClick={() => setDlg('update')}>Send Dalia an update</button>}
            {canControl && !paused && status !== 'COMPLETED' && status !== 'CANCELED' && <button className="quiet" onClick={() => setDlg('pause')}>Pause project</button>}
            {canControl && paused && <button className="primary" onClick={() => setDlg('resume')}>Resume project</button>}
            <div className="menu">
              <button className="quiet" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>More ▾</button>
              {menu && (
                <div role="menu" onClick={() => setMenu(false)}>
                  {owner && !project.pilot?.enabled && <button role="menuitem" onClick={() => setDlg('pilot')}>Set up a limited test</button>}
                  {owner && <button role="menuitem" onClick={() => hub.setPinned(uid, project.id, !project.pinned)}>{project.pinned ? 'Unpin from the top' : 'Pin to the top'}</button>}
                  {canControl && <button role="menuitem" onClick={() => setDlg('deadline')}>Change the deadline</button>}
                  {unassigned || (owner && project.visibility !== 'OWNER_PRIVATE') ? <button role="menuitem" onClick={() => setDlg('assign')}>{project.memberUids.length ? 'Add people' : 'Choose who works on it'}</button> : null}
                  {!owner && canWork && !paused && <button role="menuitem" onClick={() => setDlg('suggestPause')}>Suggest pausing</button>}
                  {!owner && canWork && paused && <button role="menuitem" onClick={() => setDlg('suggestResume')}>Suggest resuming</button>}
                  {owner && !project.closedAt && !project.canceledAt && <button role="menuitem" onClick={async () => { try { hub.closeProject(uid, project.id); } catch (e) { alert((e as Error).message); } }}>Mark project complete</button>}
                  {owner && !project.closedAt && !project.canceledAt && <button role="menuitem" onClick={() => hub.cancelProject(uid, project.id)}>Cancel project</button>}
                  {owner && (project.closedAt || project.canceledAt) && <button role="menuitem" onClick={() => hub.reopenProject(uid, project.id)}>Reopen project</button>}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="meta row small muted" style={{ gap: '.4rem 1.25rem' }}>
          <span>{project.memberUids.map((m) => hub.userName(m)).join(', ') || (project.visibility === 'OWNER_PRIVATE' ? 'Only Dalia' : 'Nobody assigned yet')}</span>
          {!paused && di && <span>{di.text}</span>}
          <span>{pr.label}</span>
          <button className="link" onClick={() => setShowDetails(!showDetails)}>{showDetails ? 'Hide details' : 'Show details'}</button>
        </div>
        {canWork && !owner && project.visibility !== 'OWNER_PRIVATE' && (
          <div className="row small" style={{ gap: '.5rem 1rem' }} aria-label="AI activity check">
            <span>{checked.at ? <>AI last checked your activity: <strong>{formatDateTime(checked.at)}</strong></> : <>AI has not checked your activity here yet.</>}</span>
            <button disabled={checking} onClick={async () => { setChecking(true); try { const r = await hub.checkMyActivity(uid, project.id); setCheckNote(r.note); } catch (e) { setCheckNote((e as Error).message); } finally { setChecking(false); } }}>{checking ? 'Checking…' : 'Check my activity now'}</button>
            {checkNote && <span className="muted" role="status">{checkNote}</span>}
          </div>
        )}
        {showDetails && (
          <dl className="kv">
            <dt>Last check in the source system</dt><dd>{project.lastVerifiedAt ? formatDateTime(project.lastVerifiedAt) : 'Nothing checked in the source system yet'}</dd>
            <dt>What is in the way</dt><dd>{blockers.length ? blockers.map((b) => `${b.title}: ${b.blockerReason}`).join('; ') : project.currentRisk ?? 'Nothing so far'}</dd>
            {project.employeeBrief && <><dt>Brief</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{project.employeeBrief}</dd></>}
          </dl>
        )}
      </header>

      {paused && <PauseBanner project={project} onResume={() => setDlg('resume')} onChange={() => setDlg('schedule')} onSuggestResume={() => setDlg('suggestResume')} />}
      {unassigned && <div className="banner warn" role="status"><strong>Approved, but nobody is assigned.</strong> No employee can see this project yet. <button className="primary" onClick={() => setDlg('assign')} style={{ marginLeft: 8 }}>Choose who works on it</button></div>}
      {project.pilot?.enabled && <PilotPanel project={project} />}
      <Tabs<Tab> tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <>
          {(blockers.length > 0 || myReq.length > 0 || ownerOpenReq.length > 0 || (next && selected && next.id !== selected.id)) && (
            <div className="stack">
              {next && selected && next.id !== selected.id && <div className="notice"><span><strong>Next step is Step {labels.get(next.id)}:</strong> {next.title}</span><button className="primary" onClick={() => nav(`/projects/${project.id}/steps/${next.id}`)}>Go to it</button></div>}
              {blockers.map((b) => <div key={b.id} className="banner warn" role="status">⛔ <strong>In the way:</strong> Step {labels.get(b.id)} — {b.blockerReason}</div>)}
              {myReq.length > 0 && <div className="notice"><span><strong>Dalia asked for an update.</strong></span><Link to="/review"><button className="primary">Answer now</button></Link></div>}
              {owner && hub.ownerRequests(uid, project.id).filter((r) => r.stage !== 'CLOSED').slice(0, 4).map((r) => (
                <div key={r.request.id} className="small muted">Your request to {r.recipients.join(', ')}{r.request.stepId ? ` about Step ${labels.get(r.request.stepId) ?? ''}` : ''}: <strong>{{ REQUESTED: 'Requested', SEEN: 'Seen, not answered yet', RESPONDED: 'Answered', OVERDUE: 'Overdue', CLOSED: 'Closed' }[r.stage]}</strong>{r.request.dueAt ? ` · due ${formatDate(r.request.dueAt)}` : ''}</div>))}
            </div>
          )}

          <div className="split">
            <section className="card plan" aria-labelledby="plan">
              {narrow ? (
                <details>
                  <summary id="plan" className="group-title" style={{ margin: 0, cursor: 'pointer' }}>All steps · {pr.label}{selected ? ` · you are on Step ${labels.get(selected.id)}` : ''}</summary>
                  <div style={{ marginTop: 10 }}><StepList steps={steps} labels={labels} selectedId={selected?.id} nextId={next?.id} onPick={(id) => nav(`/projects/${project.id}/steps/${id}`)} project={project} canEdit={canWork} />{canWork && <AddSteps projectId={project.id} />}</div>
                </details>
              ) : (
                <>
                  <h2 id="plan">Steps <span className="small muted" style={{ fontWeight: 400 }}>· {pr.label}</span></h2>
                  <StepList steps={steps} labels={labels} selectedId={selected?.id} nextId={next?.id} onPick={(id) => nav(`/projects/${project.id}/steps/${id}`)} project={project} canEdit={canWork} />
                  {canWork && <AddSteps projectId={project.id} />}
                </>
              )}
            </section>
            {selected && <StepPanel key={selected.id} step={selected} steps={steps} labels={labels} project={project} canWork={canWork} isNext={next?.id === selected.id} paused={paused} onTab={setTab} />}
          </div>
          <details className="soft">
            <summary>Recent project activity{latestEvent ? <span className="muted small" style={{ fontWeight: 400 }}> · Latest: {latestEvent.title}</span> : null}</summary>
            <div className="card" style={{ marginTop: 8 }}>
              <JournalList events={recentEvents} />
              <button className="link" onClick={() => setTab('history')}>Show the full history</button>
            </div>
          </details>
        </>
      )}

      {tab === 'history' && (
        <div className="stack">
          <div className="row"><label className="row" style={{ margin: 0, fontWeight: 500 }}>Show history for <select style={{ width: 'auto' }} value={stepId ?? ''} onChange={(e) => nav(e.target.value ? `/projects/${projectId}/steps/${e.target.value}?tab=history` : `/projects/${projectId}?tab=history`)}><option value="">The entire project</option>{steps.map((s) => <option key={s.id} value={s.id}>Step {labels.get(s.id)}: {s.title.slice(0, 50)}</option>)}</select></label>
            <span className="small muted">Both views read the same notes. They are never two separate diaries.</span></div>
          <JournalFilters key={stepId ?? 'all'} projectId={projectId} stepId={stepId} grouped />
        </div>
      )}

      {tab === 'files' && <FilesTab project={project} canWork={canWork} />}
      {tab === 'more' && owner && <MoreTab project={project} steps={steps} />}

      {dlg === 'request' && <RequestUpdateDialog projectId={project.id} stepId={selected?.id} onClose={() => setDlg(null)} />}
      {dlg === 'update' && <SendUpdateDialog projectId={project.id} stepId={selected?.id} onClose={() => setDlg(null)} />}
      {dlg === 'pause' && <PauseDialog project={project} onClose={() => setDlg(null)} />}
      {dlg === 'resume' && project.pause && <ResumeDialog project={project} onClose={() => setDlg(null)} />}
      {dlg === 'schedule' && project.pause && <ChangeScheduleDialog project={project} onClose={() => setDlg(null)} />}
      {dlg === 'suggestPause' && <SuggestDialog project={project} mode="pause" onClose={() => setDlg(null)} />}
      {dlg === 'suggestResume' && <SuggestDialog project={project} mode="resume" onClose={() => setDlg(null)} />}
      {dlg === 'pilot' && <PilotSetupDialog project={project} onClose={() => setDlg(null)} />}
      {dlg === 'assign' && <AssignDialog project={project} onClose={() => { setDlg(null); const n = new URLSearchParams(sp); n.delete('assign'); setSp(n, { replace: true }); }} />}
      {dlg === 'deadline' && <DeadlineDialog project={project} onClose={() => setDlg(null)} />}
    </div>
  );
}

function StepList({ steps, labels, selectedId, nextId, onPick, project, canEdit }: { steps: Step[]; labels: Map<string, string>; selectedId?: string; nextId?: string; onPick: (id: string) => void; project: Project; canEdit: boolean }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [dragId, setDragId] = useState<string | null>(null);
  const kids = (id: string | null) => steps.filter((s) => s.parentStepId === id).sort((a, b) => a.sortOrder - b.sortOrder);
  const order = (parent: string | null, ids: string[]) => act(() => hub.reorderSteps(uid, project.id, parent, ids), 'New order saved. Numbers and file names follow.');
  const move = (s: Step, dir: -1 | 1) => {
    const ids = kids(s.parentStepId).map((x) => x.id); const i = ids.indexOf(s.id); const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]]; void order(s.parentStepId, ids);
  };
  const drop = (target: Step) => {
    const from = steps.find((x) => x.id === dragId); setDragId(null);
    if (!from || from.id === target.id || from.parentStepId !== target.parentStepId) return;
    const ids = kids(from.parentStepId).map((x) => x.id).filter((x) => x !== from.id);
    ids.splice(ids.indexOf(target.id), 0, from.id); void order(from.parentStepId, ids);
  };
  const render = (s: Step, depth: number): React.ReactNode => (
    <div key={s.id} className={depth ? 'sub' : ''}>
      <div className="steprow" draggable={canEdit} onDragStart={() => setDragId(s.id)} onDragOver={(e) => { if (dragId) e.preventDefault(); }} onDrop={() => drop(s)}>
        {canEdit && <span className="reorder"><span className="handle" aria-hidden="true" title="Drag to move">⠿</span><button className="mini" aria-label={`Move ${labels.get(s.id)} up`} onClick={() => move(s, -1)}>↑</button><button className="mini" aria-label={`Move ${labels.get(s.id)} down`} onClick={() => move(s, 1)}>↓</button></span>}
        <button className={`step ${selectedId === s.id ? 'sel' : ''}`} onClick={() => onPick(s.id)} aria-current={selectedId === s.id ? 'step' : undefined}>
          <div className="row"><span className="num">{labels.get(s.id)}</span><strong style={{ flex: 1, minWidth: 0 }}>{s.title}</strong></div>
          <div className="row" style={{ marginTop: 2, marginLeft: 30 }}>
            <StepState status={s.status} hold={!!s.onHold} />
            {nextId === s.id && !project.pause?.isPaused && <span className="tag-next">Next</span>}
            {s.newActivityAt && s.observedReview === 'PENDING_EMPLOYEE' && !project.pause?.isPaused && <span className="small" style={{ color: 'var(--violet)' }} title="Computer activity was found for this step. A person still needs to confirm it.">✦ activity to check</span>}
          </div>
        </button>
      </div>
      {kids(s.id).map((k) => render(k, depth + 1))}
    </div>
  );
  return <div className="stack">{kids(null).map((s) => render(s, 0))}</div>;
}

function AddSteps({ projectId, parentStepId }: { projectId: string; parentStepId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p><button className="link" onClick={() => setOpen(true)}>{parentStepId ? 'Add sub steps' : 'Add steps'}</button></p>
      {open && <AddStepsDialog projectId={projectId} parentStepId={parentStepId} onClose={() => setOpen(false)} />}
    </>
  );
}

const NEXT: Partial<Record<StepStatus, StepStatus[]>> = {
  NOT_STARTED: ['IN_PROGRESS', 'REPORTED_COMPLETE', 'NOT_APPLICABLE'], IN_PROGRESS: ['BLOCKED', 'WAITING', 'REPORTED_COMPLETE', 'NOT_APPLICABLE'], BLOCKED: ['IN_PROGRESS'], WAITING: ['IN_PROGRESS'],
  REPORTED_COMPLETE: ['VERIFIED_COMPLETE', 'IN_PROGRESS', 'REOPENED'], VERIFIED_COMPLETE: ['REOPENED'], REOPENED: ['IN_PROGRESS', 'BLOCKED', 'WAITING', 'REPORTED_COMPLETE'],
};
const ACTION_LABEL: Partial<Record<StepStatus, string>> = { IN_PROGRESS: 'Back to in progress', BLOCKED: 'Block this step', WAITING: 'Waiting on something', REPORTED_COMPLETE: 'Completed', NOT_APPLICABLE: 'Not needed', VERIFIED_COMPLETE: 'Mark as checked', REOPENED: 'Reopen' };

/** The employee’s workplace: what to do, substeps, files, latest activity, and one way to report progress. */
function StepPanel({ step, steps, labels, project, canWork, isNext, paused: projPaused, onTab }: { step: Step; steps: Step[]; labels: Map<string, string>; project: Project; canWork: boolean; isNext?: boolean; paused?: boolean; onTab: (t: Tab) => void }) {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(step.instructions);
  const [reason, setReason] = useState('');
  const [dlg, setDlg] = useState<null | 'help' | 'update' | 'request' | 'verify' | 'sheet' | 'hold' | 'newSheet' | 'newDoc' | 'link' | 'subs'>(null);
  const [fileMenu, setFileMenu] = useState(false);
  const responseId = sp.get('response');
  const owner = me.role === 'OWNER';
  const paused = !!project.pause?.isPaused;
  const resources = hub.stepResources(uid, step.id);
  const journal = hub.getJournal(uid, { stepId: step.id }).slice(0, 3);
  const children = steps.filter((s) => s.parentStepId === step.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const assigned = step.assignedUids.includes(uid) || owner;
  const why = notReadyReason(step, steps, project);
  const canSignOff = !!step.employeeSignOffAllowed && step.impact === 'ROUTINE';
  const choices = (NEXT[step.status] ?? []).filter((t) => t !== 'REPORTED_COMPLETE' && !(t === 'IN_PROGRESS' && step.status === 'NOT_STARTED')).filter((t) => owner || (assigned && ['IN_PROGRESS', 'BLOCKED', 'WAITING', 'REPORTED_COMPLETE', 'NOT_APPLICABLE'].includes(t)) || (assigned && t === 'VERIFIED_COMPLETE' && canSignOff));
  const move = (to: StepStatus, ownerApproval = false) => act(() => hub.transitionStep(uid, step.id, to, { reason, ownerApproval }), `Saved: ${statusLabel(to)}`);
  const hasCard = hub.outstandingCards(uid).some((c) => c.stepId === step.id && c.cardType !== 'OWNER_REQUEST');
  const ws = hub.projectWorkspace(uid, project.id);

  return (
    <section className="card focal stack" aria-label={`Step ${labels.get(step.id)} details`}>
      {responseId && <ResponseDetail responseId={responseId} />}
      <div>
        {isNext && !projPaused && <div className="eyebrow">Next step</div>}
        <h2 style={{ marginBottom: 2 }}>Step {labels.get(step.id)}: <EditableText value={step.title} canEdit={canWork} label="step name" onSave={async (v) => { try { hub.renameStep(uid, step.id, v); return true; } catch (e) { alert((e as Error).message); return false; } }} /></h2>
        <p className="small muted" style={{ margin: '0 0 4px' }}><EditableText value={step.objective} canEdit={canWork} multiline label="short description" placeholder="Add a short description" onSave={async (v) => { try { hub.setStepDescription(uid, step.id, v); return true; } catch (e) { alert((e as Error).message); return false; } }} /></p>
        <div className="row"><StepState status={step.status} hold={!!step.onHold} />
          {step.verificationSource === 'INDEPENDENT' && <SourceChip source={step.verificationSource} />}
          {step.requiresCheck && <Chip tone="warn" glyph="!" title="Dalia chose to check this one herself.">Dalia will check this one</Chip>}
          {step.dueAt && <span className="small muted">Due {formatDate(step.dueAt)}</span>}
          {['REPORTED_COMPLETE', 'VERIFIED_COMPLETE'].includes(step.status) && step.lastConfirmedAt && <span className="small">Marked done {formatDateTime(step.lastConfirmedAt)}</span>}</div>
        {(paused || why) && <p className="small" style={{ color: 'var(--warn)', margin: '.4rem 0 0' }}>{paused ? 'This project is paused, so this step is not scheduled right now. Your work is saved.' : `Not ready: ${why}`}</p>}
        {step.status === 'REPORTED_COMPLETE' && (step.requiresCheck || step.impact === 'HIGH') && <p className="smallnote" style={{ margin: '.5rem 0 0' }}>{step.humanReported ? `${hub.userName(step.humanReported.byUid)} reported this done.` : 'Reported done.'} {step.requiresCheck ? 'Dalia chose to check this one, so it is waiting for her.' : 'It counts as done. The result has not been checked in Amazon or any other outside system.'}</p>}
        {step.onHold && <p className="small" style={{ margin: '.3rem 0 0' }}>On hold{step.onHold.reason ? `: ${step.onHold.reason}` : ''}. The rest of the project keeps going.</p>}
      </div>

      <div className="row actions">
        {canWork && assigned && step.status === 'NOT_STARTED' && <button className="primary" onClick={() => move('IN_PROGRESS')}>Begin</button>}
        {canWork && assigned && step.status !== 'CANCELLED' && <button className={step.status === 'NOT_STARTED' ? '' : 'primary'} onClick={() => move('REPORTED_COMPLETE')}>Completed</button>}
        {!owner && canWork && <button onClick={() => setDlg('update')}>Update progress</button>}
        {!owner && canWork && <button onClick={() => setDlg('help')}>Ask for help</button>}
        {owner && project.visibility !== 'OWNER_PRIVATE' && <button className="primary" onClick={() => setDlg('request')}>Ask for an update</button>}
      </div>

      {step.observedLevel !== 'NO_EVIDENCE' && (
        <div className="card violet small">
          <div className="row between"><span><strong>{paused ? 'Activity found while paused' : 'We saw computer activity here'}</strong> <ObservedChip level={step.observedLevel} review={step.observedReview} /></span>{hasCard && <Link to="/review"><button>Check it</button></Link>}</div>
          <details><summary>What this means</summary><div>{step.observedNote}</div><div className="muted">The step’s status did not change. Only a person, or a check in the source system, can change it.</div></details>
        </div>
      )}
      {step.humanReported && <div className="small muted">{hub.userName(step.humanReported.byUid)}: {step.humanReported.outcomeText ?? CHOICE_LABEL[step.humanReported.choice]} · {formatDateTime(step.humanReported.at)}{step.humanReported.note ? ` — “${step.humanReported.note}”` : ''}</div>}
      {step.blockerReason && <div className="card bad small">{step.status === 'BLOCKED' ? 'Blocked' : 'Waiting'}: {step.blockerReason}</div>}

      <div className="sect">
        <div className="row between"><h3>What to do</h3>{canWork && <button className="link" onClick={() => { setEditing(!editing); setText(step.instructions); }}>{editing ? 'Cancel' : 'Edit'}</button>}</div>
        {editing ? <div className="stack"><textarea aria-label="Instructions" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 140 }} /><div><button className="primary" onClick={async () => { const r = await act(() => hub.updateInstructions(uid, step.id, text), 'Saved'); if (r) setEditing(false); }}>Save</button></div></div>
          : <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{step.instructions || <span className="muted">No instructions yet. Use Edit to add some.</span>}</p>}
        {step.whyForGoal && <p className="small muted" style={{ margin: '.4rem 0 0' }}><strong>Why:</strong> {step.whyForGoal}</p>}
        {(step.objective || step.acceptance) && <p className="small muted" style={{ margin: '.2rem 0 0' }}>{step.acceptance && <><strong>Done when:</strong> {step.acceptance}</>}</p>}
        {step.dependencyIds.length > 0 && <p className="small muted" style={{ margin: '.2rem 0 0' }}>Comes after: {step.dependencyIds.map((d) => { const s = steps.find((x) => x.id === d); return s ? `Step ${labels.get(s.id)}` : ''; }).join(', ')}</p>}
      </div>

      <div className="sect minor">
        <div className="row between"><h3>Sub steps</h3>{canWork && <button className="link" onClick={() => setDlg('subs')}>Add sub steps</button>}</div>
        {children.length === 0 && step.checklist.length === 0 && <p className="small muted" style={{ margin: 0 }}>None yet.</p>}
        {step.checklist.map((c) => (
          <label key={c.id} style={{ fontWeight: 500, display: 'flex', gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={c.done} disabled={!canWork} onChange={() => act(() => hub.toggleChecklist(uid, step.id, c.id))} /> {c.text}</label>))}
        {children.map((c) => (
          <div key={c.id} className="row between subrow">
            <span><span className="num">{labels.get(c.id)}</span> <EditableText value={c.title} canEdit={canWork} label={`sub step ${labels.get(c.id)} name`} onSave={async (v) => { try { hub.renameStep(uid, c.id, v); return true; } catch (e) { alert((e as Error).message); return false; } }} /> <StepState status={c.status} /></span>
            {canWork && c.assignedUids.includes(uid) && <span className="row" style={{ gap: 6 }}>
              {c.status === 'NOT_STARTED' && <button className="pill-btn" onClick={() => act(() => hub.transitionStep(uid, c.id, 'IN_PROGRESS', {}), 'Started')}>Begin</button>}
              {c.status !== 'REPORTED_COMPLETE' && c.status !== 'VERIFIED_COMPLETE' && c.status !== 'CANCELLED' && <button className="pill-btn" onClick={() => act(() => hub.transitionStep(uid, c.id, 'REPORTED_COMPLETE', {}), 'Completed')}>Completed</button>}
            </span>}
          </div>))}
      </div>

      <div className="sect minor">
        <div className="row between"><h3>Files for this step</h3>{canWork && (
          <div className="menu"><button className="quiet" aria-haspopup="menu" aria-expanded={fileMenu} onClick={() => setFileMenu(!fileMenu)}>Add file ▾</button>
            {fileMenu && <div role="menu" onClick={() => setFileMenu(false)}>
              <button role="menuitem" onClick={() => setDlg('newSheet')}>New Google Sheet</button>
              <button role="menuitem" onClick={() => setDlg('newDoc')}>New Google Doc</button>
              <button role="menuitem" onClick={() => setDlg('link')}>Link a file I already have</button>
              {ws?.state === 'READY' && <button role="menuitem" onClick={() => setDlg('sheet')}>Create a checklist sheet</button>}
            </div>}
          </div>)}</div>
        {resources.length === 0 && <p className="small muted" style={{ margin: 0 }}>No files are linked to this step yet.</p>}
        {(() => {
          // The approved working document and every file the person needs are always shown. Only secondary files fold away.
          const PRIMARY = ['INPUT', 'INSTRUCTIONS', 'WORKING', 'AUTOMATION_TOOL', 'SOURCE_IMAGES', 'CHECKLIST', 'APPROVED_FINAL'];
          const inputs = resources.filter((x) => x.link.role === 'INPUT');
          const unapproved = inputs.length > 1 && inputs.every((x) => !hub.approvalIsRecorded(x.resource));
          const rank = (x: (typeof resources)[number]) => (hub.approvalIsRecorded(x.resource) ? 0 : x.resource.pendingApproval ? 1 : 2);
          const ordered = [...resources].sort((a, b) => rank(a) - rank(b));
          const main = ordered.filter((x) => PRIMARY.includes(x.link.role) || x.link.associationState === 'SUGGESTED');
          const more = ordered.filter((x) => !main.includes(x));
          const sib = inputs.map((x) => x.resource);
          return (
            <>
              {unapproved && <div className="smallnote" role="status" style={{ margin: '.4rem 0' }}><strong>{inputs.length} copies of this file exist and none is chosen yet.</strong> A name like “FINAL” does not decide it. Pick the one to use below. It is saved with who chose it and when.</div>}
              {main.map(({ link, resource }) => <StepResourceRow key={link.id} resource={resource} role={link.role} roleLabel={ROLE_LABEL[link.role]} suggested={link.associationState === 'SUGGESTED'} siblings={link.role === 'INPUT' ? sib : []} />)}
              {more.length > 0 && (
                <details className="soft"><summary>More files ({more.length})</summary>
                  {more.map(({ link, resource }) => <StepResourceRow key={link.id} resource={resource} role={link.role} roleLabel={ROLE_LABEL[link.role]} />)}
                </details>
              )}
            </>
          );
        })()}
        <button className="link" onClick={() => onTab('files')}>See the full file library</button>
      </div>

      <details className="soft">
        <summary>Recent activity on this step{journal.length ? ` (${journal.length})` : ''}</summary>
        <div style={{ marginTop: 8 }}><JournalList events={journal} /><button className="link" onClick={() => nav(`/projects/${project.id}/steps/${step.id}?tab=history`)}>Show the full history for this step</button></div>
      </details>

      <div className="stack">
        <details>
          <summary className="small">More</summary>
          <div className="stack" style={{ marginTop: 8 }}>
                        {choices.length === 0 ? <span className="muted small">No status changes are available to you right now.</span> : (
              <>
                <input type="text" aria-label="Reason or note" placeholder="Why? (needed if blocked)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="row">{choices.map((t) => <button key={t} onClick={() => move(t)}>{ACTION_LABEL[t] ?? statusLabel(t)}</button>)}
                  {owner && step.status === 'REPORTED_COMPLETE' && step.requiresCheck && !step.verifications.some((v) => v.result === 'CONFIRMED') && <button className="danger" onClick={() => move('VERIFIED_COMPLETE', true)}>Mark it checked myself</button>}</div>
              </>
            )}
            {canWork && assigned && !owner && <div className="row">
              {step.onHold ? <button onClick={() => act(() => hub.releaseStep(uid, step.id), 'Step is active again')}>Take this step off pause</button> : <button onClick={() => setDlg('hold')}>Pause this step</button>}</div>}
            {owner && <div className="row">
              {step.onHold ? <button onClick={() => act(() => hub.releaseStep(uid, step.id), 'Step is active again')}>Take this step off pause</button> : <button onClick={() => setDlg('hold')}>Pause this step</button>}
              <button onClick={() => setDlg('verify')}>Add a practice check in the source system</button>
              <button onClick={() => act(() => hub.setStepRequiresCheck(uid, step.id, !step.requiresCheck), step.requiresCheck ? 'You will not be asked to check this one' : 'You will be asked to check this one')}>{step.requiresCheck ? 'Stop asking me to check this one' : 'I want to check this one myself'}</button></div>}
          </div>
        </details>
        {step.verifications.length > 0 && (
          <div><h3>Checks in the source system</h3>{step.verifications.map((v) => (
            <div key={v.id} className="small"><VerifyBadge state={v.result === 'CONFIRMED' ? 'INDEPENDENTLY_VERIFIED' : 'NEEDS_REVIEW'} /> {v.verifier} (practice) — {v.entity}: <strong>{v.result === 'CONFIRMED' ? 'it matches' : v.result === 'NOT_FOUND' ? 'not found' : 'does not match'}</strong>. {v.detail} · {formatDateTime(v.at)}</div>))}</div>
        )}
      </div>

      {dlg === 'update' && <SendUpdateDialog projectId={project.id} stepId={step.id} onClose={() => setDlg(null)} />}
      {dlg === 'request' && <RequestUpdateDialog projectId={project.id} stepId={step.id} onClose={() => setDlg(null)} />}
      {dlg === 'help' && <HelpDialog step={step} onClose={() => setDlg(null)} />}
      {dlg === 'verify' && <VerifyDialog step={step} onClose={() => setDlg(null)} />}
      {dlg === 'sheet' && <SheetDialog project={project} step={step} onClose={() => setDlg(null)} />}
      {dlg === 'hold' && <HoldDialog step={step} label={labels.get(step.id) ?? ''} onClose={() => setDlg(null)} />}
      {dlg === 'newSheet' && <NewFileDialog project={project} step={step} kind="SHEET" onClose={() => setDlg(null)} />}
      {dlg === 'newDoc' && <NewFileDialog project={project} step={step} kind="DOC" onClose={() => setDlg(null)} />}
      {dlg === 'link' && <LinkFileDialog step={step} onClose={() => setDlg(null)} />}
      {dlg === 'subs' && <AddStepsDialog projectId={project.id} parentStepId={step.id} onClose={() => setDlg(null)} />}
    </section>
  );
}

export const ROLE_LABEL: Record<ResourceRole, string> = {
  INSTRUCTIONS: 'Instructions', WORKING: 'Working document', CHECKLIST: 'Checklist', INPUT: 'Input file', SOURCE_IMAGES: 'Images', AUTOMATION_TOOL: 'Script or tool', OUTPUT: 'Result file',
  APPROVED_FINAL: 'Final version', VALIDATION: 'Report', REFERENCE: 'Reference', PRODUCTION_ASSET: 'Production file',
};

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
    <div className="card pink stack" role="region" aria-label="The answer">
      <div className="row between"><strong>{resp.requestId ? 'The answer to your request' : 'An update nobody asked for'}</strong><Chip tone="info" glyph="☑">Employee confirmed (not checked in the source system)</Chip></div>
      {req && <div className="small"><span className="muted">You asked:</span> “{req.question ?? 'How is it going?'}” · {formatDateTime(req.createdAt)}</div>}
      <div><strong>{hub.userName(resp.fromUid)}</strong> answered <strong>{CHOICE_LABEL[resp.choice]}</strong> · {formatDateTime(resp.submittedAt)}</div>
      {resp.note && <blockquote style={{ margin: 0, paddingLeft: 10, borderLeft: '3px solid var(--pink)' }}>{resp.note}</blockquote>}
      {resp.evidenceLinks.length > 0 && <div className="small">Link or file: {resp.evidenceLinks.join(', ')}</div>}
      {me.role === 'OWNER' && (
        <div className="row">
          {note && !note.acknowledgedAt && <button className="primary" onClick={() => act(() => hub.acknowledge(uid, note.id), 'Marked as seen')}>I saw this</button>}
          {note?.acknowledgedAt && <Chip tone="ok" glyph="✔">Seen {formatDateTime(note.acknowledgedAt)}</Chip>}
          {req && <button onClick={() => setFu(true)}>Ask a follow-up</button>}
          {req && req.state !== 'CLOSED' && <button onClick={() => act(() => hub.closeRequest(uid, req.id), 'Request closed')}>Close this request</button>}
        </div>
      )}
      {fu && req && (
        <Modal title="Ask a follow-up" onClose={() => setFu(false)}>
          <div className="stack"><p className="small muted">This sends a new request. {hub.userName(resp.fromUid)}’s first answer stays just as it is.</p>
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
        <p className="small">Dalia gets a note that you need help with this step. The step status stays the same unless you change it.</p>
        <textarea aria-label="What do you need?" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What do you need help with?" />
        <div className="row"><button className="primary" disabled={!note.trim()} onClick={async () => { const r = await act(() => hub.sendProactiveUpdate(uid, { projectId: step.projectId, stepId: step.id, choice: 'BLOCKED', note, needsOwnerHelp: true, idempotencyKey: key.current }), 'Dalia has been notified'); if (r) onClose(); }}>Send to Dalia</button></div>
      </div>
    </Modal>
  );
}

function HoldDialog({ step, label, onClose }: { step: Step; label: string; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [why, setWhy] = useState('');
  return (
    <Modal title={`Pause step ${label}`} onClose={onClose}>
      <div className="stack">
        <p className="small muted">Only this step waits. The rest of the project keeps going. The step keeps its status.</p>
        <div><label htmlFor="hd-why">Why? (if you want)</label><input id="hd-why" type="text" value={why} onChange={(e) => setWhy(e.target.value)} /></div>
        <div className="row"><button className="primary" onClick={async () => { const r = await act(() => hub.holdStep(uid, step.id, why), 'Step is paused'); if (r) onClose(); }}>Pause</button><button onClick={onClose}>Cancel</button></div>
      </div>
    </Modal>
  );
}

function SheetDialog({ project, step, onClose }: { project: Project; step: Step; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [title, setTitle] = useState(`${project.key} checklist`);
  const [rows, setRows] = useState(5);
  return (
    <Modal title="Create a checklist sheet" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await act(() => hub.createChecklistSheet(uid, project.id, step.id, title, rows), 'Sheet created in the project folder (practice)'); if (r) onClose(); }}>
        <p className="small muted">Use a sheet when the work goes row by row, like a list of SKUs. It is created inside the project folder. A ticked box is not proof that a listing is live.</p>
        <div><label htmlFor="sh-t">Sheet name</label><input id="sh-t" type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label htmlFor="sh-r">How many rows?</label><input id="sh-r" type="number" min={1} value={rows} onChange={(e) => setRows(Number(e.target.value))} style={{ maxWidth: 140 }} /></div>
        <div className="row"><button className="primary" type="submit" disabled={!title.trim()}>Create sheet</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
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
    <Modal title="Add a practice check in the source system" onClose={onClose}>
      <div className="stack">
        <div className="card violet small">This pretends to be a system that looks things up in Shopify or Amazon. It adds a note next to the earlier notes. It does not finish the step by itself.</div>
        <div><label htmlFor="v-e">What was checked</label><input id="v-e" type="text" value={entity} onChange={(e) => setEntity(e.target.value)} /></div>
        <div><label htmlFor="v-r">Result</label><select id="v-r" value={result} onChange={(e) => setResult(e.target.value as typeof result)}><option value="CONFIRMED">It matches</option><option value="NOT_FOUND">Not found</option><option value="MISMATCH">Does not match</option></select></div>
        <div><label htmlFor="v-d">Detail</label><input id="v-d" type="text" value={detail} onChange={(e) => setDetail(e.target.value)} /></div>
        <button className="primary" onClick={async () => { const r = await act(() => hub.recordVerification(uid, step.id, { verifier: step.projectId === 'prj-081' ? 'Amazon family lookup' : 'Shopify product lookup', entity, result, detail: detail || (result === 'CONFIRMED' ? 'Matches the expected state' : 'Does not match the expected state') }), 'Check saved'); if (r) onClose(); }}>Save check</button>
      </div>
    </Modal>
  );
}

function DeadlineDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [d, setD] = useState('');
  return (
    <Modal title="Change the deadline" onClose={onClose}>
      <div className="stack">
        <p className="small muted">The old date is kept in the history. Deadlines never move by themselves.</p>
        <input type="date" aria-label="New deadline" value={d} onChange={(e) => setD(e.target.value)} style={{ maxWidth: 220 }} />
        <div className="row"><button className="primary" disabled={!d} onClick={async () => { const r = await act(() => hub.setProjectDeadline(uid, project.id, d), 'Deadline changed'); if (r) onClose(); }}>Save deadline</button>
          <button onClick={async () => { const r = await act(() => hub.setProjectDeadline(uid, project.id, null), 'Deadline removed'); if (r) onClose(); }}>Remove deadline</button></div>
      </div>
    </Modal>
  );
}

export function AssignDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const key = useRef(newKey('assign'));
  const people = hub.listUsers(uid).filter((u) => u.role === 'EMPLOYEE' && u.active);
  const [picked, setPicked] = useState<string[]>([]);
  const finding = hub.state.ownerFindings.find((f) => f.approvedProjectId === project.id);
  const suggestions = finding?.plan?.suggestedAssignees ?? [];
  return (
    <Modal title={`Who works on ${project.key}?`} onClose={onClose}>
      <div className="stack">
        <p className="small muted">Only you can assign people. When you do, they get the project brief, the steps and a notification. Until then, nobody can see this project.</p>
        {suggestions.length > 0 && (
          <div className="card violet small"><strong>Suggestions from the AI (you decide):</strong>
            {suggestions.map((s) => <div key={s.uid}>{hub.userName(s.uid)} — {s.caveat}</div>)}</div>
        )}
        <fieldset style={{ border: 'none', padding: 0 }}><legend style={{ fontWeight: 600 }}>People</legend>
          {people.map((u) => <label key={u.id} style={{ fontWeight: 500 }}><input type="checkbox" checked={picked.includes(u.id) || project.memberUids.includes(u.id)} disabled={project.memberUids.includes(u.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, u.id] : picked.filter((x) => x !== u.id))} /> {u.name}{project.memberUids.includes(u.id) ? ' (already on it)' : ''}</label>)}
        </fieldset>
        <div className="row"><button className="primary" disabled={!picked.length} onClick={async () => { const r = await act(() => hub.assignProject(uid, project.id, picked, key.current), 'Assigned. They have a notification.'); if (r) onClose(); }}>Assign</button><button onClick={onClose}>Not yet</button></div>
      </div>
    </Modal>
  );
}

function FilesTab({ project, canWork }: { project: Project; canWork: boolean }) {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const ws = hub.projectWorkspace(uid, project.id);
  const all = hub.projectResources(uid, project.id);
  const [sheet, setSheet] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const owner = me.role === 'OWNER';
  const labels = hub.stepLabelsFor(uid, project.id);
  const steps = hub.projectSteps(uid, project.id);
  // Files grouped by step, in step order. Files that belong to the whole project come first.
  const groups = [{ key: 'project', title: 'Whole project', stepId: null as string | null }, ...steps.slice().sort((a, b) => (labels.get(a.id) ?? '').localeCompare(labels.get(b.id) ?? '', undefined, { numeric: true })).map((st) => ({ key: st.id, title: `Step ${labels.get(st.id)} · ${st.title}`, stepId: st.id as string | null }))]
    .map((g) => {
      const byRes = new Map<string, typeof all>();
      all.filter((x) => (x.link.stepId ?? null) === g.stepId).forEach((x) => byRes.set(x.resource.id, [...(byRes.get(x.resource.id) ?? []), x]));
      return { key: g.key, title: g.title, items: [...byRes.values()] };
    }).filter((g) => g.items.length);
  return (
    <div className="stack">
      {ws && (
        <section className="card stack" aria-labelledby="folder">
          <div className="row between"><h2 id="folder">Project folder</h2>
            <div className="row">{ws.state === 'READY' && ws.folderUrl && <button onClick={() => setViewer(ws.folderUrl)}>Open project folder</button>}
              {ws.state === 'READY' && canWork && <button onClick={() => setSheet(true)}>Create a checklist sheet</button>}
              {owner && ws.state !== 'READY' && <button className="primary" onClick={() => act(() => hub.provisionWorkspace(uid, project.id, newKey('retry')), 'Tried again (practice)')}>Try again</button>}</div></div>
          {ws.state !== 'READY' ? <p className="small" style={{ color: 'var(--warn)' }}>{ws.state === 'CREATING' ? 'Creating the folder…' : 'The folder is not finished yet. It will not be created twice when you try again.'}</p> : (
            <>
              <div className="small"><strong>Subfolders:</strong> {ws.subfolders.map((s) => s.name).join(' · ')}</div>
              {ws.shortcuts.map((s) => <div key={s.name} className="small">🔗 {s.name} {s.canOpen ? <Chip tone="ok">Shortcut to the original</Chip> : <Chip tone="warn" glyph="!">Request access</Chip>}{s.note && <span className="muted"> {s.note}</span>}</div>)}
              {ws.pointers.map((p) => <div key={p.path} className="small">📍 {p.label} stays here: <code>{p.path}</code> {p.version ? `(version ${p.version})` : ''}</div>)}
            </>
          )}
          {ws.ownerOnly && (
            <details className="small"><summary>What the folder tool did (practice, only you see this)</summary>
              {ws.ownerOnly.lastError && <p style={{ color: 'var(--bad)' }}>Last error: {ws.ownerOnly.lastError}</p>}
              <ul style={{ margin: '.3rem 0 0 1.1rem' }}>{ws.ownerOnly.log.map((l, i) => <li key={i}>{formatDateTime(l.at)} — {l.op}: {l.detail}</li>)}</ul></details>
          )}
        </section>
      )}
      {groups.map((g) => (
        <section key={g.key}><h2 className="group-title">{g.title} <span className="count">{g.items.length}</span></h2>
          <div className="grid cols-2">{g.items.map((xs) => <ResourceCard key={xs[0].resource.id} resource={xs[0].resource} links={xs.map((x) => ({ ...x.link, projectKey: project.key, stepTitle: x.stepTitle }))} />)}</div></section>
      ))}
      {all.length === 0 && !ws && <Empty>No files are linked to this project yet.</Empty>}
      {sheet && <SheetDialog project={project} step={{ id: '', sortOrder: 0 } as Step} onClose={() => setSheet(false)} />}
      {viewer && <Modal title="Project folder" onClose={() => setViewer(null)}><div className="card violet">This is a practice preview. In the real app this opens your Google Drive folder (<code>{viewer}</code>). This copy never talks to Google.</div></Modal>}
    </div>
  );
}

function MoreTab({ project, steps }: { project: Project; steps: Step[] }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const employees = hub.listUsers(uid).filter((u) => u.role === 'EMPLOYEE' && u.active);
  const verified = steps.flatMap((s) => s.verifications.map((v) => ({ s, v })));
  const [open, setOpen] = useState(false);
  const rows = open ? hub.getAudit(uid, project.id).slice(0, 40) : [];
  return (
    <div className="stack">
      <section className="card stack" aria-labelledby="ppl"><h2 id="ppl">Who works on this project</h2>
        {project.visibility === 'OWNER_PRIVATE' ? <p className="muted">Private: only you can see it. To share it, change who can see it first. Employees cannot see it, its files, its history, or even that it exists.</p> : (
          <div className="tablewrap"><table><thead><tr><th>Person</th><th>Works on it</th><th>Can only look</th><th>May pause and resume</th></tr></thead><tbody>
            {employees.map((u) => (
              <tr key={u.id}><td>{u.name}</td>
                <td><input type="checkbox" aria-label={`${u.name} works on it`} checked={project.memberUids.includes(u.id)} onChange={(e) => act(() => hub.setProjectMembers(uid, project.id, e.target.checked ? [...project.memberUids, u.id] : project.memberUids.filter((m) => m !== u.id)))} /></td>
                <td><input type="checkbox" aria-label={`${u.name} can only look`} checked={project.sharedWithUids.includes(u.id)} onChange={(e) => act(() => hub.shareProject(uid, project.id, u.id, e.target.checked))} /></td>
                <td><input type="checkbox" aria-label={`${u.name} may pause and resume`} disabled={!project.memberUids.includes(u.id)} checked={project.managerUids.includes(u.id)} onChange={(e) => act(() => hub.setProjectManagers(uid, project.id, e.target.checked ? [...project.managerUids, u.id] : project.managerUids.filter((m) => m !== u.id)))} /></td></tr>))}
          </tbody></table></div>
        )}
        <p className="small muted">We check access every time. If you remove someone, they lose access right away, even with an old link.</p></section>
      <section className="card" aria-labelledby="res"><h2 id="res">Results</h2>
        <p>{project.impactPlan ? <>Goal: {project.impactPlan.target}. What we saw: {project.impactPlan.observed ?? <em>Not measured yet</em>}</> : <em>Not measured yet. We do not guess how much time or money was saved.</em>}</p>
        <h3>Checks in the source system</h3>{verified.length === 0 ? <span className="muted small">None yet.</span> : verified.map(({ s, v }) => <div key={v.id} className="small">Step {hub.stepLabelsFor(uid, project.id).get(s.id)}: {v.entity} — {v.result === 'CONFIRMED' ? 'it matches' : v.result === 'NOT_FOUND' ? 'not found' : 'does not match'} ({v.verifier}, practice) · {formatDateTime(v.at)}</div>)}</section>
      <section className="card"><button className="link" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} the detailed change log (only you can see this)</button>
        {open && <div className="tablewrap"><table><thead><tr><th>Time</th><th>What</th><th>Who</th><th>Before → After</th><th>Why</th></tr></thead><tbody>
          {rows.map((a) => <tr key={a.id}><td>{formatDateTime(a.recordedAt)}</td><td>{a.entityType} · {a.action.replace(/_/g, ' ').toLowerCase()}</td><td>{a.actorLabel}</td><td className="small"><code>{JSON.stringify(a.before)?.slice(0, 70)}</code> → <code>{JSON.stringify(a.after)?.slice(0, 70)}</code></td><td>{a.reason}</td></tr>)}</tbody></table></div>}</section>
    </div>
  );
}
