import { useEffect, useRef, useState } from 'react';
import * as Diff from 'diff';

// Strip any job header metadata Groq sneaks into bullet text
// e.g. "Senior Designer at Acme, 2020–2022 – Led design…" → "Led design…"
function cleanBulletText(text) {
  if (!text) return '';
  // Remove leading "Title at Company, period – " or "Title | period: " patterns
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
  const borderColor =
    status === 'accepted' ? 'border-green-300 bg-green-50/40' :
    status === 'rejected' ? 'border-red-200 bg-red-50/30' :
    'border-gray-200 bg-white';

  return (
    <div className={`rounded-lg border px-4 py-3 flex flex-col gap-2 transition-colors ${borderColor}`}>
      {children}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          onClick={onAccept}
          className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
            status === 'accepted'
              ? 'bg-green-600 text-white'
              : 'bg-white border border-green-300 text-green-700 hover:bg-green-50'
          }`}
        >
          ✅ Accept
        </button>
        <button
          onClick={onReject}
          className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
            status === 'rejected'
              ? 'bg-red-500 text-white'
              : 'bg-white border border-red-200 text-red-500 hover:bg-red-50'
          }`}
        >
          ❌ Reject
        </button>
        {status && (
          <button
            onClick={onUndo}
            className="text-xs text-gray-300 hover:text-gray-500 transition-colors cursor-pointer ml-1"
          >
            undo
          </button>
        )}
      </div>
    </div>
  );
}

export default function TailoredResumeModal({ data, jobTitle, company, onClose }) {
  const pdfRef = useRef(null);
  // reviews: key -> "accepted" | "rejected" | null
  // keys: "summary" for summary, "exp-i-j" for bullets
  const [reviews, setReviews] = useState({});

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const getReview = (k) => reviews[k] || null;
  const setReview = (k, status) =>
    setReviews((prev) => ({ ...prev, [k]: status }));

  // Final text for PDF: accepted → tailored, rejected → original (or omit if new suggestion), pending → tailored
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
    1 + // summary
    (data.tailored_experience || []).reduce((s, e) => s + (e.bullets?.length || 0), 0);
  const reviewedCount = Object.keys(reviews).length;
  const acceptedCount = Object.values(reviews).filter((v) => v === 'accepted').length;

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

  const summaryObj = typeof data.summary === 'object' ? data.summary : { original_text: '', tailored_text: data.summary || '', change_reason: '' };
  const summaryStatus = getReview('summary');
  const finalSummary = summaryStatus === 'rejected' ? '' : summaryObj.tailored_text;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Review Tailored Resume</h2>
            <p className="text-xs text-gray-400 mt-0.5">{jobTitle} · {company}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              <span className="font-medium text-gray-700">{reviewedCount}</span>/{totalItems} reviewed
              {acceptedCount > 0 && (
                <span className="ml-1 text-green-600 font-medium">· {acceptedCount} accepted</span>
              )}
            </span>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
        <div className="overflow-y-auto flex-1 p-6 flex flex-col gap-6">

          {/* Summary review card */}
          {summaryObj.tailored_text && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Summary</p>
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
                  <p className="text-xs text-gray-400 italic">{summaryObj.change_reason}</p>
                )}
              </ReviewCard>
            </div>
          )}

          {/* Experience */}
          {(data.tailored_experience || []).map((exp, i) => (
            <div key={i}>
              {/* Plain text header — never diffed */}
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 inline">{exp.title}</h3>
                  {exp.company && <span className="text-sm text-gray-500"> · {exp.company}</span>}
                </div>
                {exp.period && <span className="text-xs text-gray-400 shrink-0">{exp.period}</span>}
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
                        /* New AI suggestion — no diff, green badge */
                        <div className="flex flex-col gap-1.5">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 w-fit">
                            ✨ New AI Suggestion
                          </span>
                          <p className="text-sm text-gray-800 leading-relaxed">{tailored}</p>
                        </div>
                      ) : (
                        /* Existing bullet — show diff */
                        <p className="text-sm text-gray-800 leading-relaxed">
                          <DiffText original={orig} tailored={tailored} />
                        </p>
                      )}
                      {reason && (
                        <p className="text-xs text-gray-400 italic">{reason}</p>
                      )}
                    </ReviewCard>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Hidden clean PDF — uses final approved/rejected text */}
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
