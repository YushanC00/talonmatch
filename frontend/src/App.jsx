import { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import ResumeUpload from './components/ResumeUpload';
import JobFeed from './components/JobFeed';
import GoogleSignIn from './components/GoogleSignIn';
import UserMenu from './components/UserMenu';
import { supabase } from './lib/supabase';
import { resolveCity } from './utils/geolocation';
import './index.css';

function TalonMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs><clipPath id="seal-clip"><circle cx="32" cy="32" r="29" /></clipPath></defs>
      <rect x="3" y="3" width="58" height="58" rx="6" fill="var(--shu)" />
      <g clipPath="url(#seal-clip)" fill="none" stroke="var(--paper)" strokeWidth="3.2" strokeLinecap="round">
        <path d="M14 18 C 24 26, 30 34, 30 50" />
        <path d="M28 12 C 34 24, 36 36, 34 52" />
        <path d="M46 16 C 42 26, 40 36, 40 50" />
        <path d="M30 50 l 3 -2 M30 50 l -3 -1" strokeWidth="2.6" />
        <path d="M34 52 l 3 -2 M34 52 l -3 -1" strokeWidth="2.6" />
        <path d="M40 50 l 3 -2 M40 50 l -3 -1" strokeWidth="2.6" />
      </g>
      <rect x="3" y="3" width="58" height="58" rx="6" fill="none" stroke="var(--shu-deep)" strokeWidth="1.5" />
    </svg>
  );
}

function TalonMatchLogo({ size = 'md' }) {
  const markSize = size === 'lg' ? 48 : 44;
  const titleSize = size === 'lg' ? 24 : 26;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <TalonMark size={markSize} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="tm-mincho" style={{ fontSize: titleSize, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--sumi)' }}>
            Talon<span style={{ color: 'var(--shu)' }}>Match</span>
          </span>
          <span className="tm-jp" style={{ fontSize: 14, color: 'var(--sumi-mute)', fontWeight: 500 }}>鷹合</span>
        </div>
        <div className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.32em', color: 'var(--sumi-mute)', marginTop: 5, textTransform: 'uppercase' }}>
          Find · Tailor · Strike
        </div>
      </div>
    </div>
  );
}

function SideOrnament({ side }) {
  return (
    <div style={{
      position: 'fixed', top: 140, [side]: 14,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      pointerEvents: 'none', writingMode: 'vertical-rl', zIndex: 5,
    }}>
      <span className="tm-jp" style={{ fontSize: 12, letterSpacing: '0.4em', color: 'var(--sumi-mute)', fontWeight: 400, opacity: 0.5 }}>
        {side === 'left' ? '好機を逃すな' : '鷹の目で狙え'}
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
  { value: 'match_score', label: 'Match' },
  { value: 'company',     label: 'Company' },
  { value: 'job_title',   label: 'Title' },
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
    <div className="min-h-screen">
      <SideOrnament side="left" />
      <SideOrnament side="right" />

      {/* Header */}
      <header style={{ background: 'var(--paper)', borderBottom: '1px solid var(--rule)', position: 'sticky', top: 0, zIndex: 10 }}>

        {/* Patterned shu stripe */}
        <div style={{ height: 3, background: 'linear-gradient(to right, var(--shu) 0%, var(--shu) 24%, transparent 24%, transparent 30%, var(--shu) 30%, var(--shu) 32%, transparent 32%)' }} />

        {/* Main row — wings layout: logo centered, controls right */}
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '16px 40px', position: 'relative', display: 'flex', alignItems: 'center' }}>

          {/* Center: Logo — truly centered via absolute */}
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            <TalonMatchLogo />
          </div>

          {/* Right: controls (always visible) */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>

            {/* Filters button + dropdown */}
            <div style={{ position: 'relative' }} ref={filtersRef}>
              <button
                onClick={() => setShowFilters(f => !f)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: showFilters ? 'var(--washi-deep)' : 'var(--paper)',
                  border: '1px solid var(--rule)', padding: '9px 14px', borderRadius: 2,
                  cursor: 'pointer', fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: 'var(--sumi)',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M2 3 H12 M4 7 H10 M6 11 H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                Filters
                {filtersActive && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--shu)', display: 'inline-block', flexShrink: 0 }} />
                )}
              </button>

              {showFilters && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 3, zIndex: 50, width: 208, padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Match */}
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--sumi-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>Match</p>
                    <div style={{ display: 'flex', border: '1px solid var(--rule)', borderRadius: 2, overflow: 'hidden' }}>
                      {[{ v: 0, l: 'All' }, { v: 60, l: '60%+' }, { v: 80, l: '80%+' }].map(({ v, l }, i, arr) => (
                        <button key={v} onClick={() => setMinScore(v)}
                          style={{ flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter',
                            borderRight: i < arr.length - 1 ? '1px solid var(--rule)' : 'none', border: 'none',
                            background: minScore === v ? 'var(--sumi)' : 'transparent',
                            color: minScore === v ? 'var(--paper)' : 'var(--sumi-mute)',
                          }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Posted */}
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--sumi-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>Posted</p>
                    <div style={{ display: 'flex', border: '1px solid var(--rule)', borderRadius: 2, overflow: 'hidden' }}>
                      {[{ v: 'any', l: 'Any' }, { v: '24h', l: '24h' }, { v: '7d', l: 'Wk' }, { v: '30d', l: 'Mo' }].map(({ v, l }, i, arr) => (
                        <button key={v} onClick={() => setDateFilter(v)}
                          style={{ flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter',
                            borderRight: i < arr.length - 1 ? '1px solid var(--rule)' : 'none', border: 'none',
                            background: dateFilter === v ? 'var(--sumi)' : 'transparent',
                            color: dateFilter === v ? 'var(--paper)' : 'var(--sumi-mute)',
                          }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Upload résumé */}
            <button
              onClick={handleReset}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--sumi)', color: 'var(--washi-soft)', border: 'none',
                padding: '9px 14px', borderRadius: 2, cursor: 'pointer',
                fontFamily: 'Inter', fontSize: 12, fontWeight: 600,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 6 L 6 3 L 9 6 M 6 3 V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Upload résumé
            </button>

            {/* Vertical rule */}
            <div style={{ width: 1, height: 28, background: 'var(--rule)' }} />

            {/* Avatar */}
            <UserMenu
              user={user}
              parsedResume={parsedResume}
              onNewSearch={handleReset}
              onLogin={handleLogin}
              onSignOut={() => { setUser(null); setRevealed(false); setResults(null); }}
            />
          </div>
        </div>

        {/* Sort sub-bar — shown when jobs are revealed */}
        {revealed && displayJobs.length > 0 && (
          <div style={{ borderTop: '1px solid var(--rule)', background: 'var(--washi-deep)' }}>
            <div style={{ maxWidth: 1320, margin: '0 auto', padding: '8px 40px', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
              <span className="tm-mono" style={{ letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: 10, color: 'var(--sumi-mute)' }}>Sort</span>
              {SORT_OPTIONS.map(({ value, label }) => (
                <button key={value} onClick={() => setSortBy(value)}
                  style={{
                    background: sortBy === value ? 'var(--sumi)' : 'transparent',
                    color: sortBy === value ? 'var(--paper)' : 'var(--sumi)',
                    border: sortBy === value ? '1px solid var(--sumi)' : '1px solid var(--rule)',
                    padding: '4px 10px', borderRadius: 2, cursor: 'pointer',
                    fontFamily: 'Inter', fontSize: 11, fontWeight: 500,
                  }}>
                  {label}
                </button>
              ))}
              {results && (
                <button onClick={handleRefreshJobs} disabled={refreshing}
                  title="Clear cache and re-fetch fresh job results"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 2, cursor: 'pointer',
                    border: '1px solid var(--rule)', background: 'transparent', color: 'var(--sumi-mute)', fontFamily: 'Inter', fontSize: 11,
                    opacity: refreshing ? 0.5 : 1 }}>
                  <RefreshCw size={10} strokeWidth={2} className={refreshing ? 'animate-spin' : ''} />
                  {refreshing ? 'Syncing…' : 'Sync'}
                </button>
              )}
            </div>
          </div>
        )}
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

        {/* Section heading — solo H2 above the grid */}
        {revealed && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
              <span aria-hidden="true" style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, background: 'var(--shu)', color: 'var(--paper)',
                borderRadius: 2, fontFamily: '"Shippori Mincho", serif', fontWeight: 700,
                fontSize: 18, letterSpacing: '-0.02em', flexShrink: 0,
              }}>T</span>
              <h1 className="tm-mincho" style={{ margin: 0, fontSize: 30, fontWeight: 600, color: 'var(--sumi)', letterSpacing: '-0.015em' }}>
                Today's hunting ground
              </h1>
            </div>
            <p className="tm-mono" style={{ margin: '6px 0 0 48px', fontSize: 10, letterSpacing: '0.2em', color: 'var(--sumi-mute)', textTransform: 'uppercase' }}>
              {(() => {
                const ready    = filteredJobs.filter(j => tailoredJobIds.has(j.url)).length;
                const inPrep   = filteredJobs.filter(j => !tailoredJobIds.has(j.url) && j.match_score >= 60).length;
                const scouting = filteredJobs.filter(j => !tailoredJobIds.has(j.url) && j.match_score < 60).length;
                return `${ready} Strike Ready  ·  ${inPrep} In Prep  ·  ${scouting} Scouting`;
              })()}
            </p>
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
                <div key={i} className="p-5 h-52 animate-pulse" style={{ background: 'var(--paper)', border: '1px solid var(--rule)' }}>
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 bg-gray-200 shrink-0" />
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

        {/* Footer ornament — END OF HUNT */}
        {revealed && filteredJobs.length > 0 && (
          <div style={{ marginTop: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--sumi-mute)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ width: 60, height: 1, background: 'var(--rule)' }} />
              <TalonMark size={20} />
              <span style={{ width: 60, height: 1, background: 'var(--rule)' }} />
            </div>
            <div className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.32em', textTransform: 'uppercase' }}>
              End of hunt · {filteredJobs.length} of {displayJobs.length}
            </div>
          </div>
        )}

        {/* Upload overlay — covers feed until resume is submitted */}
        {!revealed && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center px-4"
            onClick={handleOverlayClose}
          >
            <div className="absolute inset-0 bg-white/30" style={{ backdropFilter: 'blur(3px)' }} />

            <div
              className="relative p-8 w-full max-w-md"
              style={{ background: 'var(--paper)', border: '1px solid var(--rule)' }}
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
              <div style={{ textAlign: 'center', marginBottom: user ? 32 : 28 }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <TalonMatchLogo size="lg" />
                </div>
                <h2 className="tm-mincho" style={{ fontSize: 22, fontWeight: 600, color: 'var(--sumi)', letterSpacing: '-0.01em', lineHeight: 1.25, margin: 0 }}>
                  {user ? (
                    <>
                      Upload a new resume
                      {geoCity && <>, <span style={{ color: 'var(--shu)' }}>{geoCity}</span></>}
                    </>
                  ) : (
                    <>
                      Unlock your career matches
                      {geoCity && <> in <span style={{ color: 'var(--shu)' }}>{geoCity}</span></>}
                    </>
                  )}
                </h2>
                <p className="tm-mono" style={{ color: 'var(--sumi-faint)', marginTop: 10, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1.6 }}>
                  {user ? (
                    'Results saved to your account'
                  ) : (
                    <>
                      Upload resume · reveal{' '}
                      {backgroundJobs.length > 0 ? `${backgroundJobs.length} roles` : 'roles'}
                    </>
                  )}
                </p>
              </div>

              <ResumeUpload onSubmit={handleSubmit} loading={loading} />

              {!user && (
                <>
                  <div className="mt-4 flex items-center gap-3">
                    <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
                    <span className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--sumi-faint)', flexShrink: 0, textTransform: 'uppercase' }}>or</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
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
