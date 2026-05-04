import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GoogleSignIn from '../components/GoogleSignIn';

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

const MOCK_SESSION = {
  user: {
    id: 'mock-user-1',
    email: 'alex@example.com',
    user_metadata: {
      full_name: 'Alex Chen',
      avatar_url: 'https://ui-avatars.com/api/?name=Alex+Chen',
    },
  },
};

const PARSED_RESUME = {
  skills: ['Figma', 'React', 'CSS'],
  experience: [{ title: 'UX Designer', company: 'Old Co', period: '2020–2023', bullets: [] }],
};

// Minimal wrapper mirroring App's auth state transition
function AuthFlow({ parsedResume = null }) {
  const [user, setUser] = require('react').useState(null);
  const userName   = user?.user_metadata?.full_name ?? user?.email ?? '';
  const userAvatar = user?.user_metadata?.avatar_url ?? '';
  return (
    <div>
      {user ? (
        <img src={userAvatar} alt={userName} data-testid="user-avatar" />
      ) : (
        <GoogleSignIn parsedResume={parsedResume} onLogin={setUser} />
      )}
    </div>
  );
}

function mockSignedIn(delayMs = 0) {
  supabase.auth.onAuthStateChange.mockImplementationOnce((cb) => {
    if (delayMs > 0) {
      setTimeout(() => cb('SIGNED_IN', MOCK_SESSION), delayMs);
    } else {
      cb('SIGNED_IN', MOCK_SESSION);
    }
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
  // Reset from() to a fresh mock each test
  supabase.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ data: [], error: null }) });
});

// ─── Auth state transition ────────────────────────────────────────────────────

describe('Google Sign-In — auth state transition', () => {
  it('shows "Sign in with Google" button when logged out', () => {
    render(<AuthFlow />);
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.queryByTestId('user-avatar')).not.toBeInTheDocument();
  });

  it('transitions to logged-in state and shows user avatar after successful auth', async () => {
    mockSignedIn();
    render(<AuthFlow />);

    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

    await waitFor(() => {
      expect(screen.getByTestId('user-avatar')).toBeInTheDocument();
    });

    expect(screen.getByAltText('Alex Chen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument();
  });

  it('shows loading state while auth is in-flight', async () => {
    mockSignedIn(50);

    render(<AuthFlow />);
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

    expect(screen.getByRole('button', { name: /signing in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByTestId('user-avatar')).toBeInTheDocument();
    });
  });

  it('shows error message when auth fails', async () => {
    supabase.auth.signInWithOAuth.mockResolvedValueOnce({
      data: null,
      error: { message: 'OAuth error' },
    });

    render(<AuthFlow />);
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

    await waitFor(() => {
      expect(screen.getByText(/oauth error/i)).toBeInTheDocument();
    });

    expect(screen.queryByTestId('user-avatar')).not.toBeInTheDocument();
  });
});

// ─── Resume persistence ───────────────────────────────────────────────────────

describe('Google Sign-In — resume persistence', () => {
  it('upserts parsedResume to resumes table when skills are present', async () => {
    mockSignedIn();
    const upsertMock = vi.fn().mockResolvedValue({ data: [], error: null });
    supabase.from.mockReturnValue({ upsert: upsertMock });

    render(<AuthFlow parsedResume={PARSED_RESUME} />);
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

    await waitFor(() => {
      expect(screen.getByTestId('user-avatar')).toBeInTheDocument();
    });

    expect(supabase.from).toHaveBeenCalledWith('resumes');
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'mock-user-1',
        skills: PARSED_RESUME.skills,
        experience: PARSED_RESUME.experience,
      }),
      expect.objectContaining({ onConflict: 'user_id' })
    );
  });

  it('does NOT call resumes upsert when parsedResume has no skills', async () => {
    mockSignedIn();
    const upsertMock = vi.fn().mockResolvedValue({ data: [], error: null });
    supabase.from.mockReturnValue({ upsert: upsertMock });

    render(<AuthFlow parsedResume={{ skills: [], experience: [] }} />);
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

    await waitFor(() => {
      expect(screen.getByTestId('user-avatar')).toBeInTheDocument();
    });

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('does NOT call resumes upsert when parsedResume is null', async () => {
    mockSignedIn();
    const upsertMock = vi.fn().mockResolvedValue({ data: [], error: null });
    supabase.from.mockReturnValue({ upsert: upsertMock });

    render(<AuthFlow parsedResume={null} />);
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

    await waitFor(() => {
      expect(screen.getByTestId('user-avatar')).toBeInTheDocument();
    });

    expect(upsertMock).not.toHaveBeenCalled();
  });
});

// ─── Honesty patch — mocked data audit ───────────────────────────────────────

describe('Mock data — honesty patch compliance', () => {
  it('no mock job returns 100% match with non-empty requirements_array', async () => {
    const res = await fetch('/api/match', { method: 'POST' });
    const data = await res.json();

    for (const job of data.jobs) {
      if (job.requirements_array?.length > 0) {
        expect(job.match_score).toBeLessThan(100);
      }
    }
  });
});
