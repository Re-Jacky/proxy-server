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
  const initialEnabled = proxyState.enabled;
  const checkedAttr = initialEnabled ? 'checked' : '';
  const badgeClass = initialEnabled ? 'enabled' : 'disabled';
  const badgeText = initialEnabled ? 'Enabled' : 'Disabled';
  const toggleText = initialEnabled ? 'Proxy is ON' : 'Proxy is OFF';
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
<span id="statusBadge" class="status-badge ${badgeClass}">${badgeText}</span>
</div>
</div>
<div class="toggle-row">
<label class="toggle">
<input type="checkbox" id="proxyToggle" ${checkedAttr} onchange="toggleProxy()">
<span class="slider"></span>
</label>
<span class="toggle-label" id="toggleLabel">${toggleText}</span>
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
<h2>Request Log</h2>
<div class="add-row" style="margin-bottom:12px;">
<input id="filterIp" type="text" placeholder="Filter by IP" style="flex:1;padding:6px 10px;border:1px solid #334155;border-radius:4px;background:#0f172a;color:#e2e8f0;font-size:13px;outline:none;" oninput="renderRequestLog()">
<input id="filterPort" type="text" placeholder="Filter by port" style="width:100px;padding:6px 10px;border:1px solid #334155;border-radius:4px;background:#0f172a;color:#e2e8f0;font-size:13px;outline:none;" oninput="renderRequestLog()">
<button onclick="clearLog()" style="padding:6px 14px;border:none;border-radius:4px;background:#dc2626;color:#fff;font-size:13px;cursor:pointer;white-space:nowrap;">Clear</button>
</div>
<script>
function clearLog() {
  if (!confirm('Clear all request log entries?')) return;
  fetch('/admin/api/log/clear', { method: 'POST' }).then(function() { requestLog = []; renderRequestLog(); });
}
</script>
<div class="history-wrapper">
<table>
<thead><tr><th>Time</th><th>Source IP</th><th>Method</th><th>Target</th><th>Port</th><th>Status</th></tr></thead>
<tbody id="logBody"></tbody>
</table>
</div>
</div>
</div>
<script>
let reqChart = null;
let requestLog = [];
const evtSource = new EventSource('/admin/api/events');
evtSource.onmessage = (e) => {
  try {
    const data = JSON.parse(e.data);
    if (data.type === 'metrics') {
      updateStats(data);
      updateChart(data);
      updateRequestLog(data);
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

function updateRequestLog(data) {
  if (data.requestLog) {
    requestLog = data.requestLog;
  }
  if (data.newLog && data.newLog.length > 0) {
    for (const entry of data.newLog) {
      const exists = requestLog.some(function(e) { return e.seq === entry.seq; });
      if (!exists) requestLog.push(entry);
    }
    if (requestLog.length > 500) requestLog = requestLog.slice(-500);
  }
  renderRequestLog();
}

function renderRequestLog() {
  const tbody = document.getElementById('logBody');
  const filterIp = (document.getElementById('filterIp').value || '').trim().toLowerCase();
  const filterPort = (document.getElementById('filterPort').value || '').trim();

  var filtered = requestLog;
  if (filterIp) {
    filtered = filtered.filter(function(e) {
      return (e.sourceIp || '').toLowerCase().indexOf(filterIp) !== -1 || (e.targetHost || '').toLowerCase().indexOf(filterIp) !== -1;
    });
  }
  if (filterPort) {
    filtered = filtered.filter(function(e) {
      return String(e.targetPort || '').indexOf(filterPort) !== -1;
    });
  }

  var show = filtered.slice(-50).reverse();
  tbody.innerHTML = '';
  if (show.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748b;padding:32px;">No requests logged yet</td></tr>';
    return;
  }
  for (var i = 0; i < show.length; i++) {
    var e = show[i];
    var tr = document.createElement('tr');
    var time = new Date(e.time).toLocaleTimeString();
    tr.innerHTML = '<td>' + time + '</td><td>' + (e.sourceIp || '') + '</td><td>' + (e.method || '') + '</td><td>' + (e.targetHost || '') + '</td><td>' + (e.targetPort || '') + '</td><td>' + (e.statusCode || '') + '</td>';
    tbody.appendChild(tr);
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

function handleBlocksApi(req, res) {
  const readBody = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch (e) { resolve({}); }
    });
  });

  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ rules: blocker.getRules() }));
    return;
  }

  readBody().then(body => {
    if (body.type && body.ip) {
      const port = body.port !== undefined ? body.port : null;
      if (req.method === 'POST') {
        blocker.addRule(body.type, body.ip, port);
        log('info', 'Block rule added', { type: body.type, ip: body.ip, port });
      } else if (req.method === 'DELETE') {
        blocker.removeRule(body.type, body.ip, port !== null ? parseInt(port, 10) : null);
        log('info', 'Block rule removed', { type: body.type, ip: body.ip, port });
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ rules: blocker.getRules() }));
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
.container { max-width: 800px; margin: 0 auto; }
.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.header h1 { font-size: 24px; font-weight: 600; }
.back-link { display:inline-block; padding:6px 14px; background:#334155; color:#e2e8f0; border-radius:6px; text-decoration:none; font-size:13px; }
.back-link:hover { background: #475569; }
.card { background: #1e293b; border-radius: 12px; padding: 20px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px 12px; font-size: 14px; }
th { color: #94a3b8; font-weight: 500; border-bottom: 2px solid #334155; }
td { border-bottom: 1px solid #1e293b; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; }
.badge-source { background: #1e3a5f; color: #93c5fd; }
.badge-target { background: #5b1e1e; color: #fca5a5; }
.remove-btn { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 13px; padding: 4px 8px; border-radius: 4px; }
.remove-btn:hover { background: #450a0a; }
.add-row { display: flex; gap: 8px; margin-top: 16px; align-items: stretch; }
.add-row select, .add-row input { padding: 8px 12px; border: 1px solid #334155; border-radius: 6px; background: #0f172a; color: #e2e8f0; font-size: 14px; outline: none; }
.add-row select:focus, .add-row input:focus { border-color: #3b82f6; }
.add-row select { min-width: 80px; }
.add-row input[type="text"] { flex: 1; min-width: 0; }
.add-row input[type="number"] { width: 90px; }
.add-row button { padding: 8px 20px; border: none; border-radius: 6px; background: #22c55e; color: #fff; font-size: 14px; font-weight: 500; cursor: pointer; white-space: nowrap; }
.add-row button:hover { background: #16a34a; }
.empty { text-align: center; color: #64748b; font-size: 14px; padding: 32px 0; }
.help-text { font-size: 12px; color: #64748b; margin-top: 8px; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Block Rules</h1>
<a href="/admin" class="back-link">&larr; Dashboard</a>
</div>
<div class="card">
<table>
<thead><tr><th>Direction</th><th>IP / CIDR</th><th>Port</th><th></th></tr></thead>
<tbody id="rulesBody"></tbody>
</table>
<div class="add-row">
<select id="ruleType">
<option value="source">Source</option>
<option value="target">Target</option>
</select>
<input id="ruleIp" type="text" placeholder="IP or CIDR, e.g. 10.0.0.1 or 192.168.0.0/16">
<input id="rulePort" type="number" placeholder="Port (optional)" min="1" max="65535">
<button id="addRuleBtn">Add Rule</button>
</div>
<div class="help-text">Port is optional — leave blank to block all ports for this IP</div>
</div>
</div>
<script>
function renderRules(rules) {
  var tbody = document.getElementById('rulesBody');
  tbody.innerHTML = '';
  if (rules.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No rules defined. Add one above.</td></tr>';
    return;
  }
  for (var i = 0; i < rules.length; i++) {
    var r = rules[i];
    var tr = document.createElement('tr');
    var badgeClass = r.type === 'source' ? 'badge-source' : 'badge-target';
    var badgeLabel = r.type === 'source' ? 'Source' : 'Target';
    var portLabel = r.port !== null && r.port !== undefined ? r.port : 'All';
    tr.innerHTML = '<td><span class="badge ' + badgeClass + '">' + badgeLabel + '</span></td><td>' + escapeHtml(r.ip) + '</td><td>' + portLabel + '</td>';
    var removeTd = document.createElement('td');
    removeTd.style.textAlign = 'right';
    var removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = (function(rule) {
      return function() {
        fetch('/admin/api/blocks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: rule.type, ip: rule.ip, port: rule.port }) })
          .then(function(r) { return r.json(); })
          .then(function(d) { renderRules(d.rules); });
      };
    })(r);
    removeTd.appendChild(removeBtn);
    tr.appendChild(removeTd);
    tbody.appendChild(tr);
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.getElementById('addRuleBtn').onclick = function() {
  var type = document.getElementById('ruleType').value;
  var ip = document.getElementById('ruleIp').value.trim();
  var portInput = document.getElementById('rulePort').value.trim();
  if (!ip) { alert('Enter an IP address or CIDR range'); return; }
  var body = { type: type, ip: ip };
  if (portInput !== '') body.port = parseInt(portInput, 10);
  var btn = document.getElementById('addRuleBtn');
  btn.disabled = true;
  btn.textContent = 'Adding...';
  fetch('/admin/api/blocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      document.getElementById('ruleIp').value = '';
      document.getElementById('rulePort').value = '';
      renderRules(d.rules);
      btn.disabled = false;
      btn.textContent = 'Add Rule';
    })
    .catch(function() { btn.disabled = false; btn.textContent = 'Add Rule'; });
};

document.getElementById('ruleIp').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('addRuleBtn').click();
});
document.getElementById('rulePort').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('addRuleBtn').click();
});

fetch('/admin/api/blocks').then(function(r) { return r.json(); }).then(function(d) { renderRules(d.rules); });
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

  let lastSeq = 0;

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const allLog = metrics.getRequestLog();
  lastSeq = allLog.length > 0 ? allLog[allLog.length - 1].seq : 0;
  send({ type: 'state', enabled: proxyState.enabled });

  const interval = setInterval(() => {
    const full = metrics.getRequestLog();
    const newEntries = full.filter(e => e.seq > lastSeq);
    if (newEntries.length > 0) {
      lastSeq = full[full.length - 1].seq;
    }
    send({ type: 'metrics', ...metrics.getSnapshot(), history: metrics.getHistory(), newLog: newEntries.slice(-20) });
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

  if (parsedUrl.pathname === '/admin/api/log/clear' && req.method === 'POST') {
    metrics.clearRequestLog();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
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
