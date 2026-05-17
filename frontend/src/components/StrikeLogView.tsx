import { useState, useEffect } from 'react';
import { getStrikes, type StrikeEntry, type StrikeKind } from '../utils/strikeLog';

const KIND_CFG: Record<StrikeKind, { label: string; color: string; bg: string }> = {
  strike:    { label: 'STRIKE',    color: '#A85E3E', bg: '#F2E8E2' },
  tailor:    { label: 'TAILOR',    color: '#A88A4E', bg: '#F2EAD8' },
  draft:     { label: 'DRAFT',     color: '#6E776F', bg: '#E8E4D8' },
  skip:      { label: 'SKIP',      color: '#9DA29B', bg: '#E5E0D5' },
  interview: { label: 'INTERVIEW', color: '#5A7A4E', bg: '#DDE8D5' },
};

function KindBadge({ kind }: { kind: StrikeKind }) {
  const cfg = KIND_CFG[kind];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: cfg.bg, color: cfg.color,
      padding: '3px 8px', width: 'fit-content',
      fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
      letterSpacing: '0.18em', fontWeight: 700,
    }}>
      {cfg.label}
    </span>
  );
}

function formatTs(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
      + ' · '
      + d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return iso; }
}

export default function StrikeLogView() {
  const [entries, setEntries] = useState<StrikeEntry[]>([]);

  useEffect(() => { setEntries(getStrikes()); }, []);

  const totals = (Object.keys(KIND_CFG) as StrikeKind[]).map(k => ({
    kind: k, n: entries.filter(e => e.kind === k).length,
  }));

  if (entries.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 360, gap: 12,
      }}>
        <div style={{ fontFamily: '"Shippori Mincho", serif', fontSize: 22, color: 'var(--sumi-mute)', fontWeight: 600 }}>
          No strikes yet
        </div>
        <div className="tm-mono" style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--sumi-faint)', textTransform: 'uppercase' }}>
          Enable Autosend Protocol to begin logging
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Totals strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {totals.map(({ kind, n }) => {
          const cfg = KIND_CFG[kind];
          return (
            <div key={kind} style={{
              flex: '1 1 0', background: 'var(--paper)', border: '1px solid var(--rule)',
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
              borderLeft: `3px solid ${cfg.color}`,
            }}>
              <div>
                <div className="tm-mincho" style={{ fontSize: 26, fontWeight: 700, color: 'var(--sumi)', lineHeight: 1 }}>{n}</div>
                <div className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.22em', color: 'var(--sumi-mute)', marginTop: 4, textTransform: 'uppercase' }}>
                  {cfg.label}
                </div>
              </div>
              <span style={{ marginLeft: 'auto', width: 5, height: 32, background: cfg.color }} />
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--paper)', border: '1px solid var(--rule)' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '160px 96px 1.4fr 1.6fr 100px 64px',
          padding: '10px 18px', borderBottom: '1px solid var(--rule)',
          background: 'var(--washi)',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 9, letterSpacing: '0.22em', color: 'var(--sumi-mute)', textTransform: 'uppercase',
        }}>
          <span>Timestamp</span>
          <span>Action</span>
          <span>Role · Company</span>
          <span>Detail</span>
          <span>Match Δ</span>
          <span style={{ textAlign: 'right' }}>Score</span>
        </div>

        {entries.map((entry, i) => (
          <div key={entry.id} style={{
            display: 'grid', gridTemplateColumns: '160px 96px 1.4fr 1.6fr 100px 64px',
            padding: '13px 18px', alignItems: 'center',
            borderBottom: i === entries.length - 1 ? 'none' : '1px solid var(--rule)',
            background: i % 2 ? 'transparent' : 'rgba(232,228,216,0.18)',
            fontSize: 12, color: 'var(--sumi)',
            gap: 8,
          }}>
            <span className="tm-mono" style={{ fontSize: 10, color: 'var(--sumi-soft)' }}>
              {formatTs(entry.timestamp)}
            </span>
            <KindBadge kind={entry.kind} />
            <span style={{ minWidth: 0 }}>
              {entry.jobTitle ? (
                <>
                  <div className="tm-mincho" style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {entry.jobTitle}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--sumi-mute)', marginTop: 1 }}>{entry.company}</div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--sumi-mute)', fontStyle: 'italic' }}>—</div>
              )}
            </span>
            <span style={{ fontSize: 11, color: 'var(--sumi-soft)', lineHeight: 1.4 }}>{entry.message}</span>
            <span className="tm-mono" style={{ fontSize: 11, color: entry.matchDelta?.startsWith('+') ? 'var(--moss)' : 'var(--sumi-soft)' }}>
              {entry.matchDelta ?? <span style={{ color: 'var(--sumi-faint)' }}>—</span>}
            </span>
            <span className="tm-mincho" style={{ textAlign: 'right', fontWeight: 600, fontSize: 13 }}>
              {entry.score != null ? `${entry.score}%` : <span style={{ color: 'var(--sumi-faint)' }}>—</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
