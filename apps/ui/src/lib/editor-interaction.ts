import type { Command, EditorSnapshot } from '@purikura/shared';
import type { ConnectionStatus } from './coordinator-store.ts';

export type EditorMoveCommand = Extract<Command, { type: 'editor-move-item' }>;

export function isEditorInteractive(
  connectionStatus: ConnectionStatus,
  activeSessionId: string | null,
  snapshot: EditorSnapshot | null,
): boolean {
  return connectionStatus === 'connected'
    && activeSessionId !== null
    && snapshot?.sessionId === activeSessionId;
}

export function createEditorMoveCommand(
  sessionId: string,
  itemId: string,
  x: number,
  y: number,
): EditorMoveCommand {
  return { type: 'editor-move-item', sessionId, itemId, x, y };
}
