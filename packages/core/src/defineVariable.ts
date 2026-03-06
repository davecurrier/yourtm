/**
 * @yourtm/core - Variable Definition Helpers
 *
 * Provides type-safe helper functions for defining variables with proper
 * TypeScript inference and validation for each variable type.
 */

import {
  VariableType,
  type VariableDefinition,
  type VariableContext,
  type URLVariableConfig,
  type DOMElementConfig,
} from './types.js';

/**
 * Base input for all variable types.
 */
interface BaseVariableInput<T> {
  /** Unique identifier for the variable */
  name: string;
  /** Human-readable description */
  description?: string;
  /**
   * Transform function applied to the raw value.
   * Useful for formatting, encoding, or sanitizing.
   */
  transform?: (value: unknown) => T;
  /**
   * Default value when variable is undefined.
   */
  default?: T;
  /**
   * Cache duration in milliseconds (0 = no cache).
   * @default 0
   */
  cacheDuration?: number;
  /**
   * Format string for output.
   * @default 'auto'
   */
  format?: 'string' | 'number' | 'boolean' | 'json' | 'auto';
}

/**
 * Validates common variable properties.
 */
function validateBaseVariable(input: BaseVariableInput<unknown>): void {
  if (!input.name || typeof input.name !== 'string') {
    throw new Error('Variable name is required and must be a string');
  }

  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new Error('Variable name cannot be empty');
  }
  if (!/^[a-zA-Z]/.test(trimmedName)) {
    throw new Error(`Variable name "${input.name}" must start with a letter`);
  }
}

// ============================================================================
// DataLayer Variable
// ============================================================================

/**
 * Input for dataLayer variable.
 */
export interface DataLayerVariableInput<T = unknown> extends BaseVariableInput<T> {
  /**
   * Path to value in dataLayer (dot notation).
   * @example 'ecommerce.purchase.transaction_id'
   * @example 'user.email'
   */
  path: string;
}

/**
 * Creates a variable that reads from the dataLayer.
 *
 * @example
 * // Get transaction ID
 * const transactionId = defineDataLayerVariable({
 *   name: 'transaction-id',
 *   path: 'ecommerce.purchase.transaction_id',
 * });
 *
 * @example
 * // Get user email with default
 * const userEmail = defineDataLayerVariable({
 *   name: 'user-email',
 *   path: 'user.email',
 *   default: 'anonymous',
 *   transform: (value) => String(value).toLowerCase(),
 * });
 */
export function defineDataLayerVariable<T = unknown>(
  input: DataLayerVariableInput<T>
): VariableDefinition<T> {
  validateBaseVariable(input);

  if (!input.path || typeof input.path !== 'string') {
    throw new Error('DataLayer variable requires a path');
  }

  return {
    name: input.name,
    description: input.description,
    type: VariableType.DataLayer,
    path: input.path,
    transform: input.transform,
    default: input.default,
    cacheDuration: input.cacheDuration ?? 0,
    format: input.format ?? 'auto',
  };
}

// ============================================================================
// Computed Variable
// ============================================================================

/**
 * Input for computed variable.
 */
export interface ComputedVariableInput<T = unknown> extends BaseVariableInput<T> {
  /**
   * Compute function to derive the value.
   * Has access to dataLayer, URL, and other variables.
   */
  compute: (context: VariableContext) => T | Promise<T>;
}

/**
 * Creates a variable with a computed value.
 *
 * @example
 * // Calculate total cart value
 * const cartTotal = defineComputedVariable({
 *   name: 'cart-total',
 *   compute: (ctx) => {
 *     const items = ctx.dataLayer.cart?.items || [];
 *     return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
 *   },
 * });
 *
 * @example
 * // Combine multiple variables
 * const fullName = defineComputedVariable({
 *   name: 'full-name',
 *   compute: (ctx) => {
 *     const first = ctx.variables.firstName || '';
 *     const last = ctx.variables.lastName || '';
 *     return `${first} ${last}`.trim();
 *   },
 * });
 */
export function defineComputedVariable<T = unknown>(
  input: ComputedVariableInput<T>
): VariableDefinition<T> {
  validateBaseVariable(input);

  if (!input.compute || typeof input.compute !== 'function') {
    throw new Error('Computed variable requires a compute function');
  }

  return {
    name: input.name,
    description: input.description,
    type: VariableType.Computed,
    compute: input.compute,
    transform: input.transform,
    default: input.default,
    cacheDuration: input.cacheDuration ?? 0,
    format: input.format ?? 'auto',
  };
}

// ============================================================================
// Cookie Variable
// ============================================================================

/**
 * Input for cookie variable.
 */
export interface CookieVariableInput<T = unknown> extends BaseVariableInput<T> {
  /**
   * Cookie name to read.
   */
  cookieName: string;
}

/**
 * Creates a variable that reads from a browser cookie.
 *
 * @example
 * // Read user ID from cookie
 * const userId = defineCookieVariable({
 *   name: 'user-id',
 *   cookieName: '_uid',
 * });
 *
 * @example
 * // Read and parse JSON cookie
 * const userPrefs = defineCookieVariable({
 *   name: 'user-preferences',
 *   cookieName: 'preferences',
 *   format: 'json',
 * });
 */
export function defineCookieVariable<T = unknown>(
  input: CookieVariableInput<T>
): VariableDefinition<T> {
  validateBaseVariable(input);

  if (!input.cookieName || typeof input.cookieName !== 'string') {
    throw new Error('Cookie variable requires a cookieName');
  }

  return {
    name: input.name,
    description: input.description,
    type: VariableType.Cookie,
    cookieName: input.cookieName,
    transform: input.transform,
    default: input.default,
    cacheDuration: input.cacheDuration ?? 0,
    format: input.format ?? 'auto',
  };
}

// ============================================================================
// URL Variable
// ============================================================================

/**
 * Input for URL variable.
 */
export interface URLVariableInput<T = unknown> extends BaseVariableInput<T> {
  /**
   * Part of URL to extract.
   */
  part: 'query' | 'path' | 'hash' | 'hostname' | 'pathname' | 'protocol' | 'port' | 'full';
  /**
   * Query parameter name (when part is 'query').
   */
  paramName?: string;
  /**
   * Path segment index (when part is 'path').
   * 0 = first segment, -1 = last segment
   */
  pathIndex?: number;
  /**
   * Regex pattern to extract value.
   * Use capturing groups to extract specific parts.
   */
  pattern?: string;
}

/**
 * Creates a variable that extracts data from the URL.
 *
 * @example
 * // Get UTM source parameter
 * const utmSource = defineURLVariable({
 *   name: 'utm-source',
 *   part: 'query',
 *   paramName: 'utm_source',
 * });
 *
 * @example
 * // Get product ID from path /products/123
 * const productId = defineURLVariable({
 *   name: 'product-id',
 *   part: 'path',
 *   pathIndex: 1, // Second segment (0-indexed)
 *   transform: (value) => parseInt(String(value), 10),
 * });
 *
 * @example
 * // Extract category with regex
 * const category = defineURLVariable({
 *   name: 'category',
 *   part: 'pathname',
 *   pattern: '/category/([^/]+)',
 * });
 */
export function defineURLVariable<T = unknown>(
  input: URLVariableInput<T>
): VariableDefinition<T> {
  validateBaseVariable(input);

  if (!input.part) {
    throw new Error('URL variable requires a part');
  }

  if (input.part === 'query' && !input.paramName && !input.pattern) {
    throw new Error('URL query variable requires paramName or pattern');
  }

  const urlConfig: URLVariableConfig = {
    part: input.part,
    paramName: input.paramName,
    pathIndex: input.pathIndex,
    pattern: input.pattern,
  };

  return {
    name: input.name,
    description: input.description,
    type: VariableType.URL,
    urlConfig,
    transform: input.transform,
    default: input.default,
    cacheDuration: input.cacheDuration ?? 0,
    format: input.format ?? 'auto',
  };
}

// ============================================================================
// LocalStorage Variable
// ============================================================================

/**
 * Input for localStorage variable.
 */
export interface LocalStorageVariableInput<T = unknown> extends BaseVariableInput<T> {
  /**
   * localStorage key to read.
   */
  key: string;
}

/**
 * Creates a variable that reads from localStorage.
 *
 * @example
 * // Read user preferences
 * const theme = defineLocalStorageVariable({
 *   name: 'theme-preference',
 *   key: 'user-theme',
 *   default: 'light',
 * });
 */
export function defineLocalStorageVariable<T = unknown>(
  input: LocalStorageVariableInput<T>
): VariableDefinition<T> {
  validateBaseVariable(input);

  if (!input.key || typeof input.key !== 'string') {
    throw new Error('LocalStorage variable requires a key');
  }

  return {
    name: input.name,
    description: input.description,
    type: VariableType.LocalStorage,
    storageKey: input.key,
    transform: input.transform,
    default: input.default,
    cacheDuration: input.cacheDuration ?? 0,
    format: input.format ?? 'auto',
  };
}

// ============================================================================
// SessionStorage Variable
// ============================================================================

/**
 * Input for sessionStorage variable.
 */
export interface SessionStorageVariableInput<T = unknown> extends BaseVariableInput<T> {
  /**
   * sessionStorage key to read.
   */
  key: string;
}

/**
 * Creates a variable that reads from sessionStorage.
 *
 * @example
 * // Read session-specific data
 * const sessionId = defineSessionStorageVariable({
 *   name: 'session-id',
 *   key: 'sid',
 * });
 */
export function defineSessionStorageVariable<T = unknown>(
  input: SessionStorageVariableInput<T>
): VariableDefinition<T> {
  validateBaseVariable(input);

  if (!input.key || typeof input.key !== 'string') {
    throw new Error('SessionStorage variable requires a key');
  }

  return {
    name: input.name,
    description: input.description,
    type: VariableType.SessionStorage,
    storageKey: input.key,
    transform: input.transform,
    default: input.default,
    cacheDuration: input.cacheDuration ?? 0,
    format: input.format ?? 'auto',
  };
}

// ============================================================================
// DOM Element Variable
// ============================================================================

/**
 * Input for DOM element variable.
 */
export interface DOMElementVariableInput<T = unknown> extends BaseVariableInput<T> {
  /**
   * CSS selector for the element.
   */
  selector: string;
  /**
   * What to extract from the element.
   * @default 'textContent'
   */
  extract?: 'textContent' | 'innerHTML' | 'outerHTML' | 'attribute';
  /**
   * Attribute name (when extract is 'attribute').
   */
  attributeName?: string;
}

/**
 * Creates a variable that reads from a DOM element.
 *
 * @example
 * // Get page title
 * const pageTitle = defineDOMElementVariable({
 *   name: 'page-title',
 *   selector: 'h1',
 *   extract: 'textContent',
 * });
 *
 * @example
 * // Get product price from data attribute
 * const price = defineDOMElementVariable({
 *   name: 'product-price',
 *   selector: '[data-product-price]',
 *   extract: 'attribute',
 *   attributeName: 'data-product-price',
 *   transform: (value) => parseFloat(String(value)),
 * });
 */
export function defineDOMElementVariable<T = unknown>(
  input: DOMElementVariableInput<T>
): VariableDefinition<T> {
  validateBaseVariable(input);

  if (!input.selector || typeof input.selector !== 'string') {
    throw new Error('DOM element variable requires a selector');
  }

  if (input.extract === 'attribute' && !input.attributeName) {
    throw new Error('DOM element attribute extraction requires attributeName');
  }

  const domConfig: DOMElementConfig = {
    selector: input.selector,
    extract: input.extract ?? 'textContent',
    attributeName: input.attributeName,
  };

  return {
    name: input.name,
    description: input.description,
    type: VariableType.DOMElement,
    domConfig,
    transform: input.transform,
    default: input.default,
    cacheDuration: input.cacheDuration ?? 0,
    format: input.format ?? 'auto',
  };
}

// ============================================================================
// JavaScript Variable
// ============================================================================

/**
 * Input for JavaScript variable.
 */
export interface JavaScriptVariableInput<T = unknown> extends BaseVariableInput<T> {
  /**
   * Path to the global variable (dot notation).
   * @example 'window.myApp.config.apiKey'
   */
  path: string;
}

/**
 * Creates a variable that reads from a JavaScript global variable.
 *
 * @example
 * // Read from global config
 * const apiKey = defineJavaScriptVariable({
 *   name: 'api-key',
 *   path: 'window.myApp.config.apiKey',
 * });
 */
export function defineJavaScriptVariable<T = unknown>(
  input: JavaScriptVariableInput<T>
): VariableDefinition<T> {
  validateBaseVariable(input);

  if (!input.path || typeof input.path !== 'string') {
    throw new Error('JavaScript variable requires a path');
  }

  return {
    name: input.name,
    description: input.description,
    type: VariableType.JavaScriptVariable,
    jsPath: input.path,
    transform: input.transform,
    default: input.default,
    cacheDuration: input.cacheDuration ?? 0,
    format: input.format ?? 'auto',
  };
}

// ============================================================================
// Constant Variable
// ============================================================================

/**
 * Input for constant variable.
 */
export interface ConstantVariableInput<T> extends Omit<BaseVariableInput<T>, 'default'> {
  /**
   * The constant value.
   */
  value: T;
}

/**
 * Creates a constant variable with a fixed value.
 *
 * @example
 * // Define environment
 * const environment = defineConstantVariable({
 *   name: 'environment',
 *   value: 'production',
 * });
 *
 * @example
 * // Define tracking ID
 * const trackingId = defineConstantVariable({
 *   name: 'tracking-id',
 *   value: 'UA-123456-1',
 * });
 */
export function defineConstantVariable<T>(
  input: ConstantVariableInput<T>
): VariableDefinition<T> {
  validateBaseVariable(input);

  if (input.value === undefined) {
    throw new Error('Constant variable requires a value');
  }

  return {
    name: input.name,
    description: input.description,
    type: VariableType.Constant,
    constantValue: input.value,
    transform: input.transform,
    cacheDuration: input.cacheDuration ?? 0,
    format: input.format ?? 'auto',
  };
}

// ============================================================================
// First-Party Cookie Variable
// ============================================================================

/**
 * Input for first-party cookie variable.
 * These are cookies set by YourTM for tracking purposes.
 */
export interface FirstPartyCookieVariableInput<T = unknown> extends BaseVariableInput<T> {
  /**
   * Cookie name (without prefix).
   * Will be automatically prefixed with _ytm_
   */
  cookieName: string;
}

/**
 * Creates a variable that reads from a first-party YourTM cookie.
 *
 * @example
 * // Read client ID
 * const clientId = defineFirstPartyCookieVariable({
 *   name: 'client-id',
 *   cookieName: 'cid', // Reads _ytm_cid
 * });
 */
export function defineFirstPartyCookieVariable<T = unknown>(
  input: FirstPartyCookieVariableInput<T>
): VariableDefinition<T> {
  validateBaseVariable(input);

  if (!input.cookieName || typeof input.cookieName !== 'string') {
    throw new Error('First-party cookie variable requires a cookieName');
  }

  return {
    name: input.name,
    description: input.description,
    type: VariableType.FirstPartyCookie,
    cookieName: `_ytm_${input.cookieName}`,
    transform: input.transform,
    default: input.default,
    cacheDuration: input.cacheDuration ?? 0,
    format: input.format ?? 'auto',
  };
}

// ============================================================================
// Custom Variable
// ============================================================================

/**
 * Input for custom variable.
 */
export interface CustomVariableInput<T = unknown> extends BaseVariableInput<T> {
  /**
   * Custom compute function.
   */
  compute: (context: VariableContext) => T | Promise<T>;
}

/**
 * Creates a custom variable with full control over computation.
 * Alias for defineComputedVariable for naming consistency.
 *
 * @example
 * // Complex custom logic
 * const complexVar = defineCustomVariable({
 *   name: 'complex-var',
 *   compute: async (ctx) => {
 *     // Fetch data, perform calculations, etc.
 *     const response = await fetch('/api/data');
 *     return response.json();
 *   },
 * });
 */
export function defineCustomVariable<T = unknown>(
  input: CustomVariableInput<T>
): VariableDefinition<T> {
  validateBaseVariable(input);

  if (!input.compute || typeof input.compute !== 'function') {
    throw new Error('Custom variable requires a compute function');
  }

  return {
    name: input.name,
    description: input.description,
    type: VariableType.Custom,
    compute: input.compute,
    transform: input.transform,
    default: input.default,
    cacheDuration: input.cacheDuration ?? 0,
    format: input.format ?? 'auto',
  };
}

// ============================================================================
// Generic Variable Helper
// ============================================================================

/**
 * Generic variable definition input (for advanced use cases).
 */
export interface GenericVariableInput<T = unknown> {
  /** Unique identifier for the variable */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Type of variable */
  type: VariableType;
  /** DataLayer path */
  path?: string;
  /** Compute function */
  compute?: (context: VariableContext) => T | Promise<T>;
  /** Transform function */
  transform?: (value: unknown) => T;
  /** Default value */
  default?: T;
  /** Cookie name */
  cookieName?: string;
  /** URL config */
  urlConfig?: URLVariableConfig;
  /** Storage key */
  storageKey?: string;
  /** DOM config */
  domConfig?: DOMElementConfig;
  /** JavaScript path */
  jsPath?: string;
  /** Constant value */
  constantValue?: T;
  /** Cache duration */
  cacheDuration?: number;
  /** Output format */
  format?: 'string' | 'number' | 'boolean' | 'json' | 'auto';
}

/**
 * Creates a variable definition with full type control.
 * Use this for advanced cases where specific variable helpers don't fit.
 *
 * @example
 * const variable = defineVariable({
 *   name: 'my-variable',
 *   type: VariableType.DataLayer,
 *   path: 'user.id',
 * });
 */
export function defineVariable<T = unknown>(
  input: GenericVariableInput<T>
): VariableDefinition<T> {
  validateBaseVariable(input);

  return {
    name: input.name,
    description: input.description,
    type: input.type,
    path: input.path,
    compute: input.compute,
    transform: input.transform,
    default: input.default,
    cookieName: input.cookieName,
    urlConfig: input.urlConfig,
    storageKey: input.storageKey,
    domConfig: input.domConfig,
    jsPath: input.jsPath,
    constantValue: input.constantValue,
    cacheDuration: input.cacheDuration ?? 0,
    format: input.format ?? 'auto',
  };
}

/**
 * Type guard to check if a value is a valid VariableDefinition.
 */
export function isVariableDefinition(value: unknown): value is VariableDefinition {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const variable = value as Record<string, unknown>;

  return (
    typeof variable.name === 'string' &&
    typeof variable.type === 'string' &&
    Object.values(VariableType).includes(variable.type as VariableType)
  );
}
