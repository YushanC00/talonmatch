// @ts-nocheck — integration test: vi.mocked casting not needed in test infra
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import JobCard from '../components/JobCard';
import AuthModal from '../components/AuthModal';

// ── Supabase mock ──────────────────────────────────────────────────────────────
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    from: vi.fn(() => ({
      upsert: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

import { supabase } from '../lib/supabase';

// Supabase-shaped user — matches session.user from Google OAuth
const ZEN_SESSION = {
  user: {
    id: '123',
    email: 'hunter@talonmatch.com',
    user_metadata: {
      full_name: 'Zen Hunter',
      avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Talon',
    },
  },
};

const TEST_JOB = {
  job_title: 'Senior UX Designer',
  company: 'Acme Corp',
  location: 'Toronto, ON',
  is_remote: false,
  match_score: 85,
  requirements_array: ['Figma', 'User Research', 'Kotlin'],
  url: 'https://example.com/1',
  description: '',
  postedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
};

const PARSED_RESUME = {
  skills: ['Figma', 'Prototyping'],
  experience: [],
};

// Helper: configure mock to fire SIGNED_IN immediately when subscribed
function mockSignedIn() {
  supabase.auth.onAuthStateChange.mockImplementationOnce((cb) => {
    cb('SIGNED_IN', ZEN_SESSION);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
  supabase.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
});

// ─── Auth Gate ────────────────────────────────────────────────────────────────

describe('Auth Gate — Tailor Resume button', () => {
  it('unauthenticated click shows auth modal with job-specific copy, NOT the tailor editor', async () => {
    render(
      <JobCard
        job={TEST_JOB}
        parsedResume={PARSED_RESUME}
        onViewDetails={vi.fn()}
        isLoggedIn={false}
        onLogin={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /tailor & apply/i }));

    await waitFor(() => {
      expect(screen.getByText(/sign in to tailor your resume/i)).toBeInTheDocument();
    });

    // Shows skill count in subtext
    expect(screen.getByText(/2 detected skills are ready to go/i)).toBeInTheDocument();
    expect(screen.queryByText(/review tailored resume/i)).not.toBeInTheDocument();
  });

  it('authenticated user proceeds directly without auth modal', () => {
    render(
      <JobCard
        job={TEST_JOB}
        parsedResume={PARSED_RESUME}
        onViewDetails={vi.fn()}
        isLoggedIn={true}
        resumeFetched={true}
        onLogin={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /tailor & apply/i }));

    expect(screen.queryByText(/sign in to save your progress/i)).not.toBeInTheDocument();
  });

  it('auth modal closes and onLogin fires after successful Google sign-in', async () => {
    const onLogin = vi.fn();
    mockSignedIn();

    render(
      <JobCard
        job={TEST_JOB}
        parsedResume={PARSED_RESUME}
        onViewDetails={vi.fn()}
        isLoggedIn={false}
        onLogin={onLogin}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /tailor & apply/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'hunter@talonmatch.com' })
      );
    });

    // Modal dismissed after login
    expect(screen.queryByText(/sign in to tailor your resume/i)).not.toBeInTheDocument();
  });
});

// ─── Auth Gate — localStorage persistence ─────────────────────────────────────

describe('Auth Gate — localStorage state persistence', () => {
  it('saves parsedResume to localStorage when opening auth modal', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(
      <JobCard
        job={TEST_JOB}
        parsedResume={PARSED_RESUME}
        onViewDetails={vi.fn()}
        isLoggedIn={false}
        onLogin={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /tailor & apply/i }));

    expect(setItem).toHaveBeenCalledWith(
      'talonmatch_pending_resume',
      expect.stringContaining('Figma')
    );
    expect(setItem).toHaveBeenCalledWith(
      'talonmatch_pending_tailor_job',
      TEST_JOB.url
    );
    setItem.mockRestore();
  });

  it('auto-triggers tailoring for matching pendingTailorJobUrl when logged in', () => {
    const onPendingTailorHandled = vi.fn();
    render(
      <JobCard
        job={TEST_JOB}
        parsedResume={PARSED_RESUME}
        onViewDetails={vi.fn()}
        isLoggedIn={true}
        onLogin={vi.fn()}
        pendingTailorJobUrl={TEST_JOB.url}
        onPendingTailorHandled={onPendingTailorHandled}
      />
    );

    expect(onPendingTailorHandled).toHaveBeenCalledOnce();
    expect(screen.queryByText(/sign in to tailor your resume/i)).not.toBeInTheDocument();
  });

  it('does NOT auto-trigger for a non-matching pendingTailorJobUrl', () => {
    const onPendingTailorHandled = vi.fn();
    render(
      <JobCard
        job={TEST_JOB}
        parsedResume={PARSED_RESUME}
        onViewDetails={vi.fn()}
        isLoggedIn={true}
        onLogin={vi.fn()}
        pendingTailorJobUrl="https://example.com/different-job"
        onPendingTailorHandled={onPendingTailorHandled}
      />
    );

    expect(onPendingTailorHandled).not.toHaveBeenCalled();
  });
});

// ─── AuthModal ────────────────────────────────────────────────────────────────

describe('AuthModal', () => {
  it('renders heading and Google button', () => {
    render(<AuthModal onLogin={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/sign in to save your progress/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  it('calls supabase.auth.signInWithOAuth and fires onLogin with session user', async () => {
    const onLogin = vi.fn();
    mockSignedIn();

    render(<AuthModal onLogin={onLogin} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'hunter@talonmatch.com' })
      );
    });
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    );
  });

  it('shows "Authenticating…" and calls onClose after successful login', async () => {
    const onClose = vi.fn();
    // Delay SIGNED_IN so we can observe the loading state
    supabase.auth.onAuthStateChange.mockImplementationOnce((cb) => {
      setTimeout(() => cb('SIGNED_IN', ZEN_SESSION), 30);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    render(<AuthModal onLogin={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    // Authenticating… should appear immediately
    expect(screen.getByRole('button', { name: /authenticating/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /authenticating/i })).toBeDisabled();

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows error when OAuth fails', async () => {
    supabase.auth.signInWithOAuth.mockResolvedValueOnce({
      data: null,
      error: { message: 'Auth failed' },
    });

    render(<AuthModal onLogin={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    await waitFor(() => {
      expect(screen.getByText(/auth failed/i)).toBeInTheDocument();
    });
  });

  it('closes when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<AuthModal onLogin={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });
});

// ─── App-level onAuthStateChange ──────────────────────────────────────────────

describe('App — onAuthStateChange session sync', () => {
  it('supabase.auth.onAuthStateChange is called with provider google on sign-in click', async () => {
    mockSignedIn();

    render(<AuthModal onLogin={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    await waitFor(() => {
      expect(supabase.auth.onAuthStateChange).toHaveBeenCalled();
    });
  });

  it('SIGNED_IN event updates user context and fires onLogin', async () => {
    const onLogin = vi.fn();
    mockSignedIn();

    render(<AuthModal onLogin={onLogin} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '123',
          email: 'hunter@talonmatch.com',
        })
      );
    });
  });
});

// ─── Honesty Patch — post-auth audit ─────────────────────────────────────────

describe('Honesty Patch — cards after auth', () => {
  it('server 100% with missing skills caps badge at 99% when logged in', () => {
    const contradictoryJob = {
      ...TEST_JOB,
      match_score: 100,
      requirements_array: ['Figma', 'Kotlin', 'Android SDK'],
    };
    render(
      <JobCard
        job={contradictoryJob}
        parsedResume={PARSED_RESUME}
        onViewDetails={vi.fn()}
        isLoggedIn={true}
        onLogin={vi.fn()}
      />
    );

    expect(screen.queryByLabelText(/100%\s*match/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/99%\s*match/i)).toBeInTheDocument();
  });
});
