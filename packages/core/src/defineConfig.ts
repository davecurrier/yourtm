/**
 * @yourtm/core - Configuration Definition Helper
 *
 * Provides a type-safe helper function for defining the main yourtm.config.ts
 * configuration file with proper TypeScript inference and validation.
 */

import {
  Environment,
  ConsentCategory,
  type ConfigDefinition,
  type EnvironmentConfig,
  type ConsentConfig,
  type VendorLibrary,
  type BuildConfig,
  type PerformanceBudget,
} from './types.js';

/**
 * Input for config definition with cleaner interface.
 */
export interface DefineConfigInput {
  /**
   * YourTM container ID.
   * Format: YTM-XXXXXX (e.g., YTM-ATB6O9)
   */
  containerId: string;
  /**
   * Human-readable container name.
   * @example 'My E-commerce Store'
   */
  name?: string;
  /**
   * Container description.
   */
  description?: string;
  /**
   * Environment-specific configurations.
   * Configure different settings for development, staging, and production.
   */
  environments?: {
    development?: EnvironmentConfigInput;
    staging?: EnvironmentConfigInput;
    production?: EnvironmentConfigInput;
    preview?: EnvironmentConfigInput;
  };
  /**
   * Consent management configuration.
   * Configure GDPR/CCPA compliance and consent banners.
   */
  consent?: ConsentConfigInput;
  /**
   * Vendor libraries shared across tags.
   * Libraries are loaded once and reused by multiple tags.
   */
  vendors?: VendorLibraryInput[];
  /**
   * Build configuration.
   * Configure bundling, minification, and output.
   */
  build?: BuildConfigInput;
  /**
   * Performance budgets.
   * Set limits on bundle size, load time, and tag execution.
   */
  performance?: PerformanceBudgetInput;
  /**
   * Default settings for all tags.
   */
  defaults?: {
    /** Default consent requirements for new tags */
    consent?: ConsentCategory[];
    /** Default tag priority (0-100) */
    priority?: number;
    /** Default performance budget per tag (ms) */
    performanceBudget?: number;
  };
  /**
   * Preview mode configuration.
   * Configure how preview/testing mode works.
   */
  preview?: {
    /** Enable preview mode */
    enabled?: boolean;
    /** URL parameter name to activate preview */
    paramName?: string;
    /** Authentication token for preview access */
    token?: string;
  };
  /**
   * Telemetry/analytics configuration.
   * Configure how tag execution data is collected.
   */
  telemetry?: {
    /** Enable telemetry collection */
    enabled?: boolean;
    /** Endpoint for sending telemetry data */
    endpoint?: string;
    /** Sample rate (0-1, e.g., 0.1 = 10%) */
    sampleRate?: number;
    /** Include performance metrics */
    includePerformance?: boolean;
    /** Include error details */
    includeErrors?: boolean;
  };
}

/**
 * Environment-specific configuration input.
 */
export interface EnvironmentConfigInput {
  /**
   * Enable debug mode.
   * Adds verbose console logging and debugging tools.
   * @default true for development, false for production
   */
  debug?: boolean;
  /**
   * Enable preview mode features.
   * Allows testing changes without affecting production.
   */
  preview?: boolean;
  /**
   * Custom CDN URL for container delivery.
   * Useful for using your own CDN or custom domain.
   */
  cdnUrl?: string;
  /**
   * Custom API endpoint.
   * Override the default YourTM API endpoint.
   */
  apiUrl?: string;
  /**
   * Tags to enable/disable in this environment.
   * Useful for testing specific tags in development.
   */
  tags?: {
    /** Tag names to enable (overrides disabled state) */
    enable?: string[];
    /** Tag names to disable (overrides enabled state) */
    disable?: string[];
  };
  /**
   * Variables to override in this environment.
   * Useful for different tracking IDs per environment.
   */
  variables?: Record<string, unknown>;
}

/**
 * Consent configuration input.
 */
export interface ConsentConfigInput {
  /**
   * Enable consent management.
   * When enabled, tags will be blocked until consent is granted.
   * @default true
   */
  enabled?: boolean;
  /**
   * Default consent state for new users.
   * Categories granted by default (before explicit consent).
   * Note: Only Essential should be granted by default for GDPR compliance.
   * @default [ConsentCategory.Essential]
   */
  defaultConsent?: ConsentCategory[];
  /**
   * Categories that are always granted (cannot be denied).
   * Typically only Essential category.
   * @default [ConsentCategory.Essential]
   */
  alwaysGranted?: ConsentCategory[];
  /**
   * Regions that require explicit consent (e.g., GDPR countries).
   * Use ISO 3166-1 alpha-2 country codes.
   * @example ['DE', 'FR', 'IT', 'ES', 'GB']
   */
  requiredRegions?: string[];
  /**
   * Cookie name for storing consent preferences.
   * @default '_ytm_consent'
   */
  cookieName?: string;
  /**
   * Cookie expiration in days.
   * @default 365
   */
  cookieExpiration?: number;
  /**
   * Consent banner UI configuration.
   */
  banner?: {
    /** Banner position on page */
    position?: 'top' | 'bottom' | 'center' | 'bottom-left' | 'bottom-right';
    /** Color theme */
    theme?: 'light' | 'dark' | 'auto';
    /** Custom CSS styles */
    customStyles?: string;
    /** Banner title text */
    title?: string;
    /** Banner description/message */
    description?: string;
    /** Accept all button text */
    acceptAllText?: string;
    /** Reject all button text */
    rejectAllText?: string;
    /** Customize preferences button text */
    customizeText?: string;
    /** Link to privacy policy */
    privacyPolicyUrl?: string;
    /** Link to cookie policy */
    cookiePolicyUrl?: string;
    /** Show close button (accepts essential only) */
    showCloseButton?: boolean;
    /** Close banner when clicking outside */
    closeOnOutsideClick?: boolean;
  };
  /**
   * Auto-detect user's region for consent requirements.
   * Uses IP geolocation to determine applicable regulations.
   * @default true
   */
  autoDetectRegion?: boolean;
  /**
   * Consent renewal period in months.
   * After this period, users will be prompted to renew consent.
   * @default 13 (GDPR recommendation)
   */
  renewalPeriod?: number;
}

/**
 * Vendor library input.
 */
export interface VendorLibraryInput {
  /**
   * Unique identifier for the library.
   * Used to reference the library in tags.
   */
  name: string;
  /**
   * Library version.
   * Included in cache key for proper versioning.
   */
  version: string;
  /**
   * CDN URL for the library.
   */
  url: string;
  /**
   * Global variable name the library exposes.
   * Used to verify library is loaded.
   * @example 'jQuery' for jQuery, 'gtag' for Google Analytics
   */
  global?: string;
  /**
   * Subresource Integrity hash.
   * Ensures the library hasn't been tampered with.
   * @example 'sha384-...'
   */
  integrity?: string;
  /**
   * Load the library asynchronously.
   * @default true
   */
  async?: boolean;
  /**
   * Initialization function after library loads.
   * Configure the library with your settings.
   */
  init?: (context: { library: unknown; environment: Environment }) => void | Promise<void>;
}

/**
 * Build configuration input.
 */
export interface BuildConfigInput {
  /**
   * Output directory for built files.
   * @default 'dist'
   */
  outDir?: string;
  /**
   * Enable minification.
   * @default true for production, false for development
   */
  minify?: boolean;
  /**
   * Generate source maps.
   * @default true for development, false for production
   */
  sourcemap?: boolean;
  /**
   * Target ECMAScript version.
   * @default 'es2020'
   */
  target?: 'es2020' | 'es2021' | 'es2022' | 'esnext';
  /**
   * Enable tree-shaking to remove unused code.
   * @default true
   */
  treeshake?: boolean;
  /**
   * Dependencies that should not be bundled.
   * The runtime will expect these to be available globally.
   */
  external?: string[];
  /**
   * Enable code splitting for lazy loading.
   * @default true
   */
  splitting?: boolean;
  /**
   * Additional build plugins (Rollup-compatible).
   */
  plugins?: unknown[];
}

/**
 * Performance budget input.
 */
export interface PerformanceBudgetInput {
  /**
   * Maximum total bundle size in KB.
   * Includes all tags and runtime.
   * @default 100
   */
  maxBundleSize?: number;
  /**
   * Maximum total load time in milliseconds.
   * Time from script start to fully loaded.
   * @default 2000
   */
  maxLoadTime?: number;
  /**
   * Maximum execution time per tag in milliseconds.
   * Individual tag execution budget.
   * @default 50
   */
  maxTagExecutionTime?: number;
  /**
   * Maximum total number of tags.
   * Helps prevent container bloat.
   * @default 100
   */
  maxTags?: number;
  /**
   * Maximum tags per trigger.
   * Prevents trigger overload.
   * @default 20
   */
  maxTagsPerTrigger?: number;
  /**
   * Block deployments that exceed budget.
   * When true, builds fail if budgets are exceeded.
   * @default false
   */
  blockOnExceed?: boolean;
  /**
   * Alert threshold as percentage (0-1).
   * Send warnings when approaching budget.
   * @default 0.8 (80%)
   */
  alertThreshold?: number;
}

/**
 * Validates the configuration input.
 */
function validateConfig(input: DefineConfigInput): void {
  // Validate container ID format
  if (!input.containerId || typeof input.containerId !== 'string') {
    throw new Error('Container ID is required');
  }

  const containerIdPattern = /^YTM-[A-Z0-9]{6}$/;
  if (!containerIdPattern.test(input.containerId)) {
    throw new Error(
      `Invalid container ID "${input.containerId}". Format should be YTM-XXXXXX (e.g., YTM-ATB6O9)`
    );
  }

  // Validate performance budget values
  if (input.performance) {
    if (input.performance.maxBundleSize !== undefined && input.performance.maxBundleSize <= 0) {
      throw new Error('Performance budget maxBundleSize must be positive');
    }
    if (input.performance.maxLoadTime !== undefined && input.performance.maxLoadTime <= 0) {
      throw new Error('Performance budget maxLoadTime must be positive');
    }
    if (
      input.performance.alertThreshold !== undefined &&
      (input.performance.alertThreshold < 0 || input.performance.alertThreshold > 1)
    ) {
      throw new Error('Performance budget alertThreshold must be between 0 and 1');
    }
  }

  // Validate consent configuration
  if (input.consent?.renewalPeriod !== undefined && input.consent.renewalPeriod <= 0) {
    throw new Error('Consent renewal period must be positive');
  }

  // Validate telemetry sample rate
  if (
    input.telemetry?.sampleRate !== undefined &&
    (input.telemetry.sampleRate < 0 || input.telemetry.sampleRate > 1)
  ) {
    throw new Error('Telemetry sample rate must be between 0 and 1');
  }
}

/**
 * Creates a validated configuration definition for yourtm.config.ts.
 *
 * This is the main configuration file for your YourTM container.
 * It defines environments, consent settings, vendor libraries, and more.
 *
 * @param input - Configuration options
 * @returns A validated ConfigDefinition object
 *
 * @example
 * // Basic configuration
 * export default defineConfig({
 *   containerId: 'YTM-ATB6O9',
 *   name: 'My Website',
 * });
 *
 * @example
 * // Full configuration
 * export default defineConfig({
 *   containerId: 'YTM-ATB6O9',
 *   name: 'E-commerce Store',
 *   description: 'Tag manager for my online store',
 *
 *   environments: {
 *     development: {
 *       debug: true,
 *       variables: {
 *         'ga-id': 'G-DEV12345',
 *       },
 *     },
 *     staging: {
 *       debug: false,
 *       variables: {
 *         'ga-id': 'G-STG12345',
 *       },
 *     },
 *     production: {
 *       debug: false,
 *       variables: {
 *         'ga-id': 'G-PROD12345',
 *       },
 *     },
 *   },
 *
 *   consent: {
 *     enabled: true,
 *     defaultConsent: [ConsentCategory.Essential],
 *     requiredRegions: ['DE', 'FR', 'IT', 'ES', 'GB', 'AT', 'BE', 'NL'],
 *     banner: {
 *       position: 'bottom',
 *       theme: 'auto',
 *       title: 'We value your privacy',
 *       description: 'We use cookies to enhance your experience.',
 *       privacyPolicyUrl: '/privacy',
 *     },
 *   },
 *
 *   vendors: [
 *     {
 *       name: 'gtag',
 *       version: '4.0.0',
 *       url: 'https://www.googletagmanager.com/gtag/js',
 *       global: 'gtag',
 *       async: true,
 *     },
 *   ],
 *
 *   performance: {
 *     maxBundleSize: 100,
 *     maxLoadTime: 2000,
 *     maxTagExecutionTime: 50,
 *     blockOnExceed: false,
 *     alertThreshold: 0.8,
 *   },
 *
 *   defaults: {
 *     consent: [ConsentCategory.Analytics],
 *     priority: 50,
 *     performanceBudget: 50,
 *   },
 * });
 */
export function defineConfig(input: DefineConfigInput): ConfigDefinition {
  validateConfig(input);

  // Build environment configurations with defaults
  const environments: Partial<Record<Environment, EnvironmentConfig>> = {};

  if (input.environments?.development) {
    environments[Environment.Development] = {
      debug: input.environments.development.debug ?? true,
      preview: input.environments.development.preview,
      cdnUrl: input.environments.development.cdnUrl,
      apiUrl: input.environments.development.apiUrl,
      tags: input.environments.development.tags,
      variables: input.environments.development.variables,
    };
  } else {
    // Default development config
    environments[Environment.Development] = {
      debug: true,
    };
  }

  if (input.environments?.staging) {
    environments[Environment.Staging] = {
      debug: input.environments.staging.debug ?? false,
      preview: input.environments.staging.preview ?? true,
      cdnUrl: input.environments.staging.cdnUrl,
      apiUrl: input.environments.staging.apiUrl,
      tags: input.environments.staging.tags,
      variables: input.environments.staging.variables,
    };
  }

  if (input.environments?.production) {
    environments[Environment.Production] = {
      debug: input.environments.production.debug ?? false,
      preview: input.environments.production.preview ?? false,
      cdnUrl: input.environments.production.cdnUrl,
      apiUrl: input.environments.production.apiUrl,
      tags: input.environments.production.tags,
      variables: input.environments.production.variables,
    };
  } else {
    // Default production config
    environments[Environment.Production] = {
      debug: false,
      preview: false,
    };
  }

  if (input.environments?.preview) {
    environments[Environment.Preview] = {
      debug: input.environments.preview.debug ?? true,
      preview: true,
      cdnUrl: input.environments.preview.cdnUrl,
      apiUrl: input.environments.preview.apiUrl,
      tags: input.environments.preview.tags,
      variables: input.environments.preview.variables,
    };
  }

  // Build consent configuration
  const consent: ConsentConfig | undefined = input.consent
    ? {
        enabled: input.consent.enabled ?? true,
        defaultConsent: input.consent.defaultConsent ?? [ConsentCategory.Essential],
        alwaysGranted: input.consent.alwaysGranted ?? [ConsentCategory.Essential],
        requiredRegions: input.consent.requiredRegions ?? [],
        cookieName: input.consent.cookieName ?? '_ytm_consent',
        cookieExpiration: input.consent.cookieExpiration ?? 365,
        banner: input.consent.banner
          ? {
              position: input.consent.banner.position ?? 'bottom',
              theme: input.consent.banner.theme ?? 'auto',
              customStyles: input.consent.banner.customStyles,
              title: input.consent.banner.title,
              description: input.consent.banner.description,
              acceptAllText: input.consent.banner.acceptAllText ?? 'Accept All',
              rejectAllText: input.consent.banner.rejectAllText ?? 'Reject All',
              customizeText: input.consent.banner.customizeText ?? 'Customize',
              privacyPolicyUrl: input.consent.banner.privacyPolicyUrl,
              cookiePolicyUrl: input.consent.banner.cookiePolicyUrl,
              showCloseButton: input.consent.banner.showCloseButton ?? true,
              closeOnOutsideClick: input.consent.banner.closeOnOutsideClick ?? false,
            }
          : undefined,
        autoDetectRegion: input.consent.autoDetectRegion ?? true,
        renewalPeriod: input.consent.renewalPeriod ?? 13,
      }
    : undefined;

  // Build vendor configurations
  const vendors: VendorLibrary[] | undefined = input.vendors?.map((v) => ({
    name: v.name,
    version: v.version,
    url: v.url,
    global: v.global,
    integrity: v.integrity,
    async: v.async ?? true,
    init: v.init as VendorLibrary['init'],
  }));

  // Build configuration
  const build: BuildConfig | undefined = input.build
    ? {
        outDir: input.build.outDir ?? 'dist',
        minify: input.build.minify,
        sourcemap: input.build.sourcemap,
        target: input.build.target ?? 'es2020',
        treeshake: input.build.treeshake ?? true,
        external: input.build.external,
        splitting: input.build.splitting ?? true,
        plugins: input.build.plugins,
      }
    : undefined;

  // Performance budgets
  const performance: PerformanceBudget | undefined = input.performance
    ? {
        maxBundleSize: input.performance.maxBundleSize ?? 100,
        maxLoadTime: input.performance.maxLoadTime ?? 2000,
        maxTagExecutionTime: input.performance.maxTagExecutionTime ?? 50,
        maxTags: input.performance.maxTags ?? 100,
        maxTagsPerTrigger: input.performance.maxTagsPerTrigger ?? 20,
        blockOnExceed: input.performance.blockOnExceed ?? false,
        alertThreshold: input.performance.alertThreshold ?? 0.8,
      }
    : undefined;

  return {
    containerId: input.containerId,
    name: input.name,
    description: input.description,
    environments,
    consent,
    vendors,
    build,
    performance,
    defaults: input.defaults,
    preview: input.preview
      ? {
          enabled: input.preview.enabled ?? true,
          paramName: input.preview.paramName ?? '_ytm_preview',
          token: input.preview.token,
        }
      : undefined,
    telemetry: input.telemetry
      ? {
          enabled: input.telemetry.enabled ?? true,
          endpoint: input.telemetry.endpoint,
          sampleRate: input.telemetry.sampleRate ?? 1.0,
          includePerformance: input.telemetry.includePerformance ?? true,
          includeErrors: input.telemetry.includeErrors ?? true,
        }
      : undefined,
  };
}

/**
 * Type guard to check if a value is a valid ConfigDefinition.
 */
export function isConfigDefinition(value: unknown): value is ConfigDefinition {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const config = value as Record<string, unknown>;

  return (
    typeof config.containerId === 'string' &&
    typeof config.environments === 'object' &&
    config.environments !== null
  );
}

// ============================================================================
// Configuration Presets
// ============================================================================

/**
 * GDPR-compliant configuration preset for EU regions.
 */
export const gdprPreset: Partial<DefineConfigInput> = {
  consent: {
    enabled: true,
    defaultConsent: [ConsentCategory.Essential],
    alwaysGranted: [ConsentCategory.Essential],
    requiredRegions: [
      'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
      'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
      'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'IS', 'LI',
      'NO', 'CH',
    ],
    autoDetectRegion: true,
    renewalPeriod: 13,
    banner: {
      position: 'bottom',
      theme: 'auto',
      showCloseButton: false,
      closeOnOutsideClick: false,
    },
  },
};

/**
 * CCPA-compliant configuration preset for California.
 */
export const ccpaPreset: Partial<DefineConfigInput> = {
  consent: {
    enabled: true,
    defaultConsent: [ConsentCategory.Essential, ConsentCategory.Analytics],
    alwaysGranted: [ConsentCategory.Essential],
    requiredRegions: ['US-CA'],
    autoDetectRegion: true,
    banner: {
      position: 'bottom-right',
      theme: 'auto',
      title: 'Privacy Notice',
      description: 'We use cookies and similar technologies. You can opt out of the sale of your personal information.',
      acceptAllText: 'OK',
      rejectAllText: 'Do Not Sell My Info',
      showCloseButton: true,
    },
  },
};

/**
 * E-commerce optimized configuration preset.
 */
export const ecommercePreset: Partial<DefineConfigInput> = {
  performance: {
    maxBundleSize: 80,
    maxLoadTime: 1500,
    maxTagExecutionTime: 30,
    maxTags: 50,
    alertThreshold: 0.7,
  },
  defaults: {
    priority: 50,
    performanceBudget: 30,
  },
  telemetry: {
    enabled: true,
    sampleRate: 0.1,
    includePerformance: true,
    includeErrors: true,
  },
};

/**
 * Merges configuration presets with custom configuration.
 *
 * @example
 * export default defineConfig(
 *   mergePresets(gdprPreset, ecommercePreset, {
 *     containerId: 'YTM-ATB6O9',
 *     name: 'My EU Store',
 *   })
 * );
 */
export function mergePresets(
  ...configs: Partial<DefineConfigInput>[]
): DefineConfigInput {
  const merged: Partial<DefineConfigInput> = {};

  for (const config of configs) {
    // Shallow merge top-level properties
    Object.assign(merged, config);

    // Deep merge nested objects
    if (config.environments && merged.environments) {
      merged.environments = { ...merged.environments, ...config.environments };
    }
    if (config.consent && merged.consent) {
      merged.consent = { ...merged.consent, ...config.consent };
      if (config.consent.banner && merged.consent.banner) {
        merged.consent.banner = { ...merged.consent.banner, ...config.consent.banner };
      }
    }
    if (config.build && merged.build) {
      merged.build = { ...merged.build, ...config.build };
    }
    if (config.performance && merged.performance) {
      merged.performance = { ...merged.performance, ...config.performance };
    }
    if (config.defaults && merged.defaults) {
      merged.defaults = { ...merged.defaults, ...config.defaults };
    }
    if (config.preview && merged.preview) {
      merged.preview = { ...merged.preview, ...config.preview };
    }
    if (config.telemetry && merged.telemetry) {
      merged.telemetry = { ...merged.telemetry, ...config.telemetry };
    }
  }

  return merged as DefineConfigInput;
}
