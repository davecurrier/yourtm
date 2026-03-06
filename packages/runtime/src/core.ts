/**
 * YourTM Runtime Core
 * Tag registration, execution, zone detection, and performance tracking
 */

import type { ConsentState, ConsentCategory, VariableDefinition } from '@yourtm/core';
import { getConsent, hasConsent } from './consent';
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

export interface Telemetry {
  tagId: string;
  timestamp: number;
  latency: number;
  success: boolean;
  error?: string;
  zone?: string;
}

export interface RuntimeConfig {
  containerId: string;
  previewMode?: boolean;
  previewEndpoint?: string;
  debug?: boolean;
}

// Runtime state
const tags = new Map<string, TagConfig>();
const zones = new Map<string, ZoneConfig>();
const variables = new Map<string, VariableDefinition>();
const executed = new Set<string>();
const telemetry: Telemetry[] = [];
let cfg: RuntimeConfig | null = null;

// Performance tracking
const now = typeof performance !== 'undefined' ? () => performance.now() : Date.now;

/**
 * Initialize the runtime
 */
export function init(c: RuntimeConfig): void {
  if (cfg) return;
  cfg = c;
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
  ctx: Partial<TagContext> = {}
): Promise<Telemetry | null> {
  const tag = tags.get(tagId);
  if (!tag) return null;

  // Check consent
  if (tag.consent?.length && !tag.consent.every(hasConsent)) return null;

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

  const t: Telemetry = {
    tagId,
    timestamp: Date.now(),
    latency: now() - start,
    success,
    error,
    zone: detectZone()?.id
  };

  executed.add(tagId);
  telemetry.push(t);

  if (cfg?.previewMode && cfg.previewEndpoint) {
    sendTelemetry(t);
  }

  return t;
}

/**
 * Execute all tags for a trigger
 */
export async function executeTrigger(
  triggerId: string,
  ctx: Partial<TagContext> = {}
): Promise<Telemetry[]> {
  const zone = detectZone();
  const list = Array.from(tags.values())
    .filter(t => t.triggers.includes(triggerId) && (!zone || !t.zone || t.zone === zone.id))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const results = await Promise.all(list.map(t => executeTag(t.id, ctx)));
  return results.filter((t): t is Telemetry => t !== null);
}

/**
 * Send telemetry to preview endpoint
 */
function sendTelemetry(t: Telemetry): void {
  if (!cfg?.previewEndpoint) return;
  const body = JSON.stringify({ type: 'tag_execution', containerId: cfg.containerId, ...t });
  navigator.sendBeacon?.(cfg.previewEndpoint, body) ||
    fetch(cfg.previewEndpoint, { method: 'POST', body, keepalive: true }).catch(() => {});
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
