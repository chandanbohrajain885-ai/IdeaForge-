/**
 * POST /api/ask-assistant
 * Modes: chat | build | fix | explain-code | task
 * Project-aware assistant. Secrets stay on the server (environment variables).
 * Self-contained on purpose (no local imports) for reliable Vercel builds.
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

/* ----------------------------- prompts ------------------------------ */
const ASSISTANT_SYSTEM = `You are the IdeaForge AI project assistant at Inera School of Intelligence (SOI).
You mentor students and beginners who are building the specific project described in PROJECT CONTEXT.
Rules:
- Use the project context so the user never has to re-explain the project. Stay consistent with its tech stack and structure.
- Answer in clear, structured Markdown: short headings, numbered steps, bullet points and fenced code blocks with a language tag.
- Explain technical ideas in simple language so the user learns, not just copies.
- If important information is missing, say exactly what you need and ask for it instead of guessing.
- Clearly separate facts taken from the project context ("From your plan: ...") from your own suggestions ("Suggestion: ...").
- You CANNOT run code, access databases, browse the user's files or test anything. Never claim you ran, tested, verified, deployed or fixed something. Say "this should..." and tell the user how to verify it.
- Never ask for or repeat secret keys, passwords or tokens. Tell users to keep secrets in environment variables.`;

const BUILD_INSTRUCTIONS = `The user clicked "Help Me Build This" for the task below. Write a practical, step-by-step guide using these Markdown sections:
## What you will do
## Why this matters
## Before you start (prerequisites and which earlier tasks must be finished)
## Files to create or edit (list file paths consistent with the project's stack)
## Step-by-step instructions (numbered; include code blocks and terminal commands where needed, with a one-line explanation of each)
## How to test it
## Done looks like (clear success criteria)
## Common mistakes
Keep code minimal, correct for the chosen stack, and explain where each snippet goes.`;

const FIX_INSTRUCTIONS = `The user is stuck on an error. Diagnose it carefully before suggesting changes. Use these Markdown sections:
## What the error means (plain language)
## Most likely cause (and other possible causes, ranked)
## Suggested fix (show only the specific lines to change and explain why; do NOT dump a full random replacement file)
## How to verify the fix
## If it still fails (what extra information to share)
If the error text or code is not enough to diagnose confidently, say so and ask for the specific missing details (full stack trace, file, command run, versions).`;

const CODE_INSTRUCTIONS = `The user wants their code explained. Use these Markdown sections:
## What this code does (one-paragraph summary)
## Line-by-line / block-by-block explanation
## How it fits into the project
## Possible problems or improvements (label each as a suggestion)`;

/* --------------------------- body shaping --------------------------- */
function cleanMessages(v: unknown): { role: 'user' | 'assistant'; content: string }[] {
  return objArr(v, 40)
    .map((o) => ({
      role: (o.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: str(o.content, 4000),
    }))
    .filter((m) => m.content)
    .slice(-12);
}

function describeTask(v: unknown): string {
  const t = (v && typeof v === 'object' ? v : {}) as Json;
  return [
    `Task ${str(t.id, 20)}: ${str(t.title, 200)}`,
    `Phase: ${str(t.phaseName ?? t.phase, 100)}`,
    `Description: ${str(t.description, 1500)}`,
    `Expected result: ${str(t.expectedResult, 800)}`,
    `Priority: ${str(t.priority, 20)} | Effort: ${str(t.effort, 60)}`,
    `Depends on: ${strArr(t.dependencies, 10, 200).join(', ') || 'none'}`,
  ].join('\n');
}

const PRIORITIES = new Set(['high', 'medium', 'low']);

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
    const mode = str(body.mode, 20) || 'chat';
    const context = str(body.context, 14_000);
    if (!context) throw new HttpError(400, 'Project context is missing.');
    const system = `${ASSISTANT_SYSTEM}\n\nPROJECT CONTEXT:\n${context}`;

    if (mode === 'task') {
      const request = str(body.request, 1500);
      if (request.length < 5) throw new HttpError(400, 'Describe the task you want to generate.');
      const phases = str(body.phases, 1500);
      const raw = await callAI(
        `${system}\n\nCreate ONE new development task for this project. Return ONE JSON object: {"title": string, "description": string, "expectedResult": string, "priority": "high"|"medium"|"low", "effort": string, "phase": string (one of the phase ids listed)}`,
        `Available phases: ${phases || 'P1'}\nUser request: ${request}`,
        { json: true, maxTokens: 1200 },
      );
      const d = extractJson(raw);
      const prio = str(d.priority, 10).toLowerCase();
      const task = {
        title: str(d.title, 140),
        description: str(d.description, 1200),
        expectedResult: str(d.expectedResult, 600),
        priority: PRIORITIES.has(prio) ? prio : 'medium',
        effort: str(d.effort, 60) || 'Not estimated',
        phase: str(d.phase, 20),
      };
      if (!task.title) throw new HttpError(502, 'The AI did not return a usable task. Please try again.');
      res.status(200).json({ task });
      return;
    }

    let user: string;
    let maxTokens = 3000;
    if (mode === 'build') {
      user = `${BUILD_INSTRUCTIONS}\n\nTASK:\n${describeTask(body.task)}`;
      maxTokens = 6000;
    } else if (mode === 'fix') {
      const errorText = str(body.errorText, 6000);
      if (errorText.length < 5) throw new HttpError(400, 'Paste the error message you are seeing.');
      user = `${FIX_INSTRUCTIONS}\n\nERROR MESSAGE:\n${errorText}\n\nRELATED CODE (may be empty):\n${str(body.code, 6000) || '(none provided)'}\n\nWHAT THE USER WAS DOING:\n${str(body.note, 1000) || '(not provided)'}`;
      maxTokens = 4000;
    } else if (mode === 'explain-code') {
      const code = str(body.code, 8000);
      if (code.length < 5) throw new HttpError(400, 'Paste the code you want explained.');
      user = `${CODE_INSTRUCTIONS}\n\nCODE:\n${code}`;
    } else if (mode === 'chat') {
      const messages = cleanMessages(body.messages);
      if (!messages.length || messages[messages.length - 1].role !== 'user') {
        throw new HttpError(400, 'Send a question for the assistant.');
      }
      const history = messages
        .slice(0, -1)
        .map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`)
        .join('\n\n');
      user = `${history ? `CONVERSATION SO FAR:\n${history}\n\n` : ''}USER QUESTION:\n${messages[messages.length - 1].content}`;
    } else {
      throw new HttpError(400, 'Unknown mode. Use chat, build, fix, explain-code or task.');
    }

    const reply = await callAI(system, user, { json: false, maxTokens });
    res.status(200).json({ reply: reply.trim() });
  } catch (e) {
    if (e instanceof HttpError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    console.error('[ask-assistant] unexpected error', e);
    res.status(500).json({ error: 'Unexpected server error. Please try again.' });
  }
}
