import { useCoordinator, useStore } from '../lib/coordinator-client.ts';

export function Takeaway() {
  useCoordinator('takeaway');
  const state = useStore((s) => s.state);

  if (!state) return null;

  return (
    <div style={{ height: '100vh', display: 'flex', padding: 24, background: '#0a0a0a', gap: 20 }}>
      <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
          Recent prints · Scan to save
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 10, flex: 1 }}>
          {Array.from({ length: 6 }).map((_, i) => {
            const session = state.recentSessions[i];
            if (!session) {
              return (
                <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--line)', opacity: 0.3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dimmer)' }}>—</span>
                </div>
              );
            }
            const fresh = i === 0;
            const elapsed = Date.now() - (session.completedAt ?? Date.now());
            const ago = elapsed < 60000 ? 'just now' : `${Math.floor(elapsed / 60000)}m ago`;
            return (
              <div key={session.id} style={{ background: fresh ? 'rgba(92, 217, 122, 0.05)' : 'var(--surface)', border: `1px solid ${fresh ? 'var(--accent-good)' : 'var(--line)'}`, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{session.name}</div>
                <div style={{ flex: 1, background: 'repeating-conic-gradient(#fff 0% 25%, #000 0% 50%) 50% / 6px 6px', border: '2px solid #fff', minHeight: 50 }} />
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>{ago}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
          Print queue · {state.printerOnline ? 'online' : '⚠ offline'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          {state.printQueue.length === 0 && (
            <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-dimmer)', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              No jobs
            </div>
          )}
          {state.printQueue.map((job) => {
            const printing = job.status === 'printing';
            const done = job.status === 'ready';
            return (
              <div key={job.id} style={{ background: 'var(--surface)', borderLeft: `3px solid ${printing ? 'var(--accent-warm)' : done ? 'var(--accent-good)' : 'var(--line-bright)'}`, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: done ? 0.6 : 1 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{job.userName}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: printing ? 'var(--accent-warm)' : done ? 'var(--accent-good)' : 'var(--text-dim)' }}>
                  {printing ? '● printing' : done ? '✓ ready' : 'waiting'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
