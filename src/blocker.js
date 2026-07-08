const fs = require('fs');
const path = require('path');

const BLOCKS_FILE = path.join(__dirname, '..', 'blocks.json');

const state = {
  sourceIps: [],
  targetIps: [],
  ports: []
};

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(BLOCKS_FILE, 'utf8'));
    state.sourceIps = data.sourceIps || [];
    state.targetIps = data.targetIps || [];
    state.ports = data.ports || [];
  } catch (err) {
    state.sourceIps = [];
    state.targetIps = [];
    state.ports = [];
    save();
  }
}

function save() {
  fs.writeFileSync(BLOCKS_FILE, JSON.stringify({
    sourceIps: state.sourceIps,
    targetIps: state.targetIps,
    ports: state.ports
  }, null, 2) + '\n');
}

function ipToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const octet of parts) {
    const n = parseInt(octet, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    result = (result << 8) + n;
  }
  return result;
}

function matchIp(ip, pattern) {
  if (pattern.includes('/')) {
    const [range, bits] = pattern.split('/');
    const mask = parseInt(bits, 10);
    if (isNaN(mask) || mask < 0 || mask > 32) return false;
    const ipInt = ipToInt(ip);
    const rangeInt = ipToInt(range);
    if (ipInt === null || rangeInt === null) return false;
    const shifted = 32 - mask;
    return (ipInt >>> shifted) === (rangeInt >>> shifted);
  }
  return ip === pattern;
}

function isBlocked(clientIp, targetHost, targetPort) {
  const clientIpStr = clientIp ? clientIp.replace(/^::ffff:/, '') : '';
  const targetIpStr = targetHost ? targetHost.replace(/^::ffff:/, '') : '';

  for (const blocked of state.sourceIps) {
    if (matchIp(clientIpStr, blocked)) {
      return { blocked: true, reason: 'Source IP ' + blocked + ' is blocked' };
    }
  }

  for (const blocked of state.targetIps) {
    if (matchIp(targetIpStr, blocked)) {
      return { blocked: true, reason: 'Target IP ' + blocked + ' is blocked' };
    }
  }

  if (targetPort && state.ports.includes(targetPort)) {
    return { blocked: true, reason: 'Port ' + targetPort + ' is blocked' };
  }

  return { blocked: false, reason: null };
}

function getBlocks() {
  return {
    sourceIps: [...state.sourceIps],
    targetIps: [...state.targetIps],
    ports: [...state.ports]
  };
}

function addSourceIp(ip) {
  if (!state.sourceIps.includes(ip)) {
    state.sourceIps.push(ip);
    save();
  }
}

function removeSourceIp(ip) {
  state.sourceIps = state.sourceIps.filter(i => i !== ip);
  save();
}

function addTargetIp(ip) {
  if (!state.targetIps.includes(ip)) {
    state.targetIps.push(ip);
    save();
  }
}

function removeTargetIp(ip) {
  state.targetIps = state.targetIps.filter(i => i !== ip);
  save();
}

function addPort(port) {
  const p = parseInt(port, 10);
  if (!isNaN(p) && !state.ports.includes(p)) {
    state.ports.push(p);
    save();
  }
}

function removePort(port) {
  const p = parseInt(port, 10);
  state.ports = state.ports.filter(i => i !== p);
  save();
}

load();

module.exports = {
  isBlocked, getBlocks,
  addSourceIp, removeSourceIp,
  addTargetIp, removeTargetIp,
  addPort, removePort
};
