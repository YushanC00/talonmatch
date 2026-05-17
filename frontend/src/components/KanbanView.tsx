import type { Job } from '../types';

interface KanbanViewProps {
  jobs: Job[];
  tailoredJobUrls: Set<string>;
  interviewingJobUrls: Set<string>;
  onMoveToInterviewing: (url: string) => void;
  onMoveToApplied: (url: string) => void;
  onTailor: (job: Job) => void;
}

const COLS = [
  { key: 'tailoring',    label: 'Tailoring',    desc: 'Resume being prepared',        color: 'var(--shu)',  colorHex: '#A85E3E' },
  { key: 'applied',      label: 'Applied',       desc: 'Submitted — awaiting reply',   color: 'var(--moss)', colorHex: '#5A7A4E' },
  { key: 'interviewing', label: 'Interviewing',  desc: 'Response or take-home active', color: 'var(--gold)', colorHex: '#A88A4E' },
] as const;

type ColKey = typeof COLS[number]['key'];

function colFor(job: Job, tailoredUrls: Set<string>, interviewingUrls: Set<string>): ColKey {
  if (job.url && interviewingUrls.has(job.url)) return 'interviewing';
  if (job.url && tailoredUrls.has(job.url)) return 'applied';
  return 'tailoring';
}

function KanbanCard({ job, col, onMoveToInterviewing, onMoveToApplied, onTailor }: {
  job: Job;
  col: ColKey;
  onMoveToInterviewing: (url: string) => void;
  onMoveToApplied: (url: string) => void;
  onTailor: (job: Job) => void;
}) {
  return (
    <article style={{
      background: 'var(--paper)', border: '1px solid var(--rule)',
      padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: '0 1px 0 rgba(39,48,42,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 42, height: 42, flexShrink: 0,
          background: 'var(--washi)', border: '1px solid var(--rule)',
          display: 'grid', placeItems: 'center',
          fontFamily: '"Shippori Mincho", serif', fontWeight: 700,
          fontSize: 18, color: 'var(--sumi)',
        }}>
          {job.company[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tm-mono" style={{ fontSize: 8, letterSpacing: '0.22em', color: 'var(--sumi-mute)', textTransform: 'uppercase', marginBottom: 3 }}>
            {job.match_score}% match
          </div>
          <h4 className="tm-mincho" style={{ margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.25, color: 'var(--sumi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job.job_title}
          </h4>
          <div style={{ marginTop: 3, fontSize: 11, color: 'var(--sumi-mute)' }}>
            {job.company}{job.location ? ` · ${job.location}` : ''}
          </div>
        </div>
      </div>

      <div style={{ height: 1, backgroundImage: 'repeating-linear-gradient(to right, var(--rule) 0 3px, transparent 3px 6px)' }} />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {col === 'tailoring' && (
          <button onClick={() => onTailor(job)} style={{
            flex: 1, padding: '5px 10px', background: 'var(--shu)', color: 'var(--paper)',
            border: 'none', cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>
            Tailor →
          </button>
        )}
        {col === 'applied' && (
          <button onClick={() => job.url && onMoveToInterviewing(job.url)} style={{
            flex: 1, padding: '5px 10px', background: 'transparent', color: 'var(--gold)',
            border: '1px solid var(--gold)', cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>
            Got interview →
          </button>
        )}
        {col === 'interviewing' && (
          <button onClick={() => job.url && onMoveToApplied(job.url)} style={{
            padding: '5px 10px', background: 'transparent', color: 'var(--sumi-mute)',
            border: '1px solid var(--rule)', cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            ← Back
          </button>
        )}
        {job.url && (
          <a href={job.url} target="_blank" rel="noopener noreferrer" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '5px 10px', border: '1px solid var(--rule)', color: 'var(--sumi-mute)',
            fontFamily: '"JetBrains Mono", monospace', fontSize: 9, letterSpacing: '0.12em',
            textTransform: 'uppercase', textDecoration: 'none',
          }}>
            Open
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
              <path d="M2 8 L8 2 M5 2 H8 V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </a>
        )}
      </div>
    </article>
  );
}

export default function KanbanView({ jobs, tailoredJobUrls, interviewingJobUrls, onMoveToInterviewing, onMoveToApplied, onTailor }: KanbanViewProps) {
  const grouped = COLS.map(col => ({
    ...col,
    jobs: jobs.filter(j => colFor(j, tailoredJobUrls, interviewingJobUrls) === col.key),
  }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 20 }}>
      {grouped.map(col => (
        <section key={col.key} style={{
          background: 'var(--washi)', border: '1px solid var(--rule)',
          padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12,
          minHeight: 480, position: 'relative',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: col.color }} />

          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                <h3 className="tm-mincho" style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--sumi)' }}>
                  {col.label}
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--sumi-mute)', paddingLeft: 15 }}>{col.desc}</p>
            </div>
            <span style={{
              background: col.color, color: 'var(--paper)',
              padding: '3px 9px', fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11, fontWeight: 700, lineHeight: 1.4,
            }}>
              {col.jobs.length}
            </span>
          </header>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {col.jobs.map(job => (
              <KanbanCard
                key={job.url ?? job.job_title}
                job={job}
                col={col.key}
                onMoveToInterviewing={onMoveToInterviewing}
                onMoveToApplied={onMoveToApplied}
                onTailor={onTailor}
              />
            ))}
          </div>

          {col.jobs.length === 0 && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
              letterSpacing: '0.18em', color: 'var(--sumi-faint)', textTransform: 'uppercase',
            }}>
              Empty
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
