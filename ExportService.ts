import type { Project } from './Types';
import { STATUS_LABELS } from './Types';
import { computeStats } from './ProjectService';
import { pdfSafe } from './Validation';
import logoUrl from './inera-logo.jpeg';

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'project'
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('Copy is not supported in this browser.');
}

/* ================================ Markdown ================================ */
export function projectToMarkdown(p: Project): string {
  const b = p.blueprint;
  const st = computeStats(p.tasks);
  const L: string[] = [];
  const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`) : ['- Not specified']);
  L.push(`# ${b.title || p.input.name}`);
  L.push('');
  L.push(`*IdeaForge AI by Inera School of Intelligence - exported ${new Date().toLocaleString()}*`);
  if (p.source === 'sample') L.push('', '> SAMPLE OUTPUT: generated from a template in demo mode, not by AI.');
  L.push('', `**Category:** ${p.input.category} | **Platform:** ${p.input.platform} | **Experience:** ${p.input.experience}`);
  L.push(`**Progress:** ${st.done}/${st.total} tasks completed (${st.percent}%)`);
  L.push('', '## Overview', '', b.summary);
  L.push('', '## Problem Statement', '', b.problemStatement || p.input.problem || 'Not specified');
  L.push('', '## Proposed Solution', '', b.solution || 'Not specified');
  L.push('', '## Target Audience', '', b.targetAudience || p.input.users || 'Not specified');
  L.push('', '## Objectives', '', ...list(b.objectives));
  L.push('', '## Expected Outcomes', '', ...list(b.outcomes));
  if (b.usefulness) L.push('', '## Why It Is Useful', '', b.usefulness);
  L.push('', '## Features');
  (['essential', 'recommended', 'advanced'] as const).forEach((k) => {
    const title = k === 'essential' ? 'Essential (version 1)' : k === 'recommended' ? 'Recommended (next)' : 'Advanced (future)';
    L.push('', `### ${title}`, '', ...list(b.features[k].map((f) => `**${f.name}** - ${f.description}`)));
  });
  L.push('', '## User Journey', '', ...(b.userJourney.length ? b.userJourney.map((s, i) => `${i + 1}. ${s}`) : ['Not specified']));
  L.push('', '## Screens', '', ...list(b.screens.map((s) => `**${s.name}** - ${s.purpose}`)));
  L.push('', '## Technology Stack', '');
  if (b.techStack.length) {
    L.push('| Layer | Choice | Why | Alternatives |', '|---|---|---|---|');
    b.techStack.forEach((t) => L.push(`| ${t.layer} | ${t.choice} | ${t.reason.replace(/\|/g, '/')} | ${t.alternatives.replace(/\|/g, '/')} |`));
  } else L.push('Not specified');
  L.push('', '## Architecture', '', b.architecture || 'Not specified');
  if (b.architectureFlow.length) L.push('', ...b.architectureFlow.map((s, i) => `${i + 1}. ${s}`));
  if (b.integrations.length) L.push('', '## Integrations', '', ...b.integrations.map((i) => `- **${i.name}**${i.required ? ' (required)' : ''} - ${i.purpose}`));
  if (b.database.length) {
    L.push('', '## Database Tables', '');
    b.database.forEach((d) => L.push(`- **${d.table}** - ${d.purpose}${d.fields.length ? ` _Fields: ${d.fields.join(', ')}_` : ''}`));
  }
  if (b.apis.length) L.push('', '## API Endpoints', '', ...b.apis.map((a) => `- \`${a.method} ${a.path}\` - ${a.purpose}`));
  if (b.assumptions.length) L.push('', '## Assumptions', '', ...list(b.assumptions));
  L.push('', '## Development Roadmap');
  if (p.totalEstimate) L.push('', `**Estimated effort:** ${p.totalEstimate}`);
  if (p.timelineNote) L.push('', `> ${p.timelineNote}`);
  p.phases.forEach((ph) => {
    L.push('', `### ${ph.name}`, '', ph.goal ? `_${ph.goal}_` : '', '');
    p.tasks
      .filter((t) => t.phase === ph.id)
      .forEach((t) => {
        L.push(`- [${t.status === 'done' ? 'x' : ' '}] **${t.id}: ${t.title}** (${t.priority} priority, ${t.effort}, ${STATUS_LABELS[t.status]})`);
        if (t.description) L.push(`  - ${t.description}`);
        if (t.expectedResult) L.push(`  - Expected result: ${t.expectedResult}`);
        if (t.dependencies.length) L.push(`  - Depends on: ${t.dependencies.join(', ')}`);
      });
  });
  const orphan = p.tasks.filter((t) => !p.phases.some((ph) => ph.id === t.phase));
  if (orphan.length) {
    L.push('', '### Other tasks', '');
    orphan.forEach((t) => L.push(`- [${t.status === 'done' ? 'x' : ' '}] **${t.id}: ${t.title}** (${t.priority}, ${t.effort})`));
  }
  L.push('', '---', 'Plans and estimates are guidance only. Verify technical decisions before relying on them.');
  return L.join('\n');
}

export function exportMarkdown(p: Project): void {
  downloadBlob(new Blob([projectToMarkdown(p)], { type: 'text/markdown;charset=utf-8' }), `${slugify(p.input.name)}-blueprint.md`);
}

export function exportJson(projects: Project[], filename: string): void {
  const payload = { app: 'IdeaForge AI', version: 1, exportedAt: new Date().toISOString(), projects };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), filename);
}

/* ================================== PDF =================================== */
async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const r = await fetch(logoUrl);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportPdf(p: Project): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 48;
  const width = pageW - M * 2;
  let y = M;

  const NAVY: [number, number, number] = [15, 27, 51];
  const GREY: [number, number, number] = [90, 99, 115];
  const ACCENT: [number, number, number] = [79, 70, 229];

  const ensure = (h: number) => {
    if (y + h > pageH - M) {
      doc.addPage();
      y = M;
    }
  };
  const text = (t: string, size: number, opts: { bold?: boolean; color?: [number, number, number]; indent?: number; gap?: number } = {}) => {
    const clean = pdfSafe(t || '');
    if (!clean.trim()) return;
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...(opts.color ?? NAVY));
    const indent = opts.indent ?? 0;
    const lines = doc.splitTextToSize(clean, width - indent) as string[];
    const lh = size * 1.35;
    lines.forEach((line) => {
      ensure(lh);
      doc.text(line, M + indent, y + size);
      y += lh;
    });
    y += opts.gap ?? 4;
  };
  const h1 = (t: string) => {
    ensure(40);
    text(t, 20, { bold: true, gap: 6 });
  };
  const h2 = (t: string) => {
    ensure(48);
    y += 8;
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(1.2);
    doc.line(M, y, M + 28, y);
    y += 8;
    text(t, 13.5, { bold: true, gap: 4 });
  };
  const h3 = (t: string) => {
    ensure(30);
    text(t, 11.5, { bold: true, color: ACCENT, gap: 2 });
  };
  const para = (t: string) => text(t, 10.5, { color: [40, 48, 64] });
  const bullets = (items: string[], numbered = false) => {
    if (!items.length) return para('Not specified');
    items.forEach((it, i) => text(`${numbered ? `${i + 1}.` : '-'} ${it}`, 10.5, { indent: 10, color: [40, 48, 64], gap: 2 }));
    y += 3;
  };

  // Header with logo
  const logo = await loadLogoDataUrl();
  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', M, y, 46, 50);
    } catch {
      /* logo is optional */
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...GREY);
  doc.text('IdeaForge AI  |  Inera School of Intelligence', logo ? M + 58 : M, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.text(`Exported ${pdfSafe(new Date().toLocaleString())}`, logo ? M + 58 : M, y + 34);
  y += 66;

  const b = p.blueprint;
  const st = computeStats(p.tasks);
  h1(b.title || p.input.name);
  if (p.source === 'sample') text('SAMPLE OUTPUT - generated from a template in demo mode, not by AI.', 10, { bold: true, color: [180, 83, 9] });
  text(`${p.input.category}  |  ${p.input.platform}  |  ${p.input.experience} level  |  Progress ${st.done}/${st.total} tasks (${st.percent}%)`, 10, { color: GREY, gap: 8 });

  h2('Overview');
  para(b.summary);
  h2('Problem Statement');
  para(b.problemStatement || p.input.problem || 'Not specified');
  h2('Proposed Solution');
  para(b.solution || 'Not specified');
  h2('Target Audience');
  para(b.targetAudience || p.input.users || 'Not specified');
  h2('Objectives');
  bullets(b.objectives);
  h2('Expected Outcomes');
  bullets(b.outcomes);
  if (b.usefulness) {
    h2('Why It Is Useful');
    para(b.usefulness);
  }
  h2('Features');
  h3('Essential - required for version 1');
  bullets(b.features.essential.map((f) => `${f.name}: ${f.description}`));
  h3('Recommended - add next');
  bullets(b.features.recommended.map((f) => `${f.name}: ${f.description}`));
  h3('Advanced - future versions');
  bullets(b.features.advanced.map((f) => `${f.name}: ${f.description}`));
  h2('User Journey');
  bullets(b.userJourney, true);
  h2('Screens');
  bullets(b.screens.map((s) => `${s.name}: ${s.purpose}`));
  h2('Technology Stack');
  if (!b.techStack.length) para('Not specified');
  b.techStack.forEach((t) => {
    h3(`${t.layer}: ${t.choice}`);
    para(t.reason);
    if (t.alternatives) text(`Alternatives: ${t.alternatives}`, 9.5, { color: GREY });
  });
  h2('Architecture');
  para(b.architecture || 'Not specified');
  if (b.architectureFlow.length) bullets(b.architectureFlow, true);
  if (b.integrations.length) {
    h2('Integrations');
    bullets(b.integrations.map((i) => `${i.name}${i.required ? ' (required)' : ''}: ${i.purpose}`));
  }
  if (b.database.length) {
    h2('Database Tables');
    b.database.forEach((d) => {
      h3(d.table);
      para(d.purpose);
      if (d.fields.length) text(`Fields: ${d.fields.join(', ')}`, 9.5, { color: GREY });
    });
  }
  if (b.apis.length) {
    h2('API Endpoints');
    bullets(b.apis.map((a) => `${a.method} ${a.path} - ${a.purpose}`));
  }

  h2('Development Roadmap');
  if (p.totalEstimate) para(`Estimated effort: ${p.totalEstimate}`);
  if (p.timelineNote) text(p.timelineNote, 10, { color: GREY });
  const phaseIds = new Set(p.phases.map((ph) => ph.id));
  const groups = [...p.phases.map((ph) => ({ name: ph.name, goal: ph.goal, id: ph.id }))];
  if (p.tasks.some((t) => !phaseIds.has(t.phase))) groups.push({ id: '__other', name: 'Other tasks', goal: '' });
  groups.forEach((g) => {
    const tasks = p.tasks.filter((t) => (g.id === '__other' ? !phaseIds.has(t.phase) : t.phase === g.id));
    if (!tasks.length) return;
    h3(g.name);
    if (g.goal) text(g.goal, 9.5, { color: GREY });
    tasks.forEach((t) => {
      text(`[${t.status === 'done' ? 'x' : ' '}] ${t.id}: ${t.title}`, 10.5, { bold: true, indent: 6, gap: 1 });
      text(`${t.priority} priority  |  ${t.effort}  |  ${STATUS_LABELS[t.status]}${t.dependencies.length ? `  |  depends on ${t.dependencies.join(', ')}` : ''}`, 9, { color: GREY, indent: 20, gap: 1 });
      if (t.description) text(t.description, 10, { indent: 20, color: [40, 48, 64], gap: 1 });
      if (t.expectedResult) text(`Expected result: ${t.expectedResult}`, 9.5, { indent: 20, color: GREY, gap: 6 });
    });
  });

  // footer page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GREY);
    doc.text(`IdeaForge AI - ${pdfSafe(p.input.name)}`, M, pageH - 24);
    doc.text(`Page ${i} of ${pages}`, pageW - M, pageH - 24, { align: 'right' });
  }
  doc.save(`${slugify(p.input.name)}-blueprint.pdf`);
}
