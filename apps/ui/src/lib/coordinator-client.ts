/**
 * Coordinator client — connects to the coordinator's WS, mirrors state into
 * a Zustand store, exposes a sendCommand helper.
 *
 * Every surface uses this. Pass the surface name to useCoordinator(surface)
 * once at the top of each route component.
 */

import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import {
  reconcileEditorSnapshot,
  reconcileSystemState,
  transitionConnectionStatus,
  type ConnectionEvent,
  type ConnectionStatus,
} from './coordinator-store.ts';
import { buildCoordinatorUrls } from './coordinator-url.ts';
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
  connectionStatus: ConnectionStatus;
  state: SystemState | null;
  editorSnapshot: EditorSnapshot | null;
  countdownRemaining: number | null;
  handleConnectionEvent: (event: ConnectionEvent) => void;
  setState: (s: SystemState) => void;
  setEditorSnapshot: (s: EditorSnapshot) => void;
  setCountdown: (n: number | null) => void;
}

export const useStore = create<StoreState>((set) => ({
  connected: false,
  connectionStatus: 'connecting',
  state: null,
  editorSnapshot: null,
  countdownRemaining: null,
  handleConnectionEvent: (event) => set((current) => {
    const connectionStatus = transitionConnectionStatus(current.connectionStatus, event);
    return { connectionStatus, connected: connectionStatus === 'connected' };
  }),
  setState: (s) => set((current) => reconcileSystemState(current, s)),
  setEditorSnapshot: (snapshot) => set((current) => ({
    editorSnapshot: reconcileEditorSnapshot(current, snapshot),
  })),
  setCountdown: (n) => set({ countdownRemaining: n }),
}));

// VITE_COORDINATOR_URL overrides the default localhost:3001.
// Set it to your deployed coordinator (e.g. https://purikura-coordinator.fly.dev)
// when running the UI on Vercel. https:// is automatically converted to wss://.
const coordinatorUrls = buildCoordinatorUrls(
  window.location.hostname,
  import.meta.env.VITE_COORDINATOR_URL as string | undefined,
);
export const COORDINATOR_HTTP_URL = coordinatorUrls.http;
const WS_URL = coordinatorUrls.websocket;

type Sender = (cmd: Command) => void;

export function useCoordinator(surface: Surface): { send: Sender } {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: number | undefined;

    function connect() {
      if (useStore.getState().connectionStatus === 'reconnecting') {
        useStore.getState().handleConnectionEvent('reconnect-started');
      }
      const ws = new WebSocket(`${WS_URL}?surface=${surface}`);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        useStore.getState().handleConnectionEvent('socket-opened');
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
        if (cancelled) return;
        useStore.getState().handleConnectionEvent('socket-closed');
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
