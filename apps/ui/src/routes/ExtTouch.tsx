import { useState } from 'react';
import { useCoordinator, useStore } from '../lib/coordinator-client.ts';
import { ScreenShell } from '../components/ScreenShell.tsx';

export function ExtTouch() {
  const { send } = useCoordinator('ext-touch');
  const state = useStore((s) => s.state);
  const [name, setName] = useState('');

  if (!state) return <ScreenShell><Loading /></ScreenShell>;

  if (state.serviceMode === 'suspended') {
    return <ScreenShell><Suspended /></ScreenShell>;
  }

  const isYourTurn = state.activeSession && state.phase === 'come-in';
  if (isYourTurn) {
    return (
      <ScreenShell>
        <ComeIn
          name={state.activeSession!.name}
          onEnter={() => send({ type: 'enter-booth' })}
        />
      </ScreenShell>
    );
  }

  const busy = state.activeSession !== null && state.phase !== 'idle';
  return (
    <ScreenShell>
      <RegisterView
        busy={busy}
        queueSize={state.queue.length}
        waitMs={state.estimatedWaitMs}
        name={name}
        setName={setName}
        onSubmit={() => {
          if (name.trim()) {
            send({ type: 'register', name });
            setName('');
          }
        }}
      />
    </ScreenShell>
  );
}

// ============================================================================

function Loading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 11 }}>
      connecting...
    </div>
  );
}

function Suspended() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', color: 'var(--text-dimmer)' }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>⊘</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Out of service</div>
      <div style={{ fontSize: 11, color: 'var(--text-dimmer)', fontFamily: 'var(--mono)' }}>Back soon</div>
    </div>
  );
}

function ComeIn({ name, onEnter }: { name: string; onEnter: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', background: 'linear-gradient(180deg, #082010, #000)', padding: 20 }}>
      <div style={{ fontSize: 64, color: 'var(--accent-good)', marginBottom: 12 }}>→</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent-good)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>{name}</div>
      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 16 }}>come on<br/>in!</div>
      <button
        onClick={onEnter}
        style={{ background: 'var(--accent-good)', color: '#000', border: 'none', padding: '14px 28px', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', marginTop: 20 }}
      >
        ▸ I'm going in
      </button>
    </div>
  );
}

function RegisterView({
  busy,
  queueSize,
  waitMs,
  name,
  setName,
  onSubmit,
}: {
  busy: boolean;
  queueSize: number;
  waitMs: number;
  name: string;
  setName: (n: string) => void;
  onSubmit: () => void;
}) {
  const mins = Math.max(1, Math.ceil(waitMs / 60_000));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20, background: busy ? 'radial-gradient(circle at 70% 30%, #2a1f0a, #000 60%)' : 'radial-gradient(circle at 30% 20%, #2a0a1f, #000 60%)' }}>
      {busy && (
        <div style={{ background: 'rgba(255, 170, 59, 0.1)', border: '1px solid var(--accent-warm)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent-warm)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-warm)' }} />
          Booth in use · ~{mins}m wait · {queueSize} in queue
        </div>
      )}
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 0.95, marginBottom: 16 }}>
        photo<br/><span style={{ color: 'var(--accent)' }}>booth.</span>
      </div>

      <div style={{ marginTop: 'auto', background: 'rgba(0,0,0,0.85)', border: '1px solid var(--line-bright)', padding: 14 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
          {busy ? 'Your name' : 'Step 1 · Your name'}
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="tap to type"
          maxLength={20}
          style={{
            width: '100%',
            background: 'var(--surface-2)',
            border: `1px solid ${name ? 'var(--accent)' : 'var(--line-bright)'}`,
            padding: 10,
            fontFamily: 'var(--mono)',
            fontSize: 14,
            color: name ? 'var(--accent)' : 'var(--text-dim)',
            marginBottom: 8,
            outline: 'none',
          }}
        />
        <button
          onClick={onSubmit}
          disabled={!name.trim()}
          style={{
            width: '100%',
            background: name.trim() ? 'var(--accent)' : 'var(--surface-2)',
            color: name.trim() ? '#000' : 'var(--text-dimmer)',
            border: 'none',
            padding: 12,
            fontFamily: 'var(--mono)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: name.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          ▸ {busy ? `Join queue · position ${queueSize + 1}` : 'Register'}
        </button>
      </div>
    </div>
  );
}
