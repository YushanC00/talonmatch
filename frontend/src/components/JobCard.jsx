import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Globe } from 'lucide-react';
import TailoredResumeDrawer from './TailoredResumeDrawer';
import AuthModal from './AuthModal';
import { partitionSkills } from '../utils/tokenMatcher';

function formatRelativeTime(isoString) {
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
function sanitizeDomain(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const COMPANY_SUFFIX_RE = /\b(inc|corp|co|ltd|llc|group|technologies|technology|solutions|services|the)\b\.?/gi;

function guessDomain(company) {
  return (company || '')
    .toLowerCase()
    .replace(COMPANY_SUFFIX_RE, '')
    .replace(/[^a-z0-9]/g, '')
    .trim() + '.com';
}

// Stage 0: Clearbit  →  stage 1: Google Favicon (globe-detected)  →  stage 2: monogram
function CompanyAvatar({ company, companyUrl }) {
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

  const logoContainer = (src, extraOnLoad) => (
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

function MatchSeal({ value, matched = 0, missing = 0 }) {
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 0.9 }}>
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

export default function JobCard({ job, parsedResume, onViewDetails, isLoggedIn = false, onLogin,
  onSaveBeforeRedirect, pendingTailorJobUrl, onPendingTailorHandled,
  isTailored = false, onCommitTailoring, index = 0 }) {
  const { job_title, company, location, is_remote, match_score, requirements_array, url, description, postedAt, pay_range, company_url } = job;

  const [hovered, setHovered] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [tailored, setTailored] = useState(null);
  const [tailorError, setTailorError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);

  const showRemote = is_remote
    || /remote/i.test(location || '')
    || /remote/i.test(job_title || '')
    || /remote/i.test(description || '');

  const cityName = location ? location.split(',')[0].trim() : '';
  const relativeDate = formatRelativeTime(postedAt);

  const resumeSkills = parsedResume?.skills || [];
  const { matched: matchedSkills, missing: missingSkills } = partitionSkills(resumeSkills, requirements_array);
  const effectiveScore = missingSkills.length > 0 ? Math.min(match_score, 99) : match_score;
  const matchTier = (effectiveScore >= 85 && missingSkills.length === 0) ? 'high'
    : effectiveScore >= 60 ? 'mid'
    : 'low';

  useEffect(() => {
    console.log('[Matching Debug]: Resume Skills:', resumeSkills, '| Job Skills:', requirements_array ?? []);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTailor = async () => {
    if (!isLoggedIn) {
      if (parsedResume?.skills?.length > 0) {
        localStorage.setItem('talonmatch_pending_resume', JSON.stringify({
          skills: parsedResume.skills,
          experience: parsedResume.experience ?? [],
        }));
      }
      localStorage.setItem('talonmatch_pending_tailor_job', url);
      onSaveBeforeRedirect?.();
      setShowAuthModal(true);
      return;
    }
    if (tailoring) return;
    setTailoring(true);
    setTailorError('');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    try {
      const res = await fetch('/api/tailor-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parsed_resume: parsedResume,
          job_description: description || `${job_title} at ${company}. Requirements: ${(requirements_array || []).join(', ')}`,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
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
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        setTailorError('Tailoring timed out. The AI is busy — please try again.');
      } else {
        setTailorError(err.message ?? String(err));
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
          <div style={{
            background: accentColor, color: 'var(--paper)',
            padding: '4px 9px 5px',
            borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
            position: 'relative',
          }}>
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
          {pay_range && (
            <span className="tm-mono" style={{ fontSize: 10, color: 'var(--moss)', fontWeight: 600, letterSpacing: '0.05em' }}>{pay_range}</span>
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
        </div>

        {tailorError && (
          <p className="text-xs break-all mt-2" style={{ color: 'var(--shu)' }}>{tailorError}</p>
        )}

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
                url && (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="action-fade-in"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '6px 11px', background: 'var(--moss)', color: 'var(--paper)',
                      border: 'none', borderRadius: 2, fontFamily: 'Inter', fontSize: 12, fontWeight: 600,
                      textDecoration: 'none',
                      boxShadow: '0 1px 0 rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.10)',
                    }}>
                    Ready to Apply
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M3 6 H9 M7 4 L9 6 L7 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                )
              ) : (
                <button onClick={handleTailor} disabled={tailoring}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '6px 11px',
                    background: 'transparent',
                    color: 'var(--shu)',
                    border: '1px solid var(--shu)',
                    borderRadius: 2, cursor: tailoring ? 'wait' : 'pointer',
                    fontFamily: 'Inter', fontSize: 12, fontWeight: 600,
                    opacity: tailoring ? 0.6 : 1,
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
              )}
            </div>
          </div>
        </div>
      </article>

      {tailored && (
        <TailoredResumeDrawer
          data={tailored}
          job={job}
          parsedResume={parsedResume}
          jobTitle={job_title}
          company={company}
          autoAccept={matchTier === 'high'}
          onClose={handleCloseDrawer}
          onCommit={(jobId) => onCommitTailoring?.(jobId)}
          initialReviews={null}
          initialEditValues={null}
          savedMatchScore={null}
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
