const http = require('http');
const url = require('url');
const { log } = require('../logger');
const { REQUEST_TIMEOUT } = require('../config');

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
  
  if (isPrivateIP(parsedUrl.hostname)) {
    log('warn', 'SSRF attempt detected', {
      clientIp: clientIp,
      targetHost: parsedUrl.hostname,
      url: req.url
    });
    res.writeHead(403);
    res.end('Forbidden: Access to private IP addresses is not allowed');
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
  });

  proxyReq.on('socket', () => {
    log('debug', 'HTTP proxy connection established', {
      clientIp: clientIp,
      targetHost: parsedUrl.hostname,
      targetPort: parsedUrl.port || 80
    });
  });

  req.pipe(proxyReq);
}

module.exports = { handleHTTPProxy };
