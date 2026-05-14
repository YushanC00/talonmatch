import { http, HttpResponse } from 'msw';

// Honesty-patch-compliant: match_score < 100 when requirements contain unmatched skills
const MOCK_JOBS = [
  {
    job_title: 'Senior UX Designer',
    company: 'Mock Corp',
    location: 'Toronto, ON',
    is_remote: false,
    match_score: 85,          // < 100 — user missing 'Kotlin'
    requirements_array: ['Figma', 'User Research', 'Kotlin'],
    url: 'https://example.com/jobs/1',
    description: 'Design user experiences for enterprise SaaS.',
    postedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    job_title: 'Product Designer',
    company: 'Startup Labs',
    location: 'Vancouver, BC',
    is_remote: true,
    match_score: 92,
    requirements_array: ['Figma', 'Prototyping', 'Design Systems'],
    url: 'https://example.com/jobs/2',
    description: 'Build design systems from scratch.',
    postedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
];

const MOCK_USER = {
  id: 'mock-user-1',
  name: 'Alex Chen',
  email: 'alex@example.com',
  avatar_url: 'https://ui-avatars.com/api/?name=Alex+Chen&background=10B981&color=fff&size=40',
};

const MOCK_MATCH_RESPONSE = {
  resume_skills: ['Figma', 'Prototyping', 'CSS', 'React'],
  resume_experience: [{ title: 'UX Designer', company: 'Old Co', period: '2020–2023', bullets: [] }],
  jobs: MOCK_JOBS,
  count: MOCK_JOBS.length,
};

const ZEN_USER = {
  id: '123',
  name: 'Zen Hunter',
  email: 'hunter@talonmatch.com',
  avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Talon',
};

export const handlers = [
  // Google auth — returns fake user profile
  http.post('/auth/google', () => HttpResponse.json(MOCK_USER)),

  // Auth gate — used by AuthModal
  http.post('/api/auth/google', () => HttpResponse.json(ZEN_USER)),

  // Resume persistence — simulates Supabase save
  http.post('/api/resumes', () =>
    HttpResponse.json({ id: 'resume-mock-1', saved: true }, { status: 201 })
  ),

  // Background job search used by App on mount
  http.get('/api/jobs/search', () =>
    HttpResponse.json({ count: MOCK_JOBS.length, jobs: MOCK_JOBS })
  ),

  // Resume analysis / match
  http.post('/api/match', () => HttpResponse.json(MOCK_MATCH_RESPONSE)),

  // Tailor resume — SSE stream with a single Skills section
  http.post('/api/tailor-resume', () =>
    new HttpResponse(
      'data: {"type":"section","section":{"title":"Skills","rationale":"","content":[{"id":"skills-hard-0","label":"Technical","original":"Figma, Prototyping","tailored":"Figma, Prototyping"}]}}\n\ndata: {"type":"done","usage":{}}\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } }
    )
  ),
];
