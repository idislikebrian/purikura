/**
 * Hardware adapter — the boundary between coordinator logic and physical hardware.
 *
 * The coordinator only ever talks to this interface. The implementation is
 * swappable at boot time based on env config:
 *   - MockAdapter for web demo and local dev
 *   - PiAdapter for Raspberry Pi GPIO
 *   - SerialAdapter for Arduino over USB
 *
 * Add a new implementation by extending HardwareAdapter and wiring it up
 * in coordinator/src/hardware.ts.
 */

import { EventEmitter } from 'node:events';
import type { PrintStatus } from '@purikura/shared';

// ============================================================================
// Interface — every adapter implements this
// ============================================================================

export interface HardwareEvents {
  'door-opened': () => void;
  'door-closed': () => void;
  'printer-status-change': (status: PrintStatus) => void;
  'printer-job-complete': (jobId: string) => void;
}

export abstract class HardwareAdapter extends EventEmitter {
  abstract triggerLights(on: boolean): Promise<void>;
  abstract capturePhoto(): Promise<Buffer>;
  abstract print(image: Buffer, sessionId: string): Promise<string>; // returns jobId
  abstract getPrinterOnline(): Promise<boolean>;
  abstract getDoorOpen(): boolean;

  // Type-safe event emitter overrides
  override on<K extends keyof HardwareEvents>(event: K, listener: HardwareEvents[K]): this {
    return super.on(event, listener);
  }
  override emit<K extends keyof HardwareEvents>(event: K, ...args: Parameters<HardwareEvents[K]>): boolean {
    return super.emit(event, ...args);
  }
}

// ============================================================================
// MockAdapter — for web demo and local dev
//
// Simulates hardware via in-memory state. Door sensor is toggled by a debug
// command. Photo capture returns a placeholder image. Print is logged.
// ============================================================================

export class MockAdapter extends HardwareAdapter {
  private doorOpen = false;
  private printerOnline = true;
  private printJobCounter = 0;

  async triggerLights(on: boolean): Promise<void> {
    console.log(`[mock-hw] lights ${on ? 'ON' : 'OFF'}`);
  }

  async capturePhoto(): Promise<Buffer> {
    // In real hardware this triggers the camera + grabs the frame.
    // For mock, the actual photo comes from the browser (getUserMedia) and
    // is uploaded via a separate channel — this just signals "shutter fired".
    console.log('[mock-hw] capture triggered (browser handles getUserMedia)');
    return Buffer.from([]);
  }

  async print(image: Buffer, sessionId: string): Promise<string> {
    const jobId = `mock-${++this.printJobCounter}`;
    console.log(`[mock-hw] queued print job ${jobId} for session ${sessionId}`);

    // Simulate the print pipeline async
    setTimeout(() => this.emit('printer-status-change', 'printing'), 500);
    setTimeout(() => {
      this.emit('printer-job-complete', jobId);
      this.emit('printer-status-change', 'ready');
    }, 4000);

    return jobId;
  }

  async getPrinterOnline(): Promise<boolean> {
    return this.printerOnline;
  }

  getDoorOpen(): boolean {
    return this.doorOpen;
  }

  // ---- Debug-only: simulate hardware events from outside ----
  // These are called by the debug panel in the UI, not by production code.

  simulateDoorOpen(): void {
    this.doorOpen = true;
    this.emit('door-opened');
  }

  simulateDoorClose(): void {
    this.doorOpen = false;
    this.emit('door-closed');
  }

  simulatePrinterOffline(): void {
    this.printerOnline = false;
    this.emit('printer-status-change', 'error');
  }

  simulatePrinterOnline(): void {
    this.printerOnline = true;
    this.emit('printer-status-change', 'ready');
  }
}

// ============================================================================
// PiAdapter — stub for Raspberry Pi GPIO implementation
//
// Uncomment and implement when the physical booth is built.
// Requires: pnpm add onoff (in coordinator)
// ============================================================================

/*
export class PiAdapter extends HardwareAdapter {
  private doorPin: Gpio;
  private lightsPin: Gpio;
  private currentDoorOpen = false;

  constructor() {
    super();
    // GPIO pin numbers — wire up to physical sensors
    this.doorPin = new Gpio(17, 'in', 'both');
    this.lightsPin = new Gpio(27, 'out');

    this.doorPin.watch((err, value) => {
      if (err) return;
      this.currentDoorOpen = value === 1;
      this.emit(value === 1 ? 'door-opened' : 'door-closed');
    });
  }

  async triggerLights(on: boolean) {
    this.lightsPin.writeSync(on ? 1 : 0);
  }

  async capturePhoto(): Promise<Buffer> {
    // Photo comes from the browser via getUserMedia — this is just a trigger
    return Buffer.from([]);
  }

  async print(image: Buffer, sessionId: string): Promise<string> {
    // Shell out to CUPS: lp -d <printer-name> <file>
    // Or use vendor SDK for DNP DS620
    throw new Error('not implemented');
  }

  async getPrinterOnline(): Promise<boolean> {
    // lpstat -p <printer-name>
    return true;
  }

  getDoorOpen(): boolean {
    return this.currentDoorOpen;
  }
}
*/
