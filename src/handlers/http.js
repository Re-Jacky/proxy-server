const http = require('http');
const url = require('url');
const { log } = require('../logger');
const { REQUEST_TIMEOUT } = require('../config');
const proxyState = require('../proxy-state');
const metrics = require('../metrics');
const blocker = require('../blocker');

function handleHTTPProxy(req, res) {
  const clientIp = req.socket.remoteAddress;
  const parsedUrl = url.parse(req.url);
  
  if (!parsedUrl.hostname) {
    log('error', 'Invalid URL in HTTP request', {
      clientIp: clientIp,
      url: req.url
    });
    res.writeHead(400);
    res.end('Bad Request: Invalid URL');
    return;
  }
  
  const check = blocker.isBlocked(clientIp, parsedUrl.hostname, parsedUrl.port || 80);
  if (check.blocked) {
    log('warn', 'Blocked request', { clientIp, targetHost: parsedUrl.hostname, reason: check.reason });
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: check.reason }));
    return;
  }

  metrics.recordRequest();
  metrics.connectionOpen();
  
  let cleanedUp = false;
  let bytesSent = 0;
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    metrics.connectionClose();
  }
  
  if (!proxyState.enabled) {
    cleanup();
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy is disabled' }));
    return;
  }
  
  log('info', 'HTTP request received', {
    clientIp: clientIp,
    code: 'REQ'
  });
  
  log('debug', 'HTTP request details', {
    clientIp: clientIp,
    method: req.method,
    url: req.url,
    headers: req.headers,
    httpVersion: req.httpVersion
  });

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || 80,
    path: parsedUrl.path,
    method: req.method,
    headers: req.headers,
    timeout: REQUEST_TIMEOUT
  };

  delete options.headers['proxy-authorization'];

  req.on('data', (chunk) => { bytesSent += chunk.length; });

  const proxyReq = http.request(options, (proxyRes) => {
    log('info', 'HTTP response received', {
      clientIp: clientIp,
      code: 'RES',
      statusCode: proxyRes.statusCode
    });
    
    log('debug', 'HTTP response details', {
      clientIp: clientIp,
      method: req.method,
      url: req.url,
      statusCode: proxyRes.statusCode,
      statusMessage: proxyRes.statusMessage,
      headers: proxyRes.headers
    });
    
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    let bytesReceived = 0;
    proxyRes.on('data', (chunk) => { bytesReceived += chunk.length; });
    proxyRes.on('end', () => {
      metrics.recordBytes(bytesSent, bytesReceived);
      metrics.logRequest({
        sourceIp: clientIp,
        method: req.method,
        targetHost: parsedUrl.hostname,
        targetPort: parsedUrl.port || 80,
        protocol: 'HTTP',
        statusCode: proxyRes.statusCode,
        bytesSent,
        bytesReceived
      });
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    log('error', 'HTTP proxy error', {
      clientIp: clientIp,
      code: 'ERR'
    });
    
    log('debug', 'HTTP proxy error details', {
      clientIp: clientIp,
      method: req.method,
      url: req.url,
      error: err.message,
      stack: err.stack
    });
    
    if (!res.headersSent) {
      res.writeHead(500);
      res.end('Proxy error');
    }
    cleanup();
  });

  proxyReq.on('timeout', () => {
    log('error', 'HTTP proxy timeout', {
      clientIp: clientIp,
      code: 'TIMEOUT',
      url: req.url
    });
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504);
      res.end('Gateway Timeout');
    }
    cleanup();
  });

  proxyReq.on('socket', () => {
    log('debug', 'HTTP proxy connection established', {
      clientIp: clientIp,
      targetHost: parsedUrl.hostname,
      targetPort: parsedUrl.port || 80
    });
  });

  // Clean up on client disconnect / response complete
  res.on('close', cleanup);

  req.pipe(proxyReq);
}

module.exports = { handleHTTPProxy };
