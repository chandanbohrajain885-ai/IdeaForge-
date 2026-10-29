import type { ProjectInput } from './Types';
import { CATEGORIES, PLATFORMS } from './Types';

export type FieldErrors = Partial<Record<keyof ProjectInput, string>>;

export const LIMITS = {
  name: 80,
  idea: 4000,
  problem: 2000,
  users: 1000,
  technologies: 500,
  budget: 200,
  timeline: 200,
} as const;

/** Validates the idea form. Returns an empty object when everything is valid. */
export function validateInput(input: ProjectInput): FieldErrors {
  const errors: FieldErrors = {};
  const name = input.name.trim();
  const idea = input.idea.trim();

  if (!name) errors.name = 'Give your project a name (you can change it later).';
  else if (name.length < 2) errors.name = 'Project name must be at least 2 characters.';
  else if (name.length > LIMITS.name) errors.name = `Keep the name under ${LIMITS.name} characters.`;

  if (!idea) errors.idea = 'Describe your idea in your own words.';
  else if (idea.length < 20) errors.idea = 'Add a little more detail (at least 20 characters) so the plan fits your idea.';
  else if (idea.length > LIMITS.idea) errors.idea = `Keep the description under ${LIMITS.idea} characters.`;

  if (input.problem.length > LIMITS.problem) errors.problem = `Keep this under ${LIMITS.problem} characters.`;
  if (input.users.length > LIMITS.users) errors.users = `Keep this under ${LIMITS.users} characters.`;
  if (input.technologies.length > LIMITS.technologies) errors.technologies = `Keep this under ${LIMITS.technologies} characters.`;
  if (input.budget.length > LIMITS.budget) errors.budget = `Keep this under ${LIMITS.budget} characters.`;
  if (input.timeline.length > LIMITS.timeline) errors.timeline = `Keep this under ${LIMITS.timeline} characters.`;

  if (!input.category) errors.category = 'Choose the category closest to your project.';
  else if (!(CATEGORIES as readonly string[]).includes(input.category)) errors.category = 'Choose a category from the list.';

  if (!input.platform) errors.platform = 'Choose where people will use it (pick "Not sure yet" if unsure).';
  else if (!(PLATFORMS as readonly string[]).includes(input.platform)) errors.platform = 'Choose a platform from the list.';

  if (!input.experience) errors.experience = 'Select your experience level so the plan matches your skills.';

  return errors;
}

/**
 * Offline clarification heuristic (used in demo mode only).
 * Returns at most three short questions when important information is missing.
 */
export function localClarificationQuestions(input: ProjectInput): string[] {
  const q: string[] = [];
  if (!input.users.trim()) q.push('Who exactly will use this first (for example: college students, teachers, small shop owners)?');
  if (!input.problem.trim()) q.push('What is the biggest problem these users face today that your project will fix?');
  if (input.idea.trim().length < 120) q.push('What is the ONE main thing a user should be able to do in the first version?');
  return q.slice(0, 3);
}

/** Converts effort strings such as "2-3 hours", "1 day", "half day" into hours. */
export function parseEffortHours(effort: string): number | null {
  const s = effort.toLowerCase().trim();
  if (!s) return null;
  if (s.includes('half') && s.includes('day')) return 3;
  const nums = (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  const value = nums.length >= 2 ? (nums[0] + nums[1]) / 2 : nums[0];
  if (/min/.test(s)) return value / 60;
  if (/hour|hr|\bh\b/.test(s)) return value;
  if (/week|wk/.test(s)) return value * 30;
  if (/day/.test(s)) return value * 6;
  return null;
}

/** Converts a timeline such as "2 weeks", "1 month", "10 days" into weeks. */
export function parseTimelineWeeks(timeline: string): number | null {
  const s = timeline.toLowerCase().trim();
  if (!s) return null;
  const nums = (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
  const value = nums.length >= 2 ? Math.max(nums[0], nums[1]) : nums.length ? nums[0] : s.includes('a ') || s.includes('one ') ? 1 : NaN;
  if (!Number.isFinite(value)) return null;
  if (/month/.test(s)) return value * 4.3;
  if (/week|wk/.test(s)) return value;
  if (/day/.test(s)) return value / 7;
  if (/year/.test(s)) return value * 52;
  return null;
}

/** Plain text safe for jsPDF's built-in fonts (which lack many Unicode glyphs). */
export function pdfSafe(text: string): string {
  return text
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/₹/g, 'INR ')
    .replace(/[•●▪]/g, '-')
    .replace(/→/g, '->')
    .replace(/ /g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ]/g, '');
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
