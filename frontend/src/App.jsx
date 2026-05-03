import { useState } from 'react';
import ResumeUpload from './components/ResumeUpload';
import JobFeed from './components/JobFeed';
import './index.css';

async function matchResume({ file, location }) {
  const params = new URLSearchParams();
  if (location) params.set('location', location);

  const body = new FormData();
  body.append('resume', file);

  const res = await fetch(`/api/match?${params}`, { method: 'POST', body });

  const text = await res.text();
  if (!text) throw new Error(`Server returned empty response (HTTP ${res.status})`);

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Invalid server response: ${text.slice(0, 200)}`);
  }

  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export default function App() {
  const [stage, setStage] = useState('upload'); // 'upload' | 'results'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);

  const handleSubmit = async (params) => {
    setLoading(true);
    setError('');
    try {
      const data = await matchResume(params);
      setResults(data);
      setStage('results');
    } catch (err) {
      console.error('[matchResume error]', err);
      setError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStage('upload');
    setResults(null);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Job Match</h1>
        {stage === 'results' && (
          <button
            onClick={handleReset}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors cursor-pointer"
          >
            ← New Search
          </button>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {error && (
          <div className="mb-6 max-w-xl mx-auto rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-start justify-between gap-3">
            <span className="break-all">{error}</span>
            <button onClick={() => setError('')} className="shrink-0 text-red-400 hover:text-red-600 cursor-pointer">✕</button>
          </div>
        )}

        {stage === 'upload' && (
          <div className="max-w-xl mx-auto">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold text-gray-900">Find jobs that match your resume</h2>
              <p className="text-gray-500 mt-2 text-sm">Upload your PDF resume and we'll score every listing against your skills.</p>
            </div>
            <ResumeUpload onSubmit={handleSubmit} loading={loading} />
          </div>
        )}

        {stage === 'results' && results != null && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-600 shadow-sm">
                <span className="font-medium text-gray-800">{results.resume_skills?.length ?? 0}</span> skills detected
              </div>
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-600 shadow-sm">
                <span className="font-medium text-gray-800">{results.count}</span> jobs ranked
              </div>
              {results.all_job_titles?.length > 0 && (
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-600 shadow-sm max-w-full flex-wrap">
                  <span className="shrink-0 text-gray-400">Searched as:</span>
                  {results.all_job_titles.map((t, i) => (
                    <span key={t} className="inline-flex items-center gap-1">
                      <span className="font-medium text-gray-800">{t}</span>
                      {i < results.all_job_titles.length - 1 && (
                        <span className="text-gray-300 text-xs">,</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {results.resume_skills?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {results.resume_skills.slice(0, 8).map((s) => (
                    <span key={s} className="text-xs px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-medium">
                      {s}
                    </span>
                  ))}
                  {results.resume_skills.length > 8 && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 text-gray-400">
                      +{results.resume_skills.length - 8} more
                    </span>
                  )}
                </div>
              )}
            </div>

            <JobFeed
              jobs={results.jobs}
              parsedResume={{
                skills: results.resume_skills,
                experience: results.resume_experience,
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
