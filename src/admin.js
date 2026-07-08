const url = require('url');
const { log } = require('./logger');
const { adminAuthenticate } = require('./admin-auth');
const proxyState = require('./proxy-state');
const metrics = require('./metrics');
const blocker = require('./blocker');

const sseClients = new Set();

function broadcast(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (err) {
      sseClients.delete(client);
    }
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
.history-wrapper { max-height: 320px; overflow-y: auto; }
.history-wrapper::-webkit-scrollbar { width: 6px; }
.history-wrapper::-webkit-scrollbar-track { background: #0f172a; border-radius: 3px; }
.history-wrapper::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #334155; font-size: 13px; }
th { color: #94a3b8; font-weight: 500; position: sticky; top: 0; background: #1e293b; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px; }
.pagination button { padding: 6px 14px; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; background: #334155; color: #e2e8f0; }
.pagination button:hover { background: #475569; }
.pagination button:disabled { opacity: 0.4; cursor: default; }
.pagination span { font-size: 13px; color: #94a3b8; }
.button { padding: 8px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; }
.button-primary { background: #3b82f6; color: #fff; }
.button-primary:hover { background: #2563eb; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Proxy Admin</h1>
<div style="display:flex;align-items:center;gap:12px;">
<a href="/admin/blocks" style="display:inline-block;padding:6px 14px;background:#dc2626;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;">Block Rules</a>
<span id="statusBadge" class="status-badge enabled">Enabled</span>
</div>
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
<div class="history-wrapper">
<table>
<thead><tr><th>Time</th><th>Connections</th></tr></thead>
<tbody id="historyBody"></tbody>
</table>
</div>
<div class="pagination">
<button id="prevPage" onclick="changePage(-1)" disabled>Prev</button>
<span id="pageInfo">Page 1</span>
<button id="nextPage" onclick="changePage(1)" disabled>Next</button>
</div>
</div>
</div>
<script>
let reqChart = null;
let historyData = [];
let currentPage = 1;
const PER_PAGE = 10;
const evtSource = new EventSource('/admin/api/events');
evtSource.onmessage = (e) => {
  try {
    const data = JSON.parse(e.data);
    if (data.type === 'metrics') {
      updateStats(data);
      updateChart(data);
      updateHistory(data);
    }
    if (data.type === 'state') {
      updateToggle(data.enabled);
    }
  } catch (err) {
    console.error('SSE parse error:', err);
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
  if (data.history) {
    historyData = data.history;
    const totalPages = Math.max(1, Math.ceil(historyData.length / PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    renderHistoryPage();
  }
}

function renderHistoryPage() {
  const tbody = document.getElementById('historyBody');
  const totalPages = Math.max(1, Math.ceil(historyData.length / PER_PAGE));
  const start = (currentPage - 1) * PER_PAGE;
  const page = historyData.slice(start, start + PER_PAGE);

  tbody.innerHTML = '';
  for (const entry of page) {
    const row = document.createElement('tr');
    const time = new Date(entry.time).toLocaleTimeString();
    row.innerHTML = '<td>' + time + '</td><td>' + entry.connections + '</td>';
    tbody.appendChild(row);
  }

  if (historyData.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="2" style="text-align:center;color:#64748b;">No data</td>';
    tbody.appendChild(row);
  }

  document.getElementById('pageInfo').textContent = 'Page ' + currentPage + ' of ' + totalPages;
  document.getElementById('prevPage').disabled = currentPage <= 1;
  document.getElementById('nextPage').disabled = currentPage >= totalPages;
}

function changePage(delta) {
  const totalPages = Math.max(1, Math.ceil(historyData.length / PER_PAGE));
  const newPage = currentPage + delta;
  if (newPage < 1 || newPage > totalPages) return;
  currentPage = newPage;
  renderHistoryPage();
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

function handleBlocksApi(req, res) {
  // Body parsing helper
  const readBody = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch (e) { resolve({}); }
    });
  });

  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(blocker.getBlocks()));
    return;
  }

  readBody().then(body => {
    if (req.url.includes('/source-ip')) {
      if (body.ip) {
        if (req.method === 'POST') blocker.addSourceIp(body.ip);
        else blocker.removeSourceIp(body.ip);
        log('info', req.method === 'POST' ? 'Source IP blocked' : 'Source IP unblocked', { ip: body.ip });
      }
    } else if (req.url.includes('/target-ip')) {
      if (body.ip) {
        if (req.method === 'POST') blocker.addTargetIp(body.ip);
        else blocker.removeTargetIp(body.ip);
        log('info', req.method === 'POST' ? 'Target IP blocked' : 'Target IP unblocked', { ip: body.ip });
      }
    } else if (req.url.includes('/port')) {
      const port = parseInt(body.port, 10);
      if (!isNaN(port)) {
        if (req.method === 'POST') blocker.addPort(port);
        else blocker.removePort(port);
        log('info', req.method === 'POST' ? 'Port blocked' : 'Port unblocked', { port });
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(blocker.getBlocks()));
  });
}

function serveBlocksPage(res) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Block Rules - Proxy Admin</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
.container { max-width: 700px; margin: 0 auto; }
.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
.header h1 { font-size: 24px; font-weight: 600; }
.back-link { display:inline-block; padding:6px 14px; background:#334155; color:#e2e8f0; border-radius:6px; text-decoration:none; font-size:13px; }
.back-link:hover { background: #475569; }
.section { background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
.section h2 { font-size: 14px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; margin-bottom: 16px; }
.block-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 14px; }
.block-item:last-child { border-bottom: none; }
.remove-btn { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 13px; padding: 4px 8px; border-radius: 4px; }
.remove-btn:hover { background: #450a0a; }
.add-row { display: flex; gap: 8px; margin-top: 12px; }
.add-row input { flex: 1; padding: 8px 12px; border: 1px solid #334155; border-radius: 6px; background: #0f172a; color: #e2e8f0; font-size: 14px; outline: none; }
.add-row input:focus { border-color: #3b82f6; }
.add-row button { padding: 8px 16px; border: none; border-radius: 6px; background: #3b82f6; color: #fff; font-size: 14px; cursor: pointer; }
.add-row button:hover { background: #2563eb; }
.add-row button:active { background: #1d4ed8; }
.empty { text-align: center; color: #64748b; font-size: 14px; padding: 16px 0; }
.help-text { font-size: 12px; color: #64748b; margin-top: 6px; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Block Rules</h1>
<a href="/admin" class="back-link">&larr; Dashboard</a>
</div>

<div class="section">
<h2>Blocked Source IPs (Client)</h2>
<div id="sourceIpList"></div>
<div class="add-row">
<input id="sourceIpInput" type="text" placeholder="e.g. 10.0.0.1 or 192.168.0.0/16">
<button id="addSourceBtn">Add</button>
</div>
<div class="help-text">Blocks requests coming FROM this IP address</div>
</div>

<div class="section">
<h2>Blocked Target IPs (Destination)</h2>
<div id="targetIpList"></div>
<div class="add-row">
<input id="targetIpInput" type="text" placeholder="e.g. 203.0.113.5 or 10.0.0.0/8">
<button id="addTargetBtn">Add</button>
</div>
<div class="help-text">Blocks requests going TO this IP address</div>
</div>

<div class="section">
<h2>Blocked Ports</h2>
<div id="portList"></div>
<div class="add-row">
<input id="portInput" type="text" placeholder="e.g. 25">
<button id="addPortBtn">Add</button>
</div>
<div class="help-text">Blocks requests to this destination port</div>
</div>
</div>
<script>
function renderList(containerId, items, labelFn, removeFn) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  if (items.length === 0) {
    el.innerHTML = '<div class="empty">None</div>';
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const div = document.createElement('div');
    div.className = 'block-item';
    const label = typeof labelFn === 'function' ? labelFn(items[i]) : items[i];
    div.innerHTML = '<span>' + label + '</span><button class="remove-btn" data-idx="' + i + '">Remove</button>';
    div.querySelector('.remove-btn').onclick = function() { removeFn(items[i]); };
    el.appendChild(div);
  }
}

async function loadBlocks() {
  try {
    const res = await fetch('/admin/api/blocks');
    const data = await res.json();
    renderList('sourceIpList', data.sourceIps || [], null, function(ip) {
      fetch('/admin/api/blocks/source-ip', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: ip }) }).then(loadBlocks);
    });
    renderList('targetIpList', data.targetIps || [], null, function(ip) {
      fetch('/admin/api/blocks/target-ip', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: ip }) }).then(loadBlocks);
    });
    renderList('portList', data.ports || [], function(p) { return 'Port ' + p; }, function(port) {
      fetch('/admin/api/blocks/port', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: port }) }).then(loadBlocks);
    });
  } catch (err) {
    console.error('Failed to load blocks:', err);
  }
}

document.getElementById('addSourceBtn').onclick = function() {
  var input = document.getElementById('sourceIpInput');
  var ip = input.value.trim();
  if (!ip) return;
  input.disabled = true;
  fetch('/admin/api/blocks/source-ip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: ip }) })
    .then(function() { input.value = ''; input.disabled = false; loadBlocks(); })
    .catch(function() { input.disabled = false; });
};

document.getElementById('addTargetBtn').onclick = function() {
  var input = document.getElementById('targetIpInput');
  var ip = input.value.trim();
  if (!ip) return;
  input.disabled = true;
  fetch('/admin/api/blocks/target-ip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: ip }) })
    .then(function() { input.value = ''; input.disabled = false; loadBlocks(); })
    .catch(function() { input.disabled = false; });
};

document.getElementById('addPortBtn').onclick = function() {
  var input = document.getElementById('portInput');
  var port = input.value.trim();
  if (!port) return;
  input.disabled = true;
  fetch('/admin/api/blocks/port', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: parseInt(port) }) })
    .then(function() { input.value = ''; input.disabled = false; loadBlocks(); })
    .catch(function() { input.disabled = false; });
};

loadBlocks();
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

  const cleanup = () => {
    clearInterval(interval);
    sseClients.delete(res);
  };

  req.on('close', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
}

function handleAdmin(req, res) {
  const parsedUrl = url.parse(req.url);

  if (parsedUrl.pathname === '/admin') {
    serveAdminPage(res);
    return;
  }

  if (parsedUrl.pathname === '/admin/blocks') {
    serveBlocksPage(res);
    return;
  }

  if (parsedUrl.pathname.startsWith('/admin/api/blocks')) {
    handleBlocksApi(req, res);
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
