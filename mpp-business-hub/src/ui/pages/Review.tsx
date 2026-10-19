import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { newKey, useAct, useMe } from '../hubContext';
import { ChoiceGroup, LogTaskDialog } from '../dialogs';
import { Chip, CoverageChip, Empty, statusLabel } from '../common';
import { formatDateTime, formatTime } from '../../domain/time';
import { WORDS } from '../lang';
import type { ResponseChoice, ReviewCard, ReviewOutcome } from '../../domain/types';
import { matchReason, reviewSpec, shortProjectName } from '../../domain/reviewKinds';
import { ProjectLabel } from '../projectRef';

/**
 * Review my work. One clear question per card.
 * Two kinds of card: (1) “Did this happen?” about something the system noticed, (2) “Dalia asked for an update”.
 */
export function Review() {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const [sp] = useSearchParams();
  const cards = hub.listReviewCards(uid);
  const shift = hub.openShift(uid);
  const offClock = me.role === 'EMPLOYEE' && !shift;
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [mixedMsg, setMixedMsg] = useState(false);
  const [logging, setLogging] = useState(false);
  const bulkKey = useRef(newKey('bulk'));
  const requests = cards.filter((c) => c.cardType === 'OWNER_REQUEST');
  const findings = cards.filter((c) => c.cardType !== 'OWNER_REQUEST');
  const firstId = (requests[0] ?? findings[0])?.id;
  const eligible = (c: ReviewCard) => c.canBulkReview;
  const eligibleCount = findings.filter(eligible).length;
  const done = hub.listReviewCards(uid, 'all').filter((c) => c.status === 'SUBMITTED').slice(-5).reverse();
  const pickedCards = findings.filter((c) => picked.includes(c.id));

  const confirmSelected = async () => {
    setMixedMsg(false);
    const r = await act(() => hub.bulkConfirm(uid, picked, bulkKey.current));
    if (!r) return;
    if (r.refused.length) setMixedMsg(true);
    if (r.confirmed.length) { act(() => null, `Confirmed ${r.confirmed.length} item${r.confirmed.length === 1 ? '' : 's'} as accurate`); bulkKey.current = newKey('bulk'); }
    setPicked(r.refused.map((x) => x.id));
    if (!r.refused.length) setSelecting(false);
  };

  return (
    <div className="stack">
      <div>
        <h1>Review my work</h1>
        <p className="muted" style={{ margin: 0 }}>Check what the system noticed, and answer Dalia’s requests. About 1 to 3 minutes. It is paid time. {me.role === 'EMPLOYEE' && <button className="link" onClick={() => setLogging(true)}>Log something I did</button>}</p>
      </div>
      {offClock && <div className="card warn" role="status">Reviews are paid work, so you answer them while clocked in. <Link to="/clock">Clock in</Link> first. Your items will wait for you.</div>}
      {cards.length === 0 && <Empty>Nothing to review right now. {hub.reviewReadiness(uid).message}</Empty>}

      {requests.length > 0 && (
        <section aria-labelledby="rq"><h2 id="rq" className="group-title">Dalia asked you <span className="count">{requests.length}</span></h2>
          <div className="stack">{requests.map((c) => <CardView key={c.id} first={c.id === firstId} card={c} highlight={sp.get('card') === c.id} disabled={offClock} />)}</div></section>
      )}

      {findings.length > 0 && (
        <section aria-labelledby="fd">
          <div className="row between"><h2 id="fd" className="group-title" style={{ margin: 0 }}>Work we noticed <span className="count">{findings.length}</span></h2>
            {eligibleCount > 1 && !offClock && <button onClick={() => { setSelecting(!selecting); setPicked([]); setMixedMsg(false); }} aria-pressed={selecting}>{selecting ? 'Stop selecting' : WORDS.selectMultiple}</button>}</div>
          {selecting && (
            <div className="card flat" role="region" aria-label="Select multiple items">
              <p className="small" style={{ margin: 0 }}>Choose the items where what we noticed is accurate, then confirm them together. This only says the activity is accurate. It never says the work is finished. Items about results, uploads or big steps need their own answer.</p>
            </div>
          )}
          <div className="stack" style={{ marginTop: 8 }}>
            {findings.map((c) => (
              <CardView key={c.id} first={c.id === firstId} card={c} highlight={sp.get('card') === c.id} disabled={offClock}
                select={selecting ? (eligible(c) ? { checked: picked.includes(c.id), onChange: (v) => setPicked(v ? [...picked, c.id] : picked.filter((x) => x !== c.id)) } : 'blocked') : undefined} />
            ))}
          </div>
          {selecting && (
            <div className="card pink stack" style={{ position: 'sticky', bottom: 70 }} role="region" aria-label="Confirm selected items">
              <strong>{picked.length === 0 ? 'No items selected yet' : `${picked.length} item${picked.length === 1 ? '' : 's'} selected`}</strong>
              {pickedCards.length > 0 && <ul className="small" style={{ margin: '0 0 0 1.1rem' }}>{pickedCards.map((c) => <li key={c.id}>{c.title} — {c.projectId ? hub.getProject(uid, c.projectId).key : 'no project'}</li>)}</ul>}
              <p className="small muted" style={{ margin: 0 }}>This only says that what we noticed is accurate. It does not mark any work as finished.</p>
              {mixedMsg && <p role="alert" style={{ margin: 0, color: 'var(--bad)' }}>{WORDS.mixedSelection}</p>}
              <div className="row"><button className="primary" disabled={!picked.length} onClick={confirmSelected}>{WORDS.confirmSelected}</button></div>
            </div>
          )}
        </section>
      )}
      {logging && <LogTaskDialog onClose={() => setLogging(false)} />}
      {done.length > 0 && (
        <details className="card flat"><summary>Done recently ({done.length})</summary>
          {done.map((c) => <div key={c.id} className="small muted">{c.title} — {formatDateTime(c.lastUpdatedAt)}</div>)}
        </details>
      )}
    </div>
  );
}

type SelectProp = { checked: boolean; onChange: (v: boolean) => void } | 'blocked' | undefined;

function CardView({ card, highlight, disabled, select, first }: { card: ReviewCard; highlight: boolean; disabled: boolean; select?: SelectProp; first?: boolean }) {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const key = useRef(newKey('card'));
  const project = card.projectId ? hub.getProject(uid, card.projectId) : null;
  const step = card.stepId ? hub.getStep(uid, card.stepId) : null;
  const findings = card.findingIds.length ? hub.cardFindings(uid, card.id) : [];
  const f0 = findings[0];
  const isRequest = card.cardType === 'OWNER_REQUEST';
  const req = card.updateRequestId ? hub.getRequest(uid, card.updateRequestId) : null;
  const paused = !!project?.pause?.isPaused;
  const tool = step ? hub.stepResources(uid, step.id).find((x) => x.link.role === 'AUTOMATION_TOOL')?.resource.label : null;
  const spec = f0 ? reviewSpec(f0, step, tool) : null;
  const [choice, setChoice] = useState<ResponseChoice | 'NOT_SURE' | null>(null);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [note, setNote] = useState('');
  const [help, setHelp] = useState(false);
  const [link, setLink] = useState('');
  const [showAct, setShowAct] = useState(false);
  const [corr, setCorr] = useState<'WRONG_STEP' | 'WRONG_PERSON' | 'OTHER'>('WRONG_STEP');
  const [cls, setCls] = useState<'LINK_EXISTING' | 'NEW_STEP' | 'ROUTINE' | 'POTENTIAL_PROJECT'>('ROUTINE');
  const [linkStep, setLinkStep] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const projects = hub.listProjects(uid).filter((p) => p.visibility !== 'OWNER_PRIVATE');
  const mine = projects.filter((p) => p.memberUids.includes(uid) || hub.isOwner(uid));
  const [clsProject, setClsProject] = useState(mine[0]?.id ?? '');
  const evs = f0 ? hub.findingEvidence(uid, f0.id) : [];
  const start = () => { void act(() => hub.startReview(uid, card.id)); };

  const submit = async (action: 'CONFIRM' | 'NOT_MY_WORK' | 'DISMISS' | 'DEFER' | 'SEND_STATUS', okMsg: string) => {
    const unmatched = f0?.findingType === 'AI_UNMATCHED_WORK' && action === 'CONFIRM';
    const classification = unmatched ? { kind: cls, projectId: cls === 'LINK_EXISTING' || cls === 'NEW_STEP' ? clsProject : undefined, stepId: cls === 'LINK_EXISTING' ? linkStep : undefined, newStepTitle: newTitle } : null;
    await act(() => hub.submitDecision(uid, card.id, {
      action, statusAnswer: choice && choice !== 'NOT_SURE' ? choice : null, note, evidenceLinks: link ? [link] : [], needsOwnerHelp: help, classification, idempotencyKey: key.current,
    }), okMsg);
  };

  const wrongStepOk = corr !== 'WRONG_STEP' || !!linkStep;
  const sendOutcome = async () => {
    if (!outcome) return;
    if (outcome === 'NOT_SURE') { await submit('DEFER', 'Saved for your next paid shift'); return; }
    const correction = outcome === 'MISREAD' ? (corr === 'WRONG_STEP' ? { kind: 'WRONG_STEP' as const, projectId: clsProject, stepId: linkStep } : { kind: corr }) : null;
    const msg = outcome === 'NOT_ME' ? 'Saved. We kept the activity and did not credit it to you.' : outcome === 'MISREAD' ? 'Thanks. We saved your fix next to the AI’s guess.' : outcome === 'PROBLEM' ? 'Sent. Dalia can see you ran into a problem.' : 'Thank you. Saved.';
    await act(() => hub.submitDecision(uid, card.id, { outcome, correction, note, correctionText: outcome === 'MISREAD' && corr === 'OTHER' ? note : undefined, needsOwnerHelp: help, idempotencyKey: key.current }), msg);
  };
  const canSend = !!outcome && (outcome !== 'MISREAD' || (corr === 'OTHER' ? !!note.trim() : wrongStepOk));
  const fmt = (iso: string) => formatTime(iso);
  const window = evs.length ? (fmt(evs[0].occurredAt) === fmt(evs[evs.length - 1].occurredAt) ? fmt(evs[0].occurredAt) : `${fmt(evs[0].occurredAt)} to ${fmt(evs[evs.length - 1].occurredAt)}`) : null;

  return (
    <article className={`card ${first ? 'focal' : ''} ${isRequest && !first ? 'pink' : ''} ${highlight ? 'focus' : ''}`} aria-labelledby={`t-${card.id}`} onFocus={start} onMouseEnter={start}>
      <div className="row between">
        <div style={{ minWidth: 0 }}>
          <div className="row small muted" style={{ gap: '.3rem .75rem' }}>
            {project && <span><ProjectLabel projectId={project.id} text={project.key} /> · {shortProjectName(project)}{step ? <> · <Link to={`/projects/${project.id}/steps/${step.id}`}>Step {hub.stepLabelsFor(uid, step.projectId).get(step.id)}</Link></> : null}</span>}
            <span>{formatDateTime(card.createdAt)}</span>
            {card.provisional && <Chip tone="warn" glyph="…" title="We are still reading today’s activity. This may change.">{WORDS.checkingToday}</Chip>}
            {!isRequest && card.sourceCoverage !== 'FINAL' && <CoverageChip state={card.sourceCoverage} />}
            {paused && <Chip tone="violet" glyph="⏸">Project is paused</Chip>}
            {req?.importance === 'IMPORTANT' && <Chip tone="bad" glyph="!">Important</Chip>}
          </div>
          <h2 id={`t-${card.id}`} style={{ marginTop: 4 }}>
            {isRequest ? `${hub.userName(req?.requestedByUid ?? null)} asked for an update${step ? ` on Step ${hub.stepLabelsFor(uid, step.projectId).get(step.id)}: ${step.title}` : project ? ` on ${shortProjectName(project)}` : ''}` : spec ? spec.question : card.title}
          </h2>
        </div>
        {select && select !== 'blocked' && <label className="row" style={{ fontWeight: 500, margin: 0 }}><input type="checkbox" checked={select.checked} onChange={(e) => select.onChange(e.target.checked)} /> {WORDS.selectItem}</label>}
        {select === 'blocked' && <span className="small muted">Needs its own answer</span>}
      </div>

      {isRequest ? (
        <div className="stack" style={{ marginTop: '.6rem' }}>
          <p className="lead" style={{ margin: 0 }}>“{card.explanatoryText}”</p>
          {paused && <p className="small" style={{ margin: 0 }}>This project is paused{project?.pause?.reasonNote ? `: ${project.pause.reasonNote}` : ''}. Your answer does not resume it.</p>}
          <ChoiceGroup value={choice === 'NOT_SURE' ? null : choice} onChange={setChoice} name={`c-${card.id}`} />
          <p className="small muted" style={{ margin: 0 }}>“Completed” means you finished it. It is {WORDS.employeeConfirmed.toLowerCase()}. It is not {WORDS.checkedInSource.toLowerCase()}.</p>
          <div><label htmlFor={`n-${card.id}`}>Add a note (optional)</label><textarea id={`n-${card.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Example: The test worked. I will run the rest tomorrow." /></div>
          <details className="soft"><summary>Add a link or ask for help</summary>
            <div className="stack" style={{ marginTop: 8 }}>
              <div><label htmlFor={`l-${card.id}`}>A link or file name that shows your work (optional)</label><input id={`l-${card.id}`} type="text" value={link} onChange={(e) => setLink(e.target.value)} /></div>
              <label style={{ fontWeight: 500 }}><input type="checkbox" checked={help} onChange={(e) => setHelp(e.target.checked)} /> I need Dalia’s help (leave this off for a normal update)</label>
            </div></details>
          <div className="row">
            <button className={first ? 'primary' : ''} disabled={!choice || choice === 'NOT_SURE' || disabled} onClick={() => submit('SEND_STATUS', 'Update sent to Dalia')}>Send update to Dalia</button>
            <button className="quiet" disabled={disabled} onClick={() => submit('DEFER', 'Saved for your next paid shift')}>Answer later</button>
          </div>
        </div>
      ) : f0 && spec && (
        <div className="stack" style={{ marginTop: '.4rem' }}>
          <p className="lead" style={{ margin: 0 }}>{spec.evidence}</p>
          {window && (
            <div className="seen">
              <span>{window} · {evs.length} action{evs.length === 1 ? '' : 's'} on {f0.deviceId}</span>
              <button className="link" onClick={() => setShowAct(!showAct)} aria-expanded={showAct}>{showAct ? 'Hide activity details' : 'View activity details'}</button>
            </div>
          )}
          {showAct && (
            <div className="smallnote">
              <strong>What the computer showed</strong>
              <ul className="timeline">{evs.map((e) => <li key={e.id}><time>{fmt(e.occurredAt)}</time><span>{e.allowedSummary.replace(/^ui action\b/i, 'clicked').replace(/^file opened\b/i, 'opened a file').replace(/^file saved\b/i, 'saved a file')}</span></li>)}</ul>
              {matchReason(f0, step) && <p style={{ margin: '.6rem 0 0' }}><strong>Why we matched it here:</strong> {matchReason(f0, step)}</p>}
              {f0.uncertainties.length > 0 && <p style={{ margin: '.4rem 0 0' }}><strong>What we do not know:</strong> {f0.uncertainties.join(' ')}</p>}
              {f0.refs.submissionRefs.length > 0 && <p style={{ margin: '.4rem 0 0' }}>Upload numbers seen, oldest first: {f0.refs.submissionRefs.map((r) => <code key={r} style={{ marginRight: 8 }}>{r}</code>)}</p>}
              <p className="muted" style={{ margin: '.4rem 0 0' }}>How sure we are: {f0.confidenceBand === 'HIGH' ? 'likely match' : f0.confidenceBand === 'MEDIUM' ? 'possible match' : 'weak match'}.</p>
              <details style={{ marginTop: 4 }}><summary>View technical details</summary>{f0.sourceEventIds.map((id) => <div key={id}><code>{id}</code></div>)}</details>
            </div>
          )}

          {f0.findingType === 'AI_UNMATCHED_WORK' ? (
            <div className="stack answers">
              <div><label htmlFor={`cls-${card.id}`}>What do you want to do with this work?</label>
                <select id={`cls-${card.id}`} value={cls} onChange={(e) => setCls(e.target.value as typeof cls)}>
                  <option value="ROUTINE">Save it as a small task (not part of a project)</option>
                  <option value="LINK_EXISTING">Add it to a project step</option>
                  <option value="NEW_STEP">Make a new step in a project</option>
                  <option value="POTENTIAL_PROJECT">This might be a new project (tell Dalia)</option>
                </select></div>
              {(cls === 'ROUTINE' || cls === 'POTENTIAL_PROJECT') && (
                <div><label htmlFor={`nt-${card.id}`}>Give it a short name</label><input id={`nt-${card.id}`} type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Example: Updated the listing for “MS066”" />
                  <p className="small muted">It goes in your own “Other work” list and Dalia can see it. It does not change any project.</p></div>)}
              {(cls === 'LINK_EXISTING' || cls === 'NEW_STEP') && (
                <div><label htmlFor={`cp-${card.id}`}>Project</label>
                  <select id={`cp-${card.id}`} value={clsProject} onChange={(e) => { setClsProject(e.target.value); setLinkStep(''); }}>{mine.map((p) => <option key={p.id} value={p.id}>{p.key} — {shortProjectName(p)}</option>)}</select></div>)}
              {cls === 'LINK_EXISTING' && clsProject && (
                <div><label htmlFor={`ls-${card.id}`}>Step</label>
                  <select id={`ls-${card.id}`} value={linkStep} onChange={(e) => setLinkStep(e.target.value)}><option value="">Choose a step…</option>{hub.projectSteps(uid, clsProject).map((s) => <option key={s.id} value={s.id}>Step {hub.stepLabelsFor(uid, s.projectId).get(s.id)}: {s.title.slice(0, 60)}</option>)}</select></div>)}
              {cls === 'NEW_STEP' && <div><label htmlFor={`nt2-${card.id}`}>New step name</label><input id={`nt2-${card.id}`} type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} /></div>}
              <div className="row"><button className={first ? 'primary' : ''} disabled={disabled || (cls === 'LINK_EXISTING' && !linkStep) || (cls === 'NEW_STEP' && !newTitle.trim())} onClick={() => submit('CONFIRM', 'Saved')}>Save this</button></div>
              <details className="soft"><summary>Not a task? Dismiss it, or say it was not your work</summary>
                <div className="stack" style={{ marginTop: 8 }}>
                  <div><label htmlFor={`sk-${card.id}`}>Why? (optional)</label>
                    <input id={`sk-${card.id}`} type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Example: just a quick look, nothing to record" />
                    <p className="small muted">Skipped items are not added to any list. Dalia can still see that it was skipped.</p></div>
                  <div className="row"><button disabled={disabled} onClick={() => submit('DISMISS', 'Dismissed. The activity is still kept in the log.')}>Dismiss (the activity is still kept)</button><button disabled={disabled} onClick={() => submit('NOT_MY_WORK', 'Saved')}>{WORDS.notMyWork}</button></div>
                </div></details>
              <div><button className="quiet" disabled={disabled} onClick={() => submit('DEFER', 'Saved for your next paid shift')}>Answer later</button></div>
            </div>
          ) : (
            <div className="stack answers">
              <fieldset style={{ border: 'none', padding: 0, margin: 0 }} className="answerlist">
                <legend className="small" style={{ fontWeight: 600, marginBottom: 6 }}>What happened?</legend>
                {spec.choices.map((c) => (
                  <div key={c.outcome} className={`choice ${outcome === c.outcome ? 'sel' : ''}`} onClick={() => !disabled && setOutcome(c.outcome)}>
                    <input type="radio" id={`o-${card.id}-${c.outcome}`} name={`o-${card.id}`} disabled={disabled} checked={outcome === c.outcome} onChange={() => setOutcome(c.outcome)} />
                    <label htmlFor={`o-${card.id}-${c.outcome}`}>{c.label}</label>
                  </div>
                ))}
              </fieldset>
              {outcome === 'MISREAD' && (
                <div className="correct stack">
                  <strong className="small">What did the AI get wrong?</strong>
                  <div className="choice" onClick={() => setCorr('WRONG_STEP')}><input type="radio" id={`c1-${card.id}`} name={`corr-${card.id}`} checked={corr === 'WRONG_STEP'} onChange={() => setCorr('WRONG_STEP')} /><label htmlFor={`c1-${card.id}`}>It matched the wrong project or step</label></div>
                  {corr === 'WRONG_STEP' && (
                    <div className="stack">
                      <div><label htmlFor={`cp2-${card.id}`}>Which project?</label><select id={`cp2-${card.id}`} value={clsProject} onChange={(e) => { setClsProject(e.target.value); setLinkStep(''); }}>{mine.map((p) => <option key={p.id} value={p.id}>{p.key} — {shortProjectName(p)}</option>)}</select></div>
                      <div><label htmlFor={`ls2-${card.id}`}>Which step?</label><select id={`ls2-${card.id}`} value={linkStep} onChange={(e) => setLinkStep(e.target.value)}><option value="">Choose a step…</option>{hub.projectSteps(uid, clsProject).map((s) => <option key={s.id} value={s.id}>Step {hub.stepLabelsFor(uid, s.projectId).get(s.id)}: {s.title.slice(0, 60)}</option>)}</select></div>
                    </div>
                  )}
                  <div className="choice" onClick={() => setCorr('WRONG_PERSON')}><input type="radio" id={`c2-${card.id}`} name={`corr-${card.id}`} checked={corr === 'WRONG_PERSON'} onChange={() => setCorr('WRONG_PERSON')} /><label htmlFor={`c2-${card.id}`}>Someone else was using this computer</label></div>
                  <div className="choice" onClick={() => setCorr('OTHER')}><input type="radio" id={`c3-${card.id}`} name={`corr-${card.id}`} checked={corr === 'OTHER'} onChange={() => setCorr('OTHER')} /><label htmlFor={`c3-${card.id}`}>Something else (tell us below)</label></div>
                </div>
              )}
              <div><label htmlFor={`n-${card.id}`}>Anything else we should know? (Optional)</label><textarea id={`n-${card.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={spec.notePlaceholder} /></div>
              {outcome === 'NOT_ME' && <p className="small muted" style={{ margin: 0 }}>We keep the activity. It just won’t be credited to you. That does not mean no work happened.</p>}
              {outcome && ['DONE', 'DONE_PART'].includes(outcome) && spec.kind !== 'LATE' && <p className="small muted" style={{ margin: 0 }}>This is your report. It is {WORDS.employeeConfirmed.toLowerCase()}, not {WORDS.checkedInSource.toLowerCase()}.{step?.impact === 'HIGH' ? ' This step still needs a check in the source system, or Dalia’s approval, before it counts as done.' : ''}</p>}
              <div className="row">
                <button className={first ? 'primary' : ''} disabled={disabled || !canSend} onClick={sendOutcome}>{outcome === 'NOT_SURE' ? 'Answer later' : 'Send answer'}</button>
                {outcome !== 'NOT_SURE' && <button className="quiet" disabled={disabled} onClick={() => submit('DEFER', 'Saved for your next paid shift')}>Answer later</button>}
              </div>
            </div>
          )}
        </div>
      )}
      {disabled && <p className="small muted">Clock in to send this. Reviews are paid work.</p>}
      {me.role === 'OWNER' && null}
    </article>
  );
}
