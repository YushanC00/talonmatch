import { useState, useRef, useCallback } from 'react';

export default function ResumeUpload({ onSubmit, loading }) {
  const [file, setFile]           = useState(null);
  const [dragging, setDragging]   = useState(false);
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

  const onDragOver  = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file) return setFieldError('Select a PDF resume first.');
    setFieldError('');
    onSubmit({ file });
  };

  const dropzoneStyle = {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 16,
    padding: '40px 24px',
    border: `1px dashed ${dragging || file ? 'var(--moss)' : 'var(--rule)'}`,
    borderRadius: 0,
    background: dragging
      ? 'var(--washi-soft)'
      : file
      ? 'rgba(90,122,78,0.06)'
      : 'var(--washi-soft)',
    cursor: 'pointer',
    transition: 'border-color 150ms ease, background 150ms ease',
    userSelect: 'none',
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Drop zone */}
      <div
        style={dropzoneStyle}
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => acceptFile(e.target.files[0])}
        />

        {file ? (
          <>
            {/* File doc icon */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="5" y="2" width="14" height="24" rx="0" stroke="var(--moss)" strokeWidth="1.5"/>
              <path d="M19 2 L23 6" stroke="var(--moss)" strokeWidth="1.5" strokeLinecap="square"/>
              <rect x="19" y="2" width="4" height="4" rx="0" stroke="var(--moss)" strokeWidth="1.5"/>
              <path d="M9 11 H19 M9 15 H19 M9 19 H14" stroke="var(--moss)" strokeWidth="1.2" strokeLinecap="square"/>
            </svg>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 600, color: 'var(--sumi)', margin: 0 }}>
                {file.name}
              </p>
              <p className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--moss)', marginTop: 4, textTransform: 'uppercase' }}>
                Ready to scan
              </p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                style={{
                  marginTop: 8, fontFamily: 'Inter', fontSize: 11,
                  color: 'var(--sumi-faint)', background: 'none',
                  border: 'none', cursor: 'pointer', textDecoration: 'underline',
                  textUnderlineOffset: 2,
                }}
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Minimalist arrow-up icon */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 22 V6" stroke="var(--sumi-mute)" strokeWidth="1.8" strokeLinecap="square"/>
              <path d="M7 13 L14 6 L21 13" stroke="var(--sumi-mute)" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter"/>
            </svg>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 500, color: 'var(--sumi)', margin: 0 }}>
                Drop resume here or{' '}
                <span style={{ color: 'var(--moss)', fontWeight: 600 }}>browse</span>
              </p>
              <p className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--sumi-faint)', marginTop: 6, textTransform: 'uppercase' }}>
                PDF only · max 10 MB
              </p>
            </div>
          </>
        )}
      </div>

      {fieldError && (
        <p style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--shu)', margin: 0 }}>{fieldError}</p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          padding: '11px 20px',
          background: loading ? 'var(--moss-soft)' : 'var(--moss)',
          color: 'var(--paper)',
          border: 'none', borderRadius: 0,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10, fontWeight: 600,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.7 : 1,
          transition: 'opacity 150ms ease',
        }}
      >
        {loading ? (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25"/>
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="square"/>
            </svg>
            Scanning…
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 11 V3 M7 3 L3 7 M7 3 L11 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" strokeLinejoin="miter"/>
            </svg>
            Execute Initial Scan
          </>
        )}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </form>
  );
}
