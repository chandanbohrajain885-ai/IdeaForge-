import { useState, type ReactNode } from 'react';
import type { Blueprint, WorkspaceProps } from './Types';
import { useApp } from './AppContext';
import { normalizeBlueprint } from './ProjectService';
import { Notice, SampleBadge } from './UI';

/* ============================== row editor =============================== */
type FieldType = 'text' | 'textarea' | 'checkbox' | 'csv';
interface ColumnDef {
  key: string;
  label: string;
  type?: FieldType;
}
type Row = Record<string, unknown>;

function RowEditor({ label, rows, columns, onChange, addLabel }: { label: string; rows: Row[]; columns: ColumnDef[]; onChange: (rows: Row[]) => void; addLabel: string }) {
  const blank = (): Row => Object.fromEntries(columns.map((c) => [c.key, c.type === 'checkbox' ? false : '']));
  const setCell = (i: number, key: string, value: unknown) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const copy = rows.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };
  return (
    <fieldset className="row-editor">
      <legend>{label}</legend>
      {rows.length === 0 && <p className="muted small">None yet.</p>}
      {rows.map((r, i) => (
        <div className="row-edit" key={i}>
          <div className="row-edit-fields">
            {columns.map((c) => {
              const id = `${label}-${i}-${c.key}`.replace(/\W+/g, '-');
              if (c.type === 'checkbox')
                return (
                  <label key={c.key} className="check" htmlFor={id}>
                    <input id={id} type="checkbox" checked={r[c.key] === true} onChange={(e) => setCell(i, c.key, e.target.checked)} /> {c.label}
                  </label>
                );
              // csv values are kept as raw text while editing and split into a list on save
              const raw = r[c.key];
              const value = Array.isArray(raw) ? (raw as string[]).join(', ') : String(raw ?? '');
              const onVal = (v: string) => setCell(i, c.key, v);
              return (
                <div key={c.key} className="mini-field">
                  <label htmlFor={id}>{c.label}</label>
                  {c.type === 'textarea' ? (
                    <textarea id={id} rows={2} value={value} onChange={(e) => onVal(e.target.value)} />
                  ) : (
                    <input id={id} value={value} onChange={(e) => onVal(e.target.value)} placeholder={c.type === 'csv' ? 'comma, separated' : ''} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="row-edit-actions">
            <button type="button" className="icon-btn" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
              ↑
            </button>
            <button type="button" className="icon-btn" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>
              ↓
            </button>
            <button type="button" className="icon-btn danger" aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...rows, blank()])}>
        + {addLabel}
      </button>
    </fieldset>
  );
}

const lines = (v: string) =>
  v
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

/* ================================ view =================================== */
function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="card bp-section">
      <h2>{title}</h2>
      {hint && <p className="muted small">{hint}</p>}
      {children}
    </section>
  );
}

function List({ items, ordered }: { items: string[]; ordered?: boolean }) {
  if (!items.length) return <p className="muted">Not specified.</p>;
  return ordered ? (
    <ol className="clean-list numbered">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ol>
  ) : (
    <ul className="clean-list">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

export function ProjectResults({ project, update }: WorkspaceProps) {
  const { toast } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Blueprint>(project.blueprint);
  const [saving, setSaving] = useState(false);
  const b = project.blueprint;

  const startEdit = () => {
    setDraft(JSON.parse(JSON.stringify(project.blueprint)) as Blueprint);
    setEditing(true);
  };

  const save = async () => {
    const prepared = {
      ...draft,
      database: draft.database.map((d) => {
        const f = d.fields as unknown;
        return {
          ...d,
          fields: Array.isArray(f)
            ? f
            : String(f ?? '')
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean),
        };
      }),
    };
    const clean = normalizeBlueprint(prepared);
    if (!clean.title.trim()) {
      toast('The project title cannot be empty.', 'error');
      return;
    }
    setSaving(true);
    const ok = await update((p) => ({ ...p, blueprint: clean }));
    setSaving(false);
    if (ok) {
      toast('Blueprint saved.', 'success');
      setEditing(false);
    }
  };

  const setD = <K extends keyof Blueprint>(k: K, v: Blueprint[K]) => setDraft((d) => ({ ...d, [k]: v }));

  if (editing) {
    return (
      <div className="bp-edit">
        <div className="sticky-actions">
          <strong>Editing blueprint</strong>
          <div className="spacer" />
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving...' : 'Save blueprint'}
          </button>
        </div>
        <div className="card form">
          {(
            [
              ['title', 'Project title', 1],
              ['summary', 'Simple explanation', 4],
              ['problemStatement', 'Problem statement', 3],
              ['solution', 'Proposed solution', 3],
              ['targetAudience', 'Target audience', 2],
              ['usefulness', 'What makes it useful', 2],
              ['architecture', 'Architecture overview', 4],
            ] as [keyof Blueprint, string, number][]
          ).map(([k, label, rows]) => (
            <div className="field" key={k}>
              <label htmlFor={`bp-${k}`}>{label}</label>
              {rows === 1 ? (
                <input id={`bp-${k}`} value={draft[k] as string} onChange={(e) => setD(k, e.target.value as never)} maxLength={140} />
              ) : (
                <textarea id={`bp-${k}`} rows={rows} value={draft[k] as string} onChange={(e) => setD(k, e.target.value as never)} />
              )}
            </div>
          ))}
          {(
            [
              ['objectives', 'Objectives'],
              ['outcomes', 'Expected outcomes'],
              ['userJourney', 'User journey (in order)'],
              ['architectureFlow', 'Architecture data flow (in order)'],
              ['assumptions', 'Assumptions'],
            ] as [keyof Blueprint, string][]
          ).map(([k, label]) => (
            <div className="field" key={k}>
              <label htmlFor={`bp-${k}`}>
                {label} <span className="opt">one per line</span>
              </label>
              <textarea id={`bp-${k}`} rows={4} value={(draft[k] as string[]).join('\n')} onChange={(e) => setD(k, lines(e.target.value) as never)} />
            </div>
          ))}
        </div>
        <div className="card form">
          {(['essential', 'recommended', 'advanced'] as const).map((g) => (
            <RowEditor
              key={g}
              label={g === 'essential' ? 'Essential features (version 1)' : g === 'recommended' ? 'Recommended features (next)' : 'Advanced features (future)'}
              rows={draft.features[g] as unknown as Row[]}
              columns={[
                { key: 'name', label: 'Feature' },
                { key: 'description', label: 'Description', type: 'textarea' },
              ]}
              addLabel="Add feature"
              onChange={(rows) => setDraft((d) => ({ ...d, features: { ...d.features, [g]: rows as unknown as Blueprint['features'][typeof g] } }))}
            />
          ))}
        </div>
        <div className="card form">
          <RowEditor
            label="Screens"
            rows={draft.screens as unknown as Row[]}
            columns={[
              { key: 'name', label: 'Screen' },
              { key: 'purpose', label: 'Purpose', type: 'textarea' },
            ]}
            addLabel="Add screen"
            onChange={(rows) => setD('screens', rows as unknown as Blueprint['screens'])}
          />
          <RowEditor
            label="Technology stack"
            rows={draft.techStack as unknown as Row[]}
            columns={[
              { key: 'layer', label: 'Layer' },
              { key: 'choice', label: 'Technology' },
              { key: 'reason', label: 'Why', type: 'textarea' },
              { key: 'alternatives', label: 'Alternatives' },
            ]}
            addLabel="Add technology"
            onChange={(rows) => setD('techStack', rows as unknown as Blueprint['techStack'])}
          />
          <RowEditor
            label="Integrations"
            rows={draft.integrations as unknown as Row[]}
            columns={[
              { key: 'name', label: 'Service' },
              { key: 'purpose', label: 'Purpose', type: 'textarea' },
              { key: 'required', label: 'Required for version 1', type: 'checkbox' },
            ]}
            addLabel="Add integration"
            onChange={(rows) => setD('integrations', rows as unknown as Blueprint['integrations'])}
          />
          <RowEditor
            label="Database tables"
            rows={draft.database as unknown as Row[]}
            columns={[
              { key: 'table', label: 'Table' },
              { key: 'purpose', label: 'Purpose', type: 'textarea' },
              { key: 'fields', label: 'Fields', type: 'csv' },
            ]}
            addLabel="Add table"
            onChange={(rows) => setD('database', rows as unknown as Blueprint['database'])}
          />
          <RowEditor
            label="API endpoints"
            rows={draft.apis as unknown as Row[]}
            columns={[
              { key: 'method', label: 'Method' },
              { key: 'path', label: 'Path' },
              { key: 'purpose', label: 'Purpose', type: 'textarea' },
            ]}
            addLabel="Add endpoint"
            onChange={(rows) => setD('apis', rows as unknown as Blueprint['apis'])}
          />
        </div>
        <div className="form-actions">
          <div className="spacer" />
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving...' : 'Save blueprint'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="blueprint">
      <div className="bp-toolbar">
        <div>
          <h2 className="bp-title">{b.title || project.input.name}</h2>
          {project.source === 'sample' ? <SampleBadge /> : <span className="badge badge-ai">AI-generated plan · review before relying on it</span>}
        </div>
        <button type="button" className="btn btn-secondary" onClick={startEdit}>
          Edit blueprint
        </button>
      </div>
      {project.source === 'sample' && (
        <Notice kind="warn">This blueprint is sample output from a template (demo mode). It was not generated by AI for your specific idea.</Notice>
      )}

      <Section title="The idea in simple words">
        <p className="lead-sm">{b.summary || 'Not specified.'}</p>
      </Section>

      <div className="bp-grid">
        <Section title="Problem">
          <p>{b.problemStatement || project.input.problem || 'Not specified.'}</p>
        </Section>
        <Section title="Solution">
          <p>{b.solution || 'Not specified.'}</p>
        </Section>
        <Section title="Target audience">
          <p>{b.targetAudience || project.input.users || 'Not specified.'}</p>
        </Section>
        <Section title="Why it is useful">
          <p>{b.usefulness || 'Not specified.'}</p>
        </Section>
        <Section title="Objectives">
          <List items={b.objectives} />
        </Section>
        <Section title="Expected outcomes">
          <List items={b.outcomes} />
        </Section>
      </div>

      <Section title="Features" hint="Build the essential features first. Everything else can wait until version 1 works.">
        <div className="feature-cols">
          {(['essential', 'recommended', 'advanced'] as const).map((g) => (
            <div key={g} className={`feature-col fc-${g}`}>
              <h3>
                {g === 'essential' ? 'Essential' : g === 'recommended' ? 'Recommended' : 'Advanced'}
                <small>{g === 'essential' ? 'Needed to launch v1' : g === 'recommended' ? 'Add next' : 'Future versions'}</small>
              </h3>
              {b.features[g].length ? (
                <ul>
                  {b.features[g].map((f, i) => (
                    <li key={i}>
                      <strong>{f.name}</strong>
                      <span>{f.description}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">None listed.</p>
              )}
            </div>
          ))}
        </div>
      </Section>

      <div className="bp-grid">
        <Section title="User journey">
          <List items={b.userJourney} ordered />
        </Section>
        <Section title="Screens">
          {b.screens.length ? (
            <ul className="def-list">
              {b.screens.map((s, i) => (
                <li key={i}>
                  <strong>{s.name}</strong>
                  <span>{s.purpose}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Not specified.</p>
          )}
        </Section>
      </div>

      <Section title="Recommended technology stack">
        {b.techStack.length ? (
          <div className="stack-grid">
            {b.techStack.map((t, i) => (
              <div key={i} className="stack-card">
                <span className="stack-layer">{t.layer}</span>
                <strong>{t.choice}</strong>
                <p>{t.reason}</p>
                {t.alternatives && <p className="muted small">Alternatives: {t.alternatives}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Not specified.</p>
        )}
      </Section>

      <Section title="How the system fits together">
        <p>{b.architecture || 'Not specified.'}</p>
        {b.architectureFlow.length > 0 && (
          <ol className="flow">
            {b.architectureFlow.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        )}
      </Section>

      <div className="bp-grid">
        <Section title="Integrations">
          {b.integrations.length ? (
            <ul className="def-list">
              {b.integrations.map((x, i) => (
                <li key={i}>
                  <strong>
                    {x.name} {x.required && <span className="badge badge-high">required</span>}
                  </strong>
                  <span>{x.purpose}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No external integrations needed.</p>
          )}
        </Section>
        <Section title="API endpoints">
          {b.apis.length ? (
            <ul className="def-list">
              {b.apis.map((a, i) => (
                <li key={i}>
                  <code>
                    {a.method} {a.path}
                  </code>
                  <span>{a.purpose}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No backend API required.</p>
          )}
        </Section>
      </div>

      <Section title="Database tables">
        {b.database.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Purpose</th>
                  <th>Fields</th>
                </tr>
              </thead>
              <tbody>
                {b.database.map((d, i) => (
                  <tr key={i}>
                    <td>
                      <code>{d.table}</code>
                    </td>
                    <td>{d.purpose}</td>
                    <td className="small">{d.fields.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No database required.</p>
        )}
      </Section>

      {b.assumptions.length > 0 && (
        <Section title="Assumptions" hint="Made because some details were missing. Edit the blueprint if any are wrong.">
          <List items={b.assumptions} />
        </Section>
      )}
    </div>
  );
}
