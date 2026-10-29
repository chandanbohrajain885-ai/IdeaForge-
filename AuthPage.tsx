import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useApp } from './AppContext';
import { supabase } from './SupabaseClient';
import { Logo, Notice } from './UI';
import { isValidEmail } from './Validation';

export function AuthPage() {
  const { supabaseConfigured, user, toast } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!isValidEmail(email)) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (!supabase) return setError('Accounts are not configured on this deployment.');
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
        toast('Signed in. Your projects now save to your account.', 'success');
        navigate('/dashboard');
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (err) throw err;
        if (data.session) {
          toast('Account created. Welcome to IdeaForge AI!', 'success');
          navigate('/dashboard');
        } else {
          setInfo('Account created. Check your inbox and click the confirmation link, then sign in.');
          setMode('signin');
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(/invalid login/i.test(msg) ? 'Email or password is incorrect.' : /fetch|network/i.test(msg) ? 'Could not reach the sign-in service. Check your connection.' : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <Link to="/" aria-label="Home">
          <Logo size={44} />
        </Link>
        {!supabaseConfigured ? (
          <>
            <h1>Accounts are not set up</h1>
            <Notice kind="info">
              This deployment has no Supabase configuration, so sign-in is disabled. You can still use every feature - projects are saved in this
              browser only. An administrator can enable accounts by following the Supabase section of the README.
            </Notice>
            <Link to="/dashboard" className="btn btn-primary btn-block">
              Continue without an account
            </Link>
          </>
        ) : (
          <>
            <h1>{mode === 'signin' ? 'Sign in' : 'Create your account'}</h1>
            <p className="muted">Sign in to save projects to your account and open them on any device.</p>
            <div className="seg" role="tablist" aria-label="Sign in or sign up">
              <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>
                Sign in
              </button>
              <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
                Sign up
              </button>
            </div>
            <form onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
                {mode === 'signup' && <p className="hint">At least 8 characters.</p>}
              </div>
              {error && <Notice kind="error">{error}</Notice>}
              {info && <Notice kind="success">{info}</Notice>}
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>
            <Link to="/dashboard" className="btn btn-ghost btn-block">
              Continue without an account
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
