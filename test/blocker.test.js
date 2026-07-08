process.env.PORT = '8080';
process.env.AUTH_ENABLED = 'false';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'adminpassword123';
process.env.LOG_LEVEL = 'error';

const blocker = require('../src/blocker');

describe('Blocker Module', () => {
  afterAll(() => {
    blocker.removeSourceIp('10.0.0.1');
    blocker.removeTargetIp('203.0.113.5');
    blocker.removeSourceIp('192.168.0.0/16');
    blocker.removePort(25);
  });

  test('should start with empty blocks', () => {
    const blocks = blocker.getBlocks();
    expect(blocks.sourceIps).toEqual([]);
    expect(blocks.targetIps).toEqual([]);
    expect(blocks.ports).toEqual([]);
  });

  test('should block source IP (client)', () => {
    blocker.addSourceIp('10.0.0.1');
    expect(blocker.isBlocked('10.0.0.1', 'example.com', 80).blocked).toBe(true);
    expect(blocker.isBlocked('1.2.3.4', '10.0.0.1', 80).blocked).toBe(false);
    blocker.removeSourceIp('10.0.0.1');
  });

  test('should block target IP (destination)', () => {
    blocker.addTargetIp('203.0.113.5');
    expect(blocker.isBlocked('1.2.3.4', '203.0.113.5', 80).blocked).toBe(true);
    expect(blocker.isBlocked('203.0.113.5', 'example.com', 80).blocked).toBe(false);
    blocker.removeTargetIp('203.0.113.5');
  });

  test('should allow non-blocked IP', () => {
    expect(blocker.isBlocked('1.2.3.4', 'example.com', 80).blocked).toBe(false);
  });

  test('should block CIDR range for source', () => {
    blocker.addSourceIp('192.168.0.0/16');
    expect(blocker.isBlocked('192.168.1.1', 'example.com', 80).blocked).toBe(true);
    expect(blocker.isBlocked('192.168.5.100', 'example.com', 80).blocked).toBe(true);
    expect(blocker.isBlocked('10.0.0.1', '192.168.1.1', 80).blocked).toBe(false);
    blocker.removeSourceIp('192.168.0.0/16');
  });

  test('should block port', () => {
    blocker.addPort(25);
    expect(blocker.isBlocked('1.2.3.4', 'example.com', 25).blocked).toBe(true);
    expect(blocker.isBlocked('1.2.3.4', 'example.com', 80).blocked).toBe(false);
    blocker.removePort(25);
  });

  test('should list all blocks', () => {
    blocker.addSourceIp('10.0.0.1');
    blocker.addTargetIp('203.0.113.5');
    blocker.addPort(25);
    const blocks = blocker.getBlocks();
    expect(blocks.sourceIps).toContain('10.0.0.1');
    expect(blocks.targetIps).toContain('203.0.113.5');
    expect(blocks.ports).toContain(25);
    blocker.removeSourceIp('10.0.0.1');
    blocker.removeTargetIp('203.0.113.5');
    blocker.removePort(25);
  });

  test('should handle IPv6 mapped IPv4', () => {
    blocker.addSourceIp('10.0.0.1');
    expect(blocker.isBlocked('::ffff:10.0.0.1', 'example.com', 80).blocked).toBe(true);
    blocker.removeSourceIp('10.0.0.1');
  });
});
