process.env.PORT = '8080';
process.env.AUTH_ENABLED = 'false';
process.env.PROXY_USERNAME = 'testuser';
process.env.PROXY_PASSWORD = 'testpassword123';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'adminpassword123';
process.env.LOG_LEVEL = 'error';

const metrics = require('../src/metrics');

describe('Metrics module', () => {
  beforeEach(() => {
    // Reset internal state by re-requiring doesn't work with module cache,
    // so we test behaviors that are additive
  });

  test('should start with zero state', () => {
    const snap = metrics.getSnapshot();
    expect(snap.activeConnections).toBe(0);
    expect(snap.totalBytes.sent).toBe(0);
    expect(snap.totalBytes.received).toBe(0);
    expect(snap.requestsPerMin).toBeGreaterThanOrEqual(0);
  });

  test('should track connection count', () => {
    metrics.connectionOpen();
    metrics.connectionOpen();
    expect(metrics.getSnapshot().activeConnections).toBe(2);
    metrics.connectionClose();
    expect(metrics.getSnapshot().activeConnections).toBe(1);
    metrics.connectionClose();
    expect(metrics.getSnapshot().activeConnections).toBe(0);
  });

  test('should track bytes', () => {
    metrics.recordBytes(100, 200);
    const snap = metrics.getSnapshot();
    expect(snap.totalBytes.sent).toBe(100);
    expect(snap.totalBytes.received).toBe(200);
  });

  test('should track request rate', () => {
    metrics.recordRequest();
    metrics.recordRequest();
    expect(metrics.getSnapshot().requestsPerMin).toBeGreaterThanOrEqual(2);
  });

  test('should return history array', () => {
    const history = metrics.getHistory();
    expect(Array.isArray(history)).toBe(true);
  });
});
