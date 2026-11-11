import { NextResponse } from 'next/server';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { loadGlobalConfig, getProjectPath, saveDeploymentInfo } from '@/lib/project-config';

/**
 * POST /api/project/deploy
 * Deploy to staging or production environment
 *
 * Supports two modes:
 * 1. Custom worker.js - If project has worker.js, deploy that directly
 * 2. Template mode - Generate worker from template (requires KV)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { environment } = body;

    if (!environment || !['staging', 'production'].includes(environment)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid environment. Must be "staging" or "production".',
      }, { status: 400 });
    }

    // Load global config for Cloudflare credentials
    const globalConfig = await loadGlobalConfig();
    const projectPath = await getProjectPath();

    // Check for Cloudflare credentials
    if (!globalConfig.cloudflare?.apiToken || !globalConfig.cloudflare?.accountId) {
      return NextResponse.json({
        success: false,
        error: 'Cloudflare credentials not configured. Go to Settings to add your Account ID and API Token.',
      }, { status: 400 });
    }

    // Check for valid project
    const configPath = join(projectPath, 'yourtm.config.ts');
    if (!existsSync(configPath)) {
      return NextResponse.json({
        success: false,
        error: 'No YourTM project found. Link a project in Settings first.',
      }, { status: 400 });
    }

    // Parse container ID from config
    const configContent = readFileSync(configPath, 'utf-8');
    const containerIdMatch = configContent.match(/containerId:\s*['"]([^'"]+)['"]/);
    const containerId = containerIdMatch?.[1];

    if (!containerId) {
      return NextResponse.json({
        success: false,
        error: 'Could not find containerId in yourtm.config.ts',
      }, { status: 400 });
    }

    // Dynamically import CLI modules
    const { CloudflareClient } = await import('@yourtm/cli');

    // Create Cloudflare client
    const client = new CloudflareClient({
      apiToken: globalConfig.cloudflare.apiToken,
      accountId: globalConfig.cloudflare.accountId,
    });

    // Verify credentials
    const tokenValid = await client.verifyToken();
    if (!tokenValid) {
      return NextResponse.json({
        success: false,
        error: 'Invalid Cloudflare API token. Check your credentials in Settings.',
      }, { status: 401 });
    }

    // Check if project has a custom worker.js
    const workerJsPath = join(projectPath, 'worker.js');
    const wranglerTomlPath = join(projectPath, 'wrangler.toml');
    const hasCustomWorker = existsSync(workerJsPath);

    let workerName: string;
    let workerScript: string;
    let bindings: Array<{ name: string; type: string; namespace_id?: string; class_name?: string; text?: string }> = [];
    // Durable Object migration sent with the deploy. The template path always
    // declares RUMDurableObject; a custom worker declares whatever *its* script
    // actually exports, read from wrangler.toml. Declaring a class the script
    // doesn't export fails with Cloudflare error 10079.
    let migrations: { new_tag: string; new_classes: string[] } | undefined;
    let routePatterns: string[] = [];
    let zoneName: string | undefined;

    if (hasCustomWorker) {
      // === CUSTOM WORKER MODE ===
      // Deploy the user's existing worker.js file
      workerScript = readFileSync(workerJsPath, 'utf-8');

      const fallbackName = `ytm-${containerId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

      if (existsSync(wranglerTomlPath)) {
        const wranglerContent = readFileSync(wranglerTomlPath, 'utf-8');
        workerName = wranglerContent.match(/^name\s*=\s*"([^"]+)"/m)?.[1] || fallbackName;

        // Durable Object bindings: { name = "TELEMETRY", class_name = "TelemetryStore" }
        const doBindings = [...wranglerContent.matchAll(
          /\{\s*name\s*=\s*"([^"]+)"\s*,\s*class_name\s*=\s*"([^"]+)"\s*\}/g
        )].map(m => ({
          name: m[1],
          type: 'durable_object_namespace',
          class_name: m[2],
        }));
        // [vars] become plain_text bindings. The metadata `bindings` array
        // replaces ALL bindings on the script, so anything omitted here is
        // silently removed from the deployed worker.
        const varsSection = wranglerContent.match(/^\[vars\]\s*$([\s\S]*?)(?=^\[|\Z)/m)?.[1] ?? '';
        const varBindings = [...varsSection.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]*)"/gm)]
          .map(m => ({ name: m[1], type: 'plain_text', text: m[2] }));

        bindings = [...doBindings, ...varBindings];

        // Route patterns from [[routes]]. Uploading a script does NOT bind any
        // route — that's a separate zone-scoped API — so a worker deployed
        // without this step is simply unreachable on the domain.
        routePatterns = [...wranglerContent.matchAll(/^\s*pattern\s*=\s*"([^"]+)"/gm)].map(m => m[1]);
        zoneName = wranglerContent.match(/^\s*zone_name\s*=\s*"([^"]+)"/m)?.[1];

        // Migration tag + classes from [[migrations]]
        const migrationClasses = wranglerContent
          .match(/new_classes\s*=\s*\[([^\]]*)\]/)?.[1]
          ?.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) ?? [];
        const migrationTag = wranglerContent.match(/^\s*tag\s*=\s*"([^"]+)"/m)?.[1];

        if (migrationClasses.length > 0) {
          migrations = { new_tag: migrationTag || 'v1', new_classes: migrationClasses };
        }
      } else {
        workerName = fallbackName;
      }
    } else {
      // === TEMPLATE MODE ===
      // Generate worker from template (requires KV)
      const { generateWorkerScript, Compiler, loadConfig } = await import('@yourtm/cli');

      // Find or create KV namespace
      const namespaces = await client.listKVNamespaces();
      let kvNamespace = namespaces.find((ns: { title: string }) => ns.title === `yourtm-${containerId}`);

      if (!kvNamespace) {
        kvNamespace = await client.createKVNamespace(`yourtm-${containerId}`);
      }

      const kvNamespaceId = kvNamespace.id;

      // Compile the project
      const config = await loadConfig(projectPath);
      const compiler = new Compiler(config);
      const compileResult = await compiler.compile();

      if (compileResult.errors.length > 0) {
        return NextResponse.json({
          success: false,
          error: `Build failed: ${compileResult.errors.map((e: { message: string }) => e.message).join(', ')}`,
        }, { status: 400 });
      }

      // Generate version ID
      const version = `v${Date.now().toString(36).toUpperCase()}`;

      // Upload bundles to KV
      for (const bundle of compileResult.bundles) {
        const key = `bundles/${version}/${bundle.name}.js`;
        await client.putKVValue(kvNamespaceId, key, bundle.code);

        const latestKey = `bundles/${environment}/${bundle.name}.js`;
        await client.putKVValue(kvNamespaceId, latestKey, bundle.code);
      }

      workerName = `ytm-${containerId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      workerScript = generateWorkerScript({ containerId, includeRUM: true });
      bindings = [
        { name: 'YTM_KV', type: 'kv_namespace', namespace_id: kvNamespaceId },
        { name: 'RUM_DO', type: 'durable_object_namespace', class_name: 'RUMDurableObject' }
      ];
      migrations = { new_tag: 'v1', new_classes: ['RUMDurableObject'] };
    }

    // Deploy the worker using modules format (required for Durable Objects)
    /*
     * Durable Object migrations are a one-time, first-creation step. Once the
     * script carries a migration tag, re-sending `new_tag` asserts a previous
     * tag of '' and Cloudflare rejects it:
     *
     *   [10079] Actor migration tag precondition failed, got tag '' when
     *           expected tag is 'v1'
     *
     * Redeploys of an existing script must therefore omit `migrations`
     * entirely. Try with, fall back to without — that covers both first deploy
     * and every deploy after it without needing a separate existence check.
     */
    try {
      await client.deployWorker(workerName, workerScript, {
        bindings,
        compatibilityDate: '2024-01-01',
        migrations,
      });
    } catch (err) {
      const message = String(err);
      const isMigrationPrecondition =
        message.includes('10079') || message.includes('migration tag precondition');

      if (!migrations || !isMigrationPrecondition) throw err;

      // Classes already exist on this script — redeploy code only.
      await client.deployWorker(workerName, workerScript, {
        bindings,
        compatibilityDate: '2024-01-01',
      });
    }

    // Bind the routes declared in wrangler.toml. Reported rather than fatal:
    // the script is already live, and zone-scoped route access needs a
    // user-owned token, which not every setup will have.
    let routes: Array<{ pattern: string; status: string; error?: string }> = [];
    if (routePatterns.length > 0) {
      const zone = zoneName
        ?? routePatterns[0].split('/')[0].split('.').slice(-2).join('.');
      try {
        routes = await client.syncWorkerRoutes(zone, routePatterns, workerName);
      } catch (error) {
        routes = routePatterns.map(pattern => ({
          pattern, status: 'failed', error: String(error),
        }));
      }
    }

    // Get worker URL
    let workerUrl: string | undefined;
    try {
      const subdomain = await client.getWorkerSubdomain();
      if (subdomain?.subdomain) {
        workerUrl = `https://${workerName}.${subdomain.subdomain}.workers.dev`;
      }
    } catch {
      // Subdomain may not be enabled
    }

    // Also check for custom domain from wrangler.toml
    if (existsSync(wranglerTomlPath)) {
      const wranglerContent = readFileSync(wranglerTomlPath, 'utf-8');
      // Look for route patterns and extract just the domain
      const routeMatches = wranglerContent.matchAll(/pattern\s*=\s*"([^"]+)"/g);
      for (const match of routeMatches) {
        const pattern = match[1];
        // Extract domain (everything before the first /)
        const domainMatch = pattern.match(/^([^/]+)/);
        if (domainMatch && !domainMatch[1].includes('*')) {
          workerUrl = `https://${domainMatch[1]}`;
          break; // Use the first valid domain
        }
      }
    }

    const version = `v${Date.now().toString(36).toUpperCase()}`;
    const deployedAt = new Date().toISOString();

    // Save deployment info for Preview Mode and future reference
    await saveDeploymentInfo(projectPath, {
      workerUrl,
      workerName,
      environment,
      deployedAt,
      version,
      mode: hasCustomWorker ? 'custom' : 'template',
    });

    return NextResponse.json({
      success: true,
      environment,
      version,
      deployedAt,
      workerUrl,
      workerName,
      mode: hasCustomWorker ? 'custom' : 'template',
      routes,
      message: `Successfully deployed ${workerName} to ${environment}`,
    });

  } catch (error) {
    console.error('[Deploy API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
