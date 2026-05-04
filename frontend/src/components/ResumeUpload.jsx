import { useState, useRef, useCallback } from 'react';

export default function ResumeUpload({ onSubmit, loading }) {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const inputRef = useRef(null);

  const acceptFile = useCallback((f) => {
    if (!f) return;
    if (f.type !== 'application/pdf') {
      setFieldError('Only PDF files are accepted.');
      return;
    }
    setFieldError('');
    setFile(f);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer.files[0]);
  }, [acceptFile]);

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file) return setFieldError('Please select a PDF resume.');
    setFieldError('');
    onSubmit({ file });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-8 py-12 cursor-pointer transition-all select-none
          ${dragging
            ? 'border-green-400 bg-green-50'
            : file
            ? 'border-green-400 bg-green-50'
            : 'border-gray-200 bg-white hover:border-green-300 hover:bg-gray-50'
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => acceptFile(e.target.files[0])}
        />

        {file ? (
          <>
            <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">{file.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">Ready to analyze</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors mt-2 underline underline-offset-2"
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-800">
                Drop your resume here or{' '}
                <span className="text-green-600 hover:text-green-700">browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">PDF only · max 10 MB</p>
            </div>
          </>
        )}
      </div>

      {fieldError && (
        <p className="text-sm text-red-500">{fieldError}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold bg-green-600 text-white hover:bg-green-700 active:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Analyzing your resume...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Find Matching Jobs
          </>
        )}
      </button>
    </form>
  );
}
