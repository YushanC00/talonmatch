import { useState, useRef, useCallback } from 'react';

export default function ResumeUpload({ onSubmit, loading }) {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [location, setLocation] = useState('');
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
    onSubmit({ file, location: location.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors select-none
          ${dragging ? 'border-indigo-400 bg-indigo-50' : file ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/50'}`}
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
            <span className="text-3xl">📄</span>
            <p className="text-sm font-medium text-green-700">{file.name}</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Remove
            </button>
          </>
        ) : (
          <>
            <span className="text-3xl text-gray-300">📎</span>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">
                Drop your resume here or <span className="text-indigo-600">browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">PDF only · max 10 MB</p>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600" htmlFor="location">
          Location <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="location"
          type="text"
          placeholder="e.g. Remote or New York"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
        />
      </div>

      {fieldError && (
        <p className="text-sm text-red-500 -mt-2">{fieldError}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Analyzing...
          </>
        ) : (
          'Find Matching Jobs'
        )}
      </button>
    </form>
  );
}
