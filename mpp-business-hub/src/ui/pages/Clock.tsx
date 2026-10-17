import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { newKey, useAct, useMe } from '../hubContext';
import { formatDateTime, formatDuration, formatTime, minutesBetween } from '../../domain/time';
import { Chip, CoverageChip, Modal } from '../common';
import type { Shift } from '../../domain/types';

export function Clock() {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const nav = useNavigate();
  const inKey = useRef(newKey('in'));
  const outKey = useRef(newKey('out'));
  const [overlay, setOverlay] = useState<number | null>(null);
  const [confirmIn, setConfirmIn] = useState<Shift | null>(null);
  const [confirmOut, setConfirmOut] = useState<{ shift: Shift; pending: number } | null>(null);
  const shift = hub.openShift(uid);
  const readiness = hub.reviewReadiness(uid);
  const area = hub.areaOn(uid);
  const showPrint = area === 'PRINT' || area === 'MIXED';
  const print = showPrint ? hub.myPrintStats(uid) : null;

  if (me.role === 'OWNER') return <div><h1>Clock</h1><div className="card">The owner account doesn’t clock in. Switch to an employee to try the paid-time flows.</div></div>;

  const clockIn = async () => {
    // 1) commit the clock-in first. 2) only then look at reviews.
    const r = await act(() => hub.clockIn(uid, inKey.current));
    if (!r) return;
    inKey.current = newKey('in');
    setConfirmIn(r.shift);
    setConfirmOut(null);
    if (r.outstanding.length) setOverlay(r.outstanding.length);
  };
  const clockOut = async () => {
    const r = await act(() => hub.clockOut(uid, outKey.current));
    if (!r?.shift) return;
    outKey.current = newKey('out');
    setConfirmOut({ shift: r.shift, pending: r.pendingCards });
    setConfirmIn(null);
  };

  return (
    <div className="stack">
      <div><h1>Clock in / out</h1><p className="muted">Your time clock never waits for anything. Reviewing your work counts as paid time.</p></div>

      {confirmIn && <div className="card ok" role="status"><strong>You clocked in at {formatTime(confirmIn.clockInAt)}.</strong> Your pay clock has started.</div>}
      {confirmOut && (
        <div className="card ok" role="status">
          <strong>You clocked out at {formatTime(confirmOut.shift.clockOutAt)}.</strong> You worked: {formatDuration(minutesBetween(confirmOut.shift.clockInAt, confirmOut.shift.clockOutAt!))}.
          {confirmOut.pending > 0 && <div className="small">{confirmOut.pending} review card(s) are saved for your next shift. Nothing was closed.</div>}
        </div>
      )}

      <div className="card">
        {shift ? (
          <div className="stack">
            <div className="row between"><div><Chip tone="ok" glyph="●">Clocked in since {formatDateTime(shift.clockInAt)}</Chip><div className="muted small">Elapsed: {formatDuration(minutesBetween(shift.clockInAt, hub.now))}</div></div></div>
            <h2>Before you leave</h2>
            {readiness.cards.length > 0 ? (
              <div className="card pink">
                <strong>{readiness.cards.length} review card(s) are ready.</strong>{readiness.provisional > 0 && <> <Chip tone="warn" glyph="…">{readiness.provisional} Not final yet</Chip></>}
                <p className="small">If you review now, you still get paid (about 1 to 3 minutes). Or you can clock out now and review next time.</p>
                <div className="row"><button className="primary" onClick={() => nav('/review')}>Review now</button><button onClick={clockOut}>Clock out now, review next time</button></div>
              </div>
            ) : (
              <div className="card flat">
                <p>{readiness.message}</p>
                <div className="row"><button className="primary" onClick={clockOut}>Clock out now</button></div>
              </div>
            )}
            {(readiness.aiStatus !== 'OK' || readiness.logSyncStatus !== 'OK') && <div className="card warn small" role="status">{readiness.message}</div>}
            {readiness.coverageIssues.length > 0 && <div className="small muted">Computer data: {readiness.coverageIssues.map((c) => <span key={c.deviceId}>{c.deviceId} <CoverageChip state={c.state} /> </span>)}</div>}
          </div>
        ) : (
          <div className="stack">
            <Chip tone="gray" glyph="○">Clocked out</Chip>
            <p>Clock in first. If you have reviews waiting, you will see them <em>after</em> you clock in.</p>
            <div><button className="primary" onClick={clockIn}>Clock in</button></div>
            <p className="small muted">Note: the real clock PIN is not used here. This is only a practice copy.</p>
          </div>
        )}
      </div>

      {print && (
        <div className="card">
          <div className="row between"><h2>Today’s printing numbers</h2>{print.stats.pendingSync && <Chip tone="warn" glyph="…">Still catching up</Chip>}</div>
          <p className="small muted">{print.stats.coverageNote}</p>
          <div className="statrow">
            <div className="stat"><div className="v">{print.stats.completed}</div><div className="l">Completed jobs</div></div>
            <div className="stat"><div className="v">{print.stats.attempted}</div><div className="l">Attempted</div></div>
            <div className="stat"><div className="v">{print.stats.sheets}</div><div className="l">Sheets (completed)</div></div>
            <div className="stat"><div className="v">{print.stats.failed}</div><div className="l">Failed</div></div>
            <div className="stat"><div className="v">{print.stats.retries}</div><div className="l">Retries</div></div>
          </div>
          <p className="small muted">{print.stats.retryRateNote} These are just numbers. They are not a grade and they do not change your pay.</p>
        </div>
      )}

      {overlay !== null && (
        <Modal title="You clocked in" onClose={() => setOverlay(null)}>
          <div className="stack">
            <div className="card ok">You are clocked in. Your pay clock has started.</div>
            <p>You have <strong>{overlay}</strong> review card(s) waiting. Reviewing is paid work. You can also do it later today.</p>
            <div className="row"><button className="primary" onClick={() => { setOverlay(null); nav('/review'); }}>Review now (you get paid)</button><button onClick={() => setOverlay(null)}>Later</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
