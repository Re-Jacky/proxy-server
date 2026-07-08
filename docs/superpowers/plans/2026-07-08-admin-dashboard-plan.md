# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin management page at `/admin` with proxy on/off toggle and real-time network monitoring via SSE + Chart.js.

**Architecture:** Four new modules (`proxy-state.js`, `metrics.js`, `admin-auth.js`, `admin.js`) wired into `server.js` and all three handlers. SSE pushes metrics every 1s. Proxy-disabled state returns 503 on all proxy routes.

**Tech Stack:** Pure Node.js, SSE, Chart.js CDN, inline HTML/CSS/JS.

## Global Constraints

- CommonJS only — `require` / `module.exports`, no ES imports
- 2-space indent, single quotes, semicolons required (ESLint)
- New env vars: `ADMIN_USERNAME` (min 3 chars), `ADMIN_PASSWORD` (min 8 chars), validated at startup
- No npm dependencies — Chart.js loaded from CDN
- Never log passwords or auth tokens
- All logging uses `log(level, message, details)` from `src/logger.js`
- Handlers must never crash the server on error

---

### Task 1: Admin config + proxy-state module

**Files:**
- Modify: `src/config.js`
- Create: `src/proxy-state.js`

**Interfaces:**
- Consumes: nothing
- Produces: `proxyState` singleton with `{ enabled, toggle() }`; `ADMIN_USERNAME`, `ADMIN_PASSWORD` exported from config

- [ ] **Step 1: Add admin credential validation to config.js**

Add after the proxy credential section in `src/config.js`:

```js
if (!process.env.ADMIN_USERNAME || process.env.ADMIN_USERNAME.length < 3) {
  throw new Error('ADMIN_USERNAME must be at least 3 characters long');
}

if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 8) {
  throw new Error('ADMIN_PASSWORD must be at least 8 characters long for security');
}
```

Add to the `module.exports` block:

```js
ADMIN_USERNAME: process.env.ADMIN_USERNAME,
ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
```

- [ ] **Step 2: Create src/proxy-state.js**

```js
const proxyState = {
  enabled: true,
  toggle() {
    proxyState.enabled = !proxyState.enabled;
    return proxyState.enabled;
  }
};

module.exports = proxyState;
```

- [ ] **Step 3: Commit**

```bash
git add src/config.js src/proxy-state.js
git commit -m "feat: add admin config validation and proxy-state module"
```

---

### Task 2: Metrics module + tests

**Files:**
- Create: `src/metrics.js`
- Create: `test/metrics.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `{ recordRequest(), recordBytes(sent, received), connectionOpen(), connectionClose(), getSnapshot(), getHistory() }`

- [ ] **Step 1: Create src/metrics.js**

```js
const { log } = require('./logger');

const RATE_WINDOW = 60; // seconds
const HISTORY_SIZE = 60;

const state = {
  activeConnections: 0,
  totalBytes: { sent: 0, received: 0 },
  requestTimestamps: [],
  connectionHistory: []
};

function recordRequest() {
  state.requestTimestamps.push(Date.now());
  trim();
}

function recordBytes(sent, received) {
  state.totalBytes.sent += sent;
  state.totalBytes.received += received;
}

function connectionOpen() {
  state.activeConnections++;
}

function connectionClose() {
  state.activeConnections = Math.max(0, state.activeConnections - 1);
}

function trim() {
  const cutoff = Date.now() - RATE_WINDOW * 1000;
  state.requestTimestamps = state.requestTimestamps.filter(t => t > cutoff);
}

function getRequestRate() {
  trim();
  return state.requestTimestamps.length;
}

function pushHistory() {
  state.connectionHistory.push({
    time: new Date().toISOString(),
    connections: state.activeConnections
  });
  if (state.connectionHistory.length > HISTORY_SIZE) {
    state.connectionHistory.shift();
  }
}

function getSnapshot() {
  pushHistory();
  return {
    activeConnections: state.activeConnections,
    totalBytes: { ...state.totalBytes },
    requestsPerMin: getRequestRate(),
    uptime: process.uptime()
  };
}

function getHistory() {
  return [...state.connectionHistory];
}

module.exports = {
  recordRequest,
  recordBytes,
  connectionOpen,
  connectionClose,
  getSnapshot,
  getHistory
};
```

- [ ] **Step 2: Set up test environment**

Create `test/metrics.test.js`:

```js
process.env.PORT = '8080';
process.env.AUTH_ENABLED = 'false';
process.env.PROXY_USERNAME = 'testuser';
process.env.PROXY_PASSWORD = 'testpassword123';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'adminpassword123';
process.env.LOG_LEVEL = 'error';

const metrics = require('../src/metrics');

describe('Metrics module', () => {
  beforeEach(() => {
    // Reset internal state by re-requiring doesn't work with module cache,
    // so we test behaviors that are additive
  });

  test('should start with zero state', () => {
    const snap = metrics.getSnapshot();
    expect(snap.activeConnections).toBe(0);
    expect(snap.totalBytes.sent).toBe(0);
    expect(snap.totalBytes.received).toBe(0);
    expect(snap.requestsPerMin).toBeGreaterThanOrEqual(0);
  });

  test('should track connection count', () => {
    metrics.connectionOpen();
    metrics.connectionOpen();
    expect(metrics.getSnapshot().activeConnections).toBe(2);
    metrics.connectionClose();
    expect(metrics.getSnapshot().activeConnections).toBe(1);
    metrics.connectionClose();
    expect(metrics.getSnapshot().activeConnections).toBe(0);
  });

  test('should track bytes', () => {
    metrics.recordBytes(100, 200);
    const snap = metrics.getSnapshot();
    expect(snap.totalBytes.sent).toBe(100);
    expect(snap.totalBytes.received).toBe(200);
  });

  test('should track request rate', () => {
    metrics.recordRequest();
    metrics.recordRequest();
    expect(metrics.getSnapshot().requestsPerMin).toBeGreaterThanOrEqual(2);
  });

  test('should return history array', () => {
    const history = metrics.getHistory();
    expect(Array.isArray(history)).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they pass initially (if metrics requires config side-effects)**

```bash
npx jest test/metrics.test.js --verbose
```

Expected: PASS (note: since metrics.js doesn't import config, it should load cleanly; if config.js requires ADMIN vars before they're set, the test env vars above handle it)

- [ ] **Step 4: Commit**

```bash
git add src/metrics.js test/metrics.test.js
git commit -m "feat: add metrics module with in-memory counters and tests"
```

---

### Task 3: Admin auth module + tests

**Files:**
- Create: `src/admin-auth.js`
- Create: `test/admin-auth.test.js`

**Interfaces:**
- Consumes: `ADMIN_USERNAME`, `ADMIN_PASSWORD` from config
- Produces: `adminAuthenticate(req, res)` returns boolean

- [ ] **Step 1: Create src/admin-auth.js**

```js
const { ADMIN_USERNAME, ADMIN_PASSWORD } = require('./config');
const { log } = require('./logger');

function adminAuthenticate(req, res) {
  const clientIp = req.socket.remoteAddress;

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    log('warn', 'Admin auth attempt without credentials', { clientIp });
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Admin Dashboard"'
    });
    res.end('Authentication required');
    return false;
  }

  try {
    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
    const [username, password] = auth.split(':');

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      log('warn', 'Failed admin auth attempt', { clientIp, username });
      res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="Admin Dashboard"'
      });
      res.end('Invalid credentials');
      return false;
    }

    log('debug', 'Admin auth successful', { clientIp, username });
    return true;
  } catch (error) {
    log('error', 'Admin auth error', { clientIp, error: error.message });
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Admin Dashboard"'
    });
    res.end('Invalid credentials');
    return false;
  }
}

module.exports = { adminAuthenticate };
```

- [ ] **Step 2: Create test/admin-auth.test.js**

```js
process.env.PORT = '8080';
process.env.AUTH_ENABLED = 'false';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'adminpassword123';
process.env.LOG_LEVEL = 'error';

const { adminAuthenticate } = require('../src/admin-auth');

describe('Admin Authentication Module', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: {}
    };
    mockRes = {
      writeHead: jest.fn(),
      end: jest.fn()
    };
  });

  test('should reject request without auth header', () => {
    const result = adminAuthenticate(mockReq, mockRes);
    expect(result).toBe(false);
    expect(mockRes.writeHead).toHaveBeenCalledWith(401, {
      'WWW-Authenticate': 'Basic realm="Admin Dashboard"'
    });
  });

  test('should reject request with invalid credentials', () => {
    const invalidAuth = Buffer.from('wrong:wrong').toString('base64');
    mockReq.headers['authorization'] = `Basic ${invalidAuth}`;
    const result = adminAuthenticate(mockReq, mockRes);
    expect(result).toBe(false);
  });

  test('should accept request with valid credentials', () => {
    const validAuth = Buffer.from('admin:adminpassword123').toString('base64');
    mockReq.headers['authorization'] = `Basic ${validAuth}`;
    const result = adminAuthenticate(mockReq, mockRes);
    expect(result).toBe(true);
    expect(mockRes.writeHead).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx jest test/admin-auth.test.js --verbose
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/admin-auth.js test/admin-auth.test.js
git commit -m "feat: add admin authentication module and tests"
```

---

### Task 4: Admin handler (HTML page + SSE + API routes)

**Files:**
- Create: `src/admin.js`

**Interfaces:**
- Consumes: `adminAuthenticate` from admin-auth.js, `proxyState` from proxy-state.js, `getSnapshot`, `getHistory` from metrics.js, `log` from logger.js
- Produces: `handleAdmin(req, res)` — dispatches routes under `/admin`

- [ ] **Step 1: Create src/admin.js**

```js
const url = require('url');
const { log } = require('./logger');
const { adminAuthenticate } = require('./admin-auth');
const proxyState = require('./proxy-state');
const metrics = require('./metrics');

const sseClients = new Set();

function broadcast(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(message);
  }
}

function serveAdminPage(res) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Proxy Admin</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
.container { max-width: 900px; margin: 0 auto; }
.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
.header h1 { font-size: 24px; font-weight: 600; }
.status-badge { padding: 6px 16px; border-radius: 999px; font-size: 14px; font-weight: 500; }
.status-badge.enabled { background: #166534; color: #bbf7d0; }
.status-badge.disabled { background: #991b1b; color: #fecaca; }
.toggle-row { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; }
.toggle { position: relative; width: 64px; height: 32px; cursor: pointer; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle .slider { position: absolute; inset: 0; background: #334155; border-radius: 32px; transition: 0.3s; }
.toggle .slider::before { content: ''; position: absolute; height: 26px; width: 26px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: 0.3s; }
.toggle input:checked + .slider { background: #22c55e; }
.toggle input:checked + .slider::before { transform: translateX(32px); }
.toggle-label { font-size: 16px; font-weight: 500; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
.stat-card { background: #1e293b; border-radius: 12px; padding: 20px; }
.stat-card .label { font-size: 12px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; }
.stat-card .value { font-size: 28px; font-weight: 700; margin-top: 4px; }
.chart-container { background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 32px; }
.chart-container h2 { font-size: 14px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; margin-bottom: 16px; }
.history-table { background: #1e293b; border-radius: 12px; padding: 20px; }
.history-table h2 { font-size: 14px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; margin-bottom: 16px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #334155; font-size: 13px; }
th { color: #94a3b8; font-weight: 500; }
.button { padding: 8px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; }
.button-primary { background: #3b82f6; color: #fff; }
.button-primary:hover { background: #2563eb; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Proxy Admin</h1>
<span id="statusBadge" class="status-badge enabled">Enabled</span>
</div>
<div class="toggle-row">
<label class="toggle">
<input type="checkbox" id="proxyToggle" checked onchange="toggleProxy()">
<span class="slider"></span>
</label>
<span class="toggle-label" id="toggleLabel">Proxy is ON</span>
</div>
<div class="stats">
<div class="stat-card">
<div class="label">Active Connections</div>
<div class="value" id="activeConns">0</div>
</div>
<div class="stat-card">
<div class="label">Total Transferred</div>
<div class="value" id="totalBytes">0 B</div>
</div>
<div class="stat-card">
<div class="label">Requests / min</div>
<div class="value" id="requestsPerMin">0</div>
</div>
</div>
<div class="chart-container">
<h2>Requests per Second (last 60s)</h2>
<canvas id="reqChart" height="150"></canvas>
</div>
<div class="history-table">
<h2>Connection History</h2>
<table>
<thead><tr><th>Time</th><th>Connections</th></tr></thead>
<tbody id="historyBody"></tbody>
</table>
</div>
</div>
<script>
let reqChart = null;
const evtSource = new EventSource('/admin/api/events');
evtSource.onmessage = (e) => {
  const data = JSON.parse(e.data);
  if (data.type === 'metrics') {
    updateStats(data);
    updateChart(data);
    updateHistory(data);
  }
  if (data.type === 'state') {
    updateToggle(data.enabled);
  }
};
evtSource.onerror = () => console.log('SSE disconnected, reconnecting...');

function updateStats(data) {
  document.getElementById('activeConns').textContent = data.activeConnections;
  document.getElementById('totalBytes').textContent = formatBytes(data.totalBytes.sent + data.totalBytes.received);
  document.getElementById('requestsPerMin').textContent = data.requestsPerMin;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function updateChart(data) {
  if (!reqChart) {
    const ctx = document.getElementById('reqChart').getContext('2d');
    reqChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Requests/sec',
          data: [],
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: { beginAtZero: true, grid: { color: '#1e293b' } }
        }
      }
    });
  }
  const now = new Date().toLocaleTimeString();
  reqChart.data.labels.push(now);
  reqChart.data.datasets[0].data.push(data.activeConnections);
  if (reqChart.data.labels.length > 60) {
    reqChart.data.labels.shift();
    reqChart.data.datasets[0].data.shift();
  }
  reqChart.update();
}

function updateHistory(data) {
  const tbody = document.getElementById('historyBody');
  if (data.history && data.history.length > 0) {
    const last = data.history[data.history.length - 1];
    const row = document.createElement('tr');
    const time = new Date(last.time).toLocaleTimeString();
    row.innerHTML = '<td>' + time + '</td><td>' + last.connections + '</td>';
    tbody.appendChild(row);
    while (tbody.children.length > 60) tbody.removeChild(tbody.firstChild);
  }
}

function updateToggle(enabled) {
  document.getElementById('proxyToggle').checked = enabled;
  document.getElementById('toggleLabel').textContent = enabled ? 'Proxy is ON' : 'Proxy is OFF';
  const badge = document.getElementById('statusBadge');
  badge.textContent = enabled ? 'Enabled' : 'Disabled';
  badge.className = 'status-badge ' + (enabled ? 'enabled' : 'disabled');
}

async function toggleProxy() {
  try {
    const res = await fetch('/admin/api/toggle', { method: 'POST' });
    const data = await res.json();
    updateToggle(data.enabled);
  } catch (err) {
    console.error('Toggle failed:', err);
  }
}
</script>
</body>
</html>`;

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}

function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  sseClients.add(res);

  // Push initial state
  const snapshot = metrics.getSnapshot();
  res.write(`data: ${JSON.stringify({ type: 'metrics', ...snapshot, history: metrics.getHistory() })}\n\n`);

  const interval = setInterval(() => {
    const snap = metrics.getSnapshot();
    res.write(`data: ${JSON.stringify({ type: 'metrics', ...snap, history: metrics.getHistory() })}\n\n`);
  }, 1000);

  req.on('close', () => {
    clearInterval(interval);
    sseClients.delete(res);
  });
}

function handleAdmin(req, res) {
  const parsedUrl = url.parse(req.url);

  if (parsedUrl.pathname === '/admin') {
    serveAdminPage(res);
    return;
  }

  if (parsedUrl.pathname === '/admin/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      enabled: proxyState.enabled,
      metrics: metrics.getSnapshot(),
      history: metrics.getHistory()
    }));
    return;
  }

  if (parsedUrl.pathname === '/admin/api/toggle' && req.method === 'POST') {
    const newState = proxyState.toggle();
    log('info', 'Proxy state toggled', { enabled: newState });

    broadcast({ type: 'state', enabled: newState });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ enabled: newState }));
    return;
  }

  if (parsedUrl.pathname === '/admin/api/events') {
    handleSSE(req, res);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
}

module.exports = { handleAdmin };
```

- [ ] **Step 2: Commit**

```bash
git add src/admin.js
git commit -m "feat: add admin handler with SSE, toggle API, and Chart.js dashboard"
```

---

### Task 5: Wire handlers with metrics and proxy-state

**Files:**
- Modify: `src/handlers/http.js`
- Modify: `src/handlers/https.js`
- Modify: `src/handlers/websocket.js`

- [ ] **Step 1: Update http.js — add metrics calls**

Add at top:
```js
const proxyState = require('../proxy-state');
const metrics = require('../metrics');
```

Add at the beginning of `handleHTTPProxy`:
```js
if (!proxyState.enabled) {
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Proxy is disabled' }));
  return;
}
```

After `const clientIp = req.socket.remoteAddress;` add:
```js
metrics.connectionOpen();
metrics.recordRequest();
```

Add a `res.on('close')` handler or at the `proxyRes.pipe(res)` point add bytes tracking. Best approach: track response bytes after piping. Add after the `proxyRes.on('data')`:

Actually, the simplest approach: track bytes from the proxy response. Add after line `proxyRes.pipe(res);`:

```js
let bytesReceived = 0;
proxyRes.on('data', (chunk) => { bytesReceived += chunk.length; });
proxyRes.on('end', () => {
  metrics.recordBytes(0, bytesReceived);
});
```

Let me think about request bytes. For HTTP, `req.pipe(proxyReq)` sends the request body. We can track those too:

```js
let bytesSent = 0;
req.on('data', (chunk) => { bytesSent += chunk.length; });
```

Add a `res.on('close')` and error path to decrement connection:

```js
const cleanup = () => metrics.connectionClose();
req.on('close', cleanup);
res.on('close', cleanup);
```

Actually, to keep things simple and not overcomplicate, let me just track connections and bytes at the response level. The key thing is connections are tracked correctly and bytes are recorded.

Let me write the actual edits for http.js.

Full replacements needed for http.js:

1. Add requires after existing ones
2. Add proxy-state check after URL validation
3. Add metrics calls at appropriate points

- [ ] **Step 2: Update https.js**

Add requires:
```js
const proxyState = require('../proxy-state');
const metrics = require('../metrics');
```

Add after hostname validation:
```js
if (!proxyState.enabled) {
  clientSocket.write(`HTTP/${req.httpVersion} 503 Service Unavailable\r\n\r\n`);
  clientSocket.end();
  return;
}
```

Add `metrics.connectionOpen()` after `const clientIp` line.
Add `metrics.connectionClose()` in the close handlers.

Track bytes in pipe — simplest: wrap the pipe to count.

Actually, for TCP tunnels, counting bytes is harder because it's raw streaming. Let me just track connections for CONNECT. We can add basic byte counting from the pipe events.

Let me add:
```js
let bytesUp = 0, bytesDown = 0;
serverSocket.pipe(clientSocket);
clientSocket.pipe(serverSocket);
```

Replace with:
```js
serverSocket.on('data', (chunk) => { bytesDown += chunk.length; });
clientSocket.on('data', (chunk) => { bytesUp += chunk.length; });
serverSocket.pipe(clientSocket);
clientSocket.pipe(serverSocket);
```

And add in close handlers:
```js
metrics.recordBytes(bytesUp, bytesDown);
```

- [ ] **Step 3: Update websocket.js**

Same pattern as https.js — proxy-state check, connection tracking, byte counting.

- [ ] **Step 4: Commit**

```bash
git add src/handlers/http.js src/handlers/https.js src/handlers/websocket.js
git commit -m "feat: wire proxy-state and metrics into all three handlers"
```

---

### Task 6: Wire server.js

**Files:**
- Modify: `src/server.js`

- [ ] **Step 1: Update server.js**

Add requires at top:
```js
const { handleAdmin } = require('./handlers/../admin');
const { adminAuthenticate } = require('./handlers/../admin-auth');
const proxyState = require('./proxy-state');
```

Wait, the paths are wrong. From `src/server.js`:
```js
const { handleAdmin } = require('./admin');
const { adminAuthenticate } = require('./admin-auth');
const proxyState = require('./proxy-state');
```

Add admin route in the HTTP createServer callback — right after the health check and before proxy auth:
```js
if (req.url.startsWith('/admin')) {
  if (!adminAuthenticate(req, res)) return;
  handleAdmin(req, res);
  return;
}
```

Add proxy-state checks in the connect and upgrade handlers — import proxyState and check before processing.

Actually, the proxy-state check should go in the handlers (already done in Task 5), not in server.js. But the admin route dispatching happens in server.js. Let me keep it clean — proxy-state check in handlers, admin routing in server.js.

Also add metrics tracking for `connectionOpen` in the connect/upgrade handlers in server.js if not done elsewhere.

Wait, looking at server.js more carefully:

For HTTP handler:
```js
handleHTTPProxy(req, res); // proxy-state check is inside http.js
```

For connect:
```js
if (AUTH_ENABLED && !authenticate(req, { ... })) return;
// ...
handleHTTPSProxy(req, clientSocket, head);
```

For upgrade:
```js
if (AUTH_ENABLED && !authenticate(req, { ... })) return;
// ...
handleWebSocketUpgrade(req, socket);
```

The proxy-state checks are in the handlers, so server.js just needs to import admin routes.

- [ ] **Step 2: Run existing tests to verify nothing breaks**

```bash
npx jest --verbose
```

Expected: all existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/server.js
git commit -m "feat: wire admin routes into server.js"
```

---

### Task 7: Admin integration tests + update AGENTS.md

**Files:**
- Create: `test/admin.test.js`
- Modify: `AGENTS.md`

- [ ] **Step 1: Create test/admin.test.js**

```js
process.env.PORT = '8080';
process.env.AUTH_ENABLED = 'false';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'adminpassword123';
process.env.LOG_LEVEL = 'error';

const http = require('http');
const { handleAdmin } = require('../src/admin');

describe('Admin Module', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      socket: { remoteAddress: '127.0.0.1' },
      method: 'GET',
      url: '',
      headers: {
        authorization: 'Basic ' + Buffer.from('admin:adminpassword123').toString('base64')
      }
    };
    mockRes = {
      _headers: {},
      _data: '',
      writeHead(status, headers) {
        this._status = status;
        if (headers) Object.assign(this._headers, headers);
      },
      end(data) {
        this._ended = true;
        this._data = data || '';
      },
      write(data) {
        this._data += data;
      }
    };
  });

  test('should serve admin page', () => {
    mockReq.url = '/admin';
    handleAdmin(mockReq, mockRes);
    expect(mockRes._status).toBe(200);
    expect(mockRes._data).toContain('Proxy Admin');
  });

  test('should return status JSON', () => {
    mockReq.url = '/admin/api/status';
    handleAdmin(mockReq, mockRes);
    expect(mockRes._status).toBe(200);
    const body = JSON.parse(mockRes._data);
    expect(body).toHaveProperty('enabled');
    expect(body).toHaveProperty('metrics');
  });

  test('should toggle proxy state', () => {
    mockReq.url = '/admin/api/toggle';
    mockReq.method = 'POST';
    handleAdmin(mockReq, mockRes);
    expect(mockRes._status).toBe(200);
    const body = JSON.parse(mockRes._data);
    expect(body).toHaveProperty('enabled');
  });

  test('should return 404 for unknown admin routes', () => {
    mockReq.url = '/admin/api/unknown';
    handleAdmin(mockReq, mockRes);
    expect(mockRes._status).toBe(404);
  });

  test('should return SSE content type', () => {
    mockReq.url = '/admin/api/events';
    handleAdmin(mockReq, mockRes);
    expect(mockRes._status).toBe(200);
    expect(mockRes._headers['content-type']).toBe('text/event-stream');
  });
});
```

- [ ] **Step 2: Run all tests**

```bash
npx jest --verbose
```

Expected: ALL tests PASS (existing + new)

- [ ] **Step 3: Update AGENTS.md with new env vars and modules**

Add to the config table:
```
| `ADMIN_USERNAME` | (required) | Admin dashboard username, min 3 chars |
| `ADMIN_PASSWORD` | (required) | Admin dashboard password, min 8 chars |
```

Add to the module table:
```
| Admin UI | `src/admin.js` | SSE dashboard, toggle API, Chart.js page |
| Admin auth | `src/admin-auth.js` | Basic auth for /admin routes |
| Proxy state | `src/proxy-state.js` | Singleton on/off toggle |
| Metrics | `src/metrics.js` | In-memory counters: connections, bytes, rate |
```

Add to the routes table:
```
| `/admin` | GET | Admin dashboard page (admin auth) |
| `/admin/api/status` | GET | JSON state + metrics (admin auth) |
| `/admin/api/toggle` | POST | Toggle proxy on/off (admin auth) |
| `/admin/api/events` | GET | SSE metrics stream (admin auth) |
```

- [ ] **Step 4: Commit**

```bash
git add test/admin.test.js AGENTS.md
git commit -m "feat: add admin integration tests and update AGENTS.md"
```

---

### Task 8: Full verification pass

- [ ] **Step 1: Run linter**

```bash
npm run lint
```

Expected: no errors (or only pre-existing warnings)

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: ALL tests PASS

- [ ] **Step 3: Manual smoke test**

```bash
# Start server in background
node src/server.js &
sleep 2

# Health check
curl -s http://localhost:8080/health | head -c 200

# Admin page
curl -s -u 'admin:adminpassword123' http://localhost:8080/admin | head -c 200

# Status API
curl -s -u 'admin:adminpassword123' http://localhost:8080/admin/api/status

# Toggle
curl -s -X POST -u 'admin:adminpassword123' http://localhost:8080/admin/api/toggle

# Verify proxy is disabled (should get 503)
curl -s http://localhost:8080/http://example.com

# Re-enable
curl -s -X POST -u 'admin:adminpassword123' http://localhost:8080/admin/api/toggle

# Kill server
kill %1 2>/dev/null
```

Expected: health check works, admin page loads, status returns JSON, toggle works, disabled proxy returns 503

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address lint and test issues"
```
