# Proxy Server

A lightweight, feature-rich HTTP/HTTPS/WebSocket proxy server with authentication support and comprehensive logging. This proxy server can be easily deployed on Windows machines to allow other devices to route their traffic through it with proper authentication and detailed logging.

## Features

- ✅ HTTP and HTTPS proxy support
- ✅ WebSocket (ws:// and wss://) support
- ✅ Basic authentication (username/password)
- ✅ Authentication control (enable/disable)
- ✅ Windows-friendly setup
- ✅ Easy configuration via .env file
- ✅ Comprehensive logging system
- ✅ Cross-platform compatibility
- ✅ Simple deployment
- ✅ Detailed network tracing
- ✅ Secure default settings

## Requirements

- Node.js 12.x or higher
- Windows, macOS, or Linux operating system

## Quick Start (Windows)

1. **Download the proxy server files** to a folder on your Windows machine
2. **Double-click `start.bat`** to launch the setup script
3. The script will:

   - Check if Node.js is installed
   - Install required dependencies
   - Start the proxy server

4. Configure your browser or device to use the proxy server

```bash

```

## Manual Installation

### 1. Install Node.js

If Node.js is not already installed, download and install it from [https://nodejs.org/](https://nodejs.org/)

### 2. Install Dependencies

```bash
# Navigate to the proxy server directory
cd path/to/proxy-server

# Install dependencies
npm install
```

### 3. Configure the Proxy Server

Edit the `.env` file to customize your proxy settings:

```env
# Proxy Server Configuration
# Port for the proxy server to listen on
PORT=8888

# Authentication credentials
# Change these to secure values before deployment
USERNAME=admin
PASSWORD=password
```

### 4. Start the Proxy Server

#### On Windows:

Double-click `start.bat` or run it from the command prompt:

```cmd
start.bat
```

#### On macOS/Linux:

```bash
node proxy.js
```

## Configuration Options

| Option | Description | Default Value |
|--------|-------------|---------------|
| PORT | Port number for the proxy server | 8080 |
| USERNAME | Username for proxy authentication | admin |
| PASSWORD | Password for proxy authentication | password |

## Usage

### Browser Configuration

#### Chrome/Edge:

1. Go to Settings → System → Open your computer's proxy settings
2. Set the HTTP and HTTPS proxy to `localhost:8080` (or your custom port)
3. Enter the username and password when prompted

#### Firefox:

1. Go to Settings → General → Network Settings
2. Select "Manual proxy configuration"
3. Set HTTP Proxy to `localhost` and Port to `8080`
4. Check "Also use this proxy for HTTPS"
5. Click "OK"
6. Enter the username and password when prompted

### Device Configuration

For mobile devices or other computers:

1. Find your Windows machine's IP address (run `ipconfig` in command prompt)
2. On the client device, set the proxy to `your-windows-ip:8080`
3. Enter the authentication credentials

## Windows Firewall Configuration

If other devices can't connect to your proxy server, you may need to allow the port through Windows Firewall:

1. Open Windows Defender Firewall with Advanced Security
2. Click "Inbound Rules" → "New Rule"
3. Select "Port" → "Next"
4. Select "TCP" and enter your proxy port (default: 8080)
5. Select "Allow the connection" → "Next"
6. Check all network types → "Next"
7. Name the rule "Proxy Server" → "Finish"

## Troubleshooting

### Common Issues

1. **"Node.js is not installed or not in PATH"**

   - Download and install Node.js from [https://nodejs.org/](https://nodejs.org/)
   - Restart your computer after installation

2. **"Failed to install dependencies"**

   - Ensure you have internet access
   - Try running `npm install` manually in the proxy server directory

3. **Can't connect to proxy server**

   - Check if the server is running
   - Verify Windows Firewall settings
   - Ensure client device is on the same network
   - Check if port is already in use (try a different port in .env)

4. **Authentication failures**

   - Verify username and password in .env file
   - Ensure client is entering credentials correctly

### Logs

The proxy server will output logs to the console, including:

- Server startup information
- Authentication attempts
- Error messages
- Connection details

## Security Considerations

- **Change default credentials**: Always update the default username and password in the .env file
- **Use HTTPS**: For production use, consider setting up SSL/TLS for the proxy server
- **Network isolation**: Only expose the proxy server to trusted networks
- **Monitoring**: Keep an eye on proxy server logs for unusual activity
- **Port forwarding**: Be cautious about forwarding ports through routers to the proxy server

## Cross-Platform Usage

While this proxy server is optimized for Windows, it can also be used on other platforms:

### macOS/Linux

```bash
# Install dependencies
npm install

# Start the proxy server
node proxy.js
```

## Files

- `proxy.js` - Main proxy server code
- `package.json` - Project configuration and dependencies
- `.env` - Configuration file
- `start.bat` - Windows startup script
- `README.md` - This documentation

## License

MIT License - see LICENSE file for details

## Contributing

Feel free to submit issues or pull requests to improve this proxy server.

## Support

If you encounter any issues, please check the troubleshooting section or create an issue in the repository.
