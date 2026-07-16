import { useEffect, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Text as KonvaText } from 'react-konva';
import { useCoordinator, useStore } from '../lib/coordinator-client.ts';
import { ScreenShell } from '../components/ScreenShell.tsx';
import { EDITOR_CANVAS_HEIGHT, EDITOR_CANVAS_WIDTH } from '@purikura/shared';

export function IntSecondary() {
  useCoordinator('int-secondary');
  const state = useStore((s) => s.state);
  const editorSnapshot = useStore((s) => s.editorSnapshot);

  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const photoBlob = state?.activeSession?.photoBlob ?? null;
  const items = editorSnapshot && editorSnapshot.sessionId === state?.activeSession?.id
    ? editorSnapshot.document.items
    : [];

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
          <Stage width={EDITOR_CANVAS_WIDTH} height={EDITOR_CANVAS_HEIGHT} listening={false}>
            <Layer>
              {bgImage
                ? <KonvaImage image={bgImage} width={EDITOR_CANVAS_WIDTH} height={EDITOR_CANVAS_HEIGHT} />
                : <Rect width={EDITOR_CANVAS_WIDTH} height={EDITOR_CANVAS_HEIGHT} fill="#1a1a2e" />
              }
            </Layer>
            <Layer>
              {items.map((item) => item.type === 'sticker' ? (
                <KonvaText key={item.id} text={item.emoji} x={item.x} y={item.y} rotation={item.rotation} scaleX={item.scale} scaleY={item.scale} fontSize={40} />
              ) : (
                <KonvaText key={item.id} text={item.content} x={item.x} y={item.y} rotation={item.rotation} scaleX={item.scale} scaleY={item.scale} fontSize={22} fill={item.color} fontStyle="bold" />
              ))}
            </Layer>
          </Stage>
        </div>
      </div>
    </ScreenShell>
  );
}
