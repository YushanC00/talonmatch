import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UserMenu from './UserMenu';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

import { supabase } from '../lib/supabase';

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.signOut.mockResolvedValue({});
  supabase.auth.signInWithOAuth.mockResolvedValue({ error: null });
  supabase.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
});

const SUPABASE_USER = {
  id: 'u1',
  email: 'zen@talonmatch.com',
  user_metadata: {
    full_name: 'Zen Hunter',
    avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Talon',
  },
};

const NO_AVATAR_USER = {
  id: 'u2',
  email: 'ghost@talonmatch.com',
  user_metadata: { full_name: 'Ghost User', avatar_url: '' },
};

const RESUME_WITH_SKILLS = { skills: ['React', 'TypeScript', 'Node.js'], experience: [] };

describe('UserMenu — guest mode (no user)', () => {
  it('renders dashed guest trigger when no user', () => {
    render(<UserMenu parsedResume={RESUME_WITH_SKILLS} onSignOut={vi.fn()} />);
    expect(screen.getByTestId('guest-avatar-trigger')).toBeInTheDocument();
  });

  it('clicking guest trigger opens dropdown', () => {
    render(<UserMenu parsedResume={RESUME_WITH_SKILLS} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByTestId('guest-avatar-trigger'));
    expect(screen.getByText('Guest Session')).toBeInTheDocument();
  });

  it('shows skill count badge when skills present', () => {
    render(<UserMenu parsedResume={RESUME_WITH_SKILLS} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByTestId('guest-avatar-trigger'));
    expect(screen.getByText(/3 skills/i)).toBeInTheDocument();
  });

  it('hides skill count badge when no skills', () => {
    render(<UserMenu parsedResume={{ skills: [], experience: [] }} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByTestId('guest-avatar-trigger'));
    expect(screen.queryByText(/detected — sign in to save/i)).not.toBeInTheDocument();
  });

  it('shows "Sign in to Save Skills" button', () => {
    render(<UserMenu parsedResume={RESUME_WITH_SKILLS} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByTestId('guest-avatar-trigger'));
    expect(screen.getByRole('button', { name: /sign in to save skills/i })).toBeInTheDocument();
  });

  it('clicking sign-in calls supabase.auth.signInWithOAuth', async () => {
    render(<UserMenu parsedResume={RESUME_WITH_SKILLS} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByTestId('guest-avatar-trigger'));
    fireEvent.click(screen.getByRole('button', { name: /sign in to save skills/i }));
    await waitFor(() => expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    ));
  });

  it('saves skills to localStorage before sign-in', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(<UserMenu parsedResume={RESUME_WITH_SKILLS} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByTestId('guest-avatar-trigger'));
    fireEvent.click(screen.getByRole('button', { name: /sign in to save skills/i }));
    await waitFor(() => expect(setItem).toHaveBeenCalledWith(
      'talonmatch_pending_resume',
      expect.stringContaining('React')
    ));
    setItem.mockRestore();
  });

  it('shows New Search when onNewSearch provided', () => {
    render(<UserMenu parsedResume={RESUME_WITH_SKILLS} onSignOut={vi.fn()} onNewSearch={vi.fn()} />);
    fireEvent.click(screen.getByTestId('guest-avatar-trigger'));
    expect(screen.getByRole('button', { name: /new search/i })).toBeInTheDocument();
  });

  it('New Search calls onNewSearch and closes dropdown', () => {
    const onNewSearch = vi.fn();
    render(<UserMenu parsedResume={RESUME_WITH_SKILLS} onSignOut={vi.fn()} onNewSearch={onNewSearch} />);
    fireEvent.click(screen.getByTestId('guest-avatar-trigger'));
    fireEvent.click(screen.getByRole('button', { name: /new search/i }));
    expect(onNewSearch).toHaveBeenCalledOnce();
    expect(screen.queryByText('Guest Session')).not.toBeInTheDocument();
  });
});

describe('UserMenu — avatar', () => {
  it('renders img when avatar_url present', () => {
    render(<UserMenu user={SUPABASE_USER} onSignOut={vi.fn()} />);
    const img = screen.getByTestId('user-avatar');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', SUPABASE_USER.user_metadata.avatar_url);
  });

  it('renders initials fallback when avatar_url is empty', () => {
    render(<UserMenu user={NO_AVATAR_USER} onSignOut={vi.fn()} />);
    const fallback = screen.getByTestId('user-avatar');
    expect(fallback.tagName).toBe('DIV');
    expect(fallback).toHaveTextContent('GU');
  });
});

describe('UserMenu — dropdown', () => {
  it('dropdown hidden by default', () => {
    render(<UserMenu user={SUPABASE_USER} onSignOut={vi.fn()} />);
    expect(screen.queryByText('Sign Out')).not.toBeInTheDocument();
  });

  it('clicking avatar opens dropdown with name and email', () => {
    render(<UserMenu user={SUPABASE_USER} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    expect(screen.getByText('Zen Hunter')).toBeInTheDocument();
    expect(screen.getByText('zen@talonmatch.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('"New Search" only shows when onNewSearch prop provided', () => {
    const { rerender } = render(<UserMenu user={SUPABASE_USER} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    expect(screen.queryByRole('button', { name: /new search/i })).not.toBeInTheDocument();

    rerender(<UserMenu user={SUPABASE_USER} onSignOut={vi.fn()} onNewSearch={vi.fn()} />);
    expect(screen.getByRole('button', { name: /new search/i })).toBeInTheDocument();
  });

  it('"New Search" calls onNewSearch and closes dropdown', () => {
    const onNewSearch = vi.fn();
    render(<UserMenu user={SUPABASE_USER} onSignOut={vi.fn()} onNewSearch={onNewSearch} />);
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /new search/i }));
    expect(onNewSearch).toHaveBeenCalledOnce();
    expect(screen.queryByText('Sign Out')).not.toBeInTheDocument();
  });

  it('"Sign Out" calls supabase.auth.signOut and onSignOut', async () => {
    const onSignOut = vi.fn();
    render(<UserMenu user={SUPABASE_USER} onSignOut={onSignOut} />);
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect(onSignOut).toHaveBeenCalled();
    });
  });
});
