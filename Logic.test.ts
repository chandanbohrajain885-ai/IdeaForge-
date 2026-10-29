import { describe, expect, it } from 'vitest';
import type { ProjectInput } from './Types';
import { EMPTY_INPUT } from './Types';
import { localClarificationQuestions, parseEffortHours, parseTimelineWeeks, pdfSafe, validateInput } from './Validation';
import {
  buildAiContext,
  computeStats,
  createProject,
  currentPhaseLabel,
  duplicateProject,
  isBlocked,
  nextTaskId,
  normalizeProject,
  normalizeRoadmap,
  projectState,
  shareSummary,
  upcomingTasks,
} from './ProjectService';
import { sampleBlueprint, sampleRoadmap } from './SampleData';
import { runReadinessChecks } from './Readiness';
import { parseMarkdown } from './Markdown';
import { projectToMarkdown } from './ExportService';

const input: ProjectInput = {
  ...EMPTY_INPUT,
  name: 'StudyBuddy',
  idea: 'An AI study planner that builds a daily timetable from exam dates for college students.',
  problem: 'Students do not know how to split topics across the days left before exams.',
  users: 'College students',
  category: 'AI Application',
  platform: 'Web (browser)',
  experience: 'beginner',
  timeline: '6 weeks',
};

describe('validateInput', () => {
  it('rejects an empty form with field-level messages', () => {
    const e = validateInput({ ...EMPTY_INPUT });
    expect(e.name).toBeTruthy();
    expect(e.idea).toBeTruthy();
    expect(e.category).toBeTruthy();
    expect(e.platform).toBeTruthy();
    expect(e.experience).toBeTruthy();
    expect(e.problem).toBeUndefined();
  });
  it('accepts a valid form with optional fields blank', () => {
    expect(validateInput({ ...input, problem: '', users: '', timeline: '' })).toEqual({});
  });
  it('rejects too-short ideas and unknown categories', () => {
    const e = validateInput({ ...input, idea: 'short', category: 'Hacking' });
    expect(e.idea).toMatch(/20 characters/);
    expect(e.category).toBeTruthy();
  });
});

describe('parsers', () => {
  it('parses effort strings', () => {
    expect(parseEffortHours('2-3 hours')).toBe(2.5);
    expect(parseEffortHours('1 day')).toBe(6);
    expect(parseEffortHours('half day')).toBe(3);
    expect(parseEffortHours('30 minutes')).toBe(0.5);
    expect(parseEffortHours('soon')).toBeNull();
  });
  it('parses timelines', () => {
    expect(parseTimelineWeeks('6 weeks')).toBe(6);
    expect(parseTimelineWeeks('2 months')).toBeCloseTo(8.6);
    expect(parseTimelineWeeks('14 days')).toBe(2);
    expect(parseTimelineWeeks('asap')).toBeNull();
  });
  it('makes PDF-safe text', () => {
    expect(pdfSafe('₹2,000 – “ok” → done…')).toBe('INR 2,000 - "ok" -> done...');
  });
  it('asks at most three clarification questions', () => {
    expect(localClarificationQuestions({ ...input, users: '', problem: '', idea: 'short idea text here ok' }).length).toBeLessThanOrEqual(3);
  });
});

describe('project lifecycle', () => {
  const p = createProject(input, [], sampleBlueprint(input), sampleRoadmap(input), 'sample');

  it('creates a project with a roadmap and dependencies on earlier tasks only', () => {
    expect(p.tasks.length).toBeGreaterThan(10);
    const ids = p.tasks.map((t) => t.id);
    p.tasks.forEach((t, i) => t.dependencies.forEach((d) => expect(ids.indexOf(d)).toBeLessThan(i)));
    expect(p.blueprint.techStack.some((t) => t.layer === 'AI')).toBe(true);
  });

  it('computes progress and state', () => {
    expect(computeStats(p.tasks).percent).toBe(0);
    expect(projectState(p)).toBe('not_started');
    const half = { ...p, tasks: p.tasks.map((t, i) => (i < 4 ? { ...t, status: 'done' as const } : t)) };
    expect(computeStats(half.tasks).done).toBe(4);
    expect(projectState(half)).toBe('in_progress');
    const all = { ...p, tasks: p.tasks.map((t) => ({ ...t, status: 'done' as const })) };
    expect(computeStats(all.tasks).percent).toBe(100);
    expect(currentPhaseLabel(all)).toBe('All tasks complete');
  });

  it('detects blocked tasks and orders upcoming tasks', () => {
    const t5 = p.tasks.find((t) => t.id === 'T5')!;
    expect(isBlocked(t5, p.tasks)).toBe(true);
    const next = upcomingTasks(p, 3);
    // ready tasks (T1, T2) come before any blocked task
    expect(next.slice(0, 2).map((t) => t.id)).toEqual(['T1', 'T2']);
    expect(next.slice(0, 2).every((t) => !isBlocked(t, p.tasks))).toBe(true);
  });

  it('generates the next task id', () => {
    expect(nextTaskId(p.tasks)).toBe('T17');
    expect(nextTaskId([])).toBe('T1');
  });

  it('round-trips through normalizeProject and rejects junk', () => {
    const again = normalizeProject(JSON.parse(JSON.stringify(p)));
    expect(again).not.toBeNull();
    expect(again!.tasks.length).toBe(p.tasks.length);
    expect(normalizeProject({ foo: 1 })).toBeNull();
    expect(normalizeProject(null)).toBeNull();
  });

  it('normalizes malformed roadmap data safely', () => {
    const r = normalizeRoadmap({ phases: [{ id: 'P1', name: 'X' }, 'bad'], tasks: [{ title: 'A', priority: 'urgent', status: 'weird' }, { nope: true }] });
    expect(r.phases).toHaveLength(1);
    expect(r.tasks).toHaveLength(1);
    expect(r.tasks[0].priority).toBe('medium');
    expect(r.tasks[0].status).toBe('todo');
  });

  it('duplicates with reset progress and a new id', () => {
    const done = { ...p, tasks: p.tasks.map((t) => ({ ...t, status: 'done' as const })) };
    const copy = duplicateProject(done);
    expect(copy.id).not.toBe(p.id);
    expect(copy.input.name).toMatch(/\(copy\)$/);
    expect(computeStats(copy.tasks).done).toBe(0);
  });

  it('builds AI context and a share summary without private data', () => {
    const withChat = { ...p, chat: [{ id: '1', role: 'user' as const, content: 'my secret key is abc', createdAt: '' }] };
    expect(buildAiContext(withChat)).toContain('StudyBuddy');
    expect(shareSummary(withChat)).not.toContain('secret');
    expect(shareSummary(withChat)).toContain('sample output');
  });

  it('runs readiness checks with a bounded score', () => {
    const r = runReadinessChecks(p);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.checks.find((c) => c.id === 'tests')?.status).toBe('pass');
    expect(r.checks.find((c) => c.id === 'deploy')?.status).toBe('pass');
    const empty = runReadinessChecks({ ...p, tasks: [], phases: [] });
    expect(empty.checks.find((c) => c.id === 'timeline')?.status).toBe('fail');
    expect(empty.level).toBe('Needs work');
  });

  it('exports markdown with headings and task checkboxes', () => {
    const md = projectToMarkdown(p);
    expect(md).toContain('# StudyBuddy');
    expect(md).toContain('## Development Roadmap');
    expect(md).toContain('- [ ] **T1:');
  });
});

describe('markdown parser', () => {
  it('parses code fences, lists, headings and tables', () => {
    const blocks = parseMarkdown('## Title\n\nText **bold**\n\n- a\n- b\n\n1. one\n2. two\n\n```ts\nconst x = 1;\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |');
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'p', 'ul', 'ol', 'code', 'table']);
  });
  it('handles an unclosed code fence without hanging', () => {
    const blocks = parseMarkdown('```js\nlet a = 1;');
    expect(blocks[0].type).toBe('code');
  });
});
