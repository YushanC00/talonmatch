import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { SyntheticEvent } from 'react';
import { MapPin, Globe } from 'lucide-react';
import TailoredResumeDrawer from './TailoredResumeDrawer';
import AuthModal from './AuthModal';
import { partitionSkills } from '../utils/tokenMatcher';
import type { Job, ParsedResume, TailoredResume, TailoredSection } from '../types';
import type { User } from '@supabase/supabase-js';

interface JobCardProps {
  job: Job;
  parsedResume: ParsedResume;
  resumeLoading?: boolean;
  resumeFetched?: boolean;
  onViewDetails?: (job: Job) => void;
  isLoggedIn?: boolean;
  onLogin?: (user: User) => void;
  onSaveBeforeRedirect?: () => void;
  pendingTailorJobUrl?: string | null;
  onPendingTailorHandled?: () => void;
  isTailored?: boolean;
  onCommitTailoring?: (jobId: string) => void;
  index?: number;
}

function parseSalaryFromDesc(desc: string | undefined): string | null {
  if (!desc) return null;
  const num = '(?:CA)?\\$[\\d,]+(?:\\.\\d+)?k?';
  const period = '\\/\\s*(?:hr|hour|year|yr|annum)|per\\s+(?:year|annum|hour)';
  // Pattern 1b first (more specific): $MIN/period – $MAX/period
  const m1b = desc.match(new RegExp(`(${num})\\s*(?:${period})\\s*[-–—]\\s*(${num})\\s*(?:${period})`, 'i'));
  if (m1b) {
    const prices = m1b[0].match(new RegExp(num, 'gi')) || [];
    const per = (m1b[0].match(new RegExp(period, 'i')) || [''])[0].trim().replace(/^\/\s*/, '');
    return prices.length >= 2 ? `${prices[0]} – ${prices[1]}/${per}` : `${prices[0]}/${per}`;
  }
  // Pattern 1a: $MIN – $MAX/period  (standard format)
  const m1 = desc.match(new RegExp(`${num}(?:\\s*[-–—]\\s*${num})?\\s*(?:${period})`, 'i'));
  if (m1) return m1[0].replace(/\s+/g, ' ').trim();
  // Pattern 2: salary keyword + dollar range (no explicit period)
  const m2 = desc.match(/(?:salary|compensation|pay range|base pay|total comp)[:\s]+(?:CA)?\$[\d,]+(?:\.\d+)?k?(?:\s*[-–—]\s*(?:CA)?\$[\d,]+(?:\.\d+)?k?)?/i);
  if (m2) {
    const inner = m2[0].match(new RegExp(`${num}(?:\\s*[-–—]\\s*${num})?`, 'i'));
    return inner ? inner[0].replace(/\s+/g, ' ').trim() : null;
  }
  return null;
}

function formatRelativeTime(isoString: string | null | undefined): string | null {
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

// Extracts clean hostname from any URL shape; returns null if unparseable
function sanitizeDomain(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const COMPANY_SUFFIX_RE = /\b(inc|corp|co|ltd|llc|group|technologies|technology|solutions|services|the)\b\.?/gi;

function guessDomain(company: string | undefined): string {
  return (company || '')
    .toLowerCase()
    .replace(COMPANY_SUFFIX_RE, '')
    .replace(/[^a-z0-9]/g, '')
    .trim() + '.com';
}

// Stage 0: Clearbit  →  stage 1: Google Favicon (globe-detected)  →  stage 2: monogram
function CompanyAvatar({ company, companyUrl }: { company: string | undefined; companyUrl: string | undefined }) {
  const [stage, setStage] = useState(0);

  const domain = sanitizeDomain(companyUrl) || guessDomain(company);

  const initial = (company || '?')[0].toUpperCase();
  const monogramColors = [
    { bg: '#E8E0F0', fg: '#4A2D7A' },
    { bg: '#E8EDF8', fg: '#1E3A6E' },
    { bg: '#F5EBE0', fg: '#7A3B1E' },
    { bg: '#E0EDE8', fg: '#1E5C3E' },
    { bg: '#F0E8E8', fg: '#7A2020' },
    { bg: '#F5F0E0', fg: '#6B5120' },
    { bg: '#E0EEF2', fg: '#1A4D5C' },
  ];
  const mc = monogramColors[initial.charCodeAt(0) % monogramColors.length];

  const logoContainer = (src: string, extraOnLoad?: (e: SyntheticEvent<HTMLImageElement>) => void) => (
    <div className="w-12 h-12 shrink-0 overflow-hidden flex items-center justify-center"
      style={{ background: 'var(--washi-soft)', border: '1px solid var(--rule)', borderRadius: 0, boxShadow: 'inset 0 0 0 1px rgba(27,22,18,0.04)' }}>
      <img
        src={src}
        alt={`${company} logo`}
        loading="lazy"
        onError={() => setStage(s => s + 1)}
        onLoad={extraOnLoad}
        className="w-full h-full object-contain p-1.5"
      />
    </div>
  );

  if (stage === 0) return logoContainer(`https://logo.clearbit.com/${domain}`);
  if (stage === 1) {
    return logoContainer(
      `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
      (e) => { if (e.currentTarget.naturalWidth <= 16) setStage(2); },
    );
  }

  return (
    <div className="w-12 h-12 shrink-0 flex items-center justify-center text-sm font-bold"
      style={{ background: mc.bg, color: mc.fg, border: '1px solid var(--rule)', borderRadius: 0 }}>
      {initial}
    </div>
  );
}

function MatchSeal({ value, matched = 0, missing = 0 }: { value: number; matched?: number; missing?: number }) {
  const tier = value >= 85
    ? { color: 'var(--shu)',       label: 'PRIME'  }
    : value >= 75
    ? { color: 'var(--gold)',      label: 'STRONG' }
    : value >= 65
    ? { color: 'var(--moss)',      label: 'GOOD'   }
    : { color: 'var(--sumi-mute)', label: 'FAIR'   };

  const r = 24;
  const circ = 2 * Math.PI * r; // ≈ 150.8
  const dash = `${(value / 100) * circ} ${circ + 50}`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
      <div style={{ width: 54, height: 54, position: 'relative', display: 'grid', placeItems: 'center' }}>
        <svg viewBox="0 0 60 60" width="54" height="54" style={{ position: 'absolute', inset: 0 }}>
          <circle cx="30" cy="30" r="27" fill="none" stroke={tier.color} strokeWidth="1.4" opacity="0.35" />
          <circle cx="30" cy="30" r={r} fill="none" stroke={tier.color} strokeWidth="1.6"
            strokeDasharray={dash} transform="rotate(-90 30 30)" />
        </svg>
        <div aria-label={`${value}% match`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 0.9 }}>
          <span style={{ fontFamily: '"Shippori Mincho","Noto Serif JP",serif', fontSize: 18, fontWeight: 700, color: 'var(--sumi)' }}>{value}</span>
          <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 7, letterSpacing: '0.18em', color: 'var(--sumi-mute)', marginTop: 2 }}>MATCH</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
        <span style={{ width: 14, height: 2, background: tier.color }} />
        <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 9, letterSpacing: '0.22em', color: tier.color, fontWeight: 600 }}>{tier.label}</span>
        <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 8, letterSpacing: '0.18em', color: 'var(--sumi-mute)' }}>FIT</span>
        <div style={{ display: 'flex', gap: 4, marginTop: 1 }}>
          {matched > 0 && <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 8, color: 'var(--moss)', fontWeight: 700 }}>+{matched}</span>}
          {matched > 0 && missing > 0 && <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 8, color: 'var(--rule)' }}>/</span>}
          {missing > 0 && <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 8, color: 'var(--shu)', fontWeight: 700 }}>−{missing}</span>}
          {matched === 0 && missing === 0 && <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 8, color: 'var(--sumi-faint)' }}>—</span>}
        </div>
      </div>
    </div>
  );
}

export default function JobCard({ job, parsedResume, resumeLoading = false, resumeFetched = false, onViewDetails: _onViewDetails, isLoggedIn = false, onLogin,
  onSaveBeforeRedirect, pendingTailorJobUrl, onPendingTailorHandled,
  isTailored = false, onCommitTailoring, index: _index = 0 }: JobCardProps) {
  const { job_title, company, location, is_remote, match_score, requirements_array, url, description, postedAt, pay_range, company_url } = job;

  const [hovered, setHovered] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [tailored, setTailored] = useState<TailoredResume | null>(null);
  const [tailorError, setTailorError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [committedData, setCommittedData] = useState<{
    tailored: TailoredResume;
    reviews: Record<string, string>;
    editValues: Record<string, string>;
  } | null>(null);

  const showRemote = is_remote
    || /remote/i.test(location || '')
    || /remote/i.test(job_title || '')
    || /remote/i.test(description || '');

  const cityName = location ? location.split(',')[0].trim() : '';
  const relativeDate = formatRelativeTime(postedAt);
  const effectivePay = pay_range || parseSalaryFromDesc(description);

  const resumeSkills = parsedResume?.skills || [];
  const { matched: matchedSkills, missing: missingSkills } = partitionSkills(resumeSkills, requirements_array);
  const effectiveScore = missingSkills.length > 0 ? Math.min(match_score, 99) : match_score;
  const matchTier = (effectiveScore >= 85 && missingSkills.length === 0) ? 'high'
    : effectiveScore >= 60 ? 'mid'
    : 'low';

  useEffect(() => {
    console.log('[Matching Debug]: Resume Skills:', resumeSkills, '| Job Skills:', requirements_array ?? []);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function buildInitialSections(resume: ParsedResume | null) {
    const sections: TailoredSection[] = [];
    const slug = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 15);
    // Mirror backend splitDescription so bullet count matches AI output structure
    const splitDesc = (desc: string): string[] =>
      (desc || '').split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 10);
    // Always pre-populate Summary at position 0 so AI response replaces in-place (not appended)
    const summaryText = resume?.summary || '';
    sections.push({ title: 'Summary', rationale: '', content: [{ id: 'summary-0', label: '', original: summaryText, tailored: summaryText }] });
    if (resume?.experience?.length) {
      const content = resume.experience.flatMap((job, _ei) => {
        const bullets = Array.isArray(job.bullets) && job.bullets.length > 0
          ? job.bullets
          : splitDesc(job.description || '');
        const co = slug(job.company);
        const lbl = `${job.title} @ ${job.company} (${job.period})`;
        return bullets.slice(0, 6).map((b: string, bi: number) => ({ id: `we-${co}-${bi}`, label: bi === 0 ? lbl : '', original: b, tailored: b }));
      });
      if (content.length) sections.push({ title: 'Work Experience', rationale: '', content });
    }
    if (resume?.projects?.length) {
      const content = resume.projects.map((p: NonNullable<ParsedResume['projects']>[number]) => ({ id: `proj-${slug(p.name)}-0`, label: p.name || '', original: p.description || '', tailored: p.description || '' }));
      if (content.length) sections.push({ title: 'Projects', rationale: '', content });
    }
    if (resume?.skills?.length) {
      sections.push({ title: 'Skills', rationale: '', content: [{ id: 'skills-hard-0', label: 'Technical', original: resume.skills.join(', '), tailored: resume.skills.join(', ') }] });
    }
    return sections;
  }

  const handleTailor = async () => {
    if (tailoring) return;
    if (!isLoggedIn) {
      if (parsedResume?.skills?.length > 0) {
        localStorage.setItem('talonmatch_pending_resume', JSON.stringify({
          skills: parsedResume.skills,
          experience: parsedResume.experience ?? [],
        }));
      }
      localStorage.setItem('talonmatch_pending_tailor_job', url ?? '');
      onSaveBeforeRedirect?.();
      setShowAuthModal(true);
      return;
    }
    if (resumeFetched && !parsedResume?.experience?.length) {
      setTailorError('Upload your resume first — tailoring requires your work history.');
      return;
    }
    setTailoring(true);
    setTailored({ _version: 4, sections: buildInitialSections(parsedResume) }); // open with original content immediately
    setTailorError('');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);
    const t0 = performance.now();
    let ttfs: number | null = null;

    try {
      const res = await fetch('/api/tailor-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parsed_resume:   parsedResume,
          job_description: description || `${job_title} at ${company}. Requirements: ${(requirements_array || []).join(', ')}`,
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

      // Consume SSE stream — open drawer on first section, update on each subsequent one
      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let sseBuf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        sseBuf += chunk;
        const parts = sseBuf.split('\n\n');
        sseBuf = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch (e) { console.log('[tailor] SSE parse err:', (e as Error).message, line.slice(0, 80)); continue; }

          if (event.type === 'section') {
            if (ttfs === null) {
              ttfs = Math.round(performance.now() - t0);
              console.log(`[perf] TTFS ${ttfs}ms — "${event.section.title}"`);
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
            const total = Math.round(performance.now() - t0);
            console.log(`[perf] stream done — total ${total}ms  TTFS ${ttfs ?? '?'}ms`);
          }
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      setTailored(prev => (prev?.sections?.length ? prev : null)); // dismiss empty drawer — error shows on card
      const e = err as Error & { name?: string };
      if (e.name === 'AbortError') {
        setTailorError('Tailoring timed out. The AI is busy — please try again.');
      } else {
        setTailorError(e.message ?? String(err));
      }
    } finally {
      setTailoring(false);
    }
  };

  const handleCloseDrawer = () => setTailored(null);

  useEffect(() => {
    if (!isLoggedIn || !pendingTailorJobUrl || pendingTailorJobUrl !== url) return;
    onPendingTailorHandled?.();
    handleTailor();
  }, [isLoggedIn, pendingTailorJobUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const accentColor = isTailored
    ? 'var(--moss)'
    : (matchTier === 'high' || matchTier === 'mid') ? 'var(--shu)'
    : 'var(--sumi-mute)';

  const cornerLabel = isTailored ? 'READY'
    : (matchTier === 'high' || matchTier === 'mid') ? 'TAILOR'
    : 'DRAFT';

  return (
    <>
      <article
        className="job-card flex flex-col relative overflow-hidden min-h-[264px]"
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          padding: '20px 20px 20px 26px',
          boxShadow: hovered
            ? `0 1px 0 rgba(27,22,18,0.06), 0 22px 40px -22px rgba(27,22,18,0.32), 0 0 0 1px ${accentColor}22`
            : '0 1px 0 rgba(27,22,18,0.04), 0 12px 24px -18px rgba(27,22,18,0.18)',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Animated left ink rule */}
        <div style={{
          position: 'absolute',
          top: hovered ? 0 : 14,
          bottom: hovered ? 0 : 14,
          left: 0,
          width: hovered ? 5 : 3,
          background: accentColor,
          borderRadius: hovered ? '3px 0 0 3px' : '0 2px 2px 0',
          transition: 'top 220ms cubic-bezier(0.2, 0.8, 0.2, 1), bottom 220ms cubic-bezier(0.2, 0.8, 0.2, 1), width 180ms ease',
        }} />

        {/* Corner status tag — shoots upward on hover, reveals STRIKE arrow */}
        <div style={{ position: 'absolute', top: 0, right: 20, overflow: 'visible' }}>
          {/* Container keeps background pill shape */}
          <div
            {...(isTailored ? { 'data-testid': 'tailored-badge' } : {})}
            style={{
              background: accentColor, color: 'var(--paper)',
              padding: '4px 9px 5px',
              borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
              position: 'relative',
            }}
          >
            {/* The label that shoots away */}
            <AnimatePresence mode="wait">
              {!hovered ? (
                <motion.span
                  key="label"
                  className="tm-mono"
                  style={{ fontSize: 9, letterSpacing: '0.24em', fontWeight: 600, display: 'block' }}
                  initial={{ y: 0, opacity: 1 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -50, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  {cornerLabel}
                </motion.span>
              ) : (
                <motion.span
                  key="strike"
                  className="tm-mono"
                  style={{ fontSize: 9, letterSpacing: '0.2em', fontWeight: 700, display: 'block', whiteSpace: 'nowrap' }}
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -14, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  →
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* TOP: company avatar + № label + title */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <CompanyAvatar company={company} companyUrl={company_url} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="tm-mincho" style={{
              margin: 0, fontSize: 19, fontWeight: 600, lineHeight: 1.2,
              color: 'var(--sumi)', letterSpacing: '-0.01em',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {job_title}
            </h3>
          </div>
        </div>

        {/* COMPANY ROW */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="tm-mincho" style={{
              fontSize: 14, fontWeight: 600, color: 'var(--sumi)',
              textDecoration: 'none', borderBottom: '1px solid var(--rule)',
              paddingBottom: 1, display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              {company}
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M3 9 L9 3 M5 3 H9 V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </a>
          ) : (
            <span className="tm-mincho" style={{ fontSize: 14, fontWeight: 600, color: 'var(--sumi)' }}>{company}</span>
          )}
        </div>

        {/* META ROW — vertical rule separators */}
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', color: 'var(--sumi-mute)', fontSize: 12 }}>
          {cityName && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <MapPin size={11} strokeWidth={1.5} />
              {cityName}
            </span>
          )}
          {cityName && relativeDate && <span style={{ width: 1, height: 10, background: 'var(--rule)', flexShrink: 0 }} />}
          {relativeDate && <span>{relativeDate}</span>}
          {showRemote && <span style={{ width: 1, height: 10, background: 'var(--rule)', flexShrink: 0 }} />}
          {showRemote && (
            <span data-testid="remote-indicator" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--moss-deep)' }}>
              <Globe size={11} strokeWidth={1.5} />
              Remote
            </span>
          )}
          {effectivePay && <span style={{ width: 1, height: 10, background: 'var(--rule)', flexShrink: 0 }} />}
          {effectivePay && (
            <span className="tm-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--moss)', fontWeight: 600, fontSize: 10, letterSpacing: '0.06em' }}>
              {effectivePay}
            </span>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Divider — torn-edge repeating gradient */}
        <div style={{ marginTop: 18 }}>
          <div style={{
            height: 1, marginBottom: 14,
            backgroundImage: 'repeating-linear-gradient(to right, var(--rule) 0 4px, transparent 4px 8px)',
          }} />

          {/* FOOTER: seal left · buttons right */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>

            <MatchSeal value={effectiveScore} matched={matchedSkills.length} missing={missingSkills.length} />

            <div>
              {isTailored ? (
                (committedData || url) && (
                  <div className="action-fade-in" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {committedData && (
                      <button
                        onClick={() => setTailored(committedData.tailored)}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          fontFamily: 'Inter', fontSize: 12, fontWeight: 500,
                          color: 'var(--sumi-mute)', textDecoration: 'underline',
                          textUnderlineOffset: 3,
                        }}>
                        Edit
                      </button>
                    )}
                    {committedData && url && (
                      <span style={{ color: 'var(--rule)', fontSize: 11 }}>·</span>
                    )}
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '6px 11px', background: 'var(--moss)', color: 'var(--paper)',
                          textDecoration: 'none', borderRadius: 2, fontFamily: 'Inter', fontSize: 12, fontWeight: 600,
                          boxShadow: '0 1px 0 rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.10)',
                        }}>
                        Apply
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M3 6 H9 M7 4 L9 6 L7 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </a>
                    )}
                  </div>
                )
              ) : (() => {
                const hasResume = parsedResume?.experience?.length > 0;
                // Only permanently disable once the DB fetch has settled with no result
                const noResume = isLoggedIn && resumeFetched && !resumeLoading && !hasResume;
                // Show loading state while fetch is in-flight (or not yet started for logged-in user)
                const fetchInFlight = isLoggedIn && !resumeFetched && !hasResume;

                // Resume still loading from Supabase
                if (fetchInFlight || resumeLoading) {
                  return (
                    <button disabled style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '6px 11px', background: 'transparent',
                      color: 'var(--sumi-mute)', border: '1px solid var(--rule)',
                      borderRadius: 2, cursor: 'wait',
                      fontFamily: 'Inter', fontSize: 12, fontWeight: 600, opacity: 0.6,
                    }}>
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading…
                    </button>
                  );
                }

                // Previous attempt failed — red Retry button
                if (tailorError && !tailoring) {
                  return (
                    <button
                      onClick={() => { setTailorError(''); handleTailor(); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '6px 11px',
                        background: 'var(--shu)', color: 'var(--paper)',
                        border: 'none', borderRadius: 2, cursor: 'pointer',
                        fontFamily: 'Inter', fontSize: 12, fontWeight: 600,
                      }}>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M2 8 A6 6 0 1 1 8 14 M2 8 V4 H6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Retry
                    </button>
                  );
                }

                // Normal / tailoring-in-progress button
                return (
                  <button
                    onClick={handleTailor}
                    disabled={tailoring || noResume}
                    title={noResume ? 'Upload résumé first' : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '6px 11px',
                      background: 'transparent',
                      color: 'var(--shu)',
                      border: '1px solid var(--shu)',
                      borderRadius: 2,
                      cursor: tailoring ? 'wait' : noResume ? 'not-allowed' : 'pointer',
                      fontFamily: 'Inter', fontSize: 12, fontWeight: 600,
                      opacity: (tailoring || noResume) ? 0.45 : 1,
                    }}>
                    {tailoring ? (
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M11 2 L14 5 L6 13 L2 14 L3 10 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                      </svg>
                    )}
                    {tailoring ? 'Tailoring…' : 'Tailor & Apply'}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      </article>

      {tailored && (
        <TailoredResumeDrawer
          data={tailored as unknown as Record<string, unknown>}
          job={job}
          parsedResume={parsedResume}
          jobTitle={job_title}
          company={company}
          autoAccept={matchTier === 'high'}
          onClose={handleCloseDrawer}
          isLoggedIn={isLoggedIn}
          onRequestAuth={() => {
            if (parsedResume?.skills?.length > 0) {
              localStorage.setItem('talonmatch_pending_resume', JSON.stringify({
                skills: parsedResume.skills,
                experience: parsedResume.experience ?? [],
              }));
            }
            localStorage.setItem('talonmatch_pending_tailor_job', url ?? '');
            onSaveBeforeRedirect?.();
            setShowAuthModal(true);
          }}
          onCommit={(jobId: string) => onCommitTailoring?.(jobId)}
          onCommitWithState={(reviews, editValues) => {
            if (tailored) setCommittedData({ tailored, reviews, editValues });
          }}
          initialReviews={committedData?.reviews ?? null}
          initialEditValues={committedData?.editValues ?? null}
          savedMatchScore={null}
          streaming={tailoring}
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
