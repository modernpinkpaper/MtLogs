import { useState } from 'react';
import { useMe } from '../hubContext';
import { Chip } from '../common';
import { formatDuration, formatTime } from '../../domain/time';

export function PrintMyStats() {
  const { hub, uid, me } = useMe();
  const [date, setDate] = useState('2026-10-16');
  const [who, setWho] = useState(uid);
  const view = hub.myPrintStats(uid, who, date);
  const s = view.stats;
  const printUsers = hub.listUsers(uid).filter((u) => hub.state.stations.some((st) => st.defaultUid === u.id));
  return (
    <div className="stack">
      <div className="row between"><div><h1>Print figures</h1><p className="muted">Simple, accurate numbers for the day. No AI review is needed for routine printing.</p></div></div>
      <div className="row">
        <label className="row" style={{ margin: 0 }}>Day <select style={{ width: 'auto' }} value={date} onChange={(e) => setDate(e.target.value)}>{['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map((d) => <option key={d}>{d}</option>)}</select></label>
        {me.role === 'OWNER' && <label className="row" style={{ margin: 0 }}>Person <select style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)}>{printUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
        <Chip tone="gray">Assignment that day: {view.area.toLowerCase()}</Chip>
        {s.pendingSync && <Chip tone="warn" glyph="…">Pending synchronization</Chip>}
        <Chip tone={s.coverage === 'COMPLETE' ? 'ok' : s.coverage === 'PARTIAL' ? 'warn' : 'gray'} glyph={s.coverage === 'COMPLETE' ? '✔' : '!'}>Data: {s.coverage.toLowerCase()}</Chip>
      </div>
      <div className={`card ${s.coverage === 'COMPLETE' ? 'ok' : 'warn'}`}>{s.coverageNote}</div>
      <div className="card">
        <div className="statrow">
          <div className="stat"><div className="v">{s.completed}</div><div className="l">Completed jobs</div></div>
          <div className="stat"><div className="v">{s.attempted}</div><div className="l">Attempted jobs</div></div>
          <div className="stat"><div className="v">{s.sheets}</div><div className="l">Sheets in completed jobs</div></div>
          <div className="stat"><div className="v">{formatDuration(s.printMinutes)}</div><div className="l">Printer run time</div></div>
          <div className="stat"><div className="v">{s.failed}</div><div className="l">Failed</div></div>
          <div className="stat"><div className="v">{s.retries}</div><div className="l">Retries</div></div>
          <div className="stat"><div className="v">{s.awaitingResult}</div><div className="l">Awaiting result</div></div>
        </div>
        <p className="small muted">{s.retryRateNote} {view.station ? `Printers: ${view.station.printers.join(', ')}.` : 'No print station is assigned.'} These are machine/log figures — not a performance score and not used for pay.</p>
      </div>
      <div className="card"><h2>Printer problems (grouped)</h2>
        {view.problemEpisodes.length === 0 ? <span className="muted">No problems recorded.</span> : view.problemEpisodes.map((e) => (
          <div key={e.id} className="small">{e.printer}: {e.kind.toLowerCase()} from {formatTime(e.startedAt)}{e.endedAt ? ` to ${formatTime(e.endedAt)}` : ' (still open)'} — <strong>1 incident</strong> ({e.snapshotCount} status snapshots)</div>))}
      </div>
    </div>
  );
}
