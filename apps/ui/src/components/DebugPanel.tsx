import { useState } from 'react';
import { useStore } from '../lib/coordinator-client.ts';

/**
 * DebugPanel — for development only.
 *
 * Lets you fire the hardware events you'd normally get from real sensors.
 * Hit ? key to toggle. Remove or env-guard for production builds.
 */

export function DebugPanel() {
  const [open, setOpen] = useState(false);
  const state = useStore((s) => s.state);
  const connected = useStore((s) => s.connected);

  if (typeof window === 'undefined') return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: 12,
          right: 12,
          background: 'rgba(0,0,0,0.8)',
          color: connected ? 'var(--accent-good)' : 'var(--accent-warm)',
          border: '1px solid var(--line)',
          padding: '4px 10px',
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '0.08em',
          cursor: 'pointer',
          zIndex: 9999,
        }}
      >
        {connected ? '●' : '○'} debug
      </button>
    );
  }

  const fire = async (path: string, body: any) => {
    await fetch(`http://${window.location.hostname}:3001${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );

  const Btn = ({ onClick, children, tone = 'normal' }: { onClick: () => void; children: React.ReactNode; tone?: 'normal' | 'good' | 'warn' }) => (
    <button
      onClick={onClick}
      style={{
        background: tone === 'good' ? 'var(--accent-good)' : tone === 'warn' ? 'var(--accent-warm)' : 'var(--surface-2)',
        color: tone !== 'normal' ? '#000' : 'var(--text)',
        border: '1px solid var(--line-bright)',
        padding: '6px 10px',
        fontFamily: 'var(--mono)',
        fontSize: 10,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        width: 280,
        background: 'rgba(10, 10, 10, 0.95)',
        border: '1px solid var(--line-bright)',
        padding: 16,
        zIndex: 9999,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>// debug</span>
        <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>

      <Section title="Status">
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: connected ? 'var(--accent-good)' : 'var(--accent-warm)' }}>
          coord {connected ? 'connected' : 'disconnected'}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
          phase: {state?.phase ?? '—'}
        </div>
      </Section>

      <Section title="Door sensor">
        <Btn onClick={() => fire('/debug/door', { open: true })} tone="good">Open door</Btn>
        <Btn onClick={() => fire('/debug/door', { open: false })}>Close door</Btn>
      </Section>

      <Section title="Printer">
        <Btn onClick={() => fire('/debug/printer', { online: true })} tone="good">Online</Btn>
        <Btn onClick={() => fire('/debug/printer', { online: false })} tone="warn">Offline</Btn>
      </Section>
    </div>
  );
}
