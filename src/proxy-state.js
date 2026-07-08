const proxyState = {
  enabled: true,
  toggle() {
    proxyState.enabled = !proxyState.enabled;
    return proxyState.enabled;
  }
};

module.exports = proxyState;
