import { vi, describe, it, expect, beforeEach } from 'vitest';
import { saveApplication } from '../../src/lib/saveApplication';
import { fetchApplication } from '../../src/lib/fetchApplication';

// vi.hoisted runs before vi.mock, so the factory can safely reference `mocks`
const mocks = vi.hoisted(() => {
  const builder = {};
  const upsert      = vi.fn();
  const maybeSingle = vi.fn();
  const eq          = vi.fn().mockImplementation(() => builder);
  const select      = vi.fn().mockImplementation(() => builder);
  Object.assign(builder, { upsert, select, eq, maybeSingle });

  const getSession = vi.fn();
  const from       = vi.fn().mockImplementation(() => builder);
  return { builder, upsert, maybeSingle, eq, select, getSession, from };
});

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    from:  mocks.from,
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_USER_ID = 'user-uuid-test-abc123';
const MOCK_SESSION = { data: { session: { user: { id: MOCK_USER_ID } } } };
const NO_SESSION   = { data: { session: null } };

const TAILORED_JSON = {
  aiResponse: {
    summary: { tailored_text: 'Experienced engineer.', original_text: 'Engineer.', change_reason: '' },
    tailored_experience: [],
    tailored_projects:   [],
  },
  reviews:    { summary: 'accepted' },
  editValues: {},
};

const PAYLOAD = {
  jobId:        'https://example.com/jobs/456',
  jobTitle:     'Senior Software Engineer',
  company:      'Acme Corp',
  tailoredJson: TAILORED_JSON,
  matchScore:   85,
};

// ── saveApplication ───────────────────────────────────────────────────────────

describe('saveApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(MOCK_SESSION);
  });

  it('upserts record when session exists', async () => {
    mocks.upsert.mockResolvedValue({ error: null });
    await expect(saveApplication(PAYLOAD)).resolves.toBeUndefined();

    expect(mocks.from).toHaveBeenCalledWith('applications');
    const [row, opts] = mocks.upsert.mock.calls[0];
    expect(row.user_id).toBe(MOCK_USER_ID);
    expect(row.job_id).toBe(PAYLOAD.jobId);
    expect(row.job_title).toBe(PAYLOAD.jobTitle);
    expect(row.company_name).toBe(PAYLOAD.company);
    expect(row.match_score).toBe(PAYLOAD.matchScore);
    expect(row.tailored_json).toBe(PAYLOAD.tailoredJson);
    expect(row.status).toBe('tailored');
    expect(opts.onConflict).toBe('user_id, job_id');
  });

  it('throws "Not signed in" with no session', async () => {
    mocks.getSession.mockResolvedValue(NO_SESSION);
    await expect(saveApplication(PAYLOAD)).rejects.toThrow('Not signed in');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('throws with supabase error message on DB failure', async () => {
    mocks.upsert.mockResolvedValue({ error: { message: 'duplicate key value', details: null } });
    await expect(saveApplication(PAYLOAD)).rejects.toThrow('duplicate key value');
  });

  it('Rule 11 — tailoredJson stored verbatim (strict reference equality)', async () => {
    mocks.upsert.mockResolvedValue({ error: null });
    await saveApplication(PAYLOAD);
    const [row] = mocks.upsert.mock.calls[0];
    expect(row.tailored_json).toBe(PAYLOAD.tailoredJson);
  });
});

// ── fetchApplication ──────────────────────────────────────────────────────────

describe('fetchApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(MOCK_SESSION);
  });

  it('returns structured object with tailoredJson, matchScore, companyName', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { tailored_json: TAILORED_JSON, match_score: 85, company_name: 'Acme Corp' },
      error: null,
    });
    const result = await fetchApplication(PAYLOAD.jobId);

    expect(result.tailoredJson).toBe(TAILORED_JSON);
    expect(result.matchScore).toBe(85);
    expect(result.companyName).toBe('Acme Corp');
    expect(mocks.select).toHaveBeenCalledWith('tailored_json, company_name, match_score');
    expect(mocks.eq).toHaveBeenCalledWith('user_id', MOCK_USER_ID);
    expect(mocks.eq).toHaveBeenCalledWith('job_id', PAYLOAD.jobId);
  });

  it('returns null when no session (never hits DB)', async () => {
    mocks.getSession.mockResolvedValue(NO_SESSION);
    const result = await fetchApplication(PAYLOAD.jobId);
    expect(result).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns null when no row found (maybeSingle returns null data)', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await fetchApplication(PAYLOAD.jobId);
    expect(result).toBeNull();
  });

  it('handles defensive array response — takes first element', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: [{ tailored_json: TAILORED_JSON, match_score: 72, company_name: 'Test Co' }],
      error: null,
    });
    const result = await fetchApplication(PAYLOAD.jobId);
    expect(result.tailoredJson).toBe(TAILORED_JSON);
    expect(result.matchScore).toBe(72);
  });

  it('throws Error instance on DB failure', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'connection refused', details: null } });
    await expect(fetchApplication(PAYLOAD.jobId)).rejects.toThrow('connection refused');
  });
});

// ── save → fetch roundtrip ────────────────────────────────────────────────────

describe('save → fetch roundtrip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(MOCK_SESSION);
  });

  it('fetch returns tailoredJson matching what was saved', async () => {
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.maybeSingle.mockResolvedValue({
      data: { tailored_json: TAILORED_JSON, match_score: PAYLOAD.matchScore, company_name: PAYLOAD.company },
      error: null,
    });

    await saveApplication(PAYLOAD);
    const fetched = await fetchApplication(PAYLOAD.jobId);

    expect(fetched.tailoredJson).toStrictEqual(TAILORED_JSON);
    expect(fetched.matchScore).toBe(PAYLOAD.matchScore);
    expect(fetched.companyName).toBe(PAYLOAD.company);
  });
});
