import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMe, useSession } from './hubContext';
import { formatDateTime, formatTime } from '../domain/time';
import { Chip } from './common';

export function Layout() {
  const { hub, uid, me } = useMe();
  const { setUid } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const owner = me.role === 'OWNER';
  const counts = hub.counts(uid);
  const shift = hub.openShift(uid);
  const area = hub.areaOn(uid);
  const results = q.trim().length > 1 ? hub.search(uid, q) : null;

  const links: { to: string; label: string; icon: string; badge?: number }[] = [
    { to: '/home', label: owner ? 'Home' : 'My Work', icon: '⌂' },
    ...(owner ? [] : [{ to: '/clock', label: 'Clock in / out', icon: '⏱' }]),
    { to: '/projects', label: 'Projects', icon: '▤' },
    { to: '/review', label: 'Review', icon: '✓', badge: counts.pendingCards },
    { to: '/notifications', label: 'Notifications', icon: '🔔', badge: counts.unreadNotifications },
    { to: '/journal', label: 'History', icon: '✎' },
    { to: '/resources', label: 'Files', icon: '⧉' },
    ...(!owner && (area === 'PRINT' || area === 'MIXED') ? [{ to: '/print/my-stats', label: 'My printing', icon: '🖨' }] : []),
  ];
  const ownerLinks = [
    { to: '/owner/print-weekly', label: 'Weekly printing', icon: '🖨' },
    { to: '/owner/team', label: 'Team', icon: '☺' },
    { to: '/owner/insights', label: 'Ideas', icon: '✦' },
    { to: '/owner/data-intake', label: 'Computer data & AI', icon: '⇩' },
  ];

  return (
    <div className="app">
      <aside className={`side ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand">MPP Business Hub<small>Practice copy · made-up data</small></div>
        <nav className="nav" onClick={() => setOpen(false)}>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span aria-hidden="true">{l.icon}</span> {l.label} {l.badge ? <span className="badge" aria-label={`${l.badge} pending`}>{l.badge}</span> : null}
            </NavLink>
          ))}
          {owner && <div className="group">Owner</div>}
          {owner && ownerLinks.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}><span aria-hidden="true">{l.icon}</span> {l.label}</NavLink>
          ))}
          <div className="group">System</div>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}><span aria-hidden="true">⚙</span> Settings</NavLink>
          <NavLink to="/status" className={({ isActive }) => (isActive ? 'active' : '')}><span aria-hidden="true">☰</span> What works</NavLink>
          <NavLink to="/demo/operations" className={({ isActive }) => (isActive ? 'active' : '')}><span aria-hidden="true">▶</span> Demo controls</NavLink>
        </nav>
      </aside>
      <div className="main">
        <div className="demo-banner" role="note">
          <strong>DEMO</strong> — this is a practice copy with made-up data. It is not connected to your real clock-in app, Google, MT Log, Amazon, Etsy or Shopify. Pretend time: {formatDateTime(hub.now)}.
        </div>
        <header className="topbar">
          <button className="menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Toggle navigation">☰</button>
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 420 }}>
            <input type="search" placeholder="Search projects, steps and files…" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            {results && (
              <div className="card" style={{ position: 'absolute', top: 46, left: 0, right: 0, zIndex: 30, maxHeight: 360, overflow: 'auto' }}>
                {!results.projects.length && !results.steps.length && !results.resources.length && <span className="muted">No results.</span>}
                {results.projects.map((p) => <div key={p.id}><a href={`#/projects/${p.id}`} onClick={() => setQ('')}>{p.key} — {p.title}</a></div>)}
                {results.steps.map((s) => <div key={s.id} className="small"><a href={`#/projects/${s.projectId}/steps/${s.id}`} onClick={() => setQ('')}>Step: {s.title}</a></div>)}
                {results.resources.map((r) => <div key={r.id} className="small"><a href={`#/resources?q=${encodeURIComponent(r.label)}`} onClick={() => setQ('')}>File: {r.label}</a></div>)}
              </div>
            )}
          </div>
          <span className="spacer" />
          {!owner && <Chip tone={shift ? 'ok' : 'gray'} glyph={shift ? '●' : '○'}>{shift ? `Clocked in ${formatTime(shift.clockInAt)}` : 'Clocked out'}</Chip>}
          <button className="bell ghost" onClick={() => nav('/notifications')} aria-label={`Notifications, ${counts.unreadNotifications} unread`}>
            🔔{counts.unreadNotifications > 0 && <span className="badge" aria-hidden="true">{counts.unreadNotifications}</span>}
          </button>
          <label className="row" style={{ margin: 0, fontWeight: 500 }}>
            <span className="small muted">Demo user</span>
            <select aria-label="Switch demo user" style={{ width: 'auto' }} value={uid} onChange={(e) => { setUid(e.target.value); nav(loc.pathname.startsWith('/owner') ? '/home' : '/home'); }}>
              {hub.state.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}{u.role === 'OWNER' ? ' (owner)' : ''}</option>)}
            </select>
          </label>
          <button onClick={() => { setUid(null); nav('/login'); }}>Sign out</button>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
