import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

import { ExtTouch } from './routes/ExtTouch.tsx';
import { ExtTv } from './routes/ExtTv.tsx';
import { IntPrimary } from './routes/IntPrimary.tsx';
import { IntSecondary } from './routes/IntSecondary.tsx';
import { Takeaway } from './routes/Takeaway.tsx';
import { DebugPanel } from './components/DebugPanel.tsx';

function Index() {
  const linkStyle: React.CSSProperties = {
    display: 'block',
    padding: '16px 20px',
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    color: 'var(--text)',
    textDecoration: 'none',
    fontFamily: 'var(--mono)',
    fontSize: 13,
    letterSpacing: '0.04em',
  };
  return (
    <div style={{ padding: 32, maxWidth: 600 }}>
      <h1 style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>// purikura.dev</h1>
      <p style={{ fontSize: 22, fontWeight: 600, marginBottom: 24, letterSpacing: '-0.02em' }}>Surface routes</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link to="/ext-touch" style={linkStyle}>/ext-touch · External touchscreen (registration)</Link>
        <Link to="/ext-tv" style={linkStyle}>/ext-tv · External TV (queue + attract)</Link>
        <Link to="/int-primary" style={linkStyle}>/int-primary · Internal primary (camera + canvas)</Link>
        <Link to="/int-secondary" style={linkStyle}>/int-secondary · Internal secondary (keyboard / mirror)</Link>
        <Link to="/takeaway" style={linkStyle}>/takeaway · Takeaway display (recent + print queue)</Link>
      </div>
      <p style={{ marginTop: 32, fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
        Open each in its own tab to simulate the 5-display setup. Use the debug panel (bottom-right) to fire hardware events.
      </p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/ext-touch" element={<ExtTouch />} />
        <Route path="/ext-tv" element={<ExtTv />} />
        <Route path="/int-primary" element={<IntPrimary />} />
        <Route path="/int-secondary" element={<IntSecondary />} />
        <Route path="/takeaway" element={<Takeaway />} />
      </Routes>
      <DebugPanel />
    </BrowserRouter>
  </React.StrictMode>
);
