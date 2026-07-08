process.env.PORT = '8080';
process.env.AUTH_ENABLED = 'true';
process.env.PROXY_USERNAME = 'testuser';
process.env.PROXY_PASSWORD = 'testpassword123';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'adminpass123';

const config = require('../src/config');

describe('Configuration Module', () => {
  test('should load PORT from environment', () => {
    expect(config.PORT).toBe(8080);
  });

  test('should load AUTH_ENABLED from environment', () => {
    expect(config.AUTH_ENABLED).toBe(true);
  });

  test('should load USERNAME and PASSWORD from environment', () => {
    expect(config.USERNAME).toBe('testuser');
    expect(config.PASSWORD).toBe('testpassword123');
  });

  test('should have default timeout values', () => {
    expect(config.REQUEST_TIMEOUT).toBeDefined();
    expect(config.CONNECTION_TIMEOUT).toBeDefined();
    expect(typeof config.REQUEST_TIMEOUT).toBe('number');
    expect(typeof config.CONNECTION_TIMEOUT).toBe('number');
  });

  test('should have log configuration', () => {
    expect(config.LOG_FILE).toBeDefined();
    expect(config.LOG_LEVEL).toBeDefined();
    expect(config.logFilePath).toBeDefined();
  });
});
