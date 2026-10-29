import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Project, ProjectInput } from './Types';
import { useApp } from './AppContext';
import { computeStats, createProject, currentPhaseLabel, listProjects, projectState, PROJECT_STATE_LABEL, saveProject, upcomingTasks } from './ProjectService';
import { sampleBlueprint, sampleRoadmap } from './SampleData';
import { EmptyState, Notice, ProgressBar, SampleBadge, Spinner, timeAgo } from './UI';

const SAMPLE_INPUT: ProjectInput = {
  name: 'StudyBuddy Planner',
  idea: 'A web app where college students enter their exam dates and subjects, and the app builds a daily study timetable with AI tips, and lets them tick off completed topics.',
  problem: 'Students leave preparation to the last week because they do not know how to split topics across the days they have.',
  users: 'Engineering college students',
  category: 'Education Technology',
  platform: 'Web (browser)',
  experience: 'beginner',
  technologies: 'React',
  budget: 'Free tools only',
  timeline: '6 weeks',
};

export function Dashboard() {
  const { storage, toast, setLastProjectId, health, aiLive } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setProjects(await listProjects());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your projects.');
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, storage, location.key]);

  const loadSample = async () => {
    setCreating(true);
    try {
      const p = await saveProject(createProject(SAMPLE_INPUT, [], sampleBlueprint(SAMPLE_INPUT), sampleRoadmap(SAMPLE_INPUT), 'sample'));
      setLastProjectId(p.id);
      toast('Sample project created. It is labelled as sample output.', 'success');
      navigate(`/projects/${p.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create the sample project.', 'error');
    } finally {
      setCreating(false);
    }
  };

  if (projects === null) {
    return (
      <div className="page">
        <Spinner label="Loading your projects..." />
      </div>
    );
  }

  const current = projects[0];
  const totals = projects.reduce(
    (acc, p) => {
      const s = computeStats(p.tasks);
      acc.done += s.done;
      acc.total += s.total;
      if (projectState(p) === 'completed') acc.completed += 1;
      return acc;
    },
    { done: 0, total: 0, completed: 0 },
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Welcome back</h1>
          <p className="muted">Pick up where you left off, or turn a new idea into a plan.</p>
        </div>
        <Link to="/new" className="btn btn-primary">
          + New project
        </Link>
      </div>

      {error && (
        <Notice kind="error" title="Could not load projects">
          {error}{' '}
          <button type="button" className="link-btn" onClick={() => void load()}>
            Retry
          </button>
        </Notice>
      )}
      {storage !== 'cloud' && projects.length > 0 && (
        <Notice kind="info">
          {storage === 'memory'
            ? 'Browser storage is blocked, so projects will be lost when you close this tab. Export a backup from each project.'
            : 'Projects are saved in this browser only. Clearing browser data deletes them - export a backup from Settings, or sign in if accounts are enabled.'}
        </Notice>
      )}

      {projects.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No projects yet"
            text="Start by describing an idea. You can also open a sample project to explore how IdeaForge works."
            action={
              <>
                <Link to="/new" className="btn btn-primary">
                  Create your first project
                </Link>
                <button type="button" className="btn btn-secondary" onClick={() => void loadSample()} disabled={creating}>
                  {creating ? 'Creating...' : 'Open a sample project'}
                </button>
              </>
            }
          />
          {health && !aiLive && <p className="muted small center">Demo mode is active: new plans will be sample output until AI is configured.</p>}
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat card">
              <span>Projects</span>
              <strong>{projects.length}</strong>
            </div>
            <div className="stat card">
              <span>Tasks completed</span>
              <strong>
                {totals.done}
                <small>/{totals.total}</small>
              </strong>
            </div>
            <div className="stat card">
              <span>Projects completed</span>
              <strong>{totals.completed}</strong>
            </div>
          </div>

          {current && <ContinueCard project={current} />}

          <section className="card">
            <div className="card-head">
              <h2>Recent projects</h2>
              <Link to="/projects" className="btn btn-ghost btn-sm">
                View all
              </Link>
            </div>
            <ul className="proj-mini">
              {projects.slice(0, 5).map((p) => {
                const s = computeStats(p.tasks);
                return (
                  <li key={p.id}>
                    <Link to={`/projects/${p.id}`}>
                      <div>
                        <strong>{p.input.name}</strong> {p.source === 'sample' && <SampleBadge />}
                        <span className="muted small">
                          {PROJECT_STATE_LABEL[projectState(p)]} · updated {timeAgo(p.updatedAt)}
                        </span>
                      </div>
                      <div className="mini-progress">
                        <ProgressBar percent={s.percent} />
                        <small>{s.percent}%</small>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function ContinueCard({ project }: { project: Project }) {
  const s = computeStats(project.tasks);
  const next = upcomingTasks(project, 3);
  const base = `/projects/${project.id}`;
  return (
    <section className="card continue">
      <div className="continue-main">
        <p className="eyebrow">Continue where you left off</p>
        <h2>
          {project.input.name} {project.source === 'sample' && <SampleBadge />}
        </h2>
        <p className="muted">{project.blueprint.summary || project.input.idea}</p>
        <div className="continue-progress">
          <ProgressBar percent={s.percent} />
          <span>
            {s.percent}% · {s.done} done · {s.total - s.done} remaining · Phase: {currentPhaseLabel(project)}
          </span>
        </div>
        <div className="btn-row">
          <Link to={next[0] ? `${base}?tab=roadmap&task=${next[0].id}` : `${base}?tab=roadmap`} className="btn btn-primary">
            Continue building
          </Link>
          <Link to={`${base}?tab=roadmap`} className="btn btn-secondary">
            View roadmap
          </Link>
          <Link to={`${base}?tab=assistant`} className="btn btn-secondary">
            Ask AI assistant
          </Link>
          <Link to={`${base}?tab=blueprint`} className="btn btn-ghost">
            Review blueprint
          </Link>
          <Link to={base} className="btn btn-ghost">
            Open project
          </Link>
        </div>
      </div>
      <div className="continue-next">
        <h3>Up next</h3>
        {next.length ? (
          <ol>
            {next.map((t) => (
              <li key={t.id}>
                <Link to={`${base}?tab=roadmap&task=${t.id}`}>{t.title}</Link>
                <span className="muted small">{t.effort}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted small">{project.tasks.length ? 'All tasks complete. Run the readiness check.' : 'Generate a roadmap to see tasks.'}</p>
        )}
      </div>
    </section>
  );
}
