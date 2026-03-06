/**
 * @yourtm/core - Tag Definition Helper
 *
 * Provides a type-safe helper function for defining tags with proper
 * TypeScript inference and validation.
 */

import {
  TagStatus,
  type TagDefinition,
  type TagSetupContext,
  type TagExecuteContext,
  type ConsentCategory,
} from './types.js';

/**
 * Input type for defineTag, allowing partial configuration with sensible defaults.
 * The setup function's return type is inferred and passed to execute.
 */
export interface DefineTagInput<TSetupResult = void> {
  /** Unique identifier for the tag */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Trigger names that fire this tag */
  triggers: string[];
  /**
   * Zone names where this tag should fire.
   * If empty or undefined, tag fires on all pages.
   */
  zones?: string[];
  /**
   * Consent categories required to fire this tag.
   * Tag is blocked until user grants consent for ALL listed categories.
   * @default [] (no consent required)
   */
  consent?: ConsentCategory[];
  /**
   * Async setup function that runs once before the tag first fires.
   * Use this to load external scripts or initialize libraries.
   * The return value is passed to execute() as setupResult.
   *
   * @example
   * setup: async ({ loadScript }) => {
   *   await loadScript('https://example.com/analytics.js');
   *   return { analytics: window.MyAnalytics };
   * }
   */
  setup?: (context: TagSetupContext) => Promise<TSetupResult> | TSetupResult;
  /**
   * Execute function that runs each time the tag fires.
   * This is where the actual tracking code runs.
   *
   * @example
   * execute: ({ setupResult, dataLayer, url }) => {
   *   setupResult.analytics.track('pageview', {
   *     page: url.pathname,
   *     title: dataLayer.page_title,
   *   });
   * }
   */
  execute: (context: TagExecuteContext<TSetupResult>) => void | Promise<void>;
  /**
   * Cleanup function called when tag is removed or page unloads.
   */
  teardown?: (setupResult: TSetupResult) => void;
  /**
   * Tag priority (0-100, higher = fires first).
   * @default 50
   */
  priority?: number;
  /**
   * Maximum times this tag can fire per page (0 = unlimited).
   * @default 0
   */
  maxFirings?: number;
  /**
   * Minimum delay between firings in milliseconds.
   * Useful for rate-limiting event tags.
   * @default 0
   */
  firingDelay?: number;
  /**
   * Whether tag is enabled.
   * @default true
   */
  enabled?: boolean;
  /**
   * Tag status.
   * @default TagStatus.Active
   */
  status?: TagStatus;
  /**
   * Vendor/platform identifier (e.g., 'google_analytics', 'meta_pixel').
   * Used for grouping and filtering in the UI.
   */
  vendor?: string;
  /**
   * Names of tags that must fire before this one.
   * Dependencies are resolved in order.
   */
  dependsOn?: string[];
  /**
   * Performance budget in milliseconds.
   * Tag execution is monitored and warnings are issued if exceeded.
   */
  performanceBudget?: number;
}

/**
 * Creates a type-safe tag definition with proper defaults.
 *
 * This helper function provides:
 * - Full TypeScript inference for setup/execute context
 * - Sensible default values for optional fields
 * - Compile-time validation of tag configuration
 *
 * @param input - Tag configuration object
 * @returns A validated TagDefinition object
 *
 * @example
 * // Simple tag without setup
 * export const myTag = defineTag({
 *   name: 'simple-analytics',
 *   triggers: ['pageview'],
 *   execute: ({ url, dataLayer }) => {
 *     console.log('Page viewed:', url.pathname);
 *   },
 * });
 *
 * @example
 * // Tag with async setup
 * export const ga4Tag = defineTag({
 *   name: 'ga4-config',
 *   triggers: ['pageview'],
 *   consent: [ConsentCategory.Analytics],
 *   setup: async ({ loadScript }) => {
 *     await loadScript('https://www.googletagmanager.com/gtag/js?id=G-XXXXX');
 *     window.dataLayer = window.dataLayer || [];
 *     function gtag(...args: any[]) { window.dataLayer.push(args); }
 *     gtag('js', new Date());
 *     return { gtag };
 *   },
 *   execute: ({ setupResult, url }) => {
 *     setupResult.gtag('config', 'G-XXXXX', {
 *       page_path: url.pathname,
 *     });
 *   },
 * });
 *
 * @example
 * // Tag with dependencies and zones
 * export const purchaseTag = defineTag({
 *   name: 'purchase-tracking',
 *   triggers: ['purchase-event'],
 *   zones: ['checkout'],
 *   consent: [ConsentCategory.Analytics, ConsentCategory.Marketing],
 *   dependsOn: ['ga4-config'],
 *   priority: 80,
 *   maxFirings: 1,
 *   execute: ({ dataLayer, log }) => {
 *     const transaction = dataLayer.ecommerce?.purchase;
 *     if (transaction) {
 *       log.info('Tracking purchase:', transaction.transaction_id);
 *       // Send to analytics...
 *     }
 *   },
 * });
 */
export function defineTag<TSetupResult = void>(
  input: DefineTagInput<TSetupResult>
): TagDefinition<TSetupResult> {
  // Validate required fields
  if (!input.name || typeof input.name !== 'string') {
    throw new Error('Tag name is required and must be a string');
  }

  if (!input.triggers || !Array.isArray(input.triggers) || input.triggers.length === 0) {
    throw new Error('Tag must have at least one trigger');
  }

  if (!input.execute || typeof input.execute !== 'function') {
    throw new Error('Tag must have an execute function');
  }

  // Validate name is not empty and starts with a letter
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new Error('Tag name cannot be empty');
  }
  if (!/^[a-zA-Z]/.test(trimmedName)) {
    throw new Error(`Tag name "${input.name}" must start with a letter`);
  }

  // Validate priority range
  if (input.priority !== undefined && (input.priority < 0 || input.priority > 100)) {
    throw new Error('Tag priority must be between 0 and 100');
  }

  // Build the tag definition with defaults
  const tag: TagDefinition<TSetupResult> = {
    name: input.name,
    description: input.description,
    triggers: input.triggers,
    zones: input.zones ?? [],
    consent: input.consent ?? [],
    setup: input.setup,
    execute: input.execute,
    teardown: input.teardown,
    priority: input.priority ?? 50,
    maxFirings: input.maxFirings ?? 0,
    firingDelay: input.firingDelay ?? 0,
    enabled: input.enabled ?? true,
    status: input.status ?? TagStatus.Active,
    vendor: input.vendor,
    dependsOn: input.dependsOn ?? [],
    performanceBudget: input.performanceBudget,
  };

  return tag;
}

/**
 * Type guard to check if a value is a valid TagDefinition.
 */
export function isTagDefinition(value: unknown): value is TagDefinition {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const tag = value as Record<string, unknown>;

  return (
    typeof tag.name === 'string' &&
    Array.isArray(tag.triggers) &&
    tag.triggers.length > 0 &&
    typeof tag.execute === 'function'
  );
}

/**
 * Helper to create a tag that only fires once per page.
 * Convenience wrapper around defineTag with maxFirings: 1.
 */
export function defineOnceTag<TSetupResult = void>(
  input: DefineTagInput<TSetupResult>
): TagDefinition<TSetupResult> {
  return defineTag({
    ...input,
    maxFirings: 1,
  });
}

/**
 * Helper to create a tag with async script loading.
 * Returns a Promise-based tag that resolves when the external script loads.
 */
export function defineAsyncTag<TSetupResult = void>(
  input: DefineTagInput<TSetupResult> & {
    /** Script URL to load during setup */
    scriptUrl: string;
    /** Script load options */
    scriptOptions?: {
      async?: boolean;
      defer?: boolean;
      integrity?: string;
      crossorigin?: 'anonymous' | 'use-credentials';
    };
  }
): TagDefinition<TSetupResult> {
  const { scriptUrl, scriptOptions, setup, ...rest } = input;

  return defineTag({
    ...rest,
    setup: async (context) => {
      // Load the external script first
      await context.loadScript(scriptUrl, scriptOptions);

      // Then call the user's setup if provided
      if (setup) {
        return setup(context);
      }

      return undefined as TSetupResult;
    },
  });
}
