import type { UseAutosendResult } from '../hooks/useAutosend';

interface AutosendPanelProps {
  autosend: UseAutosendResult;
}

const INTERVALS = [
  { value: 15,  label: '15 min' },
  { value: 30,  label: '30 min' },
  { value: 60,  label: '1 hr' },
  { value: 120, label: '2 hr' },
];

export default function AutosendPanel({ autosend }: AutosendPanelProps) {
  const { settings, updateSettings, queued, isProcessing, sendAll, dismiss } = autosend;

  return (
    <div style={{
      margin: '0 0 32px',
      border: '1px solid var(--rule)',
      background: 'var(--paper)',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid var(--rule)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="tm-mono" style={{ fontSize: 10, letterSpacing: '0.22em', color: 'var(--shu)', textTransform: 'uppercase', fontWeight: 700 }}>
            Autosend Protocol
          </span>
          {isProcessing && (
            <span className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.15em', color: 'var(--sumi-mute)', textTransform: 'uppercase' }}>
              · Processing…
            </span>
          )}
        </div>
        {/* Enable toggle */}
        <button
          onClick={() => updateSettings({ enabled: !settings.enabled })}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: settings.enabled ? 'var(--shu)' : 'var(--washi)',
            border: '1px solid var(--rule)', padding: '4px 12px', cursor: 'pointer',
            fontFamily: '"JetBrains Mono", monospace', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: settings.enabled ? 'var(--paper)' : 'var(--sumi)',
          }}
        >
          <span style={{
            display: 'inline-block', width: 7, height: 7,
            borderRadius: '50%',
            background: settings.enabled ? 'var(--paper)' : 'var(--sumi-mute)',
          }} />
          {settings.enabled ? 'Active' : 'Off'}
        </button>
      </div>

      {/* Guardrail settings */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--rule)', display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        {/* Score threshold */}
        <div>
          <label className="tm-mono" style={{ display: 'block', fontSize: 9, letterSpacing: '0.2em', color: 'var(--sumi-mute)', textTransform: 'uppercase', marginBottom: 8 }}>
            Min Match Score — {settings.scoreThreshold}%
          </label>
          <input
            type="range"
            min={50} max={99} step={1}
            value={settings.scoreThreshold}
            onChange={e => updateSettings({ scoreThreshold: Number(e.target.value) })}
            style={{ width: 180, accentColor: 'var(--shu)', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span className="tm-mono" style={{ fontSize: 8, color: 'var(--sumi-faint)', letterSpacing: '0.1em' }}>50%</span>
            <span className="tm-mono" style={{ fontSize: 8, color: 'var(--sumi-faint)', letterSpacing: '0.1em' }}>99%</span>
          </div>
        </div>

        {/* Interval */}
        <div>
          <div className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--sumi-mute)', textTransform: 'uppercase', marginBottom: 8 }}>
            Scan Interval
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {INTERVALS.map(iv => (
              <button
                key={iv.value}
                onClick={() => updateSettings({ intervalMinutes: iv.value })}
                style={{
                  padding: '4px 10px',
                  background: settings.intervalMinutes === iv.value ? 'var(--sumi)' : 'var(--washi)',
                  border: '1px solid var(--rule)', cursor: 'pointer',
                  fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
                  fontWeight: 600, letterSpacing: '0.1em',
                  color: settings.intervalMinutes === iv.value ? 'var(--paper)' : 'var(--sumi)',
                }}
              >
                {iv.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Queue */}
      {queued.length > 0 && (
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--sumi-mute)', textTransform: 'uppercase' }}>
              {queued.length} application{queued.length > 1 ? 's' : ''} ready
            </span>
            <button
              onClick={() => void sendAll()}
              style={{
                background: 'var(--shu)', color: 'var(--paper)', border: 'none',
                padding: '6px 16px', cursor: 'pointer',
                fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
                fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
              }}
            >
              Send All →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {queued.map(entry => (
              <div key={entry.job.url} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: 'var(--washi)', border: '1px solid var(--rule)',
              }}>
                <div>
                  <span className="tm-mono" style={{ fontSize: 11, color: 'var(--sumi)', fontWeight: 600 }}>
                    {entry.job.job_title}
                  </span>
                  <span className="tm-mono" style={{ fontSize: 10, color: 'var(--sumi-mute)', marginLeft: 8 }}>
                    {entry.job.company}
                  </span>
                  <span className="tm-mono" style={{ fontSize: 9, color: 'var(--moss)', marginLeft: 8 }}>
                    {entry.job.match_score}%
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {entry.pdfUrl && (
                    <a
                      href={entry.pdfUrl}
                      download={`tailored-resume-${entry.job.company.replace(/\s+/g, '-').toLowerCase()}.pdf`}
                      style={{
                        fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
                        color: 'var(--sumi-mute)', letterSpacing: '0.12em',
                        textTransform: 'uppercase', textDecoration: 'none',
                        border: '1px solid var(--rule)', padding: '2px 8px',
                      }}
                    >
                      PDF
                    </a>
                  )}
                  <button
                    onClick={() => dismiss(entry.job.url!)}
                    style={{
                      background: 'none', border: '1px solid var(--rule)', cursor: 'pointer',
                      color: 'var(--sumi-mute)', fontFamily: '"JetBrains Mono", monospace',
                      fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '2px 8px',
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {queued.length === 0 && settings.enabled && !isProcessing && (
        <div style={{ padding: '14px 20px' }}>
          <span className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.15em', color: 'var(--sumi-faint)', textTransform: 'uppercase' }}>
            Scanning for jobs ≥ {settings.scoreThreshold}% every {settings.intervalMinutes} min
          </span>
        </div>
      )}
    </div>
  );
}
