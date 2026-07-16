import {
  EDITOR_CANVAS_HEIGHT,
  EDITOR_CANVAS_WIDTH,
  EDITOR_STICKER_SIZE,
  type Command,
  type EditorDocument,
  type EditorSnapshot,
  type Phase,
  type Surface,
} from '@purikura/shared';

export type EditorCommand = Extract<Command, { type: `editor-${string}` }>;

export interface EditorCommandContext {
  activeSessionId: string | null;
  phase: Phase;
  surface: Surface;
}

export type EditorCommandResult =
  | { accepted: true; snapshot: EditorSnapshot }
  | { accepted: false; reason: string };

const AUTHORIZED_SURFACES = new Set<Surface>(['int-primary', 'int-secondary']);
const MAX_ITEM_ID_LENGTH = 128;
const MAX_STICKER_LENGTH = 32;

export function createEmptyEditorDocument(): EditorDocument {
  return {
    width: EDITOR_CANVAS_WIDTH,
    height: EDITOR_CANVAS_HEIGHT,
    items: [],
  };
}

function validId(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ITEM_ID_LENGTH;
}

function validStickerPosition(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y)
    && x >= 0 && x <= EDITOR_CANVAS_WIDTH - EDITOR_STICKER_SIZE
    && y >= 0 && y <= EDITOR_CANVAS_HEIGHT - EDITOR_STICKER_SIZE;
}

function assertNever(command: never): never {
  throw new Error(`unhandled editor command: ${JSON.stringify(command)}`);
}

export class EditorState {
  private snapshot: EditorSnapshot | null = null;

  syncSession(sessionId: string | null): EditorSnapshot | null {
    if (sessionId === null) {
      this.snapshot = null;
      return null;
    }

    if (this.snapshot?.sessionId !== sessionId) {
      this.snapshot = {
        sessionId,
        revision: 0,
        document: createEmptyEditorDocument(),
        selectedItemId: null,
      };
    }

    return this.getSnapshot();
  }

  getSnapshot(): EditorSnapshot | null {
    return this.snapshot ? structuredClone(this.snapshot) : null;
  }

  apply(command: EditorCommand, context: EditorCommandContext): EditorCommandResult {
    if (!context.activeSessionId || !this.snapshot) {
      return { accepted: false, reason: 'no active session' };
    }
    if (command.sessionId !== context.activeSessionId || this.snapshot.sessionId !== context.activeSessionId) {
      return { accepted: false, reason: 'session does not match the active session' };
    }
    if (context.phase !== 'manipulate') {
      return { accepted: false, reason: 'editor commands are only accepted during manipulate' };
    }
    if (!AUTHORIZED_SURFACES.has(context.surface)) {
      return { accepted: false, reason: 'surface is not authorized to edit' };
    }

    const next = structuredClone(this.snapshot);
    const items = next.document.items;

    switch (command.type) {
      case 'editor-add-sticker': {
        if (context.surface !== 'int-primary') {
          return { accepted: false, reason: 'only int-primary may add stickers' };
        }
        if (!validId(command.itemId) || items.some((item) => item.id === command.itemId)) {
          return { accepted: false, reason: 'invalid or duplicate item id' };
        }
        if (typeof command.emoji !== 'string' || command.emoji.trim().length === 0 || command.emoji.length > MAX_STICKER_LENGTH) {
          return { accepted: false, reason: 'invalid sticker text' };
        }
        if (!validStickerPosition(command.x, command.y)) {
          return { accepted: false, reason: 'invalid sticker coordinates' };
        }
        items.push({
          type: 'sticker',
          id: command.itemId,
          emoji: command.emoji,
          x: command.x,
          y: command.y,
          rotation: 0,
          scale: 1,
        });
        next.selectedItemId = command.itemId;
        break;
      }

      case 'editor-select-item':
        if (command.itemId !== null && !items.some((item) => item.id === command.itemId)) {
          return { accepted: false, reason: 'target item does not exist' };
        }
        next.selectedItemId = command.itemId;
        break;

      case 'editor-delete-item': {
        const index = items.findIndex((item) => item.id === command.itemId);
        if (index === -1) {
          return { accepted: false, reason: 'target item does not exist' };
        }
        items.splice(index, 1);
        if (next.selectedItemId === command.itemId) next.selectedItemId = null;
        break;
      }

      case 'editor-move-item': {
        if (context.surface !== 'int-secondary') {
          return { accepted: false, reason: 'only int-secondary may move stickers' };
        }
        const item = items.find((candidate) => candidate.id === command.itemId);
        if (!item) {
          return { accepted: false, reason: 'target item does not exist' };
        }
        if (!validStickerPosition(command.x, command.y)) {
          return { accepted: false, reason: 'invalid move coordinates' };
        }
        item.x = command.x;
        item.y = command.y;
        break;
      }

      default:
        return assertNever(command);
    }

    next.revision += 1;
    this.snapshot = next;
    return { accepted: true, snapshot: this.getSnapshot()! };
  }
}
