/**
 * YourTM Runtime Variables
 * Variable resolution and caching
 */

import type { VariableDefinition, VariableType } from '@yourtm/core';
import { get as dlGet } from './dataLayer';
import { withBuiltins } from './builtins';

/**
 * Resolve a variable definition to its actual value
 */
export async function resolveVariable(
  def: VariableDefinition,
  allVariables: Map<string, VariableDefinition>,
  resolved: Record<string, unknown>
): Promise<unknown> {
  // Cache under the same key callers look the variable up by — its id, with
  // the display name only as a fallback. Caching by name while core.ts stored
  // by id meant the cache never hit and every variable resolved twice.
  const key = (def as unknown as { id?: string }).id || def.name;
  if (key in resolved) {
    return resolved[key];
  }

  const value = await resolveByType(def, allVariables, resolved);
  resolved[key] = value;
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
  /*
   * Container assets are flat.
   *
   * `defineDataLayerVariable({ path: 'sales_cycle' })` is what authors and the
   * GTM importer both write, and the build ships that object verbatim — there
   * is no `config` wrapper anywhere in a real container. This resolver read
   * `def.config` exclusively, so every dataLayer, cookie and JavaScript
   * variable resolved to undefined, and `getDataLayerValue(undefined)` threw on
   * `path.split`. `config` is still consulted, second, for nested definitions.
   */
  const own = def as unknown as Record<string, unknown>;
  const config = (def.config || {}) as Record<string, unknown>;
  const field = (...names: string[]): unknown => {
    for (const n of names) {
      if (own[n] !== undefined) return own[n];
      if (config[n] !== undefined) return config[n];
    }
    return undefined;
  };

  /** Call a user-supplied resolver with the same context shape tags get. */
  const runResolve = (): unknown => {
    const fn = field('resolve');
    if (typeof fn !== 'function') return undefined;
    return (fn as (ctx: unknown) => unknown)({
      // Same view of variables a tag gets, built-ins included — imported
      // custom JS reads {{Page URL}} as ctx.variables['page-url'].
      variables: withBuiltins(resolved),
      dataLayer: getDataLayer(),
      url: new URL(location.href),
    });
  };

  switch (def.type) {
    case 'dataLayer':
      return getDataLayerValue(
        field('path', 'key', 'name') as string,
        field('version', 'dataLayerVersion') as number | undefined
      );

    case 'cookie':
    case 'firstPartyCookie':
      return getCookieValue(field('cookieName', 'name') as string);

    case 'localStorage':
      return getLocalStorageValue(field('key', 'name') as string);

    case 'sessionStorage':
      return getSessionStorageValue(field('key', 'name') as string);

    case 'url':
      return getUrlValue(
        field('component') as string,
        field('key', 'queryKey') as string | undefined
      );

    case 'domElement':
      return getDomElementValue(
        field('selector') as string,
        field('attribute') as string | undefined
      );

    // The importer emits a `resolve` function; hand-authored containers have
    // historically used a `code` string. Both are in the wild.
    case 'javascript':
      return typeof field('resolve') === 'function'
        ? runResolve()
        : evaluateJavaScript(field('code') as string);

    case 'constant':
      return field('value');

    case 'computed':
    case 'custom':
      return runResolve();

    default:
      return runResolve();
  }
}

/**
 * Get value from dataLayer
 */
function getDataLayerValue(key: string, version?: number): unknown {
  // A variable with no key is a broken definition, not a reason to throw
  // inside every tag execution on the page.
  if (!key) return undefined;
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

  // Read the merged state, not the raw array. `dataLayer` on window is an
  // append-only log of pushes, so a dot-path against it never matches a key a
  // page actually pushed — the store dataLayer.ts maintains is what conditions
  // already resolve against, and variables should agree with them.
  return dlGet(key);
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
