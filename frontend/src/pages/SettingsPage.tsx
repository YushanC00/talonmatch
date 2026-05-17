import DesignDNAPanel from '../components/DesignDNAPanel';
import AutosendPanel from '../components/AutosendPanel';
import type { ParsedResume } from '../types';
import type { UseAutosendResult } from '../hooks/useAutosend';
import type { User } from '@supabase/supabase-js';

interface SettingsPageProps {
  parsedResume: ParsedResume;
  autosend: UseAutosendResult;
  user: User | null;
}

function SectionLabel({ label, sub, color = 'var(--shu)' }: { label: string; sub: string; color?: string }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 14, marginBottom: 20 }}>
      <div className="tm-mono" style={{ fontSize: 10, letterSpacing: '0.22em', color, textTransform: 'uppercase', fontWeight: 700 }}>
        {label}
      </div>
      <div className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.18em', color: 'var(--sumi-mute)', textTransform: 'uppercase', marginTop: 4 }}>
        {sub}
      </div>
    </div>
  );
}

export default function SettingsPage({ parsedResume, autosend, user }: SettingsPageProps) {
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">

      <div style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
          <span aria-hidden="true" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, background: 'var(--shu)', color: 'var(--paper)',
            fontFamily: '"Shippori Mincho", serif', fontWeight: 700,
            fontSize: 18, letterSpacing: '-0.02em', flexShrink: 0,
          }}>S</span>
          <h1 className="tm-mincho" style={{ margin: 0, fontSize: 30, fontWeight: 600, color: 'var(--sumi)', letterSpacing: '-0.015em' }}>
            Settings
          </h1>
        </div>
        <div className="tm-mono" style={{ margin: '0 0 0 48px', fontSize: 10, letterSpacing: '0.2em', color: 'var(--sumi-mute)', textTransform: 'uppercase' }}>
          Configure your hunt parameters
        </div>
      </div>

      {/* Autosend Protocol */}
      <section style={{ marginBottom: 48 }}>
        <SectionLabel label="Autosend Protocol" sub="Automated tailoring and application queue" />
        <AutosendPanel autosend={autosend} isLoggedIn={!!user} />
      </section>

      {/* Design DNA */}
      <section style={{ marginBottom: 48 }}>
        <SectionLabel label="Design DNA" sub="PDF style fingerprint detected from your résumé" color="var(--moss)" />
        {parsedResume.style_config ? (
          <DesignDNAPanel
            config={parsedResume.style_config}
            candidateName={parsedResume.full_name || undefined}
          />
        ) : (
          <div style={{
            padding: '32px', background: 'var(--paper)', border: '1px solid var(--rule)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}>
            <div className="tm-mincho" style={{ fontSize: 16, color: 'var(--sumi-mute)', fontWeight: 600 }}>
              No Design DNA detected
            </div>
            <div className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.18em', color: 'var(--sumi-faint)', textTransform: 'uppercase' }}>
              Upload a résumé to extract your PDF style fingerprint
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
