import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from './AppContext';
import { Logo } from './UI';

const icons: Record<string, ReactNode> = {
  dashboard: <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />,
  new: <path d="M12 5v14M5 12h14" />,
  projects: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />,
  roadmap: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  assistant: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/new', label: 'Create Project', icon: 'new' },
  { to: '/projects', label: 'My Projects', icon: 'projects' },
  { to: '/roadmap', label: 'Project Roadmap', icon: 'roadmap' },
  { to: '/assistant', label: 'AI Assistant', icon: 'assistant' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { health, aiLive, user, supabaseConfigured, signOut, toast, storage } = useApp();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [location.pathname]);

  const onSignOut = async () => {
    try {
      await signOut();
      toast('Signed out. Projects are now saved in this browser.', 'success');
      navigate('/dashboard');
    } catch {
      toast('Could not sign out. Please try again.', 'error');
    }
  };

  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" className="icon-btn menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <Link to="/dashboard" className="topbar-brand" aria-label="IdeaForge AI dashboard">
          <Logo size={32} />
        </Link>
      </header>

      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <Link to="/" className="sidebar-brand" aria-label="IdeaForge AI home">
          <Logo size={40} />
        </Link>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className={`status-pill ${aiLive ? 'ok' : 'demo'}`} title={health?.message ?? ''}>
            <span className="dot" aria-hidden="true" />
            {health === null ? 'Checking AI...' : aiLive ? `AI live${health.provider ? ` - ${health.provider}` : ''}` : 'Demo mode (AI not configured)'}
          </div>
          <div className="storage-note">Saving: {storage === 'cloud' ? 'your account (cloud)' : storage === 'local' ? 'this browser only' : 'temporary (this tab)'}</div>
          {supabaseConfigured &&
            (user ? (
              <div className="account">
                <span className="account-email" title={user.email ?? ''}>
                  {user.email}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onSignOut}>
                  Sign out
                </button>
              </div>
            ) : (
              <Link to="/login" className="btn btn-secondary btn-sm btn-block">
                Sign in / Sign up
              </Link>
            ))}
        </div>
      </aside>
      {open && <div className="sidebar-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <main className="main" id="main">
        {health && !aiLive && (
          <div className="demo-banner">
            <strong>Demo mode.</strong> The AI provider is not configured on the server, so plans and answers are clearly-labelled{' '}
            <em>sample output</em> from templates. <Link to="/settings">See how to enable AI</Link>.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
