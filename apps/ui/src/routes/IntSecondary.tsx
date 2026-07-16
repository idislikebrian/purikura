import { useEffect, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Text as KonvaText } from 'react-konva';
import { useCoordinator, useStore } from '../lib/coordinator-client.ts';
import { ScreenShell } from '../components/ScreenShell.tsx';
import {
  EDITOR_CANVAS_HEIGHT,
  EDITOR_CANVAS_WIDTH,
  EDITOR_STICKER_SIZE,
} from '@purikura/shared';

interface LocalDrag {
  itemId: string;
  x: number;
  y: number;
  awaitingSnapshot: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clampPosition = (x: number, y: number) => ({
  x: clamp(x, 0, EDITOR_CANVAS_WIDTH - EDITOR_STICKER_SIZE),
  y: clamp(y, 0, EDITOR_CANVAS_HEIGHT - EDITOR_STICKER_SIZE),
});

export function IntSecondary() {
  const { send } = useCoordinator('int-secondary');
  const connected = useStore((s) => s.connected);
  const state = useStore((s) => s.state);
  const editorSnapshot = useStore((s) => s.editorSnapshot);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [localDrag, setLocalDrag] = useState<LocalDrag | null>(null);

  const sessionId = state?.activeSession?.id ?? null;
  const photoBlob = state?.activeSession?.photoBlob ?? null;
  const synchronizedSnapshot = editorSnapshot && editorSnapshot.sessionId === sessionId
    ? editorSnapshot
    : null;
  const items = synchronizedSnapshot?.document.items ?? [];
  const selectedItemId = synchronizedSnapshot?.selectedItemId ?? null;

  useEffect(() => {
    if (!photoBlob) { setBgImage(null); return; }
    const img = new window.Image();
    img.src = photoBlob;
    img.onload = () => setBgImage(img);
  }, [photoBlob]);

  useEffect(() => {
    setLocalDrag((current) => {
      if (!current) return null;
      if (!connected || !synchronizedSnapshot) return null;
      const canonicalItem = synchronizedSnapshot.document.items.find((item) => item.id === current.itemId);
      if (!canonicalItem) return null;
      if (
        current.awaitingSnapshot
        && canonicalItem.x === current.x
        && canonicalItem.y === current.y
      ) return null;
      return current;
    });
  }, [connected, synchronizedSnapshot]);

  if (!state || !state.activeSession || state.phase !== 'manipulate') {
    return (
      <ScreenShell>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dimmer)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          screen 2 · standby
        </div>
      </ScreenShell>
    );
  }

  const selectItem = (itemId: string | null) => {
    if (connected && synchronizedSnapshot) {
      send({ type: 'editor-select-item', sessionId: state.activeSession!.id, itemId });
    }
  };

  return (
    <ScreenShell>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 16px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Screen 2 · Touch canvas</span>
          <span style={{ color: connected && synchronizedSnapshot ? 'var(--accent-good)' : 'var(--accent-warm)' }}>
            {connected ? (synchronizedSnapshot ? '● synced' : '◌ syncing') : '○ offline'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, touchAction: 'none', overflow: 'hidden' }}>
          <Stage width={EDITOR_CANVAS_WIDTH} height={EDITOR_CANVAS_HEIGHT}>
            <Layer>
              {bgImage
                ? <KonvaImage image={bgImage} width={EDITOR_CANVAS_WIDTH} height={EDITOR_CANVAS_HEIGHT} onClick={() => selectItem(null)} onTap={() => selectItem(null)} />
                : <Rect width={EDITOR_CANVAS_WIDTH} height={EDITOR_CANVAS_HEIGHT} fill="#1a1a2e" onClick={() => selectItem(null)} onTap={() => selectItem(null)} />
              }
            </Layer>
            <Layer>
              {items.map((item) => {
                const displayedPosition = localDrag?.itemId === item.id ? localDrag : item;
                const selected = selectedItemId === item.id;
                return (
                  <KonvaText
                    key={item.id}
                    text={item.emoji}
                    x={displayedPosition.x}
                    y={displayedPosition.y}
                    rotation={item.rotation}
                    scaleX={item.scale}
                    scaleY={item.scale}
                    fontSize={EDITOR_STICKER_SIZE}
                    draggable={connected && Boolean(synchronizedSnapshot)}
                    dragBoundFunc={(position) => clampPosition(position.x, position.y)}
                    shadowColor={selected ? '#ff3b6b' : undefined}
                    shadowBlur={selected ? 12 : 0}
                    shadowOpacity={selected ? 1 : 0}
                    onClick={() => selectItem(item.id)}
                    onTap={() => selectItem(item.id)}
                    onDragStart={(event) => {
                      const position = clampPosition(event.target.x(), event.target.y());
                      setLocalDrag({ itemId: item.id, ...position, awaitingSnapshot: false });
                      selectItem(item.id);
                    }}
                    onDragMove={(event) => {
                      const position = clampPosition(event.target.x(), event.target.y());
                      setLocalDrag({ itemId: item.id, ...position, awaitingSnapshot: false });
                    }}
                    onDragEnd={(event) => {
                      const position = clampPosition(event.target.x(), event.target.y());
                      event.target.position(position);
                      setLocalDrag({ itemId: item.id, ...position, awaitingSnapshot: true });
                      send({
                        type: 'editor-move-item',
                        sessionId: state.activeSession!.id,
                        itemId: item.id,
                        ...position,
                      });
                    }}
                  />
                );
              })}
            </Layer>
          </Stage>
        </div>
      </div>
    </ScreenShell>
  );
}
