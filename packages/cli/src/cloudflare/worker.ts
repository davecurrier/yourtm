/**
 * YourTM Edge Worker (Standalone)
 *
 * This is a standalone worker file that can be deployed directly to Cloudflare
 * for users who want to customize the worker behavior.
 *
 * Deploy with:
 *   wrangler deploy worker.ts
 *
 * Or use the CLI:
 *   ytm deploy --worker
 *
 * Note: This file is designed to be deployed to Cloudflare Workers.
 * The types below are simplified versions of Cloudflare's types.
 * When deploying, the actual Cloudflare types will be used.
 */

// ============================================================================
// Cloudflare Workers Types (simplified for standalone compilation)
// ============================================================================

// These types match Cloudflare Workers runtime types
// In actual deployment, @cloudflare/workers-types provides full definitions
interface KVNamespace {
  get(key: string, type?: 'text'): Promise<string | null>;
  get(key: string, type: 'json'): Promise<unknown | null>;
  put(key: string, value: string | ReadableStream | ArrayBuffer): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; expiration?: number }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface RequestCf {
  colo?: string;
  country?: string;
  city?: string;
  continent?: string;
  latitude?: string;
  longitude?: string;
  postalCode?: string;
  region?: string;
  regionCode?: string;
  timezone?: string;
}

// Extend the global Request type to include cf property
interface CfRequest extends Request {
  cf?: RequestCf;
}

// ============================================================================
// Types
// ============================================================================

interface Env {
  YTM_KV: KVNamespace;
  TELEMETRY_ENDPOINT?: string;
  DEBUG_SECRET?: string;
}

interface ContainerConfig {
  containerId: string;
  version: string;
  zones: Zone[];
  settings: Record<string, unknown>;
}

interface Zone {
  id: string;
  name: string;
  urlPatterns: string[];
  tags: string[];
}

interface TelemetryEvent {
  containerId: string;
  tagId: string;
  event: string;
  latency: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

// ============================================================================
// Configuration - Customize these values
// ============================================================================

const CONFIG = {
  // CORS allowed origins - use ['*'] to allow all, or specify domains
  corsOrigins: ['*'] as string[],

  // Enable telemetry collection
  enableTelemetry: true,

  // Default telemetry endpoint (can be overridden via env)
  telemetryEndpoint: 'https://telemetry.yourtm.io/collect',

  // Enable debug logging
  debugMode: false,

  // Cache durations
  cache: {
    runtime: 'public, max-age=31536000, immutable',  // 1 year
    chunks: 'public, max-age=31536000, immutable',   // 1 year
    config: 'public, max-age=60',                     // 1 minute
    none: 'no-cache, no-store, must-revalidate',
  },
};

// ============================================================================
// CORS Helpers
// ============================================================================

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '*';
  const allowedOrigin =
    CONFIG.corsOrigins.includes('*') || CONFIG.corsOrigins.includes(origin)
      ? origin
      : CONFIG.corsOrigins[0] || '*';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-YTM-Debug-Token, X-YTM-Preview',
    'Access-Control-Max-Age': '86400',
  };
}

function handleOptions(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

// ============================================================================
// Response Helpers
// ============================================================================

function jsResponse(
  script: string,
  request: Request,
  cacheControl = CONFIG.cache.runtime
): Response {
  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
      ...getCorsHeaders(request),
    },
  });
}

function jsonResponse(
  data: unknown,
  request: Request,
  status = 200,
  cacheControl = CONFIG.cache.config
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      ...getCorsHeaders(request),
    },
  });
}

function errorResponse(message: string, request: Request, status = 500): Response {
  return jsonResponse({ error: message }, request, status, CONFIG.cache.none);
}

// ============================================================================
// Preview Mode
// ============================================================================

function isPreviewMode(request: Request, env: Env): boolean {
  const url = new URL(request.url);
  const debugToken =
    request.headers.get('X-YTM-Debug-Token') || url.searchParams.get('_ytm_debug');

  if (!debugToken) return false;

  if (env.DEBUG_SECRET) {
    return debugToken === env.DEBUG_SECRET;
  }

  return CONFIG.debugMode;
}

function getVersionPrefix(request: Request, env: Env): string {
  const url = new URL(request.url);
  const previewVersion = url.searchParams.get('_ytm_version');

  if (previewVersion && isPreviewMode(request, env)) {
    return `preview/${previewVersion}`;
  }

  return 'latest';
}

// ============================================================================
// Zone Matching
// ============================================================================

function matchesZonePattern(url: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    try {
      const regex = new RegExp(
        '^' +
          pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.') +
          '$'
      );

      if (regex.test(url)) {
        return true;
      }
    } catch {
      if (CONFIG.debugMode) {
        console.error('Invalid zone pattern:', pattern);
      }
    }
  }
  return false;
}

function getMatchingZones(config: ContainerConfig, pageUrl: string): Zone[] {
  if (!config?.zones) return [];

  return config.zones.filter(
    (zone) => zone.urlPatterns && matchesZonePattern(pageUrl, zone.urlPatterns)
  );
}

// ============================================================================
// Route Handlers
// ============================================================================

function handleHealth(request: Request): Response {
  return jsonResponse(
    {
      status: 'ok',
      timestamp: Date.now(),
      version: '1.0.0',
    },
    request,
    200,
    CONFIG.cache.none
  );
}

async function handleRuntime(request: Request, env: Env): Promise<Response> {
  const version = getVersionPrefix(request, env);
  const key = `${version}/runtime.js`;

  try {
    const script = await env.YTM_KV.get(key, 'text');

    if (!script) {
      return errorResponse('Runtime not found', request, 404);
    }

    return jsResponse(script, request, CONFIG.cache.runtime);
  } catch (e) {
    if (CONFIG.debugMode) {
      console.error('Error fetching runtime:', e);
    }
    return errorResponse('Failed to fetch runtime', request, 500);
  }
}

async function handleZoneChunk(
  request: Request,
  env: Env,
  zoneId: string
): Promise<Response> {
  const version = getVersionPrefix(request, env);
  const key = `${version}/zones/${zoneId}.js`;

  try {
    const script = await env.YTM_KV.get(key, 'text');

    if (!script) {
      return errorResponse(`Zone '${zoneId}' not found`, request, 404);
    }

    return jsResponse(script, request, CONFIG.cache.chunks);
  } catch (e) {
    if (CONFIG.debugMode) {
      console.error('Error fetching zone chunk:', e);
    }
    return errorResponse('Failed to fetch zone chunk', request, 500);
  }
}

async function handleConfig(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pageUrl = url.searchParams.get('url') || url.searchParams.get('pageUrl');
  const version = getVersionPrefix(request, env);
  const key = `${version}/config.json`;

  try {
    const configStr = await env.YTM_KV.get(key, 'text');

    if (!configStr) {
      return errorResponse('Config not found', request, 404);
    }

    const config: ContainerConfig = JSON.parse(configStr);

    if (pageUrl) {
      const matchingZones = getMatchingZones(config, pageUrl);
      return jsonResponse(
        {
          containerId: config.containerId,
          version: config.version,
          zones: matchingZones.map((z) => ({
            id: z.id,
            name: z.name,
            tagCount: z.tags?.length || 0,
          })),
          preview: isPreviewMode(request, env),
        },
        request,
        200,
        CONFIG.cache.config
      );
    }

    if (isPreviewMode(request, env)) {
      return jsonResponse(config, request, 200, CONFIG.cache.none);
    }

    return jsonResponse(
      {
        containerId: config.containerId,
        version: config.version,
        zoneCount: config.zones?.length || 0,
      },
      request,
      200,
      CONFIG.cache.config
    );
  } catch (e) {
    if (CONFIG.debugMode) {
      console.error('Error fetching config:', e);
    }
    return errorResponse('Failed to fetch config', request, 500);
  }
}

async function handleTelemetry(
  request: CfRequest,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  if (!CONFIG.enableTelemetry) {
    return jsonResponse({ status: 'disabled' }, request, 200, CONFIG.cache.none);
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', request, 405);
  }

  try {
    const events = (await request.json()) as TelemetryEvent[];

    if (!Array.isArray(events)) {
      return errorResponse('Invalid telemetry format', request, 400);
    }

    const cf = request.cf;
    const enrichedEvents = events.map((event) => ({
      ...event,
      receivedAt: Date.now(),
      workerRegion: cf?.colo || 'unknown',
      clientIp: request.headers.get('CF-Connecting-IP') || 'unknown',
      userAgent: request.headers.get('User-Agent') || 'unknown',
    }));

    ctx.waitUntil(
      fetch(env.TELEMETRY_ENDPOINT || CONFIG.telemetryEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(enrichedEvents),
      }).catch((e) => {
        if (CONFIG.debugMode) {
          console.error('Telemetry forward failed:', e);
        }
      })
    );

    return jsonResponse(
      { status: 'ok', count: enrichedEvents.length },
      request,
      200,
      CONFIG.cache.none
    );
  } catch (e) {
    if (CONFIG.debugMode) {
      console.error('Telemetry error:', e);
    }
    return errorResponse('Invalid telemetry data', request, 400);
  }
}

async function handleLoader(request: Request, _env: Env): Promise<Response> {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const loaderScript = `
(function() {
  'use strict';

  // YourTM Loader
  var YTM_BASE = '${baseUrl}/_ytm';
  var w = window;
  var d = document;

  // Initialize data layer
  w.dataLayer = w.dataLayer || [];

  // Load runtime
  var s = d.createElement('script');
  s.src = YTM_BASE + '/runtime.js';
  s.async = true;
  s.onload = function() {
    if (w.YTM && w.YTM.init) {
      w.YTM.init({ base: YTM_BASE });
    }
  };
  d.head.appendChild(s);
})();
`.trim();

  return jsResponse(loaderScript, request, CONFIG.cache.runtime);
}

// ============================================================================
// Main Worker Export
// ============================================================================

export default {
  async fetch(
    request: CfRequest,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    try {
      // Health check
      if (path === '/_ytm/health') {
        return handleHealth(request);
      }

      // Loader script
      if (path === '/_ytm/loader.js') {
        return handleLoader(request, env);
      }

      // Runtime bundle
      if (path === '/_ytm/runtime.js') {
        return handleRuntime(request, env);
      }

      // Zone chunks
      const zoneMatch = path.match(/^\/_ytm\/chunks\/([a-zA-Z0-9_-]+)\.js$/);
      if (zoneMatch) {
        return handleZoneChunk(request, env, zoneMatch[1]);
      }

      // Config endpoint
      if (path === '/_ytm/config') {
        return handleConfig(request, env);
      }

      // Telemetry endpoint
      if (path === '/_ytm/telemetry') {
        return handleTelemetry(request, env, ctx);
      }

      // 404 for unknown /_ytm/ routes
      if (path.startsWith('/_ytm/')) {
        return errorResponse('Not found', request, 404);
      }

      // Pass through other requests
      return fetch(request);
    } catch (e) {
      if (CONFIG.debugMode) {
        console.error('Worker error:', e);
        const message = e instanceof Error ? e.message : 'Internal error';
        return errorResponse(message, request, 500);
      }
      return errorResponse('Internal error', request, 500);
    }
  },
};
