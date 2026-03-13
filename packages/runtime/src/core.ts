/**
 * YourTM Runtime Core
 * Tag registration, execution, zone detection, and performance tracking
 */

import { 
  type VariableDefinition, 
  type TelemetryEvent, 
  TelemetryEventType, 
  Environment,
  type TagExecutionTelemetry,
  type ConsentCategory
} from '@yourtm/core';
import { getConsent, hasConsent, type ConsentState } from './consent';
import { resolveVariable } from './variables';

// Types
export interface TagConfig {
  id: string;
  name: string;
  code: (ctx: TagContext) => void | Promise<void>;
  triggers: string[];
  consent?: ConsentCategory[];
  priority?: number;
  zone?: string;
}

export interface TagContext {
  dataLayer: Record<string, unknown>;
  variables: Record<string, any>;
  event?: string;
  element?: Element | null;
  url: string;
  consent: ConsentState;
}

export interface ZoneConfig {
  id: string;
  patterns: (string | RegExp)[];
  tags: string[];
}

export interface RuntimeConfig {
  containerId: string;
  environment?: Environment;
  previewMode?: boolean;
  previewEndpoint?: string;
  debug?: boolean;
}

// Runtime state
const tags = new Map<string, TagConfig>();
const zones = new Map<string, ZoneConfig>();
const variables = new Map<string, VariableDefinition>();
const executed = new Set<string>();
const telemetry: TelemetryEvent[] = [];
const telemetryListeners = new Set<(e: TelemetryEvent) => void>();
let cfg: RuntimeConfig | null = null;

// Performance tracking
const now = typeof performance !== 'undefined' ? () => performance.now() : Date.now;

/**
 * Initialize the runtime
 */
export function init(c: RuntimeConfig): void {
  if (cfg) return;
  cfg = {
    environment: Environment.Production,
    ...c
  };
  
  if (cfg.debug) {
    console.log(`[YourTM] Initialized (Env: ${cfg.environment}, Preview: ${cfg.previewMode})`);
  }
}

/**
 * Register a telemetry listener
 */
export function onTelemetry(cb: (e: TelemetryEvent) => void): () => void {
  telemetryListeners.add(cb);
  return () => telemetryListeners.delete(cb);
}

/**
 * Internal helper to create a base telemetry event
 */
function createBaseEvent(type: TelemetryEventType): any {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    containerId: cfg?.containerId || 'unknown',
    timestamp: Date.now(),
    url: location.href,
    environment: cfg?.environment || Environment.Production,
  };
}

/**
 * Register a tag
 */
export function registerTag(tag: TagConfig): void {
  tags.set(tag.id, tag);
}

/**
 * Register multiple tags
 */
export function registerTags(list: TagConfig[]): void {
  for (const t of list) tags.set(t.id, t);
}

/**
 * Register a variable
 */
export function registerVariable(v: VariableDefinition): void {
  variables.set(v.name, v);
}

/**
 * Register multiple variables
 */
export function registerVariables(list: VariableDefinition[]): void {
  for (const v of list) variables.set(v.name, v);
}

/**
 * Register a zone
 */
export function registerZone(zone: ZoneConfig): void {
  zones.set(zone.id, zone);
}

/**
 * Detect which zone matches the current URL
 */
export function detectZone(url: string = location.href): ZoneConfig | null {
  for (const z of zones.values()) {
    for (const p of z.patterns) {
      if (typeof p === 'string') {
        if (new RegExp('^' + p.replace(/\*/g, '.*').replace(/\?/g, '.') + '$').test(url)) return z;
      } else if (p.test(url)) return z;
    }
  }
  return null;
}

/**
 * Load a chunk (for code splitting)
 */
export function loadChunk(id: string): Promise<void> {
  const s = document.createElement('script');
  s.src = `${getBaseUrl()}/chunks/${id}.js`;
  return new Promise((res, rej) => {
    s.onload = () => res();
    s.onerror = () => rej(new Error(`Chunk load failed: ${id}`));
    document.head.appendChild(s);
  });
}

/**
 * Execute a tag by ID
 */
export async function executeTag(
  tagId: string,
  ctx: Partial<TagContext> = {},
  triggerId: string = 'manual'
): Promise<TagExecutionTelemetry | null> {
  const tag = tags.get(tagId);
  if (!tag) return null;

  // Check consent
  if (tag.consent?.length && !tag.consent.every(hasConsent)) {
    const t = {
      ...createBaseEvent(TelemetryEventType.TagExecution),
      tagId,
      tagName: tag.name,
      triggerId,
      triggerName: triggerId,
      status: 'blocked',
      latency: 0,
      success: false,
      error: 'Consent required',
      zone: detectZone()?.id
    } as TagExecutionTelemetry;
    
    trackEvent(t);
    return t;
  }

  // Resolve variables for the tag context (Lazy resolution via Proxy)
  const tagVariables: Record<string, any> = {};
  const resolvePromises = Array.from(variables.values()).map(async (def) => {
    tagVariables[def.name] = await resolveVariable(def, variables, tagVariables);
  });
  await Promise.all(resolvePromises);

  const fullCtx: TagContext = {
    dataLayer: (window as unknown as { dataLayer: Record<string, unknown> }).dataLayer || {},
    variables: tagVariables,
    url: location.href,
    consent: getConsent(),
    ...ctx
  };

  const start = now();
  let success = true;
  let error: string | undefined;

  try {
    const result = tag.code(fullCtx);
    if (result instanceof Promise) {
      await Promise.race([result, new Promise<void>(r => setTimeout(r, 10000))]);
    }
  } catch (e) {
    success = false;
    error = e instanceof Error ? e.message : String(e);
  }

  const t: TagExecutionTelemetry = {
    ...createBaseEvent(TelemetryEventType.TagExecution),
    tagId,
    tagName: tag.name,
    triggerId,
    triggerName: triggerId,
    status: success ? 'fired' : 'error',
    latency: now() - start,
    success,
    error,
    zone: detectZone()?.id
  };

  executed.add(tagId);
  trackEvent(t);

  return t;
}

/**
 * Execute all tags for a trigger
 */
export async function executeTrigger(
  triggerId: string,
  ctx: Partial<TagContext> = {}
): Promise<TagExecutionTelemetry[]> {
  const zone = detectZone();
  const list = Array.from(tags.values())
    .filter(t => t.triggers.includes(triggerId) && (!zone || !t.zone || t.zone === zone.id))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const results = await Promise.all(list.map(t => executeTag(t.id, ctx, triggerId)));
  return results.filter((t): t is TagExecutionTelemetry => t !== null);
}

/**
 * Track an event locally and send to telemetry endpoint
 */
function trackEvent(e: TelemetryEvent): void {
  telemetry.push(e);
  
  // Notify listeners
  telemetryListeners.forEach(fn => fn(e));

  // Send to server in preview mode
  if (cfg?.previewMode && cfg.previewEndpoint) {
    sendTelemetry(e);
  }
  
  if (cfg?.debug) {
    const icon = e.type === TelemetryEventType.TagExecution && (e as TagExecutionTelemetry).success ? '✓' : '○';
    console.log(`[YourTM] ${icon} ${e.type}:`, e);
  }
}

/**
 * Send telemetry to preview endpoint
 */
function sendTelemetry(e: TelemetryEvent): void {
  if (!cfg?.previewEndpoint) return;
  const body = JSON.stringify(e);
  
  // Try Beacon API first for better performance on page exit
  if (navigator.sendBeacon) {
    navigator.sendBeacon(cfg.previewEndpoint, body);
  } else {
    fetch(cfg.previewEndpoint, { 
      method: 'POST', 
      body, 
      keepalive: true,
      headers: { 'Content-Type': 'application/json' }
    }).catch(() => {});
  }
}

/**
 * Get base URL for chunk loading
 */
function getBaseUrl(): string {
  const s = document.querySelector('script[src*="yourtm"]') as HTMLScriptElement | null;
  return s ? s.src.substring(0, s.src.lastIndexOf('/')) : '';
}

// Exports for inspection
export const getTags = () => tags;
export const getExecutedTags = () => executed;
export const getTelemetry = () => [...telemetry];
export const isInitialized = () => !!cfg;
export const getConfig = () => cfg;
export const reset = () => {
  tags.clear();
  zones.clear();
  executed.clear();
  telemetry.length = 0;
  cfg = null;
};
