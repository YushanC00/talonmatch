import { useState, useEffect } from 'react';
import { MapPin, ChevronRight, ExternalLink, Globe, Pencil } from 'lucide-react';
import TailoredResumeDrawer from './TailoredResumeDrawer';
import AuthModal from './AuthModal';
import { partitionSkills } from '../utils/tokenMatcher';
import { fetchApplication } from '../lib/fetchApplication';

function formatRelativeTime(isoString) {
  if (!isoString) return null;
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (diffMs < 0) return null;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days  = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (hours < 24)  return `${hours}h ago`;
  if (days  < 7)   return `${days}d ago`;
  if (days  < 30)  return `${Math.floor(days / 7)}w ago`;
  return '30+ days ago';
}

// Extracts clean hostname from any URL shape; returns null if unparseable
function sanitizeDomain(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const COMPANY_SUFFIX_RE = /\b(inc|corp|co|ltd|llc|group|technologies|technology|solutions|services|the)\b\.?/gi;

function guessDomain(company) {
  return (company || '')
    .toLowerCase()
    .replace(COMPANY_SUFFIX_RE, '')
    .replace(/[^a-z0-9]/g, '')
    .trim() + '.com';
}

// Stage 0: Clearbit  →  stage 1: Google Favicon (globe-detected)  →  stage 2: monogram
function CompanyAvatar({ company, companyUrl }) {
  const [stage, setStage] = useState(0);

  const domain = sanitizeDomain(companyUrl) || guessDomain(company);

  const initial = (company || '?')[0].toUpperCase();
  const colors = [
    'bg-blue-100 text-blue-700',
    'bg-violet-100 text-violet-700',
    'bg-orange-100 text-orange-700',
    'bg-teal-100 text-teal-700',
    'bg-rose-100 text-rose-700',
    'bg-amber-100 text-amber-700',
    'bg-cyan-100 text-cyan-700',
  ];
  const color = colors[initial.charCodeAt(0) % colors.length];

  const logoContainer = (src, extraOnLoad) => (
    <div className="w-12 h-12 rounded-xl border border-gray-100 shrink-0 overflow-hidden bg-white flex items-center justify-center">
      <img
        src={src}
        alt={`${company} logo`}
        loading="lazy"
        onError={() => setStage(s => s + 1)}
        onLoad={extraOnLoad}
        className="w-full h-full object-contain p-1.5"
      />
    </div>
  );

  if (stage === 0) {
    return logoContainer(`https://logo.clearbit.com/${domain}`);
  }

  if (stage === 1) {
    return logoContainer(
      `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
      // Google returns a 16×16 generic globe when no real favicon exists
      (e) => { if (e.currentTarget.naturalWidth <= 16) setStage(2); },
    );
  }

  return (
    <div className={`w-12 h-12 rounded-xl border border-gray-100 flex items-center justify-center text-sm font-bold shrink-0 ${color}`}>
      {initial}
    </div>
  );
}

function MatchBadge({ score }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 bg-slate-100 text-slate-500">
      {score}% match
    </span>
  );
}

export default function JobCard({ job, parsedResume, onViewDetails, isLoggedIn = false, onLogin,
  onSaveBeforeRedirect, pendingTailorJobUrl, onPendingTailorHandled,
  isTailored = false, onCommitTailoring }) {
  const { job_title, company, location, is_remote, match_score, requirements_array, url, description, postedAt, pay_range, company_url } = job;

  const [tailoring, setTailoring] = useState(false);
  const [tailored, setTailored] = useState(null);
  const [tailorError, setTailorError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showMatched, setShowMatched] = useState(false);
  // Saved-version state — populated from DB, never from a fresh AI call
  const [savedReviews, setSavedReviews] = useState(null);
  const [savedEditValues, setSavedEditValues] = useState(null);
  const [savedMatchScore, setSavedMatchScore] = useState(null);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const showRemote = is_remote
    || /remote/i.test(location || '')
    || /remote/i.test(job_title || '')
    || /remote/i.test(description || '');

  const cityName = location ? location.split(',')[0].trim() : '';
  const relativeDate = formatRelativeTime(postedAt);

  const resumeSkills = parsedResume?.skills || [];
  const { matched: matchedSkills, missing: missingSkills } = partitionSkills(resumeSkills, requirements_array);
  const effectiveScore = missingSkills.length > 0 ? Math.min(match_score, 99) : match_score;
  const matchTier = (effectiveScore >= 85 && missingSkills.length === 0) ? 'high'
    : effectiveScore >= 60 ? 'mid'
    : 'low';

  useEffect(() => {
    console.log('[Matching Debug]: Resume Skills:', resumeSkills, '| Job Skills:', requirements_array ?? []);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTailor = async () => {
    if (!isLoggedIn) {
      if (parsedResume?.skills?.length > 0) {
        localStorage.setItem('talonmatch_pending_resume', JSON.stringify({
          skills: parsedResume.skills,
          experience: parsedResume.experience ?? [],
        }));
      }
      localStorage.setItem('talonmatch_pending_tailor_job', url);
      onSaveBeforeRedirect?.();
      setShowAuthModal(true);
      return;
    }
    if (tailoring) return;
    setTailoring(true);
    setTailorError('');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    try {
      const res = await fetch('/api/tailor-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parsed_resume: parsedResume,
          job_description: description || `${job_title} at ${company}. Requirements: ${(requirements_array || []).join(', ')}`,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const text = await res.text();
      if (!text) throw new Error(`Empty response (HTTP ${res.status})`);
      if (!res.ok) {
        let msg = `Server error (${res.status})`;
        try { msg = JSON.parse(text).error || msg; } catch {}
        throw new Error(msg);
      }
      let json;
      try { json = JSON.parse(text); } catch {
        throw new Error(`Invalid server response: ${text.slice(0, 120)}`);
      }
      setTailored(json);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        setTailorError('Tailoring timed out. The AI is busy — please try again.');
      } else {
        setTailorError(err.message ?? String(err));
      }
    } finally {
      setTailoring(false);
    }
  };

  // Guardrail: strictly loads from DB snapshot — never calls /api/tailor-resume
  const handleViewSaved = async () => {
    if (loadingSaved) return;
    setLoadingSaved(true);
    setTailorError('');
    try {
      const jobId = url || `${job_title}|${company}`;
      const saved = await fetchApplication(jobId);
      if (!saved?.tailoredJson?.aiResponse) throw new Error('Saved version not found.');
      setSavedReviews(saved.tailoredJson.reviews ?? {});
      setSavedEditValues(saved.tailoredJson.editValues ?? {});
      setSavedMatchScore(saved.matchScore ?? null);
      setTailored(saved.tailoredJson.aiResponse);
    } catch (err) {
      setTailorError(err.message ?? String(err));
    } finally {
      setLoadingSaved(false);
    }
  };

  const handleCloseDrawer = () => {
    setTailored(null);
    setSavedReviews(null);
    setSavedEditValues(null);
    setSavedMatchScore(null);
  };

  useEffect(() => {
    if (!isLoggedIn || !pendingTailorJobUrl || pendingTailorJobUrl !== url) return;
    onPendingTailorHandled?.();
    handleTailor();
  }, [isLoggedIn, pendingTailorJobUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <article className={`job-card bg-white rounded-xl p-5 flex flex-col gap-3 min-h-[220px] relative overflow-visible ${isTailored ? 'border-2 border-purple-500' : 'border border-gray-100'}`}>

        {/* Header: avatar · title · badge */}
        <div className="flex items-start gap-4">
          <CompanyAvatar company={company} companyUrl={company_url} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2 min-h-[2.5rem]">{job_title}</h2>

            {/* Salary directly under title */}
            {pay_range && (
              <p className="text-xs font-bold text-emerald-700 mt-0.5">{pay_range}</p>
            )}

            {/* Company · city · date sub-line */}
            <div className="flex items-center gap-1.5 text-xs mt-0.5 flex-wrap text-gray-400">
              <span className="flex items-center gap-1 min-w-0">
                <span className="truncate">{company}</span>
                {url && (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    aria-label="View posting"
                    className="shrink-0 text-gray-300 hover:text-indigo-500 transition-colors">
                    <ExternalLink size={10} strokeWidth={2} />
                  </a>
                )}
              </span>
              {cityName && <span className="text-gray-300">·</span>}
              {cityName && (
                <span className="flex items-center gap-0.5 shrink-0">
                  <MapPin size={10} strokeWidth={2} className="shrink-0" />
                  <span>{cityName}</span>
                </span>
              )}
              {relativeDate && <span className="text-gray-300">·</span>}
              {relativeDate && <span className="shrink-0">{relativeDate}</span>}
              {showRemote && <span className="text-gray-300">·</span>}
              {showRemote && (
                <span data-testid="remote-indicator" className="flex items-center gap-0.5 shrink-0 text-sky-600">
                  <Globe size={10} strokeWidth={2} />
                  <span>Remote</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <MatchBadge score={effectiveScore} />
            {isTailored && (
              <button
                onClick={handleViewSaved}
                disabled={loadingSaved}
                data-testid="tailored-badge"
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-gray-400 hover:text-gray-600 border border-gray-200 rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                {loadingSaved
                  ? <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  : <Pencil size={9} strokeWidth={2} />
                }
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Matched skills toggle */}
        {matchedSkills.length > 0 && (
          <div>
            <button
              onClick={() => setShowMatched(v => !v)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-green-600 transition-colors cursor-pointer"
            >
              <ChevronRight
                size={11}
                strokeWidth={2.5}
                className={`transition-transform ${showMatched ? 'rotate-90' : ''}`}
              />
              {matchedSkills.length} skill{matchedSkills.length > 1 ? 's' : ''} matched
            </button>
            {showMatched && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {matchedSkills.map(s => (
                  <span key={s} className="text-xs px-1.5 py-0.5 rounded border border-green-100 bg-green-50 text-green-700">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {tailorError && (
          <p className="text-xs text-red-500 break-all">{tailorError}</p>
        )}

        {/* Spacer — pins action row to bottom */}
        <div className="flex-1" />

        {/* Divider */}
        <div className="border-t border-gray-100 -mx-5" />

        {/* Bottom action — right-aligned */}
        <div className="flex justify-end -mb-0.5">
          {isTailored ? (
            url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="action-fade-in inline-flex items-center gap-1.5 px-3.5 py-1.5 leading-none rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 transition-colors"
              >
                Ready to Apply
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </a>
            )
          ) : (
            <button
              onClick={handleTailor}
              disabled={tailoring}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer ${
                matchTier === 'high'
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800'
                  : matchTier === 'mid'
                  ? 'border border-slate-200 text-slate-700 hover:bg-slate-50 active:bg-slate-100'
                  : 'border border-gray-300 text-gray-500 hover:bg-gray-50 active:bg-gray-100'
              }`}
            >
              {tailoring ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Tailoring...
                </>
              ) : matchTier === 'high' ? (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  One-Click Apply
                </>
              ) : matchTier === 'mid' ? (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Tailor & Apply
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Review Gaps
                </>
              )}
            </button>
          )}
        </div>
      </article>

      {tailored && (
        <TailoredResumeDrawer
          data={tailored}
          job={job}
          parsedResume={parsedResume}
          jobTitle={job_title}
          company={company}
          autoAccept={!savedReviews && matchTier === 'high'}
          onClose={handleCloseDrawer}
          onCommit={(jobId) => onCommitTailoring?.(jobId)}
          initialReviews={savedReviews}
          initialEditValues={savedEditValues}
          savedMatchScore={savedMatchScore}
        />
      )}

      {showAuthModal && (
        <AuthModal
          onLogin={(user) => { onLogin?.(user); setShowAuthModal(false); }}
          onClose={() => setShowAuthModal(false)}
          skillsCount={parsedResume?.skills?.length ?? 0}
          jobTitle={job_title}
          company={company}
        />
      )}
    </>
  );
}
