import type { ReactNode } from 'react';

export function ScreenShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', overflow: 'hidden' }}>
      <div style={{ width: 'min(100vw, calc(100vh * 9 / 16))', height: '100vh', maxHeight: 'calc(100vw * 16 / 9)', position: 'relative', background: '#000' }}>
        {children}
      </div>
    </div>
  );
}
