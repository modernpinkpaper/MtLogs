import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { newKey, useAct, useMe } from '../hubContext';
import { ChoiceGroup } from '../dialogs';
import { Chip, CoverageChip, Empty, StatusChip } from '../common';
import { formatDateTime, formatTime } from '../../domain/time';
import { WORDS } from '../lang';
import type { Finding, ResponseChoice, ReviewCard } from '../../domain/types';

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
  const bulkKey = useRef(newKey('bulk'));
  const requests = cards.filter((c) => c.cardType === 'OWNER_REQUEST');
  const findings = cards.filter((c) => c.cardType !== 'OWNER_REQUEST');
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
        <p className="muted" style={{ margin: 0 }}>Tell us if what the system noticed is right, and answer requests from Dalia. It usually takes 1 to 3 minutes and it is paid time. You can clock in or out any time without finishing.</p>
      </div>
      {offClock && <div className="card warn" role="status">Reviews are paid work, so you answer them while clocked in. <Link to="/clock">Clock in</Link> first. Your items will wait for you.</div>}
      {cards.length === 0 && <Empty>Nothing to review right now. {hub.reviewReadiness(uid).message}</Empty>}

      {requests.length > 0 && (
        <section aria-labelledby="rq"><h2 id="rq" className="group-title">Dalia asked you <span className="count">{requests.length}</span></h2>
          <div className="stack">{requests.map((c) => <CardView key={c.id} card={c} highlight={sp.get('card') === c.id} disabled={offClock} />)}</div></section>
      )}

      {findings.length > 0 && (
        <section aria-labelledby="fd">
          <div className="row between"><h2 id="fd" className="group-title" style={{ margin: 0 }}>Did this happen? <span className="count">{findings.length}</span></h2>
            {eligibleCount > 1 && !offClock && <button onClick={() => { setSelecting(!selecting); setPicked([]); setMixedMsg(false); }} aria-pressed={selecting}>{selecting ? 'Stop selecting' : WORDS.selectMultiple}</button>}</div>
          {selecting && (
            <div className="card flat" role="region" aria-label="Select multiple items">
              <p className="small" style={{ margin: 0 }}>Choose the items below that are accurate, then confirm them together. Only simple, low-risk items can be selected. Items with unclear results need their own answer.</p>
            </div>
          )}
          <div className="stack" style={{ marginTop: 8 }}>
            {findings.map((c) => (
              <CardView key={c.id} card={c} highlight={sp.get('card') === c.id} disabled={offClock}
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
      {done.length > 0 && (
        <details className="card flat"><summary>Done recently ({done.length})</summary>
          {done.map((c) => <div key={c.id} className="small muted">{c.title} — {formatDateTime(c.lastUpdatedAt)}</div>)}
        </details>
      )}
    </div>
  );
}

type SelectProp = { checked: boolean; onChange: (v: boolean) => void } | 'blocked' | undefined;

function CardView({ card, highlight, disabled, select }: { card: ReviewCard; highlight: boolean; disabled: boolean; select?: SelectProp }) {
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
  const [choice, setChoice] = useState<ResponseChoice | 'NOT_SURE' | null>(null);
  const [note, setNote] = useState('');
  const [help, setHelp] = useState(false);
  const [link, setLink] = useState('');
  const [fix, setFix] = useState(false);
  const [correction, setCorrection] = useState('');
  const [cls, setCls] = useState<'LINK_EXISTING' | 'NEW_STEP' | 'ROUTINE' | 'POTENTIAL_PROJECT'>('ROUTINE');
  const [linkStep, setLinkStep] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const projects = hub.listProjects(uid).filter((p) => p.visibility !== 'OWNER_PRIVATE');
  const [clsProject, setClsProject] = useState(projects[0]?.id ?? '');
  const start = () => { void act(() => hub.startReview(uid, card.id)); };

  const submit = async (action: 'CONFIRM' | 'NEEDS_CORRECTION' | 'NOT_MY_WORK' | 'DISMISS' | 'DEFER' | 'SEND_STATUS', okMsg: string) => {
    const unmatched = f0?.findingType === 'AI_UNMATCHED_WORK' && action === 'CONFIRM';
    const classification = unmatched ? { kind: cls, projectId: cls === 'LINK_EXISTING' || cls === 'NEW_STEP' ? clsProject : undefined, stepId: cls === 'LINK_EXISTING' ? linkStep : undefined, newStepTitle: newTitle } : null;
    const withResult = action === 'CONFIRM' && choice && choice !== 'NOT_SURE' && step;
    await act(() => hub.submitDecision(uid, card.id, {
      action: withResult ? 'SEND_STATUS' : action, statusAnswer: choice && choice !== 'NOT_SURE' ? choice : null, note, correctionText: correction, evidenceLinks: link ? [link] : [], needsOwnerHelp: help, classification, idempotencyKey: key.current,
    }), okMsg);
  };

  const whatToDo = isRequest ? 'Pick how it is going, then send your answer.'
    : f0?.findingType === 'AI_UNMATCHED_WORK' ? 'Tell us what this work was.'
    : f0?.findingType === 'LATE_EVIDENCE' ? 'Look at the new facts. Tell us if your first answer still holds.'
    : f0?.whilePaused ? 'Tell us what this was. The project stays paused.'
    : 'Tell us if this is accurate.';

  return (
    <article className={`card ${isRequest ? 'pink' : ''} ${highlight ? 'focus' : ''}`} aria-labelledby={`t-${card.id}`} onFocus={start} onMouseEnter={start}>
      <div className="row between">
        <div style={{ minWidth: 0 }}>
          <div className="row small muted">
            {project && <Link to={`/projects/${project.id}${step ? `/steps/${step.id}` : ''}`}>{project.key}{step ? `, Step ${step.sortOrder}` : ''}</Link>}
            <span>{formatDateTime(card.createdAt)}</span>
            {card.provisional && <Chip tone="warn" glyph="…" title="We are still reading today’s activity. This may change.">{WORDS.checkingToday}</Chip>}
            {!isRequest && <CoverageChip state={card.sourceCoverage} />}
            {paused && <Chip tone="violet" glyph="⏸">Project is paused</Chip>}
            {req?.importance === 'IMPORTANT' && <Chip tone="bad" glyph="!">Important</Chip>}
          </div>
          <h2 id={`t-${card.id}`} style={{ marginTop: 4 }}>
            {isRequest ? `${hub.userName(req?.requestedByUid ?? null)} asked for an update${step ? ` on Step ${step.sortOrder}: ${step.title}` : project ? ` on ${project.key}` : ''}` : f0 ? questionFor(f0, step?.sortOrder, project?.key) : card.title}
          </h2>
        </div>
        {select && select !== 'blocked' && <label className="row" style={{ fontWeight: 500, margin: 0 }}><input type="checkbox" checked={select.checked} onChange={(e) => select.onChange(e.target.checked)} /> {WORDS.selectItem}</label>}
        {select === 'blocked' && <span className="small muted">Needs its own answer</span>}
      </div>

      {isRequest ? (
        <div className="stack" style={{ marginTop: '.6rem' }}>
          <p className="q" style={{ margin: 0 }}>“{card.explanatoryText}”</p>
          {paused && <p className="small" style={{ margin: 0 }}>This project is paused{project?.pause?.reasonNote ? `: ${project.pause.reasonNote}` : ''}. Your answer does not resume it.</p>}
          {step && <div className="row small"><StatusChip status={step.status} hold={!!step.onHold} /></div>}
          <ChoiceGroup value={choice === 'NOT_SURE' ? null : choice} onChange={setChoice} name={`c-${card.id}`} />
          <p className="small muted" style={{ margin: 0 }}>“Completed” means you finished it. It is {WORDS.employeeConfirmed.toLowerCase()}. It is not {WORDS.checkedInSource.toLowerCase()}.</p>
          <div><label htmlFor={`n-${card.id}`}>Add a note (optional)</label><textarea id={`n-${card.id}`} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div><label htmlFor={`l-${card.id}`}>A link or file name that shows your work (optional)</label><input id={`l-${card.id}`} type="text" value={link} onChange={(e) => setLink(e.target.value)} /></div>
          <label style={{ fontWeight: 500 }}><input type="checkbox" checked={help} onChange={(e) => setHelp(e.target.checked)} /> I need Dalia’s help (leave this off for a normal update)</label>
          <div className="row">
            <button className="primary" disabled={!choice || choice === 'NOT_SURE' || disabled} onClick={() => submit('SEND_STATUS', 'Update sent to Dalia')}>Send update to Dalia</button>
            <button disabled={disabled} onClick={() => submit('DEFER', 'Saved for your next paid shift')}>Answer later</button>
          </div>
        </div>
      ) : f0 && (
        <div className="stack" style={{ marginTop: '.4rem' }}>
          <dl className="rv">
            <dt>What the system noticed</dt>
            <dd>{f0.headline}</dd>
            <dt>What it suggests</dt>
            <dd>{f0.inference}</dd>
            {f0.uncertainties.length > 0 && (<><dt>What it does not know</dt><dd><ul style={{ margin: 0, paddingLeft: '1.1rem' }}>{f0.uncertainties.map((u, i) => <li key={i}>{u}</li>)}</ul></dd></>)}
            <dt>What you need to do</dt>
            <dd><strong>{whatToDo}</strong></dd>
          </dl>
          {step && <div className="row small"><StatusChip status={step.status} hold={!!step.onHold} /><span className="muted">This is the step’s status now. Your answer does not change it.</span></div>}
          <EvidenceToggle f={f0} />

          {f0.findingType === 'AI_UNMATCHED_WORK' ? (
            <div className="card flat stack">
              <strong>What do you want to do with this work?</strong>
              <div><label htmlFor={`cls-${card.id}`}>Choose one</label>
                <select id={`cls-${card.id}`} value={cls} onChange={(e) => setCls(e.target.value as typeof cls)}>
                  <option value="ROUTINE">Save it as everyday work (not part of a project)</option>
                  <option value="LINK_EXISTING">Add it to a project step</option>
                  <option value="NEW_STEP">Make a new step in a project</option>
                  <option value="POTENTIAL_PROJECT">This might be a new project (tell Dalia)</option>
                </select></div>
              {(cls === 'ROUTINE' || cls === 'POTENTIAL_PROJECT') && (
                <div><label htmlFor={`nt-${card.id}`}>What was it? (a few words)</label><input id={`nt-${card.id}`} type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Example: Fixed the front artwork for “MS066”" />
                  <p className="small muted">It goes in your own “Other work” list and Dalia can see it. It does not change any project.</p></div>)}
              {(cls === 'LINK_EXISTING' || cls === 'NEW_STEP') && (
                <div><label htmlFor={`cp-${card.id}`}>Project</label>
                  <select id={`cp-${card.id}`} value={clsProject} onChange={(e) => { setClsProject(e.target.value); setLinkStep(''); }}>{projects.filter((p) => p.memberUids.includes(uid) || hub.isOwner(uid)).map((p) => <option key={p.id} value={p.id}>{p.key} — {p.title.slice(0, 40)}</option>)}</select></div>)}
              {cls === 'LINK_EXISTING' && clsProject && (
                <div><label htmlFor={`ls-${card.id}`}>Step</label>
                  <select id={`ls-${card.id}`} value={linkStep} onChange={(e) => setLinkStep(e.target.value)}><option value="">Choose a step…</option>{hub.projectSteps(uid, clsProject).map((s) => <option key={s.id} value={s.id}>Step {s.sortOrder}: {s.title.slice(0, 60)}</option>)}</select></div>)}
              {cls === 'NEW_STEP' && <div><label htmlFor={`nt2-${card.id}`}>New step name</label><input id={`nt2-${card.id}`} type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} /></div>}
              <div className="row"><button className="primary" disabled={disabled || (cls === 'LINK_EXISTING' && !linkStep) || (cls === 'NEW_STEP' && !newTitle.trim())} onClick={() => submit('CONFIRM', 'Saved')}>Save this</button></div>
              <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
              <div><label htmlFor={`sk-${card.id}`}>Or skip it and do not log it. Why? (optional)</label>
                <input id={`sk-${card.id}`} type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Example: just a quick look, nothing to record" />
                <p className="small muted">Skipped items are not added to any list. Dalia can still see that it was skipped.</p></div>
              <div className="row"><button disabled={disabled} onClick={() => submit('DISMISS', 'Skipped. It was not logged.')}>Skip it (do not log)</button><button disabled={disabled} onClick={() => submit('NOT_MY_WORK', 'Saved')}>{WORDS.notMyWork}</button><button className="ghost" disabled={disabled} onClick={() => submit('DEFER', 'Saved for your next paid shift')}>Answer later</button></div>
            </div>
          ) : (
            <>
              <div className="card flat stack">
                <strong>Did this happen?</strong>
                <div className="row">
                  <button className="primary" disabled={disabled} onClick={() => submit('CONFIRM', f0.whilePaused ? 'Added to the project history' : 'Thank you. Saved as accurate.')}>{f0.whilePaused ? 'Yes. Add it to the project history' : WORDS.yesAccurate}</button>
                  <button disabled={disabled} onClick={() => setFix(!fix)} aria-expanded={fix}>{WORDS.somethingIncorrect}</button>
                  <button disabled={disabled} onClick={() => submit('NOT_MY_WORK', 'Saved')}>{WORDS.notMyWork}</button>
                  <button className="ghost" disabled={disabled} onClick={() => submit('DEFER', 'Saved for your next paid shift')}>Answer later</button>
                </div>
                {fix && (
                  <div className="stack"><label htmlFor={`co-${card.id}`}>What is incorrect? (We keep what the system noticed and save your fix next to it.)</label>
                    <textarea id={`co-${card.id}`} value={correction} onChange={(e) => setCorrection(e.target.value)} />
                    <div><button className="primary" disabled={!correction.trim()} onClick={() => submit('NEEDS_CORRECTION', 'Saved your fix')}>Save my fix</button></div></div>)}
              </div>
              {step && (
                <details className="card flat">
                  <summary><strong>What was the result?</strong> <span className="muted small">(optional, a separate question)</span></summary>
                  <div className="stack" style={{ marginTop: 8 }}>
                    <p className="small muted" style={{ margin: 0 }}>Saying “yes, accurate” only confirms what the system noticed. If you also know the result, pick it here. Your answer is {WORDS.employeeConfirmed.toLowerCase()}. It is not {WORDS.checkedInSource.toLowerCase()}.</p>
                    <ResultPicker value={choice} onChange={setChoice} name={`r-${card.id}`} />
                    <textarea aria-label="Note about the result" placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                    <label style={{ fontWeight: 500 }}><input type="checkbox" checked={help} onChange={(e) => setHelp(e.target.checked)} /> I need Dalia’s help</label>
                    <p className="small muted" style={{ margin: 0 }}>Then press “{WORDS.yesAccurate}” above to send both answers.</p>
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      )}
      {disabled && <p className="small muted">Clock in to send this. Reviews are paid work.</p>}
      {me.role === 'OWNER' && null}
    </article>
  );
}

function ResultPicker({ value, onChange, name }: { value: ResponseChoice | 'NOT_SURE' | null; onChange: (c: ResponseChoice | 'NOT_SURE') => void; name: string }) {
  const opts: [ResponseChoice | 'NOT_SURE', string][] = [['COMPLETED', 'Completed'], ['IN_PROGRESS', 'Still working on it'], ['BLOCKED', 'Blocked — I need help'], ['NOT_SURE', 'Not sure. I need to check']];
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
      {opts.map(([k, l]) => (
        <div key={k} className={`choice ${value === k ? 'sel' : ''}`} onClick={() => onChange(k)}>
          <input type="radio" id={`${name}-${k}`} name={name} checked={value === k} onChange={() => onChange(k)} /><label htmlFor={`${name}-${k}`}>{l}</label>
        </div>))}
    </fieldset>
  );
}

function questionFor(f: Finding, stepNo: number | undefined, key: string | undefined): string {
  if (f.findingType === 'AI_UNMATCHED_WORK') return 'We found work that may not belong to a project. What was it?';
  if (f.findingType === 'LATE_EVIDENCE') return `New activity arrived after your review${key ? ` of ${key}` : ''}. Does your first answer still hold?`;
  if (f.whilePaused) return `We found activity on ${key ?? 'a project'} while it is paused. What was it?`;
  return `We noticed activity${stepNo ? ` on Step ${stepNo}` : ''}${key ? ` of ${key}` : ''}. Did this happen?`;
}

function EvidenceToggle({ f }: { f: Finding }) {
  const { hub, uid } = useMe();
  const [open, setOpen] = useState(false);
  const evs = open ? hub.findingEvidence(uid, f.id) : [];
  return (
    <div>
      <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide where this came from' : `Show where this came from (${f.sourceEventIds.length} activity item${f.sourceEventIds.length === 1 ? '' : 's'})`}</button>
      {open && (
        <div className="card flat small" style={{ marginTop: 6 }}>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>{evs.map((e) => <li key={e.id}>{formatTime(e.occurredAt)} — {e.allowedSummary}</li>)}</ul>
          {f.refs.submissionRefs.length > 0 && <p style={{ margin: '.4rem 0 0' }}>Upload numbers seen, oldest first: {f.refs.submissionRefs.map((r) => <code key={r} style={{ marginRight: 8 }}>{r}</code>)}</p>}
          <p className="muted" style={{ margin: '.4rem 0 0' }}>We can only see the computer, not the person. How sure we are: {f.confidenceBand === 'HIGH' ? 'likely match' : f.confidenceBand === 'MEDIUM' ? 'possible match' : 'weak match'}.</p>
          <details style={{ marginTop: 4 }}><summary>Advanced</summary>{f.sourceEventIds.map((id) => <div key={id}><code>{id}</code></div>)}</details>
        </div>
      )}
    </div>
  );
}
