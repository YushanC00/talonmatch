import { useState, useRef, useEffect } from 'react';
import type React from 'react';
import { Settings, LogOut, Upload, LayoutDashboard, ListChecks, BarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { User, Subscription } from '@supabase/supabase-js';
import type { ParsedResume } from '../types';


function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function AvatarSquare({ src, initials, size = 38 }: { src?: string; initials: string; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        data-testid="user-avatar"
        style={{
          width: size, height: size, flexShrink: 0,
          background: 'var(--sumi)', color: 'var(--paper)',
          display: 'grid', placeItems: 'center',
          fontFamily: '"Shippori Mincho", serif', fontWeight: 700,
          fontSize: size * 0.42, letterSpacing: '-0.01em',
          userSelect: 'none',
        }}
      >
        {initials && initials !== '?' ? initials : (
          <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        )}
      </div>
    );
  }

  return (
    <img
      data-testid="user-avatar"
      src={src}
      alt={initials}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: 'cover', display: 'block', flexShrink: 0 }}
      referrerPolicy="no-referrer"
    />
  );
}

function MenuItem({ icon: Icon, label, onClick, danger = false }: {
  icon: React.ElementType; label: string; onClick?: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 16px', background: 'transparent', border: 'none',
        cursor: 'pointer', textAlign: 'left',
        color: danger ? 'var(--shu)' : 'var(--sumi-mute)',
        fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
        letterSpacing: '0.08em',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--washi)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <Icon size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
      {label}
    </button>
  );
}

export default function UserMenu({ user, parsedResume, onSignOut, onNewResume, onLogin }: {
  user?: User | null;
  parsedResume?: ParsedResume | null;
  onSignOut?: () => void;
  onNewResume?: () => void;
  onLogin?: (user: User) => void;
}) {
  const [open, setOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const userName   = user?.user_metadata?.full_name ?? user?.email ?? '';
  const userEmail  = user?.email ?? '';
  const userAvatar = user?.user_metadata?.avatar_url ?? '';
  const initials   = userName
    .split(' ')
    .filter(Boolean)
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleGuestSignIn = async () => {
    setOpen(false);
    setSigningIn(true);

    if (parsedResume && (parsedResume.skills?.length ?? 0) > 0) {
      localStorage.setItem('talonmatch_pending_resume', JSON.stringify({
        skills: parsedResume.skills,
        experience: parsedResume.experience ?? [],
      }));
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

    if (error) { setSigningIn(false); return; }

    const subRef: { current: Subscription | null } = { current: null };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        subRef.current?.unsubscribe();
        setSigningIn(false);
        onLogin?.(session.user);
      }
    });
    subRef.current = subscription;
  };

  const handleSignOut = async () => {
    setOpen(false);
    await supabase.auth.signOut();
    onSignOut?.();
  };

  // ── Guest mode ──────────────────────────────────────────────────────────────

  if (!user) {
    const skillCount = parsedResume?.skills?.length ?? 0;

    return (
      <div style={{ position: 'relative' }} ref={menuRef}>
        <button
          onClick={() => setOpen(o => !o)}
          disabled={signingIn}
          aria-label="Guest menu"
          aria-expanded={open}
          data-testid="guest-avatar-trigger"
          style={{
            width: 38, height: 38, flexShrink: 0,
            background: 'var(--washi)', border: '1px dashed var(--sumi-mute)',
            display: 'grid', placeItems: 'center',
            cursor: signingIn ? 'not-allowed' : 'pointer',
            opacity: signingIn ? 0.5 : 1,
          }}
        >
          {signingIn ? (
            <span style={{
              width: 14, height: 14, border: '2px solid var(--rule)',
              borderTopColor: 'var(--shu)', borderRadius: '50%',
              display: 'inline-block', animation: 'spin 0.7s linear infinite',
            }} />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--sumi-mute)" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          )}
        </button>

        {open && (
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)',
            width: 240, background: 'var(--paper)', border: '1px solid var(--rule)',
            zIndex: 50,
          }}>
            {/* Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)' }}>
              <div className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.22em', color: 'var(--sumi-faint)', textTransform: 'uppercase', marginBottom: 4 }}>
                Guest Session
              </div>
              {skillCount > 0 && (
                <div style={{ fontSize: 11, color: 'var(--shu)', fontFamily: '"JetBrains Mono", monospace' }}>
                  <strong>{skillCount} skills</strong> detected — sign in to save
                </div>
              )}
            </div>

            {/* Google sign-in */}
            <div style={{ padding: '10px 12px' }}>
              <button
                onClick={handleGuestSignIn}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 10, padding: '9px 16px',
                  border: '1px solid var(--rule)', background: 'var(--washi)',
                  color: 'var(--sumi)', cursor: 'pointer',
                  fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
                  letterSpacing: '0.08em',
                }}
              >
                <GoogleIcon />
                Sign in to save skills
              </button>
            </div>

            <div style={{ height: 1, background: 'var(--rule)' }} />
            <MenuItem icon={Upload} label={parsedResume?.experience?.length ? 'Update résumé' : 'Upload résumé'} onClick={() => { setOpen(false); onNewResume?.(); }} />
            <div style={{ height: 1, background: 'var(--rule)' }} />
            <MenuItem icon={LayoutDashboard} label="Status board" onClick={() => { setOpen(false); navigate('/kanban'); }} />
            <MenuItem icon={ListChecks} label="Strike log" onClick={() => { setOpen(false); navigate('/strikes'); }} />
            <MenuItem icon={BarChart2} label="Match history" onClick={() => { setOpen(false); navigate('/history'); }} />
            <div style={{ height: 1, background: 'var(--rule)' }} />
            <MenuItem icon={Settings} label="Settings" onClick={() => { setOpen(false); navigate('/settings'); }} />
          </div>
        )}
      </div>
    );
  }

  // ── Logged-in mode ──────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="User menu"
        aria-expanded={open}
        style={{
          padding: 0, background: 'none', border: 'none', cursor: 'pointer',
          outline: open ? '2px solid var(--shu)' : '2px solid transparent',
          outlineOffset: 2,
        }}
      >
        <AvatarSquare src={userAvatar} initials={initials} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 220, background: 'var(--paper)', border: '1px solid var(--rule)',
          zIndex: 50,
        }}>
          {/* Identity header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--rule)' }}>
            <AvatarSquare src={userAvatar} initials={initials} size={32} />
            <div style={{ minWidth: 0 }}>
              <div className="tm-mincho" style={{ fontSize: 13, fontWeight: 600, color: 'var(--sumi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {userName}
              </div>
              <div className="tm-mono" style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--sumi-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 }}>
                {userEmail}
              </div>
            </div>
          </div>

          <MenuItem icon={Upload} label={parsedResume?.experience?.length ? 'Update résumé' : 'Upload résumé'} onClick={() => { setOpen(false); onNewResume?.(); }} />
          <div style={{ height: 1, background: 'var(--rule)' }} />
          <MenuItem icon={LayoutDashboard} label="Status board" onClick={() => { setOpen(false); navigate('/kanban'); }} />
          <MenuItem icon={ListChecks} label="Strike log" onClick={() => { setOpen(false); navigate('/strikes'); }} />
          <MenuItem icon={BarChart2} label="Match history" onClick={() => { setOpen(false); navigate('/history'); }} />
          <div style={{ height: 1, background: 'var(--rule)' }} />
          <MenuItem icon={Settings} label="Settings" onClick={() => { setOpen(false); navigate('/settings'); }} />
          <div style={{ height: 1, background: 'var(--rule)' }} />
          <MenuItem icon={LogOut} label="Sign Out" onClick={handleSignOut} danger />
        </div>
      )}
    </div>
  );
}
