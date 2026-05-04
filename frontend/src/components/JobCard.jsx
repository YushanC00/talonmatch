import { useState, useEffect } from 'react';
import TailoredResumeModal from './TailoredResumeModal';
import AuthModal from './AuthModal';

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
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${color}`}>
      {initial}
    </div>
  );
}

function MatchBadge({ score }) {
  const textColor = score > 80 ? 'text-green-600' : 'text-gray-500';
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 bg-gray-100 ${textColor}`}>
      {score}% match
    </span>
  );
}

export default function JobCard({ job, parsedResume, onViewDetails, isLoggedIn = false, onLogin,
  onSaveBeforeRedirect, pendingTailorJobUrl, onPendingTailorHandled }) {
  const { job_title, company, location, is_remote, match_score, match_reason, requirements_array, url, description, postedAt } = job;

  const [tailoring, setTailoring] = useState(false);
  const [tailored, setTailored] = useState(null);
  const [tailorError, setTailorError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);

  const showRemote = is_remote || /remote/i.test(location || '');

  const userSkillsSet = new Set((parsedResume?.skills || []).map(s => s.toLowerCase()));
  const missingSkills = (requirements_array || []).filter(r => !userSkillsSet.has(r.toLowerCase()));
  const effectiveScore = missingSkills.length > 0 ? Math.min(match_score, 99) : match_score;

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
      <article className="job-card bg-white rounded-xl border border-gray-100 p-5 flex flex-col gap-4">

        {/* Header row: avatar + title + badge */}
        <div className="flex items-start gap-3">
          <CompanyAvatar company={company} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">{job_title}</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{company}</p>
          </div>
          <MatchBadge score={effectiveScore} />
        </div>

        {/* Location / remote / date */}
        <div className="flex items-center gap-2 flex-wrap -mt-1">
          {(location || postedAt) && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M8 1.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zM2 6a6 6 0 1110.89 3.477l3.817 3.816a.75.75 0 01-1.06 1.061l-3.816-3.817A6 6 0 012 6z" clipRule="evenodd" />
              </svg>
              {location && <span>{location}</span>}
              {location && postedAt && <span className="mx-0.5">·</span>}
              {postedAt && <span>{formatRelativeTime(postedAt) ?? 'Recently posted'}</span>}
            </span>
          )}
          {showRemote && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-600 ring-1 ring-violet-200">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              Remote
            </span>
          )}
        </div>

        {/* Clickable missing-skills area */}
        <button
          onClick={() => onViewDetails(job)}
          className="text-left rounded-lg px-3 py-3 -mx-3 hover:bg-white/80 active:bg-gray-50 transition-colors cursor-pointer"
        >
          {missingSkills.length > 0 ? (
            <p className="text-xs leading-relaxed">
              <span className="font-semibold text-amber-600">
                Missing {missingSkills.length} key skill{missingSkills.length > 1 ? 's' : ''}: </span>
              <span className="text-amber-600">
                {missingSkills.slice(0, 3).join(', ')}
                {missingSkills.length > 3 ? ` +${missingSkills.length - 3} more` : ''}.
              </span>
              <span className="text-gray-400 ml-1">Click to bridge the gap.</span>
            </p>
          ) : effectiveScore === 100 ? (
            <p className="text-xs leading-relaxed">
              <span className="font-semibold text-green-600">You match all listed requirements.</span>
              <span className="text-gray-400 ml-1">Click for full job details.</span>
            </p>
          ) : (
            <p className="text-xs leading-relaxed">
              <span className="font-semibold text-gray-500">{effectiveScore}% keyword match.</span>
              <span className="text-gray-400 ml-1">Requirements may not be fully listed — click to scan the JD.</span>
            </p>
          )}
        </button>

        {tailorError && (
          <p className="text-xs text-red-500 break-all -mt-2">{tailorError}</p>
        )}

        {/* Divider */}
        <div className="border-t border-gray-100 -mx-5" />

        {/* Actions */}
        <div className="flex items-center gap-2 -mb-0.5 flex-wrap">
          <button
            onClick={handleTailor}
            disabled={tailoring}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 active:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {tailoring ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Tailoring...
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                Tailor Resume
              </>
            )}
          </button>

          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-0.5"
            >
              Apply
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>
      </article>

      {tailored && (
        <TailoredResumeModal
          data={tailored}
          job={job}
          parsedResume={parsedResume}
          jobTitle={job_title}
          company={company}
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
