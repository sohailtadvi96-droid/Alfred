import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function LoginPage() {
  const { session, configured, signInWithPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/expenses';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await signInWithPassword(email.trim(), password);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    navigate(from, { replace: true });
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="lmark">
          <span className="mark">A</span>
          <b>ALFRED</b>
        </div>
        <div className="lsub">Personal butler</div>

        {!configured && (
          <div className="lerr">
            Supabase isn’t configured. Copy <span className="mono">.env.example</span> to{' '}
            <span className="mono">.env</span> and add your project URL and anon key.
          </div>
        )}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className={`field${error ? ' bad' : ''}`}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <span className="err">{error}</span>}
        </div>

        <button className="btn primary" type="submit" style={{ width: '100%', justifyContent: 'center' }} disabled={busy || !configured}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
