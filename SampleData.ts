/**
 * DEMO MODE ONLY.
 * Template-based sample output used when the AI server is not configured.
 * Everything produced here is labelled "Sample" in the UI and is NOT AI-generated.
 */
import type { Blueprint, Phase, Project, ProjectInput, RoadmapResult, Task, TechChoice } from './Types';

const usesAI = (i: ProjectInput) =>
  i.category === 'AI Application' || /\b(ai|gpt|gemini|chatbot|machine learning|ml|llm|recommend|predict)\b/i.test(`${i.idea} ${i.technologies}`);

function firstSentence(text: string, max = 220): string {
  const t = text.trim().replace(/\s+/g, ' ');
  const m = t.match(/^.*?[.!?](?=\s|$)/);
  const cut = m ? m[0] : t;
  return cut.length > max ? `${cut.slice(0, max - 3)}...` : cut;
}

function stackFor(i: ProjectInput): TechChoice[] {
  const pref = i.technologies.trim();
  const prefNote = pref ? ` You mentioned "${pref}" - adjust this if it fits your preference better.` : '';
  const beginner = i.experience === 'beginner' || !i.experience;
  const stack: TechChoice[] = [];
  const p = i.platform;

  if (p.startsWith('Mobile')) {
    stack.push({
      layer: 'Mobile app',
      choice: 'React Native with Expo',
      reason: `One JavaScript codebase for Android and iOS, and Expo lets you test on your phone instantly.${prefNote}`,
      alternatives: 'Flutter (Dart), or a mobile-friendly web app (PWA) to start even simpler',
    });
  } else if (p === 'Desktop') {
    stack.push({
      layer: 'Desktop app',
      choice: beginner ? 'Python with Tkinter' : 'Electron with React',
      reason: `${beginner ? 'Python is beginner-friendly and Tkinter ships with Python.' : 'Lets you reuse web skills to build a desktop app.'}${prefNote}`,
      alternatives: 'Tauri (lighter), or a web app if installation is not essential',
    });
  } else if (p === 'Chatbot / Messaging') {
    stack.push({
      layer: 'Bot',
      choice: 'Telegram Bot API with Node.js',
      reason: `Free, well documented and quick to test from your phone.${prefNote}`,
      alternatives: 'WhatsApp Cloud API (needs business verification), Discord bot',
    });
  } else {
    stack.push({
      layer: 'Frontend',
      choice: 'React + TypeScript with Vite',
      reason: `Most popular way to build web interfaces; huge community and free tutorials.${beginner ? ' Start with plain JavaScript if TypeScript feels heavy.' : ''}${prefNote}`,
      alternatives: 'Plain HTML/CSS/JavaScript for very small projects, Next.js for SEO-heavy sites',
    });
  }

  if (i.category === 'Automation') {
    stack.push({
      layer: 'Automation',
      choice: 'Python scripts scheduled with GitHub Actions',
      reason: 'Python has libraries for almost every automation, and GitHub Actions can run them on a schedule for free.',
      alternatives: 'n8n or Make (no-code), cron jobs on a small server',
    });
  }

  stack.push({
    layer: 'Backend',
    choice: 'Serverless functions (Node.js on Vercel)',
    reason: 'No server to manage; keeps secret keys off the browser; free tier is enough to start.',
    alternatives: 'Express.js on Render, Python FastAPI',
  });
  stack.push({
    layer: 'Database & Auth',
    choice: 'Supabase (PostgreSQL)',
    reason: 'Free tier with database, sign-in and security rules (Row Level Security) in one place.',
    alternatives: 'Firebase, MongoDB Atlas',
  });
  if (usesAI(i)) {
    stack.push({
      layer: 'AI',
      choice: 'Google Gemini API (called only from the backend)',
      reason: 'Has a free tier for learning projects; calling it from the backend keeps your API key secret.',
      alternatives: 'OpenAI API, Anthropic Claude API (paid)',
    });
  }
  stack.push({
    layer: 'Hosting',
    choice: p.startsWith('Mobile') ? 'Expo EAS (app builds) + Vercel (backend)' : 'Vercel',
    reason: 'Connects to GitHub and redeploys automatically on every push.',
    alternatives: 'Netlify, Render',
  });
  return stack;
}

export function sampleBlueprint(i: ProjectInput): Blueprint {
  const ai = usesAI(i);
  const users = i.users.trim() || 'the people who face this problem every day';
  const problem = i.problem.trim() || `People need a simpler way to handle what "${i.name}" addresses.`;
  return {
    title: i.name,
    summary: `${i.name} is ${/^[aeiou]/i.test(i.category) ? 'an' : 'a'} ${i.category.replace(/^AI /, 'AI-powered ').toLowerCase().replace('ai-powered', 'AI-powered')} for ${users}. ${firstSentence(i.idea)} The first version focuses on the core workflow only, so it can be built, tested and shared quickly.`,
    problemStatement: problem,
    solution: `A ${i.platform === 'Not sure yet' ? 'web' : i.platform.toLowerCase()} application where users can complete the main task in a few clear steps${ai ? ', with AI assisting the key step' : ''}, and see their saved results later.`,
    targetAudience: users,
    objectives: [
      'Deliver a working first version that solves the core problem',
      'Keep the interface simple enough for first-time users',
      'Store user data safely and only show users their own data',
      'Deploy online so real users can try it and give feedback',
    ],
    outcomes: [
      'A live, shareable application',
      'Feedback from at least 5 real users',
      'A clear list of improvements for version 2',
    ],
    usefulness: `It turns a common frustration for ${users} into a short, guided process, saving time and reducing mistakes.`,
    features: {
      essential: [
        { name: 'Sign up and sign in', description: 'Users create an account so their data is saved securely.' },
        { name: 'Core workflow', description: `The main action described in your idea: ${firstSentence(i.idea, 140)}` },
        ...(ai ? [{ name: 'AI assistance', description: 'The backend sends the user input to an AI model and shows a clear, readable result.' }] : []),
        { name: 'Saved history', description: 'Users can see, open and delete their previous items.' },
        { name: 'Responsive layout', description: 'Works on phones and laptops.' },
      ],
      recommended: [
        { name: 'Search and filters', description: 'Find older items quickly.' },
        { name: 'Export or share', description: 'Download results as PDF or share a link.' },
        { name: 'Basic analytics', description: 'Count how many people use each feature.' },
      ],
      advanced: [
        { name: 'Team or classroom spaces', description: 'Groups of users can collaborate.' },
        { name: 'Notifications', description: 'Email or push reminders.' },
        { name: 'Admin dashboard', description: 'Manage users and content.' },
      ],
    },
    userJourney: [
      'User opens the app and reads what it does',
      'User signs up or signs in',
      'User starts the main action and fills in the required details',
      ai ? 'The app processes the request with AI and shows the result' : 'The app processes the request and shows the result',
      'User saves the result and can find it later in history',
    ],
    screens: [
      { name: 'Landing page', purpose: 'Explains the app and leads to sign-up.' },
      { name: 'Sign up / Sign in', purpose: 'Account access.' },
      { name: 'Dashboard', purpose: 'Shows saved items and the main call to action.' },
      { name: 'Create / Main action', purpose: 'Form or workspace for the core workflow.' },
      { name: 'Result / Detail', purpose: 'Shows the outcome with options to save, edit or delete.' },
      { name: 'Settings', purpose: 'Profile and preferences.' },
    ],
    techStack: stackFor(i),
    architecture:
      'The frontend (what users see) talks to small backend functions. The backend holds secret keys, validates input and talks to the database' +
      (ai ? ' and the AI service' : '') +
      '. The database stores each user\'s data, and security rules make sure users can only read their own records.',
    architectureFlow: [
      'User fills a form in the frontend',
      'Frontend sends the data to a backend API route',
      'Backend validates the input',
      ...(ai ? ['Backend calls the AI API with a secret key stored in environment variables'] : []),
      'Backend saves the result in the database',
      'Frontend displays the saved result',
    ],
    integrations: [
      { name: 'Supabase Auth', purpose: 'User sign-up and sign-in', required: true },
      ...(ai ? [{ name: 'Gemini API', purpose: 'Generate AI results from user input', required: true }] : []),
    ],
    database: [
      { table: 'profiles', purpose: 'Basic information about each user', fields: ['id (uuid, = auth user id)', 'full_name', 'created_at'] },
      { table: 'items', purpose: 'The main records users create', fields: ['id', 'user_id', 'title', 'content', 'created_at', 'updated_at'] },
    ],
    apis: [
      { method: 'POST', path: '/api/items', purpose: 'Create a new item' },
      { method: 'GET', path: '/api/items', purpose: "List the signed-in user's items" },
      ...(ai ? [{ method: 'POST', path: '/api/generate', purpose: 'Send input to the AI and return a result' }] : []),
    ],
    assumptions: [
      'SAMPLE OUTPUT: this blueprint was produced from a template in demo mode, not by AI.',
      'Assumed a web-first first version with user accounts.',
    ],
  };
}

export function sampleRoadmap(i: ProjectInput): RoadmapResult {
  const ai = usesAI(i);
  const phases: Phase[] = [
    { id: 'P1', name: 'Planning', goal: 'Lock the scope of version 1.' },
    { id: 'P2', name: 'Interface Design', goal: 'Sketch every screen before coding.' },
    { id: 'P3', name: 'Frontend', goal: 'Build the screens users interact with.' },
    { id: 'P4', name: 'Backend & Database', goal: 'Store data safely and add sign-in.' },
    ...(ai ? [{ id: 'P5', name: 'AI Implementation', goal: 'Connect the AI service securely.' }] : []),
    { id: 'P6', name: 'Testing', goal: 'Find and fix problems before users do.' },
    { id: 'P7', name: 'Deployment', goal: 'Put the app online.' },
  ];
  const raw: Omit<Task, 'status'>[] = [
    { id: 'T1', phase: 'P1', title: 'Write a one-page project brief', description: 'Write the problem, target users and the 3-5 essential features in a short document.', expectedResult: 'A one-page brief everyone on the team agrees with.', priority: 'high', effort: '1-2 hours', dependencies: [] },
    { id: 'T2', phase: 'P1', title: 'Set up GitHub repository', description: 'Create a GitHub account (if needed) and a new repository with a README.', expectedResult: 'An empty repository you can push code to.', priority: 'high', effort: '1 hour', dependencies: [] },
    { id: 'T3', phase: 'P2', title: 'Sketch all main screens', description: 'Draw each screen from the blueprint on paper or in Figma, including buttons and form fields.', expectedResult: 'A sketch for every main screen.', priority: 'medium', effort: '2-4 hours', dependencies: ['T1'] },
    { id: 'T4', phase: 'P3', title: 'Create the frontend project', description: 'Create a new project with the recommended frontend tool and run it locally.', expectedResult: 'The starter app opens in your browser.', priority: 'high', effort: '1-2 hours', dependencies: ['T2'] },
    { id: 'T5', phase: 'P3', title: 'Build layout and navigation', description: 'Add a header, navigation and empty pages for every screen.', expectedResult: 'You can click between all screens.', priority: 'high', effort: '3-5 hours', dependencies: ['T3', 'T4'] },
    { id: 'T6', phase: 'P3', title: 'Build the main form with validation', description: 'Create the form for the core workflow and show helpful errors for missing fields.', expectedResult: 'The form prevents empty or invalid submissions.', priority: 'high', effort: '4-6 hours', dependencies: ['T5'] },
    { id: 'T7', phase: 'P4', title: 'Create Supabase project and tables', description: 'Create a free Supabase project and the tables listed in the blueprint.', expectedResult: 'Tables visible in the Supabase dashboard.', priority: 'high', effort: '2-3 hours', dependencies: ['T1'] },
    { id: 'T8', phase: 'P4', title: 'Enable Row Level Security policies', description: 'Turn on RLS and add policies so users can only read and change their own rows.', expectedResult: 'A second test user cannot see the first user\'s data.', priority: 'high', effort: '2-3 hours', dependencies: ['T7'] },
    { id: 'T9', phase: 'P4', title: 'Add sign-up and sign-in', description: 'Connect Supabase Auth to sign-up, sign-in and sign-out screens.', expectedResult: 'You can create an account, sign out and sign back in.', priority: 'high', effort: '4-6 hours', dependencies: ['T5', 'T7'] },
    { id: 'T10', phase: 'P4', title: 'Save and list user items', description: 'Save form results to the database and show them on the dashboard.', expectedResult: 'Saved items appear after a page refresh.', priority: 'high', effort: '4-6 hours', dependencies: ['T6', 'T8', 'T9'] },
    ...(ai
      ? [
          { id: 'T11', phase: 'P5', title: 'Create a secure AI API route', description: 'Create a backend function that reads the AI key from an environment variable and calls the AI API.', expectedResult: 'Calling the route returns an AI answer; the key never appears in browser code.', priority: 'high' as const, effort: '3-5 hours', dependencies: ['T4'] },
          { id: 'T12', phase: 'P5', title: 'Show AI results in the interface', description: 'Call the AI route from the form, show a loading state and display the result clearly, with error messages on failure.', expectedResult: 'Users see a readable AI result or a friendly error.', priority: 'high' as const, effort: '3-4 hours', dependencies: ['T6', 'T11'] },
        ]
      : []),
    { id: 'T13', phase: 'P6', title: 'Test the full user journey', description: 'Walk through every step as a new user on desktop and mobile; write down each bug.', expectedResult: 'A bug list, with critical bugs fixed.', priority: 'high', effort: '3-4 hours', dependencies: ai ? ['T10', 'T12'] : ['T10'] },
    { id: 'T14', phase: 'P6', title: 'Test error cases', description: 'Try empty inputs, wrong passwords, no internet and very long text.', expectedResult: 'The app shows clear messages instead of crashing.', priority: 'medium', effort: '2 hours', dependencies: ['T13'] },
    { id: 'T15', phase: 'P7', title: 'Deploy to hosting', description: 'Connect the GitHub repo to the host, add environment variables and deploy.', expectedResult: 'A live URL that works.', priority: 'high', effort: '2-3 hours', dependencies: ['T13'] },
    { id: 'T16', phase: 'P7', title: 'Collect feedback from 5 users', description: 'Share the link with 5 target users and note what confused them.', expectedResult: 'A written list of improvements for version 2.', priority: 'medium', effort: '1 week (part-time)', dependencies: ['T15'] },
  ];
  const tasks: Task[] = raw.map((t) => ({ ...t, status: 'todo' }));
  return {
    phases,
    tasks,
    totalEstimate: ai ? 'About 50-70 hours for a beginner (roughly 4-6 weeks part-time)' : 'About 40-60 hours for a beginner (roughly 3-5 weeks part-time)',
    timelineNote: 'Sample estimate from a template. Real effort depends on your experience and how much time you can give each week.',
  };
}

export function sampleBuildGuide(project: Project, task: Task): string {
  const stack = project.blueprint.techStack.map((t) => `- **${t.layer}:** ${t.choice}`).join('\n');
  return `> **Sample guidance (demo mode).** AI is not configured, so this is a generic template - not a tailored guide.

## What you will do
${task.description || task.title}

## Why this matters
Finishing this task moves your project closer to: ${task.expectedResult || 'the next working milestone'}.

## Before you start
${task.dependencies.length ? `Finish these tasks first: ${task.dependencies.join(', ')}.` : 'No earlier tasks are required.'}

Your planned stack:
${stack || '- Not defined yet'}

## Step-by-step instructions
1. Re-read the task and write down, in one sentence, what "done" means.
2. Search the official documentation of your chosen tool for this exact step.
3. Make the smallest change that works, then run the app to check it.
4. Commit your work to GitHub with a clear message.

## How to test it
Check that this is true: **${task.expectedResult || 'the feature works as described'}**.

## Done looks like
The expected result above works on both desktop and mobile without errors in the browser console.

*Configure the AI provider (see Settings) to get a tailored guide with code for this exact task.*`;
}

export function sampleAssistantReply(question: string): string {
  return `> **Demo mode - not an AI answer.** The AI provider is not configured on the server, so I cannot analyse your question yet.

You asked: "${question.slice(0, 200)}${question.length > 200 ? '...' : ''}"

**What you can do now**
- Use the **Roadmap** tab to follow your tasks and update their status.
- Use the **Readiness** tab - its rule-based checks work without AI.
- Ask your administrator to add an AI key (for example \`GEMINI_API_KEY\`) in Vercel environment variables, then redeploy.`;
}
