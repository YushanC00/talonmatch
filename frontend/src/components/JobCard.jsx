import { useState } from 'react';
import TailoredResumeModal from './TailoredResumeModal';

function ScoreBadge({ score }) {
  const color =
    score > 80
      ? 'bg-green-100 text-green-700 ring-green-200'
      : score > 60
      ? 'bg-yellow-100 text-yellow-700 ring-yellow-200'
      : 'bg-gray-100 text-gray-500 ring-gray-200';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-semibold ring-1 shrink-0 ${color}`}>
      {score}% match
    </span>
  );
}

export default function JobCard({ job, parsedResume, onViewDetails }) {
  const { job_title, company, location, is_remote, match_score, match_reason, requirements_array, url, description } = job;

  const [tailoring, setTailoring] = useState(false);
  const [tailored, setTailored] = useState(null);
  const [tailorError, setTailorError] = useState('');

  const showRemote = is_remote || /remote/i.test(location || '');

  const handleTailor = async () => {
    if (tailoring) return;
    setTailoring(true);
    setTailorError('');
    try {
      console.log('Sending to AI:', parsedResume?.experience?.map(e => e.title));
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

  return (
    <>
      <article className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">{job_title}</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{company}</p>
          </div>
          <ScoreBadge score={match_score} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {location && (
            <span className="text-xs text-gray-400 flex items-center gap-1.5">
              <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M8 1.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zM2 6a6 6 0 1110.89 3.477l3.817 3.816a.75.75 0 01-1.06 1.061l-3.816-3.817A6 6 0 012 6z" clipRule="evenodd" />
              </svg>
              {location}
            </span>
          )}
          {showRemote && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-600 ring-1 ring-violet-200">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              Remote
            </span>
          )}
        </div>

        {requirements_array?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {requirements_array.slice(0, 6).map((req) => (
              <span
                key={req}
                className="text-xs px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-medium"
              >
                {req}
              </span>
            ))}
            {requirements_array.length > 6 && (
              <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 text-gray-400">
                +{requirements_array.length - 6} more
              </span>
            )}
          </div>
        )}

        <p className="text-sm text-gray-500 italic leading-snug">{match_reason}</p>

        {tailorError && (
          <p className="text-xs text-red-500 break-all">{tailorError}</p>
        )}

        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <button
            onClick={() => onViewDetails(job)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 transition-colors cursor-pointer"
          >
            View Details
          </button>
          <button
            onClick={handleTailor}
            disabled={tailoring}
            className="px-4 py-1.5 rounded-lg text-sm font-medium border border-indigo-300 text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {tailoring ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Tailoring...
              </>
            ) : (
              'Tailor Resume'
            )}
          </button>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              Apply ↗
            </a>
          )}
        </div>
      </article>

      {tailored && (
        <TailoredResumeModal
          data={tailored}
          jobTitle={job_title}
          company={company}
          onClose={() => setTailored(null)}
        />
      )}
    </>
  );
}
