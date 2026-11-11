/**
 * @yourtm/core - Trigger Definition Helpers
 *
 * Provides type-safe helper functions for defining triggers with proper
 * TypeScript inference and validation for each trigger type.
 */

import {
  TriggerType,
  type TriggerDefinition,
  type TriggerContext,
  type TriggerConfig,
  type PageviewTriggerConfig,
  type ClickTriggerConfig,
  type ScrollTriggerConfig,
  type TimerTriggerConfig,
  type VisibilityTriggerConfig,
  type FormSubmitTriggerConfig,
  type DataLayerEventTriggerConfig,
  type HistoryChangeTriggerConfig,
  type YouTubeVideoTriggerConfig,
  type CustomTriggerConfig,
} from './types.js';

/**
 * Base input for all trigger types.
 */
interface BaseTriggerInput<T extends TriggerConfig> {
  /** Unique identifier for the trigger */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Trigger-specific configuration */
  config: T;
  /**
   * Optional condition function to further filter trigger firing.
   * Return true to allow the trigger to fire.
   */
  condition?: (context: TriggerContext) => boolean;
  /**
   * Optional function to extract additional data when trigger fires.
   * The returned data is merged into the tag context.
   */
  extract?: (context: TriggerContext) => Record<string, unknown>;
  /**
   * Priority for trigger execution (higher = first).
   * @default 0
   */
  priority?: number;
  /**
   * Whether trigger is enabled.
   * @default true
   */
  enabled?: boolean;
}

/**
 * Validates common trigger properties.
 */
function validateBaseTrigger(input: BaseTriggerInput<TriggerConfig>): void {
  if (!input.name || typeof input.name !== 'string') {
    throw new Error('Trigger name is required and must be a string');
  }

  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new Error('Trigger name cannot be empty');
  }
  if (!/^[a-zA-Z]/.test(trimmedName)) {
    throw new Error(`Trigger name "${input.name}" must start with a letter`);
  }

  if (!input.config || typeof input.config !== 'object') {
    throw new Error('Trigger config is required');
  }
}

/**
 * Creates a base trigger definition with defaults.
 */
function createTrigger<T extends TriggerConfig>(
  type: TriggerType,
  input: BaseTriggerInput<T>
): TriggerDefinition<T> {
  validateBaseTrigger(input);

  return {
    name: input.name,
    description: input.description,
    type,
    config: input.config,
    condition: input.condition,
    extract: input.extract,
    priority: input.priority ?? 0,
    enabled: input.enabled ?? true,
  };
}

// ============================================================================
// Pageview Trigger
// ============================================================================

/**
 * Input for pageview trigger.
 */
export interface PageviewTriggerInput extends Omit<BaseTriggerInput<PageviewTriggerConfig>, 'config'> {
  /**
   * URL patterns to match (glob or regex).
   * @example ['/', '/products/*', '/blog/**']
   */
  urlPatterns?: string[];
  /**
   * URL patterns to exclude.
   * @example ['/admin/*', '/api/*']
   */
  excludePatterns?: string[];
  /**
   * Fire on virtual pageviews (SPA navigation).
   * @default true
   */
  includeVirtualPageviews?: boolean;
  /**
   * Minimum time on page before firing (ms).
   * @default 0
   */
  delay?: number;
}

/**
 * Creates a pageview trigger that fires on page load or SPA navigation.
 *
 * @example
 * // Fire on all pages
 * const allPages = definePageviewTrigger({
 *   name: 'all-pageviews',
 * });
 *
 * @example
 * // Fire only on product pages
 * const productPages = definePageviewTrigger({
 *   name: 'product-pageviews',
 *   urlPatterns: ['/products/*', '/collections/*'],
 *   excludePatterns: ['/products/admin/*'],
 * });
 */
export function definePageviewTrigger(
  input: PageviewTriggerInput
): TriggerDefinition<PageviewTriggerConfig> {
  const config: PageviewTriggerConfig = {
    urlPatterns: input.urlPatterns,
    excludePatterns: input.excludePatterns,
    includeVirtualPageviews: input.includeVirtualPageviews ?? true,
    delay: input.delay ?? 0,
  };

  return createTrigger(TriggerType.Pageview, {
    name: input.name,
    description: input.description,
    config,
    condition: input.condition,
    extract: input.extract,
    priority: input.priority,
    enabled: input.enabled,
  });
}

// ============================================================================
// Click Trigger
// ============================================================================

/**
 * Input for click trigger.
 */
export interface ClickTriggerInput extends Omit<BaseTriggerInput<ClickTriggerConfig>, 'config'> {
  /**
   * CSS selector for target elements.
   * @example 'button.add-to-cart', '[data-track-click]'
   */
  selector: string;
  /**
   * Whether to wait for all clicks or just first.
   * @default false
   */
  waitForAllClicks?: boolean;
  /**
   * Only fire once per page.
   * @default false
   */
  oncePerPage?: boolean;
  /**
   * Check clicks on child elements.
   * @default true
   */
  checkChildElements?: boolean;
  /**
   * Attribute to match (e.g., data-track).
   */
  matchAttribute?: string;
  /**
   * Value the attribute should have.
   */
  matchAttributeValue?: string;
}

/**
 * Creates a click trigger that fires when elements are clicked.
 *
 * @example
 * // Track all add-to-cart button clicks
 * const addToCart = defineClickTrigger({
 *   name: 'add-to-cart-click',
 *   selector: 'button.add-to-cart',
 *   extract: (ctx) => ({
 *     productId: ctx.element?.getAttribute('data-product-id'),
 *   }),
 * });
 *
 * @example
 * // Track clicks on elements with data-track attribute
 * const dataTrack = defineClickTrigger({
 *   name: 'data-track-clicks',
 *   selector: '[data-track]',
 *   matchAttribute: 'data-track',
 * });
 */
export function defineClickTrigger(
  input: ClickTriggerInput
): TriggerDefinition<ClickTriggerConfig> {
  if (!input.selector || typeof input.selector !== 'string') {
    throw new Error('Click trigger requires a selector');
  }

  const config: ClickTriggerConfig = {
    selector: input.selector,
    waitForAllClicks: input.waitForAllClicks ?? false,
    oncePerPage: input.oncePerPage ?? false,
    checkChildElements: input.checkChildElements ?? true,
    matchAttribute: input.matchAttribute,
    matchAttributeValue: input.matchAttributeValue,
  };

  return createTrigger(TriggerType.Click, {
    name: input.name,
    description: input.description,
    config,
    condition: input.condition,
    extract: input.extract,
    priority: input.priority,
    enabled: input.enabled,
  });
}

// ============================================================================
// Scroll Trigger
// ============================================================================

/**
 * Input for scroll trigger.
 */
export interface ScrollTriggerInput extends Omit<BaseTriggerInput<ScrollTriggerConfig>, 'config'> {
  /**
   * Scroll depth percentage (0-100).
   * @example 25, 50, 75, 100
   */
  scrollDepth?: number;
  /**
   * Scroll direction to track.
   * @default 'down'
   */
  direction?: 'down' | 'up' | 'both';
  /**
   * CSS selector for specific element visibility.
   * When set, fires when this element becomes visible.
   */
  elementSelector?: string;
  /**
   * Threshold for element visibility (0-1).
   * @default 0.5
   */
  visibilityThreshold?: number;
  /**
   * Fire only once.
   * @default true
   */
  once?: boolean;
}

/**
 * Creates a scroll trigger that fires at scroll depth milestones.
 *
 * @example
 * // Fire at 50% scroll depth
 * const scroll50 = defineScrollTrigger({
 *   name: 'scroll-50',
 *   scrollDepth: 50,
 * });
 *
 * @example
 * // Fire when footer becomes visible
 * const footerVisible = defineScrollTrigger({
 *   name: 'footer-visible',
 *   elementSelector: 'footer',
 *   visibilityThreshold: 0.1,
 * });
 */
export function defineScrollTrigger(
  input: ScrollTriggerInput
): TriggerDefinition<ScrollTriggerConfig> {
  if (input.scrollDepth !== undefined && (input.scrollDepth < 0 || input.scrollDepth > 100)) {
    throw new Error('Scroll depth must be between 0 and 100');
  }

  if (
    input.visibilityThreshold !== undefined &&
    (input.visibilityThreshold < 0 || input.visibilityThreshold > 1)
  ) {
    throw new Error('Visibility threshold must be between 0 and 1');
  }

  const config: ScrollTriggerConfig = {
    scrollDepth: input.scrollDepth,
    direction: input.direction ?? 'down',
    elementSelector: input.elementSelector,
    visibilityThreshold: input.visibilityThreshold ?? 0.5,
    once: input.once ?? true,
  };

  return createTrigger(TriggerType.Scroll, {
    name: input.name,
    description: input.description,
    config,
    condition: input.condition,
    extract: input.extract,
    priority: input.priority,
    enabled: input.enabled,
  });
}

// ============================================================================
// Timer Trigger
// ============================================================================

/**
 * Input for timer trigger.
 */
export interface TimerTriggerInput extends Omit<BaseTriggerInput<TimerTriggerConfig>, 'config'> {
  /**
   * Delay in milliseconds before first firing.
   */
  delay: number;
  /**
   * Repeat interval in milliseconds (0 = no repeat).
   * @default 0
   */
  interval?: number;
  /**
   * Maximum number of firings (0 = unlimited).
   * @default 0
   */
  maxFirings?: number;
  /**
   * Only fire when page is visible.
   * @default true
   */
  requireVisibility?: boolean;
}

/**
 * Creates a timer trigger that fires after a delay.
 *
 * @example
 * // Fire once after 30 seconds
 * const engaged30 = defineTimerTrigger({
 *   name: 'engaged-30s',
 *   delay: 30000,
 * });
 *
 * @example
 * // Fire every 5 minutes, max 3 times
 * const heartbeat = defineTimerTrigger({
 *   name: 'heartbeat',
 *   delay: 300000,
 *   interval: 300000,
 *   maxFirings: 3,
 * });
 */
export function defineTimerTrigger(
  input: TimerTriggerInput
): TriggerDefinition<TimerTriggerConfig> {
  if (typeof input.delay !== 'number' || input.delay < 0) {
    throw new Error('Timer trigger requires a positive delay');
  }

  const config: TimerTriggerConfig = {
    delay: input.delay,
    interval: input.interval ?? 0,
    maxFirings: input.maxFirings ?? 0,
    requireVisibility: input.requireVisibility ?? true,
  };

  return createTrigger(TriggerType.Timer, {
    name: input.name,
    description: input.description,
    config,
    condition: input.condition,
    extract: input.extract,
    priority: input.priority,
    enabled: input.enabled,
  });
}

// ============================================================================
// Visibility Trigger
// ============================================================================

/**
 * Input for visibility trigger.
 */
export interface VisibilityTriggerInput extends Omit<BaseTriggerInput<VisibilityTriggerConfig>, 'config'> {
  /**
   * CSS selector for target element.
   */
  selector: string;
  /**
   * Minimum visibility ratio (0-1).
   * @default 0.5
   */
  threshold?: number;
  /**
   * Minimum time visible in milliseconds.
   * @default 0
   */
  minDuration?: number;
  /**
   * Fire when element exits viewport too.
   * @default false
   */
  fireOnExit?: boolean;
  /**
   * Fire only once.
   * @default true
   */
  once?: boolean;
}

/**
 * Creates a visibility trigger using Intersection Observer.
 *
 * @example
 * // Fire when product card is 50% visible for 1 second
 * const productImpression = defineVisibilityTrigger({
 *   name: 'product-impression',
 *   selector: '.product-card',
 *   threshold: 0.5,
 *   minDuration: 1000,
 * });
 */
export function defineVisibilityTrigger(
  input: VisibilityTriggerInput
): TriggerDefinition<VisibilityTriggerConfig> {
  if (!input.selector || typeof input.selector !== 'string') {
    throw new Error('Visibility trigger requires a selector');
  }

  if (input.threshold !== undefined && (input.threshold < 0 || input.threshold > 1)) {
    throw new Error('Threshold must be between 0 and 1');
  }

  const config: VisibilityTriggerConfig = {
    selector: input.selector,
    threshold: input.threshold ?? 0.5,
    minDuration: input.minDuration ?? 0,
    fireOnExit: input.fireOnExit ?? false,
    once: input.once ?? true,
  };

  return createTrigger(TriggerType.Visibility, {
    name: input.name,
    description: input.description,
    config,
    condition: input.condition,
    extract: input.extract,
    priority: input.priority,
    enabled: input.enabled,
  });
}

// ============================================================================
// Form Submit Trigger
// ============================================================================

/**
 * Input for form submit trigger.
 */
export interface FormSubmitTriggerInput extends Omit<BaseTriggerInput<FormSubmitTriggerConfig>, 'config'> {
  /**
   * CSS selector for form element.
   */
  selector?: string;
  /**
   * Form ID to match.
   */
  formId?: string;
  /**
   * Form action URL pattern.
   */
  actionPattern?: string;
  /**
   * Wait for form validation.
   * @default true
   */
  waitForValidation?: boolean;
  /**
   * Prevent default form submission.
   * @default false
   */
  preventDefault?: boolean;
}

/**
 * Creates a form submit trigger.
 *
 * @example
 * // Track newsletter signup form
 * const newsletter = defineFormSubmitTrigger({
 *   name: 'newsletter-submit',
 *   formId: 'newsletter-form',
 *   extract: (ctx) => ({
 *     email: ctx.formData?.email,
 *   }),
 * });
 */
export function defineFormSubmitTrigger(
  input: FormSubmitTriggerInput
): TriggerDefinition<FormSubmitTriggerConfig> {
  if (!input.selector && !input.formId && !input.actionPattern) {
    throw new Error('Form submit trigger requires selector, formId, or actionPattern');
  }

  const config: FormSubmitTriggerConfig = {
    selector: input.selector,
    formId: input.formId,
    actionPattern: input.actionPattern,
    waitForValidation: input.waitForValidation ?? true,
    preventDefault: input.preventDefault ?? false,
  };

  return createTrigger(TriggerType.FormSubmit, {
    name: input.name,
    description: input.description,
    config,
    condition: input.condition,
    extract: input.extract,
    priority: input.priority,
    enabled: input.enabled,
  });
}

// ============================================================================
// DataLayer Event Trigger
// ============================================================================

/**
 * Input for dataLayer event trigger.
 */
export interface DataLayerEventTriggerInput extends Omit<BaseTriggerInput<DataLayerEventTriggerConfig>, 'config'> {
  /**
   * Event name to match.
   * @example 'purchase', 'add_to_cart'
   */
  eventName: string;
  /**
   * Match event name with regex.
   * @default false
   */
  useRegex?: boolean;
  /**
   * Additional conditions on dataLayer values.
   * @example { 'ecommerce.currency': 'USD' }
   */
  conditions?: Record<string, unknown>;
}

/**
 * Creates a dataLayer event trigger that fires on dataLayer.push().
 *
 * @example
 * // Fire on purchase event
 * const purchase = defineDataLayerEventTrigger({
 *   name: 'purchase-event',
 *   eventName: 'purchase',
 *   conditions: {
 *     'ecommerce.transaction_id': { exists: true },
 *   },
 * });
 *
 * @example
 * // Fire on any ecommerce event
 * const ecommerce = defineDataLayerEventTrigger({
 *   name: 'ecommerce-events',
 *   eventName: '^(add_to_cart|remove_from_cart|purchase)$',
 *   useRegex: true,
 * });
 */
export function defineDataLayerEventTrigger(
  input: DataLayerEventTriggerInput
): TriggerDefinition<DataLayerEventTriggerConfig> {
  if (!input.eventName || typeof input.eventName !== 'string') {
    throw new Error('DataLayer event trigger requires an eventName');
  }

  const config: DataLayerEventTriggerConfig = {
    eventName: input.eventName,
    useRegex: input.useRegex ?? false,
    conditions: input.conditions,
  };

  return createTrigger(TriggerType.DataLayerEvent, {
    name: input.name,
    description: input.description,
    config,
    condition: input.condition,
    extract: input.extract,
    priority: input.priority,
    enabled: input.enabled,
  });
}

// ============================================================================
// History Change Trigger
// ============================================================================

/**
 * Input for history change trigger (SPA navigation).
 */
export interface HistoryChangeTriggerInput extends Omit<BaseTriggerInput<HistoryChangeTriggerConfig>, 'config'> {
  /**
   * Fire on pushState.
   * @default true
   */
  pushState?: boolean;
  /**
   * Fire on replaceState.
   * @default false
   */
  replaceState?: boolean;
  /**
   * Fire on popstate (back/forward).
   * @default true
   */
  popState?: boolean;
  /**
   * URL patterns to match.
   */
  urlPatterns?: string[];
}

/**
 * Creates a history change trigger for SPA navigation.
 *
 * @example
 * // Track all SPA navigation
 * const spaNav = defineHistoryChangeTrigger({
 *   name: 'spa-navigation',
 * });
 *
 * @example
 * // Track only product page navigation
 * const productNav = defineHistoryChangeTrigger({
 *   name: 'product-navigation',
 *   urlPatterns: ['/products/*'],
 * });
 */
export function defineHistoryChangeTrigger(
  input: HistoryChangeTriggerInput
): TriggerDefinition<HistoryChangeTriggerConfig> {
  const config: HistoryChangeTriggerConfig = {
    pushState: input.pushState ?? true,
    replaceState: input.replaceState ?? false,
    popState: input.popState ?? true,
    urlPatterns: input.urlPatterns,
  };

  return createTrigger(TriggerType.HistoryChange, {
    name: input.name,
    description: input.description,
    config,
    condition: input.condition,
    extract: input.extract,
    priority: input.priority,
    enabled: input.enabled,
  });
}

// ============================================================================
// YouTube Video Trigger
// ============================================================================

/**
 * Input for YouTube video trigger.
 */
export interface YouTubeVideoTriggerInput extends Omit<BaseTriggerInput<YouTubeVideoTriggerConfig>, 'config'> {
  /**
   * CSS selector for YouTube iframe.
   */
  selector?: string;
  /**
   * Fire on play event.
   * @default true
   */
  onPlay?: boolean;
  /**
   * Fire on pause event.
   * @default false
   */
  onPause?: boolean;
  /**
   * Fire on progress (percentage thresholds).
   * @example [25, 50, 75, 100]
   */
  progressThresholds?: number[];
  /**
   * Fire on video complete.
   * @default true
   */
  onComplete?: boolean;
}

/**
 * Creates a YouTube video trigger.
 *
 * @example
 * // Track video engagement
 * const videoEngagement = defineYouTubeVideoTrigger({
 *   name: 'youtube-engagement',
 *   onPlay: true,
 *   progressThresholds: [25, 50, 75],
 *   onComplete: true,
 * });
 */
export function defineYouTubeVideoTrigger(
  input: YouTubeVideoTriggerInput
): TriggerDefinition<YouTubeVideoTriggerConfig> {
  const config: YouTubeVideoTriggerConfig = {
    selector: input.selector,
    onPlay: input.onPlay ?? true,
    onPause: input.onPause ?? false,
    progressThresholds: input.progressThresholds,
    onComplete: input.onComplete ?? true,
  };

  return createTrigger(TriggerType.YouTubeVideo, {
    name: input.name,
    description: input.description,
    config,
    condition: input.condition,
    extract: input.extract,
    priority: input.priority,
    enabled: input.enabled,
  });
}

// ============================================================================
// Custom Trigger
// ============================================================================

/**
 * Input for custom trigger.
 */
export interface CustomTriggerInput extends Omit<BaseTriggerInput<CustomTriggerConfig>, 'config'> {
  /**
   * Custom initialization function.
   * Called once when trigger is set up.
   * Call fire() to trigger the event.
   * Return a cleanup function to be called on teardown.
   */
  setup?: (fire: () => void) => void | (() => void);
  /**
   * Cleanup function called when trigger is removed.
   */
  teardown?: () => void;
  /**
   * Custom data to pass to fire event.
   */
  data?: Record<string, unknown>;
}

/**
 * Creates a custom trigger with user-defined logic.
 *
 * @example
 * // Fire when custom event is dispatched
 * const customEvent = defineCustomTrigger({
 *   name: 'custom-analytics-event',
 *   setup: (fire) => {
 *     const handler = () => fire();
 *     window.addEventListener('analytics:track', handler);
 *     return () => window.removeEventListener('analytics:track', handler);
 *   },
 * });
 *
 * @example
 * // Fire when specific condition is met
 * const userLoggedIn = defineCustomTrigger({
 *   name: 'user-logged-in',
 *   setup: (fire) => {
 *     const checkUser = setInterval(() => {
 *       if (window.currentUser?.isLoggedIn) {
 *         fire();
 *         clearInterval(checkUser);
 *       }
 *     }, 100);
 *     return () => clearInterval(checkUser);
 *   },
 * });
 */
export function defineCustomTrigger(
  input: CustomTriggerInput
): TriggerDefinition<CustomTriggerConfig> {
  const config: CustomTriggerConfig = {
    setup: input.setup,
    teardown: input.teardown,
    data: input.data,
  };

  return createTrigger(TriggerType.Custom, {
    name: input.name,
    description: input.description,
    config,
    condition: input.condition,
    extract: input.extract,
    priority: input.priority,
    enabled: input.enabled,
  });
}

// ============================================================================
// Generic Trigger Helper
// ============================================================================

/**
 * Generic trigger definition input (for advanced use cases).
 */
export interface GenericTriggerInput<T extends TriggerConfig = TriggerConfig> {
  /** Unique identifier for the trigger */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Type of trigger */
  type: TriggerType;
  /** Trigger-specific configuration */
  config: T;
  /** Condition function */
  condition?: (context: TriggerContext) => boolean;
  /** Data extraction function */
  extract?: (context: TriggerContext) => Record<string, unknown>;
  /** Priority */
  priority?: number;
  /** Enabled state */
  enabled?: boolean;
}

/**
 * Creates a trigger definition with full type control.
 * Use this for advanced cases where specific trigger helpers don't fit.
 *
 * @example
 * const trigger = defineTrigger({
 *   name: 'my-trigger',
 *   type: TriggerType.Custom,
 *   config: {
 *     setup: (fire) => { /* ... *\/ },
 *   },
 * });
 */
export function defineTrigger<T extends TriggerConfig>(
  input: GenericTriggerInput<T>
): TriggerDefinition<T> {
  return createTrigger(input.type, {
    name: input.name,
    description: input.description,
    config: input.config,
    condition: input.condition,
    extract: input.extract,
    priority: input.priority,
    enabled: input.enabled,
  });
}

/**
 * Type guard to check if a value is a valid TriggerDefinition.
 */
export function isTriggerDefinition(value: unknown): value is TriggerDefinition {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const trigger = value as Record<string, unknown>;

  return (
    typeof trigger.name === 'string' &&
    typeof trigger.type === 'string' &&
    Object.values(TriggerType).includes(trigger.type as TriggerType) &&
    typeof trigger.config === 'object' &&
    trigger.config !== null
  );
}

/**
 * Fire on a `dataLayer` event by name.
 *
 * The GTM importer emits this for `customEvent` triggers and the CLI compiler
 * has always shimmed it, so imported containers compiled while never being
 * valid TypeScript — the symbol simply did not exist. Defining it here makes
 * the generated import honest instead of relying on a shim being injected.
 */
export function defineCustomEventTrigger(
  input: { name: string; description?: string; event?: string; eventName?: string;
           conditions?: unknown; priority?: number; enabled?: boolean }
): Record<string, unknown> {
  return { ...input, type: 'customEvent' };
}

/**
 * Fire once as the container initialises, before any pageview.
 *
 * Same history as defineCustomEventTrigger: emitted by the importer, shimmed by
 * the compiler, never actually exported.
 */
export function defineInitTrigger(
  input: { name: string; description?: string; priority?: number; enabled?: boolean }
): Record<string, unknown> {
  return { ...input, type: 'init' };
}

/**
 * Fire before everything else, including the init trigger.
 *
 * GTM's Consent Initialization, and the only correct home for Consent Mode
 * defaults: a default that lands after the first marketing tag has already
 * asked permission is not a default. The importer emitted this symbol for any
 * container using consent mode, but nothing exported it — so those containers
 * failed to build.
 */
export function defineConsentInitTrigger(
  input: { name: string; description?: string; priority?: number; enabled?: boolean }
): Record<string, unknown> {
  return { ...input, type: 'consentInit' };
}

/**
 * Fire on DOMContentLoaded. GTM's DOM Ready.
 */
export function defineDOMReadyTrigger(
  input: { name: string; description?: string; conditions?: unknown;
           priority?: number; enabled?: boolean }
): Record<string, unknown> {
  return { ...input, type: 'domReady' };
}

/**
 * Fire on window load, once subresources have finished. GTM's Window Loaded.
 */
export function defineWindowLoadTrigger(
  input: { name: string; description?: string; conditions?: unknown;
           priority?: number; enabled?: boolean }
): Record<string, unknown> {
  return { ...input, type: 'windowLoad' };
}
