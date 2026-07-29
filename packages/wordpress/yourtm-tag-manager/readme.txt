=== YourTM Tag Manager ===
Contributors: yourtm
Tags: tag manager, analytics, tracking, performance, gtm alternative
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Connect your WordPress site to the YourTM desktop app and serve compiled tag manager bundles locally for zero-dependency, same-origin delivery.

== Description ==

YourTM Tag Manager is a WordPress plugin that connects to the [YourTM](https://yourtm.io) Electron desktop application. It serves compiled tag bundles directly from your WordPress site -- no external scripts, no third-party CDN dependencies, no tracking delays.

**Key Features:**

* **Same-origin bundle delivery** -- Tag bundles are served from your own domain via wp-content/uploads. No external requests on the frontend.
* **Automatic DataLayer enrichment** -- Pushes WordPress page context (post type, categories, breadcrumbs, WooCommerce product data) into window.dataLayer before your tags fire.
* **REST API for the desktop app** -- Exposes your site structure (post types, taxonomies, menus, templates) so the YourTM desktop app can auto-generate zones and understand your site.
* **Webhook-based sync** -- The desktop app pushes compiled bundles directly to WordPress on publish. Or sync manually / on a schedule.
* **Cache-aware** -- Automatically purges WP Engine, Cloudflare, LiteSpeed, W3 Total Cache, WP Super Cache, Redis, SiteGround, Kinsta, and more when a bundle updates.
* **WooCommerce support** -- Auto-detects WooCommerce pages (shop, cart, checkout, account) and enriches the DataLayer with product, cart, and purchase data.
* **CDN fallback** -- If the local bundle is missing, optionally falls back to a Cloudflare CDN URL.
* **Zero PII** -- User data in the DataLayer is limited to login status, role, and a salted hash of the user ID. No emails, names, or phone numbers are ever output.

**How It Works:**

1. Install the plugin and enter your Container ID and API Key.
2. The YourTM desktop app compiles your tags, triggers, zones, and variables into an optimized JS bundle.
3. The bundle is pushed to WordPress via the REST API (or pulled on demand).
4. WordPress serves the bundle from local storage with proper cache headers.
5. The DataLayer script outputs page context before the bundle loads.

**Performance:**

YourTM bundles are typically 5-10KB gzipped (vs 50-80KB for GTM). Combined with same-origin delivery and aggressive caching, this delivers measurably better Core Web Vitals.

== Installation ==

1. Upload the `yourtm-tag-manager` folder to `/wp-content/plugins/`.
2. Activate the plugin through the Plugins menu in WordPress.
3. Go to Settings > YourTM Tag Manager.
4. Enter your Container ID and API Key from the YourTM desktop app.
5. Click "Test Connection" to verify communication.
6. Click "Sync Now" to pull the latest bundle.

**Requirements:**

* WordPress 5.8 or later
* PHP 7.4 or later
* The YourTM desktop app running (for sync and connection features)

== Frequently Asked Questions ==

= Do I need the YourTM desktop app? =

Yes. The desktop app is where you create and compile your tags, triggers, and zones. This plugin serves the compiled output and exposes your WordPress site structure to the app.

= Does this replace Google Tag Manager? =

Yes. YourTM is a full replacement for GTM with better performance, a modern UI, and developer-friendly features. This plugin handles the WordPress integration side.

= Will this slow down my site? =

No. The bundle is served from your own domain (same-origin) with aggressive caching. YourTM bundles are typically 5-10KB gzipped -- significantly smaller than GTM's 50-80KB runtime.

= Does it work with WooCommerce? =

Yes. The plugin auto-detects WooCommerce and enriches the DataLayer with product data (on product pages), cart data (on the cart page), and purchase data (on the order confirmation page).

= Does it work with page caching? =

Yes. The plugin detects and purges caches from WP Engine, Cloudflare, LiteSpeed Cache, W3 Total Cache, WP Super Cache, Kinsta, SiteGround, and more whenever a bundle is synced.

= Is any personal data exposed? =

No PII is ever output. The user data in the DataLayer is limited to login status, user role, and a salted SHA-256 hash of the user ID.

= What happens if the desktop app is offline? =

The last synced bundle continues to be served from local storage. Optionally, you can configure a CDN fallback URL.

== Screenshots ==

1. Settings page with dark theme matching YourTM branding
2. Bundle status showing version, size, and sync time
3. DataLayer enrichment configuration
4. Auto-generated zone suggestions from site structure
5. REST API endpoint reference

== Changelog ==

= 1.0.0 =
* Initial release
* Bundle sync from desktop app and CDN fallback
* REST API exposing site structure for zone generation
* DataLayer enrichment with page, site, user, and WooCommerce data
* Cache purging for major hosting and caching platforms
* Admin settings page with dark YourTM-branded theme

== Upgrade Notice ==

= 1.0.0 =
Initial release.
