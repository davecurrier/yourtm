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
  includeRUM?: boolean;
} = { containerId: '' }): string {
  const {
    containerId,
    enableTelemetry = true,
    telemetryEndpoint = 'https://telemetry.yourtm.io/collect',
    corsOrigins = ['*'],
    debugMode = false,
    includeRUM = true,
  } = options;

  let rumDoCode = '';
  if (includeRUM) {
    rumDoCode = `
/**
 * RUM Durable Object
 * Handles real-time telemetry streaming and aggregation
 */
export class RUMDurableObject {
  constructor(state, env) {
    this.state = state;
    this.sessions = new Set();
    this.events = [];
    this.tagStats = new Map();
    this.eventTimestamps = [];
    this.containerId = '${containerId}';

    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get('rum_state');
      if (stored) {
        this.events = stored.events || [];
        this.tagStats = new Map(stored.tagStats || []);
        this.containerId = stored.containerId || '${containerId}';
      }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sessions.add(server);
      server.addEventListener('message', (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.type === 'ping') server.send(JSON.stringify({ type: 'pong' }));
        } catch (e) {}
      });
      server.addEventListener('close', () => this.sessions.delete(server));
      server.addEventListener('error', () => this.sessions.delete(server));
      
      server.send(JSON.stringify({
        type: 'init',
        stats: this.calculateStats(),
        recentEvents: this.events.slice(-50),
      }));

      return new Response(null, { 
        status: 101, 
        webSocket: client,
        headers: getCorsHeaders(request)
      });
    }

    if (request.method === 'POST' && url.pathname === '/events') {
      const events = await request.json();
      const incoming = Array.isArray(events) ? events : [events];
      for (const event of incoming) {
        this.events.push(event);
        if (this.events.length > 1000) this.events.shift();
        this.updateTagStats(event);
        this.broadcast({ type: 'event', event });
      }
      if (this.events.length % 10 === 0) await this.persistState();
      this.broadcast({ type: 'stats', stats: this.calculateStats() });
      return new Response(JSON.stringify({ status: 'ok' }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'GET' && url.pathname === '/stats') {
      return new Response(JSON.stringify(this.calculateStats()), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('Not Found', { status: 404 });
  }

  updateTagStats(event) {
    const key = event.tagId;
    let stats = this.tagStats.get(key);
    if (!stats) {
      stats = { tagId: event.tagId, tagName: event.tagName || event.tagId, fireCount: 0, successCount: 0, errorCount: 0, totalLatency: 0, latencies: [], lastFired: 0 };
      this.tagStats.set(key, stats);
    }
    stats.fireCount++;
    if (event.success) stats.successCount++; else stats.errorCount++;
    stats.totalLatency += event.latency;
    stats.latencies.push(event.latency);
    if (stats.latencies.length > 500) stats.latencies.shift();
    stats.lastFired = event.timestamp;
  }

  calculateStats() {
    let totalEvents = 0, successCount = 0, allLatencies = [];
    const tags = [];
    for (const [, stats] of this.tagStats) {
      totalEvents += stats.fireCount;
      successCount += stats.successCount;
      allLatencies.push(...stats.latencies);
      tags.push({ ...stats });
    }
    const sorted = [...allLatencies].sort((a, b) => a - b);
    return {
      totalEvents,
      successRate: totalEvents > 0 ? (successCount / totalEvents) * 100 : 100,
      avgLatency: allLatencies.length > 0 ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length : 0,
      p95Latency: sorted[Math.floor(sorted.length * 0.95)] || 0,
      tags: tags.sort((a, b) => b.fireCount - a.fireCount).slice(0, 10),
      lastUpdated: Date.now()
    };
  }

  broadcast(message) {
    const json = JSON.stringify(message);
    for (const ws of this.sessions) {
      try { ws.send(json); } catch (e) { this.sessions.delete(ws); }
    }
  }

  async persistState() {
    await this.state.storage.put('rum_state', {
      events: this.events.slice(-1000),
      tagStats: Array.from(this.tagStats.entries()),
      containerId: this.containerId,
    });
  }
}
`;
  }

  return `
/**
 * YourTM Edge Worker
 * Container: ${containerId}
 * Generated: ${new Date().toISOString()}
 *
 * This worker serves YourTM tag manager bundles from Cloudflare KV.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {Object} Env
 * @property {KVNamespace} YTM_KV - KV namespace for bundle storage
 * @property {DurableObjectNamespace} [RUM_DO] - Durable Object for real-time monitoring
 * @property {string} [TELEMETRY_ENDPOINT] - Optional custom telemetry endpoint
 * @property {string} [DEBUG_SECRET] - Secret for debug/preview mode
 */

// ============================================================================
// Constants
// ============================================================================

const CONTAINER_ID = '${containerId}';
const CORS_ORIGINS = ${JSON.stringify(corsOrigins)};
const ENABLE_TELEMETRY = ${enableTelemetry};
const TELEMETRY_ENDPOINT = '${telemetryEndpoint}';
const DEBUG_MODE = ${debugMode};

// Cache durations
const CACHE_RUNTIME = 'public, max-age=31536000, immutable';
const CACHE_CHUNKS = 'public, max-age=31536000, immutable';
const CACHE_CONFIG = 'public, max-age=60';
const CACHE_NONE = 'no-cache, no-store, must-revalidate';

// Content types
const CONTENT_JS = 'application/javascript; charset=utf-8';
const CONTENT_JSON = 'application/json; charset=utf-8';

// ============================================================================
// CORS Helpers
// ============================================================================

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

function handleOptions(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

// ============================================================================
// Response Helpers
// ============================================================================

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

function errorResponse(message, request, status = 500) {
  return jsonResponse({ error: message }, request, status, CACHE_NONE);
}

// ============================================================================
// Preview Mode
// ============================================================================

function isPreviewMode(request, env) {
  const url = new URL(request.url);
  const debugToken = request.headers.get('X-YTM-Debug-Token') ||
                     url.searchParams.get('_ytm_debug');
  if (!debugToken) return false;
  if (env.DEBUG_SECRET) return debugToken === env.DEBUG_SECRET;
  return DEBUG_MODE;
}

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

function matchesZonePattern(url, patterns) {
  for (var i = 0; i < patterns.length; i++) {
    try {
      var pattern = patterns[i];
      var escaped = '';
      for (var j = 0; j < pattern.length; j++) {
        var c = pattern[j];
        if (c === '*') escaped += '.*';
        else if (c === '?') escaped += '.';
        else if ('.+^$(){}|[]\\\\'.indexOf(c) >= 0) escaped += '\\\\' + c;
        else escaped += c;
      }
      var regex = new RegExp('^' + escaped + '$');
      if (regex.test(url)) return true;
    } catch (e) {}
  }
  return false;
}

function getMatchingZones(config, pageUrl) {
  if (!config || !config.zones) return [];
  return config.zones.filter(zone =>
    zone.urlPatterns && matchesZonePattern(pageUrl, zone.urlPatterns)
  );
}

// ============================================================================
// Route Handlers
// ============================================================================

function handleHealth(request) {
  return jsonResponse({ status: 'ok', timestamp: Date.now(), container: CONTAINER_ID }, request, 200, CACHE_NONE);
}

async function handleRuntime(request, env) {
  const version = getVersionPrefix(request, env);
  const key = \`\${version}/runtime.js\`;
  try {
    const script = await env.YTM_KV.get(key, 'text');
    if (!script) return errorResponse('Runtime not found', request, 404);
    return jsResponse(script, request, CACHE_RUNTIME);
  } catch (e) {
    return errorResponse('Failed to fetch runtime', request, 500);
  }
}

async function handleZoneChunk(request, env, zoneId) {
  const version = getVersionPrefix(request, env);
  const key = \`\${version}/zones/\${zoneId}.js\`;
  try {
    const script = await env.YTM_KV.get(key, 'text');
    if (!script) return errorResponse(\`Zone '\${zoneId}' not found\`, request, 404);
    return jsResponse(script, request, CACHE_CHUNKS);
  } catch (e) {
    return errorResponse('Failed to fetch zone chunk', request, 500);
  }
}

async function handleConfig(request, env) {
  const url = new URL(request.url);
  const pageUrl = url.searchParams.get('url') || url.searchParams.get('pageUrl');
  const version = getVersionPrefix(request, env);
  const key = \`\${version}/config.json\`;

  try {
    const configStr = await env.YTM_KV.get(key, 'text');
    if (!configStr) return errorResponse('Config not found', request, 404);
    const config = JSON.parse(configStr);

    if (pageUrl) {
      const matchingZones = getMatchingZones(config, pageUrl);
      return jsonResponse({
        containerId: config.containerId,
        version: config.version,
        zones: matchingZones.map(z => ({ id: z.id, name: z.name, tagCount: z.tags?.length || 0 })),
        preview: isPreviewMode(request, env),
      }, request, 200, CACHE_CONFIG);
    }

    if (isPreviewMode(request, env)) return jsonResponse(config, request, 200, CACHE_NONE);
    return jsonResponse({ containerId: config.containerId, version: config.version }, request, 200, CACHE_CONFIG);
  } catch (e) {
    return errorResponse('Failed to fetch config', request, 500);
  }
}

async function handleTelemetry(request, env, ctx) {
  if (!ENABLE_TELEMETRY) return jsonResponse({ status: 'disabled' }, request, 200, CACHE_NONE);
  if (request.method !== 'POST') return errorResponse('Method not allowed', request, 405);

  try {
    const events = await request.json();
    const incoming = Array.isArray(events) ? events : [events];
    const enrichedEvents = incoming.map(event => ({
      ...event,
      receivedAt: Date.now(),
      workerRegion: request.cf?.colo || 'unknown',
      clientIp: request.headers.get('CF-Connecting-IP') || 'unknown',
    }));

    // Forward to Durable Object for real-time preview
    if (env.RUM_DO) {
      const doId = env.RUM_DO.idFromName(CONTAINER_ID);
      const obj = env.RUM_DO.get(doId);
      ctx.waitUntil(obj.fetch(new Request('https://do/events', {
        method: 'POST',
        body: JSON.stringify(enrichedEvents),
        headers: { 'Content-Type': 'application/json' }
      })).catch(() => {}));
    }

    // Forward to persistent storage
    ctx.waitUntil(fetch(env.TELEMETRY_ENDPOINT || TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enrichedEvents),
    }).catch(() => {}));

    return jsonResponse({ status: 'ok', count: enrichedEvents.length }, request, 200, CACHE_NONE);
  } catch (e) {
    return errorResponse('Invalid telemetry data', request, 400);
  }
}

async function handleLoader(request, env) {
  const url = new URL(request.url);
  const baseUrl = \`\${url.protocol}//\${url.host}\`;
  const loaderScript = \`
(function() {
  'use strict';
  var YTM_BASE = '\${baseUrl}/_ytm';
  var w = window, d = document;
  w.dataLayer = w.dataLayer || [];
  var s = d.createElement('script');
  s.src = YTM_BASE + '/runtime.js';
  s.async = true;
  d.head.appendChild(s);
})();
\`.trim();
  return jsResponse(loaderScript, request, CACHE_RUNTIME);
}

// ============================================================================
// Main Worker
// ============================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return handleOptions(request);

    try {
      if (path === '/_ytm/health') return handleHealth(request);
      if (path === '/_ytm/loader.js') return handleLoader(request, env);
      if (path === '/_ytm/runtime.js') return handleRuntime(request, env);
      
      const zoneMatch = path.match(/^\\/_ytm\\/chunks\\/([a-zA-Z0-9_-]+)\\.js$/);
      if (zoneMatch) return handleZoneChunk(request, env, zoneMatch[1]);

      if (path === '/_ytm/config') return handleConfig(request, env);
      if (path === '/_ytm/telemetry') return handleTelemetry(request, env, ctx);

      // Preview Stream (Durable Object)
      if (path === '/_ytm/preview/stream') {
        if (request.method !== 'GET') {
          return errorResponse('Method not allowed', request, 405);
        }
        if (!env.RUM_DO) return errorResponse('Durable Object not configured', request, 503);
        const doId = env.RUM_DO.idFromName(CONTAINER_ID);
        const obj = env.RUM_DO.get(doId);
        return obj.fetch(request);
      }

      if (path.startsWith('/_ytm/')) return errorResponse('Not found', request, 404);
      return fetch(request);
    } catch (e) {
      return errorResponse(e.message || 'Internal error', request, 500);
    }
  },
};

${rumDoCode}
`.trim();
}

/**
 * Get the minified version of the worker script
 */
export function generateMinifiedWorkerScript(options: Parameters<typeof generateWorkerScript>[0]): string {
  const script = generateWorkerScript(options);
  return script
    .replace(/\/\*[\s\S]*?\*\//g, '') 
    .replace(/\/\/.*$/gm, '')          
    .replace(/\n\s*\n/g, '\n')         
    .trim();
}

export default generateWorkerScript;
