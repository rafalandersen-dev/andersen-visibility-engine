import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Lightweight, dependency-free first-party tracking snippet.
// Usage on a client website:
//   <script src="https://milogrowth.com/milo-analytics.js" data-project-id="PROJECT_ID"></script>
const SCRIPT = `(function () {
  try {
    var s = document.currentScript ||
      (function () {
        var all = document.getElementsByTagName('script');
        for (var i = 0; i < all.length; i++) {
          if ((all[i].src || '').indexOf('milo-analytics.js') !== -1) return all[i];
        }
        return null;
      })();
    if (!s) return;
    var projectId = s.getAttribute('data-project-id');
    if (!projectId) { console.warn('[milo-analytics] missing data-project-id'); return; }

    var origin = 'https://milogrowth.com';
    try { origin = new URL(s.src).origin; } catch (e) {}
    var endpoint = origin + '/api/analytics/track';

    function uid(prefix) {
      try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
      return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    var visitorId = '';
    try {
      visitorId = localStorage.getItem('milo_vid') || '';
      if (!visitorId) { visitorId = uid('v-'); localStorage.setItem('milo_vid', visitorId); }
    } catch (e) { visitorId = uid('v-'); }

    var sessionId = '';
    try {
      sessionId = sessionStorage.getItem('milo_sid') || '';
      if (!sessionId) { sessionId = uid('s-'); sessionStorage.setItem('milo_sid', sessionId); }
    } catch (e) { sessionId = uid('s-'); }

    function send(eventType, metadata) {
      try {
        var payload = {
          projectId: projectId,
          eventType: eventType,
          url: location.href,
          path: location.pathname,
          title: document.title,
          referrer: document.referrer,
          sessionId: sessionId,
          visitorId: visitorId,
          metadata: metadata || {}
        };
        var body = JSON.stringify(payload);
        // text/plain keeps this a CORS "simple" request (no preflight).
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: body,
          keepalive: true,
          credentials: 'omit',
          mode: 'cors'
        }).catch(function () {});
      } catch (e) {}
    }

    window.miloTrack = function (eventType, metadata) {
      if (!eventType) return;
      send(String(eventType), metadata || {});
    };

    var lastPath = location.pathname;
    function onRouteChange() {
      if (location.pathname === lastPath) return;
      lastPath = location.pathname;
      send('page_view', {});
    }

    // SPA support: wrap history methods + listen for popstate.
    try {
      var _ps = history.pushState;
      history.pushState = function () { var r = _ps.apply(this, arguments); setTimeout(onRouteChange, 0); return r; };
      var _rs = history.replaceState;
      history.replaceState = function () { var r = _rs.apply(this, arguments); setTimeout(onRouteChange, 0); return r; };
      window.addEventListener('popstate', function () { setTimeout(onRouteChange, 0); });
    } catch (e) {}

    // Initial page view.
    if (document.readyState === 'complete' || document.readyState === 'interactive') send('page_view', {});
    else window.addEventListener('DOMContentLoaded', function () { send('page_view', {}); });
  } catch (e) {}
})();
`;

export const Route = createFileRoute("/milo-analytics.js")({
  server: {
    handlers: {
      GET: async () =>
        new Response(SCRIPT, {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=600",
            "Access-Control-Allow-Origin": "*",
          },
        }),
    },
  },
});
