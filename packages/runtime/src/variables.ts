/**
 * YourTM Runtime Variables
 * Variable resolution and caching
 */

import type { VariableDefinition, VariableType } from '@yourtm/core';

/**
 * Resolve a variable definition to its actual value
 */
export async function resolveVariable(
  def: VariableDefinition,
  allVariables: Map<string, VariableDefinition>,
  resolved: Record<string, unknown>
): Promise<unknown> {
  // If already resolved, return cached value
  if (def.name in resolved) {
    return resolved[def.name];
  }

  const value = await resolveByType(def, allVariables, resolved);
  resolved[def.name] = value;
  return value;
}

/**
 * Resolve variable based on its type
 */
async function resolveByType(
  def: VariableDefinition,
  allVariables: Map<string, VariableDefinition>,
  resolved: Record<string, unknown>
): Promise<unknown> {
  const config = def.config || {};

  switch (def.type) {
    case 'dataLayer':
      return getDataLayerValue(config.key as string, config.version as number | undefined);

    case 'cookie':
      return getCookieValue(config.name as string);

    case 'localStorage':
      return getLocalStorageValue(config.key as string);

    case 'sessionStorage':
      return getSessionStorageValue(config.key as string);

    case 'url':
      return getUrlValue(config.component as string, config.key as string | undefined);

    case 'domElement':
      return getDomElementValue(
        config.selector as string,
        config.attribute as string | undefined
      );

    case 'javascript':
      return evaluateJavaScript(config.code as string);

    case 'constant':
      return config.value;

    case 'computed':
      if (typeof def.resolve === 'function') {
        const ctx = {
          variables: resolved,
          dataLayer: getDataLayer(),
          url: new URL(location.href),
        };
        return def.resolve(ctx);
      }
      return undefined;

    case 'firstPartyCookie':
      return getCookieValue(config.name as string);

    case 'custom':
      if (typeof def.resolve === 'function') {
        const ctx = {
          variables: resolved,
          dataLayer: getDataLayer(),
          url: new URL(location.href),
        };
        return def.resolve(ctx);
      }
      return undefined;

    default:
      return undefined;
  }
}

/**
 * Get value from dataLayer
 */
function getDataLayerValue(key: string, version?: number): unknown {
  const dl = getDataLayer();

  if (version === 2) {
    // GTM v2 style - search through array for most recent value
    for (let i = dl.length - 1; i >= 0; i--) {
      const item = dl[i];
      if (item && typeof item === 'object' && key in item) {
        return (item as Record<string, unknown>)[key];
      }
    }
    return undefined;
  }

  // Simple key access with dot notation support
  return getNestedValue(dl, key);
}

/**
 * Get dataLayer array
 */
function getDataLayer(): unknown[] {
  return (window as unknown as { dataLayer?: unknown[] }).dataLayer || [];
}

/**
 * Get cookie value by name
 */
function getCookieValue(name: string): string | undefined {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : undefined;
}

/**
 * Get localStorage value
 */
function getLocalStorageValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Get sessionStorage value
 */
function getSessionStorageValue(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Get URL component value
 */
function getUrlValue(component: string, key?: string): string | null {
  const url = new URL(location.href);

  switch (component) {
    case 'href':
      return url.href;
    case 'protocol':
      return url.protocol.replace(':', '');
    case 'host':
      return url.host;
    case 'hostname':
      return url.hostname;
    case 'port':
      return url.port;
    case 'pathname':
    case 'path':
      return url.pathname;
    case 'search':
    case 'query':
      return key ? url.searchParams.get(key) : url.search;
    case 'hash':
    case 'fragment':
      return url.hash.replace('#', '');
    case 'origin':
      return url.origin;
    default:
      return null;
  }
}

/**
 * Get DOM element value
 */
function getDomElementValue(selector: string, attribute?: string): string | null {
  try {
    const el = document.querySelector(selector);
    if (!el) return null;

    if (attribute) {
      return el.getAttribute(attribute);
    }

    return el.textContent?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Evaluate JavaScript code
 */
function evaluateJavaScript(code: string): unknown {
  try {
    // Create a function and execute it
    const fn = new Function('return ' + code);
    return fn();
  } catch {
    return undefined;
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}
