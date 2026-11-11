import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  getWordPressSites,
  addWordPressSite,
  removeWordPressSite,
  WordPressSite,
} from '@/lib/project-config';
import { wpFetch } from '@/lib/wp-fetch';

/**
 * Normalize a site URL for comparison: lowercase hostname, remove trailing slashes
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hostname = parsed.hostname.toLowerCase();
    // Remove trailing slash from pathname
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return url.replace(/\/+$/, '').toLowerCase();
  }
}

/**
 * Turn a failed WordPress response into something worth showing a user.
 *
 * The raw body is useless in a dialog: a wrong key returns a WP_Error JSON
 * envelope, and a site without the plugin returns a whole HTML page (WordPress
 * answers /wp-json/... with 404, or 405 when the path isn't a POST route).
 */
async function describeWpFailure(response: Response, siteUrl: string): Promise<string> {
  const host = (() => {
    try { return new URL(siteUrl).host; } catch { return siteUrl; }
  })();

  if (response.status === 401 || response.status === 403) {
    return `Invalid API key for ${host}. Copy the key from Settings → YourTM Tag Manager on that site.`;
  }
  if (response.status === 404 || response.status === 405) {
    return `No YourTM plugin responding at ${host}. Install and activate the plugin, then try again.`;
  }

  const body = await response.text().catch(() => '');
  // Prefer the plugin's own message when it sent one; never echo HTML.
  try {
    const parsed = JSON.parse(body);
    if (parsed?.message) return `${host}: ${parsed.message}`;
  } catch {
    /* not JSON — fall through */
  }
  const snippet = body.trim().startsWith('<') ? '' : ` ${body.slice(0, 120)}`;
  return `${host} returned HTTP ${response.status}.${snippet}`;
}

/**
 * GET /api/wordpress - List all connected WordPress sites
 */
export async function GET() {
  try {
    const sites = await getWordPressSites();
    return NextResponse.json({ sites });
  } catch (error) {
    console.error('[WordPress API] Error listing sites:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/wordpress - Test connection or register a new WordPress site
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Accept both camelCase (from frontend) and snake_case (from external callers)
    const action = body.action || 'register';
    const url = body.url;
    const api_key = body.api_key || body.apiKey;
    const container_id = body.container_id;
    const environment = body.environment;

    if (!url || !api_key) {
      return NextResponse.json(
        { error: 'url and api_key are required' },
        { status: 400 }
      );
    }

    // Normalize URL (remove trailing slash)
    const siteUrl = url.replace(/\/+$/, '');
    const apiUrl = `${siteUrl}/wp-json/yourtm/v1`;

    // Handle test connection action
    if (action === 'test') {
      try {
        const verifyResponse = await wpFetch(`${apiUrl}/verify`, api_key, { method: 'POST' });
        if (verifyResponse.ok) {
          return NextResponse.json({ success: true, message: 'Connection successful! WordPress plugin is active and responding.' });
        } else {
          return NextResponse.json({
            success: false,
            error: await describeWpFailure(verifyResponse, siteUrl),
          });
        }
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: `Could not reach ${siteUrl}. Check the URL and that the site is online.`,
        });
      }
    }

    // Check for duplicate site registration
    const existingSites = await getWordPressSites();
    const normalizedNewUrl = normalizeUrl(siteUrl);
    const existingSite = existingSites.find(s => normalizeUrl(s.url) === normalizedNewUrl);
    if (existingSite) {
      return NextResponse.json(
        { error: 'A site with this URL is already registered', existing_site_id: existingSite.id },
        { status: 409 }
      );
    }

    // Step 1: Verify the API key by calling the WordPress plugin verify endpoint
    let verifyResponse: Response;
    try {
      verifyResponse = await wpFetch(`${apiUrl}/verify`, api_key, { method: 'POST' });
    } catch (error) {
      return NextResponse.json(
        { error: `Could not reach ${siteUrl}. Check the URL and that the site is online.` },
        { status: 502 }
      );
    }

    if (!verifyResponse.ok) {
      return NextResponse.json(
        { error: await describeWpFailure(verifyResponse, siteUrl) },
        { status: 401 }
      );
    }

    // Step 2: Fetch full site info
    let siteInfo: any;
    try {
      const infoResponse = await wpFetch(`${apiUrl}/site-info`, api_key);
      if (!infoResponse.ok) {
        throw new Error(`Site info request failed: ${infoResponse.status}`);
      }
      siteInfo = await infoResponse.json();
    } catch (error) {
      return NextResponse.json(
        { error: `Connected but could not fetch site info: ${error instanceof Error ? error.message : String(error)}` },
        { status: 502 }
      );
    }

    // Step 3: Build the site record
    // Derive a display name from the site URL hostname.
    let siteName = siteUrl;
    try {
      siteName = new URL(siteUrl).hostname;
    } catch {
      // keep siteUrl as fallback
    }

    const site: WordPressSite = {
      id: randomUUID(),
      name: siteInfo.home_url || siteName,
      url: siteUrl,
      api_url: apiUrl,
      api_key,
      container_id: container_id || '',
      environment: environment || 'staging',
      last_sync: '',
      bundle_version: '',
      status: 'connected',
      wordpress_version: siteInfo.plugin_info?.wordpress_version || '',
      php_version: siteInfo.plugin_info?.php_version || '',
      woocommerce: siteInfo.woocommerce ?? false,
      post_types: siteInfo.post_types || [],
      suggested_zones: siteInfo.suggested_zones || [],
    };

    // Step 4: Store in config
    await addWordPressSite(site);

    return NextResponse.json({ site });
  } catch (error) {
    console.error('[WordPress API] Error registering site:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/wordpress - Remove a WordPress site
 */
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    await removeWordPressSite(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[WordPress API] Error removing site:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
