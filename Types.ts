export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type Priority = 'high' | 'medium' | 'low';
export type ProjectSource = 'ai' | 'sample';

export interface ProjectInput {
  name: string;
  idea: string;
  problem: string;
  users: string;
  category: string;
  platform: string;
  experience: Experience | '';
  technologies: string;
  budget: string;
  timeline: string;
}

export interface Clarification {
  question: string;
  answer: string;
}

export interface Feature {
  name: string;
  description: string;
}

export interface Screen {
  name: string;
  purpose: string;
}

export interface TechChoice {
  layer: string;
  choice: string;
  reason: string;
  alternatives: string;
}

export interface Integration {
  name: string;
  purpose: string;
  required: boolean;
}

export interface DbTable {
  table: string;
  purpose: string;
  fields: string[];
}

export interface ApiEndpoint {
  method: string;
  path: string;
  purpose: string;
}

export interface Blueprint {
  title: string;
  summary: string;
  problemStatement: string;
  solution: string;
  targetAudience: string;
  objectives: string[];
  outcomes: string[];
  usefulness: string;
  features: {
    essential: Feature[];
    recommended: Feature[];
    advanced: Feature[];
  };
  userJourney: string[];
  screens: Screen[];
  techStack: TechChoice[];
  architecture: string;
  architectureFlow: string[];
  integrations: Integration[];
  database: DbTable[];
  apis: ApiEndpoint[];
  assumptions: string[];
}

export interface Phase {
  id: string;
  name: string;
  goal: string;
}

export interface Task {
  id: string;
  phase: string;
  title: string;
  description: string;
  expectedResult: string;
  priority: Priority;
  effort: string;
  dependencies: string[];
  status: TaskStatus;
  custom?: boolean;
  guide?: string;
  guideSource?: ProjectSource;
  guideAt?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  source?: ProjectSource;
  error?: boolean;
}

export interface ReviewIssue {
  area: string;
  severity: Priority;
  problem: string;
  why: string;
  recommendation: string;
}

export interface AiReview {
  score: number;
  summary: string;
  issues: ReviewIssue[];
  checklist: string[];
  createdAt: string;
  source: ProjectSource;
}

export interface Project {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: ProjectSource;
  input: ProjectInput;
  clarifications: Clarification[];
  blueprint: Blueprint;
  phases: Phase[];
  tasks: Task[];
  totalEstimate: string;
  timelineNote: string;
  chat: ChatMessage[];
  review: AiReview | null;
  checklistDone: string[];
}

export interface HealthStatus {
  reachable: boolean;
  aiConfigured: boolean;
  provider: string;
  model: string;
  authRequired: boolean;
  message: string;
}

export interface RoadmapResult {
  phases: Phase[];
  tasks: Task[];
  totalEstimate: string;
  timelineNote: string;
}

export const CATEGORIES = [
  'AI Application',
  'Automation',
  'Web Development',
  'Mobile Application',
  'Education Technology',
  'Productivity Tool',
  'Other',
] as const;

export const PLATFORMS = [
  'Web (browser)',
  'Mobile (Android/iOS)',
  'Desktop',
  'Web + Mobile',
  'Chatbot / Messaging',
  'Not sure yet',
] as const;

export const EXPERIENCE_LEVELS: { value: Experience; label: string; hint: string }[] = [
  { value: 'beginner', label: 'Beginner', hint: 'New to coding or built only small exercises' },
  { value: 'intermediate', label: 'Intermediate', hint: 'Built a few small apps or projects' },
  { value: 'advanced', label: 'Advanced', hint: 'Comfortable with full-stack development' },
];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Not started',
  in_progress: 'In progress',
  done: 'Completed',
};

export const EMPTY_INPUT: ProjectInput = {
  name: '',
  idea: '',
  problem: '',
  users: '',
  category: '',
  platform: '',
  experience: '',
  technologies: '',
  budget: '',
  timeline: '',
};

export function emptyBlueprint(): Blueprint {
  return {
    title: '',
    summary: '',
    problemStatement: '',
    solution: '',
    targetAudience: '',
    objectives: [],
    outcomes: [],
    usefulness: '',
    features: { essential: [], recommended: [], advanced: [] },
    userJourney: [],
    screens: [],
    techStack: [],
    architecture: '',
    architectureFlow: [],
    integrations: [],
    database: [],
    apis: [],
    assumptions: [],
  };
}

export type ProjectUpdater = (fn: (p: Project) => Project) => Promise<boolean>;

export type WorkspaceTab = 'overview' | 'blueprint' | 'roadmap' | 'assistant' | 'readiness' | 'export';

export interface WorkspaceProps {
  project: Project;
  update: ProjectUpdater;
  goTab: (tab: WorkspaceTab, extra?: Record<string, string>) => void;
}
