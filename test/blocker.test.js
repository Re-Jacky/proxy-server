process.env.PORT = '8080';
process.env.AUTH_ENABLED = 'false';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'adminpassword123';
process.env.LOG_LEVEL = 'error';

const blocker = require('../src/blocker');

describe('Blocker Module', () => {
  afterAll(() => {
    blocker.removeRule('source', '10.0.0.1', null);
    blocker.removeRule('target', '203.0.113.5', null);
    blocker.removeRule('source', '192.168.0.0/16', null);
    blocker.removeRule('target', '10.0.0.2', 25);
  });

  test('should start with no rules', () => {
    expect(blocker.getRules()).toEqual([]);
  });

  test('should block source IP (client)', () => {
    blocker.addRule('source', '10.0.0.1');
    expect(blocker.isBlocked('10.0.0.1', 'example.com', 80).blocked).toBe(true);
    expect(blocker.isBlocked('1.2.3.4', '10.0.0.1', 80).blocked).toBe(false);
    blocker.removeRule('source', '10.0.0.1', null);
  });

  test('should block target IP (destination)', () => {
    blocker.addRule('target', '203.0.113.5');
    expect(blocker.isBlocked('1.2.3.4', '203.0.113.5', 80).blocked).toBe(true);
    expect(blocker.isBlocked('203.0.113.5', 'example.com', 80).blocked).toBe(false);
    blocker.removeRule('target', '203.0.113.5', null);
  });

  test('should allow non-blocked IP', () => {
    expect(blocker.isBlocked('1.2.3.4', 'example.com', 80).blocked).toBe(false);
  });

  test('should block CIDR range', () => {
    blocker.addRule('source', '192.168.0.0/16');
    expect(blocker.isBlocked('192.168.1.1', 'example.com', 80).blocked).toBe(true);
    expect(blocker.isBlocked('192.168.5.100', 'example.com', 80).blocked).toBe(true);
    expect(blocker.isBlocked('10.0.0.1', '192.168.1.1', 80).blocked).toBe(false);
    blocker.removeRule('source', '192.168.0.0/16', null);
  });

  test('should block IP + port combination', () => {
    blocker.addRule('target', '10.0.0.2', 25);
    expect(blocker.isBlocked('1.2.3.4', '10.0.0.2', 25).blocked).toBe(true);
    expect(blocker.isBlocked('1.2.3.4', '10.0.0.2', 80).blocked).toBe(false);
    blocker.removeRule('target', '10.0.0.2', 25);
  });

  test('should block IP on all ports when no port specified', () => {
    blocker.addRule('target', '203.0.113.5');
    expect(blocker.isBlocked('1.2.3.4', '203.0.113.5', 25).blocked).toBe(true);
    expect(blocker.isBlocked('1.2.3.4', '203.0.113.5', 80).blocked).toBe(true);
    expect(blocker.isBlocked('1.2.3.4', '203.0.113.5', 443).blocked).toBe(true);
    blocker.removeRule('target', '203.0.113.5', null);
  });

  test('should list rules', () => {
    blocker.addRule('source', '10.0.0.1');
    blocker.addRule('target', '203.0.113.5', 25);
    const rules = blocker.getRules();
    expect(rules).toContainEqual({ type: 'source', ip: '10.0.0.1', port: null });
    expect(rules).toContainEqual({ type: 'target', ip: '203.0.113.5', port: 25 });
    blocker.removeRule('source', '10.0.0.1', null);
    blocker.removeRule('target', '203.0.113.5', 25);
  });

  test('should handle IPv6 mapped IPv4', () => {
    blocker.addRule('source', '10.0.0.1');
    expect(blocker.isBlocked('::ffff:10.0.0.1', 'example.com', 80).blocked).toBe(true);
    blocker.removeRule('source', '10.0.0.1', null);
  });
});
