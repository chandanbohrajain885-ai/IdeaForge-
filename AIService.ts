import type { AiReview, Blueprint, ChatMessage, Clarification, HealthStatus, Priority, Project, ProjectInput, RoadmapResult, Task } from './Types';
import { buildAiContext, normalizeBlueprint, normalizeRoadmap, phaseName } from './ProjectService';
import { getAccessToken } from './SupabaseClient';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

const NOT_DEPLOYED_HEALTH: HealthStatus = {
  reachable: false,
  aiConfigured: false,
  provider: '',
  model: '',
  authRequired: false,
  message:
    'The AI server (/api) is not reachable. On Vercel it runs automatically; locally use "vercel dev" instead of "npm run dev".',
};

export async function fetchHealth(): Promise<HealthStatus> {
  try {
    const r = await fetch('/api/health', { headers: { Accept: 'application/json' } });
    const type = r.headers.get('content-type') ?? '';
    if (!r.ok || !type.includes('application/json')) return NOT_DEPLOYED_HEALTH;
    const d = (await r.json()) as Partial<HealthStatus>;
    return {
      reachable: true,
      aiConfigured: d.aiConfigured === true,
      provider: typeof d.provider === 'string' ? d.provider : '',
      model: typeof d.model === 'string' ? d.model : '',
      authRequired: d.authRequired === true,
      message: typeof d.message === 'string' ? d.message : '',
    };
  } catch {
    return NOT_DEPLOYED_HEALTH;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let r: Response;
  try {
    r = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    throw new ApiError('Network error: could not reach the server. Check your internet connection and try again.');
  }
  const type = r.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    if (r.status === 504) throw new ApiError('The request timed out. The AI took too long. Please try again.', 504);
    throw new ApiError(
      r.status === 404
        ? 'The AI server endpoint was not found. Deploy to Vercel or run "vercel dev" locally.'
        : `The server returned an unexpected response (HTTP ${r.status}).`,
      r.status,
    );
  }
  let data: unknown;
  try {
    data = await r.json();
  } catch {
    throw new ApiError('The server response could not be read.', r.status);
  }
  if (!r.ok) {
    const msg = data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string' ? (data as { error: string }).error : `Request failed (HTTP ${r.status}).`;
    throw new ApiError(msg, r.status);
  }
  return data as T;
}

/* ============================== planning ============================== */
export async function aiClarify(input: ProjectInput): Promise<string[]> {
  const d = await post<{ needsClarification?: boolean; questions?: unknown }>('/api/generate-plan', { action: 'clarify', input });
  const qs = Array.isArray(d.questions) ? d.questions.filter((q): q is string => typeof q === 'string' && q.trim().length > 0) : [];
  return d.needsClarification === false ? [] : qs.slice(0, 3);
}

export async function aiBlueprint(input: ProjectInput, clarifications: Clarification[]): Promise<Blueprint> {
  const d = await post<{ blueprint?: unknown }>('/api/generate-plan', { action: 'blueprint', input, clarifications });
  const bp = normalizeBlueprint(d.blueprint);
  if (!bp.summary && !bp.features.essential.length) throw new ApiError('The AI returned an empty blueprint. Please try again.');
  if (!bp.title) bp.title = input.name;
  return bp;
}

export async function aiRoadmap(input: ProjectInput, clarifications: Clarification[], blueprint: Blueprint): Promise<RoadmapResult> {
  const d = await post<unknown>('/api/generate-plan', { action: 'roadmap', input, clarifications, blueprint });
  const rm = normalizeRoadmap(d);
  if (!rm.tasks.length) throw new ApiError('The AI did not return any tasks. Please try again.');
  return rm;
}

export async function aiReview(project: Project): Promise<AiReview> {
  const digest = {
    input: project.input,
    blueprint: project.blueprint,
    phases: project.phases,
    tasks: project.tasks.map((t) => ({ id: t.id, phase: t.phase, title: t.title, priority: t.priority, effort: t.effort, status: t.status })),
    totalEstimate: project.totalEstimate,
  };
  const d = await post<Partial<AiReview>>('/api/generate-plan', { action: 'review', project: digest });
  return {
    score: typeof d.score === 'number' ? d.score : 50,
    summary: typeof d.summary === 'string' ? d.summary : '',
    issues: Array.isArray(d.issues) ? d.issues : [],
    checklist: Array.isArray(d.checklist) ? d.checklist.filter((c): c is string => typeof c === 'string') : [],
    createdAt: new Date().toISOString(),
    source: 'ai',
  };
}

/* ============================== assistant ============================= */
export async function aiChat(project: Project, history: ChatMessage[]): Promise<string> {
  const messages = history.filter((m) => !m.error).slice(-12).map((m) => ({ role: m.role, content: m.content }));
  const d = await post<{ reply?: string }>('/api/ask-assistant', { mode: 'chat', context: buildAiContext(project), messages });
  if (!d.reply) throw new ApiError('The assistant returned an empty answer. Please try again.');
  return d.reply;
}

export async function aiBuildHelp(project: Project, task: Task): Promise<string> {
  const d = await post<{ reply?: string }>('/api/ask-assistant', {
    mode: 'build',
    context: buildAiContext(project),
    task: { ...task, phaseName: phaseName(project, task.phase), guide: undefined },
  });
  if (!d.reply) throw new ApiError('The assistant returned an empty guide. Please try again.');
  return d.reply;
}

export async function aiFixError(project: Project, errorText: string, code: string, note: string): Promise<string> {
  const d = await post<{ reply?: string }>('/api/ask-assistant', { mode: 'fix', context: buildAiContext(project), errorText, code, note });
  if (!d.reply) throw new ApiError('The assistant returned an empty answer. Please try again.');
  return d.reply;
}

export async function aiExplainCode(project: Project, code: string): Promise<string> {
  const d = await post<{ reply?: string }>('/api/ask-assistant', { mode: 'explain-code', context: buildAiContext(project), code });
  if (!d.reply) throw new ApiError('The assistant returned an empty answer. Please try again.');
  return d.reply;
}

export interface GeneratedTask {
  title: string;
  description: string;
  expectedResult: string;
  priority: Priority;
  effort: string;
  phase: string;
}

export async function aiGenerateTask(project: Project, request: string): Promise<GeneratedTask> {
  const phases = project.phases.map((p) => `${p.id} (${p.name})`).join(', ');
  const d = await post<{ task?: Partial<GeneratedTask> }>('/api/ask-assistant', {
    mode: 'task',
    context: buildAiContext(project),
    request,
    phases,
  });
  const t = d.task ?? {};
  if (!t.title) throw new ApiError('The AI did not return a usable task.');
  const prio: Priority = t.priority === 'high' || t.priority === 'low' ? t.priority : 'medium';
  return {
    title: t.title,
    description: t.description ?? '',
    expectedResult: t.expectedResult ?? '',
    priority: prio,
    effort: t.effort ?? 'Not estimated',
    phase: project.phases.some((p) => p.id === t.phase) ? (t.phase as string) : project.phases[0]?.id ?? '',
  };
}
