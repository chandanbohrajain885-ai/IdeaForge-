import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from './AppContext';
import { Logo } from './UI';

const ONBOARD_KEY = 'ideaforge.onboarded';

export function hasOnboarded(): boolean {
  try {
    return window.localStorage.getItem(ONBOARD_KEY) === '1';
  } catch {
    return false;
  }
}

function markOnboarded(): void {
  try {
    window.localStorage.setItem(ONBOARD_KEY, '1');
  } catch {
    /* ignore */
  }
}

const STEPS = [
  {
    title: 'Describe your idea',
    text: 'Write your idea in your own words: the problem, who it is for, and how much time you have. Unsure about something? Leave it blank.',
  },
  {
    title: 'Get a project blueprint',
    text: 'IdeaForge asks up to three short questions if needed, then creates a plan: features for version 1, screens, technology choices and architecture.',
  },
  {
    title: 'Follow your roadmap',
    text: 'Your project is split into phases and small tasks in the right order. Click "Help Me Build This" on any task for step-by-step guidance.',
  },
  {
    title: 'Track progress to deployment',
    text: 'Mark tasks as you go, ask the project assistant when stuck, run the readiness check and export your plan as PDF.',
  },
];

export function Landing() {
  const navigate = useNavigate();
  const { aiLive, health, supabaseConfigured, user } = useApp();
  const start = () => navigate(hasOnboarded() ? '/new' : '/welcome');

  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo size={40} />
        <div className="landing-nav-actions">
          {supabaseConfigured && !user && (
            <Link to="/login" className="btn btn-ghost">
              Sign in
            </Link>
          )}
          <Link to="/dashboard" className="btn btn-secondary">
            Open dashboard
          </Link>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Inera School of Intelligence</p>
          <h1>Turn your idea into a project you can actually finish.</h1>
          <p className="lead">
            IdeaForge AI helps students and beginners go from a rough idea to a clear project plan, the right technology, small daily tasks and a
            deployed application - with a mentor-style assistant at every step.
          </p>
          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={start}>
              Start Building
            </button>
            <button type="button" className="btn btn-ghost btn-lg" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>
              How it works
            </button>
          </div>
          <p className="hero-note">
            No account needed to explore.{' '}
            {health && !aiLive && 'AI is not configured on this deployment yet, so you will see clearly-labelled sample plans (demo mode).'}
          </p>
        </div>
        <div className="hero-card" aria-hidden="true">
          <div className="hc-row">
            <span className="hc-label">Idea</span>
            <p>"An app that helps hostel students split monthly expenses fairly."</p>
          </div>
          <div className="hc-arrow">↓</div>
          <div className="hc-row">
            <span className="hc-label">Blueprint</span>
            <ul>
              <li>4 essential features for version 1</li>
              <li>React + Supabase, chosen for a beginner</li>
              <li>3 database tables, 5 screens</li>
            </ul>
          </div>
          <div className="hc-arrow">↓</div>
          <div className="hc-row">
            <span className="hc-label">Roadmap</span>
            <div className="hc-progress">
              <div style={{ width: '42%' }} />
            </div>
            <small>8 of 19 tasks complete · Phase: Backend</small>
          </div>
        </div>
      </section>

      <section className="how" id="how">
        <h2>How it works</h2>
        <div className="how-grid">
          {STEPS.map((s, i) => (
            <article key={s.title} className="how-card">
              <span className="how-num">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="features-strip">
        <div>
          <h3>Honest by design</h3>
          <p>The assistant separates facts from suggestions and never claims to have run or tested your code.</p>
        </div>
        <div>
          <h3>Built for beginners</h3>
          <p>Technology is recommended for your experience level, explained in plain language.</p>
        </div>
        <div>
          <h3>Readiness check</h3>
          <p>Spot missing requirements, security gaps, unrealistic timelines and deployment blockers early.</p>
        </div>
      </section>

      <section className="cta">
        <h2>Have an idea? Start with one sentence.</h2>
        <button type="button" className="btn btn-primary btn-lg" onClick={start}>
          Start Building
        </button>
      </section>

      <footer className="landing-foot">
        <span>© {new Date().getFullYear()} Inera School of Intelligence · INERA GROUP (Inera Software Pvt. Ltd.)</span>
      </footer>
    </div>
  );
}

export function Onboarding() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const finish = () => {
    markOnboarded();
    navigate('/new');
  };
  const s = STEPS[step];
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <Logo size={44} />
        <p className="eyebrow">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1>{s.title}</h1>
        <p className="lead">{s.text}</p>
        <div className="dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={i === step ? 'active' : ''} />
          ))}
        </div>
        <div className="onboarding-actions">
          <button type="button" className="btn btn-ghost" onClick={finish}>
            Skip
          </button>
          <div className="spacer" />
          {step > 0 && (
            <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>
              Next
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={finish}>
              Create my first project
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
