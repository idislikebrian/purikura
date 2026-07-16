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

const moveCommand: EditorCommand = {
  type: 'editor-move-item',
  sessionId: SESSION_ID,
  itemId: 'sticker-1',
  x: 120,
  y: 140,
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
    const result = editor.apply({ ...stickerCommand, emoji: '✨' }, validContext);
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

  test('rejects invalid sticker values', () => {
    const editor = createEditor();
    const invalidCommands: EditorCommand[] = [
      { ...stickerCommand, x: Number.NaN },
      { ...stickerCommand, emoji: '' },
    ];
    for (const command of invalidCommands) {
      assert.equal(editor.apply(command, validContext).accepted, false);
    }
    assert.equal(editor.getSnapshot()?.revision, 0);
  });

  test('increments the revision after every accepted mutation', () => {
    const editor = createEditor();
    assert.equal(acceptedSnapshot(editor, stickerCommand).revision, 1);
    assert.equal(acceptedSnapshot(editor, {
      type: 'editor-select-item', sessionId: SESSION_ID, itemId: null,
    }).revision, 2);
  });

  test('moves an existing sticker and increments the revision', () => {
    const editor = createEditor();
    acceptedSnapshot(editor, stickerCommand);
    const snapshot = acceptedSnapshot(editor, moveCommand, {
      ...validContext,
      surface: 'int-secondary',
    });
    assert.equal(snapshot.revision, 2);
    assert.deepEqual(
      { x: snapshot.document.items[0]?.x, y: snapshot.document.items[0]?.y },
      { x: 120, y: 140 },
    );
  });

  test('rejects a move for the wrong session', () => {
    const editor = createEditor();
    acceptedSnapshot(editor, stickerCommand);
    const result = editor.apply({ ...moveCommand, sessionId: OTHER_SESSION_ID }, {
      ...validContext,
      surface: 'int-secondary',
    });
    assert.equal(result.accepted, false);
    assert.match(result.reason, /session/);
  });

  test('rejects a move in the wrong phase', () => {
    const editor = createEditor();
    acceptedSnapshot(editor, stickerCommand);
    const result = editor.apply(moveCommand, {
      ...validContext,
      phase: 'photo-review',
      surface: 'int-secondary',
    });
    assert.equal(result.accepted, false);
    assert.match(result.reason, /manipulate/);
  });

  test('rejects a move for a missing item', () => {
    const editor = createEditor();
    const result = editor.apply(moveCommand, { ...validContext, surface: 'int-secondary' });
    assert.equal(result.accepted, false);
    assert.match(result.reason, /does not exist/);
  });

  test('rejects a move with non-finite or out-of-bounds coordinates', () => {
    const editor = createEditor();
    acceptedSnapshot(editor, stickerCommand);
    for (const command of [
      { ...moveCommand, x: Number.NaN },
      { ...moveCommand, y: Number.POSITIVE_INFINITY },
      { ...moveCommand, x: -1 },
      { ...moveCommand, x: 361 },
      { ...moveCommand, y: 461 },
    ] as EditorCommand[]) {
      const result = editor.apply(command, { ...validContext, surface: 'int-secondary' });
      assert.equal(result.accepted, false);
      assert.match(result.reason, /coordinates/);
    }
    assert.equal(editor.getSnapshot()?.revision, 1);
  });

  test('rejects primary move commands and accepts secondary move commands', () => {
    const editor = createEditor();
    acceptedSnapshot(editor, stickerCommand);
    const primaryResult = editor.apply(moveCommand, validContext);
    assert.equal(primaryResult.accepted, false);
    assert.match(primaryResult.reason, /int-secondary/);

    const secondaryResult = editor.apply(moveCommand, { ...validContext, surface: 'int-secondary' });
    assert.equal(secondaryResult.accepted, true);
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

  test('a newly attached client recovers the moved canonical position', () => {
    const editor = new EditorState();
    const coordinator = new Coordinator(new MockAdapter(), false, editor);
    coordinator.start();
    coordinator.handleCommand('ext-touch', { type: 'register', name: 'Test User' });
    const initialMessages: WSMessageOutbound[] = [];
    coordinator.attachClient('int-primary', fakeSocket(initialMessages));
    const lifecycleMessage = initialMessages.find((message) => message.event.type === 'state-update');
    assert.ok(lifecycleMessage);
    assert.equal(lifecycleMessage.event.type, 'state-update');
    const activeSessionId = lifecycleMessage.event.state.activeSession?.id;
    assert.ok(activeSessionId);
    acceptedSnapshot(editor, { ...stickerCommand, sessionId: activeSessionId }, {
      activeSessionId,
      phase: 'manipulate',
      surface: 'int-primary',
    });
    acceptedSnapshot(editor, { ...moveCommand, sessionId: activeSessionId }, {
      activeSessionId,
      phase: 'manipulate',
      surface: 'int-secondary',
    });

    const sent: WSMessageOutbound[] = [];
    coordinator.attachClient('int-secondary', fakeSocket(sent));

    try {
      assert.equal(sent[0]?.event.type, 'state-update');
      assert.equal(sent[1]?.event.type, 'editor-snapshot');
      if (sent[0]?.event.type !== 'state-update' || sent[1]?.event.type !== 'editor-snapshot') {
        assert.fail('expected lifecycle state followed by editor snapshot');
      }
      assert.equal(sent[1].event.snapshot.sessionId, activeSessionId);
      assert.equal(sent[1].event.snapshot.revision, 2);
      assert.deepEqual(
        { x: sent[1].event.snapshot.document.items[0]?.x, y: sent[1].event.snapshot.document.items[0]?.y },
        { x: 120, y: 140 },
      );
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
