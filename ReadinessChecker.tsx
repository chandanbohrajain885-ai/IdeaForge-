import { useMemo, useState } from 'react';
import type { WorkspaceProps } from './Types';
import { useApp } from './AppContext';
import { aiReview } from './AIService';
import { DEPLOYMENT_CHECKLIST, runReadinessChecks, type CheckStatus } from './Readiness';
import { Notice, PriorityBadge, Spinner, timeAgo } from './UI';

const STATUS_ICON: Record<CheckStatus, string> = { pass: '✓', warn: '!', fail: '×' };

export function ReadinessChecker({ project, update, goTab }: WorkspaceProps) {
  const { aiLive, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const result = useMemo(() => runReadinessChecks(project), [project]);
  const review = project.review;

  const checklist = useMemo(() => {
    const items = [...DEPLOYMENT_CHECKLIST, ...(review?.checklist ?? [])];
    return Array.from(new Set(items.map((i) => i.trim()).filter(Boolean)));
  }, [review]);

  const toggle = (item: string) =>
    void update((p) => ({
      ...p,
      checklistDone: p.checklistDone.includes(item) ? p.checklistDone.filter((x) => x !== item) : [...p.checklistDone, item],
    }));

  const runAi = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await aiReview(project);
      const ok = await update((p) => ({ ...p, review: r }));
      if (ok) toast('AI review complete.', 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The AI review failed.');
    } finally {
      setBusy(false);
    }
  };

  const doneCount = checklist.filter((c) => project.checklistDone.includes(c)).length;
  const order: CheckStatus[] = ['fail', 'warn', 'pass'];
  const sorted = [...result.checks].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));

  return (
    <div className="readiness">
      <Notice kind="info">
        Readiness checks are guidance to help you spot gaps. They do not guarantee that your project is secure, correct or production-ready.
      </Notice>

      <div className="ov-grid">
        <section className="card score-card">
          <h2>Plan readiness</h2>
          <div className={`score-ring lvl-${result.score >= 75 ? 'good' : result.score >= 50 ? 'mid' : 'low'}`}>
            <span>{result.score}</span>
            <small>/100</small>
          </div>
          <p className="score-level">{result.level}</p>
          <p className="muted small">
            {result.checks.filter((c) => c.status === 'fail').length} problems · {result.checks.filter((c) => c.status === 'warn').length} warnings ·{' '}
            {result.checks.filter((c) => c.status === 'pass').length} passed
          </p>
          {result.estimatedHours !== null && (
            <p className="muted small">
              Estimated work: ~{result.estimatedHours} h{result.availableHours !== null && ` · Time available: ~${result.availableHours} h (at 15 h/week)`}
            </p>
          )}
        </section>

        <section className="card">
          <h2>Deeper AI review</h2>
          <p className="muted">The AI reviews your full plan for missing requirements, unclear goals, security gaps, unnecessary features and deployment preparation.</p>
          {review && (
            <div className="ai-review-summary">
              <div className="ai-score">
                <strong>{review.score}/100</strong>
                <span className="muted small">AI review · {timeAgo(review.createdAt)}</span>
              </div>
              <p>{review.summary}</p>
            </div>
          )}
          {error && <Notice kind="error">{error}</Notice>}
          <button type="button" className="btn btn-primary" onClick={() => void runAi()} disabled={busy || !aiLive}>
            {busy ? <Spinner label="Reviewing..." /> : review ? 'Run AI review again' : 'Run AI review'}
          </button>
          {!aiLive && <p className="muted small">Requires AI configuration. The rule-based checks below still work.</p>}
        </section>
      </div>

      <section className="card">
        <h2>Rule-based checks</h2>
        <ul className="checks">
          {sorted.map((c) => (
            <li key={c.id} className={`check-item ci-${c.status}`}>
              <span className="ci-icon" aria-label={c.status}>
                {STATUS_ICON[c.status]}
              </span>
              <div>
                <div className="ci-title">
                  <strong>{c.title}</strong>
                  <span className="badge">{c.area}</span>
                </div>
                <p className="small">
                  <span className="muted">Why it matters:</span> {c.why}
                </p>
                <p className="small">
                  <span className="muted">Recommendation:</span> {c.recommendation}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => goTab('blueprint')}>
            Improve blueprint
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => goTab('roadmap')}>
            Add missing tasks
          </button>
        </div>
      </section>

      {review && review.issues.length > 0 && (
        <section className="card">
          <h2>AI-identified issues</h2>
          <p className="muted small">AI suggestions - verify them against your own understanding of the project.</p>
          <ul className="issues">
            {review.issues.map((i, idx) => (
              <li key={idx}>
                <div className="ci-title">
                  <PriorityBadge priority={i.severity} />
                  <strong>{i.problem}</strong>
                  <span className="badge">{i.area}</span>
                </div>
                {i.why && (
                  <p className="small">
                    <span className="muted">Why it matters:</span> {i.why}
                  </p>
                )}
                {i.recommendation && (
                  <p className="small">
                    <span className="muted">Recommendation:</span> {i.recommendation}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Before you deploy</h2>
          <span className="muted small">
            {doneCount}/{checklist.length} done
          </span>
        </div>
        <ul className="deploy-list">
          {checklist.map((item, i) => (
            <li key={item}>
              <label htmlFor={`dc-${i}`}>
                <input id={`dc-${i}`} type="checkbox" checked={project.checklistDone.includes(item)} onChange={() => toggle(item)} />
                <span>{item}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
