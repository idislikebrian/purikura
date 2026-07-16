import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { WebSocket } from 'ws';
import { MockAdapter } from '@purikura/hardware-adapter';
import type { EditorSnapshot, WSMessageOutbound } from '@purikura/shared';
import { Coordinator } from './coordinator.js';
import { EditorState, type EditorCommand, type EditorCommandContext } from './editor-state.js';

const SESSION_ID = 'session-1';
const OTHER_SESSION_ID = 'session-2';

const validContext: EditorCommandContext = {
  activeSessionId: SESSION_ID,
  phase: 'manipulate',
  surface: 'int-primary',
};

const stickerCommand: EditorCommand = {
  type: 'editor-add-sticker',
  sessionId: SESSION_ID,
  itemId: 'sticker-1',
  emoji: '⭐',
  x: 180,
  y: 230,
};

const textCommand: EditorCommand = {
  type: 'editor-add-text',
  sessionId: SESSION_ID,
  itemId: 'text-1',
  content: 'hello',
  x: 160,
  y: 230,
  color: '#ffffff',
};

function createEditor(): EditorState {
  const editor = new EditorState();
  editor.syncSession(SESSION_ID);
  return editor;
}

function acceptedSnapshot(editor: EditorState, command: EditorCommand, context = validContext): EditorSnapshot {
  const result = editor.apply(command, context);
  if (!result.accepted) assert.fail(result.reason);
  return result.snapshot;
}

function fakeSocket(sent: WSMessageOutbound[]): WebSocket {
  return {
    readyState: 1,
    send(payload: string) { sent.push(JSON.parse(payload) as WSMessageOutbound); },
  } as unknown as WebSocket;
}

describe('EditorState', () => {
  test('initializes an empty 400x500 document', () => {
    const snapshot = createEditor().getSnapshot();
    assert.deepEqual(snapshot, {
      sessionId: SESSION_ID,
      revision: 0,
      document: { width: 400, height: 500, items: [] },
      selectedItemId: null,
    });
  });

  test('adds a sticker and automatically selects it', () => {
    const snapshot = acceptedSnapshot(createEditor(), stickerCommand);
    assert.equal(snapshot.document.items.length, 1);
    assert.deepEqual(snapshot.document.items[0], {
      type: 'sticker', id: 'sticker-1', emoji: '⭐', x: 180, y: 230, rotation: 0, scale: 1,
    });
    assert.equal(snapshot.selectedItemId, 'sticker-1');
  });

  test('adds trimmed text and automatically selects it', () => {
    const editor = createEditor();
    const snapshot = acceptedSnapshot(editor, { ...textCommand, content: '  hello  ' });
    assert.deepEqual(snapshot.document.items[0], {
      type: 'text', id: 'text-1', content: 'hello', x: 160, y: 230,
      rotation: 0, scale: 1, color: '#ffffff',
    });
    assert.equal(snapshot.selectedItemId, 'text-1');
  });

  test('selects and deselects an existing item', () => {
    const editor = createEditor();
    acceptedSnapshot(editor, stickerCommand);
    let snapshot = acceptedSnapshot(editor, {
      type: 'editor-select-item', sessionId: SESSION_ID, itemId: 'sticker-1',
    });
    assert.equal(snapshot.selectedItemId, 'sticker-1');
    snapshot = acceptedSnapshot(editor, {
      type: 'editor-select-item', sessionId: SESSION_ID, itemId: null,
    });
    assert.equal(snapshot.selectedItemId, null);
  });

  test('deletes an item and clears its selection', () => {
    const editor = createEditor();
    acceptedSnapshot(editor, stickerCommand);
    const snapshot = acceptedSnapshot(editor, {
      type: 'editor-delete-item', sessionId: SESSION_ID, itemId: 'sticker-1',
    });
    assert.deepEqual(snapshot.document.items, []);
    assert.equal(snapshot.selectedItemId, null);
  });

  test('rejects selection and deletion of a missing target', () => {
    const editor = createEditor();
    for (const command of [
      { type: 'editor-select-item', sessionId: SESSION_ID, itemId: 'missing' },
      { type: 'editor-delete-item', sessionId: SESSION_ID, itemId: 'missing' },
    ] as EditorCommand[]) {
      const result = editor.apply(command, validContext);
      assert.equal(result.accepted, false);
      assert.match(result.reason, /does not exist/);
    }
    assert.equal(editor.getSnapshot()?.revision, 0);
  });

  test('rejects a command for the wrong session', () => {
    const result = createEditor().apply(
      { ...stickerCommand, sessionId: OTHER_SESSION_ID },
      validContext,
    );
    assert.equal(result.accepted, false);
    assert.match(result.reason, /session/);
  });

  test('rejects a command when there is no active session', () => {
    const editor = new EditorState();
    const result = editor.apply(stickerCommand, {
      ...validContext,
      activeSessionId: null,
    });
    assert.equal(result.accepted, false);
    assert.match(result.reason, /no active session/);
  });

  test('rejects a duplicate item id without incrementing the revision', () => {
    const editor = createEditor();
    acceptedSnapshot(editor, stickerCommand);
    const result = editor.apply({ ...textCommand, itemId: stickerCommand.itemId }, validContext);
    assert.equal(result.accepted, false);
    assert.match(result.reason, /duplicate/);
    assert.equal(editor.getSnapshot()?.revision, 1);
  });

  test('rejects a command in the wrong phase', () => {
    const result = createEditor().apply(stickerCommand, { ...validContext, phase: 'photo-review' });
    assert.equal(result.accepted, false);
    assert.match(result.reason, /manipulate/);
  });

  test('rejects a command from an unauthorized surface', () => {
    const result = createEditor().apply(stickerCommand, { ...validContext, surface: 'ext-touch' });
    assert.equal(result.accepted, false);
    assert.match(result.reason, /not authorized/);
  });

  test('accepts an editor command from the secondary surface', () => {
    const result = createEditor().apply(stickerCommand, {
      ...validContext,
      surface: 'int-secondary',
    });
    assert.equal(result.accepted, true);
  });

  test('rejects invalid numeric and text values', () => {
    const editor = createEditor();
    const invalidCommands: EditorCommand[] = [
      { ...stickerCommand, x: Number.NaN },
      { ...stickerCommand, emoji: '' },
      { ...textCommand, content: '   ' },
      { ...textCommand, color: 'white' },
    ];
    for (const command of invalidCommands) {
      assert.equal(editor.apply(command, validContext).accepted, false);
    }
    assert.equal(editor.getSnapshot()?.revision, 0);
  });

  test('increments the revision after every accepted mutation', () => {
    const editor = createEditor();
    assert.equal(acceptedSnapshot(editor, stickerCommand).revision, 1);
    assert.equal(acceptedSnapshot(editor, textCommand).revision, 2);
    assert.equal(acceptedSnapshot(editor, {
      type: 'editor-select-item', sessionId: SESSION_ID, itemId: null,
    }).revision, 3);
  });

  test('resets the document, selection, and revision for a new session', () => {
    const editor = createEditor();
    acceptedSnapshot(editor, stickerCommand);
    const snapshot = editor.syncSession(OTHER_SESSION_ID);
    assert.deepEqual(snapshot, {
      sessionId: OTHER_SESSION_ID,
      revision: 0,
      document: { width: 400, height: 500, items: [] },
      selectedItemId: null,
    });
  });

  test('sends matching lifecycle state then editor snapshot to a newly attached internal client', () => {
    const coordinator = new Coordinator(new MockAdapter());
    coordinator.start();
    coordinator.handleCommand('ext-touch', { type: 'register', name: 'Test User' });
    const sent: WSMessageOutbound[] = [];
    coordinator.attachClient('int-secondary', fakeSocket(sent));

    try {
      assert.equal(sent[0]?.event.type, 'state-update');
      assert.equal(sent[1]?.event.type, 'editor-snapshot');
      if (sent[0]?.event.type !== 'state-update' || sent[1]?.event.type !== 'editor-snapshot') {
        assert.fail('expected lifecycle state followed by editor snapshot');
      }
      const activeSessionId = sent[0].event.state.activeSession?.id;
      assert.ok(activeSessionId);
      assert.equal(sent[1].event.snapshot.sessionId, activeSessionId);
      assert.equal(sent[1].event.snapshot.revision, 0);
    } finally {
      coordinator.stop();
    }
  });

  test('does not broadcast an editor snapshot for a rejected command', () => {
    const coordinator = new Coordinator(new MockAdapter());
    coordinator.start();
    const sent: WSMessageOutbound[] = [];
    coordinator.attachClient('int-primary', fakeSocket(sent));
    sent.length = 0;

    try {
      coordinator.handleCommand('int-primary', stickerCommand);
      assert.equal(sent.some((message) => message.event.type === 'editor-snapshot'), false);
      assert.equal(sent.some((message) => message.event.type === 'error'), true);
    } finally {
      coordinator.stop();
    }
  });
});
