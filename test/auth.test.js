process.env.PORT = '8080';
process.env.AUTH_ENABLED = 'true';
process.env.PROXY_USERNAME = 'testuser';
process.env.PROXY_PASSWORD = 'testpassword123';
process.env.LOG_LEVEL = 'error';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'adminpass123';

const { authenticate } = require('../src/auth');

describe('Authentication Module', () => {
  let mockReq;
  let mockRes;
  
  beforeEach(() => {
    mockReq = {
      socket: { remoteAddress: '127.0.0.1' },
      method: 'GET',
      url: 'http://example.com',
      headers: {}
    };
    
    mockRes = {
      writeHead: jest.fn(),
      end: jest.fn()
    };
  });

  test('should reject request without auth header', () => {
    const result = authenticate(mockReq, mockRes);
    
    expect(result).toBe(false);
    expect(mockRes.writeHead).toHaveBeenCalledWith(407, {
      'Proxy-Authenticate': 'Basic realm="Proxy Server"'
    });
    expect(mockRes.end).toHaveBeenCalledWith('Proxy authentication required');
  });

  test('should reject request with invalid credentials', () => {
    const invalidAuth = Buffer.from('wronguser:wrongpass').toString('base64');
    mockReq.headers['proxy-authorization'] = `Basic ${invalidAuth}`;
    
    const result = authenticate(mockReq, mockRes);
    
    expect(result).toBe(false);
    expect(mockRes.writeHead).toHaveBeenCalledWith(407, expect.any(Object));
    expect(mockRes.end).toHaveBeenCalledWith('Invalid proxy credentials');
  });

  test('should accept request with valid credentials', () => {
    const validAuth = Buffer.from('testuser:testpassword123').toString('base64');
    mockReq.headers['proxy-authorization'] = `Basic ${validAuth}`;
    
    const result = authenticate(mockReq, mockRes);
    
    expect(result).toBe(true);
    expect(mockRes.writeHead).not.toHaveBeenCalled();
    expect(mockRes.end).not.toHaveBeenCalled();
  });

  test('should handle malformed auth header gracefully', () => {
    mockReq.headers['proxy-authorization'] = 'Basic invalid!!!';
    
    const result = authenticate(mockReq, mockRes);
    
    expect(result).toBe(false);
    expect(mockRes.writeHead).toHaveBeenCalledWith(407, expect.any(Object));
  });
});
