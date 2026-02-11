const net = require('net');
const url = require('url');
const { log } = require('../logger');
const { CONNECTION_TIMEOUT } = require('../config');

function isPrivateIP(hostname) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(hostname)) {
    return false;
  }
  
  const parts = hostname.split('.').map(Number);
  
  if (parts[0] === 127) return true;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  
  return false;
}

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
  
  if (isPrivateIP(targetHost)) {
    log('warn', 'SSRF attempt detected in WebSocket', {
      clientIp: clientIp,
      targetHost: targetHost,
      url: req.url
    });
    socket.write(`HTTP/${req.httpVersion} 403 Forbidden\r\n\r\n`);
    socket.end();
    return;
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
  });

  serverSocket.on('close', () => {
    log('info', 'WebSocket server connection closed', {
      clientIp: clientIp,
      targetHost: targetHost,
      targetPort: targetPort
    });
  });

  socket.on('close', () => {
    log('info', 'WebSocket client connection closed', {
      clientIp: clientIp,
      targetHost: targetHost,
      targetPort: targetPort
    });
  });
}

module.exports = { handleWebSocketUpgrade };
