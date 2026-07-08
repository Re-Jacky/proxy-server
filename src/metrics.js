const { log } = require('./logger');

const RATE_WINDOW = 60; // seconds
const HISTORY_SIZE = 60;

const state = {
  activeConnections: 0,
  totalBytes: { sent: 0, received: 0 },
  requestTimestamps: [],
  connectionHistory: []
};

let lastPushedConnections = -1;

function recordRequest() {
  state.requestTimestamps.push(Date.now());
  trim();
}

function recordBytes(sent, received) {
  state.totalBytes.sent += sent;
  state.totalBytes.received += received;
}

function connectionOpen() {
  state.activeConnections++;
  pushHistory();
}

function connectionClose() {
  state.activeConnections = Math.max(0, state.activeConnections - 1);
  pushHistory();
}

function trim() {
  const cutoff = Date.now() - RATE_WINDOW * 1000;
  state.requestTimestamps = state.requestTimestamps.filter(t => t > cutoff);
}

function getRequestRate() {
  trim();
  return state.requestTimestamps.length;
}

function pushHistory() {
  if (state.activeConnections === lastPushedConnections) return;
  lastPushedConnections = state.activeConnections;
  state.connectionHistory.push({
    time: new Date().toISOString(),
    connections: state.activeConnections
  });
  if (state.connectionHistory.length > HISTORY_SIZE) {
    state.connectionHistory.shift();
  }
}

function getSnapshot() {
  return {
    activeConnections: state.activeConnections,
    totalBytes: { ...state.totalBytes },
    requestsPerMin: getRequestRate(),
    uptime: process.uptime()
  };
}

function getHistory() {
  return [...state.connectionHistory];
}

module.exports = {
  recordRequest,
  recordBytes,
  connectionOpen,
  connectionClose,
  getSnapshot,
  getHistory
};
