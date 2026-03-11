/**
 * Global Configuration Manager
 *
 * Manages ~/.ytmrc configuration file for credentials and settings.
 * This eliminates the need for repeated prompts.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.yourtm');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface GlobalConfig {
  // Cloudflare
  cloudflare?: {
    accountId?: string;
    apiToken?: string;
  };

  // AI Providers
  ai?: {
    provider?: 'anthropic' | 'openai';
    anthropicApiKey?: string;
    openaiApiKey?: string;
  };

  // Default settings
  defaults?: {
    environment?: 'staging' | 'production';
    minify?: boolean;
    sourcemaps?: boolean;
  };

  // Proxy settings for first-party serving
  proxy?: {
    enabled?: boolean;
    vendors?: string[]; // Which vendors to proxy: ['ga4', 'linkedin', 'meta', 'msads']
  };
}

/**
 * Load global configuration
 */
export async function loadGlobalConfig(): Promise<GlobalConfig> {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return {};
    }
    const content = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Save global configuration
 */
export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

/**
 * Get a specific config value with environment variable fallback
 */
export async function getConfigValue<T>(
  path: string,
  envVar?: string
): Promise<T | undefined> {
  // Check environment variable first
  if (envVar && process.env[envVar]) {
    return process.env[envVar] as T;
  }

  // Load from config file
  const config = await loadGlobalConfig();
  const parts = path.split('.');
  let value: any = config;

  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return undefined;
    }
  }

  return value as T;
}

/**
 * Get Cloudflare credentials from config or environment
 */
export async function getCloudflareCredentials(): Promise<{
  accountId?: string;
  apiToken?: string;
}> {
  const config = await loadGlobalConfig();

  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || config.cloudflare?.accountId,
    apiToken: process.env.CLOUDFLARE_API_TOKEN || config.cloudflare?.apiToken,
  };
}

/**
 * Get AI API key from config or environment
 */
export async function getAICredentials(): Promise<{
  provider: 'anthropic' | 'openai';
  apiKey?: string;
}> {
  const config = await loadGlobalConfig();

  // Check environment variables first
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', apiKey: process.env.OPENAI_API_KEY };
  }

  // Fall back to config
  const provider = config.ai?.provider || 'anthropic';
  const apiKey = provider === 'anthropic'
    ? config.ai?.anthropicApiKey
    : config.ai?.openaiApiKey;

  return { provider, apiKey };
}

/**
 * Initialize config interactively (for `ytm config` command)
 */
export async function initializeConfig(updates: Partial<GlobalConfig>): Promise<void> {
  const existing = await loadGlobalConfig();
  const merged = deepMerge(existing, updates);
  await saveGlobalConfig(merged);
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== undefined) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key]) &&
        typeof result[key] === 'object' &&
        result[key] !== null
      ) {
        result[key] = deepMerge(result[key], source[key] as any);
      } else {
        result[key] = source[key] as any;
      }
    }
  }

  return result;
}

/**
 * Print config file location
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Example config for documentation
 */
export const EXAMPLE_CONFIG: GlobalConfig = {
  cloudflare: {
    accountId: 'your-cloudflare-account-id',
    apiToken: 'your-cloudflare-api-token',
  },
  ai: {
    provider: 'anthropic',
    anthropicApiKey: 'your-anthropic-api-key',
  },
  defaults: {
    environment: 'production',
    minify: true,
    sourcemaps: false,
  },
  proxy: {
    enabled: true,
    vendors: ['ga4', 'linkedin', 'meta', 'msads', 'optinmonster'],
  },
};
