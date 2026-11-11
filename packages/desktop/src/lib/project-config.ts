import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import path from 'path';

// Global config paths (same as CLI)
const YOURTM_HOME = join(homedir(), '.yourtm');
const CONFIG_PATH = join(YOURTM_HOME, 'config.json');

interface DeploymentInfo {
  workerUrl?: string;
  workerName?: string;
  environment?: 'staging' | 'production';
  deployedAt?: string;
  version?: string;
  mode?: 'custom' | 'template';
  // RUM (Real User Monitoring) settings
  rumEnabled?: boolean;
  rumSampleRate?: number;
  rumUpdatedAt?: string;
}

interface WordPressSite {
  id: string;
  name: string;
  url: string;
  api_url: string;
  api_key: string;
  container_id: string;
  environment: string;
  last_sync: string;
  bundle_version: string;
  status: 'connected' | 'disconnected' | 'error';
  wordpress_version: string;
  php_version: string;
  woocommerce: boolean;
  post_types: Array<{ name: string; label: string; count: number }>;
  suggested_zones: Array<{ name: string; patterns: string[] }>;
}

interface GlobalConfig {
  currentProject?: string;
  recentProjects?: string[];
  cloudflare?: {
    accountId?: string;
    apiToken?: string;
    zoneId?: string;
  };
  ai?: {
    provider?: 'anthropic' | 'openai';
    anthropicApiKey?: string;
    openaiApiKey?: string;
  };
  defaults?: {
    environment?: 'staging' | 'production';
    minify?: boolean;
    sourcemaps?: boolean;
  };
  // Deployment info per project (keyed by project path)
  deployments?: Record<string, DeploymentInfo>;
  // WordPress integration
  wordpress?: {
    sites?: WordPressSite[];
  };
}

let cachedConfig: GlobalConfig | null = null;
let configLoadTime = 0;
const CACHE_TTL = 5000; // 5 seconds

// Mutex for serializing config file read-modify-write operations
let configLock = Promise.resolve();

function withConfigLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = configLock.then(fn);
  configLock = result.then(() => {}, () => {}); // swallow errors for the chain
  return result;
}

/**
 * Load global config from ~/.yourtm/config.json
 */
export async function loadGlobalConfig(): Promise<GlobalConfig> {
  const now = Date.now();
  if (cachedConfig && (now - configLoadTime) < CACHE_TTL) {
    return cachedConfig;
  }

  try {
    if (!existsSync(CONFIG_PATH)) {
      cachedConfig = {};
      configLoadTime = now;
      return {};
    }
    const content = await readFile(CONFIG_PATH, 'utf-8');
    cachedConfig = JSON.parse(content);
    configLoadTime = now;
    return cachedConfig!;
  } catch {
    cachedConfig = {};
    configLoadTime = now;
    return {};
  }
}

/**
 * Save global config to ~/.yourtm/config.json
 */
export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  await mkdir(YOURTM_HOME, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
  cachedConfig = config;
  configLoadTime = Date.now();
}

/**
 * Get the current project path from config, or fall back to default
 */
export async function getProjectPath(): Promise<string> {
  const config = await loadGlobalConfig();

  if (config.currentProject && existsSync(config.currentProject)) {
    return config.currentProject;
  }

  // Fall back to template directory relative to cwd
  const fallback = path.resolve(process.cwd(), '../../template');
  if (existsSync(fallback)) {
    return fallback;
  }

  // If no fallback exists, still return the configured path or a reasonable default
  return config.currentProject || fallback;
}

/**
 * Set the current project path
 */
export async function setProjectPath(projectPath: string): Promise<void> {
  const config = await loadGlobalConfig();

  // Normalize the path
  const normalizedPath = path.resolve(projectPath);

  // Update current project
  config.currentProject = normalizedPath;

  // Update recent projects list (keep last 10)
  const recent = config.recentProjects || [];
  const filtered = recent.filter(p => p !== normalizedPath);
  config.recentProjects = [normalizedPath, ...filtered].slice(0, 10);

  await saveGlobalConfig(config);
}

/**
 * Get recent projects list
 */
export async function getRecentProjects(): Promise<string[]> {
  const config = await loadGlobalConfig();
  return (config.recentProjects || []).filter(p => existsSync(p));
}

/**
 * Check if a path is a valid YourTM project
 */
export function isValidProject(projectPath: string): boolean {
  const configPath = join(projectPath, 'yourtm.config.ts');
  return existsSync(configPath);
}

/**
 * Clear the config cache (useful after updates)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  configLoadTime = 0;
}

/**
 * Save deployment info for a project
 */
export async function saveDeploymentInfo(projectPath: string, info: DeploymentInfo): Promise<void> {
  const config = await loadGlobalConfig();
  const normalizedPath = path.resolve(projectPath);

  config.deployments = config.deployments || {};
  config.deployments[normalizedPath] = {
    ...config.deployments[normalizedPath],
    ...info,
  };

  await saveGlobalConfig(config);
}

/**
 * Get deployment info for the current project
 */
export async function getDeploymentInfo(): Promise<DeploymentInfo | null> {
  const config = await loadGlobalConfig();
  const projectPath = await getProjectPath();
  const normalizedPath = path.resolve(projectPath);

  return config.deployments?.[normalizedPath] || null;
}

/**
 * Get all registered WordPress sites
 */
export async function getWordPressSites(): Promise<WordPressSite[]> {
  const config = await loadGlobalConfig();
  return config.wordpress?.sites || [];
}

/**
 * Get a single WordPress site by ID
 */
export async function getWordPressSite(id: string): Promise<WordPressSite | undefined> {
  const sites = await getWordPressSites();
  return sites.find(s => s.id === id);
}

/**
 * Add a new WordPress site registration
 */
export function addWordPressSite(site: WordPressSite): Promise<void> {
  return withConfigLock(async () => {
    const config = await loadGlobalConfig();
    if (!config.wordpress) config.wordpress = {};
    if (!config.wordpress.sites) config.wordpress.sites = [];
    config.wordpress.sites.push(site);
    await saveGlobalConfig(config);
  });
}

/**
 * Update an existing WordPress site registration
 */
export function updateWordPressSite(id: string, updates: Partial<WordPressSite>): Promise<void> {
  return withConfigLock(async () => {
    const config = await loadGlobalConfig();
    const sites = config.wordpress?.sites || [];
    const index = sites.findIndex(s => s.id === id);
    if (index === -1) throw new Error(`WordPress site not found: ${id}`);
    sites[index] = { ...sites[index], ...updates };
    config.wordpress = { ...config.wordpress, sites };
    await saveGlobalConfig(config);
  });
}

/**
 * Remove a WordPress site registration
 */
export function removeWordPressSite(id: string): Promise<void> {
  return withConfigLock(async () => {
    const config = await loadGlobalConfig();
    const sites = config.wordpress?.sites || [];
    config.wordpress = { ...config.wordpress, sites: sites.filter(s => s.id !== id) };
    await saveGlobalConfig(config);
  });
}

export { YOURTM_HOME, CONFIG_PATH };
export type { GlobalConfig, DeploymentInfo, WordPressSite };
