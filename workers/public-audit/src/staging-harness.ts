export interface StagingHarnessEnv {
  PUBLIC_AUDIT_ALLOWED_HOSTS: string;
  PUBLIC_AUDIT_ALLOWED_ORIGINS: string;
  PUBLIC_AUDIT_STAGING_HARNESS_HOST?: string;
  PUBLIC_AUDIT_STAGING_TURNSTILE_SITE_KEY?: string;
}

const EXPECTED_STAGING_HOST = "staging.milogrowth.com";
const TURNSTILE_SITE_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function configuredSet(value: string | undefined, transform = (item: string) => item): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => transform(item.trim()))
      .filter(Boolean),
  );
}

function stagingHarnessHtml(siteKey: string, nonce: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive">
    <title>Milo public audit staging harness</title>
    <style nonce="${nonce}">
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: #f4f1ea; color: #1f2933; }
      main { width: min(760px, calc(100% - 32px)); margin: 48px auto; }
      .eyebrow { color: #886f3d; font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
      h1 { margin: 10px 0 8px; font-family: Georgia, serif; font-size: clamp(32px, 7vw, 48px); font-weight: 500; }
      p { color: #52606d; line-height: 1.6; }
      form, .result { margin-top: 24px; padding: 24px; border: 1px solid #d7d2c6; border-radius: 14px; background: #fff; }
      label { display: block; margin: 14px 0 6px; font-size: 13px; font-weight: 700; }
      input, select, button { width: 100%; min-height: 44px; border-radius: 8px; font: inherit; }
      input, select { border: 1px solid #b8b4aa; padding: 10px 12px; background: #fff; }
      button { margin-top: 18px; border: 0; padding: 10px 16px; background: #27333b; color: #fff; font-weight: 700; cursor: pointer; }
      button:disabled { cursor: not-allowed; opacity: .5; }
      #turnstile { margin-top: 18px; min-height: 65px; }
      #status { min-height: 24px; margin-top: 14px; font-size: 14px; }
      #status[data-error="true"] { color: #a33131; }
      .result[hidden] { display: none; }
      pre { max-height: 460px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">Isolated security staging</div>
      <h1>Public audit harness</h1>
      <p>This non-production page exercises the reviewed Worker through the same-origin API path. Use synthetic public websites only.</p>
      <form id="audit-form">
        <label for="url">Public website URL</label>
        <input id="url" name="url" type="url" inputmode="url" autocomplete="off" placeholder="https://example.com" required maxlength="2048">
        <label for="language">Output language</label>
        <select id="language" name="language">
          <option>English</option>
          <option>Polish</option>
          <option>Swedish</option>
          <option>Danish</option>
        </select>
        <div id="turnstile"></div>
        <button id="submit" type="submit" disabled>Run isolated audit</button>
        <div id="status" role="status" aria-live="polite"></div>
      </form>
      <section id="result" class="result" hidden>
        <strong>Bounded API response</strong>
        <pre id="output"></pre>
      </section>
    </main>
    <script nonce="${nonce}">
      (() => {
        "use strict";
        const form = document.getElementById("audit-form");
        const submit = document.getElementById("submit");
        const status = document.getElementById("status");
        const result = document.getElementById("result");
        const output = document.getElementById("output");
        let proof = "";
        let widgetId;

        const setStatus = (message, isError = false) => {
          status.textContent = message;
          status.dataset.error = String(isError);
        };

        const clearProof = () => {
          proof = "";
          submit.disabled = true;
        };

        window.onTurnstileLoad = () => {
          widgetId = window.turnstile.render("#turnstile", {
            sitekey: "${siteKey}",
            action: "public_audit",
            callback: (token) => {
              proof = token;
              submit.disabled = false;
              setStatus("Bot check complete.");
            },
            "expired-callback": () => {
              clearProof();
              setStatus("Bot check expired. Complete it again.", true);
            },
            "error-callback": () => {
              clearProof();
              setStatus("Bot protection could not load.", true);
            }
          });
        };

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!proof) {
            setStatus("Complete the bot check first.", true);
            return;
          }
          submit.disabled = true;
          result.hidden = true;
          output.textContent = "";
          setStatus("Running the isolated audit...");
          try {
            const response = await fetch("/api/public-audit", {
              method: "POST",
              headers: { "content-type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({
                url: document.getElementById("url").value,
                language: document.getElementById("language").value,
                botProof: proof
              })
            });
            const payload = await response.json().catch(() => undefined);
            if (!response.ok) {
              const message = payload && payload.error && payload.error.message;
              throw new Error(message || "The audit request failed.");
            }
            output.textContent = JSON.stringify(payload, null, 2);
            result.hidden = false;
            setStatus("Audit completed.");
          } catch (error) {
            setStatus(error instanceof Error ? error.message : "The audit request failed.", true);
          } finally {
            clearProof();
            if (window.turnstile && widgetId !== undefined) window.turnstile.reset(widgetId);
          }
        });
      })();
    </script>
    <script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&amp;render=explicit" async defer></script>
  </body>
</html>`;
}

export function stagingHarnessResponse(
  request: Request,
  env: StagingHarnessEnv,
): Response | undefined {
  if (request.method !== "GET") return undefined;

  const requestUrl = new URL(request.url);
  if (requestUrl.pathname !== "/") return undefined;

  const configuredHost = env.PUBLIC_AUDIT_STAGING_HARNESS_HOST?.trim().toLowerCase();
  const siteKey = env.PUBLIC_AUDIT_STAGING_TURNSTILE_SITE_KEY?.trim();
  if (
    !configuredHost ||
    configuredHost !== EXPECTED_STAGING_HOST ||
    !siteKey ||
    !TURNSTILE_SITE_KEY_PATTERN.test(siteKey) ||
    requestUrl.hostname.toLowerCase() !== configuredHost
  ) {
    return undefined;
  }

  const allowedHosts = configuredSet(env.PUBLIC_AUDIT_ALLOWED_HOSTS, (item) => item.toLowerCase());
  const allowedOrigins = configuredSet(env.PUBLIC_AUDIT_ALLOWED_ORIGINS, (item) =>
    item.toLowerCase().replace(/\/+$/, ""),
  );
  if (
    !allowedHosts.has(configuredHost) ||
    !allowedOrigins.has(requestUrl.origin.toLowerCase().replace(/\/+$/, ""))
  ) {
    return undefined;
  }

  const nonce = crypto.randomUUID().replaceAll("-", "");
  return new Response(stagingHarnessHtml(siteKey, nonce), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": [
        "default-src 'none'",
        `script-src 'nonce-${nonce}' https://challenges.cloudflare.com`,
        `style-src 'nonce-${nonce}'`,
        "connect-src 'self' https://challenges.cloudflare.com",
        "frame-src https://challenges.cloudflare.com",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}
