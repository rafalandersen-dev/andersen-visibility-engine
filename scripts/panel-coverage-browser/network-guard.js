// Strict network guard (same as the CG-02A and CG-03A fixtures), inlined by build.cjs inside a block in index.html before the
// bundle, so it is in place before any module evaluates. Every programmatic request is
// recorded and refused; the fixture's data are synthetic in-page values. The page's own
// stylesheet and script are ordinary document loads (CSP restricts them to this origin).
const attempts = [];
const refuse = (kind, target) => {
  attempts.push({ kind, target: String(target).slice(0, 200) });
  return Error(`Network access is outside this local fixture (${kind}).`);
};
window.__miloNetworkAttempts = attempts;
window.fetch = async (input) => {
  throw refuse("fetch", typeof input === "string" ? input : (input?.url ?? input));
};
const open = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (method, url, ...rest) {
  this.__miloTarget = url;
  return open.call(this, method, url, ...rest);
};
XMLHttpRequest.prototype.send = function () {
  throw refuse("xhr", this.__miloTarget);
};
window.WebSocket = function (url) {
  throw refuse("websocket", url);
};
window.EventSource = function (url) {
  throw refuse("eventsource", url);
};
if (navigator.sendBeacon)
  navigator.sendBeacon = (url) => {
    throw refuse("beacon", url);
  };
window.open = (url) => {
  throw refuse("window.open", url);
};
