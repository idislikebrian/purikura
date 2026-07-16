/**
 * Shared types — the contract between coordinator and all UI surfaces.
 *
 * Everything that crosses the WebSocket lives here. If you change a type
 * in here, every surface needs a rebuild.
 */

// ============================================================================
// Surfaces — the five physical displays in the booth
// ============================================================================

export type Surface =
  | 'ext-touch'      // External touchscreen (registration)
  | 'ext-tv'         // External TV (queue + attract)
  | 'int-primary'    // Internal touch 1 (camera + canvas)
  | 'int-secondary'  // Internal touch 2 (keyboard / mirror)
  | 'takeaway';      // Takeaway display (recent users + print queue)

// ============================================================================
// Session — one user's journey through the booth
// ============================================================================

export interface UserSession {
  id: string;              // uuid
  name: string;            // user-entered display name
  registeredAt: number;    // ms epoch
  enteredAt?: number;
  completedAt?: number;
  photoBlob?: string;      // base64 jpeg of captured photo
  finalImage?: string;     // base64 png of composited final
  qrUrl?: string;          // shareable URL for digital copy
  printJobId?: string;
}

// ============================================================================
// Phases — which state of the experience the active user is in
// ============================================================================

export type Phase =
  | 'idle'              // No active user, attract state
  | 'come-in'           // User registered, door unlocking
  | 'welcome'           // Inside, demo video playing
  | 'photo-prep'        // Camera ready, before countdown
  | 'photo-capture'    // Countdown active
  | 'photo-review'      // Show captured, accept or redo
  | 'manip-intro'       // Transition video before editing
  | 'manipulate'        // Active editing on both screens
  | 'takeaway-info'     // QR + "get out" screen inside
  | 'completed';        // Session done, printing

// ============================================================================
// Print job status — what's happening at the printer
// ============================================================================

export type PrintStatus = 'queued' | 'printing' | 'ready' | 'error';

export interface PrintJob {
  id: string;
  sessionId: string;
  userName: string;
  status: PrintStatus;
  createdAt: number;
  completedAt?: number;
}

// ============================================================================
// System state — the full picture, broadcast to all surfaces
// ============================================================================

export interface SystemState {
  serviceMode: 'running' | 'suspended';
  activeSession: UserSession | null;
  phase: Phase;
  queue: UserSession[];
  recentSessions: UserSession[];  // last N completed, for takeaway display
  printQueue: PrintJob[];
  doorOpen: boolean;
  printerOnline: boolean;
  estimatedWaitMs: number;        // calculated based on queue + phase
}

// ============================================================================
// Editor document - canonical coordinator-owned state for the 4:5 canvas
// ============================================================================

export const EDITOR_CANVAS_WIDTH = 400;
export const EDITOR_CANVAS_HEIGHT = 500;

export interface StickerItem {
  type: 'sticker';
  id: string;
  emoji: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

export interface TextItem {
  type: 'text';
  id: string;
  content: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  color: string;
}

export type EditorItem = StickerItem | TextItem;

export interface EditorDocument {
  width: typeof EDITOR_CANVAS_WIDTH;
  height: typeof EDITOR_CANVAS_HEIGHT;
  items: EditorItem[]; // array order is the canonical z-order
}

export interface EditorSnapshot {
  sessionId: string;
  revision: number;
  document: EditorDocument;
  selectedItemId: string | null;
}

// ============================================================================
// Commands — what UIs send TO the coordinator
// ============================================================================

export type Command =
  | { type: 'register'; name: string }
  | { type: 'cancel-registration'; sessionId: string }
  | { type: 'enter-booth' }                // ext-touch: user is entering
  | { type: 'start-experience' }           // int-primary: welcome dismissed
  | { type: 'capture-photo' }              // int-primary: shutter
  | { type: 'photo-accept' }
  | { type: 'photo-redo' }
  | { type: 'manip-tool-change'; tool: ManipTool }
  | { type: 'editor-add-sticker'; sessionId: string; itemId: string; emoji: string; x: number; y: number }
  | { type: 'editor-add-text'; sessionId: string; itemId: string; content: string; x: number; y: number; color: string }
  | { type: 'editor-select-item'; sessionId: string; itemId: string | null }
  | { type: 'editor-delete-item'; sessionId: string; itemId: string }
  | { type: 'manip-done' }
  | { type: 'exit-booth' }                 // int: user is leaving
  | { type: 'admin-suspend' }
  | { type: 'admin-resume' };

export type ManipTool = 'stickers' | 'filters' | 'text' | 'draw';

// ============================================================================
// Events — what the coordinator BROADCASTS to all UIs
// ============================================================================

export type Event =
  | { type: 'state-update'; state: SystemState }
  | { type: 'phase-change'; phase: Phase; sessionId: string }
  | { type: 'session-registered'; session: UserSession }
  | { type: 'session-completed'; session: UserSession }
  | { type: 'print-status-change'; job: PrintJob }
  | { type: 'editor-snapshot'; snapshot: EditorSnapshot }
  | { type: 'countdown-tick'; remaining: number; phase: Phase }
  | { type: 'error'; message: string };

// ============================================================================
// WS message wrapper — every message over the wire has this shape
// ============================================================================

export interface WSMessageInbound {
  surface: Surface;
  command: Command;
}

export interface WSMessageOutbound {
  event: Event;
  timestamp: number;
}
