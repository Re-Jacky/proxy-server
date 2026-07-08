process.env.PORT = '8080';
process.env.AUTH_ENABLED = 'false';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'adminpassword123';
process.env.LOG_LEVEL = 'error';

const { handleAdmin } = require('../src/admin');

describe('Admin Module', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      socket: { remoteAddress: '127.0.0.1' },
      method: 'GET',
      url: '',
      headers: {
        authorization: 'Basic ' + Buffer.from('admin:adminpassword123').toString('base64')
      },
      _listeners: {},
      on(event, handler) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(handler);
        return this;
      },
      emit(event) {
        const handlers = this._listeners[event] || [];
        handlers.forEach(function(h) { h(); });
      }
    };
    mockRes = {
      _headers: {},
      _data: '',
      _listeners: {},
      writeHead(status, headers) {
        this._status = status;
        if (headers) Object.assign(this._headers, headers);
      },
      end(data) {
        this._ended = true;
        this._data = data || '';
      },
      write(data) {
        this._data += data;
      },
      on(event, handler) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(handler);
        return this;
      },
      emit(event) {
        const handlers = this._listeners[event] || [];
        handlers.forEach(function(h) { h(); });
      }
    };
  });

  test('should serve admin page', () => {
    mockReq.url = '/admin';
    handleAdmin(mockReq, mockRes);
    expect(mockRes._status).toBe(200);
    expect(mockRes._data).toContain('Proxy Admin');
  });

  test('should return status JSON', () => {
    mockReq.url = '/admin/api/status';
    handleAdmin(mockReq, mockRes);
    expect(mockRes._status).toBe(200);
    const body = JSON.parse(mockRes._data);
    expect(body).toHaveProperty('enabled');
    expect(body).toHaveProperty('metrics');
  });

  test('should toggle proxy state', () => {
    mockReq.url = '/admin/api/toggle';
    mockReq.method = 'POST';
    handleAdmin(mockReq, mockRes);
    expect(mockRes._status).toBe(200);
    const body = JSON.parse(mockRes._data);
    expect(body).toHaveProperty('enabled');
  });

  test('should return 404 for unknown admin routes', () => {
    mockReq.url = '/admin/api/unknown';
    handleAdmin(mockReq, mockRes);
    expect(mockRes._status).toBe(404);
  });

  test('should return SSE content type', () => {
    mockReq.url = '/admin/api/events';
    handleAdmin(mockReq, mockRes);
    expect(mockRes._status).toBe(200);
    expect(mockRes._headers['Content-Type']).toBe('text/event-stream');
    mockReq.emit('close');
  });
});
