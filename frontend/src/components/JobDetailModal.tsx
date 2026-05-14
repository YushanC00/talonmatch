import { useEffect } from 'react';
import type { Job } from '../types';

interface JobDetailModalProps {
  job: Job | null;
  onClose: () => void;
}

export default function JobDetailModal({ job, onClose }: JobDetailModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!job) return null;

  const { job_title, company, location, match_score, match_reason, description, requirements_array, url } = job;

  const scoreColor =
    match_score > 80
      ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
      : match_score > 60
      ? 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200'
      : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Sticky header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-100 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900">{job_title}</h2>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${scoreColor}`}>
                {match_score}% match
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {company}{location ? ` · ${location}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">

          {match_reason && (
            <p className="text-sm text-gray-500 italic leading-relaxed border-l-2 border-green-300 pl-3">
              {match_reason}
            </p>
          )}

          {requirements_array && requirements_array.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2.5">Requirements</h3>
              <div className="flex flex-wrap gap-1.5">
                {requirements_array.map((req) => (
                  <span key={req} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">
                    {req}
                  </span>
                ))}
              </div>
            </div>
          )}

          {description && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2.5">Description</h3>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{description}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {url && (
          <div className="px-6 py-4 border-t border-gray-100 shrink-0">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 active:bg-green-800 transition-colors"
            >
              Apply for this role
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
