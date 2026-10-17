import { useNavigate } from 'react-router-dom';
import { useHub, useSession } from '../hubContext';

export function Login() {
  const hub = useHub();
  const { setUid } = useSession();
  const nav = useNavigate();
  const users = hub.state.users.filter((u) => u.active);
  return (
    <div style={{ maxWidth: 760, margin: '4vh auto', padding: '0 1rem' }} id="main">
      <h1 style={{ color: 'var(--pink-strong)' }}>MPP Business Hub</h1>
      <p className="muted">Interactive prototype · synthetic demo data only</p>
      <div className="card violet stack" role="note">
        <strong>This is a demo role switcher, not real sign-in.</strong>
        <p className="small">In production, protected business data requires an authenticated session (Firebase Auth) with server-checked roles. The time-clock PIN alone must not unlock sensitive data. This prototype grants no production privileges and never contacts Firebase, Google, Amazon, Etsy, Shopify or MT Log.</p>
      </div>
      <h2 style={{ marginTop: '1.2rem' }}>Choose who to view the app as</h2>
      <div className="grid cols-2">
        {users.map((u) => (
          <button key={u.id} className="card" style={{ textAlign: 'left' }} onClick={() => { setUid(u.id); nav('/home'); }}>
            <strong>{u.name}</strong> <span className="muted small">{u.role === 'OWNER' ? 'Owner' : `Employee · ${hub.areaOn(u.id).toLowerCase()}`}</span>
            <div className="small muted">{u.rosterNote ?? (u.role === 'OWNER' ? 'Owner command center, private projects, requests, notifications.' : u.capabilities.join(', ') || 'No duties assumed')}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
