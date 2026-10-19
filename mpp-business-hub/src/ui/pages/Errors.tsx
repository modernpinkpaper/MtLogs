import { useRef, useState } from 'react';
import { newKey, useAct, useMe } from '../hubContext';
import { Chip, Empty } from '../common';
import { ErrorFacts, RichEditor } from '../errorUi';
import { PermissionDeniedView } from './permissionView';
import { chicagoDate } from '../../domain/time';

const STATE_LABEL = { WAITING_FOR_OWNER: ['Waiting for Dalia', 'warn'], WAITING_FOR_PERSON: ['Waiting for the person', 'info'], SNOOZED: ['Person snoozed it', 'gray'], DONE: ['Acknowledged', 'ok'] } as const;

/** Customer service: log an error for a team member, and look back at what was logged. */
export function Errors() {
  const { hub, uid } = useMe();
  const act = useAct();
  const key = useRef(newKey('err'));
  const [person, setPerson] = useState('');
  const [date, setDate] = useState(chicagoDate(hub.now));
  const [links, setLinks] = useState<string[]>(['']);
  const [text, setText] = useState('');
  const [done, setDone] = useState<string | null>(null);
  if (!hub.canLogErrors(uid)) return <PermissionDeniedView />;
  const people = hub.errorPeople(uid);
  const history = hub.listErrors(uid);
  const hints = hub.errorHints(uid);
  const ready = !!person && !!date && !!text.trim();
  return (
    <div className="stack">
      <div><h1>Errors</h1><p className="muted" style={{ margin: 0 }}>Log an error only after we confirmed we made it. Dalia is told right away. The team member sees it after Dalia has read it.</p></div>

      {hints.length > 0 && (
        <section className="stack" aria-label="Reminders">
          <h2 className="group-title" style={{ marginBottom: 0 }}>Maybe you forgot to log one <span className="count">{hints.length}</span></h2>
          {hints.map((h) => (
            <div key={h.key} className="card info stack" style={{ gap: 6 }}>
              <span className="small">{h.text}</span>
              <div className="row"><button onClick={() => { setPerson(h.uid); setDate(h.date); }}>Start an entry for {h.personName}</button><button className="quiet" onClick={() => act(() => hub.dismissErrorHint(uid, h.key), 'Reminder dismissed')}>It was not an error</button></div>
            </div>))}
        </section>
      )}

      <form className="card stack" onSubmit={async (e) => { e.preventDefault(); const r = await act(() => hub.logError(uid, { uid: person, occurredOn: date, links, description: text, idempotencyKey: key.current })); if (r) { key.current = newKey('err'); setDone(`Logged for ${hub.userName(person)}. Dalia was told.`); setPerson(''); setLinks(['']); setText(''); } }}>
        <h2 style={{ margin: 0 }}>Log an error</h2>
        {done && <div className="card ok" role="status">{done}</div>}
        <div><label htmlFor="er-p">Person</label><select id="er-p" value={person} onChange={(e) => setPerson(e.target.value)}><option value="">Choose a person…</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div><label htmlFor="er-d">Date the error happened</label><input id="er-d" type="date" max={chicagoDate(hub.now)} value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 220 }} /></div>
        <fieldset style={{ border: 'none', padding: 0 }}><legend style={{ fontWeight: 600 }}>Link to the order</legend>
          {links.map((l, i) => <input key={i} type="url" aria-label={`Order link ${i + 1}`} placeholder="https://…" value={l} onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))} style={{ marginBottom: 6 }} />)}
          <button type="button" className="link" onClick={() => setLinks([...links, ''])}>Add another link</button></fieldset>
        <div><label>Description of the error</label><RichEditor label="Description of the error" value={text} onChange={setText} /></div>
        <div><button className="primary" type="submit" disabled={!ready}>Log the error</button></div>
      </form>

      <section className="stack" aria-label="History">
        <h2 className="group-title" style={{ marginBottom: 0 }}>History <span className="count">{history.length}</span></h2>
        {history.length === 0 && <Empty>Nothing logged yet.</Empty>}
        {history.map((e) => (
          <div key={e.id} className="card stack" style={{ gap: 6 }}>
            <div className="row between"><strong>{e.personName}</strong><Chip tone={STATE_LABEL[e.state][1]}>{STATE_LABEL[e.state][0]}</Chip></div>
            <ErrorFacts e={e} />
            {e.personAck && <div className="small"><strong>Their note:</strong> {e.personAck.note}</div>}
          </div>))}
      </section>
    </div>
  );
}
