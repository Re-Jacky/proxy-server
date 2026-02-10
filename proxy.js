const http = require('http');
const https = require('https');
const url = require('url');
const net = require('net');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const PORT = process.env.PORT || 8080;
const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false'; // Default: true
const USERNAME = process.env.PROXY_USERNAME || 'admin';
const PASSWORD = process.env.PROXY_PASSWORD || 'password';
const LOG_FILE = process.env.LOG_FILE || 'proxy.log';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFilePath = path.join(logsDir, LOG_FILE);

// Logging function
function log(level, message, details = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    details
  };

  const logString = JSON.stringify(logEntry) + '\n';
  
  // Write to file
  fs.appendFile(logFilePath, logString, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });

  // Write to console
  if (['error', 'warn', 'info'].includes(level)) {
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, details);
  }
}

// Authentication middleware
function authenticate(req, res) {
  const clientIp = req.socket.remoteAddress;
  
  // Debug: Authentication start
  log('debug', 'Authentication process started', {
    clientIp: clientIp,
    method: req.method,
    url: req.url,
    hasAuthHeader: !!req.headers['proxy-authorization']
  });

  const authHeader = req.headers['proxy-authorization'];
  if (!authHeader) {
    log('warn', 'Authentication attempt without credentials', {
      clientIp: clientIp,
      method: req.method,
      url: req.url
    });
    res.writeHead(407, {
      'Proxy-Authenticate': 'Basic realm="Proxy Server"'
    });
    res.end('Proxy authentication required');
    return false;
  }

  // Debug: Authentication header found
  log('debug', 'Authentication header found', {
    clientIp: clientIp,
    headerType: authHeader.split(' ')[0]
  });

  try {
    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
    const [username, password] = auth.split(':');
    
    // Debug: Credentials extracted
    log('debug', 'Credentials extracted', {
      clientIp: clientIp,
      username: username,
      hasPassword: !!password
    });

    if (username !== USERNAME || password !== PASSWORD) {
      log('warn', 'Failed authentication attempt', {
        clientIp: clientIp,
        username: username,
        method: req.method,
        url: req.url,
        expectedUsername: USERNAME
      });
      res.writeHead(407, {
        'Proxy-Authenticate': 'Basic realm="Proxy Server"'
      });
      res.end('Invalid proxy credentials');
      return false;
    }

    // Debug: Authentication successful
    log('debug', 'Authentication successful', {
      clientIp: clientIp,
      username: username,
      method: req.method,
      url: req.url
    });

    log('info', 'Successful authentication', {
      clientIp: clientIp,
      username: username,
      method: req.method,
      url: req.url
    });
    return true;
  } catch (error) {
    // Debug: Authentication error
    log('error', 'Authentication error', {
      clientIp: clientIp,
      method: req.method,
      url: req.url,
      error: error.message,
      stack: error.stack
    });
    res.writeHead(407, {
      'Proxy-Authenticate': 'Basic realm="Proxy Server"'
    });
    res.end('Invalid proxy credentials');
    return false;
  }
}

// HTTP proxy server
const httpServer = http.createServer((req, res) => {
  // Handle WebSocket upgrade requests
  if (req.headers['upgrade'] && req.headers['upgrade'].toLowerCase() === 'websocket') {
    handleWebSocketUpgrade(req, res);
    return;
  }

  if (AUTH_ENABLED && !authenticate(req, res)) {
    return;
  }

  const parsedUrl = url.parse(req.url);
  const clientIp = req.socket.remoteAddress;
  
  // Log HTTP request
  log('info', 'HTTP request received', {
    clientIp: clientIp,
    code: 'REQ'
  });
  
  // Log detailed HTTP request info at debug level
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
    headers: req.headers
  };

  // Remove proxy-specific headers
  delete options.headers['proxy-authorization'];

  const proxyReq = http.request(options, (proxyRes) => {
    // Log HTTP response
    log('info', 'HTTP response received', {
      clientIp: clientIp,
      code: 'RES',
      statusCode: proxyRes.statusCode
    });
    
    // Log detailed HTTP response info at debug level
    log('debug', 'HTTP response details', {
      clientIp: clientIp,
      method: req.method,
      url: req.url,
      statusCode: proxyRes.statusCode,
      statusMessage: proxyRes.statusMessage,
      headers: proxyRes.headers
    });
    
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    log('error', 'HTTP proxy error', {
      clientIp: clientIp,
      code: 'ERR'
    });
    
    // Log detailed error info at debug level
    log('debug', 'HTTP proxy error details', {
      clientIp: clientIp,
      method: req.method,
      url: req.url,
      error: err.message,
      stack: err.stack
    });
    
    res.writeHead(500);
    res.end('Proxy error');
  });

  proxyReq.on('socket', (socket) => {
    log('debug', 'HTTP proxy connection established', {
      clientIp: clientIp,
      targetHost: parsedUrl.hostname,
      targetPort: parsedUrl.port || 80
    });
  });

  req.pipe(proxyReq);
});

// Handle WebSocket upgrade requests
function handleWebSocketUpgrade(req, socket) {
  const clientIp = socket.remoteAddress;
  
  // Authenticate WebSocket connection if enabled
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
  
  // Log if authentication is disabled for WebSocket
  if (!AUTH_ENABLED) {
    log('warn', 'WebSocket connection without authentication (AUTH_ENABLED=false)', {
      clientIp: clientIp,
      url: req.url
    });
  }

  const parsedUrl = url.parse(req.url);
  const targetHost = parsedUrl.hostname;
  const targetPort = parsedUrl.port || (parsedUrl.protocol === 'wss:' ? 443 : 80);
  
  // Log WebSocket connection
  log('info', 'WebSocket connection request', {
    clientIp: clientIp,
    code: 'WS'
  });
  
  // Log detailed WebSocket connection info at debug level
  log('debug', 'WebSocket connection details', {
    clientIp: clientIp,
    url: req.url,
    targetHost: targetHost,
    targetPort: targetPort,
    protocol: parsedUrl.protocol
  });

  // Connect to target WebSocket server
  const serverSocket = net.connect(targetPort, targetHost, () => {
    // Log WebSocket connection established
    log('info', 'WebSocket connection established', {
      clientIp: clientIp,
      code: 'WS_OK'
    });
    
    // Log detailed WebSocket connection info at debug level
    log('debug', 'WebSocket connection details', {
      clientIp: clientIp,
      targetHost: targetHost,
      targetPort: targetPort
    });

    // Send 200 response to client
    socket.write(`HTTP/${req.httpVersion} 101 Switching Protocols\r\n`);
    socket.write(`Upgrade: websocket\r\n`);
    socket.write(`Connection: Upgrade\r\n`);
    
    // Forward Sec-WebSocket-Accept header if present
    if (req.headers['sec-websocket-key']) {
      // Generate Sec-WebSocket-Accept header (simplified for proxying)
      // Note: For actual WebSocket proxying, we should forward the server's response
      // but for simplicity, we'll just pass through the connection
      socket.write(`Sec-WebSocket-Accept: ${req.headers['sec-websocket-key']}\r\n`);
    }
    
    socket.write('\r\n');

    // Start piping data between sockets
    serverSocket.pipe(socket);
    socket.pipe(serverSocket);
  });

  serverSocket.on('error', (err) => {
    log('error', 'WebSocket proxy error', {
      clientIp: clientIp,
      code: 'WS_ERR'
    });
    
    // Log detailed WebSocket error info at debug level
    log('debug', 'WebSocket proxy error details', {
      clientIp: clientIp,
      targetHost: targetHost,
      targetPort: targetPort,
      error: err.message,
      stack: err.stack
    });
    
    socket.end();
  });

  socket.on('error', (err) => {
    log('error', 'WebSocket client error', {
      clientIp: clientIp,
      code: 'WS_CLIENT_ERR'
    });
    
    // Log detailed WebSocket client error info at debug level
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

// HTTPS proxy server (using CONNECT method)
httpServer.on('connect', (req, clientSocket, head) => {
  const clientIp = clientSocket.remoteAddress;
  
  // Authenticate HTTPS connection if enabled
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
  
  // Log if authentication is disabled for HTTPS
  if (!AUTH_ENABLED) {
    log('warn', 'HTTPS connection without authentication (AUTH_ENABLED=false)', {
      clientIp: clientIp,
      url: req.url
    });
  }

  const [hostname, port] = req.url.split(':');
  const serverOptions = {
    hostname: hostname,
    port: port || 443
  };

  // Log HTTPS CONNECT request
  log('info', 'HTTPS CONNECT request received', {
    clientIp: clientIp,
    code: 'CONNECT'
  });
  
  // Log detailed HTTPS CONNECT request info at debug level
  log('debug', 'HTTPS CONNECT request details', {
    clientIp: clientIp,
    targetHost: hostname,
    targetPort: serverOptions.port,
    httpVersion: req.httpVersion,
    url: req.url
  });

  const serverSocket = net.connect(serverOptions.port, serverOptions.hostname, () => {
    // Log HTTPS connection established
    log('info', 'HTTPS connection established', {
      clientIp: clientIp,
      code: 'HTTPS_OK'
    });
    
    // Log detailed HTTPS connection info at debug level
    log('debug', 'HTTPS connection details', {
      clientIp: clientIp,
      targetHost: hostname,
      targetPort: serverOptions.port
    });
    
    clientSocket.write(`HTTP/${req.httpVersion} 200 Connection Established\r\n\r\n`);
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on('error', (err) => {
    log('error', 'HTTPS proxy server error', {
      clientIp: clientIp,
      code: 'HTTPS_ERR'
    });
    
    // Log detailed HTTPS error info at debug level
    log('debug', 'HTTPS proxy server error details', {
      clientIp: clientIp,
      targetHost: hostname,
      targetPort: serverOptions.port,
      error: err.message,
      stack: err.stack
    });
    
    // Send proper 502 Bad Gateway error instead of just closing
    clientSocket.write(`HTTP/${req.httpVersion} 502 Bad Gateway\r\n`);
    clientSocket.write(`Content-Type: text/plain\r\n`);
    clientSocket.write(`Content-Length: ${err.message.length}\r\n`);
    clientSocket.write(`\r\n`);
    clientSocket.write(err.message);
    clientSocket.end();
  });

  clientSocket.on('error', (err) => {
    log('error', 'HTTPS client socket error', {
      clientIp: clientIp,
      code: 'CLIENT_ERR'
    });
    
    // Log detailed HTTPS client error info at debug level
    log('debug', 'HTTPS client socket error details', {
      clientIp: clientIp,
      targetHost: hostname,
      targetPort: serverOptions.port,
      error: err.message,
      stack: err.stack
    });
    
    serverSocket.end();
  });

  serverSocket.on('close', () => {
    log('info', 'HTTPS server connection closed', {
      clientIp: clientIp,
      targetHost: hostname,
      targetPort: serverOptions.port
    });
  });

  clientSocket.on('close', () => {
    log('info', 'HTTPS client connection closed', {
      clientIp: clientIp,
      targetHost: hostname,
      targetPort: serverOptions.port
    });
  });
});

// Start the server
httpServer.listen(PORT, () => {
  log('info', 'Proxy server started', {
    port: PORT,
    authenticationEnabled: AUTH_ENABLED,
    username: AUTH_ENABLED ? USERNAME : 'N/A',
    logFile: logFilePath,
    logLevel: LOG_LEVEL
  });
  
  log('info', 'Proxy server configuration', {
    httpProxy: `localhost:${PORT}`,
    httpsProxy: `localhost:${PORT}`,
    authenticationEnabled: AUTH_ENABLED,
    username: AUTH_ENABLED ? USERNAME : 'N/A',
    password: AUTH_ENABLED ? '******' : 'N/A', // Mask password for security
    logLevel: LOG_LEVEL,
    logFile: LOG_FILE
  });
  
  // Warn if authentication is disabled
  if (!AUTH_ENABLED) {
    log('warn', 'Authentication is disabled (AUTH_ENABLED=false). This is insecure for public networks.', {
      port: PORT
    });
  }
});

// Handle server errors
httpServer.on('error', (err) => {
  log('error', 'Server error', {
    error: err.message,
    stack: err.stack,
    port: PORT
  });
  process.exit(1);
});

