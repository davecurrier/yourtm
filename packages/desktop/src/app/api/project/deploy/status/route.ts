import { NextResponse } from 'next/server';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { loadGlobalConfig, getProjectPath } from '@/lib/project-config';

/**
 * GET /api/project/deploy/status
 * Get current deployment status for all environments from Cloudflare KV
 */
export async function GET() {
  try {
    const globalConfig = await loadGlobalConfig();
    const projectPath = await getProjectPath();

    // Check for Cloudflare credentials
    if (!globalConfig.cloudflare?.apiToken || !globalConfig.cloudflare?.accountId) {
      return NextResponse.json({
        containerId: 'Not configured',
        branch: 'main',
        localVersion: '-',
        latestPushed: '-',
        environments: {},
        error: 'Cloudflare credentials not configured',
      });
    }

    // Get container ID from project config
    const configPath = join(projectPath, 'yourtm.config.ts');
    if (!existsSync(configPath)) {
      return NextResponse.json({
        containerId: 'No project',
        branch: 'main',
        localVersion: '-',
        latestPushed: '-',
        environments: {},
        error: 'No project linked',
      });
    }

    const configContent = readFileSync(configPath, 'utf-8');
    const containerIdMatch = configContent.match(/containerId:\s*['"]([^'"]+)['"]/);
    const containerId = containerIdMatch?.[1] || 'Unknown';

    try {
      // Dynamically import CLI modules
      const { CloudflareClient } = await import('@yourtm/cli');

      const client = new CloudflareClient({
        apiToken: globalConfig.cloudflare.apiToken,
        accountId: globalConfig.cloudflare.accountId,
      });

      // Find KV namespace
      const namespaces = await client.listKVNamespaces();
      const kvNamespace = namespaces.find((ns: { title: string }) => ns.title === `yourtm-${containerId}`);

      if (!kvNamespace) {
        return NextResponse.json({
          containerId,
          branch: 'main',
          localVersion: '-',
          latestPushed: '-',
          environments: {},
        });
      }

      // Get environment status from KV
      const statusKey = `deploy:${containerId}:environments`;
      let environments: Record<string, { version: string; deployedAt: string }> = {};

      try {
        const statusJson = await client.getKVValue(kvNamespace.id, statusKey);
        if (statusJson) {
          environments = JSON.parse(statusJson);
        }
      } catch {
        // No status stored yet
      }

      // Get worker URL
      let workerUrl: string | undefined;
      const workerName = `ytm-${containerId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      try {
        const subdomain = await client.getWorkerSubdomain();
        if (subdomain?.subdomain) {
          workerUrl = `https://${workerName}.${subdomain.subdomain}.workers.dev`;
        }
      } catch {
        // Subdomain not available
      }

      return NextResponse.json({
        containerId,
        branch: 'main',
        localVersion: environments.production?.version || environments.staging?.version || '-',
        latestPushed: environments.production?.version || environments.staging?.version || '-',
        workerUrl,
        environments,
      });

    } catch (importError) {
      // CLI not built or import error - return basic info
      console.error('[Deploy Status API] Import error:', importError);
      return NextResponse.json({
        containerId,
        branch: 'main',
        localVersion: '-',
        latestPushed: '-',
        environments: {},
        error: 'Could not load CLI modules. Run "npm run build" in the CLI package.',
      });
    }

  } catch (error) {
    console.error('[Deploy Status API] Error:', error);
    return NextResponse.json({
      containerId: 'Error',
      branch: 'main',
      localVersion: '-',
      latestPushed: '-',
      environments: {},
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
