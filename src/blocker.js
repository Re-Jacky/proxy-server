const fs = require('fs');
const path = require('path');
const net = require('net');

const BLOCKS_FILE = path.join(__dirname, '..', 'blocks.json');

const state = {
  ips: [],
  ports: []
};

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(BLOCKS_FILE, 'utf8'));
    state.ips = data.ips || [];
    state.ports = data.ports || [];
  } catch (err) {
    state.ips = [];
    state.ports = [];
    save();
  }
}

function save() {
  fs.writeFileSync(BLOCKS_FILE, JSON.stringify({ ips: state.ips, ports: state.ports }, null, 2) + '\n');
}

function ipToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return parts.reduce((acc, octet) => {
    const n = parseInt(octet, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    return acc === null ? null : (acc << 8) + n;
  }, 0);
}

function ipInCIDR(ip, cidr) {
  const [range, bits] = cidr.split('/');
  const mask = bits ? parseInt(bits, 10) : 32;
  if (isNaN(mask) || mask < 0 || mask > 32) return false;
  const ipInt = ipToInt(ip);
  const rangeInt = ipToInt(range);
  if (ipInt === null || rangeInt === null) return false;
  const shifted = 32 - mask;
  return (ipInt >>> shifted) === (rangeInt >>> shifted);
}

function isBlocked(clientIp, targetHost, targetPort) {
  const clientIpStr = clientIp ? clientIp.replace(/^::ffff:/, '') : '';
  const targetIpStr = targetHost ? targetHost.replace(/^::ffff:/, '') : '';

  for (const blocked of state.ips) {
    if (blocked.includes('/')) {
      if (ipInCIDR(clientIpStr, blocked) || ipInCIDR(targetIpStr, blocked)) {
        return { blocked: true, reason: 'IP ' + blocked + ' is blocked' };
      }
    } else {
      if (clientIpStr === blocked || targetIpStr === blocked) {
        return { blocked: true, reason: 'IP ' + blocked + ' is blocked' };
      }
    }
  }

  if (targetPort && state.ports.includes(targetPort)) {
    return { blocked: true, reason: 'Port ' + targetPort + ' is blocked' };
  }

  return { blocked: false, reason: null };
}

function getBlocks() {
  return { ips: [...state.ips], ports: [...state.ports] };
}

function addIp(ip) {
  if (!state.ips.includes(ip)) {
    state.ips.push(ip);
    save();
  }
}

function removeIp(ip) {
  state.ips = state.ips.filter(i => i !== ip);
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

module.exports = { isBlocked, getBlocks, addIp, removeIp, addPort, removePort };
