const net = require('net');
const { log } = require('../logger');
const { CONNECTION_TIMEOUT } = require('../config');
const proxyState = require('../proxy-state');
const metrics = require('../metrics');
const blocker = require('../blocker');

function handleHTTPSProxy(req, clientSocket, head) {
  const clientIp = clientSocket.remoteAddress;
  const [hostname, port] = req.url.split(':');
  const targetPort = port || 443;
  const proto = (targetPort === 443) ? 'WSS' : 'HTTPS';
  
  if (!hostname) {
    log('error', 'Invalid hostname in HTTPS CONNECT', {
      clientIp: clientIp,
      url: req.url
    });
    clientSocket.write(`HTTP/${req.httpVersion} 400 Bad Request\r\n\r\n`);
    clientSocket.end();
    return;
  }
  
  const check = blocker.isBlocked(clientIp, hostname, targetPort);
  if (check.blocked) {
    log('warn', 'Blocked HTTPS CONNECT', { clientIp, targetHost: hostname, reason: check.reason });
    metrics.logRequest({
      sourceIp: clientIp,
      method: proto,
      targetHost: hostname,
      targetPort: targetPort,
      protocol: proto,
      statusCode: 403
    });
    clientSocket.write(`HTTP/${req.httpVersion} 403 Forbidden\r\nContent-Type: application/json\r\n\r\n{"error":"${check.reason}"}`);
    clientSocket.end();
    return;
  }

  if (!proxyState.enabled) {
    metrics.logRequest({
      sourceIp: clientIp,
      method: proto,
      targetHost: hostname,
      targetPort: targetPort,
      protocol: proto,
      statusCode: 503
    });
    clientSocket.write(`HTTP/${req.httpVersion} 503 Service Unavailable\r\n\r\n`);
    clientSocket.end();
    return;
  }
  
  metrics.connectionOpen();
  metrics.logRequest({
    sourceIp: clientIp,
    method: proto,
    targetHost: hostname,
    targetPort: targetPort,
    protocol: proto,
    statusCode: 200
  });

  let cleanedUp = false;
  let bytesUp = 0, bytesDown = 0;
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    metrics.recordBytes(bytesUp, bytesDown);
    metrics.connectionClose();
  }
  
  const serverOptions = {
    host: hostname,
    port: targetPort,
    timeout: CONNECTION_TIMEOUT
  };

  log('info', 'HTTPS CONNECT request received', {
    clientIp: clientIp,
    code: 'CONNECT'
  });
  
  log('debug', 'HTTPS CONNECT request details', {
    clientIp: clientIp,
    targetHost: hostname,
    targetPort: targetPort,
    httpVersion: req.httpVersion,
    url: req.url
  });

  const serverSocket = net.connect(serverOptions, () => {
    log('info', 'HTTPS connection established', {
      clientIp: clientIp,
      code: 'HTTPS_OK'
    });
    
    log('debug', 'HTTPS connection details', {
      clientIp: clientIp,
      targetHost: hostname,
      targetPort: targetPort
    });
    
    clientSocket.write(`HTTP/${req.httpVersion} 200 Connection Established\r\n\r\n`);
    serverSocket.write(head);
    serverSocket.on('data', (chunk) => { bytesDown += chunk.length; });
    clientSocket.on('data', (chunk) => { bytesUp += chunk.length; });
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on('error', (err) => {
    log('error', 'HTTPS proxy server error', {
      clientIp: clientIp,
      code: 'HTTPS_ERR'
    });
    
    log('debug', 'HTTPS proxy server error details', {
      clientIp: clientIp,
      targetHost: hostname,
      targetPort: targetPort,
      error: err.message,
      stack: err.stack
    });
    
    clientSocket.write(`HTTP/${req.httpVersion} 502 Bad Gateway\r\n`);
    clientSocket.write('Content-Type: text/plain\r\n');
    clientSocket.write(`Content-Length: ${err.message.length}\r\n`);
    clientSocket.write('\r\n');
    clientSocket.write(err.message);
    clientSocket.end();
    cleanup();
  });

  serverSocket.on('timeout', () => {
    log('error', 'HTTPS proxy timeout', {
      clientIp: clientIp,
      code: 'HTTPS_TIMEOUT',
      targetHost: hostname,
      targetPort: targetPort
    });
    
    serverSocket.destroy();
    clientSocket.end();
    cleanup();
  });

  clientSocket.on('error', (err) => {
    log('error', 'HTTPS client socket error', {
      clientIp: clientIp,
      code: 'CLIENT_ERR'
    });
    
    log('debug', 'HTTPS client socket error details', {
      clientIp: clientIp,
      targetHost: hostname,
      targetPort: targetPort,
      error: err.message,
      stack: err.stack
    });
    
    serverSocket.end();
    cleanup();
  });

  serverSocket.on('close', () => {
    log('info', 'HTTPS server connection closed', {
      clientIp: clientIp,
      targetHost: hostname,
      targetPort: targetPort
    });
    cleanup();
  });

  clientSocket.on('close', () => {
    log('info', 'HTTPS client connection closed', {
      clientIp: clientIp,
      targetHost: hostname,
      targetPort: targetPort
    });
    cleanup();
  });
}

module.exports = { handleHTTPSProxy };
