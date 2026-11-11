import { NextResponse } from 'next/server';
import {
  setProjectPath,
  getProjectPath,
  getRecentProjects,
  isValidProject,
  clearConfigCache,
} from '@/lib/project-config';

/**
 * GET /api/settings/project - Get current project info
 */
export async function GET() {
  try {
    const [currentPath, recentProjects] = await Promise.all([
      getProjectPath(),
      getRecentProjects(),
    ]);

    return NextResponse.json({
      currentPath,
      isValid: isValidProject(currentPath),
      recentProjects: recentProjects.map(p => ({
        path: p,
        name: p.split('/').pop() || p,
        isValid: isValidProject(p),
      })),
    });
  } catch (error) {
    console.error('Failed to get project info:', error);
    return NextResponse.json(
      { error: 'Failed to get project info' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/project - Switch to a different project
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { path: projectPath } = body;

    if (!projectPath) {
      return NextResponse.json(
        { error: 'Project path is required' },
        { status: 400 }
      );
    }

    // Validate the project path
    if (!isValidProject(projectPath)) {
      return NextResponse.json(
        { error: 'Invalid project: yourtm.config.ts not found' },
        { status: 400 }
      );
    }

    // Set the new project path
    await setProjectPath(projectPath);

    // Clear the config cache to force reload
    clearConfigCache();

    return NextResponse.json({
      success: true,
      currentPath: projectPath,
    });
  } catch (error) {
    console.error('Failed to switch project:', error);
    return NextResponse.json(
      { error: 'Failed to switch project' },
      { status: 500 }
    );
  }
}
