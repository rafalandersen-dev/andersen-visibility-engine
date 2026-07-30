import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Lightweight, dependency-free first-party tracking snippet.
// Usage on a client website:
//   <script src="https://milogrowth.com/milo-analytics.js" data-project-id="PROJECT_ID"></script>
//
// Consent (GDPR/ePrivacy): events are QUEUED, not sent, until consent is
// resolved. In the EU/EEA/UK the default is "withheld" — nothing is sent and no
// identifier is stored until window.miloConsent.grant() is called. Outside that
// region the default is "granted"; set data-consent="required" to force the
// opt-in behaviour everywhere.
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

    // --- consent -----------------------------------------------------------
    function inEurope() {
      try {
        var tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '');
        if (/^(Europe|Atlantic\\/(Canary|Madeira|Azores|Faroe|Reykjavik))/.test(tz)) return true;
      } catch (e) {}
      try {
        var offset = -new Date().getUTCMonth ? 0 : 0;
      } catch (e) {}
      return false;
    }

    var mode = (s.getAttribute('data-consent') || 'auto').toLowerCase();
    var stored = null;
    try { stored = localStorage.getItem('milo_consent'); } catch (e) {}

    var consent;
    if (stored === 'granted') consent = true;
    else if (stored === 'denied') consent = false;
    else if (mode === 'granted') consent = true;
    else if (mode === 'required') consent = null;          // withhold everywhere
    else consent = inEurope() ? null : true;               // auto

    var queue = [];
    var visitorId = '';
    var sessionId = '';

    function ensureIds() {
      // Identifiers are only created/persisted once consent exists.
      if (!visitorId) {
        try {
          visitorId = localStorage.getItem('milo_vid') || '';
          if (!visitorId) { visitorId = uid('v-'); localStorage.setItem('milo_vid', visitorId); }
        } catch (e) { visitorId = uid('v-'); }
      }
      if (!sessionId) {
        try {
          sessionId = sessionStorage.getItem('milo_sid') || '';
          if (!sessionId) { sessionId = uid('s-'); sessionStorage.setItem('milo_sid', sessionId); }
        } catch (e) { sessionId = uid('s-'); }
      }
    }

    function post(evt) {
      try {
        ensureIds();
        var payload = {
          projectId: projectId,
          eventType: evt.eventType,
          url: evt.url,
          path: evt.path,
          title: evt.title,
          referrer: evt.referrer,
          sessionId: sessionId,
          visitorId: visitorId,
          metadata: evt.metadata || {}
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

    function send(eventType, metadata) {
      var evt = {
        eventType: eventType,
        url: location.href,
        path: location.pathname,
        title: document.title,
        referrer: document.referrer,
        metadata: metadata || {}
      };
      if (consent === true) { post(evt); return; }
      if (consent === false) return;             // denied: drop
      if (queue.length < 50) queue.push(evt);    // pending: hold
    }

    function flush() {
      var pending = queue;
      queue = [];
      for (var i = 0; i < pending.length; i++) post(pending[i]);
    }

    window.miloConsent = {
      status: function () { return consent === null ? 'pending' : (consent ? 'granted' : 'denied'); },
      grant: function () {
        consent = true;
        try { localStorage.setItem('milo_consent', 'granted'); } catch (e) {}
        flush();
      },
      deny: function () {
        consent = false;
        queue = [];
        try {
          localStorage.setItem('milo_consent', 'denied');
          localStorage.removeItem('milo_vid');
          sessionStorage.removeItem('milo_sid');
        } catch (e) {}
        visitorId = ''; sessionId = '';
      },
      reset: function () {
        try { localStorage.removeItem('milo_consent'); } catch (e) {}
        consent = null;
      }
    };

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

    // Initial page view (queued when consent is still pending).
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
