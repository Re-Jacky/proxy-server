const proxyState = {
  enabled: true,
  sockets: new Set(),

  toggle() {
    proxyState.enabled = !proxyState.enabled;
    if (!proxyState.enabled) {
      proxyState.closeAllSockets();
    }
    return proxyState.enabled;
  },

  closeAllSockets() {
    for (const socket of proxyState.sockets) {
      try { socket.destroy(); } catch (e) { /* ignore */ }
    }
    proxyState.sockets.clear();
  },

  trackSocket(socket) {
    proxyState.sockets.add(socket);
    socket.on('close', () => {
      proxyState.sockets.delete(socket);
    });
    socket.on('error', () => {
      proxyState.sockets.delete(socket);
    });
  }
};

module.exports = proxyState;
