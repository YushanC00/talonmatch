import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function AuthModal({ onLogin, onClose, skillsCount = 0, jobTitle, company }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const heading = jobTitle ? 'Sign in to tailor your resume' : 'Sign in to save your progress';
  const subtext = jobTitle
    ? skillsCount > 0
      ? `Your ${skillsCount} detected skills are ready to go — no re-upload needed.`
      : `Sign in to tailor your application for ${company || 'this role'}.`
    : 'Your tailored resumes and matches will be saved.';

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

    if (oauthError) {
      setError(
        oauthError.message?.includes('not enabled')
          ? 'Google sign-in is not configured yet.'
          : 'Auth failed'
      );
      setLoading(false);
      return;
    }

    // Production: page redirects here — code below never runs.
    // Tests: signInWithOAuth is mocked (no redirect), so we await the session.
    const subRef = { current: null };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        subRef.current?.unsubscribe();
        onLogin(session.user);
        onClose();
      }
    });
    subRef.current = subscription;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 modal-fade-in"
      data-testid="modal-backdrop"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/20" />
      <div
        className="relative bg-white rounded-2xl border border-gray-100 p-8 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-gray-900 mb-1">{heading}</h2>
        <p className="text-sm text-gray-400 mb-6">{subtext}</p>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              Authenticating…
            </>
          ) : (
            <>
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        {error && <p className="mt-3 text-xs text-red-500 text-center">Auth failed</p>}
      </div>
    </div>
  );
}
