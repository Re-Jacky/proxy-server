process.env.PORT = '8080';
process.env.AUTH_ENABLED = 'false';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'adminpassword123';
process.env.LOG_LEVEL = 'error';

const blocker = require('../src/blocker');

describe('Blocker Module', () => {
  afterAll(() => {
    blocker.removeIp('10.0.0.1');
    blocker.removeIp('192.168.0.0/16');
    blocker.removePort(25);
  });

  test('should start with empty blocks', () => {
    const blocks = blocker.getBlocks();
    expect(blocks.ips).toEqual([]);
    expect(blocks.ports).toEqual([]);
  });

  test('should block exact IP', () => {
    blocker.addIp('10.0.0.1');
    const result = blocker.isBlocked('10.0.0.1', 'example.com', 80);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('10.0.0.1');
    blocker.removeIp('10.0.0.1');
  });

  test('should allow non-blocked IP', () => {
    const result = blocker.isBlocked('1.2.3.4', 'example.com', 80);
    expect(result.blocked).toBe(false);
  });

  test('should block CIDR range', () => {
    blocker.addIp('192.168.0.0/16');
    expect(blocker.isBlocked('192.168.1.1', 'example.com', 80).blocked).toBe(true);
    expect(blocker.isBlocked('192.168.5.100', 'example.com', 80).blocked).toBe(true);
    expect(blocker.isBlocked('10.0.0.1', 'example.com', 80).blocked).toBe(false);
    blocker.removeIp('192.168.0.0/16');
  });

  test('should block target IP', () => {
    blocker.addIp('203.0.113.5');
    const result = blocker.isBlocked('1.2.3.4', '203.0.113.5', 80);
    expect(result.blocked).toBe(true);
    blocker.removeIp('203.0.113.5');
  });

  test('should block port', () => {
    blocker.addPort(25);
    expect(blocker.isBlocked('1.2.3.4', 'example.com', 25).blocked).toBe(true);
    expect(blocker.isBlocked('1.2.3.4', 'example.com', 80).blocked).toBe(false);
    blocker.removePort(25);
  });

  test('should list blocks', () => {
    blocker.addIp('10.0.0.1');
    blocker.addPort(25);
    const blocks = blocker.getBlocks();
    expect(blocks.ips).toContain('10.0.0.1');
    expect(blocks.ports).toContain(25);
    blocker.removeIp('10.0.0.1');
    blocker.removePort(25);
  });

  test('should handle IPv6 mapped IPv4', () => {
    blocker.addIp('10.0.0.1');
    const result = blocker.isBlocked('::ffff:10.0.0.1', 'example.com', 80);
    expect(result.blocked).toBe(true);
    blocker.removeIp('10.0.0.1');
  });
});
