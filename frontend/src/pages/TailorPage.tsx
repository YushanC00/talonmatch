import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import TailoredResumeDrawer from '../components/TailoredResumeDrawer';
import type { Job, ParsedResume, TailoredResume, TailoredSection } from '../types';

interface TailorPageProps {
  parsedResume: ParsedResume;
  user: User | null;
  onCommitTailoring: (jobId: string) => void;
}

interface TailorPageState {
  job: Job;
  parsedResume: ParsedResume;
  matchTier?: 'high' | 'mid' | 'low';
}

function classifySection(title: string): 'summary' | 'experience' | 'projects' | 'skills' | 'education' | null {
  const t = title.toLowerCase();
  if (/summary|profile|objective|about/.test(t)) return 'summary';
  if (/experience|employment|work history|career/.test(t)) return 'experience';
  if (/project/.test(t)) return 'projects';
  if (/skills?|tech|stack|tool|competenc|qualif/.test(t)) return 'skills';
  if (/educat|academic|degree|certif|training/.test(t)) return 'education';
  return null;
}

function buildInitialSections(resume: ParsedResume | null): TailoredSection[] {
  if (!resume) return [];
  const slug = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 15);
  const splitDesc = (desc: string): string[] =>
    (desc || '').split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 10);

  // Use source section titles in resume order; fall back to detected order
  const sourceTitles: string[] = resume.style_config?.sections?.length
    ? resume.style_config.sections
    : [
        resume.summary ? (resume.summary_section_title || 'Summary') : null,
        (resume.experience || []).length > 0 ? 'Work Experience' : null,
        (resume.projects  || []).length > 0 ? 'Projects'        : null,
        resume.skills.length > 0            ? 'Skills'          : null,
        (resume.education || []).length > 0 ? 'Education'       : null,
      ].filter((s): s is string => s !== null);

  const sections: TailoredSection[] = [];
  const used = new Set<string>(); // first occurrence of each type gets content; later ones get empty placeholder so SSE can fill in-place

  for (const title of sourceTitles) {
    const type = classifySection(title);
    if (!type) continue;

    let content: import('../types').TailoredContentItem[] = [];

    if (!used.has(type)) {
      if (type === 'summary' && resume.summary) {
        content = [{ id: 'summary-0', label: '', original: resume.summary, tailored: resume.summary }];
      } else if (type === 'experience' && (resume.experience || []).length > 0) {
        content = resume.experience.flatMap((job) => {
          const bullets = Array.isArray(job.bullets) && job.bullets.length > 0
            ? job.bullets : splitDesc(job.description || '');
          const co  = slug(job.company);
          const lbl = `${job.title} @ ${job.company} (${job.period})`;
          return bullets.slice(0, 6).map((b: string, bi: number) => ({ id: `we-${co}-${bi}`, label: bi === 0 ? lbl : '', original: b, tailored: b }));
        });
      } else if (type === 'projects' && (resume.projects || []).length > 0) {
        content = (resume.projects || []).map(p => ({ id: `proj-${slug(p.name)}-0`, label: p.name || '', original: p.description || '', tailored: p.description || '' }));
      } else if (type === 'skills' && resume.skills.length > 0) {
        content = [{ id: 'skills-hard-0', label: 'Technical', original: resume.skills.join(', '), tailored: resume.skills.join(', ') }];
      } else if (type === 'education' && (resume.education || []).length > 0) {
        content = (resume.education || []).map((edu, i) => {
          const text = [edu.degree, edu.school, edu.year ? `(${edu.year})` : ''].filter(Boolean).join(' — ');
          return { id: `edu-${i}`, label: edu.degree || '', original: text, tailored: text };
        });
      }
      if (content.length) used.add(type);
    }

    // Always create slot in correct resume order; SSE fills in content when it arrives
    sections.push({ title, rationale: '', content });
  }

  return sections;
}

export default function TailorPage({ parsedResume: propResume, user, onCommitTailoring }: TailorPageProps) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const state     = location.state as TailorPageState | null;

  const job        = state?.job ?? null;
  const resume     = state?.parsedResume ?? propResume;
  const matchTier  = state?.matchTier ?? 'mid';

  const [tailoring, setTailoring]   = useState(false);
  const [tailored,  setTailored]    = useState<TailoredResume | null>(null);
  const [tailorError, setTailorError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  // If no job in state, bounce back
  useEffect(() => {
    if (!job) navigate('/', { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Start SSE streaming on mount (re-runs on retry)
  useEffect(() => {
    if (!job) return;

    let cancelled = false;
    setTailoring(true);
    setTailored({ _version: 4, sections: buildInitialSections(resume) });
    setTailorError('');

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 120_000);
    const t0         = performance.now();
    let ttfs: number | null = null;

    (async () => {
      try {
        const res = await fetch('/api/tailor-resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parsed_resume:   resume,
            job_description: job.description || `${job.job_title} at ${job.company}. Requirements: ${(job.requirements_array || []).join(', ')}`,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const text = await res.text();
          let msg = `Server error (${res.status})`;
          try { msg = JSON.parse(text).error || msg; } catch {}
          throw new Error(msg);
        }

        const reader  = res.body!.getReader();
        const decoder = new TextDecoder();
        let sseBuf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuf += decoder.decode(value, { stream: true });
          const parts = sseBuf.split('\n\n');
          sseBuf = parts.pop() ?? '';

          for (const part of parts) {
            const line = part.split('\n').find(l => l.startsWith('data: '));
            if (!line) continue;
            let event;
            try { event = JSON.parse(line.slice(6)); } catch { continue; }

            if (event.type === 'section') {
              if (ttfs === null) {
                ttfs = Math.round(performance.now() - t0);
                console.log(`[tailor-page] TTFS ${ttfs}ms — "${event.section.title}"`);
              }
              setTailored(prev => {
                const existing = prev?.sections || [];
                const idx = existing.findIndex(s => s.title === event.section.title);
                if (idx >= 0) {
                  const updated = [...existing];
                  updated[idx] = event.section;
                  return { _version: 4, sections: updated };
                }
                return { _version: 4, sections: [...existing, event.section] };
              });
            } else if (event.type === 'error') {
              throw new Error(event.message);
            } else if (event.type === 'done') {
              console.log(`[tailor-page] done — total ${Math.round(performance.now() - t0)}ms`);
            }
          }
        }
      } catch (err) {
        if (cancelled) return; // cleanup-triggered abort — don't update state
        clearTimeout(timeoutId);
        const e = err as Error & { name?: string };
        if (e.name === 'AbortError') {
          setTailorError('Tailoring timed out. The AI is busy — please try again.');
        } else {
          setTailorError(e.message ?? String(err));
        }
      } finally {
        if (!cancelled) setTailoring(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBack = () => navigate(-1);

  const handleCommit = (jobId: string) => {
    onCommitTailoring(jobId);
    navigate('/', { state: { committedJobId: jobId } });
  };

  if (!job) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>
      {/* Top bar — always visible; gives back navigation even before drawer renders */}
      <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'var(--paper)', borderBottom: '1px solid var(--rule)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={handleBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--rule)', borderRadius: 2, padding: '6px 12px', cursor: 'pointer', fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: 'var(--sumi)', flexShrink: 0 }}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M9 2 L3 7 L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to jobs
        </button>
        <div style={{ height: 16, width: 1, background: 'var(--rule)' }} />
        <span className="tm-mono" style={{ fontSize: 10, letterSpacing: '0.18em', color: 'var(--sumi-mute)', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job.job_title} · {job.company}
        </span>
      </div>

      {tailorError && (
        <div style={{ padding: '12px 24px', background: '#FEF2F2', borderBottom: '1px solid #FECACA', fontFamily: 'Inter', fontSize: 13, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1 }}>{tailorError}</span>
          <button
            onClick={() => setRetryCount(c => c + 1)}
            style={{ background: 'none', border: '1px solid #FECACA', borderRadius: 2, cursor: 'pointer', color: '#DC2626', fontFamily: 'Inter', fontSize: 12, fontWeight: 600, padding: '4px 10px', flexShrink: 0 }}
          >
            Try again
          </button>
          <button onClick={() => setTailorError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
      )}

      {tailored && (
        <TailoredResumeDrawer
          data={tailored as unknown as Record<string, unknown>}
          job={job}
          parsedResume={resume}
          jobTitle={job.job_title}
          company={job.company}
          autoAccept={matchTier === 'high'}
          onClose={handleBack}
          isLoggedIn={!!user}
          onRequestAuth={handleBack}
          onCommit={handleCommit}
          streaming={tailoring}
          pageMode={true}
        />
      )}
    </div>
  );
}
