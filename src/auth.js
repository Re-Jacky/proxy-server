const { AUTH_ENABLED, USERNAME, PASSWORD } = require('./config');
const { log } = require('./logger');

function authenticate(req, res) {
  const clientIp = req.socket.remoteAddress;
  
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
