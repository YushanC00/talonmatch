import StrikeLogView from '../components/StrikeLogView';

export default function StrikesPage() {

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
          <span aria-hidden="true" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, background: 'var(--shu)', color: 'var(--paper)',
            fontFamily: '"Shippori Mincho", serif', fontWeight: 700,
            fontSize: 18, letterSpacing: '-0.02em', flexShrink: 0,
          }}>T</span>
          <h1 className="tm-mincho" style={{ margin: 0, fontSize: 30, fontWeight: 600, color: 'var(--sumi)', letterSpacing: '-0.015em' }}>
            Strike log
          </h1>
        </div>
      </div>
      <StrikeLogView />
    </main>
  );
}
