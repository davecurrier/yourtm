import { NextResponse } from 'next/server';

/**
 * POST /api/project/deploy/rollback
 * Rollback to a previous version
 *
 * In the prototype, this simulates a rollback.
 * In production, this would call deployCommand with the --version flag from @yourtm/cli.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { version, environment = 'production' } = body;

    if (!version) {
      return NextResponse.json({
        success: false,
        error: 'Version is required for rollback.',
      }, { status: 400 });
    }

    if (!['staging', 'production'].includes(environment)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid environment. Must be "staging" or "production".',
      }, { status: 400 });
    }

    // Simulate rollback delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // For the prototype, we simulate a successful rollback
    // In production, this would:
    // 1. Load config from project path
    // 2. Get credentials from environment
    // 3. Call deployCommand with --version flag to deploy the specified version

    // Mock version validation
    const validVersions = ['v1', 'v2', 'v3', 'v4'];
    if (!validVersions.includes(version)) {
      return NextResponse.json({
        success: false,
        error: `Version ${version} not found.`,
      }, { status: 404 });
    }

    const deployedAt = new Date().toISOString();

    return NextResponse.json({
      success: true,
      environment,
      version,
      deployedAt,
      message: `Successfully rolled back ${environment} to ${version}`,
    });

  } catch (error) {
    console.error('[Deploy Rollback API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
