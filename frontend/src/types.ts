// ── Design DNA ────────────────────────────────────────────────────────────────

export interface StyleConfig {
  fontSize: { body: number; heading: number; name: number }
  fontProfile: 'serif' | 'sans-serif' | 'monospace' | 'mixed' | 'unknown'
  fontNames: string[]
  hasBoldFont: boolean
  layout: { columns: 1 | 2; marginLeft: number; pageWidth: number; headerAlign?: 'left' | 'center' }
  bullets: string
  sections: string[]
  sectionColumns: { left: string[]; right: string[] }
  accentColor: string | null
}

// ── Resume types ───────────────────────────────────────────────────────────────

export interface WorkExperience {
  title: string
  company: string
  period: string
  bullets?: string[]
  description?: string
}

export interface Project {
  name: string
  description: string
}

export interface Education {
  degree: string
  school?: string
  year?: string
}

export interface ParsedResume {
  full_name?: string
  contact_line?: string
  summary_section_title?: string
  summary?: string
  skills: string[]
  experience: WorkExperience[]
  projects?: Project[]
  education?: Education[]
  city?: string
  province?: string
  country?: string
  most_recent_job_title?: string
  style_config?: StyleConfig | null
}

// ── Job types ──────────────────────────────────────────────────────────────────

export interface Job {
  job_id?: string
  job_title: string
  company: string
  location?: string
  is_remote?: boolean
  match_score: number
  match_reason?: string
  requirements_array?: string[]
  url?: string
  description?: string
  postedAt?: string
  pay_range?: string
  company_url?: string
}

// ── Tailored resume v4 (SSE streaming format) ─────────────────────────────────

export interface TailoredContentItem {
  id: string
  label: string
  original: string
  tailored: string
  rationale?: string
}

export interface TailoredSection {
  title: string
  rationale: string
  content: TailoredContentItem[]
}

export interface TailoredResume {
  _version: 4
  sections: TailoredSection[]
}

// ── SSE event types ────────────────────────────────────────────────────────────

export type SSEEvent =
  | { type: 'section'; section: TailoredSection }
  | { type: 'error'; message: string }
  | { type: 'done' }

// ── API response types ─────────────────────────────────────────────────────────

export interface MatchApiResponse {
  resume_skills: string[]
  resume_experience: WorkExperience[]
  jobs: Job[]
}

// ── Supabase application record ────────────────────────────────────────────────

export interface ApplicationRecord {
  id?: string
  user_id: string
  job_id: string
  job_title: string
  company: string
  tailored_json: TailoredResume
  match_score: number
  status: 'tailored'
  created_at?: string
  updated_at?: string
}
