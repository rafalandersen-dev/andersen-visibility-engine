# Milo Analytics Snippet — Install Guide

Milo's first-party analytics is a tiny script that records anonymous page views,
content views, CTA/booking clicks and AI-referrer signals for one website per
project. No cookies are required for basic tracking.

## Where to find the snippet
**Analytics** (`/app/analytics`) → the snippet is shown with a **Copy** button.
It looks like:
```html
<script src="https://milogrowth.com/milo-analytics.js" data-project-id="YOUR_PROJECT_ID"></script>
```
The `data-project-id` is filled in for the active project automatically.

## Install on a custom site
Paste the snippet just before the closing `</body>` tag on every page (or in a
shared layout/footer template). Deploy.

## Install on WordPress
- **Theme:** Appearance → Theme File Editor → add to `footer.php` before
  `</body>`; or use a child theme.
- **Plugin (easier):** any "header & footer scripts" plugin → paste into the
  **footer** section.
- **Block themes:** Tools → or a code-snippets plugin that injects into `wp_foot`.

## Install on Shopify (manual)
1. Online Store → **Themes → ⋯ → Edit code**.
2. Open `layout/theme.liquid`.
3. Paste the snippet just before `</body>`. Save.

> Milo's Shopify connector publishes blog articles; it does **not** edit the
> theme, so the snippet is added manually (once).

## Test that events arrive
1. Install the snippet and **visit the site** in a normal browser (not blocked
   by an ad blocker).
2. Back in **Analytics**, reload after a minute — the empty state turns into
   visits, and the **Launch checklist** marks "Analytics events received".
3. Click a CTA/booking link on the site to generate click events.

## What CTA / booking clicks mean
- **CTA click:** a click on a call-to-action element (e.g. contact/quote).
- **Booking click:** a click on a booking/appointment link.

These are on-site engagement signals, not conversions or revenue. They show that
content is driving intent.

## What AI signals do and do NOT mean
- **AI signal** = a visit referred by, or a crawl from, a known AI assistant /
  AI search source (e.g. an AI referrer domain or AI crawler user-agent).
- It indicates **AI-driven discovery/visibility**. It is **not** proof of an AI
  citation, a ranking, or guaranteed traffic. Treat it as a readiness/visibility
  signal, not a guarantee.

## Privacy
Tracking is anonymous (no personal data, no cross-site profiles). Data is stored
in your Milo workspace and used only to show performance inside the project.
