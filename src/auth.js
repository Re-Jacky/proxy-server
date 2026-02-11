const { AUTH_ENABLED, USERNAME, PASSWORD } = require('./config');
const { log } = require('./logger');

const failedAttempts = new Map();
const RATE_LIMIT_WINDOW = 60000;
const MAX_FAILED_ATTEMPTS = 5;

function cleanupOldAttempts() {
  const now = Date.now();
  for (const [ip, data] of failedAttempts.entries()) {
    if (now - data.firstAttempt > RATE_LIMIT_WINDOW) {
      failedAttempts.delete(ip);
    }
  }
}

setInterval(cleanupOldAttempts, RATE_LIMIT_WINDOW);

function isRateLimited(clientIp) {
  const attemptData = failedAttempts.get(clientIp);
  if (!attemptData) return false;
  
  const now = Date.now();
  if (now - attemptData.firstAttempt > RATE_LIMIT_WINDOW) {
    failedAttempts.delete(clientIp);
    return false;
  }
  
  return attemptData.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailedAttempt(clientIp) {
  const now = Date.now();
  const attemptData = failedAttempts.get(clientIp);
  
  if (!attemptData) {
    failedAttempts.set(clientIp, { count: 1, firstAttempt: now });
  } else {
    if (now - attemptData.firstAttempt > RATE_LIMIT_WINDOW) {
      failedAttempts.set(clientIp, { count: 1, firstAttempt: now });
    } else {
      attemptData.count++;
    }
  }
}

function authenticate(req, res) {
  const clientIp = req.socket.remoteAddress;
  
  if (isRateLimited(clientIp)) {
    log('warn', 'Rate limit exceeded', {
      clientIp: clientIp,
      method: req.method,
      url: req.url
    });
    res.writeHead(429, { 'Content-Type': 'text/plain' });
    res.end('Too many failed authentication attempts. Please try again later.');
    return false;
  }
  
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

  log('debug', 'Authentication header found', {
    clientIp: clientIp,
    headerType: authHeader.split(' ')[0]
  });

  try {
    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
    const [username, password] = auth.split(':');
    
    log('debug', 'Credentials extracted', {
      clientIp: clientIp,
      username: username,
      hasPassword: !!password
    });

    if (username !== USERNAME || password !== PASSWORD) {
      recordFailedAttempt(clientIp);
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

module.exports = { authenticate, AUTH_ENABLED };
