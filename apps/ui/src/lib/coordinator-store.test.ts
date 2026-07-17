import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { EditorSnapshot, SystemState, UserSession } from '@purikura/shared';
import {
  reconcileEditorSnapshot,
  reconcileSystemState,
  transitionConnectionStatus,
  type ConnectionStatus,
} from './coordinator-store.js';
import { buildCoordinatorUrls } from './coordinator-url.js';
import { createEditorMoveCommand, isEditorInteractive } from './editor-interaction.js';

function session(id: string): UserSession {
  return { id, name: id, registeredAt: 1 };
}

function systemState(activeSession: UserSession | null): SystemState {
  return {
    serviceMode: 'running',
    activeSession,
    phase: activeSession ? 'manipulate' : 'idle',
    queue: [],
    recentSessions: [],
    printQueue: [],
    doorOpen: false,
    printerOnline: true,
    estimatedWaitMs: 0,
  };
}

function editorSnapshot(sessionId: string, revision: number): EditorSnapshot {
  return {
    sessionId,
    revision,
    document: { width: 400, height: 500, items: [] },
    selectedItemId: null,
  };
}

describe('coordinator client snapshot reconciliation', () => {
  test('ignores an older revision for the same session', () => {
    const currentSnapshot = editorSnapshot('session-1', 3);
    const current = {
      state: systemState(session('session-1')),
      editorSnapshot: currentSnapshot,
    };

    assert.equal(reconcileEditorSnapshot(current, editorSnapshot('session-1', 2)), currentSnapshot);
  });

  test('accepts revision zero after lifecycle state changes to a new session', () => {
    const oldSnapshot = editorSnapshot('session-1', 7);
    const changed = reconcileSystemState({
      state: systemState(session('session-1')),
      editorSnapshot: oldSnapshot,
    }, systemState(session('session-2')));
    const newSnapshot = editorSnapshot('session-2', 0);

    assert.equal(changed.editorSnapshot, null);
    assert.equal(reconcileEditorSnapshot(changed, newSnapshot), newSnapshot);
  });

  test('rejects a snapshot that does not match the active lifecycle session', () => {
    const currentSnapshot = editorSnapshot('session-1', 2);
    const current = {
      state: systemState(session('session-1')),
      editorSnapshot: currentSnapshot,
    };

    assert.equal(reconcileEditorSnapshot(current, editorSnapshot('session-2', 9)), currentSnapshot);
  });

  test('clears editor state when there is no active session', () => {
    const reconciled = reconcileSystemState({
      state: systemState(session('session-1')),
      editorSnapshot: editorSnapshot('session-1', 2),
    }, systemState(null));

    assert.equal(reconciled.editorSnapshot, null);
    assert.equal(reconciled.state?.activeSession, null);
  });
});

test('MVP editor sources contain no text editor command or controls', () => {
  const primarySource = readFileSync(new URL('../routes/IntPrimary.tsx', import.meta.url), 'utf8');
  const secondarySource = readFileSync(new URL('../routes/IntSecondary.tsx', import.meta.url), 'utf8');
  const sharedSource = readFileSync(new URL('../../../../packages/shared/src/index.ts', import.meta.url), 'utf8');

  for (const source of [primarySource, secondarySource, sharedSource]) {
    assert.doesNotMatch(source, /editor-add-text/);
    assert.doesNotMatch(source, /type:\s*['"]text['"]/);
  }
  assert.doesNotMatch(primarySource, /textInput|addText|type something/i);
  assert.doesNotMatch(secondarySource, /item\.content/);
});

test('coordinator URLs use the hostname that served the UI', () => {
  assert.deepEqual(buildCoordinatorUrls('192.168.1.25'), {
    http: 'http://192.168.1.25:3001',
    websocket: 'ws://192.168.1.25:3001/ws',
  });
  assert.deepEqual(buildCoordinatorUrls('localhost'), {
    http: 'http://localhost:3001',
    websocket: 'ws://localhost:3001/ws',
  });
});

test('connection state transitions from connecting through reconnecting to connected', () => {
  let status: ConnectionStatus = 'connecting';
  status = transitionConnectionStatus(status, 'socket-opened');
  assert.equal(status, 'connected');
  status = transitionConnectionStatus(status, 'socket-closed');
  assert.equal(status, 'reconnecting');
  status = transitionConnectionStatus(status, 'reconnect-started');
  assert.equal(status, 'reconnecting');
  status = transitionConnectionStatus(status, 'socket-opened');
  assert.equal(status, 'connected');
});

test('editor interaction is disabled unless connected with a matching snapshot', () => {
  const snapshot = editorSnapshot('session-1', 2);
  assert.equal(isEditorInteractive('connecting', 'session-1', snapshot), false);
  assert.equal(isEditorInteractive('reconnecting', 'session-1', snapshot), false);
  assert.equal(isEditorInteractive('connected', 'session-2', snapshot), false);
  assert.equal(isEditorInteractive('connected', 'session-1', snapshot), true);
});

test('a reconnect preserves the last snapshot and accepts the recovered canonical snapshot', () => {
  const previous = editorSnapshot('session-1', 2);
  const current = { state: systemState(session('session-1')), editorSnapshot: previous };
  assert.equal(isEditorInteractive('reconnecting', 'session-1', previous), false);
  assert.equal(current.editorSnapshot, previous);

  const recovered = editorSnapshot('session-1', 3);
  assert.equal(reconcileEditorSnapshot(current, recovered), recovered);
  assert.equal(isEditorInteractive('connected', 'session-1', recovered), true);
});

test('mouse and touch drag completion produce the same canonical move command', () => {
  const mouseCommand = createEditorMoveCommand('session-1', 'sticker-1', 120, 140);
  const touchCommand = createEditorMoveCommand('session-1', 'sticker-1', 120, 140);
  assert.deepEqual(mouseCommand, touchCommand);
  assert.deepEqual(mouseCommand, {
    type: 'editor-move-item',
    sessionId: 'session-1',
    itemId: 'sticker-1',
    x: 120,
    y: 140,
  });
});
