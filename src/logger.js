const fs = require('fs');
const { logFilePath, logsDir, LOG_LEVEL } = require('./config');

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLogLevel = logLevels[LOG_LEVEL] || logLevels.info;

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function log(level, message, details = {}) {
  if (logLevels[level] === undefined || logLevels[level] > currentLogLevel) {
    return;
  }

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    details
  };

  const logString = JSON.stringify(logEntry) + '\n';
  
  fs.appendFile(logFilePath, logString, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });

  if (['error', 'warn', 'info'].includes(level)) {
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, details);
  }
}

module.exports = { log };
