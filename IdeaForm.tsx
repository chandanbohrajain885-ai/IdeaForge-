import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Clarification, ProjectInput } from './Types';
import { CATEGORIES, EMPTY_INPUT, EXPERIENCE_LEVELS, PLATFORMS } from './Types';
import { useApp } from './AppContext';
import { aiBlueprint, aiClarify, aiRoadmap } from './AIService';
import { createProject, saveProject } from './ProjectService';
import { sampleBlueprint, sampleRoadmap } from './SampleData';
import { Field, Notice, Spinner } from './UI';
import { LIMITS, localClarificationQuestions, validateInput, type FieldErrors } from './Validation';

const DRAFT_KEY = 'ideaforge.draft';

function loadDraft(): ProjectInput {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return { ...EMPTY_INPUT };
    const d = JSON.parse(raw) as Partial<ProjectInput>;
    const out = { ...EMPTY_INPUT };
    (Object.keys(EMPTY_INPUT) as (keyof ProjectInput)[]).forEach((k) => {
      if (typeof d[k] === 'string') (out as unknown as Record<string, string>)[k] = d[k] as string;
    });
    if (!['beginner', 'intermediate', 'advanced', ''].includes(out.experience)) out.experience = '';
    return out;
  } catch {
    return { ...EMPTY_INPUT };
  }
}

function saveDraft(input: ProjectInput | null): void {
  try {
    if (input) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(input));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

type Stage = 'form' | 'checking' | 'clarify' | 'generating';

const FIELD_ORDER: (keyof ProjectInput)[] = ['name', 'idea', 'problem', 'users', 'category', 'platform', 'experience', 'technologies', 'budget', 'timeline'];

export function IdeaForm() {
  const { aiLive, health, user, toast, setLastProjectId } = useApp();
  const navigate = useNavigate();
  const [input, setInput] = useState<ProjectInput>(loadDraft);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [stage, setStage] = useState<Stage>('form');
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [genStep, setGenStep] = useState(0);
  const [failure, setFailure] = useState('');
  const busyRef = useRef(false);
  const live = aiLive;
  const needsSignIn = Boolean(health?.authRequired && !user && live);

  useEffect(() => {
    const t = setTimeout(() => saveDraft(input), 400);
    return () => clearTimeout(t);
  }, [input]);

  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => {
    setInput((prev) => ({ ...prev, [k]: v }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const describedBy = (k: keyof ProjectInput, hint = true) =>
    [hint ? `${k}-hint` : '', errors[k] ? `${k}-error` : ''].filter(Boolean).join(' ') || undefined;

  const generate = async (clarifications: Clarification[]) => {
    setStage('generating');
    setFailure('');
    setGenStep(0);
    try {
      if (live) {
        const blueprint = await aiBlueprint(input, clarifications);
        setGenStep(1);
        let roadmap = null;
        let roadmapError = '';
        try {
          roadmap = await aiRoadmap(input, clarifications, blueprint);
        } catch (e) {
          roadmapError = e instanceof Error ? e.message : 'Roadmap generation failed.';
        }
        setGenStep(2);
        const saved = await saveProject(createProject(input, clarifications, blueprint, roadmap, 'ai'));
        saveDraft(null);
        setLastProjectId(saved.id);
        if (roadmapError) toast(`Blueprint saved, but the roadmap failed: ${roadmapError} You can retry from the Roadmap tab.`, 'error');
        else toast('Your project plan is ready.', 'success');
        navigate(`/projects/${saved.id}`);
      } else {
        const blueprint = sampleBlueprint(input);
        setGenStep(1);
        const roadmap = sampleRoadmap(input);
        setGenStep(2);
        const saved = await saveProject(createProject(input, clarifications, blueprint, roadmap, 'sample'));
        saveDraft(null);
        setLastProjectId(saved.id);
        toast('Sample plan created (demo mode - not AI-generated).', 'info');
        navigate(`/projects/${saved.id}`);
      }
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Something went wrong while generating your plan.');
      setStage(questions.length ? 'clarify' : 'form');
    } finally {
      busyRef.current = false;
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busyRef.current) return;
    const errs = validateInput(input);
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = FIELD_ORDER.find((k) => errs[k]);
      if (first) document.getElementById(first)?.focus();
      return;
    }
    busyRef.current = true;
    setFailure('');
    let qs: string[] = [];
    if (live) {
      setStage('checking');
      try {
        qs = await aiClarify(input);
      } catch (err) {
        busyRef.current = false;
        setStage('form');
        setFailure(err instanceof Error ? err.message : 'Could not check your idea.');
        return;
      }
    } else {
      qs = localClarificationQuestions(input);
    }
    if (qs.length) {
      setQuestions(qs);
      setAnswers(qs.map(() => ''));
      setStage('clarify');
      busyRef.current = false;
      return;
    }
    await generate([]);
  };

  const submitClarifications = async (skip: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const clar: Clarification[] = skip
      ? []
      : questions.map((q, i) => ({ question: q, answer: (answers[i] ?? '').trim() })).filter((c) => c.answer.length > 0);
    await generate(clar);
  };

  if (stage === 'generating' || stage === 'checking') {
    const steps = stage === 'checking' ? ['Checking whether your idea needs clarification'] : ['Creating your project blueprint', 'Building your development roadmap', 'Saving your project'];
    return (
      <div className="page narrow">
        <div className="card gen-card" aria-live="polite">
          <h1>{stage === 'checking' ? 'Reading your idea...' : live ? 'Generating your plan with AI' : 'Preparing a sample plan'}</h1>
          <p className="muted">
            {stage === 'checking'
              ? 'This takes a few seconds.'
              : live
                ? 'This usually takes 20-60 seconds. Please keep this tab open.'
                : 'Demo mode: this plan comes from a template, not AI.'}
          </p>
          <ol className="gen-steps">
            {steps.map((s, i) => {
              const state = stage === 'checking' ? 'active' : i < genStep ? 'done' : i === genStep ? 'active' : 'waiting';
              return (
                <li key={s} className={state}>
                  <span className="gen-icon" aria-hidden="true">
                    {state === 'done' ? '✓' : state === 'active' ? <span className="spinner sm" /> : i + 1}
                  </span>
                  {s}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    );
  }

  if (stage === 'clarify') {
    return (
      <div className="page narrow">
        <div className="page-head">
          <div>
            <p className="eyebrow">Quick check · {input.name}</p>
            <h1>A few questions about your idea</h1>
            <p className="muted">
              {live ? 'Answering helps the AI plan something that fits.' : 'Demo mode: these are standard questions, not AI-generated.'} Skip any you are
              unsure about.
            </p>
          </div>
        </div>
        {failure && (
          <Notice kind="error" title="Generation failed">
            {failure}
          </Notice>
        )}
        <div className="card">
          {questions.map((q, i) => (
            <div className="field" key={q}>
              <label htmlFor={`q${i}`}>
                {i + 1}. {q}
              </label>
              <textarea
                id={`q${i}`}
                rows={2}
                maxLength={1000}
                value={answers[i] ?? ''}
                onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder="Your answer (optional)"
              />
            </div>
          ))}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setStage('form')}>
              Back to idea
            </button>
            <div className="spacer" />
            <button type="button" className="btn btn-secondary" onClick={() => submitClarifications(true)}>
              Skip and generate
            </button>
            <button type="button" className="btn btn-primary" onClick={() => submitClarifications(false)}>
              Generate my plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <p className="eyebrow">New project</p>
          <h1>Describe your idea</h1>
          <p className="muted">Fields marked * are required. Everything else is optional - leave it blank if you are unsure.</p>
        </div>
      </div>

      {!live && health && (
        <Notice kind="warn" title="Demo mode">
          AI is not configured, so you will get a clearly-labelled sample plan built from templates. <Link to="/settings">How to enable AI</Link>
        </Notice>
      )}
      {needsSignIn && (
        <Notice kind="warn" title="Sign in required">
          This deployment requires an account for AI features. <Link to="/login">Sign in or create an account</Link>.
        </Notice>
      )}
      {failure && (
        <Notice kind="error" title="Something went wrong">
          {failure}
        </Notice>
      )}
      {Object.keys(errors).some((k) => errors[k as keyof ProjectInput]) && (
        <Notice kind="error">Please fix the highlighted fields below.</Notice>
      )}

      <form className="card form" onSubmit={onSubmit} noValidate>
        <h2 className="form-section">Your idea</h2>
        <Field label="Project name" htmlFor="name" required error={errors.name} counter={`${input.name.length}/${LIMITS.name}`}>
          <input id="name" value={input.name} maxLength={LIMITS.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} aria-describedby={describedBy('name', false)} placeholder="e.g. HostelSplit" autoComplete="off" />
        </Field>
        <Field label="Describe your idea" htmlFor="idea" required hint="In your own words. What should it do?" error={errors.idea} counter={`${input.idea.length}/${LIMITS.idea}`}>
          <textarea id="idea" rows={5} value={input.idea} maxLength={LIMITS.idea} onChange={(e) => set('idea', e.target.value)} aria-invalid={!!errors.idea} aria-describedby={describedBy('idea')} placeholder="e.g. An app where hostel roommates add shared expenses and it calculates who owes whom at month end." />
        </Field>
        <Field label="What problem does it solve?" htmlFor="problem" hint="What is difficult or annoying today?" error={errors.problem}>
          <textarea id="problem" rows={3} value={input.problem} maxLength={LIMITS.problem} onChange={(e) => set('problem', e.target.value)} aria-describedby={describedBy('problem')} />
        </Field>
        <Field label="Who will use it?" htmlFor="users" hint="e.g. college students, teachers, small shop owners" error={errors.users}>
          <input id="users" value={input.users} maxLength={LIMITS.users} onChange={(e) => set('users', e.target.value)} aria-describedby={describedBy('users')} />
        </Field>

        <h2 className="form-section">Project type</h2>
        <div className="grid-2">
          <Field label="Category" htmlFor="category" required error={errors.category}>
            <select id="category" value={input.category} onChange={(e) => set('category', e.target.value)} aria-invalid={!!errors.category} aria-describedby={describedBy('category', false)}>
              <option value="">Select a category</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Target platform" htmlFor="platform" required error={errors.platform}>
            <select id="platform" value={input.platform} onChange={(e) => set('platform', e.target.value)} aria-invalid={!!errors.platform} aria-describedby={describedBy('platform', false)}>
              <option value="">Select a platform</option>
              {PLATFORMS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset className={`field ${errors.experience ? 'has-error' : ''}`} aria-describedby={errors.experience ? 'experience-error' : undefined}>
          <legend>
            Your experience level <span className="req" aria-hidden="true">*</span>
          </legend>
          <div className="radio-cards">
            {EXPERIENCE_LEVELS.map((lvl, idx) => (
              <label key={lvl.value} className={`radio-card ${input.experience === lvl.value ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="experience"
                  id={idx === 0 ? 'experience' : undefined}
                  value={lvl.value}
                  checked={input.experience === lvl.value}
                  onChange={() => set('experience', lvl.value)}
                />
                <span>
                  <strong>{lvl.label}</strong>
                  <small>{lvl.hint}</small>
                </span>
              </label>
            ))}
          </div>
          {errors.experience && (
            <p className="field-error" id="experience-error" role="alert">
              {errors.experience}
            </p>
          )}
        </fieldset>

        <h2 className="form-section">Preferences & constraints</h2>
        <Field label="Preferred languages or technologies" htmlFor="technologies" hint="e.g. Python, React, Flutter - or leave blank for a recommendation" error={errors.technologies}>
          <input id="technologies" value={input.technologies} maxLength={LIMITS.technologies} onChange={(e) => set('technologies', e.target.value)} aria-describedby={describedBy('technologies')} />
        </Field>
        <div className="grid-2">
          <Field label="Available budget" htmlFor="budget" hint="e.g. Free tools only, ₹2,000/month" error={errors.budget}>
            <input id="budget" value={input.budget} maxLength={LIMITS.budget} onChange={(e) => set('budget', e.target.value)} aria-describedby={describedBy('budget')} />
          </Field>
          <Field label="Expected completion time" htmlFor="timeline" hint="e.g. 6 weeks, 2 months" error={errors.timeline}>
            <input id="timeline" value={input.timeline} maxLength={LIMITS.timeline} onChange={(e) => set('timeline', e.target.value)} aria-describedby={describedBy('timeline')} />
          </Field>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setInput({ ...EMPTY_INPUT });
              setErrors({});
              saveDraft(null);
            }}
          >
            Clear form
          </button>
          <div className="spacer" />
          <button type="submit" className="btn btn-primary btn-lg" disabled={health === null}>
            {health === null ? <Spinner label="Connecting..." /> : live ? 'Generate project plan' : 'Generate sample plan'}
          </button>
        </div>
        <p className="hint center">Your draft is saved automatically in this browser.</p>
      </form>
    </div>
  );
}
