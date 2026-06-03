/**
 * Session state machine.
 *
 * Models the lifecycle of one user's journey through the booth.
 * The coordinator runs ONE instance of this machine; it represents the
 * currently-active session. When idle, the machine sits in 'idle' state and
 * pulls the next user from the queue when ready.
 *
 * State chart (high level):
 *   idle → come-in → welcome → photo-prep → photo-capture → photo-review
 *     ↓ (redo)                                                ↓
 *     └──────────────────── photo-prep ←──────────────────────┘
 *   manip-intro → manipulate → takeaway-info → completed → idle
 */

import { setup, assign, fromCallback } from 'xstate';
import type { UserSession, CanvasState } from '@purikura/shared';

export interface SessionContext {
  activeSession: UserSession | null;
  redoUsed: boolean;
  canvasState: CanvasState;
  manipulationTimeRemainingMs: number;
}

export type SessionEvent =
  | { type: 'NEXT_USER_AVAILABLE'; session: UserSession }
  | { type: 'DOOR_OPENED' }
  | { type: 'DOOR_CLOSED' }
  | { type: 'WELCOME_DISMISSED' }
  | { type: 'CAPTURE' }
  | { type: 'PHOTO_CAPTURED'; photoBlob: string }
  | { type: 'ACCEPT' }
  | { type: 'REDO' }
  | { type: 'MANIP_INTRO_DONE' }
  | { type: 'MANIP_DONE' }
  | { type: 'EXIT' }
  | { type: 'TIMEOUT' }
  | { type: 'CANVAS_UPDATE'; payload: CanvasState }
  | { type: 'ADMIN_SUSPEND' }
  | { type: 'ADMIN_RESUME' };

const EMPTY_CANVAS: CanvasState = {
  stickers: [],
  texts: [],
  filter: null,
  strokes: [],
};

export const sessionMachine = setup({
  types: {
    context: {} as SessionContext,
    events: {} as SessionEvent,
  },
  actions: {
    assignSession: assign({
      activeSession: ({ event }) => {
        if (event.type !== 'NEXT_USER_AVAILABLE') return null;
        return { ...event.session, enteredAt: Date.now() };
      },
      redoUsed: false,
      canvasState: EMPTY_CANVAS,
    }),
    clearSession: assign({
      activeSession: null,
      redoUsed: false,
      canvasState: EMPTY_CANVAS,
    }),
    markRedoUsed: assign({ redoUsed: true }),
    storePhoto: assign({
      activeSession: ({ context, event }) => {
        if (event.type !== 'PHOTO_CAPTURED' || !context.activeSession) return context.activeSession;
        return { ...context.activeSession, photoBlob: event.photoBlob };
      },
    }),
    updateCanvas: assign({
      canvasState: ({ event }) => {
        if (event.type !== 'CANVAS_UPDATE') return EMPTY_CANVAS;
        return event.payload;
      },
    }),
  },
  guards: {
    canRedo: ({ context }) => !context.redoUsed,
  },
  delays: {
    COME_IN_TIMEOUT: 30_000,           // 30s for user to enter after registration
    WELCOME_AUTO_DISMISS: 25_000,      // demo video length + buffer
    REVIEW_AUTO_ACCEPT: 8_000,         // auto-accept if user doesn't tap
    MANIP_DURATION_MULTI: 300_000,     // 5 min for multi mode
    TAKEAWAY_DISPLAY: 15_000,          // how long to show QR before kicking out
  },
}).createMachine({
  id: 'session',
  initial: 'idle',
  context: {
    activeSession: null,
    redoUsed: false,
    canvasState: EMPTY_CANVAS,
    manipulationTimeRemainingMs: 0,
  },
  on: {
    ADMIN_SUSPEND: { target: '.suspended' },
  },
  states: {
    suspended: {
      on: { ADMIN_RESUME: { target: 'idle' } },
    },
    idle: {
      on: {
        NEXT_USER_AVAILABLE: { target: 'comeIn', actions: 'assignSession' },
      },
    },
    comeIn: {
      after: { COME_IN_TIMEOUT: { target: 'idle', actions: 'clearSession' } },
      on: {
        DOOR_OPENED: { target: 'welcome' },
        TIMEOUT: { target: 'idle', actions: 'clearSession' },
      },
    },
    welcome: {
      after: { WELCOME_AUTO_DISMISS: { target: 'photoPrep' } },
      on: { WELCOME_DISMISSED: { target: 'photoPrep' } },
    },
    photoPrep: {
      on: { CAPTURE: { target: 'photoCapture' } },
    },
    photoCapture: {
      on: { PHOTO_CAPTURED: { target: 'photoReview', actions: 'storePhoto' } },
    },
    photoReview: {
      after: { REVIEW_AUTO_ACCEPT: { target: 'manipIntro' } },
      on: {
        ACCEPT: { target: 'manipIntro' },
        REDO: {
          target: 'photoPrep',
          guard: 'canRedo',
          actions: 'markRedoUsed',
        },
      },
    },
    manipIntro: {
      after: { 5000: { target: 'manipulate' } },
      on: { MANIP_INTRO_DONE: { target: 'manipulate' } },
    },
    manipulate: {
      after: { MANIP_DURATION_MULTI: { target: 'takeawayInfo' } },
      on: {
        CANVAS_UPDATE: { actions: 'updateCanvas' },
        MANIP_DONE: { target: 'takeawayInfo' },
      },
    },
    takeawayInfo: {
      after: { TAKEAWAY_DISPLAY: { target: 'completed' } },
      on: {
        EXIT: { target: 'completed' },
        DOOR_OPENED: { target: 'completed' },
      },
    },
    completed: {
      // Finalize: composite, print, save to recent, then return to idle
      after: { 1000: { target: 'idle', actions: 'clearSession' } },
    },
  },
});

export type SessionMachine = typeof sessionMachine;
