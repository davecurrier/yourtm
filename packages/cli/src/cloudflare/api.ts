/**
 * Cloudflare API Client
 *
 * Zero-dependency HTTP client for Cloudflare API v4.
 * Handles KV namespaces, Workers, and deployments.
 */

import type {
  CloudflareAPIResponse,
  KVNamespace,
  KVNamespaceListResult,
  KVKeyInfo,
  KVBulkWriteItem,
  Worker,
  WorkerScript,
  WorkerBinding,
  WorkerDeploymentMetadata,
  R2Bucket,
  R2Object,
  R2ObjectListResult,
} from './types.js';

const BASE_URL = 'https://api.cloudflare.com/client/v4';

export interface CloudflareClientOptions {
  apiToken: string;
  accountId: string;
}

export class CloudflareAPIError extends Error {
  public readonly code: number;
  public readonly errors: Array<{ code: number; message: string }>;

  constructor(
    message: string,
    code: number,
    errors: Array<{ code: number; message: string }> = []
  ) {
    super(message);
    this.name = 'CloudflareAPIError';
    this.code = code;
    this.errors = errors;
  }
}

export class CloudflareClient {
  private apiToken: string;
  private accountId: string;

  constructor(options: CloudflareClientOptions) {
    this.apiToken = options.apiToken;
    this.accountId = options.accountId;
  }

  // ============================================
  // Core HTTP Methods
  // ============================================

  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      contentType?: string;
      formData?: FormData;
    } = {}
  ): Promise<T> {
    const url = `${BASE_URL}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
    };

    let body: string | FormData | undefined;

    if (options.formData) {
      body = options.formData;
      // Don't set Content-Type for FormData, fetch will set it with boundary
    } else if (options.body !== undefined) {
      headers['Content-Type'] = options.contentType || 'application/json';
      body = typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body);
    }

    const response = await fetch(url, {
      method,
      headers,
      body,
    });

    // Handle non-JSON responses (like KV values)
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/json')) {
      if (!response.ok) {
        throw new CloudflareAPIError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status
        );
      }
      return (await response.text()) as T;
    }

    const data = (await response.json()) as CloudflareAPIResponse<T>;

    if (!data.success) {
      const errorMessages = data.errors
        .map((e) => `[${e.code}] ${e.message}`)
        .join('; ');
      throw new CloudflareAPIError(
        errorMessages || `API request failed: ${response.status}`,
        data.errors[0]?.code || response.status,
        data.errors
      );
    }

    return data.result;
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private post<T>(
    path: string,
    body?: unknown,
    options?: { contentType?: string; formData?: FormData }
  ): Promise<T> {
    return this.request<T>('POST', path, { body, ...options });
  }

  private put<T>(
    path: string,
    body?: unknown,
    options?: { contentType?: string; formData?: FormData }
  ): Promise<T> {
    return this.request<T>('PUT', path, { body, ...options });
  }

  private delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  // ============================================
  // KV Namespace Operations
  // ============================================

  /**
   * Create a new KV namespace
   */
  async createKVNamespace(title: string): Promise<KVNamespace> {
    return this.post<KVNamespace>(
      `/accounts/${this.accountId}/storage/kv/namespaces`,
      { title }
    );
  }

  /**
   * List all KV namespaces
   */
  async listKVNamespaces(): Promise<KVNamespaceListResult[]> {
    return this.get<KVNamespaceListResult[]>(
      `/accounts/${this.accountId}/storage/kv/namespaces`
    );
  }

  /**
   * Get a specific KV namespace by ID
   */
  async getKVNamespace(namespaceId: string): Promise<KVNamespace> {
    return this.get<KVNamespace>(
      `/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}`
    );
  }

  /**
   * Delete a KV namespace
   */
  async deleteKVNamespace(namespaceId: string): Promise<void> {
    await this.delete<null>(
      `/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}`
    );
  }

  /**
   * Rename a KV namespace
   */
  async renameKVNamespace(
    namespaceId: string,
    title: string
  ): Promise<KVNamespace> {
    return this.put<KVNamespace>(
      `/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}`,
      { title }
    );
  }

  // ============================================
  // KV Key-Value Operations
  // ============================================

  /**
   * Write a value to KV
   */
  async putKVValue(
    namespaceId: string,
    key: string,
    value: string,
    options?: {
      expiration?: number;
      expirationTtl?: number;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    const params = new URLSearchParams();
    if (options?.expiration) {
      params.set('expiration', String(options.expiration));
    }
    if (options?.expirationTtl) {
      params.set('expiration_ttl', String(options.expirationTtl));
    }

    const queryString = params.toString();
    const path = `/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}${queryString ? `?${queryString}` : ''}`;

    if (options?.metadata) {
      // Use multipart form data for value + metadata
      const formData = new FormData();
      formData.append('value', value);
      formData.append('metadata', JSON.stringify(options.metadata));
      await this.put<null>(path, undefined, { formData });
    } else {
      // Plain text value
      await this.put<null>(path, value, { contentType: 'text/plain' });
    }
  }

  /**
   * Read a value from KV
   */
  async getKVValue(namespaceId: string, key: string): Promise<string | null> {
    try {
      return await this.get<string>(
        `/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`
      );
    } catch (error) {
      if (error instanceof CloudflareAPIError && error.code === 10009) {
        // Key not found
        return null;
      }
      throw error;
    }
  }

  /**
   * Read a value with metadata from KV
   */
  async getKVValueWithMetadata(
    namespaceId: string,
    key: string
  ): Promise<{ value: string; metadata: Record<string, unknown> } | null> {
    try {
      const metadata = await this.get<Record<string, unknown>>(
        `/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}/metadata/${encodeURIComponent(key)}`
      );
      const value = await this.getKVValue(namespaceId, key);
      if (value === null) return null;
      return { value, metadata };
    } catch (error) {
      if (error instanceof CloudflareAPIError && error.code === 10009) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a value from KV
   */
  async deleteKVValue(namespaceId: string, key: string): Promise<void> {
    await this.delete<null>(
      `/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`
    );
  }

  /**
   * List keys in a KV namespace
   */
  async listKVKeys(
    namespaceId: string,
    options?: {
      prefix?: string;
      limit?: number;
      cursor?: string;
    }
  ): Promise<{ keys: KVKeyInfo[]; cursor?: string; list_complete: boolean }> {
    const params = new URLSearchParams();
    if (options?.prefix) params.set('prefix', options.prefix);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);

    const queryString = params.toString();
    return this.get(
      `/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}/keys${queryString ? `?${queryString}` : ''}`
    );
  }

  /**
   * Bulk write multiple key-value pairs
   */
  async bulkWriteKV(
    namespaceId: string,
    items: KVBulkWriteItem[]
  ): Promise<void> {
    await this.put<null>(
      `/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}/bulk`,
      items
    );
  }

  /**
   * Bulk delete multiple keys
   */
  async bulkDeleteKV(namespaceId: string, keys: string[]): Promise<void> {
    await this.delete<null>(
      `/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}/bulk`
    );
    // Note: Cloudflare API uses DELETE with body for bulk delete
    await this.request<null>(
      'DELETE',
      `/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}/bulk`,
      { body: keys }
    );
  }

  // ============================================
  // Workers Operations
  // ============================================

  /**
   * List all Workers
   */
  async listWorkers(): Promise<WorkerScript[]> {
    return this.get<WorkerScript[]>(
      `/accounts/${this.accountId}/workers/scripts`
    );
  }

  /**
   * Get a specific Worker
   */
  async getWorker(scriptName: string): Promise<Worker | null> {
    try {
      return await this.get<Worker>(
        `/accounts/${this.accountId}/workers/scripts/${scriptName}`
      );
    } catch (error) {
      if (error instanceof CloudflareAPIError && error.code === 10007) {
        // Script not found
        return null;
      }
      throw error;
    }
  }

  /**
   * Deploy a Worker script (modules format)
   */
  async deployWorker(
    scriptName: string,
    script: string,
    options?: {
      bindings?: WorkerBinding[];
      compatibilityDate?: string;
      compatibilityFlags?: string[];
    }
  ): Promise<WorkerScript> {
    const metadata: WorkerDeploymentMetadata = {
      main_module: 'worker.js',
      compatibility_date: options?.compatibilityDate || '2024-01-01',
      compatibility_flags: options?.compatibilityFlags,
      bindings: options?.bindings,
    };

    const formData = new FormData();

    // Add the worker module
    formData.append(
      'worker.js',
      new Blob([script], { type: 'application/javascript+module' }),
      'worker.js'
    );

    // Add metadata
    formData.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
      'metadata.json'
    );

    return this.put<WorkerScript>(
      `/accounts/${this.accountId}/workers/scripts/${scriptName}`,
      undefined,
      { formData }
    );
  }

  /**
   * Deploy a Worker script (service worker format - simpler)
   */
  async deployWorkerServiceWorker(
    scriptName: string,
    script: string,
    bindings?: WorkerBinding[]
  ): Promise<WorkerScript> {
    const formData = new FormData();

    // Add script
    formData.append(
      'script',
      new Blob([script], { type: 'application/javascript' }),
      'script.js'
    );

    // Add metadata if we have bindings
    if (bindings && bindings.length > 0) {
      const metadata = { bindings };
      formData.append(
        'metadata',
        new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
        'metadata.json'
      );
    }

    return this.put<WorkerScript>(
      `/accounts/${this.accountId}/workers/scripts/${scriptName}`,
      undefined,
      { formData }
    );
  }

  /**
   * Delete a Worker
   */
  async deleteWorker(scriptName: string): Promise<void> {
    await this.delete<null>(
      `/accounts/${this.accountId}/workers/scripts/${scriptName}`
    );
  }

  /**
   * Get Worker subdomain
   */
  async getWorkerSubdomain(): Promise<{ subdomain: string } | null> {
    try {
      return await this.get<{ subdomain: string }>(
        `/accounts/${this.accountId}/workers/subdomain`
      );
    } catch (error) {
      if (error instanceof CloudflareAPIError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Enable Workers subdomain
   */
  async enableWorkerSubdomain(subdomain: string): Promise<{ subdomain: string }> {
    return this.put<{ subdomain: string }>(
      `/accounts/${this.accountId}/workers/subdomain`,
      { subdomain }
    );
  }

  // ============================================
  // Account Verification
  // ============================================

  /**
   * Verify API token is valid
   */
  async verifyToken(): Promise<boolean> {
    try {
      await this.get<{ id: string; status: string }>(
        '/user/tokens/verify'
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get account details
   */
  async getAccount(): Promise<{ id: string; name: string }> {
    const accounts = await this.get<Array<{ id: string; name: string }>>(
      '/accounts'
    );
    const account = accounts.find((a) => a.id === this.accountId);
    if (!account) {
      throw new CloudflareAPIError(
        `Account ${this.accountId} not found or you don't have access`,
        403
      );
    }
    return account;
  }

  // ============================================
  // R2 Bucket Operations
  // ============================================

  /**
   * List all R2 buckets
   */
  async listR2Buckets(): Promise<R2Bucket[]> {
    return this.get<R2Bucket[]>(
      `/accounts/${this.accountId}/r2/buckets`
    );
  }

  /**
   * Create a new R2 bucket
   */
  async createR2Bucket(name: string, locationHint?: string): Promise<R2Bucket> {
    return this.post<R2Bucket>(
      `/accounts/${this.accountId}/r2/buckets`,
      {
        name,
        locationHint: locationHint || 'apac', // Default to APAC for global distribution
      }
    );
  }

  /**
   * Get R2 bucket info
   */
  async getR2Bucket(bucketName: string): Promise<R2Bucket | null> {
    try {
      return await this.get<R2Bucket>(
        `/accounts/${this.accountId}/r2/buckets/${bucketName}`
      );
    } catch (error) {
      if (error instanceof CloudflareAPIError && error.code === 10006) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete an R2 bucket
   */
  async deleteR2Bucket(bucketName: string): Promise<void> {
    await this.delete<null>(
      `/accounts/${this.accountId}/r2/buckets/${bucketName}`
    );
  }

  /**
   * Upload an object to R2 bucket
   * Uses the S3-compatible API endpoint
   */
  async uploadToR2(
    bucketName: string,
    key: string,
    content: string | Buffer,
    options?: {
      contentType?: string;
      cacheControl?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<void> {
    // R2 uses S3-compatible API for object operations
    // We need to use the S3 API endpoint: https://{account_id}.r2.cloudflarestorage.com
    const url = `https://${this.accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': options?.contentType || 'application/javascript',
    };

    if (options?.cacheControl) {
      headers['Cache-Control'] = options.cacheControl;
    }

    // Add custom metadata headers
    if (options?.metadata) {
      for (const [k, v] of Object.entries(options.metadata)) {
        headers[`x-amz-meta-${k}`] = v;
      }
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: content,
    });

    if (!response.ok) {
      throw new CloudflareAPIError(
        `Failed to upload to R2: ${response.status} ${response.statusText}`,
        response.status
      );
    }
  }

  /**
   * Delete an object from R2 bucket
   */
  async deleteFromR2(bucketName: string, key: string): Promise<void> {
    const url = `https://${this.accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      throw new CloudflareAPIError(
        `Failed to delete from R2: ${response.status} ${response.statusText}`,
        response.status
      );
    }
  }

  /**
   * List objects in R2 bucket
   */
  async listR2Objects(
    bucketName: string,
    options?: {
      prefix?: string;
      delimiter?: string;
      maxKeys?: number;
      cursor?: string;
    }
  ): Promise<R2ObjectListResult> {
    const params = new URLSearchParams();
    if (options?.prefix) params.set('prefix', options.prefix);
    if (options?.delimiter) params.set('delimiter', options.delimiter);
    if (options?.maxKeys) params.set('max-keys', String(options.maxKeys));
    if (options?.cursor) params.set('continuation-token', options.cursor);

    const queryString = params.toString();
    const url = `https://${this.accountId}.r2.cloudflarestorage.com/${bucketName}${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
      },
    });

    if (!response.ok) {
      throw new CloudflareAPIError(
        `Failed to list R2 objects: ${response.status}`,
        response.status
      );
    }

    // Parse XML response (S3-compatible)
    const xml = await response.text();
    return this.parseR2ListResponse(xml);
  }

  /**
   * Enable public access for R2 bucket via custom domain
   * Note: This requires a zone (domain) to be set up in Cloudflare
   */
  async enableR2PublicAccess(
    bucketName: string,
    options: {
      /**
       * Option 1: Use r2.dev subdomain (simplest, no custom domain needed)
       * Creates: https://{random}.r2.dev/{bucket}
       */
      useR2Dev?: boolean;
      /**
       * Option 2: Connect custom domain (requires zone in Cloudflare)
       * Creates: https://cdn.yourdomain.com
       */
      customDomain?: string;
      zoneId?: string;
    }
  ): Promise<{ publicUrl: string }> {
    if (options.useR2Dev) {
      // Enable r2.dev public access
      // This creates a public URL at: pub-{hash}.r2.dev/{bucket}/{key}
      await this.put<unknown>(
        `/accounts/${this.accountId}/r2/buckets/${bucketName}/policy`,
        {
          // Allow public read access
          statements: [
            {
              action: ['s3:GetObject'],
              principal: '*',
              resource: [`arn:aws:s3:::${bucketName}/*`],
              effect: 'Allow',
            },
          ],
        }
      );

      // Get the public bucket URL
      const bucketInfo = await this.getR2Bucket(bucketName);
      return {
        publicUrl: `https://pub-${this.accountId.slice(0, 8)}.r2.dev/${bucketName}`,
      };
    }

    if (options.customDomain && options.zoneId) {
      // Connect custom domain to R2 bucket
      // This requires DNS and SSL setup through the zone
      await this.post<unknown>(
        `/accounts/${this.accountId}/r2/buckets/${bucketName}/custom_domains`,
        {
          hostname: options.customDomain,
          zone_id: options.zoneId,
        }
      );

      return {
        publicUrl: `https://${options.customDomain}`,
      };
    }

    throw new CloudflareAPIError(
      'Must specify either useR2Dev or customDomain + zoneId',
      400
    );
  }

  /**
   * Get R2 bucket public URL if public access is enabled
   */
  async getR2PublicUrl(bucketName: string): Promise<string | null> {
    try {
      // Check for custom domains first
      const customDomains = await this.get<Array<{ hostname: string }>>(
        `/accounts/${this.accountId}/r2/buckets/${bucketName}/custom_domains`
      );

      if (customDomains && customDomains.length > 0) {
        return `https://${customDomains[0].hostname}`;
      }

      // Fall back to r2.dev subdomain
      return `https://pub-${this.accountId.slice(0, 8)}.r2.dev/${bucketName}`;
    } catch {
      return null;
    }
  }

  /**
   * Parse S3-compatible XML list response
   */
  private parseR2ListResponse(xml: string): R2ObjectListResult {
    // Simple XML parsing for S3 ListObjectsV2 response
    const objects: R2Object[] = [];
    const truncated = xml.includes('<IsTruncated>true</IsTruncated>');

    // Extract objects
    const contentMatches = xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g);
    for (const match of contentMatches) {
      const content = match[1];
      const key = content.match(/<Key>(.*?)<\/Key>/)?.[1] || '';
      const size = parseInt(content.match(/<Size>(.*?)<\/Size>/)?.[1] || '0', 10);
      const uploaded = content.match(/<LastModified>(.*?)<\/LastModified>/)?.[1] || '';
      const etag = content.match(/<ETag>(.*?)<\/ETag>/)?.[1]?.replace(/"/g, '') || '';

      objects.push({
        key,
        size,
        uploaded,
        etag,
        httpEtag: etag,
        storageClass: 'STANDARD',
      });
    }

    // Extract cursor
    const cursor = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/)?.[1];

    // Extract prefixes
    const prefixMatches = xml.matchAll(/<CommonPrefixes><Prefix>(.*?)<\/Prefix><\/CommonPrefixes>/g);
    const delimited_prefixes = Array.from(prefixMatches, m => m[1]);

    return {
      objects,
      truncated,
      cursor,
      delimited_prefixes: delimited_prefixes.length > 0 ? delimited_prefixes : undefined,
    };
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get Cloudflare credentials from environment or options
 */
export function getCloudflareCredentials(options?: {
  token?: string;
  accountId?: string;
}): { apiToken: string; accountId: string } | null {
  const apiToken = options?.token || process.env.CLOUDFLARE_API_TOKEN;
  const accountId = options?.accountId || process.env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    return null;
  }

  return { apiToken, accountId };
}

/**
 * Create a Cloudflare client from environment or options
 */
export function createCloudflareClient(options?: {
  token?: string;
  accountId?: string;
}): CloudflareClient | null {
  const credentials = getCloudflareCredentials(options);
  if (!credentials) {
    return null;
  }
  return new CloudflareClient(credentials);
}

/**
 * Generate the CDN delivery Worker script
 */
export function generateWorkerScript(context: {
  containerId: string;
  kvNamespaceBinding: string;
  corsOrigins?: string[];
  cacheMaxAge?: number;
}): string {
  const corsOrigins = context.corsOrigins || ['*'];
  const cacheMaxAge = context.cacheMaxAge || 86400; // 24 hours

  return `/**
 * YourTM CDN Worker
 *
 * Serves tag bundles from Cloudflare KV with caching and CORS support.
 * Container: ${context.containerId}
 *
 * Auto-generated by ytm deploy init
 */

const CORS_ORIGINS = ${JSON.stringify(corsOrigins)};
const CACHE_MAX_AGE = ${cacheMaxAge};
const KV_BINDING = '${context.kvNamespaceBinding}';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // Route: /v/{version}/{filename}
      // Route: /latest/{filename}
      // Route: /{containerId}.js (main bundle)

      let key;
      let filename;

      if (path.startsWith('/v/')) {
        // Versioned bundle: /v/20240315.1423/core.js
        const parts = path.slice(3).split('/');
        const version = parts[0];
        filename = parts.slice(1).join('/');
        key = \`bundles/\${version}/\${filename}\`;
      } else if (path.startsWith('/latest/')) {
        // Latest bundle: /latest/core.js
        filename = path.slice(8);
        const latestVersion = await env[KV_BINDING].get('latest');
        if (!latestVersion) {
          return new Response('No published version found', { status: 404 });
        }
        key = \`bundles/\${latestVersion}/\${filename}\`;
      } else if (path.endsWith('.js')) {
        // Main container bundle: /YTM-XXX.js
        filename = path.slice(1);
        const latestVersion = await env[KV_BINDING].get('latest');
        if (!latestVersion) {
          return new Response('No published version found', { status: 404 });
        }
        // Default to core.js for container requests
        key = \`bundles/\${latestVersion}/core.js\`;
      } else if (path === '/versions' || path === '/versions/') {
        // List available versions
        const versionsJson = await env[KV_BINDING].get('versions');
        return jsonResponse(JSON.parse(versionsJson || '{"versions":[]}'), request);
      } else if (path === '/health' || path === '/health/') {
        // Health check
        return jsonResponse({ status: 'ok', container: '${context.containerId}' }, request);
      } else {
        return new Response('Not found', { status: 404 });
      }

      // Fetch from KV
      const content = await env[KV_BINDING].get(key);
      if (!content) {
        return new Response(\`Bundle not found: \${key}\`, { status: 404 });
      }

      // Determine content type
      const contentType = filename.endsWith('.js')
        ? 'application/javascript; charset=utf-8'
        : filename.endsWith('.json')
        ? 'application/json; charset=utf-8'
        : 'text/plain; charset=utf-8';

      // Return with caching headers
      return new Response(content, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': \`public, max-age=\${CACHE_MAX_AGE}, s-maxage=\${CACHE_MAX_AGE}\`,
          'X-YTM-Version': key.split('/')[1] || 'unknown',
          ...getCORSHeaders(request),
        },
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response('Internal server error', { status: 500 });
    }
  },
};

function handleCORS(request) {
  return new Response(null, {
    status: 204,
    headers: {
      ...getCORSHeaders(request),
      'Access-Control-Max-Age': '86400',
    },
  });
}

function getCORSHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  const allowedOrigin = CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)
    ? origin
    : CORS_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, request) {
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...getCORSHeaders(request),
    },
  });
}
`;
}

/**
 * Generate a version string from current timestamp
 */
export function generateVersion(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  return `${year}${month}${day}.${hours}${minutes}`;
}

/**
 * Generate a content hash for integrity verification
 */
export function generateContentHash(content: string): string {
  // Simple hash function - in production you might want crypto.subtle
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Generate an API-only Worker script (for R2 mode)
 *
 * This worker only handles:
 * - Telemetry endpoints
 * - Preview mode
 * - Health checks
 *
 * Static bundles are served directly from R2 CDN.
 */
export function generateApiWorkerScript(context: {
  containerId: string;
  r2BucketUrl: string;
  corsOrigins?: string[];
}): string {
  const corsOrigins = context.corsOrigins || ['*'];

  return `/**
 * YourTM API Worker
 *
 * Handles API endpoints only - telemetry, preview mode, health checks.
 * Static bundles are served from R2 CDN: ${context.r2BucketUrl}
 *
 * Container: ${context.containerId}
 * Auto-generated by ytm deploy init
 */

const CORS_ORIGINS = ${JSON.stringify(corsOrigins)};
const R2_BUCKET_URL = '${context.r2BucketUrl}';
const CONTAINER_ID = '${context.containerId}';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    try {
      // Health check
      if (path === '/health' || path === '/_ytm/health') {
        return jsonResponse({
          status: 'ok',
          container: CONTAINER_ID,
          mode: 'r2',
          cdnUrl: R2_BUCKET_URL,
        }, request);
      }

      // Telemetry endpoint
      if (path === '/_ytm/telemetry' && request.method === 'POST') {
        return handleTelemetry(request, env, ctx);
      }

      // Preview mode endpoint
      if (path === '/_ytm/preview') {
        return handlePreview(request, url, env);
      }

      // Redirect bundle requests to R2 CDN
      if (path.endsWith('.js') || path.startsWith('/v/') || path.startsWith('/latest/')) {
        const cdnUrl = R2_BUCKET_URL + path;
        return Response.redirect(cdnUrl, 302);
      }

      return new Response('Not found', { status: 404 });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response('Internal server error', { status: 500 });
    }
  },
};

async function handleTelemetry(request, env, ctx) {
  try {
    const data = await request.json();

    // Log telemetry (could be extended to store in Analytics Engine, etc.)
    console.log('Telemetry:', JSON.stringify(data));

    // Fire-and-forget to not block the response
    return jsonResponse({ success: true }, request);
  } catch (error) {
    return jsonResponse({ success: false, error: 'Invalid telemetry data' }, request, 400);
  }
}

async function handlePreview(request, url, env) {
  const previewId = url.searchParams.get('id');

  if (!previewId) {
    return jsonResponse({ error: 'Missing preview ID' }, request, 400);
  }

  // In a full implementation, this would:
  // 1. Validate the preview ID
  // 2. Return preview-specific configuration
  // 3. Enable debug mode for the session

  return jsonResponse({
    previewId,
    container: CONTAINER_ID,
    cdnUrl: R2_BUCKET_URL,
    debug: true,
  }, request);
}

function handleCORS(request) {
  return new Response(null, {
    status: 204,
    headers: {
      ...getCORSHeaders(request),
      'Access-Control-Max-Age': '86400',
    },
  });
}

function getCORSHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  const allowedOrigin = CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)
    ? origin
    : CORS_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, request, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...getCORSHeaders(request),
    },
  });
}
`;
}
