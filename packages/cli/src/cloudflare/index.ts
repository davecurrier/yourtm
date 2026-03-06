/**
 * YourTM Cloudflare Worker Module
 *
 * This module provides everything needed to deploy and manage
 * YourTM tag manager bundles on Cloudflare Workers.
 *
 * @example
 * ```typescript
 * import {
 *   deployWorker,
 *   uploadBundles,
 *   generateWorkerScript,
 *   generateWranglerConfig,
 *   CloudflareClient,
 * } from './cloudflare';
 *
 * // Deploy worker to Cloudflare
 * const result = await deployWorker(credentials, {
 *   containerId: 'YTM-ABC123',
 *   enableTelemetry: true,
 * });
 *
 * // Upload compiled bundles
 * await uploadBundles(credentials, result.kvNamespaceId, {
 *   runtime: runtimeCode,
 *   zones: [{ id: 'zone1', code: zone1Code }],
 *   config: containerConfig,
 * });
 * ```
 */

// Re-export types
export * from './types.js';

// Cloudflare API client
export {
  CloudflareClient,
  CloudflareAPIError,
  createCloudflareClient,
  getCloudflareCredentials,
  generateVersion,
  generateContentHash,
  generateWorkerScript as generateCDNWorkerScript,
} from './api.js';

// Enhanced worker template generation (with zones, telemetry, preview mode)
export {
  generateWorkerScript,
  generateMinifiedWorkerScript,
} from './worker-template.js';

// Wrangler configuration
export {
  generateWranglerConfig,
  generateMinimalWranglerConfig,
  generateDocumentedWranglerConfig,
  type WranglerConfig,
} from './wrangler-template.js';

// High-level deployment functions
export {
  deployWorker,
  deleteWorker,
  getWorkerStatus,
  createKVNamespace,
  listKVNamespaces,
  writeToKV,
  bulkWriteToKV,
  uploadBundles,
  generateWranglerConfigFile,
  type CloudflareCredentials,
  type WorkerDeployOptions,
  type DeployResult,
  type KVNamespaceResult,
} from './deploy-worker.js';

// Default export for convenience
export { default as deploy } from './deploy-worker.js';
