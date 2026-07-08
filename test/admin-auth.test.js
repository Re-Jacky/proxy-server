process.env.PORT = '8080';
process.env.AUTH_ENABLED = 'false';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'adminpassword123';
process.env.LOG_LEVEL = 'error';

const { adminAuthenticate } = require('../src/admin-auth');

describe('Admin Authentication Module', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: {}
    };
    mockRes = {
      writeHead: jest.fn(),
      end: jest.fn()
    };
  });

  test('should reject request without auth header', () => {
    const result = adminAuthenticate(mockReq, mockRes);
    expect(result).toBe(false);
    expect(mockRes.writeHead).toHaveBeenCalledWith(401, {
      'WWW-Authenticate': 'Basic realm="Admin Dashboard"'
    });
  });

  test('should reject request with invalid credentials', () => {
    const invalidAuth = Buffer.from('wrong:wrong').toString('base64');
    mockReq.headers['authorization'] = `Basic ${invalidAuth}`;
    const result = adminAuthenticate(mockReq, mockRes);
    expect(result).toBe(false);
  });

  test('should accept request with valid credentials', () => {
    const validAuth = Buffer.from('admin:adminpassword123').toString('base64');
    mockReq.headers['authorization'] = `Basic ${validAuth}`;
    const result = adminAuthenticate(mockReq, mockRes);
    expect(result).toBe(true);
    expect(mockRes.writeHead).not.toHaveBeenCalled();
  });
});
