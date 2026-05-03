import { useState } from 'react';
import JobCard from './JobCard';
import JobDetailModal from './JobDetailModal';

const SORT_OPTIONS = [
  { value: 'match_score', label: 'Best Match' },
  { value: 'company', label: 'Company' },
  { value: 'job_title', label: 'Title' },
];

const SCORE_FILTERS = [
  { value: 0, label: 'All' },
  { value: 60, label: '60%+' },
  { value: 80, label: '80%+' },
];

export default function JobFeed({ jobs = [], parsedResume }) {
  const [selectedJob, setSelectedJob] = useState(null);
  const [sortBy, setSortBy] = useState('match_score');
  const [minScore, setMinScore] = useState(0);

  const filtered = jobs
    .filter((j) => j.match_score >= minScore)
    .sort((a, b) => {
      if (sortBy === 'match_score') return b.match_score - a.match_score;
      return (a[sortBy] || '').localeCompare(b[sortBy] || '');
    });

  if (!jobs.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <span className="text-5xl mb-4">🔍</span>
        <p className="text-base text-gray-600 font-medium">No jobs found for your titles.</p>
        <p className="text-sm mt-1">Try uploading a different resume or refining your experience section.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            Showing <span className="font-medium text-gray-800">{filtered.length}</span> of {jobs.length} jobs
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-gray-500">Min score:</span>
              {SCORE_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setMinScore(value)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                    minScore === value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer"
            >
              {SORT_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No jobs match the current filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((job, i) => (
              <JobCard
                key={job.url || `${job.job_title}-${i}`}
                job={job}
                parsedResume={parsedResume}
                onViewDetails={setSelectedJob}
              />
            ))}
          </div>
        )}
      </div>

      {selectedJob && (
        <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </>
  );
}
