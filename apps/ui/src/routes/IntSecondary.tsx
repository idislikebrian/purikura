import { useEffect, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Text as KonvaText } from 'react-konva';
import { useCoordinator, useStore } from '../lib/coordinator-client.ts';
import { ScreenShell } from '../components/ScreenShell.tsx';

export function IntSecondary() {
  useCoordinator('int-secondary');
  const state = useStore((s) => s.state);
  const canvasState = useStore((s) => s.canvasState);

  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const photoBlob = state?.activeSession?.photoBlob ?? null;

  useEffect(() => {
    if (!photoBlob) { setBgImage(null); return; }
    const img = new window.Image();
    img.src = photoBlob;
    img.onload = () => setBgImage(img);
  }, [photoBlob]);

  if (!state || !state.activeSession || state.phase !== 'manipulate') {
    return (
      <ScreenShell>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dimmer)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          screen 2 · standby
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 16px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Screen 2 · Mirror</span>
          <span style={{ color: 'var(--accent-cool)' }}>⇄ live</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <Stage width={400} height={500} listening={false}>
            <Layer>
              {bgImage
                ? <KonvaImage image={bgImage} width={400} height={500} />
                : <Rect width={400} height={500} fill="#1a1a2e" />
              }
            </Layer>
            <Layer>
              {canvasState.stickers.map((s) => (
                <KonvaText key={s.id} text={s.emoji} x={s.x} y={s.y} fontSize={40} />
              ))}
              {canvasState.texts.map((t) => (
                <KonvaText key={t.id} text={t.content} x={t.x} y={t.y} fontSize={22} fill={t.color} fontStyle="bold" />
              ))}
            </Layer>
          </Stage>
        </div>
      </div>
    </ScreenShell>
  );
}
