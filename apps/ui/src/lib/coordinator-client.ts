/**
 * Coordinator client — connects to the coordinator's WS, mirrors state into
 * a Zustand store, exposes a sendCommand helper.
 *
 * Every surface uses this. Pass the surface name to useCoordinator(surface)
 * once at the top of each route component.
 */

import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { reconcileEditorSnapshot, reconcileSystemState } from './coordinator-store.ts';
import type {
  Surface,
  SystemState,
  Command,
  WSMessageOutbound,
  WSMessageInbound,
  EditorSnapshot,
} from '@purikura/shared';

interface StoreState {
  connected: boolean;
  state: SystemState | null;
  editorSnapshot: EditorSnapshot | null;
  countdownRemaining: number | null;
  setConnected: (v: boolean) => void;
  setState: (s: SystemState) => void;
  setEditorSnapshot: (s: EditorSnapshot) => void;
  setCountdown: (n: number | null) => void;
}

export const useStore = create<StoreState>((set) => ({
  connected: false,
  state: null,
  editorSnapshot: null,
  countdownRemaining: null,
  setConnected: (v) => set({ connected: v }),
  setState: (s) => set((current) => reconcileSystemState(current, s)),
  setEditorSnapshot: (snapshot) => set((current) => ({
    editorSnapshot: reconcileEditorSnapshot(current, snapshot),
  })),
  setCountdown: (n) => set({ countdownRemaining: n }),
}));

// VITE_COORDINATOR_URL overrides the default localhost:3001.
// Set it to your deployed coordinator (e.g. https://purikura-coordinator.fly.dev)
// when running the UI on Vercel. https:// is automatically converted to wss://.
const _base: string =
  (import.meta.env.VITE_COORDINATOR_URL as string | undefined) ??
  `http://${window.location.hostname}:3001`;
export const COORDINATOR_HTTP_URL = _base;
const WS_URL = `${_base.replace(/^http/, 'ws')}/ws`;

type Sender = (cmd: Command) => void;

export function useCoordinator(surface: Surface): { send: Sender } {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: number | undefined;

    function connect() {
      const ws = new WebSocket(`${WS_URL}?surface=${surface}`);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        useStore.getState().setConnected(true);
      });

      ws.addEventListener('message', (e) => {
        try {
          const msg = JSON.parse(e.data) as WSMessageOutbound;
          const { event } = msg;
          switch (event.type) {
            case 'state-update':
              useStore.getState().setState(event.state);
              break;
            case 'editor-snapshot':
              useStore.getState().setEditorSnapshot(event.snapshot);
              break;
            case 'countdown-tick':
              useStore.getState().setCountdown(event.remaining);
              break;
          }
        } catch (err) {
          console.error('bad WS message', err);
        }
      });

      ws.addEventListener('close', () => {
        useStore.getState().setConnected(false);
        if (cancelled) return;
        reconnectTimer = window.setTimeout(connect, 1500);
      });

      ws.addEventListener('error', () => ws.close());
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [surface]);

  const send: Sender = (command) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    const msg: WSMessageInbound = { surface, command };
    ws.send(JSON.stringify(msg));
  };

  return { send };
}
