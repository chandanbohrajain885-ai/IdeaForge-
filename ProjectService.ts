import type {
  AiReview,
  Blueprint,
  ChatMessage,
  Clarification,
  Phase,
  Priority,
  Project,
  ProjectInput,
  ProjectSource,
  RoadmapResult,
  Task,
  TaskStatus,
} from './Types';
import { EMPTY_INPUT, emptyBlueprint } from './Types';
import { supabase } from './SupabaseClient';

/* ============================== ids & time ============================== */
export function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // RFC4122-like fallback for non-secure contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const nowIso = (): string => new Date().toISOString();

/* ============================ normalisation ============================= */
const s = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback);
const arr = <T,>(v: unknown, map: (x: unknown) => T | null): T[] =>
  Array.isArray(v) ? v.map(map).filter((x): x is T => x !== null) : [];
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const strList = (v: unknown): string[] => arr(v, (x) => (typeof x === 'string' && x.trim() ? x : null));

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];
const PRIOS: Priority[] = ['high', 'medium', 'low'];

export function normalizeBlueprint(raw: unknown): Blueprint {
  const b = obj(raw);
  const f = obj(b.features);
  const feat = (v: unknown) =>
    arr(v, (x) => {
      const o = obj(x);
      return s(o.name) ? { name: s(o.name), description: s(o.description) } : null;
    });
  const base = emptyBlueprint();
  return {
    ...base,
    title: s(b.title),
    summary: s(b.summary),
    problemStatement: s(b.problemStatement),
    solution: s(b.solution),
    targetAudience: s(b.targetAudience),
    objectives: strList(b.objectives),
    outcomes: strList(b.outcomes),
    usefulness: s(b.usefulness),
    features: { essential: feat(f.essential), recommended: feat(f.recommended), advanced: feat(f.advanced) },
    userJourney: strList(b.userJourney),
    screens: arr(b.screens, (x) => {
      const o = obj(x);
      return s(o.name) ? { name: s(o.name), purpose: s(o.purpose) } : null;
    }),
    techStack: arr(b.techStack, (x) => {
      const o = obj(x);
      return s(o.choice) ? { layer: s(o.layer), choice: s(o.choice), reason: s(o.reason), alternatives: s(o.alternatives) } : null;
    }),
    architecture: s(b.architecture),
    architectureFlow: strList(b.architectureFlow),
    integrations: arr(b.integrations, (x) => {
      const o = obj(x);
      return s(o.name) ? { name: s(o.name), purpose: s(o.purpose), required: o.required === true } : null;
    }),
    database: arr(b.database, (x) => {
      const o = obj(x);
      return s(o.table) ? { table: s(o.table), purpose: s(o.purpose), fields: strList(o.fields) } : null;
    }),
    apis: arr(b.apis, (x) => {
      const o = obj(x);
      return s(o.path) ? { method: s(o.method, 'GET'), path: s(o.path), purpose: s(o.purpose) } : null;
    }),
    assumptions: strList(b.assumptions),
  };
}

export function normalizeTask(raw: unknown, index: number): Task | null {
  const o = obj(raw);
  const title = s(o.title).trim();
  if (!title) return null;
  const status = STATUSES.includes(o.status as TaskStatus) ? (o.status as TaskStatus) : 'todo';
  const priority = PRIOS.includes(o.priority as Priority) ? (o.priority as Priority) : 'medium';
  const task: Task = {
    id: s(o.id) || `T${index + 1}`,
    phase: s(o.phase),
    title,
    description: s(o.description),
    expectedResult: s(o.expectedResult),
    priority,
    effort: s(o.effort) || 'Not estimated',
    dependencies: strList(o.dependencies),
    status,
  };
  if (o.custom === true) task.custom = true;
  if (s(o.guide)) {
    task.guide = s(o.guide);
    task.guideSource = o.guideSource === 'sample' ? 'sample' : 'ai';
    task.guideAt = s(o.guideAt);
  }
  return task;
}

export function normalizeRoadmap(raw: unknown): RoadmapResult {
  const o = obj(raw);
  const phases: Phase[] = arr(o.phases, (x) => {
    const p = obj(x);
    return s(p.id) && s(p.name) ? { id: s(p.id), name: s(p.name), goal: s(p.goal) } : null;
  });
  const tasks = arr(o.tasks, (x) => x).map((t, i) => normalizeTask(t, i)).filter((t): t is Task => t !== null);
  return { phases, tasks, totalEstimate: s(o.totalEstimate), timelineNote: s(o.timelineNote) };
}

export function normalizeProject(raw: unknown): Project | null {
  const o = obj(raw);
  const id = s(o.id);
  if (!id) return null;
  const inputRaw = obj(o.input);
  const input: ProjectInput = { ...EMPTY_INPUT };
  (Object.keys(EMPTY_INPUT) as (keyof ProjectInput)[]).forEach((k) => {
    (input as unknown as Record<string, string>)[k] = s(inputRaw[k]);
  });
  if (!['beginner', 'intermediate', 'advanced', ''].includes(input.experience)) input.experience = '';
  if (!input.name) return null;
  const roadmap = normalizeRoadmap({ phases: o.phases, tasks: o.tasks });
  const reviewRaw = obj(o.review);
  const review: AiReview | null =
    reviewRaw && typeof reviewRaw.score === 'number'
      ? {
          score: reviewRaw.score,
          summary: s(reviewRaw.summary),
          issues: arr(reviewRaw.issues, (x) => {
            const i = obj(x);
            return s(i.problem)
              ? {
                  area: s(i.area, 'General'),
                  severity: PRIOS.includes(i.severity as Priority) ? (i.severity as Priority) : 'medium',
                  problem: s(i.problem),
                  why: s(i.why),
                  recommendation: s(i.recommendation),
                }
              : null;
          }),
          checklist: strList(reviewRaw.checklist),
          createdAt: s(reviewRaw.createdAt),
          source: reviewRaw.source === 'sample' ? 'sample' : 'ai',
        }
      : null;
  return {
    id,
    createdAt: s(o.createdAt) || nowIso(),
    updatedAt: s(o.updatedAt) || nowIso(),
    source: o.source === 'sample' ? 'sample' : 'ai',
    input,
    clarifications: arr(o.clarifications, (x) => {
      const c = obj(x);
      return s(c.question) ? { question: s(c.question), answer: s(c.answer) } : null;
    }),
    blueprint: normalizeBlueprint(o.blueprint),
    phases: roadmap.phases,
    tasks: roadmap.tasks,
    totalEstimate: s(o.totalEstimate),
    timelineNote: s(o.timelineNote),
    chat: arr(o.chat, (x) => {
      const m = obj(x);
      return s(m.content)
        ? {
            id: s(m.id) || makeId(),
            role: m.role === 'user' ? 'user' : 'assistant',
            content: s(m.content),
            createdAt: s(m.createdAt) || nowIso(),
            source: m.source === 'sample' ? 'sample' : m.source === 'ai' ? 'ai' : undefined,
            error: m.error === true ? true : undefined,
          }
        : null;
    }) as ChatMessage[],
    review,
    checklistDone: strList(o.checklistDone),
  };
}

/* ============================== creation ================================ */
export function createProject(
  input: ProjectInput,
  clarifications: Clarification[],
  blueprint: Blueprint,
  roadmap: RoadmapResult | null,
  source: ProjectSource,
): Project {
  const t = nowIso();
  return {
    id: makeId(),
    createdAt: t,
    updatedAt: t,
    source,
    input: { ...input },
    clarifications,
    blueprint,
    phases: roadmap?.phases ?? [],
    tasks: roadmap?.tasks ?? [],
    totalEstimate: roadmap?.totalEstimate ?? '',
    timelineNote: roadmap?.timelineNote ?? '',
    chat: [],
    review: null,
    checklistDone: [],
  };
}

/** Copies a project as a fresh starting point: new id, statuses reset, chat cleared. */
export function duplicateProject(p: Project): Project {
  const t = nowIso();
  const copy = normalizeProject(JSON.parse(JSON.stringify(p))) as Project;
  return {
    ...copy,
    id: makeId(),
    createdAt: t,
    updatedAt: t,
    input: { ...copy.input, name: `${copy.input.name} (copy)`.slice(0, 80) },
    tasks: copy.tasks.map((task) => ({ ...task, status: 'todo' as TaskStatus })),
    chat: [],
    review: null,
    checklistDone: [],
  };
}

/* =============================== progress =============================== */
export interface ProjectStats {
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  percent: number;
}

export function computeStats(tasks: Task[]): ProjectStats {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  return { total, done, inProgress, todo: total - done - inProgress, percent: total ? Math.round((done / total) * 100) : 0 };
}

export type ProjectState = 'not_started' | 'in_progress' | 'completed' | 'no_roadmap';

export function projectState(p: Project): ProjectState {
  const st = computeStats(p.tasks);
  if (!st.total) return 'no_roadmap';
  if (st.done === st.total) return 'completed';
  if (st.done === 0 && st.inProgress === 0) return 'not_started';
  return 'in_progress';
}

export const PROJECT_STATE_LABEL: Record<ProjectState, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  no_roadmap: 'Roadmap needed',
};

export function isBlocked(task: Task, tasks: Task[]): boolean {
  return task.dependencies.some((d) => {
    const dep = tasks.find((t) => t.id === d);
    return dep ? dep.status !== 'done' : false;
  });
}

export function phaseName(p: Project, phaseId: string): string {
  return p.phases.find((ph) => ph.id === phaseId)?.name ?? 'General';
}

/** The phase of the first unfinished task in roadmap order. */
export function currentPhaseLabel(p: Project): string {
  if (!p.tasks.length) return 'Planning';
  const next = p.tasks.find((t) => t.status !== 'done');
  if (!next) return 'All tasks complete';
  return phaseName(p, next.phase);
}

/** Next tasks to work on: in-progress first, then unblocked to-dos in order. */
export function upcomingTasks(p: Project, n = 3): Task[] {
  const open = p.tasks.filter((t) => t.status !== 'done');
  const inProg = open.filter((t) => t.status === 'in_progress');
  const ready = open.filter((t) => t.status === 'todo' && !isBlocked(t, p.tasks));
  const rest = open.filter((t) => t.status === 'todo' && isBlocked(t, p.tasks));
  return [...inProg, ...ready, ...rest].slice(0, n);
}

export function nextTaskId(tasks: Task[]): string {
  const max = tasks.reduce((m, t) => {
    const n = Number(t.id.replace(/^\D+/, ''));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `T${max + 1}`;
}

/** Compact project description sent to the AI assistant so users never re-explain their project. */
export function buildAiContext(p: Project): string {
  const b = p.blueprint;
  const st = computeStats(p.tasks);
  const lines: string[] = [
    `Project: ${p.input.name}`,
    `Category: ${p.input.category} | Platform: ${p.input.platform} | Builder experience: ${p.input.experience || 'unknown'}`,
    `Preferred technologies: ${p.input.technologies || 'none stated'} | Budget: ${p.input.budget || 'not stated'} | Timeline: ${p.input.timeline || 'not stated'}`,
    `Idea: ${p.input.idea}`,
    `Summary: ${b.summary}`,
    `Problem: ${b.problemStatement || p.input.problem}`,
    `Target audience: ${b.targetAudience || p.input.users}`,
    `Essential features: ${b.features.essential.map((f) => `${f.name} (${f.description})`).join('; ')}`,
    `Recommended features: ${b.features.recommended.map((f) => f.name).join('; ')}`,
    `Screens: ${b.screens.map((x) => x.name).join(', ')}`,
    `Tech stack: ${b.techStack.map((t) => `${t.layer}: ${t.choice}`).join('; ')}`,
    `Architecture: ${b.architecture}`,
    `Database tables: ${b.database.map((d) => `${d.table}(${d.fields.join(', ')})`).join('; ') || 'none'}`,
    `APIs: ${b.apis.map((a) => `${a.method} ${a.path}`).join('; ') || 'none'}`,
    `Integrations: ${b.integrations.map((i) => i.name).join(', ') || 'none'}`,
    `Progress: ${st.done}/${st.total} tasks done (${st.percent}%). Current phase: ${currentPhaseLabel(p)}`,
    'Roadmap:',
    ...p.phases.map((ph) => {
      const ts = p.tasks.filter((t) => t.phase === ph.id).map((t) => `${t.id} ${t.title} [${t.status}]`);
      return `- ${ph.name}: ${ts.join('; ')}`;
    }),
  ];
  return lines.join('\n').slice(0, 13_500);
}

/** Public, shareable summary. Contains no chat history, clarification answers, keys or settings. */
export function shareSummary(p: Project): string {
  const b = p.blueprint;
  const st = computeStats(p.tasks);
  return [
    `${b.title || p.input.name} - built with IdeaForge AI (Inera SOI)`,
    '',
    b.summary,
    '',
    'Essential features:',
    ...b.features.essential.map((f) => `- ${f.name}`),
    '',
    `Tech stack: ${b.techStack.map((t) => t.choice).join(', ') || 'to be decided'}`,
    `Progress: ${st.done}/${st.total} tasks completed (${st.percent}%)`,
    p.source === 'sample' ? '\nNote: this plan is sample output, not AI-generated.' : '',
  ]
    .join('\n')
    .trim();
}

/* =============================== storage ================================ */
const LOCAL_KEY = 'ideaforge.projects.v1';
let memoryStore: unknown[] = [];
let localAvailable: boolean | null = null;

export function isLocalStorageAvailable(): boolean {
  if (localAvailable !== null) return localAvailable;
  try {
    const k = '__ideaforge_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    localAvailable = true;
  } catch {
    localAvailable = false;
  }
  return localAvailable;
}

function readLocalRaw(): unknown[] {
  if (!isLocalStorageAvailable()) return memoryStore;
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalRaw(list: unknown[]): void {
  if (!isLocalStorageAvailable()) {
    memoryStore = list;
    return;
  }
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
      throw new Error('Browser storage is full. Delete old projects or export a backup, then try again.');
    }
    throw new Error('Could not save to browser storage.');
  }
}

let cloudUserId: string | null = null;

export function setCloudUser(userId: string | null): void {
  cloudUserId = userId;
}

export function storageMode(): 'cloud' | 'local' | 'memory' {
  if (cloudUserId && supabase) return 'cloud';
  return isLocalStorageAvailable() ? 'local' : 'memory';
}

const TABLE = 'ideaforge_projects';

function cloudError(e: { message?: string; code?: string } | null): Error {
  const msg = e?.message ?? 'Unknown database error';
  if (e?.code === '42P01' || e?.code === 'PGRST205' || /does not exist|could not find the table/i.test(msg)) {
    return new Error('The cloud database table is not set up yet. Run supabase.sql in your Supabase SQL editor (see README).');
  }
  if (/jwt|auth/i.test(msg)) return new Error('Your session has expired. Please sign in again.');
  if (/fetch|network/i.test(msg)) return new Error('Could not reach the database. Check your internet connection.');
  return new Error(`Database error: ${msg}`);
}

const sortByUpdated = (a: Project, b: Project) => b.updatedAt.localeCompare(a.updatedAt);

export async function listProjects(): Promise<Project[]> {
  if (storageMode() === 'cloud' && supabase) {
    const { data, error } = await supabase.from(TABLE).select('data').order('updated_at', { ascending: false });
    if (error) throw cloudError(error);
    return (data ?? [])
      .map((row: { data: unknown }) => normalizeProject(row.data))
      .filter((p): p is Project => p !== null)
      .sort(sortByUpdated);
  }
  return readLocalRaw()
    .map(normalizeProject)
    .filter((p): p is Project => p !== null)
    .sort(sortByUpdated);
}

export async function getProject(id: string): Promise<Project | null> {
  if (storageMode() === 'cloud' && supabase) {
    const { data, error } = await supabase.from(TABLE).select('data').eq('id', id).maybeSingle();
    if (error) throw cloudError(error);
    return data ? normalizeProject((data as { data: unknown }).data) : null;
  }
  const raw = readLocalRaw().find((p) => obj(p).id === id);
  return raw ? normalizeProject(raw) : null;
}

export async function saveProject(project: Project): Promise<Project> {
  const toSave: Project = { ...project, updatedAt: nowIso(), chat: project.chat.slice(-60) };
  if (storageMode() === 'cloud' && supabase && cloudUserId) {
    const { error } = await supabase.from(TABLE).upsert({
      id: toSave.id,
      user_id: cloudUserId,
      name: toSave.input.name,
      data: toSave,
      updated_at: toSave.updatedAt,
    });
    if (error) throw cloudError(error);
    return toSave;
  }
  const list = readLocalRaw().filter((p) => obj(p).id !== toSave.id);
  list.unshift(toSave);
  writeLocalRaw(list);
  return toSave;
}

export async function deleteProject(id: string): Promise<void> {
  if (storageMode() === 'cloud' && supabase) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw cloudError(error);
    return;
  }
  writeLocalRaw(readLocalRaw().filter((p) => obj(p).id !== id));
}

export function listLocalProjects(): Project[] {
  return readLocalRaw()
    .map(normalizeProject)
    .filter((p): p is Project => p !== null);
}

/** Copies projects saved in this browser into the signed-in account. Returns the number copied. */
export async function copyLocalToCloud(): Promise<number> {
  if (storageMode() !== 'cloud') throw new Error('Sign in first to copy projects to your account.');
  const local = listLocalProjects();
  for (const p of local) await saveProject(p);
  return local.length;
}

export function clearLocalProjects(): void {
  writeLocalRaw([]);
}

/** Imports projects from a JSON backup. Returns number imported. */
export async function importProjects(json: string): Promise<number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const items = Array.isArray(parsed) ? parsed : Array.isArray(obj(parsed).projects) ? (obj(parsed).projects as unknown[]) : [parsed];
  const projects = items.map(normalizeProject).filter((p): p is Project => p !== null);
  if (!projects.length) throw new Error('No valid IdeaForge projects were found in this file.');
  for (const p of projects) await saveProject(p);
  return projects.length;
}
