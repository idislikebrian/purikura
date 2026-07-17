# purikura

Photobooth experience scaffold. Multi-surface UI + coordinator service.
Same codebase runs as a web demo (Vercel) or on physical hardware (Mac mini / NUC).

## What's here

```
purikura/
├── apps/
│   ├── coordinator/        Node.js coordinator service (Hono + WebSocket + XState)
│   └── ui/                 Vite + React app (one route per surface)
├── packages/
│   ├── shared/             Types shared between coordinator and UI
│   ├── hardware-adapter/   Hardware interface + Mock/Pi/Serial implementations
│   └── state-machine/      XState session machine
```

## Getting started

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

This starts both the coordinator (port 3001) and UI (port 3000) in parallel.

Then open these URLs in separate browser tabs/windows to simulate the 5 displays:

- http://localhost:3000/ext-touch   — Registration touchscreen
- http://localhost:3000/ext-tv      — External queue display
- http://localhost:3000/int-primary — Internal main screen
- http://localhost:3000/int-secondary — Internal second screen
- http://localhost:3000/takeaway    — Takeaway display

The debug panel (bottom-right of every screen) lets you fire fake hardware events like opening the door.

## End-to-end test flow

1. Open `/ext-tv` and `/ext-touch` side by side
2. On `/ext-touch`, type a name and hit register
3. Watch the queue appear on `/ext-tv` and the "come on in!" screen flash on `/ext-touch`
4. Tap "I'm going in" — this fires a fake door-open event
5. Open `/int-primary` in another tab — the welcome screen appears with the registered name
6. Click through the experience

## Windows + Android tablet LAN testing

The Windows PC continues to own the camera and photo-capture flow. The Android
tablet is used only for the `int-secondary` editing screen.

1. On the Windows PC, start the app:

   ```powershell
   pnpm.cmd dev
   ```

2. Run `ipconfig` and find the active Wi-Fi adapter's IPv4 address.

3. On the tablet, open:

   ```text
   http://<PC-IP>:3000/int-secondary
   ```

   The UI uses the hostname from the page URL when connecting to the
   coordinator, so this page connects to `ws://<PC-IP>:3001/ws`.

4. If Windows Firewall prompts for Node.js access, allow it on private
   networks.

Before testing, confirm that:

- Both devices are connected to the same Wi-Fi network.
- The Windows network is marked Private.
- Wi-Fi client isolation or AP isolation is disabled.
- VPNs are disabled on both devices during testing.
- The tablet is configured to stay awake.
- The PC's IPv4 address can change unless the router has a DHCP reservation.

If the tablet cannot connect:

- Open `http://<PC-IP>:3001/health` on the tablet.
- Confirm that ports `3000` and `3001` are reachable through Windows Firewall.
- Confirm that the coordinator logs show the tablet WebSocket connection.
- Remember that camera capture remains on the Windows PC; the tablet does not
  access the camera.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│  UI Layer (React + Zustand)                            │
│  ext-touch · ext-tv · int-primary · int-secondary · takeaway │
└────────────────────────────────────────────────────────┘
                          ↕ WebSocket
┌────────────────────────────────────────────────────────┐
│  Coordinator (Hono + ws + XState)                      │
│   - Session manager  - Event bus  - Print queue        │
└────────────────────────────────────────────────────────┘
                          ↕ HardwareAdapter interface
┌────────────────────────────────────────────────────────┐
│  Hardware: MockAdapter | PiAdapter | SerialAdapter      │
└────────────────────────────────────────────────────────┘
```

The **HardwareAdapter** interface is the swappable bit. `MockAdapter` is the default
for development and the web demo — it simulates door sensors and printer with fake
async events. `PiAdapter` (stubbed in `packages/hardware-adapter/src/index.ts`) is
the physical-booth implementation.

## Deployment

**Web demo (Vercel/Netlify):**
- `apps/ui` deploys as a static site to Vercel/Netlify
- `apps/coordinator` deploys to Fly.io / Railway / Cloudflare Workers (Durable Objects for WS)
- MockAdapter stays in place

**Physical booth:**
- Single Mac mini or Intel NUC runs both apps locally
- 5 Chromium windows in kiosk mode point at `localhost:3000/[surface]`
- Swap `MockAdapter` for `PiAdapter` (or `SerialAdapter`) in `coordinator/src/index.ts`
- Manage with pm2 or launchd

## State machine

The session lifecycle is modeled in `packages/state-machine/src/index.ts` using XState.
States: `idle → comeIn → welcome → photoPrep → photoCapture → photoReview → manipIntro → manipulate → takeawayInfo → completed → idle`.

See the file for transitions and timeouts.

## Open questions

These need product decisions before next iteration:

- Mirrored vs split behavior on the two internal screens
- QR link expiry policy (24h / 7d / indefinite)
- Profanity filter on name input
- Auto-accept timer on photo review (currently 8s)
- Queue cap (refuse registration past N people?)
- What happens when "come on in" timeout expires (currently 30s → drop to idle)
