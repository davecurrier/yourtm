import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { logger } from './logger.js';

export interface YourTMConfig {
  // Container identification
  containerId: string;
  containerName?: string;

  // Source paths
  tagsDir: string;
  triggersDir: string;
  zonesDir: string;
  variablesDir?: string;

  // Output configuration
  outDir: string;

  // Build options
  minify?: boolean;
  sourcemap?: boolean;

  // Environment
  environment?: 'development' | 'staging' | 'production';

  // Server options for dev mode
  devServer?: {
    port?: number;
    host?: string;
  };

  // API configuration
  api?: {
    endpoint?: string;
    apiKey?: string;
  };
}

const CONFIG_FILES = [
  'yourtm.config.ts',
  'yourtm.config.js',
  'yourtm.config.mjs',
];

export async function findConfigFile(cwd: string = process.cwd()): Promise<string | null> {
  for (const filename of CONFIG_FILES) {
    const filepath = resolve(cwd, filename);
    if (existsSync(filepath)) {
      return filepath;
    }
  }
  return null;
}

export async function loadConfig(cwd: string = process.cwd()): Promise<YourTMConfig> {
  const configPath = await findConfigFile(cwd);

  if (!configPath) {
    throw new Error(
      `Could not find yourtm.config.ts in ${cwd}. Run 'ytm init' to create one.`
    );
  }

  logger.debug(`Loading config from ${configPath}`);

  // For TypeScript files, we need to compile them first
  if (configPath.endsWith('.ts')) {
    return await loadTypeScriptConfig(configPath, cwd);
  }

  // For JS/MJS files, import directly
  const configUrl = pathToFileURL(configPath).href;
  const module = await import(configUrl);
  return validateConfig(module.default || module, cwd);
}

async function loadTypeScriptConfig(
  configPath: string,
  cwd: string
): Promise<YourTMConfig> {
  // Use esbuild to compile TypeScript config
  const result = await esbuild.build({
    entryPoints: [configPath],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    target: 'node18',
  });

  const code = result.outputFiles[0].text;

  // Write to a temp file and import it
  const tempPath = join(dirname(configPath), '.yourtm.config.mjs');
  const { writeFile, unlink } = await import('node:fs/promises');

  try {
    await writeFile(tempPath, code);
    const configUrl = pathToFileURL(tempPath).href + `?t=${Date.now()}`;
    const module = await import(configUrl);
    return validateConfig(module.default || module, cwd);
  } finally {
    // Clean up temp file
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

function validateConfig(config: unknown, cwd: string): YourTMConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Config must export an object');
  }

  const c = config as Record<string, unknown>;

  // Required fields
  if (!c.containerId || typeof c.containerId !== 'string') {
    throw new Error('Config must include a containerId string');
  }

  // Apply defaults and resolve paths
  const resolved: YourTMConfig = {
    containerId: c.containerId,
    containerName: c.containerName as string | undefined,
    tagsDir: resolvePath(cwd, (c.tagsDir as string) || 'yourtm/tags'),
    triggersDir: resolvePath(cwd, (c.triggersDir as string) || 'yourtm/triggers'),
    zonesDir: resolvePath(cwd, (c.zonesDir as string) || 'yourtm/zones'),
    variablesDir: c.variablesDir
      ? resolvePath(cwd, c.variablesDir as string)
      : undefined,
    outDir: resolvePath(cwd, (c.outDir as string) || 'dist/ytm'),
    minify: c.minify !== false,
    sourcemap: c.sourcemap === true,
    environment: (c.environment as YourTMConfig['environment']) || 'development',
    devServer: {
      port: (c.devServer as Record<string, unknown>)?.port as number || 3456,
      host: (c.devServer as Record<string, unknown>)?.host as string || 'localhost',
    },
    api: c.api as YourTMConfig['api'],
  };

  return resolved;
}

function resolvePath(cwd: string, p: string): string {
  if (p.startsWith('/')) {
    return p;
  }
  return resolve(cwd, p);
}

export async function getConfigPath(cwd: string = process.cwd()): Promise<string | null> {
  return findConfigFile(cwd);
}

export function defineConfig(config: Partial<YourTMConfig> & { containerId: string }): YourTMConfig {
  return {
    tagsDir: 'yourtm/tags',
    triggersDir: 'yourtm/triggers',
    zonesDir: 'yourtm/zones',
    outDir: 'dist/ytm',
    minify: true,
    sourcemap: false,
    environment: 'development',
    ...config,
  };
}
