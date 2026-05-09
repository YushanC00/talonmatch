import { Component, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Diff from 'diff';
import { Pencil, Check, Save, ChevronDown } from 'lucide-react';
import { skillMatches } from '../utils/tokenMatcher';
import { saveApplication } from '../lib/saveApplication';

class DrawerErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { caught: false }; }
  static getDerivedStateFromError() { return { caught: true }; }
  render() {
    if (this.state.caught) {
      return (
        <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white border-l border-gray-200 flex flex-col items-center justify-center gap-4 z-50">
          <p className="text-sm font-semibold text-gray-700">Something went wrong rendering the drawer.</p>
          <button onClick={this.props.onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Close</button>
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

const DiffText = memo(function DiffText({ original, tailored }) {
  const parts = Diff.diffWords(original || '', tailored || '');
  return (
    <span>
      {parts.map((part, i) => {
        if (part.added) return <mark key={i} className="text-green-800 bg-green-100 rounded px-0.5 font-medium not-italic">{part.value}</mark>;
        if (part.removed) return <del key={i} className="text-red-400 bg-red-50 line-through rounded px-0.5 not-italic">{part.value}</del>;
        return <span key={i}>{part.value}</span>;
      })}
    </span>
  );
});

const ReviewCard = memo(function ReviewCard({ status, onAccept, onCancel, children }) {
  const borderClass =
    status === 'accepted'  ? 'border-green-200 bg-green-50/50'
    : status === 'cancelled' ? 'border-amber-200 bg-amber-50/30'
    : 'border-gray-200 bg-white hover:border-gray-300';
  return (
    <div className={`rounded-xl border px-4 py-3.5 flex flex-col gap-2.5 transition-colors ${borderClass}`}>
      {children}
      <div className="flex items-center gap-2 pt-0.5">
        <button onClick={onAccept}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            status === 'accepted' ? 'bg-green-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}>
          {status === 'accepted'
            ? <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Accepted</>
            : 'Accept'}
        </button>
        <button onClick={onCancel}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            status === 'cancelled' ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}>
          {status === 'cancelled' ? 'Using Original' : 'Cancel'}
        </button>
      </div>
    </div>
  );
});

function NavLink({ onClick, children, indent = false }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg text-xs transition-colors hover:bg-gray-100 ${
        indent
          ? 'px-2 py-1 pl-4 text-gray-400 hover:text-gray-700'
          : 'px-2 py-1.5 text-gray-500 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}

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
  const requirements = job?.requirements_array || [];
  const totalRequirements = requirements.length;
  const resumeSkills = parsedResume?.skills || [];
  const missingSkillsSet = new Set(
    requirements.filter(r => !skillMatches(resumeSkills, r)).map(s => s.toLowerCase())
  );
  const baseMatchedCount = requirements.filter(r => skillMatches(resumeSkills, r)).length;
  const matchedReqSkills = requirements.filter(r =>  skillMatches(resumeSkills, r));
  const missingReqSkills = requirements.filter(r => !skillMatches(resumeSkills, r));

  const pdfRef = useRef(null);
  const contentRef = useRef(null);
  const sectionRefs = useRef({});

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  const isV3 = data?._version === 3;
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

  const [editMode, setEditMode] = useState({});
  const [editValues, setEditValues] = useState(initialEditValues ?? {});
  const [committing, setCommitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [flashing, setFlashing] = useState(false);
  const prevScoreRef = useRef(null);

  // Open set for experience accordions — default: index 0 (most recent job)
  const [openExperience, setOpenExperience] = useState(() => new Set([0]));

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
          const tailored = editValues[rkey] || (typeof bullet === 'object' ? bullet.tailored_text : bullet);
          detectSkills(tailored || '').forEach(s => all.add(s));
        }
      });
    });
    (data.tailored_projects || []).forEach((proj, i) => {
      (proj.bullets || []).forEach((bullet, j) => {
        const rkey = `proj-${i}-${j}`;
        if (getReview(rkey) === 'accepted') {
          const tailored = editValues[rkey] || (typeof bullet === 'object' ? bullet.tailored_text : bullet);
          detectSkills(tailored || '').forEach(s => all.add(s));
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
    const status = getReview(rkey);
    const orig     = typeof bullet === 'object' ? (bullet.original_text ?? '') : cleanBulletText(bullet);
    const tailored = typeof bullet === 'object' ? (bullet.tailored_text  ?? '') : cleanBulletText(bullet);
    const isNew = typeof bullet === 'object' && !!bullet.is_new_suggestion;
    if (status === 'cancelled') return isNew ? null : orig;
    if (status === 'accepted') return tailored;
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
  const finalSummary = editValues['summary'] ?? (summaryStatus === 'cancelled' ? (summaryObj.original_text || '') : summaryObj.tailored_text);

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
      setToastMessage(err.message ?? String(err));
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

  // V3 extracted sections
  const v3Summary    = isV3 ? (data['Summary']        || '')  : '';
  const v3Experience = isV3 ? (data['Work Experience'] || []) : [];
  const v3Projects   = isV3 ? (data['Projects']        || []) : [];
  const v3Skills     = isV3 ? (data['Skills']          || []) : [];
  const origExperience = parsedResume?.experience || [];
  const origProjects   = parsedResume?.projects   || [];

  const sidebarExpEntries = isV3 ? v3Experience : (data.tailored_experience || []);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">

      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
        data-testid="drawer-backdrop"
      />

      {/* Drawer panel */}
      <div className={`fixed inset-y-0 right-0 w-full max-w-2xl bg-white border-l border-gray-200 flex flex-col transition-transform duration-300 ease-in-out ${visible ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Sticky header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0 bg-white z-10">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {autoAccept ? 'Resume Ready to Download' : 'Review Tailored Resume'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
              {autoAccept ? 'All changes auto-applied · ' : ''}{jobTitle} · {company}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold transition-all duration-300 ${
              flashing ? 'bg-green-600 text-white ring-2 ring-green-300 scale-110' : 'bg-green-50 text-green-700 ring-1 ring-green-200'
            }`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {dynamicScore}% match
            </div>
            <button onClick={handleDownload}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              PDF
            </button>
            <button onClick={handleClose} aria-label="Close drawer"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body: left sidebar + scrollable content */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left sidebar nav */}
          <nav className="w-40 shrink-0 border-r border-gray-100 bg-gray-50/50 overflow-y-auto py-5 px-3 flex flex-col gap-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-300 mb-2 px-2">Navigate</p>
            <NavLink onClick={() => scrollTo('summary')}>Summary</NavLink>
            <NavLink onClick={() => scrollTo('skills')}>Skills</NavLink>
            {sidebarExpEntries.length > 0 && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-300 mt-3 mb-1 px-2">Experience</p>
                {sidebarExpEntries.map((entry, ei) => (
                  <NavLink key={ei} onClick={() => scrollTo(`exp-${ei}`)} indent>
                    {entry.company || entry.title}
                  </NavLink>
                ))}
              </>
            )}
            <NavLink onClick={() => scrollTo('projects')}>Projects</NavLink>
          </nav>

          {/* Scrollable content */}
          <div ref={contentRef} className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-7">

            {/* Skill Alignment */}
            {requirements.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Skill Alignment</p>
                  <span className="text-xs text-gray-400 tabular-nums">
                    <span className="font-semibold text-green-600">{matchedReqSkills.length}</span>
                    <span> / {requirements.length} matched</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {matchedReqSkills.map(s => (
                    <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-green-50 text-green-700 border border-green-200">
                      <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      {s}
                    </span>
                  ))}
                  {missingReqSkills.map(s => (
                    <span key={s} className="px-2.5 py-1 text-xs font-medium rounded-full bg-white text-gray-400 border border-gray-200">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* ── V3 sections ──────────────────────────────────────────────────── */}
            {isV3 && (
              <>
                {/* Summary */}
                {v3Summary && (
                  <div ref={el => { sectionRefs.current['summary'] = el; }}>
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Summary</p>
                      {!editMode['s:Summary'] ? (
                        <button onClick={() => openEdit('s:Summary', editValues['s:Summary'] ?? v3Summary)}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
                          <Pencil size={11} strokeWidth={2} /> Edit
                        </button>
                      ) : (
                        <button onClick={() => saveEdit('s:Summary')}
                          className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 transition-colors cursor-pointer font-medium">
                          <Check size={11} strokeWidth={2.5} /> Save
                        </button>
                      )}
                    </div>
                    {editMode['s:Summary'] ? (
                      <textarea value={editValues['s:Summary'] ?? v3Summary}
                        onChange={(e) => setEditValues(prev => ({ ...prev, 's:Summary': e.target.value }))}
                        className="w-full text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-xl p-3.5 resize-none focus:outline-none focus:border-green-400 transition-colors"
                        rows={4} />
                    ) : (
                      <p className="text-sm text-gray-800 leading-relaxed rounded-xl border border-gray-100 px-4 py-3.5 bg-gray-50/40">
                        {editValues['s:Summary'] !== undefined
                          ? editValues['s:Summary']
                          : parsedResume?.summary
                          ? <DiffText original={parsedResume.summary} tailored={v3Summary} />
                          : v3Summary}
                      </p>
                    )}
                  </div>
                )}

                {/* Skills */}
                {v3Skills.length > 0 && (
                  <div ref={el => { sectionRefs.current['skills'] = el; }}>
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Skills</p>
                    <div className="flex flex-wrap gap-2">
                      {v3Skills.map((item, i) => (
                        <span key={i} className="px-3 py-1 text-xs font-medium rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">{item}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Experience — accordions */}
                {v3Experience.length > 0 && (
                  <div ref={el => { sectionRefs.current['experience'] = el; }} className="flex flex-col gap-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Work Experience</p>
                    {v3Experience.map((entry, ei) => {
                      const isOpen = openExperience.has(ei);
                      const origEntry = origExperience[ei];
                      const origBullets = origEntry
                        ? (Array.isArray(origEntry.bullets) && origEntry.bullets.length > 0
                            ? origEntry.bullets
                            : (origEntry.description || '').split(/[.!?]\s+/).filter(s => s.trim().length > 10))
                        : [];
                      const bullets = entry.bullets || [];
                      const allAccepted = bullets.length > 0
                        && bullets.every((_, bi) => reviews[`Work Experience-${ei}-${bi}`] === 'accepted');

                      return (
                        <div key={ei} ref={el => { sectionRefs.current[`exp-${ei}`] = el; }}
                          className="rounded-xl border border-gray-200 overflow-hidden">

                          {/* Accordion header */}
                          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50/70">
                            <button onClick={() => toggleExp(ei)}
                              className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer">
                              <ChevronDown size={14} strokeWidth={2}
                                className={`shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
                              <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
                                <span className="text-sm font-bold text-gray-900 truncate">{entry.title}</span>
                                {entry.company && <span className="text-sm text-gray-400 truncate">· {entry.company}</span>}
                              </div>
                              {entry.period && <span className="text-xs text-gray-400 shrink-0 tabular-nums ml-2">{entry.period}</span>}
                            </button>
                            <button
                              onClick={() => acceptAllForEntry('Work Experience', ei, bullets.length)}
                              className={`ml-1 shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                                allAccepted
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                              }`}
                            >
                              {allAccepted ? '✓ Accepted' : 'Accept All'}
                            </button>
                          </div>

                          {/* Accordion body */}
                          {isOpen && (
                            <div className="flex flex-col gap-2 px-4 py-3">
                              {bullets.map((bullet, bi) => {
                                const rkey = `Work Experience-${ei}-${bi}`;
                                const origBullet = origBullets[bi] || '';
                                const status = reviews[rkey] || null;
                                const text = editValues[rkey] ?? bullet;

                                if (editMode[rkey]) {
                                  return (
                                    <div key={bi} className="flex flex-col gap-1.5">
                                      <textarea value={text}
                                        onChange={(e) => setEditValues(prev => ({ ...prev, [rkey]: e.target.value }))}
                                        className="w-full text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-xl p-3.5 resize-none focus:outline-none focus:border-green-400 transition-colors"
                                        rows={3} />
                                      <button onClick={() => saveEdit(rkey)}
                                        className="self-end flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium cursor-pointer">
                                        <Check size={11} strokeWidth={2.5} /> Save
                                      </button>
                                    </div>
                                  );
                                }

                                return (
                                  <div key={bi} className={`group flex items-start gap-2.5 px-4 py-2.5 rounded-xl border transition-colors ${
                                    status === 'accepted' ? 'border-green-200 bg-green-50/40' : 'border-gray-100 bg-gray-50/30'
                                  }`}>
                                    <span className="mt-2 w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                                    <p className="text-sm text-gray-800 leading-relaxed flex-1">
                                      {editValues[rkey] !== undefined ? editValues[rkey]
                                        : origBullet ? <DiffText original={origBullet} tailored={bullet} />
                                        : bullet}
                                    </p>
                                    <button onClick={() => openEdit(rkey, text)} aria-label={`Edit bullet ${ei}-${bi}`}
                                      className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-all cursor-pointer border border-gray-200 rounded-md px-1.5 py-0.5 shrink-0 bg-white">
                                      <Pencil size={10} strokeWidth={2} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Projects */}
                {v3Projects.length > 0 && (
                  <div ref={el => { sectionRefs.current['projects'] = el; }} className="flex flex-col gap-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Projects</p>
                    {v3Projects.map((proj, pi) => {
                      const origProj = origProjects.find(p => p.name === proj.name) ?? origProjects[pi];
                      const origDesc = origProj?.description || '';
                      const rkey = `Projects-${pi}-d`;
                      const text = editValues[rkey] ?? (proj.description || '');
                      return (
                        <div key={pi}>
                          <h3 className="text-sm font-bold text-gray-900 mb-2">{proj.name}</h3>
                          {editMode[rkey] ? (
                            <div className="flex flex-col gap-1.5">
                              <textarea value={text}
                                onChange={(e) => setEditValues(prev => ({ ...prev, [rkey]: e.target.value }))}
                                className="w-full text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-xl p-3.5 resize-none focus:outline-none focus:border-green-400 transition-colors"
                                rows={3} />
                              <button onClick={() => saveEdit(rkey)}
                                className="self-end flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium cursor-pointer">
                                <Check size={11} strokeWidth={2.5} /> Save
                              </button>
                            </div>
                          ) : (
                            <div className="group flex items-start gap-2.5 px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50/30">
                              <p className="text-sm text-gray-800 leading-relaxed flex-1">
                                {editValues[rkey] !== undefined ? editValues[rkey]
                                  : origDesc ? <DiffText original={origDesc} tailored={proj.description || ''} />
                                  : (proj.description || '')}
                              </p>
                              <button onClick={() => openEdit(rkey, text)} aria-label={`Edit project ${pi}`}
                                className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-all cursor-pointer border border-gray-200 rounded-md px-1.5 py-0.5 shrink-0 bg-white">
                                <Pencil size={10} strokeWidth={2} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ── V1/V2 legacy sections ─────────────────────────────────────────── */}
            {!isV3 && (
              <>
                {/* Summary */}
                {summaryObj.tailored_text && (
                  <div ref={el => { sectionRefs.current['summary'] = el; }}>
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Summary</p>
                      {!editMode['summary'] ? (
                        <button onClick={() => openEdit('summary', editValues['summary'] ?? summaryObj.tailored_text)}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
                          <Pencil size={11} strokeWidth={2} /> Edit
                        </button>
                      ) : (
                        <button onClick={() => saveEdit('summary')}
                          className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 transition-colors cursor-pointer font-medium">
                          <Check size={11} strokeWidth={2.5} /> Save
                        </button>
                      )}
                    </div>
                    {editMode['summary'] ? (
                      <textarea value={editValues['summary'] ?? summaryObj.tailored_text}
                        onChange={(e) => setEditValues(prev => ({ ...prev, summary: e.target.value }))}
                        className="w-full text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-xl p-3.5 resize-none focus:outline-none focus:border-green-400 transition-colors"
                        rows={4} />
                    ) : isNewFormat ? (
                      <p className="text-sm text-gray-800 leading-relaxed rounded-xl border border-gray-100 px-4 py-3.5 bg-gray-50/40">
                        {editValues['summary'] ?? summaryObj.tailored_text}
                      </p>
                    ) : (
                      <ReviewCard
                        status={summaryStatus}
                        onAccept={() => setReview('summary', summaryStatus === 'accepted' ? null : 'accepted')}
                        onCancel={() => setReview('summary', summaryStatus === 'cancelled' ? null : 'cancelled')}
                      >
                        <p className="text-sm text-gray-800 leading-relaxed">
                          {editValues['summary'] !== undefined ? editValues['summary']
                            : summaryStatus === 'cancelled' ? (summaryObj.original_text || '')
                            : <DiffText original={summaryObj.original_text} tailored={summaryObj.tailored_text} />}
                        </p>
                      </ReviewCard>
                    )}
                  </div>
                )}

                {/* Skills */}
                {(data.skills || []).length > 0 && (
                  <div ref={el => { sectionRefs.current['skills'] = el; }}>
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Skills</p>
                    <div className="flex flex-wrap gap-2">
                      {data.skills.map((skill, i) => (
                        <span key={i} className="px-3 py-1 text-xs font-medium rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">{skill}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Experience — accordions */}
                <div ref={el => { sectionRefs.current['experience'] = el; }} className="flex flex-col gap-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Experience</p>
                  {(data.tailored_experience || []).length === 0 && (
                    <p className="text-xs text-gray-400 italic">No experience sections returned by AI.</p>
                  )}
                  {(data.tailored_experience || []).map((exp, i) => {
                    const isOpen = openExperience.has(i);
                    const bullets = exp.bullets || [];
                    const allAccepted = bullets.length > 0
                      && bullets.every((_, j) => reviews[`exp-${i}-${j}`] === 'accepted');

                    return (
                      <div key={i} ref={el => { sectionRefs.current[`exp-${i}`] = el; }}
                        className="rounded-xl border border-gray-200 overflow-hidden">

                        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50/70">
                          <button onClick={() => toggleExp(i)} className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer">
                            <ChevronDown size={14} strokeWidth={2}
                              className={`shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
                            <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
                              <span className="text-sm font-bold text-gray-900 truncate">{exp.title}</span>
                              {exp.company && <span className="text-sm text-gray-400 truncate">· {exp.company}</span>}
                            </div>
                            {exp.period && <span className="text-xs text-gray-400 shrink-0 tabular-nums ml-2">{exp.period}</span>}
                          </button>
                          <button onClick={() => acceptAllForEntry('exp', i, bullets.length)}
                            className={`ml-1 shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                              allAccepted
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                            }`}>
                            {allAccepted ? '✓ Accepted' : 'Accept All'}
                          </button>
                        </div>

                        {isOpen && (
                          <div className="flex flex-col gap-2 px-4 py-3">
                            {bullets.map((bullet, j) => {
                              const rkey = `exp-${i}-${j}`;
                              if (typeof bullet === 'string') {
                                const text = editValues[rkey] ?? bullet;
                                const status = reviews[rkey] || null;
                                if (editMode[rkey]) {
                                  return (
                                    <div key={j} className="flex flex-col gap-1.5">
                                      <textarea value={text} onChange={(e) => setEditValues(prev => ({ ...prev, [rkey]: e.target.value }))}
                                        className="w-full text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-xl p-3.5 resize-none focus:outline-none focus:border-green-400 transition-colors" rows={3} />
                                      <button onClick={() => saveEdit(rkey)}
                                        className="self-end flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium cursor-pointer">
                                        <Check size={11} strokeWidth={2.5} /> Save
                                      </button>
                                    </div>
                                  );
                                }
                                return (
                                  <div key={j} className={`group flex items-start gap-2.5 px-4 py-2.5 rounded-xl border transition-colors ${
                                    status === 'accepted' ? 'border-green-200 bg-green-50/40' : 'border-gray-100 bg-gray-50/30'
                                  }`}>
                                    <span className="mt-2 w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                                    <p className="text-sm text-gray-800 leading-relaxed flex-1">{text}</p>
                                    <button onClick={() => openEdit(rkey, text)}
                                      className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-all cursor-pointer border border-gray-200 rounded-md px-1.5 py-0.5 shrink-0 bg-white">
                                      <Pencil size={10} strokeWidth={2} />
                                    </button>
                                  </div>
                                );
                              }
                              const orig     = bullet.original_text ?? '';
                              const tailored = bullet.tailored_text  ?? '';
                              const isNew    = !!bullet.is_new_suggestion;
                              const status   = getReview(rkey);
                              if (editMode[rkey]) {
                                return (
                                  <div key={j} className="flex flex-col gap-1.5">
                                    <textarea value={editValues[rkey] ?? tailored} onChange={(e) => setEditValues(prev => ({ ...prev, [rkey]: e.target.value }))}
                                      className="w-full text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-xl p-3.5 resize-none focus:outline-none focus:border-green-400 transition-colors" rows={3} />
                                    <button onClick={() => saveEdit(rkey)}
                                      className="self-end flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium cursor-pointer">
                                      <Check size={11} strokeWidth={2.5} /> Save
                                    </button>
                                  </div>
                                );
                              }
                              return (
                                <div key={j} className="group relative">
                                  <ReviewCard status={status}
                                    onAccept={() => setReview(rkey, status === 'accepted' ? null : 'accepted')}
                                    onCancel={() => setReview(rkey, status === 'cancelled' ? null : 'cancelled')}>
                                    {isNew ? (
                                      <div className="flex flex-col gap-1.5">
                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5 w-fit">
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                          AI Suggestion
                                        </span>
                                        <p className="text-sm text-gray-800 leading-relaxed">{editValues[rkey] !== undefined ? editValues[rkey] : tailored}</p>
                                      </div>
                                    ) : (
                                      <p className="text-sm text-gray-800 leading-relaxed">
                                        {editValues[rkey] !== undefined ? editValues[rkey]
                                          : status === 'cancelled' ? orig
                                          : <DiffText original={orig} tailored={tailored} />}
                                      </p>
                                    )}
                                  </ReviewCard>
                                  <button onClick={() => openEdit(rkey, editValues[rkey] ?? tailored)}
                                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-all cursor-pointer bg-white border border-gray-200 rounded-md px-1.5 py-0.5">
                                    <Pencil size={10} strokeWidth={2} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Projects */}
                <div ref={el => { sectionRefs.current['projects'] = el; }} className="flex flex-col gap-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Projects</p>
                  {(data.tailored_projects || []).length === 0 && (
                    <p className="text-xs text-gray-400 italic">No project sections returned by AI.</p>
                  )}
                  {(data.tailored_projects || []).map((proj, i) => (
                    <div key={i}>
                      <h3 className="text-sm font-bold text-gray-900 mb-3">{proj.name}</h3>
                      <div className="flex flex-col gap-2">
                        {(proj.bullets || []).map((bullet, j) => {
                          const rkey = `proj-${i}-${j}`;
                          if (typeof bullet === 'string') {
                            const text = editValues[rkey] ?? bullet;
                            const status = reviews[rkey] || null;
                            if (editMode[rkey]) {
                              return (
                                <div key={j} className="flex flex-col gap-1.5">
                                  <textarea value={text} onChange={(e) => setEditValues(prev => ({ ...prev, [rkey]: e.target.value }))}
                                    className="w-full text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-xl p-3.5 resize-none focus:outline-none focus:border-green-400 transition-colors" rows={3} />
                                  <button onClick={() => saveEdit(rkey)}
                                    className="self-end flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium cursor-pointer">
                                    <Check size={11} strokeWidth={2.5} /> Save
                                  </button>
                                </div>
                              );
                            }
                            return (
                              <div key={j} className={`group flex items-start gap-2.5 px-4 py-2.5 rounded-xl border transition-colors ${
                                status === 'accepted' ? 'border-green-200 bg-green-50/40' : 'border-gray-100 bg-gray-50/30'
                              }`}>
                                <p className="text-sm text-gray-800 leading-relaxed flex-1">{text}</p>
                                <button onClick={() => openEdit(rkey, text)}
                                  className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-all cursor-pointer border border-gray-200 rounded-md px-1.5 py-0.5 shrink-0 bg-white">
                                  <Pencil size={10} strokeWidth={2} />
                                </button>
                              </div>
                            );
                          }
                          const orig    = bullet.original_text ?? '';
                          const tailored = bullet.tailored_text ?? '';
                          const isNew   = !!bullet.is_new_suggestion;
                          const status  = getReview(rkey);
                          if (editMode[rkey]) {
                            return (
                              <div key={j} className="flex flex-col gap-1.5">
                                <textarea value={editValues[rkey] ?? tailored} onChange={(e) => setEditValues(prev => ({ ...prev, [rkey]: e.target.value }))}
                                  className="w-full text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-xl p-3.5 resize-none focus:outline-none focus:border-green-400 transition-colors" rows={3} />
                                <button onClick={() => saveEdit(rkey)}
                                  className="self-end flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium cursor-pointer">
                                  <Check size={11} strokeWidth={2.5} /> Save
                                </button>
                              </div>
                            );
                          }
                          return (
                            <div key={j} className="group relative">
                              <ReviewCard status={status}
                                onAccept={() => setReview(rkey, status === 'accepted' ? null : 'accepted')}
                                onCancel={() => setReview(rkey, status === 'cancelled' ? null : 'cancelled')}>
                                {isNew ? (
                                  <div className="flex flex-col gap-1.5">
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5 w-fit">
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                      AI Suggestion
                                    </span>
                                    <p className="text-sm text-gray-800 leading-relaxed">{editValues[rkey] !== undefined ? editValues[rkey] : tailored}</p>
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-800 leading-relaxed">
                                    {editValues[rkey] !== undefined ? editValues[rkey]
                                      : status === 'cancelled' ? orig
                                      : <DiffText original={orig} tailored={tailored} />}
                                  </p>
                                )}
                              </ReviewCard>
                              <button onClick={() => openEdit(rkey, editValues[rkey] ?? tailored)}
                                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-all cursor-pointer bg-white border border-gray-200 rounded-md px-1.5 py-0.5">
                                <Pencil size={10} strokeWidth={2} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0 bg-white z-10">
          <span className="text-xs text-gray-400">
            <span className="font-semibold text-gray-700">{reviewedCount}</span>/{totalItems} reviewed
          </span>
          <button
            onClick={handleCommit}
            disabled={committing}
            aria-label="Commit tailoring"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 active:bg-green-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={14} strokeWidth={2} />
            {committing ? 'Saving…' : 'Commit Tailoring'}
          </button>
        </div>

        {/* Hidden clean PDF target */}
        <div className="sr-only">
          <div ref={pdfRef} style={{ fontFamily: 'Georgia, serif', fontSize: '13px', color: '#111', lineHeight: 1.6 }}>
            {isV3 ? (
              Object.entries(data)
                .filter(([k]) => k !== '_version')
                .map(([title, content]) => {
                  if (typeof content === 'string') {
                    const eKey = `s:${title}`;
                    return (
                      <div key={title} style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: '6px', fontFamily: 'Arial, sans-serif' }}>{title}</div>
                        <p style={{ margin: 0 }}>{editValues[eKey] ?? content}</p>
                      </div>
                    );
                  }
                  if (Array.isArray(content)) {
                    if (!content.length || typeof content[0] === 'string') {
                      return (
                        <div key={title} style={{ marginBottom: '16px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: '6px', fontFamily: 'Arial, sans-serif' }}>{title}</div>
                          <p style={{ margin: 0 }}>{content.join(' · ')}</p>
                        </div>
                      );
                    }
                    if (content[0]?.bullets !== undefined) {
                      return (
                        <div key={title} style={{ marginBottom: '16px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: '10px', fontFamily: 'Arial, sans-serif' }}>{title}</div>
                          {content.map((entry, ei) => (
                            <div key={ei} style={{ marginBottom: '16px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontWeight: 'bold', fontFamily: 'Arial, sans-serif' }}>{entry.title}{entry.company ? ` · ${entry.company}` : ''}</span>
                                {entry.period && <span style={{ fontSize: '11px', color: '#888', fontFamily: 'Arial, sans-serif' }}>{entry.period}</span>}
                              </div>
                              <ul style={{ margin: 0, paddingLeft: '18px' }}>
                                {(entry.bullets || []).map((b, bi) => {
                                  const rkey = `${title}-${ei}-${bi}`;
                                  return <li key={bi} style={{ marginBottom: '4px' }}>{editValues[rkey] ?? b}</li>;
                                })}
                              </ul>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return (
                      <div key={title} style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: '10px', fontFamily: 'Arial, sans-serif' }}>{title}</div>
                        {content.map((proj, pi) => {
                          const rkey = `${title}-${pi}-d`;
                          return (
                            <div key={pi} style={{ marginBottom: '12px' }}>
                              <div style={{ fontWeight: 'bold', marginBottom: '4px', fontFamily: 'Arial, sans-serif' }}>{proj.name}</div>
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
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: '6px', fontFamily: 'Arial, sans-serif' }}>Skills</div>
                    <p style={{ margin: 0 }}>{data.skills.join(' · ')}</p>
                  </div>
                )}
                {finalSummary && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: '6px', fontFamily: 'Arial, sans-serif' }}>Summary</div>
                    <p style={{ margin: 0 }}>{finalSummary}</p>
                  </div>
                )}
                {(data.tailored_experience || []).length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: '10px', fontFamily: 'Arial, sans-serif' }}>Experience</div>
                    {(data.tailored_experience || []).map((exp, i) => {
                      const finalBullets = (exp.bullets || []).map((b, j) => getFinalBullet(b, i, j, 'exp')).filter(Boolean);
                      return (
                        <div key={i} style={{ marginBottom: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontWeight: 'bold', fontFamily: 'Arial, sans-serif' }}>{exp.title}{exp.company ? ` · ${exp.company}` : ''}</span>
                            {exp.period && <span style={{ fontSize: '11px', color: '#888', fontFamily: 'Arial, sans-serif' }}>{exp.period}</span>}
                          </div>
                          <ul style={{ margin: 0, paddingLeft: '18px' }}>
                            {finalBullets.map((text, k) => <li key={k} style={{ marginBottom: '4px' }}>{text}</li>)}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
                {(data.tailored_projects || []).length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: '10px', fontFamily: 'Arial, sans-serif' }}>Projects</div>
                    {(data.tailored_projects || []).map((proj, i) => {
                      const finalBullets = (proj.bullets || []).map((b, j) => getFinalBullet(b, i, j, 'proj')).filter(Boolean);
                      return (
                        <div key={i} style={{ marginBottom: '16px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '6px', fontFamily: 'Arial, sans-serif' }}>{proj.name}</div>
                          <ul style={{ margin: 0, paddingLeft: '18px' }}>
                            {finalBullets.map((text, k) => <li key={k} style={{ marginBottom: '4px' }}>{text}</li>)}
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

      </div>

      {toast && (
        <div role="status"
          className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium ${
            toast === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
          {toast === 'success' ? (
            <><svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Application saved successfully</>
          ) : (
            toastMessage || 'Save failed — please try again'
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
