import { useState } from 'react';
import type { WorkspaceProps } from './Types';
import { useApp } from './AppContext';
import { copyText, exportJson, exportMarkdown, exportPdf, slugify } from './ExportService';
import { shareSummary } from './ProjectService';
import { Notice, Spinner } from './UI';

export function ExportPanel({ project }: WorkspaceProps) {
  const { toast } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const summary = shareSummary(project);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const act = async (key: string, fn: () => Promise<void> | void, success: string) => {
    setBusy(key);
    try {
      await fn();
      toast(success, 'success');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // user cancelled share sheet
      toast(e instanceof Error ? `${e.message}` : 'That did not work. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="export">
      <div className="export-grid">
        <section className="card export-card">
          <h2>PDF document</h2>
          <p className="muted">Formatted blueprint and roadmap with headings, features, tech stack and task checklist. Good for mentors and reviews.</p>
          <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void act('pdf', () => exportPdf(project), 'PDF downloaded.')}>
            {busy === 'pdf' ? <Spinner label="Building PDF..." /> : 'Download PDF'}
          </button>
        </section>
        <section className="card export-card">
          <h2>Markdown</h2>
          <p className="muted">Paste into GitHub README, Notion or Google Docs. Task checkboxes are preserved.</p>
          <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => void act('md', () => exportMarkdown(project), 'Markdown downloaded.')}>
            Download .md
          </button>
        </section>
        <section className="card export-card">
          <h2>Project backup</h2>
          <p className="muted">A JSON file with everything, including chat and progress. Import it later from Settings.</p>
          <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => void act('json', () => exportJson([project], `${slugify(project.input.name)}-backup.json`), 'Backup downloaded.')}>
            Download backup
          </button>
        </section>
      </div>

      <section className="card">
        <h2>Share a summary</h2>
        <p className="muted">
          Only the public summary below is shared: title, overview, essential features, tech stack and progress. Your chat history, clarification answers,
          settings and any keys are never included.
        </p>
        <pre className="share-preview">{summary}</pre>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void act('copy', () => copyText(summary), 'Summary copied to clipboard.')}>
            Copy summary
          </button>
          {canShare && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy !== null}
              onClick={() => void act('share', () => navigator.share({ title: project.input.name, text: summary }), 'Shared.')}
            >
              Share...
            </button>
          )}
        </div>
        <Notice kind="info">Public share links are not available: projects are private to your browser or account.</Notice>
      </section>
    </div>
  );
}
