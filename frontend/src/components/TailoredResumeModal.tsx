// @ts-nocheck — legacy modal, superseded by TailoredResumeDrawer
import { useEffect, useMemo, useRef, useState } from 'react';
import * as Diff from 'diff';
import { skillMatches } from '../utils/skillMatcher';

function cleanBulletText(text) {
  if (!text) return '';
  return text
    .replace(/^[^:–—\n]{3,60}(?:at|@|\||–|—|:)\s*/i, '')
    .replace(/^\d{4}\s*[-–—]\s*(?:\d{4}|present)\s*[-–—]?\s*/i, '')
    .trim();
}

function DiffText({ original, tailored }) {
  const parts = Diff.diffWords(original || '', tailored || '');
  return (
    <span>
      {parts.map((part, i) => {
        if (part.added) {
          return (
            <mark key={i} className="text-green-700 bg-green-100 rounded px-0.5 font-medium not-italic">
              {part.value}
            </mark>
          );
        }
        if (part.removed) {
          return (
            <del key={i} className="text-red-400 bg-red-50 line-through rounded px-0.5 not-italic">
              {part.value}
            </del>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </span>
  );
}

function ReviewCard({ status, onAccept, onReject, onUndo, children }) {
  const borderClass =
    status === 'accepted'
      ? 'border-green-200 bg-green-50/50'
      : status === 'rejected'
      ? 'border-red-200 bg-red-50/30'
      : 'border-gray-200 bg-white hover:border-gray-300';

  return (
    <div className={`rounded-xl border px-4 py-3.5 flex flex-col gap-2.5 transition-colors ${borderClass}`}>
      {children}
      <div className="flex items-center gap-2 pt-0.5 flex-wrap">
        <button
          onClick={onAccept}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            status === 'accepted'
              ? 'bg-green-600 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {status === 'accepted' ? (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Accepted
            </>
          ) : 'Accept'}
        </button>
        <button
          onClick={onReject}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            status === 'rejected'
              ? 'bg-red-500 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {status === 'rejected' ? (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Rejected
            </>
          ) : 'Reject'}
        </button>
        {status && (
          <button
            onClick={onUndo}
            className="text-xs text-gray-300 hover:text-gray-500 transition-colors cursor-pointer ml-1 underline underline-offset-2"
          >
            undo
          </button>
        )}
      </div>
    </div>
  );
}

export default function TailoredResumeModal({ data, job, parsedResume, jobTitle, company, autoAccept = false, onClose }) {
  const requirements = job?.requirements_array || [];
  const totalRequirements = requirements.length;
  const resumeSkills = parsedResume?.skills || [];
  const missingSkillsSet = new Set(
    requirements.filter(r => !skillMatches(resumeSkills, r)).map(s => s.toLowerCase())
  );
  const baseMatchedCount = requirements.filter(r => skillMatches(resumeSkills, r)).length;

  const pdfRef = useRef(null);
  const [reviews, setReviews] = useState(() => {
    if (!autoAccept) return {};
    const r = { summary: 'accepted' };
    (data.tailored_experience || []).forEach((exp, i) => {
      (exp.bullets || []).forEach((_, j) => { r[`exp-${i}-${j}`] = 'accepted'; });
    });
    return r;
  });
  const [flashing, setFlashing] = useState(false);
  const prevScoreRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const getReview = (k) => reviews[k] || null;
  const setReview = (k, status) => setReviews((prev) => ({ ...prev, [k]: status }));

  const summaryObj = typeof data.summary === 'object'
    ? data.summary
    : { original_text: '', tailored_text: data.summary || '', change_reason: '' };

  const detectSkills = (text) =>
    [...missingSkillsSet].filter(s => text.toLowerCase().includes(s.toLowerCase()));

  const acceptedInjectedSkills = useMemo(() => {
    const all = new Set();
    if (getReview('summary') === 'accepted') {
      detectSkills(summaryObj.tailored_text || '').forEach(s => all.add(s));
    }
    (data.tailored_experience || []).forEach((exp, i) => {
      (exp.bullets || []).forEach((bullet, j) => {
        if (getReview(`exp-${i}-${j}`) === 'accepted') {
          const tailored = typeof bullet === 'object' ? bullet.tailored_text : bullet;
          detectSkills(tailored || '').forEach(s => all.add(s));
        }
      });
    });
    return all;
  }, [reviews]);

  const newlyMatchedCount = [...acceptedInjectedSkills].filter(s => missingSkillsSet.has(s)).length;
  const dynamicScore = totalRequirements > 0
    ? Math.round(((baseMatchedCount + newlyMatchedCount) / totalRequirements) * 100)
    : (job?.match_score || 0);

  useEffect(() => {
    if (prevScoreRef.current !== null && dynamicScore > prevScoreRef.current) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 700);
      return () => clearTimeout(t);
    }
    prevScoreRef.current = dynamicScore;
  }, [dynamicScore]);

  const getFinalBullet = (bullet, i, j) => {
    const status = getReview(`exp-${i}-${j}`);
    const orig = typeof bullet === 'object' ? bullet.original_text : bullet;
    const tailored = typeof bullet === 'object' ? bullet.tailored_text : bullet;
    const isNew = typeof bullet === 'object' && bullet.is_new_suggestion;
    if (status === 'rejected') return null;
    if (status === 'accepted') return tailored;
    return isNew ? null : tailored;
  };

  const totalItems =
    1 +
    (data.tailored_experience || []).reduce((s, e) => s + (e.bullets?.length || 0), 0);
  const reviewedCount = Object.keys(reviews).length;

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
  const finalSummary = summaryStatus === 'rejected' ? '' : summaryObj.tailored_text;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {autoAccept ? 'Resume Ready to Download' : 'Review Tailored Resume'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {autoAccept ? 'All changes auto-applied · ' : ''}{jobTitle} · {company}
            </p>
          </div>
          <div className="flex items-center gap-2.5">

            {/* Live match score */}
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold transition-all duration-300 ${
                flashing
                  ? 'bg-green-600 text-white ring-2 ring-green-300 scale-110'
                  : 'bg-green-50 text-green-700 ring-1 ring-green-200'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {dynamicScore}% match
            </div>

            <span className="text-xs text-gray-400 hidden sm:block">
              <span className="font-semibold text-gray-700">{reviewedCount}</span>/{totalItems} reviewed
            </span>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 active:bg-green-800 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download PDF
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Review content */}
        <div className="overflow-y-auto flex-1 px-6 py-6 flex flex-col gap-7">

          {/* Summary */}
          {summaryObj.tailored_text && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2.5">Summary</p>
              <ReviewCard
                status={summaryStatus}
                onAccept={() => setReview('summary', 'accepted')}
                onReject={() => setReview('summary', 'rejected')}
                onUndo={() => setReview('summary', null)}
              >
                <p className="text-sm text-gray-800 leading-relaxed">
                  <DiffText original={summaryObj.original_text} tailored={summaryObj.tailored_text} />
                </p>
                {summaryObj.change_reason && (
                  <p className="text-xs text-gray-400 italic border-l-2 border-gray-200 pl-2">{summaryObj.change_reason}</p>
                )}
              </ReviewCard>
            </div>
          )}

          {/* Experience */}
          {(data.tailored_experience || []).map((exp, i) => (
            <div key={i}>
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 inline">{exp.title}</h3>
                  {exp.company && <span className="text-sm text-gray-400"> · {exp.company}</span>}
                </div>
                {exp.period && <span className="text-xs text-gray-400 shrink-0 tabular-nums">{exp.period}</span>}
              </div>

              <div className="flex flex-col gap-2">
                {(exp.bullets || []).map((bullet, j) => {
                  const orig = cleanBulletText(typeof bullet === 'object' ? bullet.original_text : bullet);
                  const tailored = cleanBulletText(typeof bullet === 'object' ? bullet.tailored_text : bullet);
                  const reason = typeof bullet === 'object' ? bullet.change_reason : '';
                  const isNew = typeof bullet === 'object' && !!bullet.is_new_suggestion;
                  const rkey = `exp-${i}-${j}`;
                  const status = getReview(rkey);

                  return (
                    <ReviewCard
                      key={j}
                      status={status}
                      onAccept={() => setReview(rkey, 'accepted')}
                      onReject={() => setReview(rkey, 'rejected')}
                      onUndo={() => setReview(rkey, null)}
                    >
                      {isNew ? (
                        <div className="flex flex-col gap-1.5">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5 w-fit">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            AI Suggestion
                          </span>
                          <p className="text-sm text-gray-800 leading-relaxed">{tailored}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-800 leading-relaxed">
                          <DiffText original={orig} tailored={tailored} />
                        </p>
                      )}
                      {reason && (
                        <p className="text-xs text-gray-400 italic border-l-2 border-gray-200 pl-2">{reason}</p>
                      )}
                    </ReviewCard>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Hidden clean PDF */}
        <div className="sr-only">
          <div ref={pdfRef} style={{ fontFamily: 'Georgia, serif', fontSize: '13px', color: '#111', lineHeight: 1.6 }}>
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
                  const finalBullets = (exp.bullets || [])
                    .map((b, j) => getFinalBullet(b, i, j))
                    .filter(Boolean);

                  return (
                    <div key={i} style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 'bold', fontFamily: 'Arial, sans-serif' }}>
                          {exp.title}{exp.company ? ` · ${exp.company}` : ''}
                        </span>
                        {exp.period && <span style={{ fontSize: '11px', color: '#888', fontFamily: 'Arial, sans-serif' }}>{exp.period}</span>}
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '18px' }}>
                        {finalBullets.map((text, k) => (
                          <li key={k} style={{ marginBottom: '4px' }}>{text}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
