# IdeaForge AI — Inera School of Intelligence (SOI)

Turn a rough idea into a project blueprint, a step-by-step roadmap, guided building help, readiness checks and an exportable plan.

Built with **React + TypeScript + Vite** (frontend) and **Vercel Serverless Functions** (backend for AI). Supabase is **optional**.

---

## 1. What works, and what needs configuration

| Feature | Without any setup | Needs |
|---|---|---|
| Landing, onboarding, idea form, validation | ✅ | — |
| Clarification questions → blueprint → roadmap | ✅ *Demo mode: clearly-labelled sample output from templates* | AI key for real AI output |
| Task board / checklist, progress, add/edit/delete tasks | ✅ | — |
| "Help Me Build This", AI assistant, error fixing, code explain | ⚠️ Placeholder text only (labelled) | AI key |
| Generate task with AI, AI readiness review | ❌ Disabled with explanation | AI key |
| Rule-based readiness checker + deployment checklist | ✅ | — |
| PDF / Markdown / JSON export, copy share summary | ✅ | — |
| Saving projects | ✅ In **this browser only** (localStorage) | Supabase for accounts + cross-device |
| Sign up / login / logout | Hidden notice | Supabase |

The app never pretends AI is working: the sidebar shows **AI live** or **Demo mode**, and every AI answer is labelled *"AI suggestion · not executed or verified"*.

---

## 2. Project structure — completely flat

Extracting the zip gives **one folder containing only files. There are no sub-folders.**

| Files | Purpose |
|---|---|
| `index.html`, `main.tsx`, `App.tsx`, `*.tsx`, `*.ts`, `styles.css` | React app (all in the root) |
| `api-generate-plan.ts`, `api-ask-assistant.ts`, `api-health.ts` | Secure server-side AI endpoints |
| `build-vercel.mjs` | Turns the `api-*.ts` files into Vercel functions during the build |
| `inera-logo.jpeg`, `favicon.png` | Official Inera logo (bundled by Vite) |
| `package.json`, `package-lock.json`, `vercel.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts` | Configuration |
| `supabase.sql`, `.env.example`, `.gitignore`, `README.md` | Setup and docs |

**How the API works without an `api/` folder:** Vercel normally needs an `api/` folder. Here, `npm run build` runs `vite build` and then `build-vercel.mjs`. That script creates `.vercel/output/` (Vercel's documented *Build Output API*) on Vercel's build servers, with:
- `/api/generate-plan`, `/api/ask-assistant` and `/api/health` as Node.js functions (60 s limit)
- the website itself

You never create or upload any folder yourself.

Pages use hash URLs (e.g. `/#/dashboard`), so links and page refreshes work without any server rewrite rules.

---

## 3. Deploy to Vercel (GitHub)

1. Extract the zip. Open the extracted folder and select **all files**, including `.gitignore` and `.env.example`. These are hidden on some computers: on Windows, View → Show → Hidden items; on Mac, Cmd + Shift + .
2. On GitHub, create a new repository → **uploading an existing file** → drag all the files in → **Commit changes**. They must sit at the repository root, not inside a folder.
3. In Vercel: **Add New → Project → Import** the repository. Leave every setting as detected; `vercel.json` already sets the build command.
4. Click **Deploy**. The app works immediately in **demo mode**.
5. In the build log, check for the line `[build-vercel] Build Output ready: 3 function(s)`.
6. Add the AI environment variables (next section), then **Redeploy** (Deployments → ⋯ → Redeploy). Variables only apply to new deployments.
7. Open the site → **Settings**. It must say **AI is configured**. If it says *"AI server not reachable"*, the functions did not deploy — send me the build log.

---

## 4. Environment variables

Set in **Vercel → Project → Settings → Environment Variables** (Production + Preview). See `.env.example`.

### AI (required for real AI output)

| Variable | Example | Notes |
|---|---|---|
| `AI_PROVIDER` | `gemini` | `gemini` (free tier available), `openai` or `anthropic` |
| `GEMINI_API_KEY` | `AIza...` | Get at https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Optional; default shown |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | | Only if `AI_PROVIDER=openai` (paid) |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | | Only if `AI_PROVIDER=anthropic` (paid) |
| `AI_REQUIRE_AUTH` | `false` | Set `true` to allow AI only for signed-in Supabase users |

Keys are read **only on the server** (`process.env` inside the `api-*.ts` functions). Do **not** prefix AI keys with `VITE_` — that would expose them in the browser.

### Supabase (optional — accounts + cloud saving)

| Variable | Where |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Same page → `anon` `public` key |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Same values; only needed when `AI_REQUIRE_AUTH=true` |

**Never** use the `service_role` key in this app.

---

## 5. Optional: Supabase setup

1. Create a free project at https://supabase.com.
2. Open **SQL Editor → New query**, paste `supabase.sql`, click **Run**. This creates table `ideaforge_projects` with **Row Level Security** so each user can access only their own rows.
3. **Authentication → URL Configuration**: set *Site URL* to your Vercel URL and add `https://your-app.vercel.app/**` to *Redirect URLs* (for email confirmation links).
4. Add the `VITE_SUPABASE_*` variables in Vercel and redeploy.
5. Signed-in users can copy browser projects into their account from **Settings**.

Test RLS: create two accounts and confirm neither sees the other's projects.

---

## 6. Local development

Requires Node.js **20.19+** (22 recommended).

```bash
npm install
npm run dev          # UI only on http://localhost:5173 — the AI functions are NOT served, so the app runs in demo mode
```

To test the full app including AI before pushing (optional):

```bash
npm i -g vercel
vercel link          # once
vercel env pull      # or: cp .env.example .env.local and fill in your key
vercel build && vercel deploy --prebuilt   # deploys a preview using the same build path as Git deploys
```

### Checks

```bash
npm run typecheck    # TypeScript for the app and the api-*.ts files
npm run test         # unit tests (Vitest)
npm run build        # production build
npm run check        # all of the above
```

---

## 7. Costs and limits (be realistic)

- **Vercel Hobby**: free for personal/non-commercial use. Commercial use for Inera needs a Pro plan. Functions are set to a 60-second limit; plan generation usually takes 20–60 s.
- **Gemini free tier**: has per-minute and per-day request limits. A busy classroom can hit them — the app shows a clear "rate limit reached" message. Use a paid tier for workshops.
- **Supabase free tier**: projects pause after inactivity; enough for pilots.
- **Abuse risk**: without `AI_REQUIRE_AUTH=true`, anyone with the URL can use your AI quota. Turn it on (with Supabase) before sharing the link publicly.

---

## 8. Known limitations

- Without Supabase, projects live in one browser. Clearing browser data deletes them — use **Settings → Download all projects**.
- No public share links (sharing is copy-a-summary only, so no private data leaks).
- AI plans, code and estimates are guidance. The assistant cannot run code, access your database or verify fixes.
- No server-side rate limiting beyond the AI provider's own limits.

© INERA GROUP (Inera Software Pvt. Ltd.) — Inera School of Intelligence.
