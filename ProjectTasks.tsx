import { useEffect, useMemo, useState } from 'react';
import type { Priority, Project, Task, TaskStatus, WorkspaceProps } from './Types';
import { STATUS_LABELS } from './Types';
import { useApp } from './AppContext';
import { aiBuildHelp, aiGenerateTask, aiRoadmap } from './AIService';
import { computeStats, isBlocked, nextTaskId, nowIso, phaseName } from './ProjectService';
import { sampleBuildGuide, sampleRoadmap } from './SampleData';
import { Markdown } from './Markdown';
import { ConfirmDialog, EmptyState, Modal, Notice, PriorityBadge, ProgressBar, SampleBadge, Spinner, StatusBadge } from './UI';

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

function StatusSelect({ value, onChange, id }: { value: TaskStatus; onChange: (s: TaskStatus) => void; id: string }) {
  return (
    <select id={id} className={`status-select st-${value}`} value={value} onChange={(e) => onChange(e.target.value as TaskStatus)} aria-label="Task status">
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

interface TaskDraft {
  title: string;
  description: string;
  expectedResult: string;
  priority: Priority;
  effort: string;
  phase: string;
  dependencies: string;
}

const emptyDraft = (phase: string): TaskDraft => ({ title: '', description: '', expectedResult: '', priority: 'medium', effort: '', phase, dependencies: '' });

function parseDeps(text: string, tasks: Task[], selfId?: string): { deps: string[]; invalid: string[] } {
  const ids = text
    .split(/[\s,]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  const valid = new Set(tasks.map((t) => t.id.toUpperCase()));
  const deps = Array.from(new Set(ids.filter((x) => valid.has(x) && x !== selfId?.toUpperCase())));
  const invalid = ids.filter((x) => !valid.has(x));
  // map back to original-case ids
  return { deps: deps.map((d) => tasks.find((t) => t.id.toUpperCase() === d)?.id ?? d), invalid };
}

function TaskForm({ draft, setDraft, project, selfId }: { draft: TaskDraft; setDraft: (d: TaskDraft) => void; project: Project; selfId?: string }) {
  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setDraft({ ...draft, [k]: v });
  const { invalid } = parseDeps(draft.dependencies, project.tasks, selfId);
  return (
    <div className="form">
      <div className="field">
        <label htmlFor="tf-title">
          Title <span className="req">*</span>
        </label>
        <input id="tf-title" value={draft.title} maxLength={140} onChange={(e) => set('title', e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="tf-desc">What to do</label>
        <textarea id="tf-desc" rows={3} value={draft.description} maxLength={1200} onChange={(e) => set('description', e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="tf-exp">Expected result (how you know it is done)</label>
        <textarea id="tf-exp" rows={2} value={draft.expectedResult} maxLength={600} onChange={(e) => set('expectedResult', e.target.value)} />
      </div>
      <div className="grid-3">
        <div className="field">
          <label htmlFor="tf-phase">Phase</label>
          <select id="tf-phase" value={draft.phase} onChange={(e) => set('phase', e.target.value)}>
            {project.phases.length === 0 && <option value="P1">General</option>}
            {project.phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tf-prio">Priority</label>
          <select id="tf-prio" value={draft.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="tf-effort">Estimated effort</label>
          <input id="tf-effort" value={draft.effort} maxLength={60} placeholder="e.g. 2-3 hours" onChange={(e) => set('effort', e.target.value)} />
        </div>
      </div>
      <div className={`field ${invalid.length ? 'has-error' : ''}`}>
        <label htmlFor="tf-deps">Depends on (task IDs)</label>
        <input id="tf-deps" value={draft.dependencies} placeholder="e.g. T1, T3" onChange={(e) => set('dependencies', e.target.value)} />
        {invalid.length > 0 && <p className="field-error">Unknown task ID: {invalid.join(', ')}</p>}
      </div>
    </div>
  );
}

/* ============================== main component ============================== */
export function ProjectTasks({ project, update, openTaskId }: WorkspaceProps & { openTaskId: string | null }) {
  const { aiLive, toast } = useApp();
  const [view, setView] = useState<'list' | 'board'>('list');
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>(openTaskId);
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<TaskDraft>(emptyDraft(project.phases[0]?.id ?? 'P1'));
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState('');

  useEffect(() => {
    if (openTaskId) setSelected(openTaskId);
  }, [openTaskId]);

  const st = computeStats(project.tasks);
  const task = selected ? project.tasks.find((t) => t.id === selected) ?? null : null;
  const visible = useMemo(() => project.tasks.filter((t) => phaseFilter === 'all' || t.phase === phaseFilter), [project.tasks, phaseFilter]);

  const setStatus = (id: string, status: TaskStatus) => {
    void update((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === id ? { ...t, status } : t)) }));
  };

  const generateRoadmap = async () => {
    setGenBusy(true);
    setGenError('');
    try {
      const rm = aiLive ? await aiRoadmap(project.input, project.clarifications, project.blueprint) : sampleRoadmap(project.input);
      const ok = await update((p) => ({ ...p, phases: rm.phases, tasks: rm.tasks, totalEstimate: rm.totalEstimate, timelineNote: rm.timelineNote }));
      if (ok) toast(aiLive ? 'Roadmap generated.' : 'Sample roadmap created (demo mode).', 'success');
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Roadmap generation failed.');
    } finally {
      setGenBusy(false);
    }
  };

  const openAdd = (prefill?: Partial<TaskDraft>) => {
    setAddDraft({ ...emptyDraft(project.phases[0]?.id ?? 'P1'), ...prefill });
    setAddOpen(true);
  };

  const addTask = async () => {
    if (!addDraft.title.trim()) {
      toast('Give the task a title.', 'error');
      return;
    }
    const { deps, invalid } = parseDeps(addDraft.dependencies, project.tasks);
    if (invalid.length) {
      toast(`Unknown task ID: ${invalid.join(', ')}`, 'error');
      return;
    }
    const ok = await update((p) => {
      const phases = p.phases.length ? p.phases : [{ id: 'P1', name: 'General', goal: '' }];
      const t: Task = {
        id: nextTaskId(p.tasks),
        phase: phases.some((ph) => ph.id === addDraft.phase) ? addDraft.phase : phases[0].id,
        title: addDraft.title.trim(),
        description: addDraft.description.trim(),
        expectedResult: addDraft.expectedResult.trim(),
        priority: addDraft.priority,
        effort: addDraft.effort.trim() || 'Not estimated',
        dependencies: deps,
        status: 'todo',
        custom: true,
      };
      // insert after the last task of the same phase so order stays logical
      const lastIdx = p.tasks.map((x) => x.phase).lastIndexOf(t.phase);
      const tasks = p.tasks.slice();
      tasks.splice(lastIdx === -1 ? tasks.length : lastIdx + 1, 0, t);
      return { ...p, phases, tasks };
    });
    if (ok) {
      toast('Task added.', 'success');
      setAddOpen(false);
    }
  };

  const generateTask = async () => {
    if (aiPrompt.trim().length < 5) {
      toast('Describe the task in a few words.', 'error');
      return;
    }
    setAiBusy(true);
    try {
      const g = await aiGenerateTask(project, aiPrompt.trim());
      setAiPromptOpen(false);
      setAiPrompt('');
      openAdd({ title: g.title, description: g.description, expectedResult: g.expectedResult, priority: g.priority, effort: g.effort, phase: g.phase || project.phases[0]?.id || 'P1' });
      toast('AI drafted a task. Review it, then click "Add task".', 'info');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not generate a task.', 'error');
    } finally {
      setAiBusy(false);
    }
  };

  if (!project.tasks.length) {
    return (
      <div className="card">
        <EmptyState
          title="No roadmap yet"
          text={aiLive ? 'Generate a step-by-step roadmap from your blueprint, or add tasks yourself.' : 'Demo mode: create a sample roadmap from a template, or add tasks yourself.'}
          action={
            <>
              <button type="button" className="btn btn-primary" onClick={() => void generateRoadmap()} disabled={genBusy}>
                {genBusy ? <Spinner label="Generating..." /> : aiLive ? 'Generate roadmap' : 'Create sample roadmap'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => openAdd()}>
                Add task manually
              </button>
            </>
          }
        />
        {genError && <Notice kind="error">{genError}</Notice>}
        <AddTaskModal open={addOpen} draft={addDraft} setDraft={setAddDraft} project={project} onClose={() => setAddOpen(false)} onSave={() => void addTask()} />
      </div>
    );
  }

  const groups = project.phases.length ? project.phases : [{ id: 'P1', name: 'Tasks', goal: '' }];
  const orphan = visible.filter((t) => !groups.some((g) => g.id === t.phase));

  return (
    <div className="roadmap">
      <div className="card roadmap-head">
        <div className="rh-progress">
          <div className="rh-top">
            <strong>{st.percent}% complete</strong>
            <span className="muted small">
              {st.done} done · {st.inProgress} in progress · {st.todo} not started
            </span>
          </div>
          <ProgressBar percent={st.percent} />
          {(project.totalEstimate || project.timelineNote) && (
            <p className="muted small rh-est">
              {project.totalEstimate && <>Estimated effort: {project.totalEstimate}. </>}
              {project.timelineNote}
            </p>
          )}
        </div>
        <div className="rh-controls">
          <div className="seg small" role="group" aria-label="Roadmap view">
            <button type="button" className={view === 'list' ? 'active' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}>
              Checklist
            </button>
            <button type="button" className={view === 'board' ? 'active' : ''} aria-pressed={view === 'board'} onClick={() => setView('board')}>
              Board
            </button>
          </div>
          <label className="sr-only" htmlFor="phase-filter">
            Filter by phase
          </label>
          <select id="phase-filter" value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)}>
            <option value="all">All phases</option>
            {project.phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openAdd()}>
            + Add task
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAiPromptOpen(true)} disabled={!aiLive} title={aiLive ? '' : 'Requires AI configuration'}>
            Generate task with AI
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <div className="phase-list">
          {groups
            .filter((g) => phaseFilter === 'all' || g.id === phaseFilter)
            .map((g, gi) => {
              const ts = visible.filter((t) => t.phase === g.id);
              if (!ts.length) return null;
              const done = ts.filter((t) => t.status === 'done').length;
              return (
                <section key={g.id} className="card phase">
                  <div className="phase-head">
                    <div>
                      <span className="phase-num">Phase {gi + 1}</span>
                      <h3>{g.name}</h3>
                      {g.goal && <p className="muted small">{g.goal}</p>}
                    </div>
                    <span className="phase-count">
                      {done}/{ts.length}
                    </span>
                  </div>
                  <ul className="task-list">
                    {ts.map((t) => (
                      <TaskRow key={t.id} task={t} project={project} onOpen={() => setSelected(t.id)} onStatus={(s) => setStatus(t.id, s)} />
                    ))}
                  </ul>
                </section>
              );
            })}
          {orphan.length > 0 && (
            <section className="card phase">
              <div className="phase-head">
                <h3>Other tasks</h3>
              </div>
              <ul className="task-list">
                {orphan.map((t) => (
                  <TaskRow key={t.id} task={t} project={project} onOpen={() => setSelected(t.id)} onStatus={(s) => setStatus(t.id, s)} />
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div className="board">
          {STATUSES.map((s) => {
            const col = visible.filter((t) => t.status === s);
            return (
              <section key={s} className={`board-col col-${s}`} aria-label={STATUS_LABELS[s]}>
                <h3>
                  {STATUS_LABELS[s]} <span>{col.length}</span>
                </h3>
                {col.length === 0 && <p className="muted small center">No tasks</p>}
                {col.map((t) => (
                  <article key={t.id} className="board-card">
                    <button type="button" className="board-card-title" onClick={() => setSelected(t.id)}>
                      <span className="task-id">{t.id}</span> {t.title}
                    </button>
                    <div className="board-card-meta">
                      <PriorityBadge priority={t.priority} />
                      <span className="muted small">{phaseName(project, t.phase)}</span>
                    </div>
                    {isBlocked(t, project.tasks) && t.status !== 'done' && <p className="blocked small">Waiting on {t.dependencies.join(', ')}</p>}
                    <StatusSelect id={`bs-${t.id}`} value={t.status} onChange={(v) => setStatus(t.id, v)} />
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}

      {task && <TaskModal task={task} project={project} update={update} onClose={() => setSelected(null)} />}
      <AddTaskModal open={addOpen} draft={addDraft} setDraft={setAddDraft} project={project} onClose={() => setAddOpen(false)} onSave={() => void addTask()} />
      <Modal
        open={aiPromptOpen}
        title="Generate a task with AI"
        onClose={() => !aiBusy && setAiPromptOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setAiPromptOpen(false)} disabled={aiBusy}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void generateTask()} disabled={aiBusy}>
              {aiBusy ? 'Generating...' : 'Draft task'}
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="ai-task">What do you need to do?</label>
          <textarea id="ai-task" rows={3} maxLength={1500} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="e.g. Add a dark mode toggle to the settings page" />
          <p className="hint">The AI drafts a task for you to review before it is added.</p>
        </div>
      </Modal>
    </div>
  );
}

function TaskRow({ task, project, onOpen, onStatus }: { task: Task; project: Project; onOpen: () => void; onStatus: (s: TaskStatus) => void }) {
  const blocked = isBlocked(task, project.tasks) && task.status !== 'done';
  return (
    <li className={`task-row ${task.status}`}>
      <input
        type="checkbox"
        className="task-check"
        checked={task.status === 'done'}
        onChange={(e) => onStatus(e.target.checked ? 'done' : 'todo')}
        aria-label={`Mark ${task.title} as ${task.status === 'done' ? 'not done' : 'done'}`}
      />
      <button type="button" className="task-main" onClick={onOpen}>
        <span className="task-title">
          <span className="task-id">{task.id}</span> {task.title}
        </span>
        <span className="task-meta">
          {task.effort}
          {task.dependencies.length > 0 && ` · after ${task.dependencies.join(', ')}`}
          {blocked && <span className="blocked"> · waiting on earlier tasks</span>}
          {task.custom && ' · custom'}
          {task.guide && ' · guide saved'}
        </span>
      </button>
      <div className="task-side">
        <PriorityBadge priority={task.priority} />
        <StatusSelect id={`ls-${task.id}`} value={task.status} onChange={onStatus} />
      </div>
    </li>
  );
}

function AddTaskModal({ open, draft, setDraft, project, onClose, onSave }: { open: boolean; draft: TaskDraft; setDraft: (d: TaskDraft) => void; project: Project; onClose: () => void; onSave: () => void }) {
  return (
    <Modal
      open={open}
      title="Add a task"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onSave}>
            Add task
          </button>
        </>
      }
    >
      <TaskForm draft={draft} setDraft={setDraft} project={project} />
    </Modal>
  );
}

/* ================================ task modal ================================ */
function TaskModal({ task, project, update, onClose }: { task: Task; project: Project; update: WorkspaceProps['update']; onClose: () => void }) {
  const { aiLive, toast } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft(task.phase));
  const [helpBusy, setHelpBusy] = useState(false);
  const [helpError, setHelpError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const startEdit = () => {
    setDraft({
      title: task.title,
      description: task.description,
      expectedResult: task.expectedResult,
      priority: task.priority,
      effort: task.effort,
      phase: task.phase,
      dependencies: task.dependencies.join(', '),
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!draft.title.trim()) {
      toast('Title is required.', 'error');
      return;
    }
    const { deps, invalid } = parseDeps(draft.dependencies, project.tasks, task.id);
    if (invalid.length) {
      toast(`Unknown task ID: ${invalid.join(', ')}`, 'error');
      return;
    }
    const ok = await update((p) => ({
      ...p,
      tasks: p.tasks.map((t) =>
        t.id === task.id
          ? {
              ...t,
              title: draft.title.trim(),
              description: draft.description.trim(),
              expectedResult: draft.expectedResult.trim(),
              priority: draft.priority,
              effort: draft.effort.trim() || 'Not estimated',
              phase: draft.phase,
              dependencies: deps,
            }
          : t,
      ),
    }));
    if (ok) {
      toast('Task updated.', 'success');
      setEditing(false);
    }
  };

  const helpMe = async () => {
    setHelpBusy(true);
    setHelpError('');
    try {
      const guide = aiLive ? await aiBuildHelp(project, task) : sampleBuildGuide(project, task);
      const source = aiLive ? 'ai' : 'sample';
      await update((p) => ({
        ...p,
        tasks: p.tasks.map((t) => (t.id === task.id ? { ...t, guide, guideSource: source, guideAt: nowIso(), status: t.status === 'todo' ? 'in_progress' : t.status } : t)),
      }));
    } catch (e) {
      setHelpError(e instanceof Error ? e.message : 'Could not get help for this task.');
    } finally {
      setHelpBusy(false);
    }
  };

  const remove = async () => {
    const ok = await update((p) => ({
      ...p,
      tasks: p.tasks.filter((t) => t.id !== task.id).map((t) => ({ ...t, dependencies: t.dependencies.filter((d) => d !== task.id) })),
    }));
    if (ok) {
      toast('Task deleted.', 'success');
      setConfirmDelete(false);
      onClose();
    }
  };

  const blocked = isBlocked(task, project.tasks) && task.status !== 'done';

  return (
    <>
      <Modal
        open={!confirmDelete}
        title={`${task.id}: ${task.title}`}
        onClose={onClose}
        wide
        footer={
          editing ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void saveEdit()}>
                Save task
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost danger-text" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
              <div className="spacer" />
              <button type="button" className="btn btn-secondary" onClick={startEdit}>
                Edit
              </button>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </>
          )
        }
      >
        {editing ? (
          <TaskForm draft={draft} setDraft={setDraft} project={project} selfId={task.id} />
        ) : (
          <div className="task-detail">
            <div className="td-meta">
              <StatusSelect id={`md-${task.id}`} value={task.status} onChange={(s) => void update((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === task.id ? { ...t, status: s } : t)) }))} />
              <PriorityBadge priority={task.priority} />
              <span className="badge">{phaseName(project, task.phase)}</span>
              <span className="badge">{task.effort}</span>
              {task.custom && <span className="badge">custom</span>}
            </div>
            {blocked && (
              <Notice kind="warn">
                This task depends on {task.dependencies.join(', ')}, which {task.dependencies.length > 1 ? 'are' : 'is'} not finished yet.
              </Notice>
            )}
            <h3>What to do</h3>
            <p>{task.description || 'No description yet.'}</p>
            <h3>Expected result</h3>
            <p>{task.expectedResult || 'Not specified.'}</p>
            {task.dependencies.length > 0 && (
              <>
                <h3>Depends on</h3>
                <ul className="clean-list">
                  {task.dependencies.map((d) => {
                    const dep = project.tasks.find((t) => t.id === d);
                    return (
                      <li key={d}>
                        {d}: {dep?.title ?? 'deleted task'} {dep && <StatusBadge status={dep.status} />}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <div className="help-box">
              <div className="help-head">
                <div>
                  <h3>Help Me Build This</h3>
                  <p className="muted small">Step-by-step instructions, files, code, commands and how to test - for your stack.</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => void helpMe()} disabled={helpBusy}>
                  {helpBusy ? <Spinner label="Writing guide..." /> : task.guide ? 'Regenerate guide' : 'Help Me Build This'}
                </button>
              </div>
              {helpError && <Notice kind="error">{helpError}</Notice>}
              {task.guide && (
                <div className="guide">
                  <div className="guide-label">
                    {task.guideSource === 'sample' ? <SampleBadge /> : <span className="badge badge-ai">AI guidance · not executed or verified</span>}
                  </div>
                  <Markdown text={task.guide} />
                  <p className="muted small">Always run and test code yourself. The assistant has not run or tested anything.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this task?"
        message={`"${task.title}" will be removed and other tasks will no longer depend on it. This cannot be undone.`}
        confirmLabel="Delete task"
        danger
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
