import { useState } from 'react';
import JobCard from './JobCard';
import JobDetailModal from './JobDetailModal';
import type { Job, ParsedResume } from '../types';
import type { User } from '@supabase/supabase-js';

interface JobFeedProps {
  jobs?: Job[];
  totalJobs?: number;
  parsedResume: ParsedResume;
  resumeLoading?: boolean;
  resumeFetched?: boolean;
  isLoggedIn?: boolean;
  onLogin?: (user: User) => void;
  onSaveBeforeRedirect?: () => void;
  pendingTailorJobUrl?: string | null;
  onPendingTailorHandled?: () => void;
  tailoredJobIds?: Set<string>;
  onCommitTailoring?: (jobId: string) => void;
}

export default function JobFeed({ jobs = [], totalJobs = 0, parsedResume, resumeLoading = false, resumeFetched = false, isLoggedIn = false, onLogin,
  onSaveBeforeRedirect, pendingTailorJobUrl, onPendingTailorHandled,
  tailoredJobIds, onCommitTailoring }: JobFeedProps) {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  if (!jobs.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <p className="text-base font-semibold text-gray-700">
          {totalJobs > 0 ? 'No jobs match these filters' : 'No jobs found'}
        </p>
        <p className="text-sm text-gray-400 mt-1 text-center max-w-xs">
          {totalJobs > 0
            ? 'Try broadening the score threshold, date range, or search term.'
            : 'Try uploading a different resume or refining your experience section.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {jobs.map((job, i) => (
          <JobCard
            key={job.url || `${job.job_title}-${i}`}
            index={i}
            job={job}
            parsedResume={parsedResume}
            resumeLoading={resumeLoading}
            resumeFetched={resumeFetched}
            onViewDetails={setSelectedJob}
            isLoggedIn={isLoggedIn}
            onLogin={onLogin}
            onSaveBeforeRedirect={onSaveBeforeRedirect}
            pendingTailorJobUrl={pendingTailorJobUrl}
            onPendingTailorHandled={onPendingTailorHandled}
            isTailored={tailoredJobIds?.has(job.url ?? '') ?? false}
            onCommitTailoring={onCommitTailoring}
          />
        ))}
      </div>

      {selectedJob && (
        <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </>
  );
}
