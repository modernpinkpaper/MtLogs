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
      <p className="muted">A practice copy · all data is made up</p>
      <div className="card violet stack" role="note">
        <strong>This is a practice picker, not a real sign-in.</strong>
        <p className="small">In the real app, you would sign in with a safe login. A clock PIN alone should never open private business info. This practice copy cannot reach your real systems. It never talks to Firebase, Google, Amazon, Etsy, Shopify or MT Log.</p>
      </div>
      <div className="card pink stack" style={{ marginTop: '1rem' }}>
        <strong>Not sure where to start? Try this:</strong>
        <ol className="small" style={{ margin: '0 0 0 1.1rem' }}>
          <li>Pick <strong>Dalia</strong>. Open “Projects”, then “P-012”, then click Step 3. Press “Ask for an update”.</li>
          <li>Use the “Demo user” menu at the top to switch to <strong>Erika</strong>. Open “Review” and answer the card.</li>
          <li>Switch back to <strong>Dalia</strong>. Click the bell to see Erika’s answer.</li>
          <li>As Erika, open “Clock in / out” to see that clocking out never waits for reviews.</li>
          <li>Open “Demo controls” to play out more of the day.</li>
        </ol>
      </div>
      <h2 style={{ marginTop: '1.2rem' }}>Pick who you want to be</h2>
      <div className="grid cols-2">
        {users.map((u) => (
          <button key={u.id} className="card" style={{ textAlign: 'left' }} onClick={() => { setUid(u.id); nav('/home'); }}>
            <strong>{u.name}</strong> <span className="muted small">{u.role === 'OWNER' ? 'Owner' : `Employee · ${hub.areaOn(u.id).toLowerCase()}`}</span>
            <div className="small muted">{u.rosterNote ?? (u.role === 'OWNER' ? 'Sees everything. Asks for updates. Has private projects.' : u.capabilities.join(', ') || 'No jobs set yet')}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
