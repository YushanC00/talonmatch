import { useState, useEffect } from 'react';
import type { StyleConfig } from '../types';

interface Props {
  config: StyleConfig;
  candidateName?: string;
}

const FONT_LABEL: Record<StyleConfig['fontProfile'], string> = {
  'serif':      'Serif',
  'sans-serif': 'Sans',
  'monospace':  'Mono',
  'mixed':      'Mixed',
  'unknown':    'Unknown',
};

const FONT_JP: Record<StyleConfig['fontProfile'], string> = {
  'serif':      '明朝体',
  'sans-serif': 'ゴシック',
  'monospace':  '等幅',
  'mixed':      '混合',
  'unknown':    '不明',
};

function LayoutDiagram({ columns, headerAlign }: { columns: 1 | 2; headerAlign?: string }) {
  const isCenter = headerAlign === 'center';
  return (
    <svg width="44" height="52" viewBox="0 0 44 52" fill="none" style={{ flexShrink: 0 }}>
      {/* Page outline */}
      <rect x="1" y="1" width="42" height="50" stroke="var(--rule)" strokeWidth="1" />
      {/* Header name block */}
      <rect x={isCenter ? 10 : 4} y="5" width={isCenter ? 24 : 30} height="4" fill="var(--sumi)" opacity="0.7" />
      {/* Sub-header line */}
      <rect x={isCenter ? 13 : 4} y="11" width={isCenter ? 18 : 22} height="2" fill="var(--rule)" />
      {/* Rule */}
      <line x1="4" y1="16" x2="40" y2="16" stroke="var(--rule)" strokeWidth="0.8" />
      {columns === 1 ? (
        <>
          <rect x="4" y="20" width="36" height="2" fill="var(--rule)" />
          <rect x="4" y="24" width="28" height="2" fill="var(--rule)" />
          <rect x="4" y="30" width="36" height="2" fill="var(--rule)" />
          <rect x="4" y="34" width="20" height="2" fill="var(--rule)" />
          <rect x="4" y="40" width="36" height="2" fill="var(--rule)" />
          <rect x="4" y="44" width="24" height="2" fill="var(--rule)" />
        </>
      ) : (
        <>
          {/* Left col */}
          <rect x="4"  y="20" width="16" height="2" fill="var(--rule)" />
          <rect x="4"  y="24" width="12" height="2" fill="var(--rule)" />
          <rect x="4"  y="30" width="16" height="2" fill="var(--rule)" />
          <rect x="4"  y="34" width="10" height="2" fill="var(--rule)" />
          <rect x="4"  y="40" width="16" height="2" fill="var(--rule)" />
          <rect x="4"  y="44" width="14" height="2" fill="var(--rule)" />
          {/* Right col */}
          <rect x="24" y="20" width="16" height="2" fill="var(--rule)" />
          <rect x="24" y="24" width="10" height="2" fill="var(--rule)" />
          <rect x="24" y="30" width="16" height="2" fill="var(--rule)" />
          <rect x="24" y="34" width="12" height="2" fill="var(--rule)" />
          <rect x="24" y="40" width="16" height="2" fill="var(--rule)" />
          <rect x="24" y="44" width="8"  height="2" fill="var(--rule)" />
        </>
      )}
    </svg>
  );
}

function TypeScaleBar({ body, heading, name }: { body: number; heading: number; name: number }) {
  const max = Math.max(name, 24);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 48 }}>
      {[
        { size: body,    label: 'B', title: `${body}pt body` },
        { size: heading, label: 'H', title: `${heading}pt heading` },
        { size: name,    label: 'N', title: `${name}pt name` },
      ].map(({ size, label, title }) => {
        const h = Math.round((size / max) * 44);
        return (
          <div key={label} title={title} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div
              style={{
                width: 14, height: h,
                background: label === 'N' ? 'var(--sumi)' : label === 'H' ? 'var(--sumi-mute)' : 'var(--rule)',
              }}
            />
            <span className="tm-mono" style={{ fontSize: 8, color: 'var(--sumi-faint)', letterSpacing: '0.05em' }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SectionList({ sections }: { sections: string[] }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 180,
    }}>
      {sections.slice(0, 8).map((s, i) => (
        <span key={i} className="tm-mono" style={{
          fontSize: 9, letterSpacing: '0.1em',
          padding: '2px 6px',
          border: '1px solid var(--rule)',
          color: 'var(--sumi-mute)',
          background: 'var(--washi)',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          {s.length > 10 ? s.slice(0, 9) + '…' : s}
        </span>
      ))}
    </div>
  );
}

function ColorSwatch({ color }: { color: string | null }) {
  if (!color) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 44, height: 44,
          border: '1px dashed var(--rule)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="tm-mono" style={{ fontSize: 9, color: 'var(--sumi-faint)' }}>—</span>
        </div>
        <span className="tm-mono" style={{ fontSize: 9, color: 'var(--sumi-faint)', letterSpacing: '0.05em' }}>none</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 44, height: 44,
        background: color,
        border: '1px solid rgba(0,0,0,0.08)',
      }} />
      <span className="tm-mono" style={{ fontSize: 9, color: 'var(--sumi-mute)', letterSpacing: '0.05em' }}>
        {color.toUpperCase()}
      </span>
    </div>
  );
}

const DIVIDER = (
  <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--rule)', flexShrink: 0, margin: '0 4px' }} />
);

interface CellProps {
  label: string;
  labelJp?: string;
  children: React.ReactNode;
  delay: number;
  visible: boolean;
  flex?: number;
  minWidth?: number;
}

function Cell({ label, labelJp, children, delay, visible, flex = 1, minWidth }: CellProps) {
  return (
    <div style={{
      flex, minWidth,
      display: 'flex', flexDirection: 'column', gap: 10,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(6px)',
      transition: `opacity 0.4s ease ${delay}ms, transform 0.4s ease ${delay}ms`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="tm-mono" style={{
          fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--sumi-faint)', fontWeight: 600,
        }}>
          {label}
        </span>
        {labelJp && (
          <span className="tm-jp" style={{ fontSize: 9, color: 'var(--rule)', opacity: 0.8 }}>
            {labelJp}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export default function DesignDNAPanel({ config, candidateName }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const topFontName = config.fontNames[0]
    ? config.fontNames[0].replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
    : null;

  return (
    <div
      aria-label="Design DNA — detected resume layout and typography"
      style={{
        marginBottom: 28,
        border: '1px solid var(--rule)',
        background: 'var(--paper)',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(-6px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}
    >
      {/* 2px accent strip */}
      <div style={{ height: 2, background: 'var(--moss)' }} />
      {/* Control bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', borderBottom: '1px solid var(--rule)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {candidateName && (
            <span className="tm-mono" style={{ fontSize: 9, color: 'var(--sumi-faint)', letterSpacing: '0.08em' }}>
              {candidateName}
            </span>
          )}
        </div>
        <div />
      </div>

      <div style={{ padding: '14px 20px 16px' }}>
        {/* Data cells */}
        <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>

          {/* Typeface */}
          <Cell label="Typeface" labelJp="書体" delay={0} visible={mounted} flex={1} minWidth={100}>
            <div>
              <div className="tm-mono" style={{
                fontSize: 20, fontWeight: 700,
                color: 'var(--sumi)', lineHeight: 1,
                letterSpacing: '-0.02em',
              }}>
                {FONT_LABEL[config.fontProfile]}
              </div>
              <div className="tm-jp" style={{ fontSize: 10, color: 'var(--sumi-mute)', marginTop: 4 }}>
                {FONT_JP[config.fontProfile]}
              </div>
              {topFontName && (
                <div className="tm-mono" style={{
                  fontSize: 9, color: 'var(--sumi-faint)', marginTop: 6,
                  letterSpacing: '0.06em', maxWidth: 90,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {topFontName}
                  {config.hasBoldFont && (
                    <span style={{ color: 'var(--moss)', marginLeft: 4 }}>· Bold</span>
                  )}
                </div>
              )}
            </div>
          </Cell>

          {DIVIDER}

          {/* Layout */}
          <Cell label="Layout" labelJp="構成" delay={80} visible={mounted} flex={0} minWidth={100}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
              <LayoutDiagram
                columns={config.layout.columns}
                headerAlign={config.layout.headerAlign}
              />
              <div className="tm-mono" style={{ fontSize: 9, color: 'var(--sumi-mute)', letterSpacing: '0.08em' }}>
                {config.layout.columns === 2 ? 'Two column' : 'Single column'}
                {config.layout.headerAlign === 'center' && ' · centred name'}
              </div>
            </div>
          </Cell>

          {DIVIDER}

          {/* Type scale */}
          <Cell label="Scale" labelJp="文字" delay={160} visible={mounted} flex={0} minWidth={100}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <TypeScaleBar
                body={config.fontSize.body}
                heading={config.fontSize.heading}
                name={config.fontSize.name}
              />
              <div className="tm-mono" style={{ fontSize: 9, color: 'var(--sumi-faint)', letterSpacing: '0.06em' }}>
                {config.fontSize.body}·{config.fontSize.heading}·{config.fontSize.name} pt
              </div>
            </div>
          </Cell>

          {DIVIDER}

          {/* Bullet style */}
          <Cell label="Bullets" labelJp="箇条" delay={240} visible={mounted} flex={0} minWidth={72}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
              <div
                className="tm-mono"
                title={`Bullet style: "${config.bullets}"`}
                style={{
                  fontSize: 32, lineHeight: 1,
                  color: 'var(--sumi)',
                  userSelect: 'none',
                }}
              >
                {config.bullets || '•'}
              </div>
              <div className="tm-mono" style={{ fontSize: 9, color: 'var(--sumi-faint)', letterSpacing: '0.06em' }}>
                U+{config.bullets.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}
              </div>
            </div>
          </Cell>

          {DIVIDER}

          {/* Sections detected */}
          <Cell label="Sections" labelJp="章" delay={320} visible={mounted} flex={2} minWidth={160}>
            <SectionList sections={config.sections} />
          </Cell>

          {DIVIDER}

          {/* Accent color */}
          <Cell label="Accent" labelJp="色" delay={400} visible={mounted} flex={0} minWidth={80}>
            <ColorSwatch color={config.accentColor} />
          </Cell>

        </div>
      </div>
    </div>
  );
}
