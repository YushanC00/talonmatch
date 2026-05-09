import { useState, useEffect, useRef } from 'react';
import { Wind, SlidersHorizontal, Briefcase, Zap, RefreshCw } from 'lucide-react';
import ResumeUpload from './components/ResumeUpload';
import JobFeed from './components/JobFeed';
import GoogleSignIn from './components/GoogleSignIn';
import UserMenu from './components/UserMenu';
import { supabase } from './lib/supabase';
import { resolveCity } from './utils/geolocation';
import './index.css';

function TalonMatchLogo({ size = 'md' }) {
  const iconSize = size === 'lg' ? 22 : 18;
  const textClass = size === 'lg' ? 'text-2xl' : 'text-lg';
  return (
    <div className="flex items-center gap-2">
      <Wind size={iconSize} className="text-green-600 shrink-0" strokeWidth={2} />
      <span className={`${textClass} tracking-tight`}>
        <span className="font-extrabold text-gray-900">Talon</span>
        <span className="font-normal text-gray-700">Match</span>
      </span>
    </div>
  );
}

function randomPostedAt() {
  const daysAgo = Math.floor(Math.random() * 30);
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function ensurePostedAt(jobs) {
  return jobs.map(job => {
    const valid = job.postedAt && !isNaN(new Date(job.postedAt).getTime());
    return valid ? job : { ...job, postedAt: randomPostedAt() };
  });
}

async function matchResume({ file, location, signal }) {
  const params = new URLSearchParams();
  if (location) params.set('location', location);
  const body = new FormData();
  body.append('resume', file);
  const res = await fetch(`/api/match?${params}`, { method: 'POST', body, signal });
  const text = await res.text();
  if (!text) throw new Error(`Server returned empty response (HTTP ${res.status})`);
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error(`Invalid server response: ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

async function fetchBackgroundJobs(city) {
  try {
    const params = new URLSearchParams({ title: 'Software Engineer', results_per_page: '9' });
    if (city) params.set('location', city);
    const res = await fetch(`/api/jobs/search?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return ensurePostedAt(
      (data.jobs || []).map(job => ({
        ...job,
        match_score: job.match_score ?? (Math.floor(Math.random() * 30) + 60),
      }))
    );
  } catch {
    return [];
  }
}

const DATE_WINDOWS_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7  * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const SORT_OPTIONS = [
  { value: 'match_score', label: 'Best Match' },
  { value: 'company',     label: 'Company A–Z' },
  { value: 'job_title',   label: 'Title A–Z' },
];

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [results, setResults] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [geoCity, setGeoCity] = useState('');
  const [backgroundJobs, setBackgroundJobs] = useState([]);
  const [user, setUser] = useState(null);
  const [pendingTailorJobUrl, setPendingTailorJobUrl] = useState(null);

  // Header filter / sort state (lifted from JobFeed)
  const [minScore, setMinScore] = useState(0);
  const [dateFilter, setDateFilter] = useState('any');
  const [sortBy, setSortBy] = useState('match_score');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef(null);

  const [refreshing, setRefreshing] = useState(false);
  const [syncToast, setSyncToast] = useState(false);
  const [tailoredJobIds, setTailoredJobIds] = useState(new Set());
  const lastFileRef = useRef(null);

  // Ref so the auth listener always sees the latest results without re-subscribing
  const resultsRef = useRef(null);
  useEffect(() => { resultsRef.current = results; }, [results]);

  // Load existing tailored job IDs when user is authenticated
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('applications').select('job_id').eq('user_id', user.id)
      .then(({ data }) => {
        if (data?.length) setTailoredJobIds(new Set(data.map(a => a.job_id)));
      })
      .catch(() => {});
  }, [user?.id]);

  const handleCommitTailoring = (jobId) => {
    setTailoredJobIds(prev => new Set([...prev, jobId]));
  };

  // Escape closes upload overlay
  useEffect(() => {
    if (revealed) return;
    const onKey = (e) => { if (e.key === 'Escape') handleOverlayClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Click-outside closes sort popover
  useEffect(() => {
    if (!showFilters) return;
    const handler = (e) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target)) setShowFilters(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilters]);

  // Geolocation + background job prefetch
  useEffect(() => {
    let cancelled = false;

    async function initBackground() {
      const city = await resolveCity('');
      if (!cancelled && city) setGeoCity(city);

      const jobs = await fetchBackgroundJobs(city);
      if (!cancelled) setBackgroundJobs(jobs);
    }

    initBackground();
    return () => { cancelled = true; };
  }, []);

  // Re-fetch background jobs with resume location once a resume is processed
  useEffect(() => {
    const city = results?.resume_city;
    const province = results?.resume_province;
    if (!city) return;
    const loc = province ? `${city}, ${province}` : city;
    fetchBackgroundJobs(loc).then(jobs => {
      if (jobs.length > 0) setBackgroundJobs(jobs);
    }).catch(() => {});
  }, [results?.resume_city]);

  // Supabase auth — single source of truth via onAuthStateChange
  // INITIAL_SESSION: fires on page load with existing session (handles refresh/revisit)
  // SIGNED_IN:       fires after OAuth redirect or explicit sign-in
  // SIGNED_OUT:      fires after signOut()
  useEffect(() => {
    // Surface OAuth errors that land in the URL after redirect
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('error_description') || params.get('error');
    if (authError) {
      setError(`Sign-in failed: ${decodeURIComponent(authError).replace(/\+/g, ' ')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION' && session?.user) {
        // Existing session on page load — restore silently
        setUser(session.user);
        setRevealed(true);
      } else if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);

        // Restore results saved before OAuth redirect (so matched jobs reappear after page reload)
        const savedResultsStr = localStorage.getItem('talonmatch_pending_results');
        if (savedResultsStr) {
          try { setResults(JSON.parse(savedResultsStr)); } catch {}
          localStorage.removeItem('talonmatch_pending_results');
        }

        // Restore pending tailor job for auto-trigger
        const savedTailorJob = localStorage.getItem('talonmatch_pending_tailor_job');
        if (savedTailorJob) {
          setPendingTailorJobUrl(savedTailorJob);
          localStorage.removeItem('talonmatch_pending_tailor_job');
        }

        // Reveal immediately — upsert is background work, don't block the user
        requestAnimationFrame(() => requestAnimationFrame(() => setRevealed(true)));

        // Upsert parsed resume — prefer live results, fall back to pre-redirect localStorage save
        const r = resultsRef.current;
        const pendingStr = localStorage.getItem('talonmatch_pending_resume');
        const pending = pendingStr ? JSON.parse(pendingStr) : null;
        if (pendingStr) localStorage.removeItem('talonmatch_pending_resume');
        const toSave = (r?.resume_skills?.length > 0)
          ? { skills: r.resume_skills, experience: r.resume_experience ?? [] }
          : pending;
        if (toSave?.skills?.length > 0) {
          supabase.from('resumes').upsert(
            {
              user_id: session.user.id,
              skills: toSave.skills,
              experience: toSave.experience ?? [],
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          ).then(() => {}).catch(() => {});
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setRevealed(false);
        setResults(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleRefreshJobs = async () => {
    if (!lastFileRef.current) return;
    setRefreshing(true);
    try {
      await fetch('/api/cache/clear', { method: 'DELETE' });
      await handleSubmit({ file: lastFileRef.current });
      setSyncToast(true);
      setTimeout(() => setSyncToast(false), 3000);
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setRefreshing(false);
    }
  };

  const handleSubmit = async ({ file }) => {
    lastFileRef.current = file;
    setLoading(true);
    setError('');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const location = geoCity || '';
      const data = await matchResume({ file, location, signal: controller.signal });
      clearTimeout(timeoutId);
      // Client-side postedAt guarantee — works even when server is running old code
      if (data.jobs) data.jobs = ensurePostedAt(data.jobs);
      setResults(data);

      // Associate resume with signed-in user on every upload
      if (user?.id && data.resume_skills?.length > 0) {
        supabase.from('resumes').upsert(
          {
            user_id: user.id,
            skills: data.resume_skills,
            experience: data.resume_experience ?? [],
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        ).then(() => {}).catch(() => {});
      }

      // Double rAF: let React paint new jobs before triggering CSS transition
      requestAnimationFrame(() => requestAnimationFrame(() => setRevealed(true)));
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('[matchResume error]', err);
      if (err.name === 'AbortError') {
        setError('Analysis taking longer than expected. Please try a smaller PDF.');
      } else {
        setError(err.message ?? String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResults(null);
    setRevealed(false);
    setError('');
    setNotice('');
    setPendingTailorJobUrl(null);
    setMinScore(0);
    setDateFilter('any');
    setSortBy('match_score');
  };

  const handleSaveBeforeRedirect = () => {
    if (results) {
      localStorage.setItem('talonmatch_pending_results', JSON.stringify(results));
    }
  };

  const handleOverlayClose = () => {
    setRevealed(true);
    if (!user && results) {
      setNotice("Your results won't be saved. Sign in via 'Tailor Resume' on any card to keep your matches.");
    }
  };

  // Called by JobCard's AuthModal — supplements the onAuthStateChange listener
  const handleLogin = (userData) => {
    setUser(userData);
    requestAnimationFrame(() => requestAnimationFrame(() => setRevealed(true)));
  };

  const displayJobs  = results ? results.jobs : backgroundJobs;
  const parsedResume = results
    ? {
        skills: results.resume_skills,
        experience: results.resume_experience,
        projects: results.resume_projects || [],
        location: results.resume_location,
        city: results.resume_city || '',
        province: results.resume_province || '',
      }
    : { skills: [], experience: [] };
  const skillsCount    = results?.resume_skills?.length ?? 0;
  const filtersActive  = minScore !== 0 || dateFilter !== 'any';

  const now = Date.now();
  const filteredJobs = displayJobs
    .filter(j => j.match_score >= minScore)
    .filter(j => {
      if (dateFilter === 'any') return true;
      const ts = j.postedAt ? new Date(j.postedAt).getTime() : null;
      if (!ts || isNaN(ts)) return true;
      return (now - ts) <= DATE_WINDOWS_MS[dateFilter];
    })
    .sort((a, b) => {
      if (sortBy === 'match_score') return b.match_score - a.match_score;
      return (a[sortBy] || '').localeCompare(b[sortBy] || '');
    });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 h-14">
        <div className="relative max-w-6xl mx-auto h-full flex items-center px-6">

          {/* Left: Logo */}
          <TalonMatchLogo />

          {/* Center: Stat pills — absolutely centered so unaffected by left/right widths */}
          {revealed && displayJobs.length > 0 && (
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 select-none">
              <span className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-slate-50 border border-slate-200 text-xs font-medium text-gray-600">
                <Briefcase size={11} strokeWidth={2} className="text-gray-400 shrink-0" />
                <span className="tabular-nums font-semibold text-gray-800">{filteredJobs.length}</span>
                <span className="text-gray-400">
                  {filteredJobs.length < displayJobs.length ? `of ${displayJobs.length} jobs` : 'jobs'}
                </span>
              </span>
              {skillsCount > 0 && (
                <span className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-slate-50 border border-slate-200 text-xs font-medium text-gray-600">
                  <Zap size={11} strokeWidth={2} className="text-gray-400 shrink-0" />
                  <span className="tabular-nums font-semibold text-gray-800">{skillsCount}</span>
                  <span className="text-gray-400">skills</span>
                </span>
              )}
              {results && (
                <button
                  onClick={handleRefreshJobs}
                  disabled={refreshing}
                  title="Clear cache and re-fetch fresh job results"
                  className="select-auto flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium transition-colors cursor-pointer text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw size={10} strokeWidth={2} className={refreshing ? 'animate-spin' : ''} />
                  {refreshing ? 'Syncing…' : 'Sync'}
                </button>
              )}
            </div>
          )}

          {/* Right: Filter dropdown + Avatar */}
          {revealed && (
            <div className="ml-auto flex items-center gap-2.5">

              {/* Consolidated filter dropdown */}
              <div className="relative" ref={filtersRef}>
                <button
                  onClick={() => setShowFilters(f => !f)}
                  className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                    showFilters
                      ? 'border-gray-400 bg-gray-100 text-gray-900'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <SlidersHorizontal size={11} strokeWidth={2} />
                  Filters
                  {filtersActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  )}
                </button>

                {showFilters && (
                  <div className="absolute right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl z-50 w-52 p-3 space-y-3.5">

                    {/* Match */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Match</p>
                      <div className="flex rounded-md overflow-hidden border border-gray-200">
                        {[{ v: 0, l: 'All' }, { v: 60, l: '60%+' }, { v: 80, l: '80%+' }].map(({ v, l }) => (
                          <button
                            key={v}
                            onClick={() => setMinScore(v)}
                            className={`flex-1 py-1.5 text-xs font-medium transition-colors cursor-pointer border-r border-gray-200 last:border-r-0 ${
                              minScore === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Posted */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Posted</p>
                      <div className="flex rounded-md overflow-hidden border border-gray-200">
                        {[{ v: 'any', l: 'Any' }, { v: '24h', l: '24h' }, { v: '7d', l: 'Wk' }, { v: '30d', l: 'Mo' }].map(({ v, l }) => (
                          <button
                            key={v}
                            onClick={() => setDateFilter(v)}
                            className={`flex-1 py-1.5 text-xs font-medium transition-colors cursor-pointer border-r border-gray-200 last:border-r-0 ${
                              dateFilter === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sort */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Sort</p>
                      <div>
                        {SORT_OPTIONS.map(({ value, label }) => (
                          <button
                            key={value}
                            onClick={() => { setSortBy(value); setShowFilters(false); }}
                            className={`w-full text-left px-2 py-1 text-xs rounded transition-colors cursor-pointer ${
                              sortBy === value ? 'bg-gray-50 text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-900'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                  </div>
                )}
              </div>

              {/* Avatar */}
              <UserMenu
                user={user}
                parsedResume={parsedResume}
                onNewSearch={handleReset}
                onLogin={handleLogin}
                onSignOut={() => {
                  setUser(null);
                  setRevealed(false);
                  setResults(null);
                }}
              />
            </div>
          )}

        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 relative">
        {error && (
          <div className="mb-4 max-w-xl mx-auto rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-start justify-between gap-3 relative z-50">
            <span className="break-all">{error}</span>
            <button onClick={() => setError('')} className="shrink-0 text-red-400 hover:text-red-600 cursor-pointer transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {notice && (
          <div className="mb-4 max-w-xl mx-auto rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 flex items-start justify-between gap-3 relative z-50">
            <span>{notice}</span>
            <button onClick={() => setNotice('')} className="shrink-0 text-amber-400 hover:text-amber-600 cursor-pointer transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Feed — always in DOM, blurred+grayscale until revealed */}
        <div
          style={{
            filter: revealed ? 'none' : 'blur(12px) grayscale(1)',
            opacity: revealed ? 1 : 0.55,
            pointerEvents: revealed ? 'auto' : 'none',
            userSelect: revealed ? 'auto' : 'none',
            transition: 'filter 1s ease-out, opacity 0.8s ease-out',
          }}
        >
          {displayJobs.length > 0 ? (
            <JobFeed
              jobs={filteredJobs}
              totalJobs={displayJobs.length}
              parsedResume={parsedResume}
              isLoggedIn={!!user}
              onLogin={handleLogin}
              onSaveBeforeRedirect={handleSaveBeforeRedirect}
              pendingTailorJobUrl={pendingTailorJobUrl}
              onPendingTailorHandled={() => setPendingTailorJobUrl(null)}
              tailoredJobIds={tailoredJobIds}
              onCommitTailoring={handleCommitTailoring}
              />
          ) : (
            /* Shimmer skeleton while background jobs load */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-52 animate-pulse">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gray-200 shrink-0" />
                    <div className="flex-1 pt-1">
                      <div className="h-3.5 bg-gray-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-gray-100 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-100 rounded w-full" />
                    <div className="h-3 bg-gray-100 rounded w-4/5" />
                    <div className="h-3 bg-gray-100 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upload overlay — covers feed until resume is submitted */}
        {!revealed && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center px-4"
            onClick={handleOverlayClose}
          >
            <div className="absolute inset-0 bg-white/30" style={{ backdropFilter: 'blur(3px)' }} />

            <div
              className="relative bg-white rounded-2xl border border-gray-200 p-8 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={handleOverlayClose}
                className="absolute top-4 right-4 text-gray-300 hover:text-gray-500 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className={`text-center ${user ? 'mb-8' : 'mb-7'}`}>
                <div className="flex justify-center mb-4">
                  <TalonMatchLogo size="lg" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 leading-tight tracking-tight">
                  {user ? (
                    <>
                      Upload a new resume
                      {geoCity && <>, <span className="text-green-600">{geoCity}</span></>}
                    </>
                  ) : (
                    <>
                      Unlock your career matches
                      {geoCity && <> in <span className="text-green-600">{geoCity}</span></>}
                    </>
                  )}
                </h2>
                <p className="text-gray-400 mt-3 text-sm leading-relaxed">
                  {user ? (
                    'Your results will be saved and linked to your account.'
                  ) : (
                    <>
                      Upload your resume to reveal{' '}
                      <span className="font-medium text-gray-600">
                        {backgroundJobs.length > 0 ? `${backgroundJobs.length} roles` : 'roles'}
                      </span>{' '}
                      tailored to your experience.
                    </>
                  )}
                </p>
              </div>

              <ResumeUpload onSubmit={handleSubmit} loading={loading} />

              {!user && (
                <>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-xs text-gray-400 shrink-0">or</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <div className="mt-4">
                    <GoogleSignIn parsedResume={parsedResume} onLogin={handleLogin} />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {syncToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 px-4 py-2.5 rounded-full border border-green-200 bg-green-50 text-green-700 text-xs font-medium pointer-events-none">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Job data synchronized.
        </div>
      )}
    </div>
  );
}
