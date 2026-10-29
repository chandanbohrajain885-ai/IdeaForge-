/**
 * POST /api/generate-plan
 * Actions:
 *   clarify   -> decides whether up to 3 clarification questions are needed
 *   blueprint -> structured project blueprint
 *   roadmap   -> phases + ordered tasks
 *   review    -> AI readiness review of the plan
 *
 * Secrets are read from server environment variables only.
 * This file is intentionally self-contained (no local imports) so Vercel
 * compiles it as an independent serverless function without module-path issues.
 */

/* ------------------------------------------------------------------ */
/* Minimal request/response types (avoids a dependency on @vercel/node) */
/* ------------------------------------------------------------------ */
interface ApiRequest {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}
interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

type Json = Record<string, unknown>;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/* ------------------------------ helpers ----------------------------- */
const MAX_BODY_CHARS = 60_000;

function env(name: string): string {
  return (process.env[name] ?? '').trim();
}

function str(v: unknown, max = 2000, fallback = ''): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).slice(0, max);
  if (typeof v !== 'string') return fallback;
  return v.trim().slice(0, max);
}

function strArr(v: unknown, maxItems = 20, maxLen = 600): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === 'string') return x.trim();
      if (x && typeof x === 'object') {
        const o = x as Json;
        return str(o.text ?? o.name ?? o.title ?? o.step ?? o.description ?? '', maxLen);
      }
      return '';
    })
    .filter((s) => s.length > 0)
    .slice(0, maxItems)
    .map((s) => s.slice(0, maxLen));
}

function objArr(v: unknown, maxItems = 30): Json[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Json => !!x && typeof x === 'object' && !Array.isArray(x)).slice(0, maxItems);
}

function parseBody(req: ApiRequest): Json {
  let body: unknown = req.body;
  if (typeof body === 'string') {
    if (body.length > MAX_BODY_CHARS) throw new HttpError(413, 'Request is too large.');
    try {
      body = JSON.parse(body);
    } catch {
      throw new HttpError(400, 'Request body must be valid JSON.');
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
  if (JSON.stringify(body).length > MAX_BODY_CHARS) throw new HttpError(413, 'Request is too large.');
  return body as Json;
}

function extractJson(text: string): Json {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new HttpError(502, 'The AI returned an unreadable response. Please try again.');
  }
  try {
    const parsed = JSON.parse(t.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object');
    return parsed as Json;
  } catch {
    throw new HttpError(502, 'The AI response was incomplete or malformed. Please try again.');
  }
}

/* --------------------------- auth (optional) ------------------------ */
async function requireAuthIfConfigured(req: ApiRequest): Promise<void> {
  if (env('AI_REQUIRE_AUTH').toLowerCase() !== 'true') return;
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const anon = env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY');
  if (!url || !anon) {
    throw new HttpError(500, 'Server misconfiguration: AI_REQUIRE_AUTH is true but Supabase variables are missing.');
  }
  const raw = req.headers['authorization'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  const token = header && header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Please sign in to use AI features.');
  const r = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anon },
  });
  if (!r.ok) throw new HttpError(401, 'Your session has expired. Please sign in again.');
}

/* ---------------------------- AI providers -------------------------- */
interface AiOptions {
  json: boolean;
  maxTokens: number;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 55_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new HttpError(504, 'The AI provider took too long to respond. Please try again.');
    }
    throw new HttpError(502, 'Could not reach the AI provider. Check your network or provider status.');
  } finally {
    clearTimeout(timer);
  }
}

async function providerError(r: Response, name: string): Promise<HttpError> {
  let detail = '';
  try {
    const t = await r.text();
    detail = t.slice(0, 300);
  } catch {
    /* ignore */
  }
  console.error(`[${name}] HTTP ${r.status}: ${detail}`);
  if (r.status === 401 || r.status === 403) return new HttpError(502, `${name} rejected the API key. Check the key in your environment variables.`);
  if (r.status === 429) return new HttpError(429, `${name} rate limit or quota reached. Wait a minute and try again.`);
  if (r.status === 404) return new HttpError(502, `${name} model not found. Check the model name in your environment variables.`);
  return new HttpError(502, `${name} returned an error (HTTP ${r.status}). Please try again.`);
}

async function callAI(system: string, user: string, opts: AiOptions): Promise<string> {
  const provider = (env('AI_PROVIDER') || 'gemini').toLowerCase();

  if (provider === 'gemini') {
    const key = env('GEMINI_API_KEY');
    if (!key) throw new HttpError(503, 'AI is not configured: GEMINI_API_KEY is missing.');
    const model = env('GEMINI_MODEL') || 'gemini-2.5-flash';
    const generationConfig: Json = { temperature: 0.4, maxOutputTokens: opts.maxTokens };
    if (opts.json) generationConfig.responseMimeType = 'application/json';
    if (model.startsWith('gemini-2.5-flash')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    const r = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig,
        }),
      },
    );
    if (!r.ok) throw await providerError(r, 'Gemini');
    const data = (await r.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    };
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    if (!text) throw new HttpError(502, 'Gemini returned an empty response (it may have been blocked). Try rephrasing.');
    return text;
  }

  if (provider === 'openai') {
    const key = env('OPENAI_API_KEY');
    if (!key) throw new HttpError(503, 'AI is not configured: OPENAI_API_KEY is missing.');
    const model = env('OPENAI_MODEL') || 'gpt-4o-mini';
    const body: Json = {
      model,
      max_completion_tokens: opts.maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };
    if (opts.json) body.response_format = { type: 'json_object' };
    const r = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw await providerError(r, 'OpenAI');
    const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new HttpError(502, 'OpenAI returned an empty response.');
    return text;
  }

  if (provider === 'anthropic') {
    const key = env('ANTHROPIC_API_KEY');
    if (!key) throw new HttpError(503, 'AI is not configured: ANTHROPIC_API_KEY is missing.');
    const model = env('ANTHROPIC_MODEL') || 'claude-sonnet-5-5';
    const r = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens,
        system: opts.json ? `${system}\n\nRespond with ONLY one valid JSON object. No prose, no code fences.` : system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!r.ok) throw await providerError(r, 'Anthropic');
    const data = (await r.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
    if (!text) throw new HttpError(502, 'Anthropic returned an empty response.');
    return text;
  }

  throw new HttpError(500, `Unknown AI_PROVIDER "${provider}". Use gemini, openai or anthropic.`);
}

/* --------------------------- input shaping -------------------------- */
interface CleanInput {
  name: string;
  idea: string;
  problem: string;
  users: string;
  category: string;
  platform: string;
  experience: string;
  technologies: string;
  budget: string;
  timeline: string;
}

function cleanInput(v: unknown): CleanInput {
  const o = (v && typeof v === 'object' ? v : {}) as Json;
  const input: CleanInput = {
    name: str(o.name, 120),
    idea: str(o.idea, 4000),
    problem: str(o.problem, 2000),
    users: str(o.users, 1000),
    category: str(o.category, 80),
    platform: str(o.platform, 80),
    experience: str(o.experience, 40),
    technologies: str(o.technologies, 500),
    budget: str(o.budget, 200),
    timeline: str(o.timeline, 200),
  };
  if (input.name.length < 2) throw new HttpError(400, 'Project name is required.');
  if (input.idea.length < 20) throw new HttpError(400, 'Please describe the idea in at least 20 characters.');
  return input;
}

function cleanClarifications(v: unknown): { question: string; answer: string }[] {
  return objArr(v, 3)
    .map((o) => ({ question: str(o.question, 300), answer: str(o.answer, 1000) }))
    .filter((c) => c.question && c.answer);
}

function describeInput(input: CleanInput, clar: { question: string; answer: string }[]): string {
  const lines = [
    `Project name: ${input.name}`,
    `Idea (user's own words): ${input.idea}`,
    `Problem to solve: ${input.problem || 'Not specified'}`,
    `Intended users: ${input.users || 'Not specified'}`,
    `Category: ${input.category || 'Not specified'}`,
    `Target platform: ${input.platform || 'Not specified'}`,
    `Builder experience level: ${input.experience || 'Not specified'}`,
    `Preferred languages/technologies: ${input.technologies || 'No preference'}`,
    `Budget: ${input.budget || 'Not specified'}`,
    `Expected completion time: ${input.timeline || 'Not specified'}`,
  ];
  if (clar.length) {
    lines.push('Clarifications answered by the user:');
    clar.forEach((c, i) => lines.push(`  Q${i + 1}: ${c.question}\n  A${i + 1}: ${c.answer}`));
  }
  return lines.join('\n');
}

const BASE_SYSTEM = `You are IdeaForge AI, a senior software mentor at Inera School of Intelligence (SOI).
You help students and beginners turn ideas into realistic, buildable software projects.
Rules:
- Base everything on the user's actual idea. Do not invent requirements they did not imply.
- Use plain, beginner-friendly language. Explain jargon briefly when you must use it.
- Recommend the simplest technology that fits the requirements AND the user's experience level. Prefer free tiers.
- Never claim anything has been built, tested, deployed or verified. You are planning, not executing.
- Be realistic about time and effort. If the user's timeline is unrealistic, say so politely.`;

/* ------------------------------ actions ----------------------------- */
async function actionClarify(body: Json): Promise<Json> {
  const input = cleanInput(body.input);
  const system = `${BASE_SYSTEM}
Decide whether the idea is clear enough to plan. If key details are missing or ambiguous (who uses it, what the core action is, what the first version must do), ask at most 3 short, simple questions that help the user understand their own idea. If it is already clear enough, ask none.
Return JSON: {"needsClarification": boolean, "questions": string[] (0 to 3 items, each under 160 characters)}`;
  const raw = await callAI(system, describeInput(input, []), { json: true, maxTokens: 800 });
  const data = extractJson(raw);
  const questions = strArr(data.questions, 3, 200);
  return { needsClarification: questions.length > 0 && data.needsClarification !== false, questions };
}

function normFeatures(v: unknown): { name: string; description: string }[] {
  return objArr(v, 12)
    .map((o) => ({ name: str(o.name ?? o.title, 120), description: str(o.description ?? o.details, 500) }))
    .filter((f) => f.name);
}

function normalizeBlueprint(d: Json, input: CleanInput): Json {
  const features = (d.features && typeof d.features === 'object' ? d.features : {}) as Json;
  return {
    title: str(d.title, 140) || input.name,
    summary: str(d.summary, 1500),
    problemStatement: str(d.problemStatement, 1500) || input.problem,
    solution: str(d.solution, 1500),
    targetAudience: str(d.targetAudience, 800) || input.users,
    objectives: strArr(d.objectives, 10),
    outcomes: strArr(d.outcomes, 10),
    usefulness: str(d.usefulness, 1000),
    features: {
      essential: normFeatures(features.essential),
      recommended: normFeatures(features.recommended),
      advanced: normFeatures(features.advanced),
    },
    userJourney: strArr(d.userJourney, 15),
    screens: objArr(d.screens, 15)
      .map((o) => ({ name: str(o.name, 100), purpose: str(o.purpose ?? o.description, 400) }))
      .filter((s) => s.name),
    techStack: objArr(d.techStack, 12)
      .map((o) => ({
        layer: str(o.layer, 60),
        choice: str(o.choice ?? o.technology, 120),
        reason: str(o.reason, 500),
        alternatives: str(o.alternatives, 300),
      }))
      .filter((t) => t.choice),
    architecture: str(d.architecture, 2000),
    architectureFlow: strArr(d.architectureFlow, 12),
    integrations: objArr(d.integrations, 12)
      .map((o) => ({ name: str(o.name, 100), purpose: str(o.purpose, 400), required: o.required === true }))
      .filter((i) => i.name),
    database: objArr(d.database, 15)
      .map((o) => ({ table: str(o.table ?? o.name, 80), purpose: str(o.purpose, 400), fields: strArr(o.fields, 20, 120) }))
      .filter((t) => t.table),
    apis: objArr(d.apis, 20)
      .map((o) => ({ method: str(o.method, 10).toUpperCase() || 'GET', path: str(o.path, 120), purpose: str(o.purpose, 300) }))
      .filter((a) => a.path),
    assumptions: strArr(d.assumptions, 10),
  };
}

async function actionBlueprint(body: Json): Promise<Json> {
  const input = cleanInput(body.input);
  const clar = cleanClarifications(body.clarifications);
  const system = `${BASE_SYSTEM}
Create a practical project blueprint. Return ONE JSON object with exactly these keys:
{
 "title": string,
 "summary": string (2-4 simple sentences explaining the idea),
 "problemStatement": string,
 "solution": string,
 "targetAudience": string,
 "objectives": string[] (3-6),
 "outcomes": string[] (3-6 expected outcomes),
 "usefulness": string (what makes this project useful),
 "features": {
   "essential": [{"name": string, "description": string}] (features REQUIRED for the first working version, 3-7),
   "recommended": [{"name": string, "description": string}] (add next, 2-5),
   "advanced": [{"name": string, "description": string}] (future versions, 2-5)
 },
 "userJourney": string[] (ordered steps a user takes, 4-10),
 "screens": [{"name": string, "purpose": string}] (main screens),
 "techStack": [{"layer": string (e.g. Frontend, Backend, Database, AI, Hosting), "choice": string, "reason": string, "alternatives": string}],
 "architecture": string (plain-language explanation of how frontend, backend, database and AI services connect),
 "architectureFlow": string[] (ordered data-flow steps, e.g. "Browser sends form to /api/x"),
 "integrations": [{"name": string, "purpose": string, "required": boolean}] (only integrations this project genuinely needs; empty array if none),
 "database": [{"table": string, "purpose": string, "fields": string[]}] (empty array if no database is needed),
 "apis": [{"method": string, "path": string, "purpose": string}] (empty array if no backend is needed),
 "assumptions": string[] (assumptions you made because information was missing)
}
Match technology complexity to the experience level. For beginners prefer well-documented, free-tier tools.`;
  const raw = await callAI(system, describeInput(input, clar), { json: true, maxTokens: 8192 });
  return { blueprint: normalizeBlueprint(extractJson(raw), input) };
}

const PRIORITIES = new Set(['high', 'medium', 'low']);

function normalizeRoadmap(d: Json): Json {
  const phases = objArr(d.phases, 10)
    .map((o, i) => ({ id: str(o.id, 20) || `P${i + 1}`, name: str(o.name, 80), goal: str(o.goal, 400) }))
    .filter((p) => p.name);
  // ensure unique phase ids
  const phaseIds = new Set<string>();
  phases.forEach((p, i) => {
    if (phaseIds.has(p.id)) p.id = `P${i + 1}`;
    phaseIds.add(p.id);
  });
  const fallbackPhase = phases[0]?.id ?? 'P1';
  if (!phases.length) phases.push({ id: 'P1', name: 'Build', goal: 'Build the first working version.' });

  const rawTasks = objArr(d.tasks, 60).filter((t) => str(t.title, 140).length > 0);
  const idMap = new Map<string, string>();
  rawTasks.forEach((t, i) => {
    const orig = str(t.id, 20) || `T${i + 1}`;
    if (!idMap.has(orig)) idMap.set(orig, `T${i + 1}`);
  });
  const tasks = rawTasks
    .map((t, i) => {
      const id = `T${i + 1}`;
      const phase = str(t.phase ?? t.phaseId, 20);
      const prio = str(t.priority, 10).toLowerCase();
      const deps = strArr(t.dependencies, 8, 20)
        .map((dep) => idMap.get(dep) ?? '')
        .filter((dep) => dep && dep !== id && Number(dep.slice(1)) < i + 1);
      return {
        id,
        phase: phaseIds.has(phase) ? phase : fallbackPhase,
        title: str(t.title, 140),
        description: str(t.description, 1200),
        expectedResult: str(t.expectedResult, 600),
        priority: PRIORITIES.has(prio) ? prio : 'medium',
        effort: str(t.effort, 60) || 'Not estimated',
        dependencies: Array.from(new Set(deps)),
        status: 'todo',
      };
    })
    .filter((t) => t.title);
  return {
    phases,
    tasks,
    totalEstimate: str(d.totalEstimate, 200),
    timelineNote: str(d.timelineNote, 600),
  };
}

function blueprintDigest(bp: Json): string {
  const b = bp as Record<string, unknown>;
  const pick = (k: string) => JSON.stringify(b[k] ?? '').slice(0, 2500);
  return [
    `Title: ${str(b.title, 140)}`,
    `Summary: ${str(b.summary, 800)}`,
    `Features: ${pick('features')}`,
    `Screens: ${pick('screens')}`,
    `Tech stack: ${pick('techStack')}`,
    `Database: ${pick('database')}`,
    `APIs: ${pick('apis')}`,
    `Integrations: ${pick('integrations')}`,
  ].join('\n');
}

async function actionRoadmap(body: Json): Promise<Json> {
  const input = cleanInput(body.input);
  const bp = body.blueprint && typeof body.blueprint === 'object' ? (body.blueprint as Json) : null;
  if (!bp) throw new HttpError(400, 'A blueprint is required to build the roadmap.');
  const system = `${BASE_SYSTEM}
Create a practical development roadmap for the FIRST working version (essential features), plus a final phase for preparing deployment.
Adapt the phases to this project (e.g. Planning, Interface Design, Frontend, Backend, Database & Integrations, AI Implementation, Testing, Deployment) - skip phases the project does not need.
Break each phase into small, specific tasks a beginner can complete in a few hours to two days. 12-35 tasks in total, ordered so dependencies come first.
Return ONE JSON object:
{
 "phases": [{"id": "P1", "name": string, "goal": string}],
 "tasks": [{"id": "T1", "phase": "P1", "title": string, "description": string (what to do, concretely), "expectedResult": string (how the user knows it is done), "priority": "high"|"medium"|"low", "effort": string (e.g. "2-3 hours", "1 day"), "dependencies": string[] (ids of earlier tasks)}],
 "totalEstimate": string (realistic total effort for this user's experience level),
 "timelineNote": string (honest note comparing the estimate with the user's expected completion time)
}`;
  const user = `${describeInput(input, cleanClarifications(body.clarifications))}\n\nBlueprint:\n${blueprintDigest(bp)}`;
  const raw = await callAI(system, user, { json: true, maxTokens: 8192 });
  const roadmap = normalizeRoadmap(extractJson(raw));
  if (!(roadmap.tasks as unknown[]).length) throw new HttpError(502, 'The AI did not return any tasks. Please try again.');
  return roadmap;
}

async function actionReview(body: Json): Promise<Json> {
  const project = body.project && typeof body.project === 'object' ? (body.project as Json) : null;
  if (!project) throw new HttpError(400, 'Project details are required for a review.');
  const digest = JSON.stringify(project).slice(0, 14_000);
  const system = `${BASE_SYSTEM}
Review this project plan before development or deployment. Check for: missing requirements, unclear goals, unnecessary features for version 1, unrealistic timelines, incomplete user flows, security considerations (auth, secrets, input validation, data access rules), missing tests, database or integration gaps, and deployment preparation.
Be specific to THIS project. This is guidance, not a guarantee.
Return ONE JSON object:
{
 "score": number (0-100 readiness),
 "summary": string (2-4 sentences, honest),
 "issues": [{"area": string, "severity": "high"|"medium"|"low", "problem": string, "why": string, "recommendation": string}] (3-10),
 "checklist": string[] (5-12 concrete items to complete before deployment)
}`;
  const raw = await callAI(system, `Project data (JSON):\n${digest}`, { json: true, maxTokens: 4096 });
  const d = extractJson(raw);
  const scoreNum = Number(d.score);
  return {
    score: Number.isFinite(scoreNum) ? Math.max(0, Math.min(100, Math.round(scoreNum))) : 50,
    summary: str(d.summary, 1200),
    issues: objArr(d.issues, 12)
      .map((o) => {
        const sev = str(o.severity, 10).toLowerCase();
        return {
          area: str(o.area, 80) || 'General',
          severity: PRIORITIES.has(sev) ? sev : 'medium',
          problem: str(o.problem, 500),
          why: str(o.why, 500),
          recommendation: str(o.recommendation, 600),
        };
      })
      .filter((i) => i.problem),
    checklist: strArr(d.checklist, 15, 300),
  };
}

/* ------------------------------ handler ----------------------------- */
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }
  try {
    await requireAuthIfConfigured(req);
    const body = parseBody(req);
    const action = str(body.action, 20);
    let result: Json;
    switch (action) {
      case 'clarify':
        result = await actionClarify(body);
        break;
      case 'blueprint':
        result = await actionBlueprint(body);
        break;
      case 'roadmap':
        result = await actionRoadmap(body);
        break;
      case 'review':
        result = await actionReview(body);
        break;
      default:
        throw new HttpError(400, 'Unknown action. Use clarify, blueprint, roadmap or review.');
    }
    res.status(200).json(result);
  } catch (e) {
    if (e instanceof HttpError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    console.error('[generate-plan] unexpected error', e);
    res.status(500).json({ error: 'Unexpected server error. Please try again.' });
  }
}
