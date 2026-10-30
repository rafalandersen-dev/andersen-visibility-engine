// Top-level network guard for the first-use fixture. build.cjs inlines this plain
// script, inside a block so its names stay local, in index.html before the bundle:
// it is in place before any module evaluates (a bundled import would be dropped,
// since package.json declares no side effects). Every programmatic request is
// recorded and refused: the fixture's only data are synthetic in-page mocks. The
// page's own stylesheet and font requests are ordinary document loads, not affected.
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
