import type { EditorSnapshot, SystemState } from '@purikura/shared';

export interface CoordinatorSnapshotState {
  state: SystemState | null;
  editorSnapshot: EditorSnapshot | null;
}

export function reconcileSystemState(
  current: CoordinatorSnapshotState,
  state: SystemState,
): CoordinatorSnapshotState {
  return {
    state,
    editorSnapshot: current.editorSnapshot?.sessionId === state.activeSession?.id
      ? current.editorSnapshot
      : null,
  };
}

export function reconcileEditorSnapshot(
  current: CoordinatorSnapshotState,
  snapshot: EditorSnapshot,
): EditorSnapshot | null {
  if (current.state?.activeSession?.id !== snapshot.sessionId) {
    return current.editorSnapshot;
  }
  if (
    current.editorSnapshot?.sessionId === snapshot.sessionId &&
    current.editorSnapshot.revision > snapshot.revision
  ) {
    return current.editorSnapshot;
  }
  return snapshot;
}
