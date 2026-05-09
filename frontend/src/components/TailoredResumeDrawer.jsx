import { Component, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import * as Diff from 'diff';
import { Pencil, Check } from 'lucide-react';
import { skillMatches } from '../utils/tokenMatcher';
import { saveApplication } from '../lib/saveApplication';

class DrawerErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { caught: false }; }
  static getDerivedStateFromError() { return { caught: true }; }
  render() {
    if (this.state.caught) {
      return (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--paper)', border: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 50 }}>
          <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--sumi)' }}>Something went wrong rendering the panel.</p>
          <button onClick={this.props.onClose} style={{ padding: '8px 16px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--sumi)', cursor: 'pointer', fontFamily: 'Inter', fontSize: 12, borderRadius: 2 }}>Close</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function cleanBulletText(text) {
  if (!text) return '';
  return text
    .replace(/^[^:–—\n]{3,60}(?:at|@|\||–|—|:)\s*/i, '')
    .replace(/^\d{4}\s*[-–—]\s*(?:\d{4}|present)\s*[-–—]?\s*/i, '')
    .trim();
}

function computeDiffCounts(original, tailored) {
  const parts = Diff.diffWords(original || '', tailored || '');
  const added   = parts.filter(p => p.added).reduce((s, p) => s + p.value.split(/\s+/).filter(Boolean).length, 0);
  const removed = parts.filter(p => p.removed).reduce((s, p) => s + p.value.split(/\s+/).filter(Boolean).length, 0);
  return { added, removed };
}

const DiffText = memo(function DiffText({ original, tailored }) {
  const parts = Diff.diffWords(original || '', tailored || '');
  return (
    <span>
      {parts.map((part, i) => {
        if (part.added) return (
          <mark key={i} style={{ background: '#DDEFCE', color: 'var(--moss-deep)', padding: '2px 5px', borderRadius: 2, boxShadow: 'inset 0 -2px 0 rgba(71,93,42,0.18)', fontStyle: 'normal', fontWeight: 500 }}>{part.value}</mark>
        );
        if (part.removed) return (
          <span key={i} style={{ background: '#F8E2DC', color: 'var(--shu-deep)', padding: '2px 5px', borderRadius: 2, textDecoration: 'line-through', textDecorationColor: 'var(--shu)', textDecorationThickness: '1.5px' }}>{part.value}</span>
        );
        return <span key={i}>{part.value}</span>;
      })}
    </span>
  );
});

const SECTION_HEAD = {
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: 11, letterSpacing: '0.24em',
  color: 'var(--sumi-mute)', textTransform: 'uppercase',
  fontWeight: 600, margin: '0 0 12px',
};

const ReviewCard = memo(function ReviewCard({ status, onAccept, onCancel, addedCount = 0, removedCount = 0, children }) {
  const borderColor = status === 'accepted' ? 'var(--moss-soft)' : status === 'cancelled' ? 'var(--shu-soft)' : 'var(--rule)';
  const bgColor     = status === 'accepted' ? 'rgba(90,122,78,0.06)' : status === 'cancelled' ? 'rgba(168,94,62,0.04)' : 'var(--paper)';
  return (
    <div style={{ border: `1px solid ${borderColor}`, borderRadius: 3, padding: '20px 22px', background: bgColor, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.5)', transition: 'border-color 200ms ease, background 200ms ease' }}>
      {children}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
        <button onClick={onAccept} style={{ padding: '7px 16px', borderRadius: 2, background: status === 'accepted' ? 'var(--moss)' : 'transparent', color: status === 'accepted' ? 'var(--paper)' : 'var(--sumi)', border: status === 'accepted' ? 'none' : '1px solid var(--rule)', fontFamily: 'Inter', fontSize: 12, fontWeight: 600, cursor: 'pointer', boxShadow: status === 'accepted' ? '0 1px 0 rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.10)' : 'none' }}>
          {status === 'accepted' ? '✓ Accepted' : 'Accept'}
        </button>
        <button onClick={onCancel} style={{ padding: '7px 16px', borderRadius: 2, background: status === 'cancelled' ? 'var(--shu)' : 'transparent', color: status === 'cancelled' ? 'var(--paper)' : 'var(--sumi)', border: status === 'cancelled' ? 'none' : '1px solid var(--rule)', fontFamily: 'Inter', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          {status === 'cancelled' ? 'Using Original' : 'Cancel'}
        </button>
        {(addedCount > 0 || removedCount > 0) && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'var(--sumi-mute)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            {addedCount > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, background: '#DDEFCE', border: '1px solid var(--moss-soft)', display: 'inline-block', flexShrink: 0 }} />
                +{addedCount} added
              </span>
            )}
            {removedCount > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, background: '#F8E2DC', border: '1px solid var(--shu-soft)', display: 'inline-block', flexShrink: 0 }} />
                −{removedCount} cut
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
});

function TailoredResumeDrawerInner({
  data,
  job,
  parsedResume,
  jobTitle,
  company,
  autoAccept = false,
  onClose,
  onCommit,
  initialReviews = null,
  initialEditValues = null,
  savedMatchScore = null,
}) {
  const requirements    = job?.requirements_array || [];
  const totalRequirements = requirements.length;
  const resumeSkills    = parsedResume?.skills || [];
  const missingSkillsSet = new Set(
    requirements.filter(r => !skillMatches(resumeSkills, r)).map(s => s.toLowerCase())
  );
  const baseMatchedCount  = requirements.filter(r =>  skillMatches(resumeSkills, r)).length;
  const matchedReqSkills  = requirements.filter(r =>  skillMatches(resumeSkills, r));
  const missingReqSkills  = requirements.filter(r => !skillMatches(resumeSkills, r));

  const pdfRef     = useRef(null);
  const contentRef = useRef(null);
  const sectionRefs = useRef({});

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 320);
  }, [onClose]);

  const isV3        = data?._version === 3;
  const isNewFormat = !isV3 && typeof data.summary === 'string';

  const [reviews, setReviews] = useState(() => {
    if (initialReviews) return initialReviews;
    if (!autoAccept || isV3) return {};
    const r = { summary: 'accepted' };
    (data.tailored_experience || []).forEach((exp, i) => {
      (exp.bullets || []).forEach((_, j) => { r[`exp-${i}-${j}`] = 'accepted'; });
    });
    (data.tailored_projects || []).forEach((proj, i) => {
      (proj.bullets || []).forEach((_, j) => { r[`proj-${i}-${j}`] = 'accepted'; });
    });
    return r;
  });

  const [editMode,   setEditMode]   = useState({});
  const [editValues, setEditValues] = useState(initialEditValues ?? {});
  const [committing, setCommitting] = useState(false);
  const [toast,      setToast]      = useState(null);
  const [toastMsg,   setToastMsg]   = useState('');
  const [flashing,   setFlashing]   = useState(false);
  const [activeSection, setActiveSection] = useState('summary');
  const [openExperience, setOpenExperience] = useState(() => new Set([0]));
  const prevScoreRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose]);

  const getReview = (k) => reviews[k] || null;
  const setReview = (k, status) => setReviews(prev => ({ ...prev, [k]: status }));

  const summaryObj = isNewFormat
    ? { original_text: '', tailored_text: data.summary || '', change_reason: '' }
    : isV3
    ? { original_text: '', tailored_text: data['Summary'] || '', change_reason: '' }
    : (data.summary || { original_text: '', tailored_text: '', change_reason: '' });

  const detectSkills = (text) =>
    [...missingSkillsSet].filter(s => text.toLowerCase().includes(s.toLowerCase()));

  const acceptedInjectedSkills = useMemo(() => {
    const all = new Set();
    if (getReview('summary') === 'accepted') {
      const text = editValues['summary'] || summaryObj.tailored_text || '';
      detectSkills(text).forEach(s => all.add(s));
    }
    (data.tailored_experience || []).forEach((exp, i) => {
      (exp.bullets || []).forEach((bullet, j) => {
        const rkey = `exp-${i}-${j}`;
        if (getReview(rkey) === 'accepted') {
          const t = editValues[rkey] || (typeof bullet === 'object' ? bullet.tailored_text : bullet);
          detectSkills(t || '').forEach(s => all.add(s));
        }
      });
    });
    (data.tailored_projects || []).forEach((proj, i) => {
      (proj.bullets || []).forEach((bullet, j) => {
        const rkey = `proj-${i}-${j}`;
        if (getReview(rkey) === 'accepted') {
          const t = editValues[rkey] || (typeof bullet === 'object' ? bullet.tailored_text : bullet);
          detectSkills(t || '').forEach(s => all.add(s));
        }
      });
    });
    return all;
  }, [reviews, editValues]); // eslint-disable-line react-hooks/exhaustive-deps

  const newlyMatchedCount = [...acceptedInjectedSkills].filter(s => missingSkillsSet.has(s)).length;
  const dynamicScore = (isNewFormat || isV3)
    ? (job?.match_score ?? savedMatchScore ?? 0)
    : totalRequirements > 0
      ? Math.round(((baseMatchedCount + newlyMatchedCount) / totalRequirements) * 100)
      : (savedMatchScore ?? job?.match_score ?? 0);

  useEffect(() => {
    if (prevScoreRef.current !== null && dynamicScore > prevScoreRef.current) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 700);
      return () => clearTimeout(t);
    }
    prevScoreRef.current = dynamicScore;
  }, [dynamicScore]);

  const getFinalBullet = (bullet, i, j, prefix = 'exp') => {
    const rkey = `${prefix}-${i}-${j}`;
    if (editValues[rkey] !== undefined) return editValues[rkey];
    const status  = getReview(rkey);
    const orig    = typeof bullet === 'object' ? (bullet.original_text ?? '') : cleanBulletText(bullet);
    const tailored = typeof bullet === 'object' ? (bullet.tailored_text  ?? '') : cleanBulletText(bullet);
    const isNew   = typeof bullet === 'object' && !!bullet.is_new_suggestion;
    if (status === 'cancelled') return isNew ? null : orig;
    if (status === 'accepted')  return tailored;
    return isNew ? null : tailored;
  };

  const totalItems = isV3
    ? 1
      + (data['Work Experience'] || []).reduce((s, e) => s + (e.bullets?.length || 0), 0)
      + (data['Projects'] || []).length
    : 1
      + (data.tailored_experience || []).reduce((s, e) => s + (e.bullets?.length || 0), 0)
      + (data.tailored_projects   || []).reduce((s, p) => s + (p.bullets?.length || 0), 0);

  const reviewedCount = Object.keys(reviews).length + Object.keys(editValues).length;
  const progressPct   = totalItems > 0 ? Math.min(100, Math.round((reviewedCount / totalItems) * 100)) : 0;

  const handleDownload = async () => {
    const html2pdf = (await import('html2pdf.js')).default;
    html2pdf()
      .set({
        margin: [12, 14, 12, 14],
        filename: `tailored-resume-${company?.replace(/\s+/g, '-').toLowerCase() || 'job'}.pdf`,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(pdfRef.current)
      .save();
  };

  const summaryStatus = getReview('summary');
  const finalSummary  = editValues['summary'] ?? (summaryStatus === 'cancelled' ? (summaryObj.original_text || '') : summaryObj.tailored_text);

  function openEdit(key, currentText) {
    if (!(key in editValues)) setEditValues(prev => ({ ...prev, [key]: currentText }));
    setEditMode(prev => ({ ...prev, [key]: true }));
  }

  function saveEdit(key) {
    setEditMode(prev => ({ ...prev, [key]: false }));
    setReview(key, 'accepted');
  }

  const handleCommit = useCallback(async () => {
    const jobId = job?.url || `${jobTitle}|${company}`;
    onCommit?.(jobId);
    setCommitting(true);
    const tailoredJson = { aiResponse: data, reviews, editValues };
    try {
      await saveApplication({ jobId, jobTitle, company, tailoredJson, matchScore: dynamicScore });
      setToast('success');
    } catch (err) {
      console.error('[commit]', err);
      setToastMsg(err.message ?? String(err));
      setToast('error');
    } finally {
      setCommitting(false);
      setTimeout(() => setToast(null), 3500);
    }
  }, [job, jobTitle, company, data, reviews, editValues, onCommit]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollTo = useCallback((key) => {
    const el = sectionRefs.current[key];
    const container = contentRef.current;
    if (!el || !container) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    container.scrollTo({ top: elRect.top - containerRect.top + container.scrollTop - 16, behavior: 'smooth' });
  }, []);

  const toggleExp = useCallback((ei) => {
    setOpenExperience(prev => {
      const next = new Set(prev);
      if (next.has(ei)) next.delete(ei); else next.add(ei);
      return next;
    });
  }, []);

  const acceptAllForEntry = useCallback((prefix, ei, bulletCount) => {
    setReviews(prev => {
      const next = { ...prev };
      for (let bi = 0; bi < bulletCount; bi++) next[`${prefix}-${ei}-${bi}`] = 'accepted';
      return next;
    });
  }, []);

  // V3 sections
  const v3Summary    = isV3 ? (data['Summary']        || '') : '';
  const v3Experience = isV3 ? (data['Work Experience'] || []) : [];
  const v3Projects   = isV3 ? (data['Projects']        || []) : [];
  const v3Skills     = isV3 ? (data['Skills']          || []) : [];
  const origExperience = parsedResume?.experience || [];
  const origProjects   = parsedResume?.projects   || [];

  // Sidebar counts
  const summaryHasContent = isV3 ? !!v3Summary : !!summaryObj.tailored_text;
  const summaryReviewKey  = isV3 ? 's:Summary' : 'summary';
  const summaryReviewed   = summaryHasContent && (getReview(summaryReviewKey) !== null || summaryReviewKey in editValues) ? 1 : 0;
  const expEntries  = isV3 ? v3Experience : (data.tailored_experience || []);
  const expTotal    = expEntries.reduce((s, e) => s + (e.bullets?.length || 0), 0);
  const expPrefix   = isV3 ? 'Work Experience' : 'exp';
  const expReviewed = Object.keys({ ...reviews, ...editValues }).filter(k => k.startsWith(expPrefix + '-')).length;
  const projEntries  = isV3 ? v3Projects : (data.tailored_projects || []);
  const projTotal    = isV3 ? projEntries.length : projEntries.reduce((s, p) => s + (p.bullets?.length || 0), 0);
  const projPrefix   = isV3 ? 'Projects' : 'proj';
  const projReviewed = Object.keys({ ...reviews, ...editValues }).filter(k => k.startsWith(projPrefix + '-')).length;

  const navItems = [
    { k: 'summary',    label: 'Summary',    count: summaryHasContent ? `${summaryReviewed}/1` : '—' },
    { k: 'skills',     label: 'Skills',     count: requirements.length > 0 ? `${matchedReqSkills.length}/${requirements.length}` : '—' },
    { k: 'experience', label: 'Experience', count: expTotal > 0  ? `${expReviewed}/${expTotal}`   : '—' },
    { k: 'projects',   label: 'Projects',   count: projTotal > 0 ? `${projReviewed}/${projTotal}` : '—' },
  ];

  // ── Shared render helpers ──────────────────────────────────────────────────

  const editBtn = (onClick) => (
    <button
      className="tailor-edit-btn"
      onClick={onClick}
      style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid var(--rule)', borderRadius: 2, padding: '3px 7px', background: 'var(--paper)', color: 'var(--sumi-mute)', cursor: 'pointer', fontFamily: 'Inter', fontSize: 11 }}
    >
      <Pencil size={10} strokeWidth={1.8} />
    </button>
  );

  const editSaveRow = (label, isEditing, onEdit, onSave) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
      <h3 style={SECTION_HEAD}>{label}</h3>
      {!isEditing ? (
        <button onClick={onEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--sumi-soft)', cursor: 'pointer', fontFamily: 'Inter', fontSize: 12, fontWeight: 500 }}>
          <Pencil size={11} strokeWidth={1.8} /> Edit
        </button>
      ) : (
        <button onClick={onSave} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--moss-deep)', cursor: 'pointer', fontFamily: 'Inter', fontSize: 12, fontWeight: 600 }}>
          <Check size={11} strokeWidth={2.5} /> Save
        </button>
      )}
    </div>
  );

  const textareaStyle = { width: '100%', border: '1px solid var(--rule)', borderRadius: 3, padding: '12px 16px', resize: 'none', fontFamily: 'Inter', fontSize: 14, lineHeight: 1.7, color: 'var(--sumi)', background: 'var(--paper)', outline: 'none', boxSizing: 'border-box' };

  const saveBtn = (onClick) => (
    <button onClick={onClick} style={{ alignSelf: 'flex-end', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--moss-deep)', cursor: 'pointer', fontFamily: 'Inter', fontSize: 12, fontWeight: 600 }}>
      <Check size={11} strokeWidth={2.5} /> Save
    </button>
  );

  const accordionHeader = (entry, ei, bullets, allAccepted, prefixKey, isOpen) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'var(--washi-soft)' }}>
      <button onClick={() => toggleExp(ei)} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none' }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, color: 'var(--sumi-mute)', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 200ms ease' }}>
          <path d="M2 4 L6 8 L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flex: 1 }}>
          <span style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 700, color: 'var(--sumi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.title}</span>
          {entry.company && <span style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--sumi-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {entry.company}</span>}
        </div>
        {entry.period && <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'var(--sumi-mute)', flexShrink: 0, marginLeft: 8 }}>{entry.period}</span>}
      </button>
      <button onClick={() => acceptAllForEntry(prefixKey, ei, bullets.length)} style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 2, cursor: 'pointer', background: allAccepted ? 'rgba(90,122,78,0.08)' : 'var(--paper)', color: allAccepted ? 'var(--moss-deep)' : 'var(--sumi-mute)', border: `1px solid ${allAccepted ? 'var(--moss-soft)' : 'var(--rule)'}`, fontFamily: 'Inter', fontSize: 12, fontWeight: 600 }}>
        {allAccepted ? '✓ Accepted' : 'Accept All'}
      </button>
    </div>
  );

  const bulletRow = (rkey, text, status, origBullet) => (
    <div className="tailor-bullet-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', border: `1px solid ${status === 'accepted' ? 'var(--moss-soft)' : 'var(--rule)'}`, borderRadius: 3, background: status === 'accepted' ? 'rgba(90,122,78,0.04)' : 'var(--paper)', transition: 'border-color 200ms, background 200ms' }}>
      <span style={{ marginTop: 8, width: 4, height: 4, borderRadius: '50%', background: 'var(--rule)', flexShrink: 0 }} />
      <p style={{ fontFamily: 'Inter', fontSize: 14, lineHeight: 1.7, color: 'var(--sumi)', flex: 1, margin: 0 }}>
        {editValues[rkey] !== undefined ? editValues[rkey]
          : origBullet ? <DiffText original={origBullet} tailored={text} />
          : text}
      </p>
      {editBtn(() => openEdit(rkey, text))}
    </div>
  );

  const emptySection = (msg) => (
    <div style={{ padding: '18px 22px', border: '1px dashed var(--rule)', borderRadius: 3, background: 'var(--washi-soft)', color: 'var(--sumi-mute)', fontSize: 13, fontStyle: 'italic', fontFamily: 'Inter' }}>{msg}</div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} role="dialog" aria-modal="true">

      {/* CSS for hover-reveal edit buttons */}
      <style>{`
        .tailor-bullet-row .tailor-edit-btn,
        .tailor-proj-row .tailor-edit-btn { opacity: 0; transition: opacity 150ms; }
        .tailor-bullet-row:hover .tailor-edit-btn,
        .tailor-proj-row:hover .tailor-edit-btn { opacity: 1; }
      `}</style>

      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(27,22,18,0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 24px', overflowY: 'auto' }}
        onClick={handleClose}
        data-testid="drawer-backdrop"
      >
        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 14 }}
          animate={visible ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.97, y: 14 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          style={{ width: '100%', maxWidth: 980, background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 3, boxShadow: '0 30px 60px -20px rgba(27,22,18,0.4)', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 80px)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Shu top stripe */}
          <div style={{ height: 3, background: 'var(--shu)', borderRadius: '3px 3px 0 0', flexShrink: 0 }} />

          {/* HEADER */}
          <header style={{ padding: '22px 28px 18px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'flex-start', gap: 16, flexShrink: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.24em', color: 'var(--sumi-mute)', textTransform: 'uppercase', marginBottom: 6 }}>
                Tailoring · {company}
              </div>
              <h2 className="tm-mincho" style={{ margin: 0, fontSize: 26, fontWeight: 700, color: 'var(--sumi)', letterSpacing: '-0.015em' }}>
                {autoAccept ? 'Résumé ready to download' : 'Review tailored résumé'}
              </h2>
              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--sumi-mute)', fontFamily: 'Inter' }}>
                {jobTitle} <span style={{ color: 'var(--sumi-faint)' }}>·</span> {company}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              {/* Match score badge */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 2, background: flashing ? 'var(--moss)' : '#E8EFD9', color: flashing ? 'var(--paper)' : 'var(--moss-deep)', fontFamily: 'Inter', fontSize: 13, fontWeight: 700, border: `1px solid ${flashing ? 'var(--moss)' : 'var(--moss-soft)'}`, transition: 'background 300ms ease, color 300ms ease, border-color 300ms ease' }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="2"    y="9" width="2.6" height="5"  fill="currentColor"/>
                  <rect x="6.7"  y="6" width="2.6" height="8"  fill="currentColor"/>
                  <rect x="11.4" y="3" width="2.6" height="11" fill="currentColor"/>
                </svg>
                {dynamicScore}% match
              </span>
              {/* PDF */}
              <button onClick={handleDownload} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', border: '1px solid var(--rule)', borderRadius: 2, background: 'var(--paper)', color: 'var(--sumi)', cursor: 'pointer', fontFamily: 'Inter', fontSize: 12, fontWeight: 600 }}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M3 8 L7 12 L11 8 M7 2 V12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                PDF
              </button>
              {/* Close */}
              <button onClick={handleClose} aria-label="Close" style={{ width: 32, height: 32, border: '1px solid var(--rule)', borderRadius: 2, background: 'var(--paper)', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3 L11 11 M11 3 L3 11" stroke="var(--sumi)" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </header>

          {/* BODY */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', flex: 1, overflow: 'hidden' }}>

            {/* Sidebar nav */}
            <nav style={{ borderRight: '1px solid var(--rule)', background: 'var(--washi-soft)', padding: '22px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.24em', color: 'var(--sumi-mute)', textTransform: 'uppercase', marginBottom: 14 }}>Navigate</div>
              {navItems.map(item => {
                const active = activeSection === item.k;
                return (
                  <button key={item.k} onClick={() => { setActiveSection(item.k); scrollTo(item.k); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 10px', textAlign: 'left', cursor: 'pointer', background: active ? 'var(--paper)' : 'transparent', border: active ? '1px solid var(--rule)' : '1px solid transparent', borderLeft: active ? '3px solid var(--shu)' : '3px solid transparent', borderRadius: 2, fontFamily: 'Inter', fontSize: 13, fontWeight: active ? 600 : 500, color: active ? 'var(--sumi)' : 'var(--sumi-soft)', transition: 'all 150ms ease' }}>
                    <span>{item.label}</span>
                    <span className="tm-mono" style={{ fontSize: 10, color: 'var(--sumi-mute)' }}>{item.count}</span>
                  </button>
                );
              })}
              <div style={{ marginTop: 24, padding: 12, border: '1px dashed var(--rule)', borderRadius: 2, fontSize: 11, color: 'var(--sumi-mute)', lineHeight: 1.5, fontFamily: 'Inter', fontStyle: 'italic' }}>
                Accept or revert each AI edit. Score updates as you go.
              </div>
            </nav>

            {/* Scrollable content */}
            <div ref={contentRef} style={{ overflowY: 'auto', padding: '24px 28px 32px', display: 'flex', flexDirection: 'column', gap: 28 }}>

              {/* Skill Alignment — always shown */}
              {requirements.length > 0 && (
                <section ref={el => { sectionRefs.current['skills'] = el; }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h3 style={SECTION_HEAD}>Skill alignment</h3>
                    <div style={{ fontSize: 12, color: 'var(--sumi-mute)', fontFamily: 'Inter' }}>
                      <span className="tm-mincho" style={{ fontSize: 14, fontWeight: 700, color: 'var(--moss-deep)' }}>{matchedReqSkills.length}</span>
                      <span> / {requirements.length} matched</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {matchedReqSkills.map(s => (
                      <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: '1px solid var(--moss-soft)', borderRadius: 999, background: 'rgba(90,122,78,0.06)', fontSize: 12, color: 'var(--moss-deep)', fontWeight: 500, fontFamily: 'Inter' }}>
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6 L5 9 L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        {s}
                      </span>
                    ))}
                    {missingReqSkills.map(s => (
                      <span key={s} style={{ padding: '6px 14px', border: '1px solid var(--rule)', borderRadius: 999, background: 'var(--paper)', fontSize: 12, color: 'var(--sumi-mute)', fontWeight: 500, fontFamily: 'Inter' }}>{s}</span>
                    ))}
                  </div>
                </section>
              )}

              {/* ── V3 sections ─────────────────────────────────────────────── */}
              {isV3 && (
                <>
                  {v3Summary && (
                    <section ref={el => { sectionRefs.current['summary'] = el; }}>
                      {editSaveRow('Summary', !!editMode['s:Summary'],
                        () => openEdit('s:Summary', editValues['s:Summary'] ?? v3Summary),
                        () => saveEdit('s:Summary')
                      )}
                      {editMode['s:Summary'] ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <textarea value={editValues['s:Summary'] ?? v3Summary} onChange={(e) => setEditValues(prev => ({ ...prev, 's:Summary': e.target.value }))} style={{ ...textareaStyle, fontFamily: '"Shippori Mincho","Noto Serif JP",serif', fontSize: 15, lineHeight: 1.85 }} rows={4} />
                          {saveBtn(() => saveEdit('s:Summary'))}
                        </div>
                      ) : (
                        <div style={{ background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 3, padding: '20px 22px', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.5)' }}>
                          <p className="tm-mincho" style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: 'var(--sumi)' }}>
                            {editValues['s:Summary'] !== undefined ? editValues['s:Summary']
                              : parsedResume?.summary ? <DiffText original={parsedResume.summary} tailored={v3Summary} />
                              : v3Summary}
                          </p>
                        </div>
                      )}
                    </section>
                  )}

                  {v3Skills.length > 0 && (
                    <section>
                      <h3 style={SECTION_HEAD}>Skills</h3>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {v3Skills.map((item, i) => (
                          <span key={i} style={{ padding: '6px 14px', border: '1px solid var(--rule)', borderRadius: 999, background: 'var(--paper)', fontSize: 12, color: 'var(--sumi)', fontWeight: 500, fontFamily: 'Inter' }}>{item}</span>
                        ))}
                      </div>
                    </section>
                  )}

                  {v3Experience.length > 0 && (
                    <section ref={el => { sectionRefs.current['experience'] = el; }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <h3 style={SECTION_HEAD}>Work Experience</h3>
                      {v3Experience.map((entry, ei) => {
                        const isOpen    = openExperience.has(ei);
                        const origEntry = origExperience[ei];
                        const origBullets = origEntry
                          ? (Array.isArray(origEntry.bullets) && origEntry.bullets.length > 0
                              ? origEntry.bullets
                              : (origEntry.description || '').split(/[.!?]\s+/).filter(s => s.trim().length > 10))
                          : [];
                        const bullets    = entry.bullets || [];
                        const allAccepted = bullets.length > 0 && bullets.every((_, bi) => reviews[`Work Experience-${ei}-${bi}`] === 'accepted');
                        return (
                          <div key={ei} ref={el => { sectionRefs.current[`exp-${ei}`] = el; }} style={{ border: '1px solid var(--rule)', borderRadius: 3, overflow: 'hidden' }}>
                            {accordionHeader(entry, ei, bullets, allAccepted, 'Work Experience', isOpen)}
                            {isOpen && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 18px' }}>
                                {bullets.map((bullet, bi) => {
                                  const rkey  = `Work Experience-${ei}-${bi}`;
                                  const text  = editValues[rkey] ?? bullet;
                                  const origB = origBullets[bi] || '';
                                  const status = reviews[rkey] || null;
                                  if (editMode[rkey]) return (
                                    <div key={bi} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      <textarea value={text} onChange={(e) => setEditValues(prev => ({ ...prev, [rkey]: e.target.value }))} style={textareaStyle} rows={3} />
                                      {saveBtn(() => saveEdit(rkey))}
                                    </div>
                                  );
                                  return <div key={bi}>{bulletRow(rkey, text, status, origB)}</div>;
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </section>
                  )}

                  {v3Projects.length > 0 && (
                    <section ref={el => { sectionRefs.current['projects'] = el; }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <h3 style={SECTION_HEAD}>Projects</h3>
                      {v3Projects.map((proj, pi) => {
                        const origProj = origProjects.find(p => p.name === proj.name) ?? origProjects[pi];
                        const origDesc = origProj?.description || '';
                        const rkey = `Projects-${pi}-d`;
                        const text = editValues[rkey] ?? (proj.description || '');
                        return (
                          <div key={pi}>
                            <h4 style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 700, color: 'var(--sumi)', marginBottom: 10, marginTop: 0 }}>{proj.name}</h4>
                            {editMode[rkey] ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <textarea value={text} onChange={(e) => setEditValues(prev => ({ ...prev, [rkey]: e.target.value }))} style={textareaStyle} rows={3} />
                                {saveBtn(() => saveEdit(rkey))}
                              </div>
                            ) : (
                              <div className="tailor-proj-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', border: '1px solid var(--rule)', borderRadius: 3, background: 'var(--paper)' }}>
                                <p style={{ fontFamily: 'Inter', fontSize: 14, lineHeight: 1.7, color: 'var(--sumi)', flex: 1, margin: 0 }}>
                                  {editValues[rkey] !== undefined ? editValues[rkey]
                                    : origDesc ? <DiffText original={origDesc} tailored={proj.description || ''} />
                                    : (proj.description || '')}
                                </p>
                                {editBtn(() => openEdit(rkey, text))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </section>
                  )}
                </>
              )}

              {/* ── V1/V2 legacy sections ───────────────────────────────────── */}
              {!isV3 && (
                <>
                  {summaryObj.tailored_text && (
                    <section ref={el => { sectionRefs.current['summary'] = el; }}>
                      {editSaveRow('Summary', !!editMode['summary'],
                        () => openEdit('summary', editValues['summary'] ?? summaryObj.tailored_text),
                        () => saveEdit('summary')
                      )}
                      {editMode['summary'] ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <textarea value={editValues['summary'] ?? summaryObj.tailored_text} onChange={(e) => setEditValues(prev => ({ ...prev, summary: e.target.value }))} style={{ ...textareaStyle, fontFamily: '"Shippori Mincho","Noto Serif JP",serif', fontSize: 15, lineHeight: 1.85 }} rows={4} />
                          {saveBtn(() => saveEdit('summary'))}
                        </div>
                      ) : isNewFormat ? (
                        <div style={{ background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 3, padding: '20px 22px', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.5)' }}>
                          <p className="tm-mincho" style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: 'var(--sumi)' }}>
                            {editValues['summary'] ?? summaryObj.tailored_text}
                          </p>
                        </div>
                      ) : (() => {
                        const { added: aw, removed: rw } = computeDiffCounts(summaryObj.original_text, summaryObj.tailored_text);
                        return (
                          <ReviewCard status={summaryStatus}
                            onAccept={() => setReview('summary', summaryStatus === 'accepted' ? null : 'accepted')}
                            onCancel={() => setReview('summary', summaryStatus === 'cancelled' ? null : 'cancelled')}
                            addedCount={aw} removedCount={rw}>
                            <p className="tm-mincho" style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: 'var(--sumi)' }}>
                              {editValues['summary'] !== undefined ? editValues['summary']
                                : summaryStatus === 'cancelled' ? (summaryObj.original_text || '')
                                : <DiffText original={summaryObj.original_text} tailored={summaryObj.tailored_text} />}
                            </p>
                          </ReviewCard>
                        );
                      })()}
                    </section>
                  )}

                  {(data.skills || []).length > 0 && (
                    <section>
                      <h3 style={SECTION_HEAD}>Skills</h3>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {data.skills.map((skill, i) => (
                          <span key={i} style={{ padding: '6px 14px', border: '1px solid var(--rule)', borderRadius: 999, background: 'var(--paper)', fontSize: 12, color: 'var(--sumi)', fontWeight: 500, fontFamily: 'Inter' }}>{skill}</span>
                        ))}
                      </div>
                    </section>
                  )}

                  <section ref={el => { sectionRefs.current['experience'] = el; }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <h3 style={SECTION_HEAD}>Experience</h3>
                    {(data.tailored_experience || []).length === 0 && emptySection('No experience sections returned by AI.')}
                    {(data.tailored_experience || []).map((exp, i) => {
                      const isOpen     = openExperience.has(i);
                      const bullets    = exp.bullets || [];
                      const allAccepted = bullets.length > 0 && bullets.every((_, j) => reviews[`exp-${i}-${j}`] === 'accepted');
                      return (
                        <div key={i} ref={el => { sectionRefs.current[`exp-${i}`] = el; }} style={{ border: '1px solid var(--rule)', borderRadius: 3, overflow: 'hidden' }}>
                          {accordionHeader(exp, i, bullets, allAccepted, 'exp', isOpen)}
                          {isOpen && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 18px' }}>
                              {bullets.map((bullet, j) => {
                                const rkey = `exp-${i}-${j}`;
                                if (typeof bullet === 'string') {
                                  const text   = editValues[rkey] ?? bullet;
                                  const status = reviews[rkey] || null;
                                  if (editMode[rkey]) return (
                                    <div key={j} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      <textarea value={text} onChange={(e) => setEditValues(prev => ({ ...prev, [rkey]: e.target.value }))} style={textareaStyle} rows={3} />
                                      {saveBtn(() => saveEdit(rkey))}
                                    </div>
                                  );
                                  return <div key={j}>{bulletRow(rkey, text, status, '')}</div>;
                                }
                                const orig    = bullet.original_text ?? '';
                                const tailored = bullet.tailored_text ?? '';
                                const isNew   = !!bullet.is_new_suggestion;
                                const status  = getReview(rkey);
                                if (editMode[rkey]) return (
                                  <div key={j} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <textarea value={editValues[rkey] ?? tailored} onChange={(e) => setEditValues(prev => ({ ...prev, [rkey]: e.target.value }))} style={textareaStyle} rows={3} />
                                    {saveBtn(() => saveEdit(rkey))}
                                  </div>
                                );
                                const { added: aw, removed: rw } = computeDiffCounts(orig, tailored);
                                return (
                                  <div key={j} style={{ position: 'relative' }}>
                                    <ReviewCard status={status}
                                      onAccept={() => setReview(rkey, status === 'accepted' ? null : 'accepted')}
                                      onCancel={() => setReview(rkey, status === 'cancelled' ? null : 'cancelled')}
                                      addedCount={isNew ? 0 : aw} removedCount={isNew ? 0 : rw}>
                                      {isNew ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                          <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: '"JetBrains Mono",monospace', fontSize: 9, letterSpacing: '0.2em', fontWeight: 700, color: 'var(--moss-deep)', background: 'rgba(90,122,78,0.08)', border: '1px solid var(--moss-soft)', borderRadius: 2, padding: '4px 8px' }}>AI Suggestion</span>
                                          <p style={{ fontFamily: 'Inter', fontSize: 14, lineHeight: 1.7, color: 'var(--sumi)', margin: 0 }}>{editValues[rkey] !== undefined ? editValues[rkey] : tailored}</p>
                                        </div>
                                      ) : (
                                        <p style={{ fontFamily: 'Inter', fontSize: 14, lineHeight: 1.7, color: 'var(--sumi)', margin: 0 }}>
                                          {editValues[rkey] !== undefined ? editValues[rkey]
                                            : status === 'cancelled' ? orig
                                            : <DiffText original={orig} tailored={tailored} />}
                                        </p>
                                      )}
                                    </ReviewCard>
                                    <div style={{ position: 'absolute', top: 12, right: 12 }}>
                                      {editBtn(() => openEdit(rkey, editValues[rkey] ?? tailored))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </section>

                  <section ref={el => { sectionRefs.current['projects'] = el; }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <h3 style={SECTION_HEAD}>Projects</h3>
                    {(data.tailored_projects || []).length === 0 && emptySection('No project sections returned by AI.')}
                    {(data.tailored_projects || []).map((proj, i) => (
                      <div key={i}>
                        <h4 style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 700, color: 'var(--sumi)', marginBottom: 10, marginTop: 0 }}>{proj.name}</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {(proj.bullets || []).map((bullet, j) => {
                            const rkey = `proj-${i}-${j}`;
                            if (typeof bullet === 'string') {
                              const text   = editValues[rkey] ?? bullet;
                              const status = reviews[rkey] || null;
                              if (editMode[rkey]) return (
                                <div key={j} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  <textarea value={text} onChange={(e) => setEditValues(prev => ({ ...prev, [rkey]: e.target.value }))} style={textareaStyle} rows={3} />
                                  {saveBtn(() => saveEdit(rkey))}
                                </div>
                              );
                              return <div key={j}>{bulletRow(rkey, text, status, '')}</div>;
                            }
                            const orig    = bullet.original_text ?? '';
                            const tailored = bullet.tailored_text ?? '';
                            const isNew   = !!bullet.is_new_suggestion;
                            const status  = getReview(rkey);
                            if (editMode[rkey]) return (
                              <div key={j} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <textarea value={editValues[rkey] ?? tailored} onChange={(e) => setEditValues(prev => ({ ...prev, [rkey]: e.target.value }))} style={textareaStyle} rows={3} />
                                {saveBtn(() => saveEdit(rkey))}
                              </div>
                            );
                            const { added: aw, removed: rw } = computeDiffCounts(orig, tailored);
                            return (
                              <div key={j} style={{ position: 'relative' }}>
                                <ReviewCard status={status}
                                  onAccept={() => setReview(rkey, status === 'accepted' ? null : 'accepted')}
                                  onCancel={() => setReview(rkey, status === 'cancelled' ? null : 'cancelled')}
                                  addedCount={isNew ? 0 : aw} removedCount={isNew ? 0 : rw}>
                                  {isNew ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                      <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: '"JetBrains Mono",monospace', fontSize: 9, letterSpacing: '0.2em', fontWeight: 700, color: 'var(--moss-deep)', background: 'rgba(90,122,78,0.08)', border: '1px solid var(--moss-soft)', borderRadius: 2, padding: '4px 8px' }}>AI Suggestion</span>
                                      <p style={{ fontFamily: 'Inter', fontSize: 14, lineHeight: 1.7, color: 'var(--sumi)', margin: 0 }}>{editValues[rkey] !== undefined ? editValues[rkey] : tailored}</p>
                                    </div>
                                  ) : (
                                    <p style={{ fontFamily: 'Inter', fontSize: 14, lineHeight: 1.7, color: 'var(--sumi)', margin: 0 }}>
                                      {editValues[rkey] !== undefined ? editValues[rkey]
                                        : status === 'cancelled' ? orig
                                        : <DiffText original={orig} tailored={tailored} />}
                                    </p>
                                  )}
                                </ReviewCard>
                                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                                  {editBtn(() => openEdit(rkey, editValues[rkey] ?? tailored))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </section>
                </>
              )}
            </div>
          </div>

          {/* FOOTER */}
          <footer style={{ padding: '16px 28px', borderTop: '1px solid var(--rule)', background: 'var(--washi-deep)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="tm-mincho" style={{ fontSize: 18, fontWeight: 700, color: 'var(--sumi)' }}>
                {reviewedCount}<span style={{ color: 'var(--sumi-mute)' }}>/{totalItems}</span>
              </span>
              <span className="tm-mono" style={{ fontSize: 10, letterSpacing: '0.22em', color: 'var(--sumi-mute)', textTransform: 'uppercase' }}>Reviewed</span>
              <div style={{ width: 160, height: 4, background: 'var(--rule)', borderRadius: 2, overflow: 'hidden' }}>
                <motion.div
                  style={{ height: '100%', background: 'var(--moss)' }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ type: 'spring', stiffness: 200, damping: 30 }}
                />
              </div>
            </div>
            <button onClick={handleCommit} disabled={committing} aria-label="Commit tailoring" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 2, background: 'var(--moss)', color: 'var(--paper)', border: 'none', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, cursor: committing ? 'wait' : 'pointer', boxShadow: '0 1px 0 rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.10)', opacity: committing ? 0.6 : 1 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 2 H11 L13 4 V13 H3 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                <path d="M5 2 V6 H10 V2" stroke="currentColor" strokeWidth="1.4"/>
              </svg>
              {committing ? 'Saving…' : 'Commit tailoring'}
            </button>
          </footer>

        </motion.div>
      </motion.div>

      {/* Hidden PDF target */}
      <div className="sr-only">
        <div ref={pdfRef} style={{ fontFamily: 'Georgia, serif', fontSize: '13px', color: '#111', lineHeight: 1.6 }}>
          {isV3 ? (
            Object.entries(data)
              .filter(([k]) => k !== '_version')
              .map(([title, content]) => {
                if (typeof content === 'string') {
                  const eKey = `s:${title}`;
                  return (
                    <div key={title} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: 6, fontFamily: 'Arial, sans-serif' }}>{title}</div>
                      <p style={{ margin: 0 }}>{editValues[eKey] ?? content}</p>
                    </div>
                  );
                }
                if (Array.isArray(content)) {
                  if (!content.length || typeof content[0] === 'string') {
                    return (
                      <div key={title} style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: 6, fontFamily: 'Arial, sans-serif' }}>{title}</div>
                        <p style={{ margin: 0 }}>{content.join(' · ')}</p>
                      </div>
                    );
                  }
                  if (content[0]?.bullets !== undefined) {
                    return (
                      <div key={title} style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: 10, fontFamily: 'Arial, sans-serif' }}>{title}</div>
                        {content.map((entry, ei) => (
                          <div key={ei} style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ fontWeight: 'bold', fontFamily: 'Arial, sans-serif' }}>{entry.title}{entry.company ? ` · ${entry.company}` : ''}</span>
                              {entry.period && <span style={{ fontSize: 11, color: '#888', fontFamily: 'Arial, sans-serif' }}>{entry.period}</span>}
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              {(entry.bullets || []).map((b, bi) => {
                                const rkey = `${title}-${ei}-${bi}`;
                                return <li key={bi} style={{ marginBottom: 4 }}>{editValues[rkey] ?? b}</li>;
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return (
                    <div key={title} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: 10, fontFamily: 'Arial, sans-serif' }}>{title}</div>
                      {content.map((proj, pi) => {
                        const rkey = `${title}-${pi}-d`;
                        return (
                          <div key={pi} style={{ marginBottom: 12 }}>
                            <div style={{ fontWeight: 'bold', marginBottom: 4, fontFamily: 'Arial, sans-serif' }}>{proj.name}</div>
                            <p style={{ margin: 0 }}>{editValues[rkey] ?? proj.description}</p>
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                return null;
              })
          ) : (
            <>
              {(data.skills || []).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: 6, fontFamily: 'Arial, sans-serif' }}>Skills</div>
                  <p style={{ margin: 0 }}>{data.skills.join(' · ')}</p>
                </div>
              )}
              {finalSummary && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: 6, fontFamily: 'Arial, sans-serif' }}>Summary</div>
                  <p style={{ margin: 0 }}>{finalSummary}</p>
                </div>
              )}
              {(data.tailored_experience || []).length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: 10, fontFamily: 'Arial, sans-serif' }}>Experience</div>
                  {(data.tailored_experience || []).map((exp, i) => {
                    const finalBullets = (exp.bullets || []).map((b, j) => getFinalBullet(b, i, j, 'exp')).filter(Boolean);
                    return (
                      <div key={i} style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontWeight: 'bold', fontFamily: 'Arial, sans-serif' }}>{exp.title}{exp.company ? ` · ${exp.company}` : ''}</span>
                          {exp.period && <span style={{ fontSize: 11, color: '#888', fontFamily: 'Arial, sans-serif' }}>{exp.period}</span>}
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {finalBullets.map((text, k) => <li key={k} style={{ marginBottom: 4 }}>{text}</li>)}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
              {(data.tailored_projects || []).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: 10, fontFamily: 'Arial, sans-serif' }}>Projects</div>
                  {(data.tailored_projects || []).map((proj, i) => {
                    const finalBullets = (proj.bullets || []).map((b, j) => getFinalBullet(b, i, j, 'proj')).filter(Boolean);
                    return (
                      <div key={i} style={{ marginBottom: 16 }}>
                        <div style={{ fontWeight: 'bold', marginBottom: 6, fontFamily: 'Arial, sans-serif' }}>{proj.name}</div>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {finalBullets.map((text, k) => <li key={k} style={{ marginBottom: 4 }}>{text}</li>)}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {toast && (
        <div role="status" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 60, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 3, border: `1px solid ${toast === 'success' ? 'var(--moss-soft)' : 'var(--shu-soft)'}`, background: toast === 'success' ? 'rgba(90,122,78,0.08)' : 'rgba(168,94,62,0.08)', color: toast === 'success' ? 'var(--moss-deep)' : 'var(--shu-deep)', fontFamily: 'Inter', fontSize: 13, fontWeight: 500 }}>
          {toast === 'success' ? (
            <><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8 L6 11 L13 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>Application saved successfully</>
          ) : (
            toastMsg || 'Save failed — please try again'
          )}
        </div>
      )}
    </div>
  );
}

export default function TailoredResumeDrawer(props) {
  return (
    <DrawerErrorBoundary onClose={props.onClose}>
      <TailoredResumeDrawerInner {...props} />
    </DrawerErrorBoundary>
  );
}
