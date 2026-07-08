# Admin Dashboard Design

Add a `/admin` management page to the proxy server with proxy on/off toggle and real-time network monitoring.

## New Environment Variables

| Variable | Required | Default | Validation |
|---|---|---|---|
| `ADMIN_USERNAME` | yes | — | min 3 chars |
| `ADMIN_PASSWORD` | yes | — | min 8 chars |

Admin credentials are separate from proxy credentials. Auth is always enforced when both are set (no separate toggle).

## New Modules

### `src/proxy-state.js`
Singleton module exporting `{ enabled: true, toggle() }`. The `enabled` boolean is imported by all three handlers and `server.js`. Called by `server.js` before dispatching to a handler.

### `src/metrics.js`
In-memory counters, all reset on restart:

- `activeConnections` — incremented on new request/connect/upgrade, decremented on close/error
- `totalBytes` — `{ sent: 0, received: 0 }`
- `requestRate` — rolling array of timestamps per second (last 60s)
- `connectionHistory` — timestamped entries per second for charting (last 60s)
- `recordRequest()` — push timestamp to rate array
- `recordBytes(sent, received)` — add to totals
- `connectionOpen()` / `connectionClose()` — manage active count
- `getSnapshot()` — return current state object for SSE/API
- `getHistory()` — return connection timeline array

### `src/admin-auth.js`
Exports `adminAuthenticate(req, res)`. Same pattern as `auth.js` but uses `ADMIN_USERNAME`/`ADMIN_PASSWORD`. Returns 407 on failure.

### `src/admin.js`
Exports `handleAdmin(req, res)`. Called from `server.js` when `req.url` starts with `/admin`. Dispatches to:

| Route | Handler |
|---|---|
| `GET /admin` | Serve inline HTML page (see below) |
| `GET /admin/api/status` | JSON `{ enabled, metrics: getSnapshot() }` |
| `POST /admin/api/toggle` | Read body, flip state, broadcast via SSE |
| `GET /admin/api/events` | SSE connection, push `getSnapshot()` every 1s |

SSE is a simple `res.write(`data: ${json}\n\n`)` loop. Clients tracked in a `Set`; `broadcast()` iterates all connected clients. Stale connections cleaned on error/close.

## Admin Page Layout

Single HTML page served at `GET /admin`, no build step. All CSS/JS inline.

**Sections (top to bottom):**

1. **Header bar** — "Proxy Admin" title, status badge (green "Enabled" / red "Disabled")
2. **Toggle switch** — large ON/OFF switch, POSTs to `/admin/api/toggle`
3. **Stat cards** — Active Connections, Total Bytes Transferred (formatted), Requests/min
4. **Chart** — Line chart (Chart.js CDN) showing requests/sec over the last 60s, updates every 1s via SSE
5. **Connection history** — Mini table or sparkline of recent connections

SSE auto-reconnect: the JS `EventSource` reconnects on drop. Chart data accumulates up to 60 data points then shifts.

## Proxy-Disabled Behavior

When `proxyState.enabled === false`:

- `server.js` checks before HTTP handler → 503
- `server.on('connect')` handler checks before HTTPS → 503
- `server.on('upgrade')` handler checks before WebSocket → 503
- `/admin` and `/health` always bypass the check

503 response format:
```json
{ "error": "Proxy is disabled" }
```
with `Content-Type: application/json` and status 503.

## Changes to Existing Files

### `src/server.js`
- Import `proxyState`, `handleAdmin`, `adminAuthenticate`
- Add `/admin` route check before proxy handlers (but after health check)
- Check `proxyState.enabled` before each handler dispatch
- Wire metrics calls at appropriate lifecycle points

### `src/config.js`
- Add `ADMIN_USERNAME`, `ADMIN_PASSWORD` validation
- Export them

### `src/handlers/http.js`
- Import `proxyState`, `metrics`
- Call `metrics.recordRequest()`, `metrics.recordBytes()`, `metrics.connectionOpen/Close()`

### `src/handlers/https.js`
- Import `proxyState`, `metrics`
- Call `metrics.connectionOpen/Close()`, `metrics.recordBytes()`

### `src/handlers/websocket.js`
- Import `proxyState`, `metrics`
- Call `metrics.connectionOpen/Close()`, `metrics.recordBytes()`

## Testing

### `test/admin.test.js`
- Admin auth: missing header → 407, bad password → 407, valid → 200
- Toggle: POST toggles state, verify enabled → disabled
- Status endpoint returns correct JSON shape
- SSE endpoint returns `text/event-stream`

### `test/metrics.test.js`
- recordRequest increments requestRate array
- recordBytes adds correctly
- connectionOpen/Close maintains active count
- getSnapshot returns expected keys

## Non-Goals

- No database or persistence (metrics reset on restart)
- No WebSocket library (SSE is sufficient)
- No build step or bundler
- No HTTPS for the admin page (same server, same port)
