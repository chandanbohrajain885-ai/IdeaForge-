/**
 * Rule-based readiness checks. They run locally (no AI needed) and look only at the
 * saved plan and roadmap. They are guidance, not a guarantee of correctness or security.
 */
import type { Project } from './Types';
import { computeStats } from './ProjectService';
import { parseEffortHours, parseTimelineWeeks } from './Validation';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface ReadinessCheck {
  id: string;
  area: string;
  status: CheckStatus;
  title: string;
  why: string;
  recommendation: string;
}

export interface ReadinessResult {
  score: number;
  level: 'Needs work' | 'Getting there' | 'Ready to build' | 'Ready to deploy';
  checks: ReadinessCheck[];
  estimatedHours: number | null;
  availableHours: number | null;
}

const HOURS_PER_WEEK = 15; // realistic part-time assumption for a student

function tasksMention(p: Project, re: RegExp): boolean {
  return p.tasks.some((t) => re.test(`${t.title} ${t.description}`));
}

export function totalEstimatedHours(p: Project): number | null {
  const values = p.tasks.map((t) => parseEffortHours(t.effort));
  const known = values.filter((v): v is number => v !== null);
  if (!known.length) return null;
  const avg = known.reduce((a, b) => a + b, 0) / known.length;
  // estimate unknown efforts with the average of known ones
  return Math.round(known.reduce((a, b) => a + b, 0) + avg * (values.length - known.length));
}

export function runReadinessChecks(p: Project): ReadinessResult {
  const b = p.blueprint;
  const checks: ReadinessCheck[] = [];
  const add = (c: ReadinessCheck) => checks.push(c);

  // 1. Goals and requirements
  add(
    (b.problemStatement || p.input.problem).trim().length >= 25
      ? { id: 'problem', area: 'Requirements', status: 'pass', title: 'Problem statement is defined', why: 'A clear problem keeps every decision focused.', recommendation: 'Keep it visible while building.' }
      : { id: 'problem', area: 'Requirements', status: 'fail', title: 'Problem statement is missing or too short', why: 'Without a clear problem, it is hard to decide which features matter.', recommendation: 'Edit the blueprint and describe the problem in 1-2 specific sentences.' },
  );
  add(
    (b.targetAudience || p.input.users).trim().length >= 5
      ? { id: 'users', area: 'Requirements', status: 'pass', title: 'Target users are identified', why: 'Knowing users shapes design and language.', recommendation: 'Talk to 2-3 of them before you build.' }
      : { id: 'users', area: 'Requirements', status: 'fail', title: 'Target users are not defined', why: 'You cannot test usefulness without knowing who it is for.', recommendation: 'Name a specific group, for example "first-year engineering students".' },
  );
  add(
    b.objectives.length >= 2
      ? { id: 'goals', area: 'Goals', status: 'pass', title: 'Objectives are listed', why: 'Objectives tell you when version 1 is good enough.', recommendation: 'Make at least one objective measurable.' }
      : { id: 'goals', area: 'Goals', status: 'warn', title: 'Objectives are unclear', why: 'Unclear goals lead to endless building.', recommendation: 'Add 2-4 objectives in the blueprint.' },
  );

  // 2. Scope
  const ess = b.features.essential.length;
  if (ess === 0)
    add({ id: 'scope', area: 'Scope', status: 'fail', title: 'No essential features defined', why: 'Version 1 has no clear finish line.', recommendation: 'List the 3-5 features required for a first working version.' });
  else if (ess > 7)
    add({ id: 'scope', area: 'Scope', status: 'warn', title: `Version 1 has ${ess} essential features`, why: 'Too many features is the most common reason student projects are never finished.', recommendation: 'Move anything not needed on day one to "Recommended".' });
  else add({ id: 'scope', area: 'Scope', status: 'pass', title: `Focused scope (${ess} essential features)`, why: 'A small first version is realistic to finish.', recommendation: 'Resist adding features until version 1 is live.' });

  // 3. User flow
  add(
    b.userJourney.length >= 3 && b.screens.length >= 2
      ? { id: 'flow', area: 'User flow', status: 'pass', title: 'User journey and screens are mapped', why: 'You know what to build screen by screen.', recommendation: 'Check every journey step has a screen.' }
      : { id: 'flow', area: 'User flow', status: 'warn', title: 'User journey or screens are incomplete', why: 'Missing steps become surprises during development.', recommendation: 'Add the full journey (at least 3 steps) and the screens it needs.' },
  );

  // 4. Timeline realism
  const est = totalEstimatedHours(p);
  const weeks = parseTimelineWeeks(p.input.timeline);
  const available = weeks !== null ? Math.round(weeks * HOURS_PER_WEEK) : null;
  if (!p.tasks.length) {
    add({ id: 'timeline', area: 'Timeline', status: 'fail', title: 'No roadmap yet', why: 'Without tasks you cannot estimate effort or track progress.', recommendation: 'Generate the roadmap or add tasks manually.' });
  } else if (est !== null && available !== null) {
    add(
      est > available * 1.2
        ? { id: 'timeline', area: 'Timeline', status: 'warn', title: `Timeline looks tight: ~${est} h of work vs ~${available} h available`, why: `Assuming about ${HOURS_PER_WEEK} hours per week, the plan does not fit your stated completion time.`, recommendation: 'Cut or postpone features, extend the deadline, or add team members.' }
        : { id: 'timeline', area: 'Timeline', status: 'pass', title: `Timeline is realistic: ~${est} h of work vs ~${available} h available`, why: `Based on about ${HOURS_PER_WEEK} hours per week.`, recommendation: 'Keep a 20% buffer for bugs and learning.' },
    );
  } else {
    add({ id: 'timeline', area: 'Timeline', status: 'warn', title: 'Timeline could not be checked', why: 'Either the completion time or task efforts are missing or unclear.', recommendation: 'Set an expected completion time like "6 weeks" and add effort estimates to tasks.' });
  }

  // 5. Security
  const hasData = b.database.length > 0 || b.apis.length > 0;
  const hasSecrets = b.integrations.length > 0 || b.techStack.some((t) => /ai|api|gemini|openai|stripe|payment/i.test(`${t.layer} ${t.choice}`));
  if (hasData) {
    add(
      tasksMention(p, /auth|sign[- ]?in|login|row level|rls|permission/i)
        ? { id: 'auth', area: 'Security', status: 'pass', title: 'Authentication / access rules are planned', why: 'Users must only see their own data.', recommendation: 'Test with two accounts that data never leaks.' }
        : { id: 'auth', area: 'Security', status: 'fail', title: 'No task for authentication or access rules', why: 'Apps that store data without access rules can leak user information.', recommendation: 'Add a task for sign-in and database access rules (e.g. Supabase Row Level Security).' },
    );
  }
  if (hasSecrets) {
    add(
      tasksMention(p, /env|environment variable|secret|api key|backend|server|api route/i)
        ? { id: 'secrets', area: 'Security', status: 'pass', title: 'Secret keys handled on the backend', why: 'Keys in frontend code can be stolen and misused.', recommendation: 'Never commit .env files to GitHub.' }
        : { id: 'secrets', area: 'Security', status: 'fail', title: 'No plan for protecting API keys', why: 'Putting API keys in browser code exposes them to anyone.', recommendation: 'Add a task to call external APIs from a backend route using environment variables.' },
    );
  }
  add(
    tasksMention(p, /validat|sanitiz|error/i)
      ? { id: 'validation', area: 'Security', status: 'pass', title: 'Input validation / error handling planned', why: 'Bad input is a common cause of crashes and attacks.', recommendation: 'Validate on the server as well as the form.' }
      : { id: 'validation', area: 'Security', status: 'warn', title: 'No task for input validation or error handling', why: 'Unvalidated input causes crashes and security issues.', recommendation: 'Add a task to validate forms and handle errors gracefully.' },
  );

  // 6. Database & integrations
  if (b.database.length) {
    add(
      tasksMention(p, /database|table|schema|supabase|sql|firebase|mongo/i)
        ? { id: 'db', area: 'Database', status: 'pass', title: 'Database setup is in the roadmap', why: 'Data needs a home before features can save it.', recommendation: 'Back up the schema as a SQL file in your repo.' }
        : { id: 'db', area: 'Database', status: 'warn', title: 'Database tables planned but no setup task', why: 'Features that save data will be blocked.', recommendation: 'Add a task to create the tables listed in the blueprint.' },
    );
  }
  const required = b.integrations.filter((i) => i.required);
  if (required.length) {
    const missing = required.filter((i) => !tasksMention(p, new RegExp(i.name.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')));
    add(
      missing.length === 0
        ? { id: 'integrations', area: 'Integrations', status: 'pass', title: 'Required integrations have tasks', why: 'Integrations often take longer than expected.', recommendation: 'Check free-tier limits for each service.' }
        : { id: 'integrations', area: 'Integrations', status: 'warn', title: `No task found for: ${missing.map((m) => m.name).join(', ')}`, why: 'Required integrations without tasks are easy to forget.', recommendation: 'Add a task for each required integration.' },
    );
  }

  // 7. Testing & deployment
  add(
    tasksMention(p, /test/i)
      ? { id: 'tests', area: 'Testing', status: 'pass', title: 'Testing is planned', why: 'Testing catches problems before users do.', recommendation: 'Test on a real phone as well as a laptop.' }
      : { id: 'tests', area: 'Testing', status: 'fail', title: 'No testing tasks', why: 'Untested apps usually break in front of users.', recommendation: 'Add tasks to test the full user journey and error cases.' },
  );
  add(
    tasksMention(p, /deploy|hosting|vercel|netlify|render|publish|release/i)
      ? { id: 'deploy', area: 'Deployment', status: 'pass', title: 'Deployment is planned', why: 'A live app is what users and reviewers can see.', recommendation: 'Deploy early and often, not only at the end.' }
      : { id: 'deploy', area: 'Deployment', status: 'fail', title: 'No deployment task', why: 'Projects without a deployment plan often stay on one laptop.', recommendation: 'Add a task to deploy and configure environment variables.' },
  );

  // 8. Progress before deployment
  const st = computeStats(p.tasks);
  if (st.total) {
    const openHigh = p.tasks.filter((t) => t.priority === 'high' && t.status !== 'done').length;
    add(
      openHigh === 0
        ? { id: 'progress', area: 'Progress', status: 'pass', title: 'All high-priority tasks complete', why: 'Core functionality should be finished before launch.', recommendation: 'Run a final end-to-end test before sharing the link.' }
        : { id: 'progress', area: 'Progress', status: 'warn', title: `${openHigh} high-priority task(s) still open`, why: 'Launching before core tasks are done leads to a broken first impression.', recommendation: 'Finish high-priority tasks before deploying publicly.' },
    );
  }

  const weight = { pass: 1, warn: 0.5, fail: 0 } as const;
  const score = checks.length ? Math.round((checks.reduce((a, c) => a + weight[c.status], 0) / checks.length) * 100) : 0;
  const fails = checks.filter((c) => c.status === 'fail').length;
  const level: ReadinessResult['level'] =
    fails > 0 ? 'Needs work' : score < 75 ? 'Getting there' : st.total && st.done === st.total ? 'Ready to deploy' : 'Ready to build';

  return { score, level, checks, estimatedHours: est, availableHours: available };
}

export const DEPLOYMENT_CHECKLIST = [
  'All high-priority tasks are completed',
  'Full user journey tested on desktop and mobile',
  'Error states show friendly messages (no blank screens)',
  'Secret keys are only in environment variables, never in code or GitHub',
  'Database access rules tested with two different accounts',
  'Environment variables added in the hosting dashboard',
  'Production build runs without errors',
  'A README explains how to run and deploy the project',
];
