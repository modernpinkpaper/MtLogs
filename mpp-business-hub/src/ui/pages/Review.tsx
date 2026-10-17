import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { newKey, useAct, useMe } from '../hubContext';
import { ChoiceGroup } from '../dialogs';
import { Chip, CoverageChip, Empty, ObservedChip, StatusChip } from '../common';
import { formatDateTime, formatTime } from '../../domain/time';
import type { Finding, ResponseChoice, ReviewCard } from '../../domain/types';

export function Review() {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const [sp] = useSearchParams();
  const cards = hub.listReviewCards(uid);
  const shift = hub.openShift(uid);
  const offClock = me.role === 'EMPLOYEE' && !shift;
  const [picked, setPicked] = useState<string[]>([]);
  const bulkKey = useRef(newKey('bulk'));
  const bulkable = cards.filter((c) => c.canBulkReview);
  const done = hub.listReviewCards(uid, 'all').filter((c) => c.status === 'SUBMITTED').slice(-5).reverse();

  return (
    <div className="stack">
      <div><h1>Your review</h1><p className="muted">Tell us if the AI got it right. Answer any requests. It takes about 1 to 3 minutes. It never stops you from clocking in or out.</p></div>
      {offClock && (
        <div className="card warn" role="status">
          Reviews are paid work, so do them while you are clocked in. <Link to="/clock">Clock in</Link> first. Your cards will wait for you.
        </div>
      )}
      {cards.length === 0 && <Empty>You have no cards. {hub.reviewReadiness(uid).message}</Empty>}
      {bulkable.length > 1 && !offClock && (
        <div className="card flat row between">
          <span className="small">Easy, low-risk cards can be confirmed together. Big or unclear ones need a close look, one at a time.</span>
          <button disabled={!picked.length} onClick={async () => {
            const r = await act(() => hub.bulkConfirm(uid, picked, bulkKey.current), 'Confirmed selected cards');
            if (r) { setPicked([]); bulkKey.current = newKey('bulk'); }
          }}>Confirm picked ({picked.length})</button>
        </div>
      )}
      {cards.map((c) => (
        <CardView key={c.id} card={c} highlight={sp.get('card') === c.id} disabled={offClock}
          bulk={c.canBulkReview && !offClock ? { checked: picked.includes(c.id), onChange: (v) => setPicked(v ? [...picked, c.id] : picked.filter((x) => x !== c.id)) } : undefined} />
      ))}
      {done.length > 0 && (
        <details className="card flat"><summary>Done recently ({done.length})</summary>
          {done.map((c) => <div key={c.id} className="small muted">{c.title} — {formatDateTime(c.lastUpdatedAt)}</div>)}
        </details>
      )}
    </div>
  );
}

function CardView({ card, highlight, disabled, bulk }: { card: ReviewCard; highlight: boolean; disabled: boolean; bulk?: { checked: boolean; onChange: (v: boolean) => void } }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const key = useRef(newKey('card'));
  const project = card.projectId ? hub.getProject(uid, card.projectId) : null;
  const step = card.stepId ? hub.getStep(uid, card.stepId) : null;
  const findings = card.findingIds.length ? hub.cardFindings(uid, card.id) : [];
  const [choice, setChoice] = useState<ResponseChoice | null>(null);
  const [note, setNote] = useState('');
  const [help, setHelp] = useState(false);
  const [link, setLink] = useState('');
  const [mode, setMode] = useState<'none' | 'correct' | 'status'>('none');
  const [correction, setCorrection] = useState('');
  const [cls, setCls] = useState<'LINK_EXISTING' | 'NEW_STEP' | 'ROUTINE' | 'POTENTIAL_PROJECT'>('ROUTINE');
  const [linkStep, setLinkStep] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const projects = hub.listProjects(uid).filter((p) => p.visibility !== 'OWNER_PRIVATE');
  const [clsProject, setClsProject] = useState(projects[0]?.id ?? '');
  const f0 = findings[0];

  const start = () => { void act(() => hub.startReview(uid, card.id)); };
  const submit = async (action: 'CONFIRM' | 'NEEDS_CORRECTION' | 'NOT_MY_WORK' | 'DISMISS' | 'DEFER' | 'SEND_STATUS') => {
    const classification = f0?.findingType === 'AI_UNMATCHED_WORK' && action === 'CONFIRM'
      ? { kind: cls, projectId: cls === 'LINK_EXISTING' || cls === 'NEW_STEP' ? clsProject : undefined, stepId: cls === 'LINK_EXISTING' ? linkStep : undefined, newStepTitle: newTitle }
      : null;
    await act(() => hub.submitDecision(uid, card.id, {
      action, statusAnswer: choice, note, correctionText: correction, evidenceLinks: link ? [link] : [], needsOwnerHelp: help, classification, idempotencyKey: key.current,
    }), action === 'DEFER' ? 'Saved for your next paid shift' : action === 'SEND_STATUS' ? 'Update sent to Dalia' : 'Saved');
  };

  const isRequest = card.cardType === 'OWNER_REQUEST';
  const req = card.updateRequestId ? hub.getRequest(uid, card.updateRequestId) : null;

  return (
    <article className={`card ${isRequest ? 'pink' : ''} ${highlight ? 'focus' : ''}`} aria-labelledby={`t-${card.id}`} onFocus={start} onMouseEnter={start}>
      <div className="row between">
        <div>
          <h2 id={`t-${card.id}`}>{isRequest ? `${hub.userName(req?.requestedByUid ?? null)} asked for an update` : card.title}</h2>
          <div className="row small muted">
            {project && <Link to={`/projects/${project.id}${step ? `/steps/${step.id}` : ''}`}>{project.key}{step ? `, Step ${step.sortOrder}` : ''}</Link>}
            <span>{formatDateTime(card.createdAt)}</span>
            {card.provisional && <Chip tone="warn" glyph="…" title="Final reconciliation of today’s logs is still in progress.">Not final yet</Chip>}
            {!isRequest && <CoverageChip state={card.sourceCoverage} />}
            {req?.importance === 'IMPORTANT' && <Chip tone="bad" glyph="!">Important</Chip>}
          </div>
        </div>
        {bulk && <label className="row" style={{ fontWeight: 500 }}><input type="checkbox" checked={bulk.checked} onChange={(e) => bulk.onChange(e.target.checked)} /> Pick for group confirm</label>}
      </div>

      {isRequest ? (
        <div className="stack" style={{ marginTop: '.6rem' }}>
          <p style={{ fontSize: '1.05rem' }}><strong>{card.explanatoryText}</strong></p>
          {step && <div className="row small"><StatusChip status={step.status} /> <span className="muted">Your answer is saved as “told to us by a person.”</span></div>}
          <ChoiceGroup value={choice} onChange={setChoice} name={`c-${card.id}`} />
          <div><label htmlFor={`n-${card.id}`}>Add a note (if you want)</label><textarea id={`n-${card.id}`} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div><label htmlFor={`l-${card.id}`}>A link or file name that shows your work (if you want)</label><input id={`l-${card.id}`} type="text" value={link} onChange={(e) => setLink(e.target.value)} /></div>
          <label style={{ fontWeight: 500 }}><input type="checkbox" checked={help} onChange={(e) => setHelp(e.target.checked)} /> I need Dalia’s help (leave this off for a normal update)</label>
          <div className="row">
            <button className="primary" disabled={!choice || disabled} onClick={() => submit('SEND_STATUS')}>Send Requested Update</button>
            <button disabled={disabled} onClick={() => submit('DEFER')}>Answer later</button>
          </div>
        </div>
      ) : (
        <div className="stack" style={{ marginTop: '.6rem' }}>
          {findings.map((f) => <FindingBody key={f.id} f={f} />)}
          {step && <div className="row small"><StatusChip status={step.status} /> <ObservedChip level={step.observedLevel} review={step.observedReview} /></div>}
          {f0?.findingType === 'AI_UNMATCHED_WORK' ? (
            <div className="card flat stack">
              <strong>What do you want to do with this work?</strong>
              <div>
                <label htmlFor={`cls-${card.id}`}>Choose one</label>
                <select id={`cls-${card.id}`} value={cls} onChange={(e) => setCls(e.target.value as typeof cls)}>
                  <option value="ROUTINE">Save it as everyday work (not part of a project)</option>
                  <option value="LINK_EXISTING">Add it to a project step</option>
                  <option value="NEW_STEP">Make a new step in a project</option>
                  <option value="POTENTIAL_PROJECT">This might be a new project (tell Dalia)</option>
                </select>
              </div>
              {(cls === 'ROUTINE' || cls === 'POTENTIAL_PROJECT') && (
                <div><label htmlFor={`nt-${card.id}`}>What was it? (a few words)</label><input id={`nt-${card.id}`} type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Example: Fixed the front artwork for “MS066”" />
                  <p className="small muted">It goes in your own “Other work” list and Dalia can see it. It does not change any project.</p></div>
              )}
              {(cls === 'LINK_EXISTING' || cls === 'NEW_STEP') && (
                <div><label htmlFor={`cp-${card.id}`}>Project</label>
                  <select id={`cp-${card.id}`} value={clsProject} onChange={(e) => { setClsProject(e.target.value); setLinkStep(''); }}>{projects.filter((p) => p.memberUids.includes(uid) || me_is_owner(hub, uid)).map((p) => <option key={p.id} value={p.id}>{p.key} — {p.title.slice(0, 40)}</option>)}</select></div>
              )}
              {cls === 'LINK_EXISTING' && clsProject && (
                <div><label htmlFor={`ls-${card.id}`}>Step</label>
                  <select id={`ls-${card.id}`} value={linkStep} onChange={(e) => setLinkStep(e.target.value)}><option value="">Choose a step…</option>{hub.projectSteps(uid, clsProject).map((s) => <option key={s.id} value={s.id}>{s.sortOrder}. {s.title.slice(0, 60)}</option>)}</select></div>
              )}
              {cls === 'NEW_STEP' && <div><label htmlFor={`nt2-${card.id}`}>New step title</label><input id={`nt2-${card.id}`} type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} /></div>}
              <div className="row">
                <button className="primary" disabled={disabled || (cls === 'LINK_EXISTING' && !linkStep) || (cls === 'NEW_STEP' && !newTitle.trim())} onClick={() => submit('CONFIRM')}>Save this</button>
              </div>
              <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
              <div><label htmlFor={`sk-${card.id}`}>Or skip it and do not log it (why? if you want)</label>
                <input id={`sk-${card.id}`} type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Example: just a quick look, nothing to record" />
                <p className="small muted">Skipped items are not added to any list. Dalia can still see that it was skipped.</p></div>
              <div className="row">
                <button disabled={disabled} onClick={() => submit('DISMISS')}>Skip it (do not log)</button>
                <button disabled={disabled} onClick={() => submit('NOT_MY_WORK')}>That was not me</button>
                <button className="ghost" disabled={disabled} onClick={() => submit('DEFER')}>Later</button>
              </div>
            </div>
          ) : (
          <div className="row">
            <button className="primary" disabled={disabled} onClick={() => submit('CONFIRM')}>Yes, that is right</button>
            <button disabled={disabled} onClick={() => setMode(mode === 'correct' ? 'none' : 'correct')}>Not quite right</button>
            <button disabled={disabled} onClick={() => submit('NOT_MY_WORK')}>That was not me</button>
            <button disabled={disabled} onClick={() => submit('DISMISS')}>Skip it</button>
            {step && <button disabled={disabled} onClick={() => setMode(mode === 'status' ? 'none' : 'status')}>Tell my status…</button>}
            <button className="ghost" disabled={disabled} onClick={() => submit('DEFER')}>Later</button>
          </div>
          )}
          {mode === 'correct' && (
            <div className="stack"><label htmlFor={`co-${card.id}`}>What is wrong? (We keep the AI’s first guess and save your fix next to it.)</label>
              <textarea id={`co-${card.id}`} value={correction} onChange={(e) => setCorrection(e.target.value)} />
              <div><button className="primary" disabled={!correction.trim()} onClick={() => submit('NEEDS_CORRECTION')}>Save my fix</button></div></div>
          )}
          {mode === 'status' && (
            <div className="stack"><ChoiceGroup value={choice} onChange={setChoice} name={`s-${card.id}`} />
              <textarea aria-label="Notes" placeholder="Notes (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <label style={{ fontWeight: 500 }}><input type="checkbox" checked={help} onChange={(e) => setHelp(e.target.checked)} /> I need Dalia’s help</label>
              <div><button className="primary" disabled={!choice} onClick={() => submit('SEND_STATUS')}>Send my status</button></div></div>
          )}
        </div>
      )}
      {disabled && <p className="small muted">Clock in to send this. Reviews are paid work.</p>}
    </article>
  );
}

function me_is_owner(hub: ReturnType<typeof useMe>['hub'], uid: string) { return hub.isOwner(uid); }

function FindingBody({ f }: { f: Finding }) {
  const { hub, uid } = useMe();
  const [open, setOpen] = useState(false);
  const evs = open ? hub.findingEvidence(uid, f.id) : [];
  return (
    <div className="stack">
      <p><strong>{f.headline}</strong></p>
      <div className="row"><Chip tone="violet" glyph="✦">AI guess</Chip><Chip tone="gray">How sure: {f.confidenceBand.toLowerCase()}</Chip>
        <Chip tone="warn" glyph="?" title="The log shows the computer, not who was using it.">We cannot tell who was at the computer</Chip></div>
      <p>{f.inference}</p>
      {f.uncertainties.length > 0 && <div className="small"><strong>What we do not know:</strong><ul style={{ margin: '.2rem 0 0 1.1rem' }}>{f.uncertainties.map((u, i) => <li key={i}>{u}</li>)}</ul></div>}
      {f.verificationNeeded.length > 0 && <div className="small"><strong>Please check:</strong><ul style={{ margin: '.2rem 0 0 1.1rem' }}>{f.verificationNeeded.map((u, i) => <li key={i}>{u}</li>)}</ul></div>}
      {f.refs.submissionRefs.length > 0 && <div className="small">Upload numbers we saw (oldest first): {f.refs.submissionRefs.map((r) => <code key={r} style={{ marginRight: 8 }}>{r}</code>)}</div>}
      <button className="link" onClick={() => setOpen(!open)}>{open ? 'Hide proof' : `Show proof (${f.sourceEventIds.length} events)`}</button>
      {open && <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem' }}>{evs.map((e) => <li key={e.id}>{formatTime(e.occurredAt)} — {e.allowedSummary} <span className="muted">[{e.id}]</span></li>)}</ul>}
    </div>
  );
}
