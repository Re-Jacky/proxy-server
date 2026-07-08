const fs = require('fs');
const path = require('path');

const BLOCKS_FILE = path.join(__dirname, '..', 'blocks.json');

const state = {
  rules: []
};

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(BLOCKS_FILE, 'utf8'));
    state.rules = data.rules || [];
  } catch (err) {
    state.rules = [];
    save();
  }
}

function save() {
  fs.writeFileSync(BLOCKS_FILE, JSON.stringify({ rules: state.rules }, null, 2) + '\n');
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

  for (const rule of state.rules) {
    const checkIp = rule.type === 'source' ? clientIpStr : targetIpStr;
    if (matchIp(checkIp, rule.ip)) {
      if (rule.port === null || rule.port === targetPort) {
        const label = rule.type === 'source' ? 'Source' : 'Target';
        let reason = label + ' IP ' + rule.ip + ' is blocked';
        if (rule.port !== null) reason += ' on port ' + rule.port;
        return { blocked: true, reason };
      }
    }
  }

  return { blocked: false, reason: null };
}

function getRules() {
  return state.rules.map(r => ({ ...r }));
}

function addRule(type, ip, port) {
  const portVal = (port !== undefined && port !== null && port !== '') ? parseInt(port, 10) : null;
  const finalPort = (portVal !== null && !isNaN(portVal)) ? portVal : null;
  const exists = state.rules.some(r => r.type === type && r.ip === ip && r.port === finalPort);
  if (!exists) {
    state.rules.push({ type, ip, port: finalPort });
    save();
  }
}

function removeRule(type, ip, port) {
  state.rules = state.rules.filter(r => !(r.type === type && r.ip === ip && r.port === port));
  save();
}

load();

module.exports = { isBlocked, getRules, addRule, removeRule };
