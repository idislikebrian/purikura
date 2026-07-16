/**
 * Coordinator class — the brain.
 *
 * Owns:
 *  - the XState session machine actor
 *  - the user queue
 *  - the list of connected WS clients (one per surface)
 *  - the broadcast bus
 *
 * Responsibilities:
 *  - Receive commands from any surface
 *  - Mutate state appropriately
 *  - Broadcast the new state to ALL connected surfaces
 *  - Listen to hardware events and feed them into the machine
 */

import { createActor, type Actor } from 'xstate';
import { nanoid } from 'nanoid';
import type { WebSocket } from 'ws';

import { sessionMachine } from '@purikura/state-machine';
import type { HardwareAdapter } from '@purikura/hardware-adapter';
import { EditorState } from './editor-state.js';
import type {
  Surface,
  UserSession,
  PrintJob,
  SystemState,
  Command,
  Event,
  Phase,
  WSMessageOutbound,
} from '@purikura/shared';

const RECENT_SESSIONS_LIMIT = 6;
const AVG_SESSION_MS = 6 * 60 * 1000; // 6 minute baseline for queue estimates

const DEMO_DELAYS = {
  WELCOME_AUTO_DISMISS: 5_000,
  REVIEW_AUTO_ACCEPT: 3_000,
  MANIP_DURATION_MULTI: 60_000,
  TAKEAWAY_DISPLAY: 5_000,
};

// XState state name → public Phase name
const PHASE_MAP: Record<string, Phase> = {
  idle: 'idle',
  comeIn: 'come-in',
  welcome: 'welcome',
  photoPrep: 'photo-prep',
  photoCapture: 'photo-capture',
  photoReview: 'photo-review',
  manipIntro: 'manip-intro',
  manipulate: 'manipulate',
  takeawayInfo: 'takeaway-info',
  completed: 'completed',
};

export class Coordinator {
  private actor: Actor<typeof sessionMachine>;
  private queue: UserSession[] = [];
  private recentSessions: UserSession[] = [];
  private printQueue: PrintJob[] = [];
  private clients = new Map<WebSocket, Surface>();
  private serviceMode: 'running' | 'suspended' = 'running';
  private printerOnline = true;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private hardware: HardwareAdapter,
    private demoMode = false,
    private editor = new EditorState(),
  ) {
    const machine = demoMode
      ? sessionMachine.provide({ delays: DEMO_DELAYS })
      : sessionMachine;
    this.actor = createActor(machine);
  }

  start() {
    this.actor.subscribe((snapshot) => {
      const phaseName = typeof snapshot.value === 'string' ? snapshot.value : 'idle';
      const phase = PHASE_MAP[phaseName] ?? 'idle';
      const session = snapshot.context.activeSession;
      const previousEditorSessionId = this.editor.getSnapshot()?.sessionId ?? null;
      const editorSnapshot = this.editor.syncSession(session?.id ?? null);

      // When the machine returns to idle, see if there's someone waiting
      if (phase === 'idle' && this.queue.length > 0 && this.serviceMode === 'running') {
        const next = this.queue.shift()!;
        this.actor.send({ type: 'NEXT_USER_AVAILABLE', session: next });
        return;
      }

      // Push the new state to all surfaces
      this.broadcast({ type: 'phase-change', phase, sessionId: session?.id ?? '' });
      this.broadcastState();
      if (editorSnapshot && previousEditorSessionId !== editorSnapshot.sessionId) {
        this.broadcastToSurfaces(
          ['int-primary', 'int-secondary'],
          { type: 'editor-snapshot', snapshot: editorSnapshot },
        );
      }
    });

    // Hardware → machine
    this.hardware.on('door-opened', () => this.actor.send({ type: 'DOOR_OPENED' }));
    this.hardware.on('door-closed', () => this.actor.send({ type: 'DOOR_CLOSED' }));
    this.hardware.on('printer-status-change', (status) => {
      this.printerOnline = status !== 'error';
      this.broadcastState();
    });
    this.hardware.on('printer-job-complete', (jobId) => {
      const job = this.printQueue.find((j) => j.id === jobId);
      if (job) {
        job.status = 'ready';
        job.completedAt = Date.now();
        this.broadcast({ type: 'print-status-change', job });
        this.broadcastState();
      }
    });

    this.actor.start();
  }

  stop() {
    this.stopCaptureCountdown();
    this.actor.stop();
  }

  // ============================================================================
  // Client management
  // ============================================================================

  attachClient(surface: Surface, ws: WebSocket) {
    this.clients.set(ws, surface);
    // Send current state immediately so the new client renders the right thing
    this.sendToClient(ws, { event: { type: 'state-update', state: this.buildSystemState() }, timestamp: Date.now() });
    if (surface === 'int-primary' || surface === 'int-secondary') {
      const snapshot = this.editor.getSnapshot();
      if (snapshot) {
        this.sendToClient(ws, { event: { type: 'editor-snapshot', snapshot }, timestamp: Date.now() });
      }
    }
  }

  detachClient(ws: WebSocket) {
    this.clients.delete(ws);
  }

  // ============================================================================
  // Command handlers
  // ============================================================================

  handleCommand(surface: Surface, command: Command) {
    console.log(`[coord] ${surface} → ${command.type}`);

    switch (command.type) {
      case 'register': {
        const session: UserSession = {
          id: nanoid(),
          name: command.name.trim().slice(0, 20),
          registeredAt: Date.now(),
        };

        const snapshot = this.actor.getSnapshot();
        const machineIdle = snapshot.value === 'idle';

        if (machineIdle && this.queue.length === 0 && this.serviceMode === 'running') {
          // Booth is free, send straight to come-in
          this.actor.send({ type: 'NEXT_USER_AVAILABLE', session });
        } else {
          // Queue it
          this.queue.push(session);
          this.broadcast({ type: 'session-registered', session });
        }
        this.broadcastState();
        break;
      }

      case 'cancel-registration': {
        this.queue = this.queue.filter((s) => s.id !== command.sessionId);
        this.broadcastState();
        break;
      }

      case 'enter-booth':
        // ext-touch fires this when the user taps "I'm going in" — for the
        // MVP/web demo it forwards as a fake door event so the flow proceeds
        this.actor.send({ type: 'DOOR_OPENED' });
        break;

      case 'start-experience':
        this.actor.send({ type: 'WELCOME_DISMISSED' });
        break;

      case 'capture-photo':
        this.actor.send({ type: 'CAPTURE' });
        // Lights on, then the browser captures and POSTs to /upload-photo
        this.hardware.triggerLights(true);
        this.startCaptureCountdown();
        break;

      case 'photo-accept':
        this.actor.send({ type: 'ACCEPT' });
        break;

      case 'photo-redo':
        this.stopCaptureCountdown();
        this.actor.send({ type: 'REDO' });
        break;

      case 'editor-add-sticker':
      case 'editor-add-text':
      case 'editor-select-item':
      case 'editor-delete-item': {
        const snapshot = this.actor.getSnapshot();
        const result = this.editor.apply(command, {
          activeSessionId: snapshot.context.activeSession?.id ?? null,
          phase: this.getCurrentPhase(),
          surface,
        });
        if (!result.accepted) {
          console.warn(`[coord] rejected ${command.type}: ${result.reason}`);
          this.broadcastToSurfaces([surface], { type: 'error', message: result.reason });
          break;
        }
        this.broadcastToSurfaces(
          ['int-primary', 'int-secondary'],
          { type: 'editor-snapshot', snapshot: result.snapshot },
        );
        break;
      }

      case 'manip-done':
        this.actor.send({ type: 'MANIP_DONE' });
        break;

      case 'exit-booth':
        this.actor.send({ type: 'EXIT' });
        this.finalizeSession();
        break;

      case 'admin-suspend':
        this.serviceMode = 'suspended';
        this.actor.send({ type: 'ADMIN_SUSPEND' });
        this.broadcastState();
        break;

      case 'admin-resume':
        this.serviceMode = 'running';
        this.actor.send({ type: 'ADMIN_RESUME' });
        this.broadcastState();
        break;
    }
  }

  handlePhotoUpload(photoBlob: string) {
    this.actor.send({ type: 'PHOTO_CAPTURED', photoBlob });
    this.hardware.triggerLights(false);
  }

  // ============================================================================
  // Session finalization — composite, print, save to recent
  // ============================================================================

  private async finalizeSession() {
    const snapshot = this.actor.getSnapshot();
    const session = snapshot.context.activeSession;
    if (!session) return;

    // In real impl: composite the photo + canvas state into final image
    // For scaffolding, just mark complete and queue print
    const completed: UserSession = {
      ...session,
      completedAt: Date.now(),
      qrUrl: `https://purikura.demo/share/${session.id}`, // TODO: real URL
    };

    const printJob: PrintJob = {
      id: nanoid(),
      sessionId: session.id,
      userName: session.name,
      status: 'queued',
      createdAt: Date.now(),
    };
    this.printQueue.unshift(printJob);
    this.printQueue = this.printQueue.slice(0, 10);

    // Add to recent
    this.recentSessions.unshift(completed);
    this.recentSessions = this.recentSessions.slice(0, RECENT_SESSIONS_LIMIT);

    this.broadcast({ type: 'session-completed', session: completed });

    // Fire-and-forget the print job
    this.hardware.print(Buffer.from([]), session.id).then((jobId) => {
      printJob.id = jobId;
      printJob.status = 'printing';
      this.broadcast({ type: 'print-status-change', job: printJob });
      this.broadcastState();
    });
  }

  // ============================================================================
  // Capture countdown — broadcasts ticks; UI owns the actual frame grab
  // ============================================================================

  private startCaptureCountdown() {
    this.stopCaptureCountdown();
    let remaining = 3;
    this.broadcast({ type: 'countdown-tick', remaining, phase: 'photo-capture' });
    this.countdownTimer = setInterval(() => {
      remaining -= 1;
      this.broadcast({ type: 'countdown-tick', remaining, phase: 'photo-capture' });
      if (remaining <= 0) this.stopCaptureCountdown();
    }, 1000);
  }

  private stopCaptureCountdown() {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  // ============================================================================
  // State assembly + broadcast
  // ============================================================================

  private buildSystemState(): SystemState {
    const snapshot = this.actor.getSnapshot();
    return {
      serviceMode: this.serviceMode,
      activeSession: snapshot.context.activeSession,
      phase: this.getCurrentPhase(),
      queue: [...this.queue],
      recentSessions: [...this.recentSessions],
      printQueue: [...this.printQueue],
      doorOpen: this.hardware.getDoorOpen(),
      printerOnline: this.printerOnline,
      estimatedWaitMs: this.queue.length * AVG_SESSION_MS,
    };
  }

  private getCurrentPhase(): Phase {
    const value = this.actor.getSnapshot().value;
    const phaseName = typeof value === 'string' ? value : 'idle';
    return PHASE_MAP[phaseName] ?? 'idle';
  }

  private broadcastState() {
    this.broadcast({ type: 'state-update', state: this.buildSystemState() });
  }

  private broadcast(event: Event) {
    const msg: WSMessageOutbound = { event, timestamp: Date.now() };
    const payload = JSON.stringify(msg);
    for (const ws of this.clients.keys()) {
      if (ws.readyState === 1) ws.send(payload);
    }
  }

  private broadcastToSurfaces(surfaces: Surface[], event: Event, exclude?: Surface) {
    const msg: WSMessageOutbound = { event, timestamp: Date.now() };
    const payload = JSON.stringify(msg);
    for (const [ws, surface] of this.clients.entries()) {
      if (!surfaces.includes(surface)) continue;
      if (exclude && surface === exclude) continue;
      if (ws.readyState === 1) ws.send(payload);
    }
  }

  private sendToClient(ws: WebSocket, msg: WSMessageOutbound) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }
}
