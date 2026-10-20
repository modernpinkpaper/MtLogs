import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Chip } from '../common';

export function OwnerInsights({ embedded }: { embedded?: boolean } = {}) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <div className="stack">
      {!embedded && (<div><h1>Ideas <Chip tone="violet" glyph="◆">Made-up examples</Chip></h1>
        <p className="muted">Ideas from the AI. Nothing is made or changed until you say yes. What we expect is shown apart from what really happened.</p></div>)}
      {hub.state.opportunities.map((o) => {
        const hours = (o.estMinutesSavedPerUnit * o.unitsPerMonth) / 60;
        return (
          <article key={o.id} className="card stack">
            <div className="row between"><h2>{o.title}</h2><div className="row"><Chip tone="gray">confidence {o.confidence.toLowerCase()}</Chip><Chip tone={o.state === 'PROPOSED' ? 'violet' : 'info'}>{o.state.replace(/_/g, ' ').toLowerCase()}</Chip></div></div>
            <p><strong>The problem:</strong> {o.problem}</p>
            <div className="small"><strong>What we saw:</strong><ul style={{ margin: '.2rem 0 0 1.1rem' }}>{o.evidence.map((e) => <li key={e}>{e}</li>)}</ul></div>
            <p className="small"><strong>Maybe why:</strong> {o.rootCauseHypothesis}</p>
            <p><strong>The idea:</strong> {o.proposal}</p>
            <div className="statrow">
              <div className="stat"><div className="v">{hours.toFixed(1)} h</div><div className="l">Time we might free up each month ({o.estMinutesSavedPerUnit} min × {o.unitsPerMonth})</div></div>
              <div className="stat"><div className="v">{o.realizedValue}</div><div className="l">What really happened</div></div>
            </div>
            <p className="small muted">This is time that might be freed. It is <strong>not</strong> money saved unless real numbers show it. Risk: {o.risk}</p>
            <p className="small"><strong>How we will measure:</strong> {o.measurementPlan}</p>
            {o.createdProjectId ? <p>Created project: <Link to={`/projects/${o.createdProjectId}`}>open</Link></p> : o.state === 'PROPOSED' || o.state === 'MORE_EVIDENCE_REQUESTED' || o.state === 'DEFERRED' ? (
              <div className="stack"><input type="text" aria-label="Decision note" placeholder="Your note (if you want)" value={notes[o.id] ?? ''} onChange={(e) => setNotes({ ...notes, [o.id]: e.target.value })} />
                <div className="row">
                  <button className="primary" onClick={() => act(() => hub.decideOpportunity(uid, o.id, 'APPROVED', notes[o.id] ?? ''), 'Project created from the proposal')}>Yes, make a project</button>
                  <button onClick={() => act(() => hub.decideOpportunity(uid, o.id, 'DEFERRED', notes[o.id] ?? ''), 'Deferred')}>Maybe later</button>
                  <button onClick={() => act(() => hub.decideOpportunity(uid, o.id, 'REJECTED', notes[o.id] ?? ''), 'Rejected')}>No</button>
                  <button onClick={() => act(() => hub.decideOpportunity(uid, o.id, 'MORE_EVIDENCE_REQUESTED', notes[o.id] ?? ''), 'Requested more evidence')}>Show me more proof</button></div></div>
            ) : <p className="small muted">Decision: {o.state.toLowerCase()} {o.decisionNote ? `— ${o.decisionNote}` : ''}</p>}
          </article>);
      })}
    </div>
  );
}
