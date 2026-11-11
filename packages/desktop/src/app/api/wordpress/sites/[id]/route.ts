import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { gzipSync } from 'node:zlib';
import { loadConfig, Compiler } from '@yourtm/cli';
import {
  getWordPressSite,
  updateWordPressSite,
  getProjectPath,
} from '@/lib/project-config';
import { wpFetch } from '@/lib/wp-fetch';

/**
 * GET /api/wordpress/sites/[id] - Get detailed info for a specific site
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const site = await getWordPressSite(id);

    if (!site) {
      return NextResponse.json(
        { error: `WordPress site not found: ${id}` },
        { status: 404 }
      );
    }

    // Fetch fresh data from WordPress
    let freshInfo: any = null;
    try {
      const response = await wpFetch(`${site.api_url}/site-info`, site.api_key);
      if (response.ok) {
        freshInfo = await response.json();
        // Update cached site info
        await updateWordPressSite(id, {
          name: freshInfo.home_url || site.name,
          wordpress_version: freshInfo.plugin_info?.wordpress_version || site.wordpress_version,
          php_version: freshInfo.plugin_info?.php_version || site.php_version,
          woocommerce: freshInfo.woocommerce ?? site.woocommerce,
          post_types: freshInfo.post_types || site.post_types,
          suggested_zones: freshInfo.suggested_zones || site.suggested_zones,
          status: 'connected',
        });
      }
    } catch {
      // WordPress site unreachable, mark as disconnected
      await updateWordPressSite(id, { status: 'disconnected' });
    }

    // Return merged data
    const updatedSite = await getWordPressSite(id);
    return NextResponse.json({ site: updatedSite });
  } catch (error) {
    console.error('[WordPress Sites API] GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/wordpress/sites/[id] - Update site settings
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const site = await getWordPressSite(id);
    if (!site) {
      return NextResponse.json(
        { error: `WordPress site not found: ${id}` },
        { status: 404 }
      );
    }

    // Only allow updating specific fields
    const allowedUpdates: Partial<Record<string, any>> = {};
    if (body.container_id !== undefined) allowedUpdates.container_id = body.container_id;
    if (body.environment !== undefined) allowedUpdates.environment = body.environment;
    if (body.api_key !== undefined) allowedUpdates.api_key = body.api_key;

    if (Object.keys(allowedUpdates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update. Allowed: container_id, environment, api_key' },
        { status: 400 }
      );
    }

    await updateWordPressSite(id, allowedUpdates);
    const updatedSite = await getWordPressSite(id);

    return NextResponse.json({ site: updatedSite });
  } catch (error) {
    console.error('[WordPress Sites API] PUT Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/wordpress/sites/[id] - Trigger actions on the site
 *
 * Body: { action: 'sync' | 'refresh' | 'purge_cache' }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    if (!action || !['sync', 'refresh', 'purge_cache'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be one of: sync, refresh, purge_cache' },
        { status: 400 }
      );
    }

    const site = await getWordPressSite(id);
    if (!site) {
      return NextResponse.json(
        { error: `WordPress site not found: ${id}` },
        { status: 404 }
      );
    }

    // Handle each action
    if (action === 'refresh') {
      // Re-fetch site info from WordPress
      try {
        const response = await wpFetch(`${site.api_url}/site-info`, site.api_key);
        if (!response.ok) {
          throw new Error(`WordPress responded with ${response.status}`);
        }
        const freshInfo = await response.json();
        await updateWordPressSite(id, {
          name: freshInfo.home_url || site.name,
          wordpress_version: freshInfo.plugin_info?.wordpress_version || site.wordpress_version,
          php_version: freshInfo.plugin_info?.php_version || site.php_version,
          woocommerce: freshInfo.woocommerce ?? site.woocommerce,
          post_types: freshInfo.post_types || site.post_types,
          suggested_zones: freshInfo.suggested_zones || site.suggested_zones,
          status: 'connected',
        });
        const updatedSite = await getWordPressSite(id);
        return NextResponse.json({ success: true, action: 'refresh', site: updatedSite });
      } catch (error) {
        await updateWordPressSite(id, { status: 'disconnected' });
        return NextResponse.json({
          success: false,
          error: `Could not reach WordPress site: ${error instanceof Error ? error.message : String(error)}`,
        }, { status: 502 });
      }
    }

    if (action === 'sync') {
      // Push latest bundle to WordPress
      const projectPath = await getProjectPath();
      const config = await loadConfig(projectPath);
      const compiler = new Compiler(config);
      const result = await compiler.compile();

      if (result.errors.length > 0) {
        return NextResponse.json({
          success: false,
          error: `Compilation failed: ${result.errors.map((e: any) => e.message).join(', ')}`,
        }, { status: 400 });
      }

      const bundles = result.bundles.map((bundle: any) => {
        const code = bundle.code || '';
        const hash = createHash('sha256').update(code).digest('hex');
        const size = Buffer.byteLength(code, 'utf-8');
        return { name: bundle.name, code, hash, size, gzip_size: gzipSync(Buffer.from(code)).length };
      });

      const versionHash = createHash('sha256')
        .update(bundles.map((b: any) => b.hash).join(''))
        .digest('hex')
        .slice(0, 12);

      try {
        const syncResponse = await wpFetch(`${site.api_url}/sync`, site.api_key, {
          method: 'POST',
          body: JSON.stringify({
            container_id: site.container_id,
            version: versionHash,
            environment: site.environment,
            compiled_at: new Date().toISOString(),
            bundles,
            config: {
              container_id: site.container_id,
              environment: site.environment,
              consent: config.consent || {},
              telemetry: config.telemetry || {},
            },
          }),
        });

        if (!syncResponse.ok) {
          const errorText = await syncResponse.text().catch(() => 'Unknown error');
          throw new Error(`Sync failed (${syncResponse.status}): ${errorText}`);
        }

        const now = new Date().toISOString();
        await updateWordPressSite(id, {
          last_sync: now,
          bundle_version: versionHash,
          status: 'connected',
        });

        return NextResponse.json({
          success: true,
          action: 'sync',
          version: versionHash,
          synced_at: now,
        });
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: `Sync failed: ${error instanceof Error ? error.message : String(error)}`,
        }, { status: 502 });
      }
    }

    if (action === 'purge_cache') {
      // Tell WordPress to purge bundle caches
      try {
        const purgeResponse = await wpFetch(`${site.api_url}/purge-cache`, site.api_key, {
          method: 'POST',
        });

        if (!purgeResponse.ok) {
          const errorText = await purgeResponse.text().catch(() => 'Unknown error');
          throw new Error(`Purge failed (${purgeResponse.status}): ${errorText}`);
        }

        return NextResponse.json({ success: true, action: 'purge_cache' });
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: `Cache purge failed: ${error instanceof Error ? error.message : String(error)}`,
        }, { status: 502 });
      }
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[WordPress Sites API] POST Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
