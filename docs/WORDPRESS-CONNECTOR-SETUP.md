# WordPress Connector — Setup

Milo publishes content to a self-hosted WordPress site via the WordPress REST
API using an **Application Password** (read/write of posts or pages only). All
calls happen server-side; the application password is never exposed to the
browser or logged.

## What Milo needs
- **Site URL** — e.g. `https://yourwordpresssite.com`
- **Username** — a WordPress user who can create/edit/publish content
- **Application password** — generated for that user (not the login password)

## Create an Application Password
1. Log in to WordPress as the user Milo should publish as.
2. **Users → Profile** → scroll to **Application Passwords**.
3. Enter a name (e.g. "Milo Growth") → **Add New Application Password**.
4. Copy the generated password (shown once). Paste it into Milo.

> Application Passwords require WordPress 5.6+ over HTTPS. If the section is
> missing, your host may have disabled it.

## Connect in Milo
1. Open **Project Setup** (`/app/setup`) → **Publishing**.
2. Connector type → **WordPress**.
3. Enter site URL, username, application password.
4. Click **Test connection** → expect "Connected as …".
5. **Save publishing settings.**

The application password is **never pre-filled** after saving. Leave the field
blank to keep the existing one; type a new value only to replace it.

## Draft vs publish
- **Send to website** (Editor) creates a **draft** post/page in WordPress.
- **Publish live** sets the same item to **published** and stores the live URL
  in Milo.

## Update vs duplicate (no duplicates)
On the first send, Milo stores the returned WordPress **post ID** on the content
asset. Re-sending or publishing the **same** asset updates that existing post
(by ID) instead of creating a new one. A different asset creates its own post.

## Permissions needed
The user needs capability to create/edit/publish the chosen type (posts or
pages). Use a dedicated user with the minimum role required (Author/Editor).
Milo only touches posts/pages — no plugins, themes, users or settings.

## Live URL → Analytics / GSC matching
The stored live URL lets Analytics and GSC Lite match Search Console / on-site
performance back to the Milo-published page once it has data.

## Common errors
| Message | Cause / fix |
|---|---|
| "WordPress rejected the credentials…" | Wrong username/app password, or the user can't publish. |
| "WordPress REST API not found…" | Wrong site URL, or REST API disabled by a security plugin. |
| "Could not connect to WordPress…" | Site unreachable, blocked, or HTTPS/cert issue. |
| Draft created but no live URL | Publish step not run yet, or the theme returns no permalink. |

## Security
- Server-side only; the application password is never sent to the browser after
  save and never logged (only host + post id + status are logged).
- Use HTTPS. Revoke the Application Password in WordPress to disconnect.
