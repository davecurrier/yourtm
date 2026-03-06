/**
 * YourTM Cloudflare Worker Template
 *
 * This module exports the worker code as a string template that can be
 * deployed to a user's Cloudflare account. The worker serves the YourTM
 * runtime and zone bundles from KV storage.
 */

/**
 * Generate the worker script with optional customization
 */
export function generateWorkerScript(options: {
  containerId: string;
  enableTelemetry?: boolean;
  telemetryEndpoint?: string;
  corsOrigins?: string[];
  debugMode?: boolean;
} = { containerId: '' }): string {
  const {
    containerId,
    enableTelemetry = true,
    telemetryEndpoint = 'https://telemetry.yourtm.io/collect',
    corsOrigins = ['*'],
    debugMode = false,
  } = options;

  return `
/**
 * YourTM Edge Worker
 * Container: ${containerId}
 * Generated: ${new Date().toISOString()}
 *
 * This worker serves YourTM tag manager bundles from Cloudflare KV.
 * Routes:
 *   /_ytm/runtime.js     - Main runtime bundle
 *   /_ytm/chunks/:zone   - Zone-specific chunks
 *   /_ytm/telemetry      - Telemetry collection endpoint
 *   /_ytm/health         - Health check
 *   /_ytm/config         - Container configuration (preview mode only)
 */

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {Object} Env
 * @property {KVNamespace} YTM_KV - KV namespace for bundle storage
 * @property {string} [TELEMETRY_ENDPOINT] - Optional custom telemetry endpoint
 * @property {string} [DEBUG_SECRET] - Secret for debug/preview mode
 */

/**
 * @typedef {Object} ContainerConfig
 * @property {string} containerId
 * @property {string} version
 * @property {Zone[]} zones
 * @property {Object} settings
 */

/**
 * @typedef {Object} Zone
 * @property {string} id
 * @property {string} name
 * @property {string[]} urlPatterns
 * @property {string[]} tags
 */

/**
 * @typedef {Object} TelemetryEvent
 * @property {string} containerId
 * @property {string} tagId
 * @property {string} event
 * @property {number} latency
 * @property {boolean} success
 * @property {string} [error]
 * @property {number} timestamp
 */

// ============================================================================
// Constants
// ============================================================================

const CORS_ORIGINS = ${JSON.stringify(corsOrigins)};
const ENABLE_TELEMETRY = ${enableTelemetry};
const TELEMETRY_ENDPOINT = '${telemetryEndpoint}';
const DEBUG_MODE = ${debugMode};

// Cache durations
const CACHE_RUNTIME = 'public, max-age=31536000, immutable'; // 1 year for versioned
const CACHE_CHUNKS = 'public, max-age=31536000, immutable';  // 1 year for versioned
const CACHE_CONFIG = 'public, max-age=60';                    // 1 minute for config
const CACHE_NONE = 'no-cache, no-store, must-revalidate';

// Content types
const CONTENT_JS = 'application/javascript; charset=utf-8';
const CONTENT_JSON = 'application/json; charset=utf-8';

// ============================================================================
// CORS Helpers
// ============================================================================

/**
 * Get CORS headers for the request origin
 * @param {Request} request
 * @returns {Object} CORS headers
 */
function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  const allowedOrigin = CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)
    ? origin
    : CORS_ORIGINS[0] || '*';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-YTM-Debug-Token, X-YTM-Preview',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Handle CORS preflight requests
 * @param {Request} request
 * @returns {Response}
 */
function handleOptions(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Create a JavaScript response with proper headers
 * @param {string} script
 * @param {Request} request
 * @param {string} cacheControl
 * @returns {Response}
 */
function jsResponse(script, request, cacheControl = CACHE_RUNTIME) {
  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': CONTENT_JS,
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
      ...getCorsHeaders(request),
    },
  });
}

/**
 * Create a JSON response with proper headers
 * @param {Object} data
 * @param {Request} request
 * @param {number} status
 * @param {string} cacheControl
 * @returns {Response}
 */
function jsonResponse(data, request, status = 200, cacheControl = CACHE_CONFIG) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': CONTENT_JSON,
      'Cache-Control': cacheControl,
      ...getCorsHeaders(request),
    },
  });
}

/**
 * Create an error response
 * @param {string} message
 * @param {Request} request
 * @param {number} status
 * @returns {Response}
 */
function errorResponse(message, request, status = 500) {
  return jsonResponse({ error: message }, request, status, CACHE_NONE);
}

// ============================================================================
// Preview Mode
// ============================================================================

/**
 * Check if request is in preview mode
 * @param {Request} request
 * @param {Env} env
 * @returns {boolean}
 */
function isPreviewMode(request, env) {
  const url = new URL(request.url);
  const debugToken = request.headers.get('X-YTM-Debug-Token') ||
                     url.searchParams.get('_ytm_debug');

  if (!debugToken) return false;

  // In production, validate against stored debug secret
  if (env.DEBUG_SECRET) {
    return debugToken === env.DEBUG_SECRET;
  }

  // In debug mode, accept any token
  return DEBUG_MODE;
}

/**
 * Get the version to serve (preview or latest)
 * @param {Request} request
 * @param {Env} env
 * @returns {string}
 */
function getVersionPrefix(request, env) {
  const url = new URL(request.url);
  const previewVersion = url.searchParams.get('_ytm_version');

  if (previewVersion && isPreviewMode(request, env)) {
    return \`preview/\${previewVersion}\`;
  }

  return 'latest';
}

// ============================================================================
// Zone Matching
// ============================================================================

/**
 * Match URL against zone patterns
 * @param {string} url
 * @param {string[]} patterns
 * @returns {boolean}
 */
function matchesZonePattern(url, patterns) {
  for (var i = 0; i < patterns.length; i++) {
    try {
      var pattern = patterns[i];
      // Convert glob pattern to regex by escaping special chars
      // and converting * to .* and ? to .
      var escaped = '';
      for (var j = 0; j < pattern.length; j++) {
        var c = pattern[j];
        if (c === '*') {
          escaped += '.*';
        } else if (c === '?') {
          escaped += '.';
        } else if ('.+^' + '$' + '{}()|[]\\\\'.indexOf(c) >= 0) {
          escaped += '\\\\' + c;
        } else {
          escaped += c;
        }
      }
      var regex = new RegExp('^' + escaped + '$');

      if (regex.test(url)) {
        return true;
      }
    } catch (e) {
      // Invalid pattern, skip
      if (DEBUG_MODE) {
        console.error('Invalid zone pattern:', patterns[i], e);
      }
    }
  }
  return false;
}

/**
 * Get zones that match the page URL
 * @param {ContainerConfig} config
 * @param {string} pageUrl
 * @returns {Zone[]}
 */
function getMatchingZones(config, pageUrl) {
  if (!config || !config.zones) return [];

  return config.zones.filter(zone =>
    zone.urlPatterns && matchesZonePattern(pageUrl, zone.urlPatterns)
  );
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Handle health check requests
 * @param {Request} request
 * @returns {Response}
 */
function handleHealth(request) {
  return jsonResponse({
    status: 'ok',
    timestamp: Date.now(),
    version: '1.0.0',
  }, request, 200, CACHE_NONE);
}

/**
 * Handle runtime.js requests
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function handleRuntime(request, env) {
  const version = getVersionPrefix(request, env);
  const key = \`\${version}/runtime.js\`;

  try {
    const script = await env.YTM_KV.get(key, 'text');

    if (!script) {
      return errorResponse('Runtime not found', request, 404);
    }

    return jsResponse(script, request, CACHE_RUNTIME);
  } catch (e) {
    if (DEBUG_MODE) {
      console.error('Error fetching runtime:', e);
    }
    return errorResponse('Failed to fetch runtime', request, 500);
  }
}

/**
 * Handle zone chunk requests
 * @param {Request} request
 * @param {Env} env
 * @param {string} zoneId
 * @returns {Promise<Response>}
 */
async function handleZoneChunk(request, env, zoneId) {
  const version = getVersionPrefix(request, env);
  const key = \`\${version}/zones/\${zoneId}.js\`;

  try {
    const script = await env.YTM_KV.get(key, 'text');

    if (!script) {
      return errorResponse(\`Zone '\${zoneId}' not found\`, request, 404);
    }

    return jsResponse(script, request, CACHE_CHUNKS);
  } catch (e) {
    if (DEBUG_MODE) {
      console.error('Error fetching zone chunk:', e);
    }
    return errorResponse('Failed to fetch zone chunk', request, 500);
  }
}

/**
 * Handle config requests (returns zones matching the page URL)
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function handleConfig(request, env) {
  const url = new URL(request.url);
  const pageUrl = url.searchParams.get('url') || url.searchParams.get('pageUrl');
  const version = getVersionPrefix(request, env);
  const key = \`\${version}/config.json\`;

  try {
    const configStr = await env.YTM_KV.get(key, 'text');

    if (!configStr) {
      return errorResponse('Config not found', request, 404);
    }

    const config = JSON.parse(configStr);

    // If page URL provided, filter zones
    if (pageUrl) {
      const matchingZones = getMatchingZones(config, pageUrl);
      return jsonResponse({
        containerId: config.containerId,
        version: config.version,
        zones: matchingZones.map(z => ({
          id: z.id,
          name: z.name,
          tagCount: z.tags?.length || 0,
        })),
        preview: isPreviewMode(request, env),
      }, request, 200, CACHE_CONFIG);
    }

    // Return full config in preview mode
    if (isPreviewMode(request, env)) {
      return jsonResponse(config, request, 200, CACHE_NONE);
    }

    // Return minimal config in production
    return jsonResponse({
      containerId: config.containerId,
      version: config.version,
      zoneCount: config.zones?.length || 0,
    }, request, 200, CACHE_CONFIG);
  } catch (e) {
    if (DEBUG_MODE) {
      console.error('Error fetching config:', e);
    }
    return errorResponse('Failed to fetch config', request, 500);
  }
}

/**
 * Handle telemetry POST requests
 * @param {Request} request
 * @param {Env} env
 * @param {ExecutionContext} ctx
 * @returns {Promise<Response>}
 */
async function handleTelemetry(request, env, ctx) {
  if (!ENABLE_TELEMETRY) {
    return jsonResponse({ status: 'disabled' }, request, 200, CACHE_NONE);
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', request, 405);
  }

  try {
    const events = await request.json();

    if (!Array.isArray(events)) {
      return errorResponse('Invalid telemetry format', request, 400);
    }

    // Validate and enrich events
    const enrichedEvents = events.map(event => ({
      ...event,
      receivedAt: Date.now(),
      workerRegion: request.cf?.colo || 'unknown',
      clientIp: request.headers.get('CF-Connecting-IP') || 'unknown',
      userAgent: request.headers.get('User-Agent') || 'unknown',
    }));

    // Forward to telemetry endpoint asynchronously
    ctx.waitUntil(
      fetch(env.TELEMETRY_ENDPOINT || TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(enrichedEvents),
      }).catch(e => {
        if (DEBUG_MODE) {
          console.error('Telemetry forward failed:', e);
        }
      })
    );

    return jsonResponse({ status: 'ok', count: enrichedEvents.length }, request, 200, CACHE_NONE);
  } catch (e) {
    if (DEBUG_MODE) {
      console.error('Telemetry error:', e);
    }
    return errorResponse('Invalid telemetry data', request, 400);
  }
}

/**
 * Handle loader.js requests - generates a lightweight loader script
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function handleLoader(request, env) {
  const url = new URL(request.url);
  const baseUrl = \`\${url.protocol}//\${url.host}\`;

  const loaderScript = \`
(function() {
  'use strict';

  // YourTM Loader
  var YTM_BASE = '\${baseUrl}/_ytm';
  var w = window;
  var d = document;

  // Initialize data layer
  w.dataLayer = w.dataLayer || [];

  // Load runtime
  var s = d.createElement('script');
  s.src = YTM_BASE + '/runtime.js';
  s.async = true;
  s.onload = function() {
    // Runtime will handle zone loading
    if (w.YTM && w.YTM.init) {
      w.YTM.init({ base: YTM_BASE });
    }
  };
  d.head.appendChild(s);
})();
\`.trim();

  return jsResponse(loaderScript, request, CACHE_RUNTIME);
}

// ============================================================================
// Main Worker
// ============================================================================

export default {
  /**
   * Main fetch handler
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // Route requests
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
      const zoneMatch = path.match(/^\\/_ytm\\/chunks\\/([a-zA-Z0-9_-]+)\\.js$/);
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

      // Pass through other requests (if this worker is a zone worker)
      return fetch(request);
    } catch (e) {
      if (DEBUG_MODE) {
        console.error('Worker error:', e);
        return errorResponse(e.message || 'Internal error', request, 500);
      }
      return errorResponse('Internal error', request, 500);
    }
  },
};
`.trim();
}

/**
 * Get the minified version of the worker script
 * In production, you might want to use a proper minifier
 */
export function generateMinifiedWorkerScript(options: Parameters<typeof generateWorkerScript>[0]): string {
  const script = generateWorkerScript(options);
  // Basic minification: remove comments and extra whitespace
  // For production, use terser or esbuild
  return script
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
    .replace(/\/\/.*$/gm, '')          // Remove line comments
    .replace(/\n\s*\n/g, '\n')         // Remove empty lines
    .trim();
}

export default generateWorkerScript;
