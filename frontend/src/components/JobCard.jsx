import { useState, useEffect } from 'react';
import { MapPin, ChevronRight, ExternalLink, Globe } from 'lucide-react';
import TailoredResumeDrawer from './TailoredResumeDrawer';
import AuthModal from './AuthModal';
import { partitionSkills } from '../utils/tokenMatcher';

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

function CompanyAvatar({ company }) {
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
  return (
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${color}`}>
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
  onSaveBeforeRedirect, pendingTailorJobUrl, onPendingTailorHandled }) {
  const { job_title, company, location, is_remote, match_score, requirements_array, url, description, postedAt, pay_range } = job;

  const [tailoring, setTailoring] = useState(false);
  const [tailored, setTailored] = useState(null);
  const [tailorError, setTailorError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showMatched, setShowMatched] = useState(false);

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
    try {
      const res = await fetch('/api/tailor-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parsed_resume: parsedResume,
          job_description: description || `${job_title} at ${company}. Requirements: ${(requirements_array || []).join(', ')}`,
        }),
      });
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
      setTailorError(err.message ?? String(err));
    } finally {
      setTailoring(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn || !pendingTailorJobUrl || pendingTailorJobUrl !== url) return;
    onPendingTailorHandled?.();
    handleTailor();
  }, [isLoggedIn, pendingTailorJobUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <article className="job-card bg-white rounded-xl border border-gray-100 p-5 flex flex-col gap-3 relative overflow-visible">

        {/* Remote floating badge */}
        {showRemote && (
          <div data-testid="remote-ribbon" className="absolute -top-2 -left-2 z-10 flex items-center gap-1 bg-slate-900 text-white px-2 py-1 rounded-md text-[10px] font-bold uppercase border border-slate-700 pointer-events-none" aria-hidden="true">
            <Globe size={9} strokeWidth={2.5} />
            Remote
          </div>
        )}

        {/* Header: avatar · title · badge */}
        <div className="flex items-start gap-3">
          <CompanyAvatar company={company} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">{job_title}</h2>

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
            </div>
          </div>
          <MatchBadge score={effectiveScore} />
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

        {/* Divider */}
        <div className="border-t border-gray-100 -mx-5" />

        {/* Actions */}
        <div className="flex items-center gap-2 -mb-0.5">
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

        </div>
      </article>

      {tailored && (
        <TailoredResumeDrawer
          data={tailored}
          job={job}
          parsedResume={parsedResume}
          jobTitle={job_title}
          company={company}
          autoAccept={matchTier === 'high'}
          onClose={() => setTailored(null)}
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
