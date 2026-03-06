/**
 * @yourtm/core - Zone Definition Helpers
 *
 * Provides type-safe helper functions for defining zones (URL pattern groups)
 * with proper TypeScript inference and validation.
 */

import type { ZoneDefinition, ZoneContext } from './types.js';

/**
 * Input for zone definition.
 */
export interface DefineZoneInput {
  /** Unique identifier for the zone */
  name: string;
  /** Human-readable description */
  description?: string;
  /**
   * URL patterns to match.
   * Supports glob patterns and regex.
   *
   * Pattern types:
   * - Glob: '/products/*', '/blog/**', '*.html'
   * - Regex: '/^\/products\/\d+$/' (wrapped in slashes)
   * - Negation: '!/admin/*' (exclude pattern)
   *
   * @example ['/products/*', '/cart', '!/admin/*']
   */
  patterns: string[];
  /**
   * Optional condition function for complex matching logic.
   * Return true if the URL should be in this zone.
   * This runs AFTER pattern matching succeeds.
   */
  condition?: (url: URL, context: ZoneContext) => boolean;
  /**
   * Zone priority (higher = first match wins).
   * @default 0
   */
  priority?: number;
  /**
   * Whether zone is enabled.
   * @default true
   */
  enabled?: boolean;
}

/**
 * Validates zone properties.
 */
function validateZone(input: DefineZoneInput): void {
  if (!input.name || typeof input.name !== 'string') {
    throw new Error('Zone name is required and must be a string');
  }

  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new Error('Zone name cannot be empty');
  }
  if (!/^[a-zA-Z]/.test(trimmedName)) {
    throw new Error(`Zone name "${input.name}" must start with a letter`);
  }

  if (!input.patterns || !Array.isArray(input.patterns) || input.patterns.length === 0) {
    throw new Error('Zone must have at least one pattern');
  }

  // Validate each pattern
  for (const pattern of input.patterns) {
    if (typeof pattern !== 'string' || pattern.trim() === '') {
      throw new Error('Zone patterns must be non-empty strings');
    }
  }
}

/**
 * Creates a zone definition for targeting tags to specific URL patterns.
 *
 * Zones allow you to group URLs together and apply tags only to matching pages.
 * Patterns support glob syntax, regex, and negation.
 *
 * @param input - Zone configuration object
 * @returns A validated ZoneDefinition object
 *
 * @example
 * // Simple zone for product pages
 * const productPages = defineZone({
 *   name: 'product-pages',
 *   patterns: ['/products/*', '/collections/*'],
 * });
 *
 * @example
 * // Zone with exclusions
 * const publicPages = defineZone({
 *   name: 'public-pages',
 *   patterns: ['/*', '!/admin/*', '!/api/*'],
 * });
 *
 * @example
 * // Zone with custom condition
 * const premiumContent = defineZone({
 *   name: 'premium-content',
 *   patterns: ['/content/*'],
 *   condition: (url, ctx) => {
 *     // Only match for logged-in premium users
 *     return ctx.device?.type === 'desktop';
 *   },
 * });
 *
 * @example
 * // Zone with regex pattern
 * const productDetailPages = defineZone({
 *   name: 'product-detail',
 *   description: 'Product detail pages with numeric IDs',
 *   patterns: ['/^\\/products\\/\\d+$/'],
 * });
 */
export function defineZone(input: DefineZoneInput): ZoneDefinition {
  validateZone(input);

  return {
    name: input.name,
    description: input.description,
    patterns: input.patterns,
    condition: input.condition,
    priority: input.priority ?? 0,
    enabled: input.enabled ?? true,
  };
}

/**
 * Type guard to check if a value is a valid ZoneDefinition.
 */
export function isZoneDefinition(value: unknown): value is ZoneDefinition {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const zone = value as Record<string, unknown>;

  return (
    typeof zone.name === 'string' &&
    Array.isArray(zone.patterns) &&
    zone.patterns.length > 0 &&
    zone.patterns.every((p) => typeof p === 'string')
  );
}

// ============================================================================
// Common Zone Presets
// ============================================================================

/**
 * Creates a zone for all pages.
 *
 * @example
 * const allPages = defineAllPagesZone('all-pages');
 */
export function defineAllPagesZone(
  name: string,
  options?: { excludePatterns?: string[]; description?: string }
): ZoneDefinition {
  const patterns = ['/**'];

  if (options?.excludePatterns) {
    patterns.push(...options.excludePatterns.map((p) => `!${p}`));
  }

  return defineZone({
    name,
    description: options?.description ?? 'All pages on the site',
    patterns,
  });
}

/**
 * Creates a zone for the homepage only.
 *
 * @example
 * const homepage = defineHomepageZone('homepage');
 */
export function defineHomepageZone(
  name: string,
  options?: { description?: string }
): ZoneDefinition {
  return defineZone({
    name,
    description: options?.description ?? 'Homepage only',
    patterns: ['/', '/index.html', '/index.htm'],
    priority: 10,
  });
}

/**
 * Creates a zone for checkout/cart pages.
 *
 * @example
 * const checkout = defineCheckoutZone('checkout');
 */
export function defineCheckoutZone(
  name: string,
  options?: {
    cartPatterns?: string[];
    checkoutPatterns?: string[];
    confirmationPatterns?: string[];
    description?: string;
  }
): ZoneDefinition {
  const defaultPatterns = [
    '/cart',
    '/cart/*',
    '/checkout',
    '/checkout/*',
    '/order/*',
    '/confirmation',
    '/thank-you',
    '/thankyou',
  ];

  const patterns = [
    ...(options?.cartPatterns ?? ['/cart', '/cart/*']),
    ...(options?.checkoutPatterns ?? ['/checkout', '/checkout/*']),
    ...(options?.confirmationPatterns ?? ['/confirmation', '/thank-you', '/thankyou', '/order/*']),
  ];

  return defineZone({
    name,
    description: options?.description ?? 'Cart, checkout, and confirmation pages',
    patterns: patterns.length > 0 ? patterns : defaultPatterns,
    priority: 5,
  });
}

/**
 * Creates a zone for product pages.
 *
 * @example
 * const products = defineProductZone('products', {
 *   patterns: ['/products/*', '/items/*'],
 * });
 */
export function defineProductZone(
  name: string,
  options?: { patterns?: string[]; description?: string }
): ZoneDefinition {
  return defineZone({
    name,
    description: options?.description ?? 'Product pages',
    patterns: options?.patterns ?? [
      '/product/*',
      '/products/*',
      '/item/*',
      '/items/*',
      '/p/*',
    ],
  });
}

/**
 * Creates a zone for category/collection pages.
 *
 * @example
 * const categories = defineCategoryZone('categories');
 */
export function defineCategoryZone(
  name: string,
  options?: { patterns?: string[]; description?: string }
): ZoneDefinition {
  return defineZone({
    name,
    description: options?.description ?? 'Category and collection pages',
    patterns: options?.patterns ?? [
      '/category/*',
      '/categories/*',
      '/collection/*',
      '/collections/*',
      '/c/*',
    ],
  });
}

/**
 * Creates a zone for blog/content pages.
 *
 * @example
 * const blog = defineBlogZone('blog');
 */
export function defineBlogZone(
  name: string,
  options?: { patterns?: string[]; description?: string }
): ZoneDefinition {
  return defineZone({
    name,
    description: options?.description ?? 'Blog and content pages',
    patterns: options?.patterns ?? [
      '/blog',
      '/blog/*',
      '/article/*',
      '/articles/*',
      '/post/*',
      '/posts/*',
      '/news/*',
    ],
  });
}

/**
 * Creates a zone for account/user pages.
 *
 * @example
 * const account = defineAccountZone('account');
 */
export function defineAccountZone(
  name: string,
  options?: { patterns?: string[]; description?: string }
): ZoneDefinition {
  return defineZone({
    name,
    description: options?.description ?? 'Account and user pages',
    patterns: options?.patterns ?? [
      '/account',
      '/account/*',
      '/my-account',
      '/my-account/*',
      '/profile',
      '/profile/*',
      '/dashboard',
      '/dashboard/*',
      '/settings',
      '/settings/*',
    ],
  });
}

/**
 * Creates a zone for search pages.
 *
 * @example
 * const search = defineSearchZone('search');
 */
export function defineSearchZone(
  name: string,
  options?: { patterns?: string[]; description?: string }
): ZoneDefinition {
  return defineZone({
    name,
    description: options?.description ?? 'Search results pages',
    patterns: options?.patterns ?? ['/search', '/search/*', '/s', '/s/*'],
  });
}

/**
 * Creates a zone for admin/internal pages (typically excluded from tracking).
 *
 * @example
 * const admin = defineAdminZone('admin');
 */
export function defineAdminZone(
  name: string,
  options?: { patterns?: string[]; description?: string }
): ZoneDefinition {
  return defineZone({
    name,
    description: options?.description ?? 'Admin and internal pages',
    patterns: options?.patterns ?? [
      '/admin',
      '/admin/*',
      '/internal',
      '/internal/*',
      '/manage',
      '/manage/*',
      '/backend',
      '/backend/*',
    ],
    enabled: true,
  });
}

// ============================================================================
// Zone Pattern Utilities
// ============================================================================

/**
 * Combines multiple patterns into a single array, handling duplicates.
 *
 * @example
 * const patterns = combinePatterns(
 *   ['/products/*'],
 *   ['/collections/*'],
 *   ['!/admin/*']
 * );
 */
export function combinePatterns(...patternArrays: string[][]): string[] {
  const uniquePatterns = new Set<string>();

  for (const patterns of patternArrays) {
    for (const pattern of patterns) {
      uniquePatterns.add(pattern);
    }
  }

  return Array.from(uniquePatterns);
}

/**
 * Creates exclusion patterns from a list of paths.
 *
 * @example
 * const exclusions = excludePatterns(['/admin/*', '/api/*']);
 * // Returns ['!/admin/*', '!/api/*']
 */
export function excludePatterns(patterns: string[]): string[] {
  return patterns.map((pattern) => {
    if (pattern.startsWith('!')) {
      return pattern;
    }
    return `!${pattern}`;
  });
}

/**
 * Converts a glob pattern to a regex pattern.
 * Useful for complex matching requirements.
 *
 * @example
 * const regex = globToRegex('/products/*');
 * // Returns '/^\\/products\\/[^/]+$/'
 */
export function globToRegex(glob: string): string {
  // Escape special regex characters except * and **
  let regex = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Convert ** to match any path
  regex = regex.replace(/\*\*/g, '.*');

  // Convert * to match any single path segment
  regex = regex.replace(/\*/g, '[^/]*');

  return `/${'^' + regex + '$'}/`;
}

/**
 * Tests if a URL matches a zone definition.
 * Useful for debugging zone configuration.
 *
 * @example
 * const zone = defineZone({ name: 'products', patterns: ['/products/*'] });
 * const matches = testZoneMatch(zone, new URL('https://example.com/products/123'));
 * // Returns true
 */
export function testZoneMatch(
  zone: ZoneDefinition,
  url: URL,
  context?: Partial<ZoneContext>
): boolean {
  if (!zone.enabled) {
    return false;
  }

  const pathname = url.pathname;
  let matchesPattern = false;
  let excludedByPattern = false;

  for (const pattern of zone.patterns) {
    const isExclusion = pattern.startsWith('!');
    const actualPattern = isExclusion ? pattern.slice(1) : pattern;

    // Check if it's a regex pattern (wrapped in slashes)
    const isRegex = actualPattern.startsWith('/') && actualPattern.endsWith('/');

    let matches: boolean;

    if (isRegex) {
      // Extract regex and test
      const regexStr = actualPattern.slice(1, -1);
      const regex = new RegExp(regexStr);
      matches = regex.test(pathname);
    } else {
      // Glob matching
      matches = matchGlob(actualPattern, pathname);
    }

    if (matches) {
      if (isExclusion) {
        excludedByPattern = true;
      } else {
        matchesPattern = true;
      }
    }
  }

  // Must match at least one include pattern and not match any exclude patterns
  if (!matchesPattern || excludedByPattern) {
    return false;
  }

  // Check custom condition if provided
  if (zone.condition) {
    const fullContext: ZoneContext = {
      url,
      referrer: context?.referrer,
      userAgent: context?.userAgent,
      device: context?.device,
      geo: context?.geo,
    };

    return zone.condition(url, fullContext);
  }

  return true;
}

/**
 * Simple glob matching implementation.
 * Supports * (single segment) and ** (multiple segments).
 */
function matchGlob(pattern: string, path: string): boolean {
  // Convert glob to regex
  let regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*');

  // Anchor the pattern
  regexStr = '^' + regexStr + '$';

  const regex = new RegExp(regexStr);
  return regex.test(path);
}
