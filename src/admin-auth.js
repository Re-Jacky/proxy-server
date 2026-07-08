const { ADMIN_USERNAME, ADMIN_PASSWORD } = require('./config');
const { log } = require('./logger');

function adminAuthenticate(req, res) {
  const clientIp = req.socket.remoteAddress;

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    log('warn', 'Admin auth attempt without credentials', { clientIp });
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Admin Dashboard"'
    });
    res.end('Authentication required');
    return false;
  }

  try {
    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
    const [username, password] = auth.split(':');

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      log('warn', 'Failed admin auth attempt', { clientIp, username });
      res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="Admin Dashboard"'
      });
      res.end('Invalid credentials');
      return false;
    }

    log('debug', 'Admin auth successful', { clientIp, username });
    return true;
  } catch (error) {
    log('error', 'Admin auth error', { clientIp, error: error.message });
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Admin Dashboard"'
    });
    res.end('Invalid credentials');
    return false;
  }
}

module.exports = { adminAuthenticate };
