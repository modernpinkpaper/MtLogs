import { type FormEvent, useState } from 'react';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth, OWNER_EMAIL } from '../../firebase';

function friendlyAuthError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (/invalid-credential|wrong-password|user-not-found/.test(code)) return 'That email and password do not match.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please wait and try again.';
  if (code.includes('unauthorized-domain')) return 'This address is not approved for sign-in yet.';
  return 'Sign-in did not work. Please try again.';
}

export function Login() {
  const [email, setEmail] = useState(OWNER_EMAIL);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setPassword('');
    } catch (error) {
      setMessage(friendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!email.trim()) {
      setMessage('Enter your email address first.');
      return;
    }
    setMessage('');
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage('Password-reset instructions were sent if that account exists.');
    } catch (error) {
      setMessage(friendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mpp-auth-shell" id="main" aria-labelledby="mpp-auth-title">
      <section className="mpp-auth-card">
        <div className="mpp-auth-brand"><span>Modern Pink Paper</span><small>Business Hub</small></div>
        <h1 id="mpp-auth-title">Welcome back</h1>
        <p className="mpp-auth-subtitle">Sign in to your secure workspace.</p>
        <form onSubmit={submit}>
          <label>Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="mpp-auth-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <button className="mpp-auth-link" type="button" onClick={reset} disabled={busy}>Forgot your password?</button>
        {import.meta.env.DEV && <button className="mpp-auth-link dev-preview" type="button" onClick={() => { sessionStorage.setItem('mpp-dev-owner', '1'); location.hash = '/home'; location.reload(); }}>Local visual preview</button>}
        <p className="mpp-auth-message" role="status" aria-live="polite">{message}</p>
      </section>
    </main>
  );
}
