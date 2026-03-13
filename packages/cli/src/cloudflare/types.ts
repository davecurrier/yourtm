/**
 * Cloudflare API Types
 *
 * TypeScript types for Cloudflare API v4 responses used by the YourTM deploy command.
 */

// Base API response structure
export interface CloudflareAPIResponse<T> {
  success: boolean;
  errors: CloudflareAPIError[];
  messages: CloudflareAPIMessage[];
  result: T;
  result_info?: CloudflareResultInfo;
}

export interface CloudflareAPIError {
  code: number;
  message: string;
  error_chain?: CloudflareAPIError[];
}

export interface CloudflareAPIMessage {
  code: number;
  message: string;
}

export interface CloudflareResultInfo {
  page: number;
  per_page: number;
  count: number;
  total_count: number;
  total_pages: number;
}

// KV Namespace types
export interface KVNamespace {
  id: string;
  title: string;
  supports_url_encoding?: boolean;
}

export interface KVNamespaceListResult {
  id: string;
  title: string;
  supports_url_encoding: boolean;
}

export interface KVKeyInfo {
  name: string;
  expiration?: number;
  metadata?: Record<string, unknown>;
}

export interface KVBulkWriteItem {
  key: string;
  value: string;
  expiration?: number;
  expiration_ttl?: number;
  metadata?: Record<string, unknown>;
  base64?: boolean;
}

// Worker types
export interface Worker {
  id: string;
  created_on: string;
  modified_on: string;
  etag: string;
  handlers: string[];
  last_deployed_from?: string;
  logpush?: boolean;
  placement_mode?: string;
  script?: string;
  size?: number;
  tail_consumers?: TailConsumer[];
  usage_model?: 'bundled' | 'unbound' | 'standard';
}

export interface TailConsumer {
  environment: string;
  namespace: string;
  service: string;
}

export interface WorkerRoute {
  id: string;
  pattern: string;
  script: string;
  zone_id?: string;
}

export interface WorkerBinding {
  name: string;
  type: 'kv_namespace' | 'durable_object_namespace' | 'r2_bucket' | 'service' | 'plain_text' | 'secret_text' | 'json';
  namespace_id?: string;
  class_name?: string;
  text?: string;
}

export interface WorkerDeploymentMetadata {
  bindings?: WorkerBinding[];
  usage_model?: 'bundled' | 'unbound' | 'standard';
  compatibility_date?: string;
  compatibility_flags?: string[];
  logpush?: boolean;
  main_module?: string;
  migrations?: Record<string, unknown>;
}

export interface WorkerScript {
  id: string;
  etag: string;
  handlers: string[];
  last_deployed_from: string;
  logpush: boolean;
  modified_on: string;
  placement_mode: string;
  tail_consumers: TailConsumer[];
  usage_model: string;
}

// Custom domain types
export interface CustomDomain {
  id: string;
  zone_id: string;
  zone_name: string;
  hostname: string;
  service: string;
  environment: string;
  ssl?: {
    type: string;
    status: string;
  };
  created_on: string;
  modified_on: string;
}

// Account types
export interface Account {
  id: string;
  name: string;
  type: string;
  settings?: AccountSettings;
}

export interface AccountSettings {
  enforce_twofactor: boolean;
  access_approval_expiry?: string;
}

// Deploy configuration types (used in yourtm.config.ts)
export interface CloudflareDeployConfig {
  accountId?: string;
  kvNamespaceId?: string;
  workerName?: string;
  customDomain?: string;
}

export interface DeployEnvironment {
  deployTo?: 'cloudflare' | 'self-hosted';
  accountId?: string;
  kvNamespaceId?: string;
  workerName?: string;
  customDomain?: string;
  debug?: boolean;
  performanceBudget?: {
    bundleSize?: string;
    tagExecution?: string;
  };
}

// Version metadata stored in KV
export interface DeployedVersion {
  version: string;
  timestamp: number;
  containerId: string;
  environment: string;
  bundles: DeployedBundle[];
  metadata?: {
    message?: string;
    deployer?: string;
    gitCommit?: string;
    gitBranch?: string;
  };
}

export interface DeployedBundle {
  name: string;
  key: string;
  size: number;
  hash: string;
}

// Version index stored in KV (for listing available versions)
export interface VersionIndex {
  versions: VersionEntry[];
  current: string;
  previous?: string;
}

export interface VersionEntry {
  version: string;
  timestamp: number;
  environment: string;
  size: number;
  message?: string;
}

// CLI options types
export interface DeployInitOptions {
  /** Skip confirmation prompts (use defaults) */
  yes?: boolean;
  /** Cloudflare Account ID */
  accountId?: string;
  /** Cloudflare API Token */
  apiToken?: string;
  /** Custom worker name */
  workerName?: string;
  /** Environment to set up (staging, production, both) */
  environment?: 'staging' | 'production' | 'both';
  /** Skip deploying the Cloudflare Worker */
  skipWorker?: boolean;
  /** Save credentials to ~/.yourtm/credentials.json */
  saveCredentials?: boolean;
}

export interface DeployOptions {
  env?: 'development' | 'staging' | 'production';
  version?: string;
  dryRun?: boolean;
  force?: boolean;
  message?: string;
  token?: string;
}

export interface RollbackOptions {
  version?: string;
  env?: 'development' | 'staging' | 'production';
  force?: boolean;
}

// Worker script template context
export interface WorkerContext {
  containerId: string;
  kvNamespaceId: string;
  corsOrigins?: string[];
  cacheMaxAge?: number;
}

// R2 bucket types
export interface R2Bucket {
  name: string;
  creation_date: string;
  location?: string;
}

export interface R2Object {
  key: string;
  size: number;
  uploaded: string;
  etag: string;
  httpEtag: string;
  storageClass: string;
  checksums?: {
    md5?: string;
    sha1?: string;
    sha256?: string;
  };
  customMetadata?: Record<string, string>;
}

export interface R2ObjectListResult {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
  delimited_prefixes?: string[];
}

export interface R2PublicBucketConfig {
  bucketName: string;
  allowedOrigins?: string[];
  cacheMaxAge?: number;
}

// Updated deploy config to include R2
export interface CloudflareDeployConfigV2 {
  accountId?: string;
  /** R2 bucket for static bundle storage (recommended) */
  r2BucketName?: string;
  /** Custom domain for R2 bucket (e.g., cdn.yourtm.dev) */
  r2CustomDomain?: string;
  /** KV namespace for metadata only (version index, etc.) */
  kvNamespaceId?: string;
  /** Worker name for API endpoints (telemetry, preview) */
  workerName?: string;
  /** Worker custom domain */
  customDomain?: string;
}
