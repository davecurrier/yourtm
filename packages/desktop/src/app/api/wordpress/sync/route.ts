import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { gzipSync } from 'node:zlib';
import { loadConfig, Compiler } from '@yourtm/cli';
import {
  getWordPressSites,
  getWordPressSite,
  getProjectPath,
  updateWordPressSite,
} from '@/lib/project-config';
import { timingSafeCompare } from '@/lib/timing-safe';

// Compilation cache to avoid recompiling when source hasn't changed
let compilationCache: { result: any; timestamp: number; hash: string } | null = null;
const CACHE_MAX_AGE_MS = 30_000; // 30 seconds

async function getCachedCompilation(projectPath: string) {
  const config = await loadConfig(projectPath);
  const compiler = new Compiler(config);

  // Use timestamp as a simple change indicator
  const now = Date.now();
  const cacheHash = `${projectPath}:${now - (now % CACHE_MAX_AGE_MS)}`;

  if (compilationCache && compilationCache.hash === cacheHash) {
    return { result: compilationCache.result, config };
  }

  const result = await compiler.compile();
  compilationCache = { result, timestamp: now, hash: cacheHash };
  return { result, config };
}

/**
 * GET /api/wordpress/sync - Serve current compiled bundles (called BY the WordPress plugin)
 *
 * Headers: X-YourTM-Key, X-YourTM-Container
 * Query: ?container_id=YTM-ABC123&environment=production
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const containerId = searchParams.get('container_id') || request.headers.get('X-YourTM-Container');
    const environment = searchParams.get('environment') || 'production';
    const apiKey = request.headers.get('X-YourTM-Key');

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing X-YourTM-Key header' },
        { status: 401 }
      );
    }

    if (!containerId) {
      return NextResponse.json(
        { error: 'container_id query parameter or X-YourTM-Container header is required' },
        { status: 400 }
      );
    }

    // Validate API key against registered sites (timing-safe comparison)
    const sites = await getWordPressSites();
    const matchingSite = sites.find(s => timingSafeCompare(s.api_key, apiKey) && s.container_id === containerId);

    if (!matchingSite) {
      return NextResponse.json(
        { error: 'Invalid API key or container ID' },
        { status: 403 }
      );
    }

    // Compile the current project (with caching)
    const projectPath = await getProjectPath();
    const { result, config } = await getCachedCompilation(projectPath);

    if (result.errors.length > 0) {
      return NextResponse.json(
        { error: 'Compilation failed', errors: result.errors.map((e: any) => e.message) },
        { status: 500 }
      );
    }

    // Build bundle response
    const bundles = result.bundles.map((bundle: any) => {
      const code = bundle.code || '';
      const hash = createHash('sha256').update(code).digest('hex');
      const size = Buffer.byteLength(code, 'utf-8');
      return {
        name: bundle.name,
        code,
        hash,
        size,
        gzip_size: gzipSync(Buffer.from(code)).length,
      };
    });

    // Compute overall version hash from all bundle hashes
    const versionHash = createHash('sha256')
      .update(bundles.map((b: any) => b.hash).join(''))
      .digest('hex')
      .slice(0, 12);

    const response = NextResponse.json({
      container_id: containerId,
      version: versionHash,
      environment,
      compiled_at: new Date().toISOString(),
      bundles,
      config: {
        container_id: containerId,
        environment,
        consent: config.consent || {},
        telemetry: config.telemetry || {},
      },
    });
    response.headers.set('Cache-Control', 'max-age=30');
    return response;
  } catch (error) {
    console.error('[WordPress Sync API] GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/wordpress/sync - Push bundle to a WordPress site (triggered from desktop app UI)
 *
 * Body: { site_id: string, environment?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { site_id, environment } = body;

    if (!site_id) {
      return NextResponse.json(
        { error: 'site_id is required' },
        { status: 400 }
      );
    }

    // Find the site
    const site = await getWordPressSite(site_id);
    if (!site) {
      return NextResponse.json(
        { error: `WordPress site not found: ${site_id}` },
        { status: 404 }
      );
    }

    const targetEnvironment = environment || site.environment || 'staging';

    // Compile current project (with caching)
    const projectPath = await getProjectPath();
    const { result, config } = await getCachedCompilation(projectPath);

    if (result.errors.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Compilation failed: ${result.errors.map((e: any) => e.message).join(', ')}`,
      }, { status: 400 });
    }

    // Build bundle payload
    const bundles = result.bundles.map((bundle: any) => {
      const code = bundle.code || '';
      const hash = createHash('sha256').update(code).digest('hex');
      const size = Buffer.byteLength(code, 'utf-8');
      return {
        name: bundle.name,
        code,
        hash,
        size,
        gzip_size: gzipSync(Buffer.from(code)).length,
      };
    });

    const versionHash = createHash('sha256')
      .update(bundles.map((b: any) => b.hash).join(''))
      .digest('hex')
      .slice(0, 12);

    // Push to WordPress site
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let syncResponse: Response;
    try {
      syncResponse = await fetch(`${site.api_url}/sync`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-YourTM-Key': site.api_key,
        },
        body: JSON.stringify({
          container_id: site.container_id,
          version: versionHash,
          environment: targetEnvironment,
          compiled_at: new Date().toISOString(),
          bundles,
          config: {
            container_id: site.container_id,
            environment: targetEnvironment,
            consent: config.consent || {},
            telemetry: config.telemetry || {},
          },
        }),
      });
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: `Could not connect to WordPress site: ${error instanceof Error ? error.message : String(error)}`,
      }, { status: 502 });
    } finally {
      clearTimeout(timeout);
    }

    if (!syncResponse.ok) {
      const errorText = await syncResponse.text().catch(() => 'Unknown error');
      return NextResponse.json({
        success: false,
        error: `WordPress sync failed (${syncResponse.status}): ${errorText}`,
      }, { status: syncResponse.status });
    }

    // Update site record
    const now = new Date().toISOString();
    await updateWordPressSite(site_id, {
      last_sync: now,
      bundle_version: versionHash,
      status: 'connected',
    });

    return NextResponse.json({
      success: true,
      site_id,
      version: versionHash,
      environment: targetEnvironment,
      synced_at: now,
      bundles_count: bundles.length,
      total_size: bundles.reduce((sum: number, b: any) => sum + b.size, 0),
    });
  } catch (error) {
    console.error('[WordPress Sync API] POST Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
