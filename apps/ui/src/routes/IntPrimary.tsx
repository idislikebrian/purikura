import { useEffect, useRef, useState } from 'react';
import { useCoordinator, useStore, COORDINATOR_HTTP_URL } from '../lib/coordinator-client.ts';
import { ScreenShell } from '../components/ScreenShell.tsx';
import type { Command } from '@purikura/shared';

// Phases where the camera should be active
const CAMERA_PHASES = new Set([
  'welcome', 'photo-prep', 'photo-capture', 'photo-review',
  'manip-intro', 'manipulate', 'takeaway-info', 'completed',
]);

export function IntPrimary() {
  const { send } = useCoordinator('int-primary');
  const state = useStore((s) => s.state);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const cameraRequestedRef = useRef(false);

  // Request camera once the user is inside a phase that needs it.
  // Deferred so the browser permission prompt has context ("this site wants
  // to use your camera" while the welcome screen is showing).
  useEffect(() => {
    const phase = state?.phase;
    if (!phase || !CAMERA_PHASES.has(phase) || cameraRequestedRef.current) return;
    cameraRequestedRef.current = true;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', aspectRatio: { ideal: 4 / 5 } }, audio: false })
      .then((s) => setStream(s))
      .catch((err: Error) => setCameraError(err.message || 'camera permission denied'));
  }, [state?.phase]);

  useEffect(() => {
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, [stream]);

  if (cameraError) {
    return (
      <ScreenShell>
        <CameraError message={cameraError} />
      </ScreenShell>
    );
  }

  if (!state || !state.activeSession) {
    return (
      <ScreenShell>
        <Idle />
      </ScreenShell>
    );
  }

  const session = state.activeSession;

  switch (state.phase) {
    case 'welcome':
      return (
        <ScreenShell>
          <Welcome name={session.name} onReady={() => send({ type: 'start-experience' })} />
        </ScreenShell>
      );
    case 'photo-prep':
      return (
        <ScreenShell>
          <PhotoPrep stream={stream} onCapture={() => send({ type: 'capture-photo' })} />
        </ScreenShell>
      );
    case 'photo-capture':
      return (
        <ScreenShell>
          <PhotoCapture stream={stream} onCaptured={(url) => setCapturedUrl(url)} />
        </ScreenShell>
      );
    case 'photo-review':
      return (
        <ScreenShell>
          <PhotoReview
            capturedUrl={capturedUrl}
            onAccept={() => send({ type: 'photo-accept' })}
            onRedo={() => {
              setCapturedUrl(null);
              send({ type: 'photo-redo' });
            }}
          />
        </ScreenShell>
      );
    case 'manip-intro':
      return (
        <ScreenShell>
          <ManipIntro />
        </ScreenShell>
      );
    case 'manipulate':
      return (
        <ScreenShell>
          <Manipulate
            sessionId={session.id}
            onDone={() => send({ type: 'manip-done' })}
            send={send}
          />
        </ScreenShell>
      );
    case 'takeaway-info':
      return (
        <ScreenShell>
          <TakeawayInfo onExit={() => send({ type: 'exit-booth' })} />
        </ScreenShell>
      );
    default:
      return (
        <ScreenShell>
          <Idle />
        </ScreenShell>
      );
  }
}

// ============================================================================
// Phase components
// ============================================================================

function CameraError({ message }: { message: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 32, gap: 12, background: '#0a0005' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Camera error</div>
      <div style={{ fontSize: 14, color: 'var(--text)', textAlign: 'center', lineHeight: 1.5 }}>{message}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', textAlign: 'center', marginTop: 8 }}>check camera permissions and reload</div>
    </div>
  );
}

function Idle() {
  return <Centered title="standby" sub="waiting for an active session" />;
}

function Welcome({ name, onReady }: { name: string; onReady: () => void }) {
  return (
    <div style={panelStyle('linear-gradient(135deg, #1a0a2a, #000)')}>
      <Tag color="var(--accent-purple)">Welcome inside</Tag>
      <Title>
        hey<br /><span style={{ color: 'var(--accent)' }}>{name}</span>,<br />here's the deal.
      </Title>
      <VideoPlaceholder label="// demo · 0:18" />
      <PrimaryButton onClick={onReady}>▸ I'm ready</PrimaryButton>
    </div>
  );
}

function PhotoPrep({ stream, onCapture }: { stream: MediaStream | null; onCapture: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
  }, [stream]);

  return (
    <div style={{ ...panelStyle('#000'), padding: 0 }}>
      {/* live feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {/* framing guides */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: 16, left: 16, width: 28, height: 28, borderTop: '2px solid rgba(255,255,255,0.7)', borderLeft: '2px solid rgba(255,255,255,0.7)' }} />
        <div style={{ position: 'absolute', top: 16, right: 16, width: 28, height: 28, borderTop: '2px solid rgba(255,255,255,0.7)', borderRight: '2px solid rgba(255,255,255,0.7)' }} />
        <div style={{ position: 'absolute', bottom: 80, left: 16, width: 28, height: 28, borderBottom: '2px solid rgba(255,255,255,0.7)', borderLeft: '2px solid rgba(255,255,255,0.7)' }} />
        <div style={{ position: 'absolute', bottom: 80, right: 16, width: 28, height: 28, borderBottom: '2px solid rgba(255,255,255,0.7)', borderRight: '2px solid rgba(255,255,255,0.7)' }} />
      </div>
      <div style={{ position: 'absolute', top: 24, left: 0, right: 0, textAlign: 'center', zIndex: 3 }}>
        <Tag color="var(--accent-cool)">Get ready</Tag>
        <Title>find the frame</Title>
      </div>
      <div style={{ position: 'absolute', bottom: 24, left: 24, right: 24, zIndex: 3 }}>
        <PrimaryButton onClick={onCapture}>▸ Take photo</PrimaryButton>
      </div>
    </div>
  );
}

function PhotoCapture({ stream, onCaptured }: { stream: MediaStream | null; onCaptured: (url: string) => void }) {
  const countdown = useStore((s) => s.countdownRemaining);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasCapturedRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    if (countdown !== 0 || hasCapturedRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    hasCapturedRef.current = true;

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 500;
    const ctx = canvas.getContext('2d')!;

    // Crop center 4:5 region from whatever the webcam delivers
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const targetRatio = 4 / 5;
    const vRatio = vw / vh;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (vRatio > targetRatio) {
      sw = vh * targetRatio;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / targetRatio;
      sy = (vh - sh) / 2;
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 400, 500);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    onCaptured(dataUrl);

    fetch(`${COORDINATOR_HTTP_URL}/upload-photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoBlob: dataUrl }),
    }).catch((err) => console.error('[camera] upload failed', err));
  }, [countdown, onCaptured]);

  return (
    <div style={{ ...panelStyle('#000'), padding: 0, alignItems: 'center', justifyContent: 'center' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div style={{ position: 'relative', fontSize: 180, fontWeight: 700, color: '#fff', textShadow: '0 0 60px rgba(255, 59, 107, 0.8)', lineHeight: 1, zIndex: 3 }}>
        {countdown ?? 3}
      </div>
    </div>
  );
}

function PhotoReview({ capturedUrl, onAccept, onRedo }: { capturedUrl: string | null; onAccept: () => void; onRedo: () => void }) {
  return (
    <div style={panelStyle('#0a0a0a')}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <Tag color="var(--accent-warm)">Looks good?</Tag>
        <Title style={{ fontSize: 20 }}>your shot</Title>
      </div>
      <div style={{ flex: 1, margin: '8px 0', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {capturedUrl
          ? <img src={capturedUrl} alt="captured" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #4a2a1a, #1a2a4a)', border: '2px solid #fff' }} />
        }
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
        <button onClick={onRedo} style={{ padding: 14, fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', border: '1px solid var(--line-bright)', background: 'var(--surface-2)', color: 'var(--text)' }}>↺ Redo</button>
        <button onClick={onAccept} style={{ padding: 14, fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', border: 'none', background: 'var(--accent-good)', color: '#000' }}>✓ Accept</button>
      </div>
    </div>
  );
}

function ManipIntro() {
  return (
    <div style={panelStyle('linear-gradient(135deg, #2a0a2a, #000)')}>
      <Tag color="var(--accent-purple)">Phase 2</Tag>
      <Title>now make it <span style={{ color: 'var(--accent-purple)' }}>yours.</span></Title>
      <VideoPlaceholder />
    </div>
  );
}

// ============================================================================
// Emoji controller
// ============================================================================

const STICKER_OPTIONS = ['⭐', '❤️', '✨', '🌙', '🦋', '🌸', '💫', '🎀'];

function Manipulate({ sessionId, onDone, send }: { sessionId: string; onDone: () => void; send: (cmd: Command) => void }) {
  const connected = useStore((s) => s.connected);
  const editorSnapshot = useStore((s) => s.editorSnapshot);
  const isSynchronized = editorSnapshot?.sessionId === sessionId;
  const selectedItem = isSynchronized
    ? editorSnapshot.document.items.find((item) => item.id === editorSnapshot.selectedItemId) ?? null
    : null;

  const addSticker = (emoji: string) => {
    send({
      type: 'editor-add-sticker',
      sessionId,
      itemId: crypto.randomUUID(),
      emoji,
      x: 180,
      y: 230,
    });
  };

  const deleteSelected = () => {
    if (selectedItem) send({ type: 'editor-delete-item', sessionId, itemId: selectedItem.id });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '14px 16px 8px', display: 'flex', justifyContent: 'space-between' }}>
        <span>Screen 1 · Emoji controller</span>
        <span style={{ color: connected && isSynchronized ? 'var(--accent-good)' : 'var(--accent-warm)' }}>
          {connected ? (isSynchronized ? '● synced' : '◌ syncing') : '○ offline'}
        </span>
      </div>

      <div style={{ padding: '16px 20px 4px' }}>
        <Tag color="var(--accent-purple)">Decorate your photo</Tag>
        <Title style={{ marginTop: 8 }}>pick an emoji</Title>
        <div style={{ marginTop: 10, color: 'var(--text-dim)', fontSize: 12, lineHeight: 1.5 }}>
          Tap an emoji here, then move it on screen 2.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '18px 20px' }}>
        {STICKER_OPTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => addSticker(emoji)}
            disabled={!connected || !isSynchronized}
            style={{ aspectRatio: '1', fontSize: 34, background: 'var(--surface-2)', border: '1px solid var(--line-bright)', cursor: connected && isSynchronized ? 'pointer' : 'not-allowed', opacity: connected && isSynchronized ? 1 : 0.45 }}
          >
            {emoji}
          </button>
        ))}
      </div>

      <div style={{ margin: 'auto 20px 14px', padding: 14, border: `1px solid ${selectedItem ? 'var(--accent)' : 'var(--line)'}`, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Selected emoji</div>
          <div style={{ marginTop: 5, fontSize: 13, color: selectedItem ? 'var(--text)' : 'var(--text-dim)' }}>
            {selectedItem ? 'Ready to move or delete' : 'Tap an emoji on screen 2'}
          </div>
        </div>
        <div style={{ fontSize: 34, minWidth: 42, textAlign: 'center' }}>{selectedItem?.emoji ?? '—'}</div>
      </div>

      <div style={{ padding: '0 20px 20px' }}>
        <button
          onClick={deleteSelected}
          disabled={!selectedItem || !connected}
          style={{ width: '100%', padding: 12, marginBottom: 8, background: 'var(--surface-2)', color: selectedItem ? 'var(--accent-warm)' : 'var(--text-dimmer)', border: '1px solid var(--line)', fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', cursor: selectedItem && connected ? 'pointer' : 'not-allowed', opacity: selectedItem && connected ? 1 : 0.5 }}
        >
          Delete selected
        </button>
        <button
          onClick={onDone}
          style={{ width: '100%', padding: 12, background: 'var(--accent-good)', color: '#000', border: 'none', fontFamily: 'var(--display)', fontWeight: 600, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}
        >
          Done ▸
        </button>
      </div>
    </div>
  );
}

function TakeawayInfo({ onExit }: { onExit: () => void }) {
  return (
    <div style={panelStyle('linear-gradient(180deg, #082010, #000)')}>
      <Tag color="var(--accent-good)">All done</Tag>
      <Title>save your copy →</Title>
      <div style={{ background: '#fff', padding: 16, textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, background: 'repeating-conic-gradient(#000 0% 25%, #fff 0% 50%) 50% / 8px 8px', margin: '0 auto 8px', border: '4px solid #000' }} />
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#000', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>scan to save</div>
      </div>
      <PrimaryButton onClick={onExit}>▸ I'm leaving</PrimaryButton>
    </div>
  );
}

// ============================================================================
// Shared bits
// ============================================================================

const panelStyle = (bg: string): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  padding: 20,
  background: bg,
  position: 'relative',
  gap: 10,
});

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{children}</div>;
}

function Title({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.02em', ...style }}>{children}</div>;
}

function VideoPlaceholder({ label }: { label?: string }) {
  return (
    <div style={{ flex: 1, background: 'linear-gradient(135deg, #2a1a4a 0%, #1a2a3a 100%)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <span style={{ fontSize: 36, color: 'rgba(255,255,255,0.6)' }}>▶</span>
      {label && <div style={{ position: 'absolute', bottom: 8, left: 12, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>{label}</div>}
    </div>
  );
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: 'var(--accent)', color: '#000', border: 'none', padding: 16, fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}>{children}</button>
  );
}

function Centered({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
      <div style={{ fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}
