import { NextResponse } from 'next/server';
import { getDeploymentInfo } from '@/lib/project-config';

/**
 * GET /api/project/deployment
 * Get deployment info for the current project
 */
export async function GET() {
  try {
    const deployment = await getDeploymentInfo();

    if (!deployment) {
      return NextResponse.json({
        deployed: false,
        message: 'No deployment found for current project',
      });
    }

    return NextResponse.json({
      deployed: true,
      ...deployment,
    });
  } catch (error) {
    console.error('[Deployment API] Error:', error);
    return NextResponse.json({
      deployed: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
