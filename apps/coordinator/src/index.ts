/**
 * Coordinator — the brain of the photobooth.
 *
 * One process. Holds canonical state. Broadcasts to all surfaces over WS.
 * Talks to hardware via the adapter interface.
 *
 * Run: pnpm dev
 * URL: ws://localhost:3001/ws
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';

import { MockAdapter } from '@purikura/hardware-adapter';
import { Coordinator } from './coordinator.js';

const PORT = Number(process.env.PORT ?? 3001);
const DEMO_MODE = process.env.DEMO_MODE !== 'false';

// ---- HTTP server (for health checks, photo upload, anything REST) ----

const app = new Hono();
app.use('*', cors({ origin: '*' }));

app.get('/health', (c) => c.json({ ok: true, time: Date.now() }));

app.post('/upload-photo', async (c) => {
  // The browser captures via getUserMedia and POSTs the blob here.
  // Coordinator stores it on the active session and advances the machine.
  const body = await c.req.json<{ photoBlob: string }>();
  coordinator.handlePhotoUpload(body.photoBlob);
  return c.json({ ok: true });
});

// Debug endpoints (mock-adapter only — remove for production)
app.post('/debug/door', async (c) => {
  const body = await c.req.json<{ open: boolean }>();
  if (body.open) hardware.simulateDoorOpen();
  else hardware.simulateDoorClose();
  return c.json({ ok: true });
});

app.post('/debug/printer', async (c) => {
  const body = await c.req.json<{ online: boolean }>();
  if (body.online) hardware.simulatePrinterOnline();
  else hardware.simulatePrinterOffline();
  return c.json({ ok: true });
});

// ---- Wire it up ----

const httpServer = createServer();
const hardware = new MockAdapter();
if (DEMO_MODE) console.log('[coord] DEMO_MODE on — timers shortened');
const coordinator = new Coordinator(hardware, DEMO_MODE);

// Mount Hono on the same HTTP server
httpServer.on('request', async (req, res) => {
  const url = `http://${req.headers.host}${req.url}`;
  const response = await app.fetch(new Request(url, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req as any : undefined,
    duplex: 'half',
  } as RequestInit));
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
});

// WebSocket server on the same port, path /ws
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws, req) => {
  const surface = new URL(req.url ?? '', 'http://localhost').searchParams.get('surface');
  if (!surface) {
    ws.close(1008, 'surface query param required');
    return;
  }

  console.log(`[coord] surface connected: ${surface}`);
  coordinator.attachClient(surface as any, ws);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      coordinator.handleCommand(surface as any, msg.command);
    } catch (err) {
      console.error('[coord] bad message', err);
    }
  });

  ws.on('close', () => {
    console.log(`[coord] surface disconnected: ${surface}`);
    coordinator.detachClient(ws);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[coord] listening on http://localhost:${PORT}`);
  console.log(`[coord] ws://localhost:${PORT}/ws?surface=<surface>`);
  coordinator.start();
});
