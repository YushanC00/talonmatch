import { useNavigate } from 'react-router-dom';
import KanbanView from '../components/KanbanView';
import type { Job } from '../types';

interface KanbanPageProps {
  displayJobs: Job[];
  tailoredJobIds: Set<string>;
  interviewingJobUrls: Set<string>;
  onMoveToInterviewing: (url: string) => void;
  onMoveToApplied: (url: string) => void;
}

export default function KanbanPage({ displayJobs, tailoredJobIds, interviewingJobUrls, onMoveToInterviewing, onMoveToApplied }: KanbanPageProps) {
  const navigate = useNavigate();

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
          <span aria-hidden="true" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, background: 'var(--shu)', color: 'var(--paper)',
            fontFamily: '"Shippori Mincho", serif', fontWeight: 700,
            fontSize: 18, letterSpacing: '-0.02em', flexShrink: 0,
          }}>T</span>
          <h1 className="tm-mincho" style={{ margin: 0, fontSize: 30, fontWeight: 600, color: 'var(--sumi)', letterSpacing: '-0.015em' }}>
            Status board
          </h1>
        </div>
      </div>
      <KanbanView
        jobs={displayJobs}
        tailoredJobUrls={tailoredJobIds}
        interviewingJobUrls={interviewingJobUrls}
        onMoveToInterviewing={onMoveToInterviewing}
        onMoveToApplied={onMoveToApplied}
        onTailor={(job) => { if (job.url) navigate(`/tailor/${encodeURIComponent(job.url)}`); }}
      />
    </main>
  );
}
