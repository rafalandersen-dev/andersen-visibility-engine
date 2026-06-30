# Shopify Connector — Setup

Milo publishes **blog articles** to a Shopify store via the Shopify Admin
GraphQL API using a **custom (private) app Admin API access token**. All calls
are server-side; the token is never exposed to the browser or logged.

> **v1 scope:** blog articles only. v1 does **not** support products,
> collections, images, theme editing, checkout, orders, customers or inventory.
> Milo requests **content permissions only** — never order/customer/product data.

## What Milo needs
- **Shop domain** — `mystore.myshopify.com` (a bare `mystore` is accepted and
  expanded automatically; the public custom domain also works)
- **Admin API access token** — from a custom app (starts with `shpat_`)
- **At least one Shopify blog** (Online Store → Blog posts)

## Create a custom app + token
1. Shopify admin → **Settings → Apps and sales channels → Develop apps**.
2. **Create an app** (e.g. "Milo Growth").
3. **Configuration → Admin API integration** → grant the content scopes:
   - `read_content` and `write_content` (Blogs & Articles).
   - Do **not** grant products, orders, customers, etc.
4. **Install app**, then **API credentials → Admin API access token** → reveal
   and copy it (shown once).

## Connect in Milo
1. Open **Project Setup** (`/app/setup`) → **Publishing**.
2. Connector type → **Shopify**.
3. Enter shop domain and the Admin API access token.
4. Click **Test connection** → expect "Connected to …".
5. Click **Load blogs**, pick the **target blog** from the selector.
6. Optionally set a default author and tags. **Save publishing settings.**

The token is **never pre-filled** after saving. Leave blank to keep it; type a
new value only to replace it.

## Draft vs publish
- **Send to website** (Editor) creates an **unpublished (draft) article** in the
  selected blog. It is visible in Shopify admin but not on the storefront.
- **Publish live** sets the article `isPublished: true` and stores the live URL
  (`/blogs/<blog>/<article>`) in Milo.

## Update vs duplicate (no duplicates)
On the first send, Milo stores the returned Shopify **article GID**. Re-sending
or publishing the **same** asset updates that existing article (by GID) instead
of creating a new one.

## Blog articles only
Service-page / landing-page content can still be sent, but it is published as a
**blog article** (Shopify v1 has no page connector here). The editor shows a
note when the destination isn't a blog post.

## Troubleshooting
| Message | Cause / fix |
|---|---|
| "Shopify rejected the token…" | Token wrong/revoked, or missing content scopes. |
| "Shopify store not found…" | Wrong shop domain (use `mystore.myshopify.com`). |
| "Select a Shopify blog…" | No blog selected — Load blogs and pick one. |
| "No blogs found…" | Create a blog in Shopify (Online Store → Blog posts). |

## Security
- Server-side only; the Admin API token is never returned to the browser after
  save and never logged (only the shop host + status are logged).
- Content scopes only; no access to orders, customers, products or payments.
- Revoke/uninstall the custom app in Shopify to disconnect.
