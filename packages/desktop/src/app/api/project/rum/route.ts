import { NextResponse } from 'next/server';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { loadGlobalConfig, getProjectPath, getDeploymentInfo, saveDeploymentInfo } from '@/lib/project-config';

/**
 * GET /api/project/rum
 * Get current RUM status from deployed worker
 */
export async function GET() {
  try {
    const deployment = await getDeploymentInfo();

    if (!deployment?.workerUrl) {
      return NextResponse.json({
        success: false,
        error: 'No deployment found. Deploy the worker first.',
      }, { status: 400 });
    }

    // Try to get RUM status from worker
    const workerUrl = deployment.workerUrl;
    const telemetryPath = workerUrl.includes('workers.dev') ? '/_ytm/rum/status' : '/ytm/rum/status';

    try {
      const response = await fetch(`${workerUrl}${telemetryPath}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json({
          success: true,
          enabled: data.enabled,
          sampleRate: data.sampleRate,
          workerUrl,
        });
      }
    } catch {
      // Worker might not have the status endpoint, fall back to deployment info
    }

    // Fall back to deployment info
    return NextResponse.json({
      success: true,
      enabled: deployment.rumEnabled ?? false,
      sampleRate: deployment.rumSampleRate ?? 0,
      workerUrl,
    });

  } catch (error) {
    console.error('[RUM API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

/**
 * POST /api/project/rum
 * Toggle RUM on/off by redeploying the worker with updated env var
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { enabled, sampleRate = 0.05 } = body;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json({
        success: false,
        error: 'Missing required field: enabled (boolean)',
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

    // Get current deployment info
    const deployment = await getDeploymentInfo();
    if (!deployment?.workerName) {
      return NextResponse.json({
        success: false,
        error: 'No deployment found. Deploy the worker first using the Build page.',
      }, { status: 400 });
    }

    // Check for custom worker.js
    const workerJsPath = join(projectPath, 'worker.js');
    if (!existsSync(workerJsPath)) {
      return NextResponse.json({
        success: false,
        error: 'No worker.js found in project. RUM requires a custom worker.',
      }, { status: 400 });
    }

    const workerScript = readFileSync(workerJsPath, 'utf-8');

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

    // Calculate the sample rate value
    const rumSampleRate = enabled ? String(sampleRate) : '0';

    // Deploy the worker with RUM_SAMPLE_RATE env var
    const bindings = [
      {
        name: 'RUM_SAMPLE_RATE',
        type: 'plain_text' as const,
        text: rumSampleRate,
      },
    ];

    await client.deployWorker(deployment.workerName, workerScript, {
      bindings,
      compatibilityDate: '2024-01-01',
    });

    // Update deployment info with RUM state
    await saveDeploymentInfo(projectPath, {
      ...deployment,
      rumEnabled: enabled,
      rumSampleRate: enabled ? sampleRate : 0,
      rumUpdatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      enabled,
      sampleRate: enabled ? sampleRate : 0,
      message: enabled
        ? `RUM enabled with ${sampleRate * 100}% sampling rate`
        : 'RUM disabled',
    });

  } catch (error) {
    console.error('[RUM API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
