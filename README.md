# Proxy Server

A production-ready, lightweight HTTP/HTTPS/WebSocket proxy server with authentication, security hardening, and comprehensive logging. Built with pure Node.js - no heavy frameworks.

## Features

- ✅ HTTP, HTTPS, and WebSocket proxy support
- ✅ Basic authentication
- ✅ Security hardening (input validation)
- ✅ Health check endpoint for monitoring
- ✅ Graceful shutdown handling
- ✅ Configurable timeouts and connection limits
- ✅ Async logging with JSON format
- ✅ Modular, maintainable code structure
- ✅ Comprehensive test suite with Jest
- ✅ ESLint code linting
- ✅ Cross-platform compatibility

## Requirements

- Node.js 12.x or higher
- npm or yarn

## Quick Start

```bash
# Install dependencies
npm install

# Configure credentials (REQUIRED)
# Edit .env and set PROXY_USERNAME and PROXY_PASSWORD

# Start the server
npm start
```

The server will start on port 8080 (configurable via `.env`).

## Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure the Proxy Server

Edit the `.env` file to customize settings:

```env
# Port for the proxy server
PORT=8080

# Authentication settings
AUTH_ENABLED=true
PROXY_USERNAME=your-username-here
PROXY_PASSWORD=your-secure-password-here

# Logging settings
LOG_FILE=proxy.log
LOG_LEVEL=info

# Timeout settings (milliseconds)
REQUEST_TIMEOUT=30000
CONNECTION_TIMEOUT=20000
MAX_CONNECTIONS=1000
```

**Important Security Notes:**
- When `AUTH_ENABLED=true`, you MUST set `PROXY_USERNAME` and `PROXY_PASSWORD`
- Username must be at least 3 characters
- Password must be at least 8 characters
- The server will refuse to start with missing or weak credentials

**Timeout Configuration:**
- `REQUEST_TIMEOUT`: Maximum time (ms) to wait for HTTP request to complete (default: 30000ms / 30 seconds)
- `CONNECTION_TIMEOUT`: Maximum time (ms) to wait for socket connection to establish (default: 20000ms / 20 seconds)
- `MAX_CONNECTIONS`: Maximum number of concurrent connections allowed (default: 1000)
- Adjust these values based on your network conditions and use case

### 3. Start the Proxy Server

```bash
npm start
```

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Linting

```bash
# Check for linting errors
npm run lint

# Auto-fix linting errors
npm run lint:fix
```

## Configuration Options

All configuration is done via environment variables in the `.env` file.

### Core Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | Server listen port (1-65535) |
| `AUTH_ENABLED` | true | Enable/disable authentication |
| `PROXY_USERNAME` | (required) | Basic auth username (min 3 chars) |
| `PROXY_PASSWORD` | (required) | Basic auth password (min 8 chars) |

### Logging Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_FILE` | proxy.log | Log file name (in logs/ dir) |
| `LOG_LEVEL` | info | Logging level: error, warn, info, debug |

### Timeout & Connection Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `REQUEST_TIMEOUT` | 30000 | HTTP request timeout in milliseconds (30 seconds) |
| `CONNECTION_TIMEOUT` | 20000 | Socket connection timeout in milliseconds (20 seconds) |
| `MAX_CONNECTIONS` | 1000 | Maximum concurrent connections allowed |

**Timeout Tuning Guidelines:**
- **Slow networks**: Increase both timeouts (e.g., 60000ms / 60 seconds)
- **Fast networks**: Decrease for quicker failure detection (e.g., 10000ms / 10 seconds)
- **Large file transfers**: Increase `REQUEST_TIMEOUT` significantly
- **High traffic**: Adjust `MAX_CONNECTIONS` based on system resources

## Usage

### Browser Configuration

#### Chrome/Edge:

1. Go to Settings → System → Open proxy settings
2. Set HTTP and HTTPS proxy to `localhost:8080`
3. Enter your configured username and password

#### Firefox:

1. Go to Settings → General → Network Settings
2. Select "Manual proxy configuration"
3. Set HTTP Proxy to `localhost` and Port to `8080`
4. Check "Also use this proxy for HTTPS"
5. Enter your configured credentials

### Device Configuration

For mobile devices or other computers:

1. Find your machine's IP address:
   - macOS/Linux: `ifconfig` or `ip addr`
   - Windows: `ipconfig`
2. On the client device, set proxy to `your-ip:8080`
3. Enter your authentication credentials

## Health Check Endpoint

The server exposes a health check endpoint at `GET /health`:

```bash
curl http://localhost:8080/health
```

Response:
```json
{
  "status": "ok",
  "uptime": 123.456,
  "timestamp": "2026-02-11T07:45:00.000Z"
}
```

Use this endpoint for:
- Load balancer health checks
- Monitoring systems
- Container orchestration (Docker, Kubernetes)

## Security Features

### Input Validation
- URL validation for all proxy requests
- Header sanitization
- Request size limits

### Secure Logging
- Passwords are NEVER logged
- Sensitive data is masked in logs
- Async logging prevents blocking

## Project Structure

```
proxy-server/
├── src/
│   ├── server.js              # Main entry point
│   ├── config.js              # Configuration loading and validation
│   ├── logger.js              # Async logging utilities
│   ├── auth.js                # Authentication
│   └── handlers/
│       ├── http.js            # HTTP proxy handler
│       ├── https.js           # HTTPS CONNECT handler
│       └── websocket.js       # WebSocket upgrade handler
├── test/
│   ├── config.test.js         # Configuration tests
│   └── auth.test.js           # Authentication tests
├── logs/                      # Log files directory
├── .env                       # Configuration file
├── package.json
├── eslint.config.js           # ESLint configuration
├── jest.config.js             # Jest configuration
└── README.md
```

## Troubleshooting

### Common Issues

1. **"AUTH_ENABLED is true but PROXY_USERNAME or PROXY_PASSWORD is not set"**
   - Edit `.env` and set valid credentials
   - Username: minimum 3 characters
   - Password: minimum 8 characters

2. **"Invalid PORT" error**
   - Port must be a number between 1 and 65535
   - Check `.env` file for typos

3. **"EADDRINUSE" error**
   - Port is already in use
   - Change `PORT` in `.env` or stop the conflicting process
   - Find process: `lsof -i :8080` (macOS/Linux) or `netstat -ano | findstr :8080` (Windows)

4. **Can't connect from other devices**
   - Check firewall settings
   - Ensure device is on same network
   - Verify IP address is correct

5. **Authentication failures**
   - Verify credentials match `.env` file
   - Check for extra spaces in username/password
   - Review logs in `logs/proxy.log`

## Logging

Logs are written to `logs/{LOG_FILE}` in JSON format:

```json
{
  "timestamp": "2026-02-11T07:45:00.000Z",
  "level": "info",
  "message": "HTTP request received",
  "details": {
    "clientIp": "192.168.1.100",
    "code": "REQ"
  }
}
```

Log levels:
- **error**: Critical errors only
- **warn**: Warnings and errors
- **info**: General information (recommended)
- **debug**: Detailed diagnostic information

## Performance

- **Async I/O**: Non-blocking file operations
- **Event-driven**: Efficient connection handling
- **Low memory footprint**: Minimal dependencies
- **Graceful shutdown**: Cleanly closes connections

## License

MIT License - see LICENSE file for details

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Write tests for new features
4. Ensure `npm test` and `npm run lint` pass
5. Submit a pull request

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review logs in `logs/proxy.log`
3. Run with `LOG_LEVEL=debug` for detailed information
4. Create an issue with logs and configuration (redact credentials!)
