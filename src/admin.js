const url = require('url');
const { log } = require('./logger');
const { adminAuthenticate } = require('./admin-auth');
const proxyState = require('./proxy-state');
const metrics = require('./metrics');

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
