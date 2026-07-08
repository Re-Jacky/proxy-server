const net = require('net');
const url = require('url');
const { log } = require('../logger');
const { CONNECTION_TIMEOUT } = require('../config');
const proxyState = require('../proxy-state');
const metrics = require('../metrics');
const blocker = require('../blocker');

function handleWebSocketUpgrade(req, socket) {
  const clientIp = socket.remoteAddress;
  const parsedUrl = url.parse(req.url);
  const targetHost = parsedUrl.hostname;
  const targetPort = parsedUrl.port || (parsedUrl.protocol === 'wss:' ? 443 : 80);
  
  if (!targetHost) {
    log('error', 'Invalid URL in WebSocket request', {
      clientIp: clientIp,
      url: req.url
    });
    socket.write(`HTTP/${req.httpVersion} 400 Bad Request\r\n\r\n`);
    socket.end();
    return;
  }
  
  const check = blocker.isBlocked(clientIp, targetHost, targetPort);
  if (check.blocked) {
    log('warn', 'Blocked WebSocket', { clientIp, targetHost, reason: check.reason });
    metrics.logRequest({
      sourceIp: clientIp,
      method: 'WS',
      targetHost: targetHost,
      targetPort: targetPort,
      protocol: 'WS',
      statusCode: 403
    });
    socket.write(`HTTP/${req.httpVersion} 403 Forbidden\r\nContent-Type: application/json\r\n\r\n{"error":"${check.reason}"}`);
    socket.end();
    return;
  }

  if (!proxyState.enabled) {
    metrics.logRequest({
      sourceIp: clientIp,
      method: 'WS',
      targetHost: targetHost,
      targetPort: targetPort,
      protocol: 'WS',
      statusCode: 503
    });
    socket.write(`HTTP/${req.httpVersion} 503 Service Unavailable\r\n\r\n`);
    socket.end();
    return;
  }
  
  metrics.connectionOpen();
  
  metrics.logRequest({
    sourceIp: clientIp,
    method: 'WS',
    targetHost: targetHost,
    targetPort: targetPort,
    protocol: parsedUrl.protocol === 'wss:' ? 'WSS' : 'WS',
    statusCode: 101
  });
  
  let cleanedUp = false;
  let bytesUp = 0, bytesDown = 0;
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    metrics.recordBytes(bytesUp, bytesDown);
    metrics.connectionClose();
  }
  
  log('info', 'WebSocket connection request', {
    clientIp: clientIp,
    code: 'WS'
  });
  
  log('debug', 'WebSocket connection details', {
    clientIp: clientIp,
    url: req.url,
    targetHost: targetHost,
    targetPort: targetPort,
    protocol: parsedUrl.protocol
  });

  const serverSocket = net.connect({
    host: targetHost,
    port: targetPort,
    timeout: CONNECTION_TIMEOUT
  }, () => {
    log('info', 'WebSocket connection established', {
      clientIp: clientIp,
      code: 'WS_OK'
    });
    
    log('debug', 'WebSocket connection details', {
      clientIp: clientIp,
      targetHost: targetHost,
      targetPort: targetPort
    });

    socket.write(`HTTP/${req.httpVersion} 101 Switching Protocols\r\n`);
    socket.write('Upgrade: websocket\r\n');
    socket.write('Connection: Upgrade\r\n');
    
    if (req.headers['sec-websocket-key']) {
      socket.write(`Sec-WebSocket-Accept: ${req.headers['sec-websocket-key']}\r\n`);
    }
    
    socket.write('\r\n');

    serverSocket.on('data', (chunk) => { bytesDown += chunk.length; });
    socket.on('data', (chunk) => { bytesUp += chunk.length; });
    serverSocket.pipe(socket);
    socket.pipe(serverSocket);
  });

  serverSocket.on('error', (err) => {
    log('error', 'WebSocket proxy error', {
      clientIp: clientIp,
      code: 'WS_ERR'
    });
    
    log('debug', 'WebSocket proxy error details', {
      clientIp: clientIp,
      targetHost: targetHost,
      targetPort: targetPort,
      error: err.message,
      stack: err.stack
    });
    
    socket.end();
    cleanup();
  });

  serverSocket.on('timeout', () => {
    log('error', 'WebSocket proxy timeout', {
      clientIp: clientIp,
      code: 'WS_TIMEOUT',
      targetHost: targetHost,
      targetPort: targetPort
    });
    
    serverSocket.destroy();
    socket.end();
    cleanup();
  });

  socket.on('error', (err) => {
    log('error', 'WebSocket client error', {
      clientIp: clientIp,
      code: 'WS_CLIENT_ERR'
    });
    
    log('debug', 'WebSocket client error details', {
      clientIp: clientIp,
      targetHost: targetHost,
      targetPort: targetPort,
      error: err.message,
      stack: err.stack
    });
    
    serverSocket.end();
    cleanup();
  });

  serverSocket.on('close', () => {
    log('info', 'WebSocket server connection closed', {
      clientIp: clientIp,
      targetHost: targetHost,
      targetPort: targetPort
    });
    cleanup();
  });

  socket.on('close', () => {
    log('info', 'WebSocket client connection closed', {
      clientIp: clientIp,
      targetHost: targetHost,
      targetPort: targetPort
    });
    cleanup();
  });
}

module.exports = { handleWebSocketUpgrade };
