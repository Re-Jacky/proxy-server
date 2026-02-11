# AGENTS.md - Development Guide for AI Agents

This document provides essential context for AI coding agents working in the proxy-server codebase.

## Project Overview

**Type**: Node.js HTTP/HTTPS/WebSocket proxy server  
**Tech Stack**: Pure Node.js (no frameworks), dotenv for configuration  
**Entry Point**: `src/server.js`  
**Architecture**: Modular architecture with separated concerns

## Build & Run Commands

### Installation
```bash
npm install
```

### Running the Server
```bash
# Production/Development
npm start

# The server will fail to start if credentials are not properly configured in .env
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run a single test file
npx jest test/auth.test.js
```

### Linting
```bash
# Check for linting errors
npm run lint

# Auto-fix linting errors
npm run lint:fix
```

## Configuration

### Environment Variables (.env)
All configuration is via `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | Server listen port (validated 1-65535) |
| `AUTH_ENABLED` | true | Enable/disable authentication |
| `PROXY_USERNAME` | (required) | Basic auth username (min 3 chars) |
| `PROXY_PASSWORD` | (required) | Basic auth password (min 8 chars) |
| `LOG_FILE` | proxy.log | Log file name (in logs/ dir) |
| `LOG_LEVEL` | info | Logging verbosity: error, warn, info, debug |
| `REQUEST_TIMEOUT` | 30000 | HTTP request timeout (ms) |
| `CONNECTION_TIMEOUT` | 20000 | Socket connection timeout (ms) |
| `MAX_CONNECTIONS` | 1000 | Maximum concurrent connections |

**Important**: Configuration validation happens at startup. The server will refuse to start with invalid config.

## Code Style Guidelines

### Module System
- **CommonJS only** (Node.js `require`/`module.exports`)
- No ES6 imports (`import`/`export`)

### Import Organization
```javascript
// 1. Core Node.js modules (alphabetically)
const http = require('http');
const net = require('net');
const url = require('url');

// 2. Third-party modules
require('dotenv').config();

// 3. Local modules (relative imports)
const { log } = require('./logger');
const { authenticate } = require('./auth');
```

### Variable Naming
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `PORT`, `AUTH_ENABLED`, `LOG_FILE`)
- **Functions**: `camelCase` (e.g., `authenticate`, `handleHTTPProxy`, `isPrivateIP`)
- **Variables**: `camelCase` (e.g., `clientIp`, `parsedUrl`, `proxyReq`)
- **File naming**: `kebab-case.js` (e.g., `http.js`, `websocket.js`)

### Error Handling
**Pattern**: Structured logging with context, graceful degradation, no server crashes

```javascript
// CORRECT: Log errors with context, respond gracefully
proxyReq.on('error', (err) => {
  log('error', 'HTTP proxy error', {
    clientIp: clientIp,
    code: 'ERR'
  });
  
  log('debug', 'HTTP proxy error details', {
    clientIp: clientIp,
    method: req.method,
    url: req.url,
    error: err.message,
    stack: err.stack
  });
  
  if (!res.headersSent) {
    res.writeHead(500);
    res.end('Proxy error');
  }
});

// WRONG: Don't throw uncaught exceptions (except at startup validation)
throw new Error('Something failed');
```

### Logging Standards
Use the `log(level, message, details)` function from `src/logger.js`:

- **Levels**: `error`, `warn`, `info`, `debug`
- **High-level events** at `info` level with short codes
- **Detailed context** at `debug` level with full data
- **NEVER log passwords** - even in debug mode

```javascript
// Info: High-level event markers
log('info', 'HTTP request received', {
  clientIp: clientIp,
  code: 'REQ'
});

// Debug: Detailed diagnostics
log('debug', 'HTTP request details', {
  clientIp: clientIp,
  method: req.method,
  url: req.url,
  headers: req.headers,
  httpVersion: req.httpVersion
});

// NEVER DO THIS:
log('debug', 'Auth credentials', {
  password: password  // WRONG - never log passwords
});
```

### Authentication Patterns
```javascript
// Check AUTH_ENABLED before requiring credentials
if (AUTH_ENABLED && !authenticate(req, res)) {
  return;
}

// Warn when authentication is disabled
if (!AUTH_ENABLED) {
  log('warn', 'Connection without authentication (AUTH_ENABLED=false)', {
    clientIp: clientIp,
    url: req.url
  });
}
```

### Security Patterns

**Input Validation**:
```javascript
// Validate URLs and hostnames
if (!parsedUrl.hostname) {
  log('error', 'Invalid URL', { clientIp, url: req.url });
  res.writeHead(400);
  res.end('Bad Request: Invalid URL');
  return;
}

// SSRF protection
if (isPrivateIP(parsedUrl.hostname)) {
  log('warn', 'SSRF attempt detected', {
    clientIp: clientIp,
    targetHost: parsedUrl.hostname
  });
  res.writeHead(403);
  res.end('Forbidden: Access to private IP addresses is not allowed');
  return;
}
```

### HTTP Response Patterns
```javascript
// For proxy authentication required
res.writeHead(407, {
  'Proxy-Authenticate': 'Basic realm="Proxy Server"'
});
res.end('Proxy authentication required');

// For successful proxy responses
res.writeHead(proxyRes.statusCode, proxyRes.headers);
proxyRes.pipe(res);

// For proxy errors
if (!res.headersSent) {
  res.writeHead(502);
  res.end('Bad Gateway');
}
```

### Async Patterns
- Use **callbacks** and **event emitters** (Node.js style)
- Async logging with `fs.appendFile()` (not sync!)
- Event handlers: `on('event', (data) => { ... })`
- Timeouts: `setTimeout()`, `socket.timeout`, `request.timeout`

### Code Organization

**Current Structure**:
```
src/
├── server.js          # Server setup, health check, graceful shutdown
├── config.js          # Configuration loading and validation
├── logger.js          # Async logging utilities
├── auth.js            # Authentication
└── handlers/
    ├── http.js        # HTTP proxy handler with SSRF protection
    ├── https.js       # HTTPS CONNECT handler
    └── websocket.js   # WebSocket upgrade handler
```

**Module Responsibilities**:
- **server.js**: HTTP server creation, routing, graceful shutdown, signal handling
- **config.js**: Loads .env, validates all config, exports constants
- **logger.js**: Async file logging + console output, respects LOG_LEVEL
- **auth.js**: Basic auth, credential validation
- **handlers/*.js**: Protocol-specific proxy logic, input validation, error handling

## Common Operations

### Adding New Features
1. Read existing code patterns in relevant modules
2. Follow the modular structure - add new files if needed
3. Add logging at both `info` and `debug` levels
4. Handle errors gracefully without crashing server
5. Write tests in `test/` directory
6. Run `npm test` and `npm run lint` before committing
7. Update documentation (README.md, AGENTS.md)

### Modifying Logging
- All logs go to `logs/{LOG_FILE}` as JSON + console
- Use `clientIp` consistently for tracking requests
- Include short `code` fields for grepping: `REQ`, `RES`, `ERR`, `CONNECT`, `WS`
- Async logging: Use `fs.appendFile()` not `fs.appendFileSync()`

### Security Considerations
- **Never** log passwords or auth tokens
- **Always** validate input (URLs, hostnames, headers)
- Clean proxy-specific headers: `delete options.headers['proxy-authorization']`

### Testing Patterns
```javascript
// Set environment before requiring modules
process.env.PORT = '8080';
process.env.AUTH_ENABLED = 'true';
process.env.PROXY_USERNAME = 'testuser';
process.env.PROXY_PASSWORD = 'testpassword123';
process.env.LOG_LEVEL = 'error';  // Suppress logs in tests

const { authenticate } = require('../src/auth');

describe('Module Name', () => {
  test('should do something', () => {
    // Arrange
    const mockReq = { /* ... */ };
    
    // Act
    const result = functionUnderTest(mockReq);
    
    // Assert
    expect(result).toBe(expectedValue);
  });
});
```

## Dependencies

### Runtime
- `dotenv@^16.4.5` - Environment variable loading

### Dev Dependencies
- `eslint@^10.0.0` - Code linting (ESLint 10 flat config)
- `jest@^30.2.0` - Testing framework
- `globals` - Global variables for ESLint

## Architecture Notes

### Request Flow
1. Client → Proxy Server (configurable port)
2. Health check bypass (GET /health)
3. Authentication check (if enabled)
4. Input validation (URL, hostname, SSRF check)
5. Create outbound connection to target
6. Pipe data bidirectionally with timeouts
7. Log all events (info + debug levels)

### Connection Types
- **HTTP**: Standard proxy request/response with validation
- **HTTPS**: CONNECT tunnel (encrypted passthrough)
- **WebSocket**: Upgrade to bidirectional streaming

### Logging
- **Async**: Non-blocking file writes
- **Format**: JSON + human-readable console
- **Levels**: error, warn, info, debug
- **File**: `logs/{LOG_FILE}`

### Graceful Shutdown
- Listens for SIGTERM, SIGINT
- Closes HTTP server gracefully
- 10-second timeout before forced exit
- Logs shutdown events

### Rate Limiting
- **Failed auth attempts**: Max 5 per IP per minute
- **Cleanup**: Runs every 60 seconds
- **Storage**: In-memory Map (stateless, resets on restart)

## Git Workflow
- No pre-commit hooks configured
- Run `npm test` and `npm run lint` before committing
- Keep commits atomic and descriptive

## Health Check
- **Endpoint**: `GET /health`
- **Response**: JSON with status, uptime, timestamp
- **Use cases**: Load balancers, monitoring, container orchestration
