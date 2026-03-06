/**
 * Deploy Worker Helper
 *
 * Provides high-level functions to deploy the YourTM worker to Cloudflare.
 * Uses the CloudflareClient from api.ts for API operations.
 */

import { generateWorkerScript } from './worker-template.js';
import { generateWranglerConfig, type WranglerConfig } from './wrangler-template.js';
import { CloudflareClient, CloudflareAPIError } from './api.js';
import type { KVBulkWriteItem } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface CloudflareCredentials {
  /** Cloudflare Account ID */
  accountId: string;
  /** Cloudflare API Token with Workers permissions */
  apiToken: string;
}

export interface WorkerDeployOptions {
  /** Container ID for the worker */
  containerId: string;
  /** Worker name (defaults to yourtm-{containerId}) */
  workerName?: string;
  /** KV namespace ID (creates one if not provided) */
  kvNamespaceId?: string;
  /** Enable telemetry collection */
  enableTelemetry?: boolean;
  /** Custom telemetry endpoint */
  telemetryEndpoint?: string;
  /** CORS allowed origins */
  corsOrigins?: string[];
  /** Enable debug mode */
  debugMode?: boolean;
  /** Custom routes to bind */
  routes?: Array<{ pattern: string; zoneId?: string }>;
}

export interface DeployResult {
  success: boolean;
  /** Worker script ID */
  workerId?: string;
  /** Worker URL on workers.dev */
  workerUrl?: string;
  /** KV namespace ID */
  kvNamespaceId?: string;
  /** Error message if failed */
  error?: string;
  /** Detailed deployment info */
  details?: {
    scriptSize: number;
    deployedAt: string;
    routes: string[];
  };
}

export interface KVNamespaceResult {
  success: boolean;
  namespaceId?: string;
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a CloudflareClient from credentials
 */
function getClient(credentials: CloudflareCredentials): CloudflareClient {
  return new CloudflareClient({
    apiToken: credentials.apiToken,
    accountId: credentials.accountId,
  });
}

/**
 * Result type for safe async operations
 */
type SafeResult<T> =
  | { success: true; data: T; error?: never }
  | { success: false; data?: never; error: string };

/**
 * Wrap async operations with error handling
 */
async function safeAsync<T>(
  fn: () => Promise<T>,
  errorMessage: string
): Promise<SafeResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    if (error instanceof CloudflareAPIError) {
      return { success: false, error: `${errorMessage}: ${error.message}` };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : errorMessage,
    };
  }
}

// ============================================================================
// KV Namespace Management
// ============================================================================

/**
 * Create a new KV namespace for storing YourTM bundles
 */
export async function createKVNamespace(
  credentials: CloudflareCredentials,
  title: string = 'YourTM Bundles'
): Promise<KVNamespaceResult> {
  const client = getClient(credentials);
  const result = await safeAsync(
    () => client.createKVNamespace(title),
    'Failed to create KV namespace'
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, namespaceId: result.data.id };
}

/**
 * List existing KV namespaces
 */
export async function listKVNamespaces(
  credentials: CloudflareCredentials
): Promise<{ success: boolean; namespaces?: Array<{ id: string; title: string }>; error?: string }> {
  const client = getClient(credentials);
  const result = await safeAsync(
    () => client.listKVNamespaces(),
    'Failed to list KV namespaces'
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    namespaces: result.data.map((ns) => ({ id: ns.id, title: ns.title })),
  };
}

/**
 * Write a value to KV
 */
export async function writeToKV(
  credentials: CloudflareCredentials,
  namespaceId: string,
  key: string,
  value: string
): Promise<{ success: boolean; error?: string }> {
  const client = getClient(credentials);
  const result = await safeAsync(
    () => client.putKVValue(namespaceId, key, value),
    'Failed to write to KV'
  );

  return result.success ? { success: true } : { success: false, error: result.error };
}

/**
 * Write multiple values to KV in bulk
 */
export async function bulkWriteToKV(
  credentials: CloudflareCredentials,
  namespaceId: string,
  items: Array<{ key: string; value: string }>
): Promise<{ success: boolean; error?: string }> {
  const client = getClient(credentials);

  // Convert to Cloudflare bulk write format with base64 encoding
  const bulkItems: KVBulkWriteItem[] = items.map((item) => ({
    key: item.key,
    value: Buffer.from(item.value).toString('base64'),
    base64: true,
  }));

  const result = await safeAsync(
    () => client.bulkWriteKV(namespaceId, bulkItems),
    'Failed to bulk write to KV'
  );

  return result.success ? { success: true } : { success: false, error: result.error };
}

// ============================================================================
// Worker Deployment
// ============================================================================

/**
 * Deploy the YourTM worker to Cloudflare
 */
export async function deployWorker(
  credentials: CloudflareCredentials,
  options: WorkerDeployOptions
): Promise<DeployResult> {
  const {
    containerId,
    workerName = `yourtm-${containerId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`,
    enableTelemetry = true,
    telemetryEndpoint,
    corsOrigins = ['*'],
    debugMode = false,
    routes: _routes = [],
  } = options;
  // Routes are not yet implemented - variable prefixed with _ to indicate intentionally unused
  void _routes;

  let { kvNamespaceId } = options;
  const client = getClient(credentials);

  try {
    // Step 1: Create KV namespace if not provided
    if (!kvNamespaceId) {
      const kvResult = await createKVNamespace(
        credentials,
        `YourTM - ${containerId}`
      );

      if (!kvResult.success || !kvResult.namespaceId) {
        return {
          success: false,
          error: `Failed to create KV namespace: ${kvResult.error}`,
        };
      }

      kvNamespaceId = kvResult.namespaceId;
    }

    // Step 2: Generate worker script
    const workerScript = generateWorkerScript({
      containerId,
      enableTelemetry,
      telemetryEndpoint,
      corsOrigins,
      debugMode,
    });

    // Step 3: Deploy worker with KV binding using the CloudflareClient
    const deployResult = await safeAsync(
      () =>
        client.deployWorker(workerName, workerScript, {
          bindings: [
            {
              type: 'kv_namespace',
              name: 'YTM_KV',
              namespace_id: kvNamespaceId,
            },
          ],
          compatibilityDate: '2024-01-01',
        }),
      'Failed to deploy worker'
    );

    if (!deployResult.success) {
      return { success: false, error: deployResult.error };
    }

    // Step 4: Get subdomain info for the worker URL
    const subdomainResult = await safeAsync(
      () => client.getWorkerSubdomain(),
      'Failed to get worker subdomain'
    );

    const subdomain = subdomainResult.success ? subdomainResult.data?.subdomain : null;
    const workerUrl = subdomain
      ? `https://${workerName}.${subdomain}.workers.dev`
      : undefined;

    // Step 5: Set up routes if provided (routes need zone access)
    const deployedRoutes: string[] = [];
    // Note: Route setup requires zone-specific API calls which would need
    // additional implementation in CloudflareClient

    return {
      success: true,
      workerId: deployResult.data.id,
      workerUrl,
      kvNamespaceId,
      details: {
        scriptSize: workerScript.length,
        deployedAt: new Date().toISOString(),
        routes: deployedRoutes,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Delete a deployed worker
 */
export async function deleteWorker(
  credentials: CloudflareCredentials,
  workerName: string
): Promise<{ success: boolean; error?: string }> {
  const client = getClient(credentials);
  const result = await safeAsync(
    () => client.deleteWorker(workerName),
    'Failed to delete worker'
  );

  return result.success ? { success: true } : { success: false, error: result.error };
}

/**
 * Get worker deployment status
 */
export async function getWorkerStatus(
  credentials: CloudflareCredentials,
  workerName: string
): Promise<{
  success: boolean;
  exists?: boolean;
  details?: {
    id: string;
    etag: string;
    size: number;
    modifiedOn: string;
  };
  error?: string;
}> {
  const client = getClient(credentials);

  try {
    const worker = await client.getWorker(workerName);

    if (!worker) {
      return { success: true, exists: false };
    }

    return {
      success: true,
      exists: true,
      details: {
        id: worker.id,
        etag: worker.etag,
        size: worker.size || 0,
        modifiedOn: worker.modified_on,
      },
    };
  } catch (error) {
    if (error instanceof CloudflareAPIError && error.code === 10007) {
      return { success: true, exists: false };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Bundle Upload
// ============================================================================

/**
 * Upload compiled bundles to KV storage
 */
export async function uploadBundles(
  credentials: CloudflareCredentials,
  kvNamespaceId: string,
  bundles: {
    runtime: string;
    zones: Array<{ id: string; code: string }>;
    config: object;
  },
  version: string = 'latest'
): Promise<{ success: boolean; error?: string; uploadedFiles?: string[] }> {
  const items: Array<{ key: string; value: string }> = [];
  const uploadedFiles: string[] = [];

  // Add runtime
  items.push({ key: `${version}/runtime.js`, value: bundles.runtime });
  uploadedFiles.push(`${version}/runtime.js`);

  // Add zone chunks
  for (const zone of bundles.zones) {
    items.push({ key: `${version}/zones/${zone.id}.js`, value: zone.code });
    uploadedFiles.push(`${version}/zones/${zone.id}.js`);
  }

  // Add config
  items.push({
    key: `${version}/config.json`,
    value: JSON.stringify(bundles.config),
  });
  uploadedFiles.push(`${version}/config.json`);

  // Bulk upload
  const result = await bulkWriteToKV(credentials, kvNamespaceId, items);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, uploadedFiles };
}

// ============================================================================
// Wrangler Config Generation
// ============================================================================

/**
 * Generate wrangler.toml file content for manual deployment
 */
export function generateWranglerConfigFile(
  options: WorkerDeployOptions & { kvNamespaceId: string }
): string {
  const config: WranglerConfig = {
    name: options.workerName || `yourtm-${options.containerId}`,
    kvNamespaceId: options.kvNamespaceId,
    vars: {},
  };

  if (options.enableTelemetry && options.telemetryEndpoint) {
    config.vars!.TELEMETRY_ENDPOINT = options.telemetryEndpoint;
  }

  if (options.routes) {
    config.routes = options.routes.map((r) => ({
      pattern: r.pattern,
      zoneId: r.zoneId,
    }));
  }

  return generateWranglerConfig(config);
}

// ============================================================================
// Exports
// ============================================================================

export {
  generateWorkerScript,
  generateWranglerConfig,
};

export default deployWorker;
