import { useCoordinator, useStore } from '../lib/coordinator-client.ts';

export function ExtTv() {
  useCoordinator('ext-tv');
  const state = useStore((s) => s.state);

  if (!state) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: 'var(--text-dimmer)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        connecting...
      </div>
    );
  }

  const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const totalWaiting = state.queue.length;
  const inBoothName = state.activeSession?.name;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', padding: 24, background: '#0a0a0a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, background: 'var(--accent)' }} />
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>photobooth.</div>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--text-dim)' }}>{time}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, flex: 1 }}>
        {/* Attract */}
        <div style={{ background: 'linear-gradient(135deg, #2a0a1f 0%, #0a1f2a 100%)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, fontWeight: 700, lineHeight: 0.9, letterSpacing: '-0.03em' }}>
              step in.<br/><span style={{ color: 'var(--accent)' }}>leave weird.</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 16 }}>
              attract loop
            </div>
          </div>
        </div>

        {/* Queue */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
            Queue · {totalWaiting} waiting
          </div>

          {inBoothName && (
            <QueueItem name={inBoothName} status="● in booth" tone="live" />
          )}

          {state.queue.map((s, i) => (
            <QueueItem
              key={s.id}
              name={s.name}
              status={i === 0 ? `next · ~${Math.ceil((state.estimatedWaitMs * 0.5) / 60000)}m` : `~${Math.ceil((state.estimatedWaitMs * (i + 1) / state.queue.length) / 60000)}m`}
              tone={i === 0 ? 'next' : 'normal'}
            />
          ))}

          {totalWaiting === 0 && !inBoothName && (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-dimmer)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              No queue · jump in
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QueueItem({ name, status, tone }: { name: string; status: string; tone: 'normal' | 'next' | 'live' }) {
  const borderColor = tone === 'live' ? 'var(--accent-good)' : tone === 'next' ? 'var(--accent)' : 'var(--line-bright)';
  const bg = tone === 'live' ? 'rgba(92, 217, 122, 0.08)' : tone === 'next' ? 'rgba(255, 59, 107, 0.08)' : 'var(--surface)';
  const statusColor = tone === 'live' ? 'var(--accent-good)' : tone === 'next' ? 'var(--accent)' : 'var(--text-dim)';
  return (
    <div style={{ background: bg, borderLeft: `3px solid ${borderColor}`, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{name}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: statusColor, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{status}</span>
    </div>
  );
}
