import { NextResponse } from 'next/server';

/**
 * GET /api/project/deploy/versions
 * List all available versions
 *
 * In the prototype, this returns mock data.
 * In production, this would call versionsCommand from @yourtm/cli.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const environment = searchParams.get('env');

    // Simulate loading delay
    await new Promise(resolve => setTimeout(resolve, 300));

    // For the prototype, we return mock version data
    // In production, this would:
    // 1. Load config from project path
    // 2. Get credentials from environment
    // 3. Call versionsCommand to get real version history from Cloudflare KV

    const mockVersions = [
      {
        id: 'v4',
        message: 'Add TikTok pixel tracking',
        author: 'david@yourtm.io',
        timestamp: new Date(Date.now() - 1800000).toISOString(), // 30 min ago
        isStaging: false,
        isProduction: false,
      },
      {
        id: 'v3',
        message: 'Update GA4 config for enhanced ecommerce',
        author: 'sarah@yourtm.io',
        timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        isStaging: true,
        isProduction: false,
      },
      {
        id: 'v2',
        message: 'Fix Meta pixel deduplication',
        author: 'david@yourtm.io',
        timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        isStaging: false,
        isProduction: true,
      },
      {
        id: 'v1',
        message: 'Initial release with GA4 and Meta',
        author: 'david@yourtm.io',
        timestamp: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        isStaging: false,
        isProduction: false,
      },
    ];

    // Filter by environment if specified
    let filteredVersions = mockVersions;
    if (environment === 'staging') {
      filteredVersions = mockVersions.filter(v => v.isStaging);
    } else if (environment === 'production') {
      filteredVersions = mockVersions.filter(v => v.isProduction);
    }

    // Apply limit
    const limitedVersions = filteredVersions.slice(0, limit);

    return NextResponse.json({
      versions: limitedVersions,
      total: mockVersions.length,
      hasMore: mockVersions.length > limit,
    });

  } catch (error) {
    console.error('[Deploy Versions API] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
