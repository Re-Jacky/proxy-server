# IP/Port Blocking Design

Add configurable IP and port blocking to the proxy server, persisted to `blocks.json`.

## New Module: `src/blocker.js`

- Loads `{ ips: [], ports: [] }` from `<project_root>/blocks.json` on module load
- Saves to file on every add/remove operation (sync write, small file)
- CIDR matching via simple IP-to-integer conversion for `ipInCIDR(ip, cidr)`
- Exported API:
  - `isBlocked(clientIp, targetHost, targetPort)` → `{ blocked: boolean, reason: string | null }`
  - `getBlocks()` → `{ ips: string[], ports: number[] }`
  - `addIp(ip)` / `removeIp(ip)` / `addPort(port)` / `removePort(port)`

## New Data File: `blocks.json`

```json
{ "ips": ["10.0.0.1", "192.168.0.0/16"], "ports": [25, 3306] }
```

Created automatically with `{ ips: [], ports: [] }` if missing.

## Admin API Routes (in `src/admin.js`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/api/blocks` | List all blocks |
| POST | `/admin/api/blocks/ip` | Add IP/CIDR (body: `{ ip }`) |
| DELETE | `/admin/api/blocks/ip` | Remove IP/CIDR (body: `{ ip }`) |
| POST | `/admin/api/blocks/port` | Add port (body: `{ port }`) |
| DELETE | `/admin/api/blocks/port` | Remove port (body: `{ port }`) |

## Admin Pages

- `/admin` — dashboard with link to blocks page
- `/admin/blocks` — block management page, with back-to-dashboard button

## Handler Integration

In each handler (`http.js`, `https.js`, `websocket.js`), after URL/hostname validation and proxy-state check, call `blocker.isBlocked(clientIp, targetHost, targetPort)`. If blocked, return 403 with `{ error: reason }`.

## Files Changed

- Create: `src/blocker.js`, `blocks.json`
- Modify: `src/admin.js` (add routes + blocks page), `src/handlers/*.js` (add blocking check)
- Test: `test/blocker.test.js`
