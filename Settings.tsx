import { useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from './AppContext';
import { exportJson } from './ExportService';
import { clearLocalProjects, copyLocalToCloud, importProjects, listLocalProjects, listProjects } from './ProjectService';
import { ConfirmDialog, Notice, Spinner } from './UI';

export function Settings() {
  const { health, aiLive, refreshHealth, supabaseConfigured, user, storage, toast, signOut, setLastProjectId } = useApp();
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const localCount = storage === 'cloud' ? listLocalProjects().length : 0;

  const recheck = async () => {
    setChecking(true);
    await refreshHealth();
    setChecking(false);
  };

  const backupAll = async () => {
    setBusy(true);
    try {
      const all = await listProjects();
      if (!all.length) {
        toast('There are no projects to back up.', 'info');
        return;
      }
      exportJson(all, `ideaforge-backup-${new Date().toISOString().slice(0, 10)}.json`);
      toast(`Backup of ${all.length} project(s) downloaded.`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Backup failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5_000_000) {
      toast('That file is too large (max 5 MB).', 'error');
      return;
    }
    setBusy(true);
    try {
      const n = await importProjects(await file.text());
      toast(`Imported ${n} project(s).`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copyToCloud = async () => {
    setBusy(true);
    try {
      const n = await copyLocalToCloud();
      toast(n ? `Copied ${n} project(s) to your account.` : 'No browser projects to copy.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Copy failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const clearLocal = () => {
    try {
      clearLocalProjects();
      setLastProjectId(null);
      toast('Projects saved in this browser were deleted.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not clear data.', 'error');
    }
    setConfirmClear(false);
  };

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Settings & status</h1>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>AI connection</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void recheck()} disabled={checking}>
            {checking ? <Spinner label="Checking..." /> : 'Check again'}
          </button>
        </div>
        {health === null ? (
          <Spinner label="Checking..." />
        ) : aiLive ? (
          <Notice kind="success" title="AI is configured">
            Provider: <strong>{health.provider}</strong>
            {health.model && (
              <>
                {' '}
                · Model: <code>{health.model}</code>
              </>
            )}
            {health.authRequired && <> · Sign-in required for AI</>}
            <br />
            This only confirms a key is set on the server. If generation fails, the key may be invalid or out of quota.
          </Notice>
        ) : (
          <Notice kind="warn" title={health.reachable ? 'Demo mode - AI not configured' : 'AI server not reachable'}>
            {health.message}
          </Notice>
        )}
        {!aiLive && (
          <ol className="setup-steps">
            <li>
              Get a free Gemini API key at <code>aistudio.google.com/apikey</code> (or use an OpenAI / Anthropic key).
            </li>
            <li>
              In Vercel open <strong>Project → Settings → Environment Variables</strong>.
            </li>
            <li>
              Add <code>AI_PROVIDER=gemini</code> and <code>GEMINI_API_KEY=your-key</code>.
            </li>
            <li>
              Open <strong>Deployments</strong> and click <strong>Redeploy</strong>. Environment variables only apply to new deployments.
            </li>
          </ol>
        )}
        <p className="muted small">API keys are only stored on the server. They are never sent to or stored in your browser.</p>
      </section>

      <section className="card">
        <h2>Account & storage</h2>
        {!supabaseConfigured ? (
          <Notice kind="info" title="Accounts are not enabled">
            Projects are saved in this browser only ({storage === 'memory' ? 'storage is blocked - data is temporary' : 'local storage'}). They are not
            synced to other devices and are deleted if you clear browser data. Export backups regularly.
          </Notice>
        ) : user ? (
          <>
            <p>
              Signed in as <strong>{user.email}</strong>. Projects are saved to your account and protected so only you can access them.
            </p>
            <div className="btn-row">
              {localCount > 0 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copyToCloud()} disabled={busy}>
                  Copy {localCount} browser project(s) to my account
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <p>You are not signed in. Projects are saved in this browser only.</p>
            <Link to="/login" className="btn btn-primary btn-sm">
              Sign in / Sign up
            </Link>
          </>
        )}
      </section>

      <section className="card">
        <h2>Backup & data</h2>
        <p className="muted">Download all projects as one JSON file, or restore from a backup.</p>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => void backupAll()} disabled={busy}>
            Download all projects
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
            Import backup
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void onImport(e)} aria-label="Choose a backup file" tabIndex={-1} />
          {storage !== 'cloud' && (
            <button type="button" className="btn btn-ghost danger-text" onClick={() => setConfirmClear(true)} disabled={busy}>
              Delete all browser data
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h2>About</h2>
        <p>
          <strong>IdeaForge AI</strong> is built for Inera School of Intelligence (SOI) by INERA GROUP (Inera Software Pvt. Ltd.). AI output is guidance:
          always review plans, run code yourself and test before deploying.
        </p>
      </section>

      <ConfirmDialog
        open={confirmClear}
        title="Delete all browser data?"
        message="Every project saved in this browser will be permanently deleted. Download a backup first if you need it."
        confirmLabel="Delete everything"
        danger
        onConfirm={clearLocal}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
