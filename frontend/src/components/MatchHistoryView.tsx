import type { Job } from '../types';

export interface MatchRecord {
  jobUrl: string;
  jobTitle: string;
  company: string;
  location?: string;
  originalScore: number;
  tailoredScore: number;
  tailoredAt: string;
}

const STORAGE_KEY = 'talonmatch_match_history';

export function recordTailoring(job: Job, tailoredScore: number): void {
  if (!job.url) return;
  try {
    const existing = getMatchHistory();
    const filtered = existing.filter(r => r.jobUrl !== job.url);
    const record: MatchRecord = {
      jobUrl: job.url,
      jobTitle: job.job_title,
      company: job.company,
      location: job.location,
      originalScore: job.match_score,
      tailoredScore,
      tailoredAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...filtered].slice(0, 100)));
  } catch { /* quota */ }
}

export function getMatchHistory(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MatchRecord[]) : [];
  } catch { return []; }
}

function MatchBar({ original, applied }: { original: number; applied: number }) {
  return (
    <div style={{ position: 'relative', height: 32, background: 'var(--washi)', border: '1px solid var(--rule)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${applied}%`, background: 'rgba(168,94,62,0.22)' }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${original}%`, background: 'rgba(39,48,42,0.28)' }} />
      <div style={{ position: 'absolute', top: -2, bottom: -2, left: `calc(${original}% - 1px)`, width: 2, background: 'var(--sumi)' }} />
      <div style={{ position: 'absolute', top: -2, bottom: -2, left: `calc(${applied}% - 1px)`, width: 2, background: 'var(--shu)' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'var(--sumi-mute)', letterSpacing: '0.12em' }}>
        <span>0</span><span>50</span><span>100</span>
      </div>
    </div>
  );
}

export default function MatchHistoryView({ liveJobs }: { liveJobs: Job[] }) {
  const history = getMatchHistory();

  const merged: MatchRecord[] = [
    ...history,
    ...liveJobs
      .filter(j => j.url && !history.find(r => r.jobUrl === j.url))
      .map(j => ({
        jobUrl: j.url!,
        jobTitle: j.job_title,
        company: j.company,
        location: j.location,
        originalScore: j.match_score,
        tailoredScore: j.match_score,
        tailoredAt: '',
      })),
  ].sort((a, b) => (b.tailoredScore - b.originalScore) - (a.tailoredScore - a.originalScore));

  const tailored = merged.filter(r => r.tailoredAt);
  const avgLift = tailored.length
    ? (tailored.reduce((s, r) => s + (r.tailoredScore - r.originalScore), 0) / tailored.length).toFixed(1)
    : '—';
  const maxLift = tailored.length ? Math.max(...tailored.map(r => r.tailoredScore - r.originalScore)) : 0;
  const above80 = tailored.filter(r => r.tailoredScore >= 80).length;

  if (merged.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 360, gap: 12 }}>
        <div style={{ fontFamily: '"Shippori Mincho", serif', fontSize: 22, color: 'var(--sumi-mute)', fontWeight: 600 }}>No data yet</div>
        <div className="tm-mono" style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--sumi-faint)', textTransform: 'uppercase' }}>Upload a résumé to begin</div>
      </div>
    );
  }

  return (
    <div>
      {/* Hero stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Avg lift',      value: tailored.length ? `+${avgLift}` : '—', suffix: 'pts', color: 'var(--shu)' },
          { label: 'Max lift',      value: tailored.length ? `+${maxLift}` : '—', suffix: tailored.length ? 'pts' : '', color: 'var(--moss)' },
          { label: 'Tailored',      value: tailored.length, suffix: `/ ${merged.length}`, color: 'var(--sumi)' },
          { label: '≥80% applied', value: above80, suffix: `/ ${tailored.length}`, color: 'var(--gold)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--paper)', border: '1px solid var(--rule)', padding: '16px 18px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 3, bottom: 0, background: s.color }} />
            <div className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.22em', color: 'var(--sumi-mute)', textTransform: 'uppercase', marginBottom: 8 }}>{s.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="tm-mincho" style={{ fontSize: 32, fontWeight: 700, color: 'var(--sumi)', lineHeight: 1 }}>{s.value}</span>
              <span style={{ fontSize: 11, color: 'var(--sumi-mute)' }}>{s.suffix}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 12, fontSize: 11, color: 'var(--sumi-mute)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 14, height: 5, background: 'var(--sumi)' }} />Original match
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 14, height: 5, background: 'var(--shu)' }} />AI-tailored match
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: '"JetBrains Mono", monospace', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--sumi-mute)' }}>
          Sorted by lift
        </span>
      </div>

      {/* Rows */}
      <div style={{ background: 'var(--paper)', border: '1px solid var(--rule)' }}>
        {merged.map((r, i) => {
          const lift = r.tailoredScore - r.originalScore;
          return (
            <div key={r.jobUrl} style={{
              display: 'grid', gridTemplateColumns: '1.6fr 90px 1fr 130px',
              padding: '16px 18px', gap: 18, alignItems: 'center',
              borderBottom: i === merged.length - 1 ? 'none' : '1px solid var(--rule)',
            }}>
              <div style={{ minWidth: 0 }}>
                <h4 className="tm-mincho" style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--sumi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.jobTitle}
                </h4>
                <div style={{ fontSize: 11, color: 'var(--sumi-mute)', marginTop: 3, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>{r.company}</span>
                  {r.location && <><span style={{ width: 1, height: 9, background: 'var(--rule)' }} /><span>{r.location}</span></>}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <span className="tm-mono" style={{ fontSize: 10, color: 'var(--sumi-mute)' }}>
                  {r.originalScore}<span style={{ color: 'var(--sumi-faint)' }}> → </span>
                  <span style={{ color: 'var(--shu)', fontWeight: 700 }}>{r.tailoredScore}</span>
                </span>
                {lift > 0 && (
                  <span className="tm-mincho" style={{ fontSize: 13, fontWeight: 700, color: 'var(--moss)' }}>+{lift} pts</span>
                )}
              </div>

              <MatchBar original={r.originalScore} applied={r.tailoredScore} />

              <div style={{ textAlign: 'right' }}>
                <span className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.18em', color: 'var(--sumi-mute)', textTransform: 'uppercase', display: 'block' }}>
                  {r.tailoredAt ? 'Tailored' : 'Pending'}
                </span>
                {r.tailoredAt && (
                  <span className="tm-mono" style={{ fontSize: 9, color: 'var(--sumi-soft)', marginTop: 2, display: 'block' }}>
                    {new Date(r.tailoredAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {tailored.length > 0 && (
        <div style={{ marginTop: 16, padding: '14px 18px', background: 'var(--paper)', border: '1px solid var(--rule)', borderLeft: '3px solid var(--shu)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, background: 'var(--shu)', color: 'var(--paper)', fontFamily: '"Shippori Mincho", serif', fontWeight: 700, fontSize: 18, flexShrink: 0 }}>
            鷹
          </span>
          <div>
            <div className="tm-mincho" style={{ fontSize: 14, fontWeight: 600, color: 'var(--sumi)', marginBottom: 4 }}>
              The AI's value, in plain numbers.
            </div>
            <div style={{ fontSize: 12, color: 'var(--sumi-mute)', lineHeight: 1.6 }}>
              Across {tailored.length} role{tailored.length !== 1 ? 's' : ''}, tailoring lifted average match by{' '}
              <strong style={{ color: 'var(--sumi)' }}>+{avgLift} points</strong>.{' '}
              Without it, only {tailored.filter(r => r.originalScore >= 80).length} role{tailored.filter(r => r.originalScore >= 80).length !== 1 ? 's' : ''} would have crossed the 80% bar — after tailoring, {above80}.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
