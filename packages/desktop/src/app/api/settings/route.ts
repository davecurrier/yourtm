import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  loadGlobalConfig,
  saveGlobalConfig,
  getProjectPath,
  getRecentProjects,
  GlobalConfig,
} from '@/lib/project-config';

interface ProjectConfig {
  containerId?: string;
  containerName?: string;
  tagsDir?: string;
  triggersDir?: string;
  zonesDir?: string;
  variablesDir?: string;
  outDir?: string;
}

/**
 * Load project config by reading yourtm.config.ts
 * This is read-only from the desktop app perspective
 */
async function loadProjectConfig(projectPath: string): Promise<ProjectConfig> {
  const configPath = join(projectPath, 'yourtm.config.ts');

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const content = await readFile(configPath, 'utf-8');

    // Simple regex-based extraction (config values are string literals)
    const containerId = content.match(/containerId:\s*['"]([^'"]+)['"]/)?.[1];
    const containerName = content.match(/(?:containerName|name):\s*['"]([^'"]+)['"]/)?.[1];
    const tagsDir = content.match(/tagsDir:\s*['"]([^'"]+)['"]/)?.[1] || 'yourtm/tags';
    const triggersDir = content.match(/triggersDir:\s*['"]([^'"]+)['"]/)?.[1] || 'yourtm/triggers';
    const zonesDir = content.match(/zonesDir:\s*['"]([^'"]+)['"]/)?.[1] || 'yourtm/zones';
    const variablesDir = content.match(/variablesDir:\s*['"]([^'"]+)['"]/)?.[1] || 'yourtm/variables';
    const outDir = content.match(/outDir:\s*['"]([^'"]+)['"]/)?.[1] || 'dist/ytm';

    return {
      containerId,
      containerName,
      tagsDir,
      triggersDir,
      zonesDir,
      variablesDir,
      outDir,
    };
  } catch (error) {
    console.error('Failed to parse project config:', error);
    return {};
  }
}

/**
 * GET /api/settings - Load all settings
 */
export async function GET() {
  try {
    const [globalConfig, projectPath, recentProjects] = await Promise.all([
      loadGlobalConfig(),
      getProjectPath(),
      getRecentProjects(),
    ]);

    const projectConfig = await loadProjectConfig(projectPath);

    return NextResponse.json({
      project: {
        ...projectConfig,
        path: projectPath,
      },
      recentProjects,
      cloudflare: globalConfig.cloudflare || {},
      ai: globalConfig.ai || {},
      defaults: globalConfig.defaults || {
        environment: 'staging',
        minify: true,
        sourcemaps: false,
      },
    });
  } catch (error) {
    console.error('Failed to load settings:', error);
    return NextResponse.json(
      { error: 'Failed to load settings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings - Save settings
 * Only saves global config (cloudflare, ai, defaults)
 * Project config is read-only
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Load existing config to preserve any fields we don't manage
    const existingConfig = await loadGlobalConfig();

    // Merge new values
    const newConfig: GlobalConfig = {
      ...existingConfig,
      cloudflare: {
        ...existingConfig.cloudflare,
        ...body.cloudflare,
      },
      ai: {
        ...existingConfig.ai,
        ...body.ai,
      },
      defaults: {
        ...existingConfig.defaults,
        ...body.defaults,
      },
    };

    // Remove empty values
    if (newConfig.cloudflare) {
      Object.keys(newConfig.cloudflare).forEach(key => {
        if (!newConfig.cloudflare![key as keyof typeof newConfig.cloudflare]) {
          delete newConfig.cloudflare![key as keyof typeof newConfig.cloudflare];
        }
      });
    }
    if (newConfig.ai) {
      Object.keys(newConfig.ai).forEach(key => {
        if (!newConfig.ai![key as keyof typeof newConfig.ai]) {
          delete newConfig.ai![key as keyof typeof newConfig.ai];
        }
      });
    }

    await saveGlobalConfig(newConfig);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}
