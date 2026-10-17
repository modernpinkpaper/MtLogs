import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Chip, Empty } from '../common';
import { formatDateTime } from '../../domain/time';
import type { NotificationType } from '../../domain/types';

const LABEL: Record<NotificationType, string> = {
  OWNER_UPDATE_REQUEST: 'Owner update request', EMPLOYEE_RESPONSE: 'Employee response', NEEDS_VERIFICATION: 'Needs verification', BLOCKER: 'Blocker', MISSING_COVERAGE: 'Missing coverage',
  DAILY_DIGEST: 'Daily digest ready', WEEKLY_PRINT_INSIGHT: 'Weekly print insight', DIRECT_MENTION: 'Direct project mention', FOLLOW_UP: 'Follow-up request',
};

export function Notifications() {
  const { hub, uid } = useMe();
  const act = useAct();
  const nav = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [type, setType] = useState('');
  const list = hub.listNotifications(uid).filter((n) => (filter === 'all' || !n.readAt) && (!type || n.type === type) && (!n.snoozedUntil || n.snoozedUntil <= hub.now));
  return (
    <div className="stack">
      <div className="row between"><div><h1>Notifications</h1><p className="muted">These are your notifications. Email and phone alerts are not in this practice copy.</p></div><button onClick={() => act(() => hub.markAllRead(uid))}>Mark all as read</button></div>
      <div className="row">
        <select aria-label="Show" style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'unread')}><option value="all">All</option><option value="unread">Unread</option></select>
        <select aria-label="Type" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      {list.length === 0 && <Empty>Nothing here.</Empty>}
      {list.map((n) => (
        <div key={n.id} className={`card ${!n.readAt ? 'pink' : ''}`}>
          <div className="row between">
            <div className="row"><Chip tone={n.readAt ? 'gray' : 'pink'} glyph={n.readAt ? '○' : '●'}>{n.readAt ? 'Read' : 'Unread'}</Chip><Chip tone="gray">{LABEL[n.type]}</Chip>{n.acknowledgedAt && <Chip tone="ok" glyph="✔">Seen</Chip>}</div>
            <span className="small muted">{formatDateTime(n.createdAt)} </span>
          </div>
          <h3 style={{ marginTop: 6 }}>{n.title}</h3>
          <p className="small">{n.preview}</p>
          <div className="row">
            <button className="primary" onClick={async () => { await act(() => hub.markRead(uid, n.id)); nav(n.deepLink); }}>Open</button>
            {!n.acknowledgedAt && ['EMPLOYEE_RESPONSE', 'BLOCKER', 'NEEDS_VERIFICATION'].includes(n.type) && <button onClick={() => act(() => hub.acknowledge(uid, n.id), 'Marked as seen')}>I saw this</button>}
            {!n.readAt && <button onClick={() => act(() => hub.markRead(uid, n.id))}>Mark read</button>}
            <button onClick={() => act(() => hub.snoozeNotification(uid, n.id, 60), 'Snoozed for 1 hour')}>Remind me in 1 hour</button>
            <button className="ghost" onClick={() => act(() => hub.dismissNotification(uid, n.id))}>Dismiss</button>
          </div>
        </div>
      ))}
    </div>
  );
}
