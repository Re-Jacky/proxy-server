const path = require('path');
require('dotenv').config();

// Validate port number
function validatePort(port) {
  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    throw new Error(`Invalid PORT: ${port}. Must be a number between 1 and 65535`);
  }
  return portNum;
}

// Validate log level
function validateLogLevel(level) {
  const validLevels = ['error', 'warn', 'info', 'debug'];
  if (!validLevels.includes(level)) {
    throw new Error(`Invalid LOG_LEVEL: ${level}. Must be one of: ${validLevels.join(', ')}`);
  }
  return level;
}

// Load and validate configuration
const PORT = validatePort(process.env.PORT || 8080);
const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false';
const LOG_FILE = process.env.LOG_FILE || 'proxy.log';
const LOG_LEVEL = validateLogLevel(process.env.LOG_LEVEL || 'info');
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '30000', 10);
const CONNECTION_TIMEOUT = parseInt(process.env.CONNECTION_TIMEOUT || '20000', 10);
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || '1000', 10);

// Validate credentials if authentication is enabled
if (AUTH_ENABLED) {
  const USERNAME = process.env.PROXY_USERNAME;
  const PASSWORD = process.env.PROXY_PASSWORD;
  
  if (!USERNAME || !PASSWORD) {
    throw new Error('AUTH_ENABLED is true but PROXY_USERNAME or PROXY_PASSWORD is not set. Please configure credentials in .env file.');
  }
  
  if (USERNAME.length < 3) {
    throw new Error('PROXY_USERNAME must be at least 3 characters long');
  }
  
  if (PASSWORD.length < 8) {
    throw new Error('PROXY_PASSWORD must be at least 8 characters long for security');
  }
}

const USERNAME = process.env.PROXY_USERNAME || '';
const PASSWORD = process.env.PROXY_PASSWORD || '';

// Validate admin credentials
if (!process.env.ADMIN_USERNAME || process.env.ADMIN_USERNAME.length < 3) {
  throw new Error('ADMIN_USERNAME must be at least 3 characters long');
}

if (!process.env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD is required');
  }

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const logsDir = path.join(__dirname, '..', 'logs');
const logFilePath = path.join(logsDir, LOG_FILE);

module.exports = {
  PORT,
  AUTH_ENABLED,
  USERNAME,
  PASSWORD,
  LOG_FILE,
  LOG_LEVEL,
  REQUEST_TIMEOUT,
  CONNECTION_TIMEOUT,
  MAX_CONNECTIONS,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  logsDir,
  logFilePath
};
