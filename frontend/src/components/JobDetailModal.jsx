import { useEffect } from 'react';

export default function JobDetailModal({ job, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!job) return null;

  const { job_title, company, location, match_score, match_reason, description, requirements_array, url } = job;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between gap-4 rounded-t-2xl">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{job_title}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{company}{location ? ` · ${location}` : ''}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5 cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <span className={`font-semibold text-sm ${
              match_score > 80 ? 'text-green-600' : match_score > 60 ? 'text-yellow-600' : 'text-gray-500'
            }`}>
              {match_score}% match
            </span>
            <span className="text-gray-300">·</span>
            <p className="text-sm text-gray-500 italic">{match_reason}</p>
          </div>

          {requirements_array?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Requirements</h3>
              <div className="flex flex-wrap gap-1.5">
                {requirements_array.map((req) => (
                  <span key={req} className="text-xs px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 font-medium">
                    {req}
                  </span>
                ))}
              </div>
            </div>
          )}

          {description && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Description</h3>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{description}</p>
            </div>
          )}

          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              Apply for this role ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
