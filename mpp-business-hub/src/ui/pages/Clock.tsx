import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { newKey, useAct, useMe } from '../hubContext';
import { chicagoDate, formatDateTime, formatDuration, formatTime, minutesBetween } from '../../domain/time';
import { PersonErrorCard } from '../errorUi';
import { PrintDayCard } from '../printUi';
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
  const today = chicagoDate(hub.now);
  const errs = me.role === 'OWNER' ? { toReview: [], snoozed: [] } : hub.errorsForPerson(uid);
  const printSum = me.role === 'OWNER' ? null : hub.printSummary(uid, uid, today);
  const showPrint = !!printSum && hub.state.claims !== undefined && (printSum.day.orders > 0 || (!!confirmOut && printSum.hasRecentPrinting));

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
            {errs.toReview.length > 0 && (
              <div className="stack">
                <div className="card warn small" role="status"><strong>{errs.toReview.length === 1 ? 'There is an error in your log.' : `There are ${errs.toReview.length} errors in your log.`}</strong> Please read {errs.toReview.length === 1 ? 'it' : 'them'} and acknowledge with a note. If you need to leave now, snooze {errs.toReview.length === 1 ? 'it' : 'them'} and you will see {errs.toReview.length === 1 ? 'it' : 'them'} again when you clock in.</div>
                {errs.toReview.map((e) => <PersonErrorCard key={e.id} e={e} />)}
              </div>
            )}
            {errs.toReview.length > 0 ? null : readiness.cards.length > 0 ? (
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

      {showPrint && <PrintDayCard forUid={uid} date={today} title="Today’s printing numbers" />}
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
