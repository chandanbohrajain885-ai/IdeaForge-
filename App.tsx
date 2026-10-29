import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { HashRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Project, WorkspaceTab } from './Types';
import { AppProvider, useApp } from './AppContext';
import { Layout } from './Layout';
import { Landing, Onboarding } from './Landing';
import { AuthPage } from './AuthPage';
import { Dashboard } from './Dashboard';
import { IdeaForm } from './IdeaForm';
import { ProjectWorkspace } from './ProjectWorkspace';
import { ProjectHistory } from './ProjectHistory';
import { Settings } from './Settings';
import { getProject, listProjects } from './ProjectService';
import { EmptyState, Spinner, timeAgo } from './UI';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('IdeaForge UI error:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="page narrow">
          <div className="card">
            <h1>Something went wrong</h1>
            <p className="muted">The page hit an unexpected error. Your saved projects are not affected.</p>
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
                Reload page
              </button>
              <a href="#/dashboard" className="btn btn-secondary">
                Go to dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** /roadmap and /assistant: open the last project in that tab, or let the user pick one. */
function ProjectShortcut({ tab, title }: { tab: WorkspaceTab; title: string }) {
  const { lastProjectId, storage } = useApp();
  const [state, setState] = useState<{ loading: boolean; target: string | null; projects: Project[] }>({ loading: true, target: null, projects: [] });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (lastProjectId) {
          const p = await getProject(lastProjectId);
          if (p) {
            if (active) setState({ loading: false, target: p.id, projects: [] });
            return;
          }
        }
        const all = await listProjects();
        if (!active) return;
        if (all.length === 1) setState({ loading: false, target: all[0].id, projects: all });
        else setState({ loading: false, target: null, projects: all });
      } catch {
        if (active) setState({ loading: false, target: null, projects: [] });
      }
    })();
    return () => {
      active = false;
    };
  }, [lastProjectId, storage]);

  if (state.loading) return <div className="page"><Spinner label="Opening..." /></div>;
  if (state.target) return <Navigate to={`/projects/${state.target}?tab=${tab}`} replace />;
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <p className="eyebrow">{title}</p>
          <h1>Choose a project</h1>
        </div>
      </div>
      {state.projects.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No projects yet"
            text={`The ${title.toLowerCase()} works inside a project. Create one first.`}
            action={
              <Link to="/new" className="btn btn-primary">
                Create a project
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="card proj-mini">
          {state.projects.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}?tab=${tab}`}>
                <div>
                  <strong>{p.input.name}</strong>
                  <span className="muted small">updated {timeAgo(p.updatedAt)}</span>
                </div>
                <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotFound() {
  return (
    <div className="page narrow">
      <div className="card">
        <EmptyState
          title="Page not found"
          text="The page you are looking for does not exist."
          action={
            <Link to="/dashboard" className="btn btn-primary">
              Go to dashboard
            </Link>
          }
        />
      </div>
    </div>
  );
}

function AppRoutes() {
  const { authReady } = useApp();
  if (!authReady) {
    return (
      <div className="page center-page">
        <Spinner label="Loading IdeaForge AI..." />
      </div>
    );
  }
  const inLayout = (node: ReactNode) => (
    <Layout>
      <ErrorBoundary>{node}</ErrorBoundary>
    </Layout>
  );
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/welcome" element={<Onboarding />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/dashboard" element={inLayout(<Dashboard />)} />
      <Route path="/new" element={inLayout(<IdeaForm />)} />
      <Route path="/projects" element={inLayout(<ProjectHistory />)} />
      <Route path="/projects/:id" element={inLayout(<ProjectWorkspace />)} />
      <Route path="/roadmap" element={inLayout(<ProjectShortcut tab="roadmap" title="Project Roadmap" />)} />
      <Route path="/assistant" element={inLayout(<ProjectShortcut tab="assistant" title="AI Assistant" />)} />
      <Route path="/settings" element={inLayout(<Settings />)} />
      <Route path="*" element={inLayout(<NotFound />)} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <AppProvider>
          <ScrollToTop />
          <button
            type="button"
            className="skip-link"
            onClick={() => {
              const main = document.getElementById('main');
              if (main) {
                main.setAttribute('tabindex', '-1');
                main.focus();
              }
            }}
          >
            Skip to content
          </button>
          <AppRoutes />
        </AppProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
