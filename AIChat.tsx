import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ChatMessage, Task, WorkspaceProps } from './Types';
import { useApp } from './AppContext';
import { aiChat, aiExplainCode, aiFixError, aiGenerateTask, type GeneratedTask } from './AIService';
import { makeId, nextTaskId, nowIso, phaseName } from './ProjectService';
import { sampleAssistantReply } from './SampleData';
import { Markdown } from './Markdown';
import { ConfirmDialog, Modal, Notice, PriorityBadge, Spinner } from './UI';

type ActionModal = null | 'feature' | 'task' | 'fix' | 'code';

export function AIChat({ project, update, goTab }: WorkspaceProps) {
  const { aiLive, toast } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ActionModal>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [feature, setFeature] = useState('');
  const [taskReq, setTaskReq] = useState('');
  const [drafted, setDrafted] = useState<GeneratedTask | null>(null);
  const [errText, setErrText] = useState('');
  const [errCode, setErrCode] = useState('');
  const [errNote, setErrNote] = useState('');
  const [code, setCode] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const chat = project.chat;

  const allFeatures = [...project.blueprint.features.essential, ...project.blueprint.features.recommended, ...project.blueprint.features.advanced];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.length, busy]);

  const msg = (role: ChatMessage['role'], content: string, extra?: Partial<ChatMessage>): ChatMessage => ({ id: makeId(), role, content, createdAt: nowIso(), ...extra });

  /** Adds the user message, runs the request, then adds the reply (or an error message). */
  const run = async (userText: string, request: (history: ChatMessage[]) => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    const userMsg = msg('user', userText);
    const history = [...chat, userMsg];
    await update((p) => ({ ...p, chat: [...p.chat, userMsg] }));
    try {
      const reply = aiLive ? await request(history) : sampleAssistantReply(userText);
      const answer = msg('assistant', reply, { source: aiLive ? 'ai' : 'sample' });
      await update((p) => ({ ...p, chat: [...p.chat, answer] }));
    } catch (e) {
      const err = msg('assistant', e instanceof Error ? e.message : 'Something went wrong. Please try again.', { error: true });
      await update((p) => ({ ...p, chat: [...p.chat, err] }));
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    const q = text.trim();
    if (!q) return;
    if (q.length > 4000) {
      toast('Please keep your question under 4,000 characters.', 'error');
      return;
    }
    setText('');
    void run(q, (history) => aiChat(project, history));
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const explainFeature = () => {
    const f = allFeatures.find((x) => x.name === feature);
    if (!f) return toast('Choose a feature first.', 'error');
    setModal(null);
    const q = `Explain the feature "${f.name}" (${f.description}) in simple terms: what it does for users, how it works technically in my stack, which screens, tables and APIs it touches, and the steps to build it.`;
    void run(q, (h) => aiChat(project, h));
  };

  const fixError = () => {
    if (errText.trim().length < 5) return toast('Paste the error message.', 'error');
    setModal(null);
    const label = `Help me fix this error:\n\n\`\`\`\n${errText.trim().slice(0, 1500)}\n\`\`\`${errNote.trim() ? `\n\nWhat I was doing: ${errNote.trim()}` : ''}${errCode.trim() ? '\n\n(Related code attached)' : ''}`;
    const e1 = errText;
    const c1 = errCode;
    const n1 = errNote;
    setErrText('');
    setErrCode('');
    setErrNote('');
    void run(label, () => aiFixError(project, e1, c1, n1));
  };

  const explainCode = () => {
    if (code.trim().length < 5) return toast('Paste the code you want explained.', 'error');
    setModal(null);
    const c1 = code;
    setCode('');
    void run(`Explain my code:\n\n\`\`\`\n${c1.trim().slice(0, 3000)}\n\`\`\``, () => aiExplainCode(project, c1));
  };

  const draftTask = async () => {
    if (!aiLive) return toast('Generating tasks needs AI. Add tasks manually from the Roadmap tab.', 'info');
    if (taskReq.trim().length < 5) return toast('Describe the task in a few words.', 'error');
    setBusy(true);
    try {
      setDrafted(await aiGenerateTask(project, taskReq.trim()));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not generate a task.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const addDrafted = async () => {
    if (!drafted) return;
    const ok = await update((p) => {
      const phases = p.phases.length ? p.phases : [{ id: 'P1', name: 'General', goal: '' }];
      const t: Task = {
        id: nextTaskId(p.tasks),
        phase: phases.some((ph) => ph.id === drafted.phase) ? drafted.phase : phases[0].id,
        title: drafted.title,
        description: drafted.description,
        expectedResult: drafted.expectedResult,
        priority: drafted.priority,
        effort: drafted.effort,
        dependencies: [],
        status: 'todo',
        custom: true,
      };
      return { ...p, phases, tasks: [...p.tasks, t] };
    });
    if (ok) {
      toast('Task added to your roadmap.', 'success');
      setDrafted(null);
      setTaskReq('');
      setModal(null);
    }
  };

  const clearChat = async () => {
    const ok = await update((p) => ({ ...p, chat: [] }));
    if (ok) toast('Conversation cleared.', 'success');
    setConfirmClear(false);
  };

  return (
    <div className="chat-wrap">
      <div className="card chat-card">
        <div className="chat-head">
          <div>
            <h2>Project assistant</h2>
            <p className="muted small">Knows your plan and roadmap, so you never need to re-explain the project.</p>
          </div>
          {chat.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(true)} disabled={busy}>
              Clear chat
            </button>
          )}
        </div>
        {!aiLive && (
          <Notice kind="warn" title="Demo mode">
            AI is not configured, so answers are placeholder text, not real AI responses.
          </Notice>
        )}
        <div className="quick-row" role="group" aria-label="Suggested actions">
          <button type="button" className="chip" onClick={() => setModal('feature')} disabled={busy}>
            Explain This Feature
          </button>
          <button type="button" className="chip" onClick={() => setModal('task')} disabled={busy}>
            Generate a Task
          </button>
          <button type="button" className="chip" onClick={() => setModal('fix')} disabled={busy}>
            Help Me Fix an Error
          </button>
          <button type="button" className="chip" onClick={() => goTab('readiness')}>
            Review My Plan
          </button>
          <button type="button" className="chip" onClick={() => setModal('code')} disabled={busy}>
            Explain My Code
          </button>
        </div>

        <div className="messages" aria-live="polite">
          {chat.length === 0 && !busy && (
            <div className="chat-empty">
              <p>
                <strong>Ask anything about {project.input.name}.</strong>
              </p>
              <p className="muted small">Try: "Which task should I do first and why?" · "How should I structure my folders?" · "Is my tech stack right for a beginner?"</p>
            </div>
          )}
          {chat.map((m) => (
            <div key={m.id} className={`msg msg-${m.role} ${m.error ? 'msg-error' : ''}`}>
              {m.role === 'assistant' && !m.error && (
                <div className="msg-label">{m.source === 'sample' ? 'Demo placeholder - not AI' : 'AI suggestion · not executed or verified'}</div>
              )}
              {m.error && <div className="msg-label">Request failed</div>}
              <Markdown text={m.content} />
            </div>
          ))}
          {busy && (
            <div className="msg msg-assistant">
              <Spinner label="Thinking..." />
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="composer">
          <label htmlFor="chat-input" className="sr-only">
            Ask the assistant
          </label>
          <textarea
            id="chat-input"
            rows={2}
            value={text}
            maxLength={4000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask about features, architecture, code, database, APIs, deployment or errors... (Enter to send, Shift+Enter for a new line)"
            disabled={busy}
          />
          <button type="button" className="btn btn-primary" onClick={send} disabled={busy || !text.trim()}>
            Send
          </button>
        </div>
      </div>

      {/* Explain feature */}
      <Modal
        open={modal === 'feature'}
        title="Explain a feature"
        onClose={() => setModal(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={explainFeature} disabled={!feature}>
              Explain
            </button>
          </>
        }
      >
        {allFeatures.length ? (
          <div className="field">
            <label htmlFor="feat-select">Feature</label>
            <select id="feat-select" value={feature} onChange={(e) => setFeature(e.target.value)}>
              <option value="">Choose a feature</option>
              {allFeatures.map((f, i) => (
                <option key={`${f.name}-${i}`} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="muted">Your blueprint has no features yet. Add some in the Blueprint tab.</p>
        )}
      </Modal>

      {/* Generate task */}
      <Modal
        open={modal === 'task'}
        title="Generate a task"
        onClose={() => {
          if (busy) return;
          setModal(null);
          setDrafted(null);
        }}
        wide
        footer={
          drafted ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDrafted(null)}>
                Try again
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void addDrafted()}>
                Add to roadmap
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void draftTask()} disabled={busy || !aiLive}>
                {busy ? 'Drafting...' : 'Draft task'}
              </button>
            </>
          )
        }
      >
        {!aiLive && <Notice kind="info">Generating tasks needs AI. You can still add tasks manually in the Roadmap tab.</Notice>}
        {drafted ? (
          <div className="drafted">
            <p className="muted small">Review the AI draft before adding it.</p>
            <h3>{drafted.title}</h3>
            <p>{drafted.description}</p>
            <p>
              <strong>Expected result:</strong> {drafted.expectedResult || '—'}
            </p>
            <p className="td-meta">
              <PriorityBadge priority={drafted.priority} /> <span className="badge">{drafted.effort}</span>{' '}
              <span className="badge">{phaseName(project, drafted.phase)}</span>
            </p>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="task-req">What needs to be done?</label>
            <textarea id="task-req" rows={3} maxLength={1500} value={taskReq} onChange={(e) => setTaskReq(e.target.value)} placeholder="e.g. Let users reset their password by email" />
          </div>
        )}
      </Modal>

      {/* Fix error */}
      <Modal
        open={modal === 'fix'}
        title="Help me fix an error"
        onClose={() => setModal(null)}
        wide
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={fixError}>
              Diagnose error
            </button>
          </>
        }
      >
        <Notice kind="warn">Remove passwords, API keys and personal data before pasting.</Notice>
        <div className="field">
          <label htmlFor="err-text">
            Error message <span className="req">*</span>
          </label>
          <textarea id="err-text" className="mono" rows={5} maxLength={6000} value={errText} onChange={(e) => setErrText(e.target.value)} placeholder="Paste the full error or stack trace" />
        </div>
        <div className="field">
          <label htmlFor="err-code">
            Related code <span className="opt">(optional)</span>
          </label>
          <textarea id="err-code" className="mono" rows={6} maxLength={6000} value={errCode} onChange={(e) => setErrCode(e.target.value)} placeholder="The file or function where it happens" />
        </div>
        <div className="field">
          <label htmlFor="err-note">
            What were you doing? <span className="opt">(optional)</span>
          </label>
          <input id="err-note" maxLength={1000} value={errNote} onChange={(e) => setErrNote(e.target.value)} placeholder='e.g. Ran "npm run build"' />
        </div>
      </Modal>

      {/* Explain code */}
      <Modal
        open={modal === 'code'}
        title="Explain my code"
        onClose={() => setModal(null)}
        wide
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={explainCode}>
              Explain code
            </button>
          </>
        }
      >
        <Notice kind="warn">Remove secrets (API keys, passwords) before pasting.</Notice>
        <div className="field">
          <label htmlFor="code-in">Code</label>
          <textarea id="code-in" className="mono" rows={12} maxLength={8000} value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmClear}
        title="Clear this conversation?"
        message="All assistant messages for this project will be deleted. Task guides are kept."
        confirmLabel="Clear chat"
        danger
        onConfirm={() => void clearChat()}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
