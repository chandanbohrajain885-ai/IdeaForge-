import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Project, ProjectInput, WorkspaceProps, WorkspaceTab } from './Types';
import { CATEGORIES, EXPERIENCE_LEVELS, PLATFORMS } from './Types';
import { useApp } from './AppContext';
import { computeStats, currentPhaseLabel, getProject, isBlocked, phaseName, saveProject, upcomingTasks } from './ProjectService';
import { aiBlueprint, aiRoadmap } from './AIService';
import { sampleBlueprint, sampleRoadmap } from './SampleData';
import { ConfirmDialog, EmptyState, Field, Modal, Notice, PriorityBadge, ProgressBar, SampleBadge, Spinner, StatusBadge, timeAgo } from './UI';
import { LIMITS, validateInput, type FieldErrors } from './Validation';
import { ProjectResults } from './ProjectResults';
import { ProjectTasks } from './ProjectTasks';
import { AIChat } from './AIChat';
import { ReadinessChecker } from './ReadinessChecker';
import { ExportPanel } from './ExportPanel';

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'assistant', label: 'AI Assistant' },
  { id: 'readiness', label: 'Readiness' },
  { id: 'export', label: 'Export & Share' },
];

export function ProjectWorkspace() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { toast, setLastProjectId, storage } = useApp();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const projectRef = useRef<Project | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const tabParam = params.get('tab') as WorkspaceTab | null;
  const tab: WorkspaceTab = TABS.some((t) => t.id === tabParam) ? (tabParam as WorkspaceTab) : 'overview';

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const p = await getProject(id);
      projectRef.current = p;
      setProject(p);
      if (p) setLastProjectId(p.id);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load this project.');
    } finally {
      setLoading(false);
    }
  }, [id, setLastProjectId]);

  useEffect(() => {
    void load();
  }, [load, storage]);

  const update = useCallback(
    async (fn: (p: Project) => Project): Promise<boolean> => {
      const current = projectRef.current;
      if (!current) return false;
      const next = fn(current);
      projectRef.current = next;
      setProject(next);
      // serialise saves so an older state can never overwrite a newer one
      const job = queue.current.then(() => saveProject(next));
      queue.current = job.catch(() => undefined);
      try {
        await job;
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not save your change.', 'error');
        return false;
      }
    },
    [toast],
  );

  const goTab = useCallback(
    (t: WorkspaceTab, extra?: Record<string, string>) => {
      const next = new URLSearchParams({ tab: t, ...(extra ?? {}) });
      setParams(next);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setParams],
  );

  if (loading) {
    return (
      <div className="page">
        <Spinner label="Loading project..." />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="page">
        <Notice kind="error" title="Could not load project">
          {loadError}
        </Notice>
        <button type="button" className="btn btn-secondary" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="page">
        <EmptyState
          title="Project not found"
          text={
            storage === 'cloud'
              ? 'It may have been deleted, or it belongs to another account.'
              : 'It may have been deleted, or it was saved in a different browser or account.'
          }
          action={
            <Link to="/projects" className="btn btn-primary">
              Go to My Projects
            </Link>
          }
        />
      </div>
    );
  }

  const props: WorkspaceProps = { project, update, goTab };
  const st = computeStats(project.tasks);

  return (
    <div className="page">
      <div className="project-head">
        <div>
          <p className="eyebrow">
            <Link to="/projects">My Projects</Link> / {project.input.category}
          </p>
          <h1>
            {project.input.name} {project.source === 'sample' && <SampleBadge />}
          </h1>
          <p className="muted">
            {currentPhaseLabel(project)} · {st.percent}% complete · updated {timeAgo(project.updatedAt)}
          </p>
        </div>
        <div className="project-head-progress">
          <ProgressBar percent={st.percent} label="Project completion" />
          <small>
            {st.done}/{st.total} tasks
          </small>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Project sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => goTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'overview' && <Overview {...props} />}
        {tab === 'blueprint' && <ProjectResults {...props} />}
        {tab === 'roadmap' && <ProjectTasks {...props} openTaskId={params.get('task')} />}
        {tab === 'assistant' && <AIChat {...props} />}
        {tab === 'readiness' && <ReadinessChecker {...props} />}
        {tab === 'export' && <ExportPanel {...props} />}
      </div>
    </div>
  );
}

/* ================================ Overview ================================ */
function Overview({ project, update, goTab }: WorkspaceProps) {
  const { aiLive, toast } = useApp();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const st = computeStats(project.tasks);
  const next = upcomingTasks(project, 4);
  const b = project.blueprint;

  const regenerate = async () => {
    setRegenBusy(true);
    try {
      const input = project.input;
      let blueprint = sampleBlueprint(input);
      let roadmap = sampleRoadmap(input);
      let source: 'ai' | 'sample' = 'sample';
      if (aiLive) {
        blueprint = await aiBlueprint(input, project.clarifications);
        roadmap = await aiRoadmap(input, project.clarifications, blueprint);
        source = 'ai';
      }
      const ok = await update((p) => ({ ...p, blueprint, phases: roadmap.phases, tasks: roadmap.tasks, totalEstimate: roadmap.totalEstimate, timelineNote: roadmap.timelineNote, source, review: null, checklistDone: [] }));
      if (ok) toast(source === 'ai' ? 'Plan regenerated with AI.' : 'Sample plan regenerated (demo mode).', 'success');
      setRegenOpen(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Regeneration failed. Your existing plan was kept.', 'error');
    } finally {
      setRegenBusy(false);
    }
  };

  return (
    <div className="overview">
      <div className="ov-grid">
        <section className="card">
          <h2>About this project</h2>
          <p>{b.summary || project.input.idea}</p>
          <dl className="meta">
            <div>
              <dt>Platform</dt>
              <dd>{project.input.platform}</dd>
            </div>
            <div>
              <dt>Experience</dt>
              <dd className="cap">{project.input.experience || '—'}</dd>
            </div>
            <div>
              <dt>Timeline</dt>
              <dd>{project.input.timeline || 'Not set'}</dd>
            </div>
            <div className="meta-wide">
              <dt>Estimate</dt>
              <dd>{project.totalEstimate || '—'}</dd>
            </div>
          </dl>
          <div className="btn-row">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditOpen(true)}>
              Edit details
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => goTab('blueprint')}>
              Review blueprint
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRegenOpen(true)}>
              Regenerate plan
            </button>
          </div>
        </section>

        <section className="card stats-card">
          <h2>Progress</h2>
          <div className="big-percent">{st.percent}%</div>
          <ProgressBar percent={st.percent} />
          <div className="stat-row">
            <div>
              <strong>{st.done}</strong>
              <span>Completed</span>
            </div>
            <div>
              <strong>{st.inProgress}</strong>
              <span>In progress</span>
            </div>
            <div>
              <strong>{st.todo}</strong>
              <span>Remaining</span>
            </div>
          </div>
          <p className="muted small">Current phase: {currentPhaseLabel(project)}</p>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Next steps</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => goTab('roadmap')}>
            View full roadmap
          </button>
        </div>
        {!project.tasks.length ? (
          <EmptyState
            title="No roadmap yet"
            text="Generate the development roadmap to see your tasks."
            action={
              <button type="button" className="btn btn-primary" onClick={() => goTab('roadmap')}>
                Open roadmap
              </button>
            }
          />
        ) : !next.length ? (
          <Notice kind="success" title="All tasks complete">
            Great work. Run the readiness check before you deploy.{' '}
            <button type="button" className="link-btn" onClick={() => goTab('readiness')}>
              Open readiness check
            </button>
          </Notice>
        ) : (
          <ul className="next-list">
            {next.map((t) => (
              <li key={t.id}>
                <div>
                  <strong>
                    {t.id}. {t.title}
                  </strong>
                  <span className="muted small">
                    {phaseName(project, t.phase)} · {t.effort}
                    {isBlocked(t, project.tasks) && ' · waiting on earlier tasks'}
                  </span>
                </div>
                <div className="next-actions">
                  <StatusBadge status={t.status} />
                  <PriorityBadge priority={t.priority} />
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => goTab('roadmap', { task: t.id })}>
                    Continue building
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="quick-actions">
        <button type="button" className="qa" onClick={() => goTab('assistant')}>
          <strong>Ask the AI assistant</strong>
          <span>Questions about features, code, errors or deployment.</span>
        </button>
        <button type="button" className="qa" onClick={() => goTab('readiness')}>
          <strong>Check readiness</strong>
          <span>Find gaps before you build or deploy.</span>
        </button>
        <button type="button" className="qa" onClick={() => goTab('export')}>
          <strong>Export plan</strong>
          <span>Download PDF or Markdown, or copy a share summary.</span>
        </button>
        <button type="button" className="qa" onClick={() => navigate('/new')}>
          <strong>Start another idea</strong>
          <span>Create a new project.</span>
        </button>
      </div>

      <EditDetailsModal open={editOpen} project={project} update={update} onClose={() => setEditOpen(false)} />
      <ConfirmDialog
        open={regenOpen}
        title="Regenerate the whole plan?"
        message={
          <>
            <p>This replaces the current blueprint and roadmap using your latest project details. Task progress, guides and the readiness review will be reset.</p>
            {!aiLive && <p>AI is not configured, so a new sample plan will be created.</p>}
            <p>Tip: export a backup first from the Export tab.</p>
          </>
        }
        confirmLabel={regenBusy ? 'Generating...' : 'Regenerate'}
        danger
        busy={regenBusy}
        onConfirm={() => void regenerate()}
        onCancel={() => setRegenOpen(false)}
      />
    </div>
  );
}

function EditDetailsModal({ open, project, update, onClose }: { open: boolean; project: Project; update: WorkspaceProps['update']; onClose: () => void }) {
  const { toast } = useApp();
  const [form, setForm] = useState<ProjectInput>(project.input);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(project.input);
      setErrors({});
    }
  }, [open, project.input]);

  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const errs = validateInput(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const ok = await update((p) => ({ ...p, input: { ...form, name: form.name.trim() } }));
    setBusy(false);
    if (ok) {
      toast('Project details saved. Use "Regenerate plan" if you want a new blueprint.', 'success');
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      title="Edit project details"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving...' : 'Save changes'}
          </button>
        </>
      }
    >
      <p className="muted small">Changing details does not rewrite your blueprint automatically.</p>
      <Field label="Project name" htmlFor="e-name" required error={errors.name}>
        <input id="e-name" value={form.name} maxLength={LIMITS.name} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="Idea" htmlFor="e-idea" required error={errors.idea}>
        <textarea id="e-idea" rows={4} value={form.idea} maxLength={LIMITS.idea} onChange={(e) => set('idea', e.target.value)} />
      </Field>
      <Field label="Problem" htmlFor="e-problem" error={errors.problem}>
        <textarea id="e-problem" rows={2} value={form.problem} maxLength={LIMITS.problem} onChange={(e) => set('problem', e.target.value)} />
      </Field>
      <Field label="Intended users" htmlFor="e-users" error={errors.users}>
        <input id="e-users" value={form.users} maxLength={LIMITS.users} onChange={(e) => set('users', e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="Category" htmlFor="e-category" required error={errors.category}>
          <select id="e-category" value={form.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">Select</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Platform" htmlFor="e-platform" required error={errors.platform}>
          <select id="e-platform" value={form.platform} onChange={(e) => set('platform', e.target.value)}>
            <option value="">Select</option>
            {PLATFORMS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Experience" htmlFor="e-exp" required error={errors.experience}>
          <select id="e-exp" value={form.experience} onChange={(e) => set('experience', e.target.value as ProjectInput['experience'])}>
            <option value="">Select</option>
            {EXPERIENCE_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Technologies" htmlFor="e-tech" error={errors.technologies}>
          <input id="e-tech" value={form.technologies} maxLength={LIMITS.technologies} onChange={(e) => set('technologies', e.target.value)} />
        </Field>
        <Field label="Budget" htmlFor="e-budget" error={errors.budget}>
          <input id="e-budget" value={form.budget} maxLength={LIMITS.budget} onChange={(e) => set('budget', e.target.value)} />
        </Field>
        <Field label="Completion time" htmlFor="e-timeline" error={errors.timeline}>
          <input id="e-timeline" value={form.timeline} maxLength={LIMITS.timeline} onChange={(e) => set('timeline', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
