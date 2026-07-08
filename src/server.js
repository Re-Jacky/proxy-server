const http = require('http');
const { PORT, AUTH_ENABLED, USERNAME, LOG_FILE, LOG_LEVEL, REQUEST_TIMEOUT, CONNECTION_TIMEOUT } = require('./config');
const { log } = require('./logger');
const { authenticate } = require('./auth');
const { handleHTTPProxy } = require('./handlers/http');
const { handleHTTPSProxy } = require('./handlers/https');
const { handleWebSocketUpgrade } = require('./handlers/websocket');
const { handleAdmin } = require('./admin');
const { adminAuthenticate } = require('./admin-auth');

const startTime = Date.now();

function handleHealthCheck(req, res) {
  const uptime = process.uptime();
  const healthData = {
    status: 'ok',
    uptime: uptime,
    timestamp: new Date().toISOString()
  };
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(healthData));
  
  log('debug', 'Health check requested', {
    clientIp: req.socket.remoteAddress,
    uptime: uptime
  });
}

const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    handleHealthCheck(req, res);
    return;
  }

  if (req.url.startsWith('/admin')) {
    if (!adminAuthenticate(req, res)) return;
    handleAdmin(req, res);
    return;
  }

  if (req.headers['upgrade'] && req.headers['upgrade'].toLowerCase() === 'websocket') {
    return;
  }

  if (AUTH_ENABLED && !authenticate(req, res)) {
    return;
  }

  if (!AUTH_ENABLED) {
    log('warn', 'Connection without authentication (AUTH_ENABLED=false)', {
      clientIp: req.socket.remoteAddress,
      url: req.url
    });
  }

  handleHTTPProxy(req, res);
});

httpServer.on('connect', (req, clientSocket, head) => {
  const clientIp = clientSocket.remoteAddress;
  
  if (AUTH_ENABLED && !authenticate(req, { 
    writeHead: (statusCode, headers) => {
      clientSocket.write(`HTTP/${req.httpVersion} ${statusCode} ${headers['Proxy-Authenticate'] ? 'Proxy Authentication Required' : 'Error'}\r\n`);
      if (headers['Proxy-Authenticate']) {
        clientSocket.write(`Proxy-Authenticate: ${headers['Proxy-Authenticate']}\r\n`);
      }
      clientSocket.write('\r\n');
      clientSocket.end();
    },
    end: () => {}
  })) {
    return;
  }
  
  if (!AUTH_ENABLED) {
    log('warn', 'HTTPS connection without authentication (AUTH_ENABLED=false)', {
      clientIp: clientIp,
      url: req.url
    });
  }

  handleHTTPSProxy(req, clientSocket, head);
});

httpServer.on('upgrade', (req, socket, head) => {
  const clientIp = socket.remoteAddress;
  
  if (AUTH_ENABLED && !authenticate(req, { 
    writeHead: (statusCode, headers) => {
      socket.write(`HTTP/${req.httpVersion} ${statusCode} ${headers['Proxy-Authenticate'] ? 'Proxy Authentication Required' : 'Error'}\r\n`);
      if (headers['Proxy-Authenticate']) {
        socket.write(`Proxy-Authenticate: ${headers['Proxy-Authenticate']}\r\n`);
      }
      socket.write('\r\n');
      socket.end();
    },
    end: () => {}
  })) {
    return;
  }
  
  if (!AUTH_ENABLED) {
    log('warn', 'WebSocket connection without authentication (AUTH_ENABLED=false)', {
      clientIp: clientIp,
      url: req.url
    });
  }

  handleWebSocketUpgrade(req, socket);
});

httpServer.listen(PORT, () => {
  log('info', 'Proxy server started', {
    port: PORT,
    authenticationEnabled: AUTH_ENABLED,
    username: AUTH_ENABLED ? USERNAME : 'N/A',
    logFile: LOG_FILE,
    logLevel: LOG_LEVEL,
    requestTimeout: REQUEST_TIMEOUT,
    connectionTimeout: CONNECTION_TIMEOUT
  });
  
  log('info', 'Proxy server configuration', {
    httpProxy: `localhost:${PORT}`,
    httpsProxy: `localhost:${PORT}`,
    healthCheck: `http://localhost:${PORT}/health`,
    authenticationEnabled: AUTH_ENABLED,
    username: AUTH_ENABLED ? USERNAME : 'N/A',
    password: AUTH_ENABLED ? '******' : 'N/A',
    logLevel: LOG_LEVEL,
    logFile: LOG_FILE
  });
  
  if (!AUTH_ENABLED) {
    log('warn', 'Authentication is disabled (AUTH_ENABLED=false). This is insecure for public networks.', {
      port: PORT
    });
  }
});

httpServer.on('error', (err) => {
  log('error', 'Server error', {
    error: err.message,
    stack: err.stack,
    port: PORT
  });
  process.exit(1);
});

function gracefulShutdown(signal) {
  log('info', `Received ${signal}, starting graceful shutdown`, {
    signal: signal,
    uptime: process.uptime()
  });
  
  httpServer.close((err) => {
    if (err) {
      log('error', 'Error during server shutdown', {
        error: err.message,
        stack: err.stack
      });
      process.exit(1);
    }
    
    log('info', 'Server shut down gracefully', {
      signal: signal,
      totalUptime: process.uptime()
    });
    process.exit(0);
  });
  
  setTimeout(() => {
    log('error', 'Forced shutdown after timeout', {
      signal: signal
    });
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  log('error', 'Uncaught exception', {
    error: err.message,
    stack: err.stack
  });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  log('error', 'Unhandled rejection', {
    reason: reason,
    promise: promise
  });
});
