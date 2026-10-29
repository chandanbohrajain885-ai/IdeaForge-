import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Project } from './Types';
import { CATEGORIES } from './Types';
import { useApp } from './AppContext';
import { computeStats, deleteProject, duplicateProject, listProjects, projectState, PROJECT_STATE_LABEL, saveProject, type ProjectState } from './ProjectService';
import { ConfirmDialog, EmptyState, Notice, ProgressBar, SampleBadge, Spinner, formatDate, timeAgo } from './UI';

type Sort = 'updated' | 'created' | 'name' | 'progress';

export function ProjectHistory() {
  const { storage, toast, setLastProjectId, lastProjectId } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [state, setState] = useState<'all' | ProjectState>('all');
  const [sort, setSort] = useState<Sort>('updated');
  const [toDelete, setToDelete] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setProjects(await listProjects());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load projects.');
      setProjects([]);
    }
  }, []);

  // location.key changes on every navigation, so the list always reloads when this page is shown again
  useEffect(() => {
    void load();
  }, [load, storage, location.key]);

  const filtered = useMemo(() => {
    if (!projects) return [];
    const q = query.trim().toLowerCase();
    const list = projects.filter((p) => {
      if (category !== 'all' && p.input.category !== category) return false;
      if (state !== 'all' && projectState(p) !== state) return false;
      if (!q) return true;
      return `${p.input.name} ${p.input.idea} ${p.blueprint.summary}`.toLowerCase().includes(q);
    });
    return list.sort((a, b) => {
      if (sort === 'name') return a.input.name.localeCompare(b.input.name);
      if (sort === 'created') return b.createdAt.localeCompare(a.createdAt);
      if (sort === 'progress') return computeStats(b.tasks).percent - computeStats(a.tasks).percent;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [projects, query, category, state, sort]);

  const duplicate = async (p: Project) => {
    try {
      const copy = await saveProject(duplicateProject(p));
      setProjects((list) => [copy, ...(list ?? [])]);
      toast('Project duplicated with progress reset.', 'success');
      navigate(`/projects/${copy.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not duplicate the project.', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteProject(toDelete.id);
      if (lastProjectId === toDelete.id) setLastProjectId(null);
      setProjects((list) => (list ?? []).filter((p) => p.id !== toDelete.id));
      toast('Project deleted.', 'success');
      setToDelete(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not delete the project.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Project history</p>
          <h1>My Projects</h1>
          <p className="muted">{storage === 'cloud' ? 'Saved to your account.' : storage === 'local' ? 'Saved in this browser.' : 'Temporary - this tab only.'}</p>
        </div>
        <Link to="/new" className="btn btn-primary">
          + New project
        </Link>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      {projects === null ? (
        <Spinner label="Loading..." />
      ) : projects.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No saved projects"
            text="Projects you create will appear here so you can reopen, duplicate or delete them."
            action={
              <Link to="/new" className="btn btn-primary">
                Create a project
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="filters card">
            <div className="field grow">
              <label htmlFor="search">Search</label>
              <input id="search" type="search" placeholder="Search by name or idea" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-cat">Category</label>
              <select id="f-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="all">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-state">Status</label>
              <select id="f-state" value={state} onChange={(e) => setState(e.target.value as 'all' | ProjectState)}>
                <option value="all">All</option>
                {(Object.keys(PROJECT_STATE_LABEL) as ProjectState[]).map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATE_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-sort">Sort</label>
              <select id="f-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="updated">Last updated</option>
                <option value="created">Newest</option>
                <option value="name">Name A-Z</option>
                <option value="progress">Most progress</option>
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="card">
              <EmptyState
                title="No matching projects"
                text="Try a different search or filter."
                action={
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setQuery('');
                      setCategory('all');
                      setState('all');
                    }}
                  >
                    Clear filters
                  </button>
                }
              />
            </div>
          ) : (
            <div className="proj-grid">
              {filtered.map((p) => {
                const s = computeStats(p.tasks);
                return (
                  <article key={p.id} className="card proj-card">
                    <div className="proj-card-top">
                      <span className="badge">{p.input.category}</span>
                      {p.source === 'sample' && <SampleBadge />}
                    </div>
                    <h2>
                      <Link to={`/projects/${p.id}`}>{p.input.name}</Link>
                    </h2>
                    <p className="muted clamp">{p.blueprint.summary || p.input.idea}</p>
                    <div className="proj-card-progress">
                      <ProgressBar percent={s.percent} />
                      <span className="small">
                        {s.percent}% · {PROJECT_STATE_LABEL[projectState(p)]}
                      </span>
                    </div>
                    <p className="muted small">
                      Created {formatDate(p.createdAt)} · updated {timeAgo(p.updatedAt)}
                    </p>
                    <div className="btn-row">
                      <Link to={`/projects/${p.id}`} className="btn btn-primary btn-sm">
                        Open
                      </Link>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void duplicate(p)}>
                        Duplicate
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm danger-text" onClick={() => setToDelete(p)}>
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete project?"
        message={
          <>
            <p>
              <strong>{toDelete?.input.name}</strong> and all its tasks, guides and chat history will be permanently deleted.
            </p>
            <p>Tip: export a backup first if you might need it later.</p>
          </>
        }
        confirmLabel="Delete permanently"
        danger
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
