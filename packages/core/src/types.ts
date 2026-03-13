/**
 * @yourtm/core - Core Type Definitions
 *
 * This file contains all TypeScript interfaces and types used throughout
 * the YourTM tag management platform.
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Types of triggers that can fire tags.
 * Each trigger type has its own configuration requirements.
 */
export enum TriggerType {
  /** Fires on page load/navigation */
  Pageview = 'pageview',
  /** Fires on element click */
  Click = 'click',
  /** Fires when element becomes visible (Intersection Observer) */
  Scroll = 'scroll',
  /** Fires after a time delay */
  Timer = 'timer',
  /** Fires when element enters/exits viewport */
  Visibility = 'visibility',
  /** Fires on form submission */
  FormSubmit = 'form_submit',
  /** Fires on dataLayer.push() events */
  DataLayerEvent = 'datalayer_event',
  /** Fires on History API changes (SPA navigation) */
  HistoryChange = 'history_change',
  /** Fires on YouTube video events */
  YouTubeVideo = 'youtube_video',
  /** Custom trigger with user-defined logic */
  Custom = 'custom',
}

/**
 * Consent categories for GDPR/CCPA compliance.
 * Tags are blocked until the user grants consent for the required category.
 */
export enum ConsentCategory {
  /** Required for basic site functionality - cannot be disabled */
  Essential = 'essential',
  /** Analytics and measurement (GA4, Mixpanel, etc.) */
  Analytics = 'analytics',
  /** Advertising and remarketing (Meta Pixel, Google Ads, etc.) */
  Marketing = 'marketing',
  /** Social media integrations */
  Social = 'social',
  /** A/B testing and personalization */
  Personalization = 'personalization',
}

/**
 * Variable types supported by the tag manager.
 */
export enum VariableType {
  /** Extract value from dataLayer by path */
  DataLayer = 'datalayer',
  /** Computed value from a function */
  Computed = 'computed',
  /** Read from browser cookie */
  Cookie = 'cookie',
  /** Extract from URL (query param, path, hash) */
  URL = 'url',
  /** Read from localStorage */
  LocalStorage = 'localStorage',
  /** Read from sessionStorage */
  SessionStorage = 'sessionStorage',
  /** DOM element content or attribute */
  DOMElement = 'dom_element',
  /** JavaScript global variable */
  JavaScriptVariable = 'javascript_variable',
  /** Constant value */
  Constant = 'constant',
  /** First-party cookie */
  FirstPartyCookie = 'first_party_cookie',
  /** Custom function */
  Custom = 'custom',
}

/**
 * Environment types for multi-environment deployment.
 */
export enum Environment {
  /** Local development */
  Development = 'development',
  /** Pre-production testing */
  Staging = 'staging',
  /** Live production traffic */
  Production = 'production',
  /** Preview/QA mode */
  Preview = 'preview',
}

/**
 * Tag execution status for telemetry.
 */
export enum TagStatus {
  /** Tag is enabled and will fire when triggered */
  Active = 'active',
  /** Tag is temporarily disabled */
  Paused = 'paused',
  /** Tag is in draft mode (not yet published) */
  Draft = 'draft',
  /** Tag has been archived */
  Archived = 'archived',
}

// ============================================================================
// Trigger Configurations
// ============================================================================

/**
 * Configuration for pageview triggers.
 */
export interface PageviewTriggerConfig {
  /** URL patterns to match (glob or regex) */
  urlPatterns?: string[];
  /** Exclude these URL patterns */
  excludePatterns?: string[];
  /** Fire on virtual pageviews (SPA navigation) */
  includeVirtualPageviews?: boolean;
  /** Minimum time on page before firing (ms) */
  delay?: number;
}

/**
 * Configuration for click triggers.
 */
export interface ClickTriggerConfig {
  /** CSS selector for target elements */
  selector: string;
  /** Whether to wait for all clicks or just first */
  waitForAllClicks?: boolean;
  /** Only fire once per page */
  oncePerPage?: boolean;
  /** Check clicks on child elements */
  checkChildElements?: boolean;
  /** Attribute to match (e.g., data-track) */
  matchAttribute?: string;
  /** Value the attribute should have */
  matchAttributeValue?: string;
}

/**
 * Configuration for scroll triggers.
 */
export interface ScrollTriggerConfig {
  /** Scroll depth percentage (0-100) */
  scrollDepth?: number;
  /** Scroll direction: down, up, or both */
  direction?: 'down' | 'up' | 'both';
  /** CSS selector for specific element visibility */
  elementSelector?: string;
  /** Threshold for element visibility (0-1) */
  visibilityThreshold?: number;
  /** Fire only once */
  once?: boolean;
}

/**
 * Configuration for timer triggers.
 */
export interface TimerTriggerConfig {
  /** Delay in milliseconds */
  delay: number;
  /** Repeat interval (0 = no repeat) */
  interval?: number;
  /** Maximum number of firings */
  maxFirings?: number;
  /** Only fire when page is visible */
  requireVisibility?: boolean;
}

/**
 * Configuration for visibility triggers.
 */
export interface VisibilityTriggerConfig {
  /** CSS selector for target element */
  selector: string;
  /** Minimum visibility ratio (0-1) */
  threshold?: number;
  /** Minimum time visible (ms) */
  minDuration?: number;
  /** Fire when element exits viewport too */
  fireOnExit?: boolean;
  /** Fire only once */
  once?: boolean;
}

/**
 * Configuration for form submit triggers.
 */
export interface FormSubmitTriggerConfig {
  /** CSS selector for form element */
  selector?: string;
  /** Form ID to match */
  formId?: string;
  /** Form action URL pattern */
  actionPattern?: string;
  /** Wait for form validation */
  waitForValidation?: boolean;
  /** Prevent default form submission */
  preventDefault?: boolean;
}

/**
 * Configuration for dataLayer event triggers.
 */
export interface DataLayerEventTriggerConfig {
  /** Event name to match */
  eventName: string;
  /** Match event name with regex */
  useRegex?: boolean;
  /** Additional conditions on dataLayer values */
  conditions?: Record<string, unknown>;
}

/**
 * Configuration for history change triggers (SPA).
 */
export interface HistoryChangeTriggerConfig {
  /** Fire on pushState */
  pushState?: boolean;
  /** Fire on replaceState */
  replaceState?: boolean;
  /** Fire on popstate (back/forward) */
  popState?: boolean;
  /** URL patterns to match */
  urlPatterns?: string[];
}

/**
 * Configuration for YouTube video triggers.
 */
export interface YouTubeVideoTriggerConfig {
  /** CSS selector for YouTube iframe */
  selector?: string;
  /** Fire on play event */
  onPlay?: boolean;
  /** Fire on pause event */
  onPause?: boolean;
  /** Fire on progress (percentage thresholds) */
  progressThresholds?: number[];
  /** Fire on video complete */
  onComplete?: boolean;
}

/**
 * Configuration for custom triggers.
 */
export interface CustomTriggerConfig {
  /** Custom initialization function */
  setup?: (fire: () => void) => void | (() => void);
  /** Cleanup function */
  teardown?: () => void;
  /** Custom data to pass to fire event */
  data?: Record<string, unknown>;
}

/**
 * Union type of all trigger configurations.
 */
export type TriggerConfig =
  | PageviewTriggerConfig
  | ClickTriggerConfig
  | ScrollTriggerConfig
  | TimerTriggerConfig
  | VisibilityTriggerConfig
  | FormSubmitTriggerConfig
  | DataLayerEventTriggerConfig
  | HistoryChangeTriggerConfig
  | YouTubeVideoTriggerConfig
  | CustomTriggerConfig;

// ============================================================================
// Trigger Definition
// ============================================================================

/**
 * Defines a trigger that causes tags to fire.
 */
export interface TriggerDefinition<T extends TriggerConfig = TriggerConfig> {
  /** Unique identifier for the trigger */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Type of trigger */
  type: TriggerType;
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
  /** Priority for trigger execution (higher = first) */
  priority?: number;
  /** Whether trigger is enabled */
  enabled?: boolean;
}

/**
 * Context available to trigger condition and extract functions.
 */
export interface TriggerContext {
  /** The DOM event that caused the trigger (if applicable) */
  event?: Event;
  /** The target element (for click/visibility triggers) */
  element?: Element;
  /** Current page URL */
  url: URL;
  /** Current dataLayer state */
  dataLayer: Record<string, unknown>;
  /** Scroll depth percentage (for scroll triggers) */
  scrollDepth?: number;
  /** Video data (for YouTube triggers) */
  videoData?: {
    videoId: string;
    title: string;
    duration: number;
    currentTime: number;
    percentWatched: number;
  };
  /** Form data (for form triggers) */
  formData?: Record<string, string>;
}

// ============================================================================
// Variable Definition
// ============================================================================

/**
 * URL variable extraction configuration.
 */
export interface URLVariableConfig {
  /** Part of URL to extract */
  part: 'query' | 'path' | 'hash' | 'hostname' | 'pathname' | 'protocol' | 'port' | 'full';
  /** Query parameter name (when part is 'query') */
  paramName?: string;
  /** Path segment index (when part is 'path') */
  pathIndex?: number;
  /** Regex to extract value */
  pattern?: string;
}

/**
 * DOM element variable configuration.
 */
export interface DOMElementConfig {
  /** CSS selector */
  selector: string;
  /** What to extract: text content, attribute value, or HTML */
  extract: 'textContent' | 'innerHTML' | 'outerHTML' | 'attribute';
  /** Attribute name (when extract is 'attribute') */
  attributeName?: string;
}

/**
 * Defines a variable that can be used in tags.
 */
export interface VariableDefinition<T = unknown> {
  /** Unique identifier for the variable */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Type of variable */
  type: VariableType;
  /**
   * Path to value in dataLayer (dot notation).
   * Used when type is 'datalayer'.
   * @example 'ecommerce.purchase.transaction_id'
   */
  path?: string;
  /**
   * Compute function for derived values.
   * Used when type is 'computed' or 'custom'.
   */
  compute?: (context: VariableContext) => T | Promise<T>;
  /**
   * Transform function applied to the raw value.
   * Useful for formatting, encoding, or sanitizing.
   */
  transform?: (value: unknown) => T;
  /** Default value when variable is undefined */
  default?: T;
  /** Cookie name (when type is 'cookie') */
  cookieName?: string;
  /** URL extraction config (when type is 'url') */
  urlConfig?: URLVariableConfig;
  /** localStorage/sessionStorage key */
  storageKey?: string;
  /** DOM element config */
  domConfig?: DOMElementConfig;
  /** JavaScript variable path (when type is 'javascript_variable') */
  jsPath?: string;
  /** Constant value (when type is 'constant') */
  constantValue?: T;
  /** Cache duration in milliseconds (0 = no cache) */
  cacheDuration?: number;
  /** Format string for output (e.g., 'json', 'string', 'number') */
  format?: 'string' | 'number' | 'boolean' | 'json' | 'auto';
}

/**
 * Context available to variable compute functions.
 */
export interface VariableContext {
  /** Current dataLayer state */
  dataLayer: Record<string, unknown>;
  /** Current page URL */
  url: URL;
  /** Other resolved variables (for dependencies) */
  variables: Record<string, unknown>;
  /** Current consent state */
  consent: ConsentState;
  /** Document object (may be undefined in SSR) */
  document?: Document;
  /** Window object (may be undefined in SSR) */
  window?: Window;
}

// ============================================================================
// Zone Definition
// ============================================================================

/**
 * Defines a zone (URL pattern group) for tag targeting.
 */
export interface ZoneDefinition {
  /** Unique identifier for the zone */
  name: string;
  /** Human-readable description */
  description?: string;
  /**
   * URL patterns to match.
   * Supports glob patterns and regex.
   * @example ['/products/*', '/cart', '!/admin/*']
   */
  patterns: string[];
  /**
   * Optional condition function for complex matching logic.
   * Return true if the URL should be in this zone.
   */
  condition?: (url: URL, context: ZoneContext) => boolean;
  /** Zone priority (higher = first match wins) */
  priority?: number;
  /** Whether zone is active */
  enabled?: boolean;
}

/**
 * Context available to zone condition functions.
 */
export interface ZoneContext {
  /** Current page URL */
  url: URL;
  /** Document referrer */
  referrer?: string;
  /** User agent string */
  userAgent?: string;
  /** Device type detection */
  device?: {
    type: 'mobile' | 'tablet' | 'desktop';
    os: string;
    browser: string;
  };
  /** Geolocation (if available) */
  geo?: {
    country?: string;
    region?: string;
    city?: string;
  };
}

// ============================================================================
// Tag Definition
// ============================================================================

/**
 * Defines a tag that fires based on triggers.
 */
export interface TagDefinition<TSetupResult = unknown> {
  /** Unique identifier for the tag */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Trigger names that fire this tag */
  triggers: string[];
  /**
   * Zone names where this tag should fire.
   * If empty, tag fires on all pages.
   */
  zones?: string[];
  /**
   * Consent categories required to fire this tag.
   * Tag is blocked until user grants consent for ALL listed categories.
   */
  consent?: ConsentCategory[];
  /**
   * Async setup function that runs once before the tag first fires.
   * Use this to load external scripts or initialize libraries.
   * Returns data that will be passed to execute().
   */
  setup?: (context: TagSetupContext) => Promise<TSetupResult> | TSetupResult;
  /**
   * Execute function that runs each time the tag fires.
   * This is where the actual tracking code runs.
   */
  execute: (context: TagExecuteContext<TSetupResult>) => void | Promise<void>;
  /**
   * Cleanup function called when tag is removed or page unloads.
   */
  teardown?: (setupResult: TSetupResult) => void;
  /** Tag priority (0-100, higher = fires first) */
  priority?: number;
  /** Maximum times this tag can fire per page (0 = unlimited) */
  maxFirings?: number;
  /** Minimum delay between firings (ms) */
  firingDelay?: number;
  /** Whether tag is enabled */
  enabled?: boolean;
  /** Tag status */
  status?: TagStatus;
  /** Vendor/platform identifier (e.g., 'google_analytics', 'meta_pixel') */
  vendor?: string;
  /** Tags that must fire before this one */
  dependsOn?: string[];
  /** Performance budget in milliseconds */
  performanceBudget?: number;
}

/**
 * Context available to tag setup function.
 */
export interface TagSetupContext {
  /** Tag definition */
  tag: TagDefinition;
  /** Current environment */
  environment: Environment;
  /** Container ID */
  containerId: string;
  /** Resolved variables */
  variables: Record<string, unknown>;
  /**
   * Helper to load external scripts.
   * Returns a Promise that resolves when script loads.
   */
  loadScript: (url: string, options?: LoadScriptOptions) => Promise<void>;
  /**
   * Helper to inject inline CSS.
   */
  injectStyles: (css: string) => void;
  /** Console for logging (respects debug mode) */
  log: TagLogger;
}

/**
 * Options for loading external scripts.
 */
export interface LoadScriptOptions {
  /** Load script asynchronously */
  async?: boolean;
  /** Defer script execution */
  defer?: boolean;
  /** Script integrity hash */
  integrity?: string;
  /** Crossorigin attribute */
  crossorigin?: 'anonymous' | 'use-credentials';
  /** Custom attributes */
  attributes?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Context available to tag execute function.
 */
export interface TagExecuteContext<TSetupResult = unknown> {
  /** Result from setup function */
  setupResult: TSetupResult;
  /** Tag definition */
  tag: TagDefinition<TSetupResult>;
  /** Trigger that caused this execution */
  trigger: TriggerDefinition;
  /** Trigger context with event data */
  triggerContext: TriggerContext;
  /** Current dataLayer state */
  dataLayer: Record<string, unknown>;
  /** Current page URL */
  url: URL;
  /** Current consent state */
  consent: ConsentState;
  /** Resolved variables */
  variables: Record<string, unknown>;
  /** Container ID */
  containerId: string;
  /** Current environment */
  environment: Environment;
  /** Console for logging (respects debug mode) */
  log: TagLogger;
  /** Number of times this tag has fired on current page */
  firingCount: number;
  /** Timestamp of last firing */
  lastFired?: Date;
}

/**
 * Logger interface for tags.
 */
export interface TagLogger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, error?: Error, ...args: unknown[]) => void;
}

// ============================================================================
// Consent
// ============================================================================

/**
 * Current consent state for the user.
 */
export interface ConsentState {
  /** Granted consent categories */
  granted: Set<ConsentCategory>;
  /** Denied consent categories */
  denied: Set<ConsentCategory>;
  /** Pending categories (not yet decided) */
  pending: Set<ConsentCategory>;
  /** Whether consent has been initialized */
  initialized: boolean;
  /** Timestamp when consent was last updated */
  lastUpdated?: Date;
  /** Whether user is in a region requiring consent (GDPR, CCPA, etc.) */
  requiresConsent: boolean;
  /** User's detected region */
  region?: string;
}

/**
 * Consent configuration.
 */
export interface ConsentConfig {
  /** Enable consent management */
  enabled: boolean;
  /** Default consent state for new users */
  defaultConsent: ConsentCategory[];
  /** Categories that are always granted (essential) */
  alwaysGranted: ConsentCategory[];
  /** Regions requiring explicit consent */
  requiredRegions: string[];
  /** Cookie name for storing consent */
  cookieName?: string;
  /** Cookie expiration in days */
  cookieExpiration?: number;
  /** Consent banner configuration */
  banner?: ConsentBannerConfig;
  /** Auto-detect user region */
  autoDetectRegion?: boolean;
  /** Consent renewal period in months (default: 13 for GDPR) */
  renewalPeriod?: number;
}

/**
 * Consent banner UI configuration.
 */
export interface ConsentBannerConfig {
  /** Banner position */
  position: 'top' | 'bottom' | 'center' | 'bottom-left' | 'bottom-right';
  /** Banner theme */
  theme: 'light' | 'dark' | 'auto';
  /** Custom CSS */
  customStyles?: string;
  /** Banner title text */
  title?: string;
  /** Banner description text */
  description?: string;
  /** Accept all button text */
  acceptAllText?: string;
  /** Reject all button text */
  rejectAllText?: string;
  /** Customize button text */
  customizeText?: string;
  /** Privacy policy URL */
  privacyPolicyUrl?: string;
  /** Cookie policy URL */
  cookiePolicyUrl?: string;
  /** Show close button */
  showCloseButton?: boolean;
  /** Close on outside click */
  closeOnOutsideClick?: boolean;
}

// ============================================================================
// Vendor Libraries
// ============================================================================

/**
 * Vendor library configuration.
 * Allows reuse of common libraries across multiple tags.
 */
export interface VendorLibrary {
  /** Unique identifier */
  name: string;
  /** Library version */
  version: string;
  /** CDN URL for the library */
  url: string;
  /** Global variable name the library exposes */
  global?: string;
  /** Integrity hash for SRI */
  integrity?: string;
  /** Whether to load async */
  async?: boolean;
  /** Initialization function after load */
  init?: (context: VendorInitContext) => void | Promise<void>;
}

/**
 * Context for vendor library initialization.
 */
export interface VendorInitContext {
  /** The global object exposed by the library */
  library: unknown;
  /** Container configuration */
  config: ConfigDefinition;
  /** Environment */
  environment: Environment;
}

// ============================================================================
// Performance
// ============================================================================

/**
 * Performance budget configuration.
 */
export interface PerformanceBudget {
  /** Maximum total bundle size in KB */
  maxBundleSize?: number;
  /** Maximum load time in ms */
  maxLoadTime?: number;
  /** Maximum per-tag execution time in ms */
  maxTagExecutionTime?: number;
  /** Maximum total tags */
  maxTags?: number;
  /** Maximum tags per trigger */
  maxTagsPerTrigger?: number;
  /** Block deploys that exceed budget */
  blockOnExceed?: boolean;
  /** Send alerts when approaching budget */
  alertThreshold?: number;
}

/**
 * Tag execution telemetry.
 */
export interface TagTelemetry {
  /** Tag name */
  tagName: string;
  /** Trigger that fired the tag */
  triggerName: string;
  /** Execution start timestamp */
  startTime: number;
  /** Execution duration in ms */
  duration: number;
  /** Whether execution succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Page URL */
  url: string;
  /** Environment */
  environment: Environment;
}

// ============================================================================
// Build & Configuration
// ============================================================================

/**
 * Environment-specific configuration overrides.
 */
export interface EnvironmentConfig {
  /** Enable debug mode */
  debug?: boolean;
  /** Enable preview mode features */
  preview?: boolean;
  /** Custom CDN URL */
  cdnUrl?: string;
  /** Custom API endpoint */
  apiUrl?: string;
  /** Tags to enable/disable in this environment */
  tags?: {
    enable?: string[];
    disable?: string[];
  };
  /** Variables to override */
  variables?: Record<string, unknown>;
}

/**
 * Build configuration.
 */
export interface BuildConfig {
  /** Output directory */
  outDir?: string;
  /** Enable minification */
  minify?: boolean;
  /** Generate sourcemaps */
  sourcemap?: boolean;
  /** Target ES version */
  target?: 'es2020' | 'es2021' | 'es2022' | 'esnext';
  /** Enable tree-shaking */
  treeshake?: boolean;
  /** External dependencies (not bundled) */
  external?: string[];
  /** Code splitting */
  splitting?: boolean;
  /** Custom Rollup plugins */
  plugins?: unknown[];
}

/**
 * Main configuration definition for yourtm.config.ts.
 */
export interface ConfigDefinition {
  /** YourTM container ID */
  containerId: string;
  /** Human-readable container name */
  name?: string;
  /** Container description */
  description?: string;
  /**
   * Environment configurations.
   * Keys are environment names (development, staging, production).
   */
  environments: Partial<Record<Environment, EnvironmentConfig>>;
  /** Consent management configuration */
  consent?: ConsentConfig;
  /**
   * Vendor libraries shared across tags.
   * Loaded once and reused.
   */
  vendors?: VendorLibrary[];
  /** Build configuration */
  build?: BuildConfig;
  /** Performance budgets */
  performance?: PerformanceBudget;
  /** Default tag settings */
  defaults?: {
    /** Default consent requirements */
    consent?: ConsentCategory[];
    /** Default tag priority */
    priority?: number;
    /** Default performance budget per tag */
    performanceBudget?: number;
  };
  /** Preview mode configuration */
  preview?: {
    /** Enable preview mode */
    enabled?: boolean;
    /** Preview URL parameter name */
    paramName?: string;
    /** Preview token for authentication */
    token?: string;
  };
  /** Analytics/telemetry collection */
  telemetry?: {
    /** Enable telemetry */
    enabled?: boolean;
    /** Endpoint for sending telemetry */
    endpoint?: string;
    /** Sample rate (0-1) */
    sampleRate?: number;
    /** Include performance metrics */
    includePerformance?: boolean;
    /** Include error details */
    includeErrors?: boolean;
  };
}

// ============================================================================
// Telemetry & Preview
// ============================================================================

/**
 * Types of telemetry events for preview/debug mode.
 */
export enum TelemetryEventType {
  /** Tag execution started/completed */
  TagExecution = 'tag:execution',
  /** Trigger condition evaluated */
  TriggerEvaluation = 'trigger:evaluation',
  /** DataLayer.push() called */
  DataLayerPush = 'datalayer:push',
  /** Variable value resolved */
  VariableResolution = 'variable:resolution',
  /** Consent state changed */
  ConsentChange = 'consent:change',
  /** Container initialization */
  ContainerInit = 'container:init',
  /** Error occurred in runtime */
  Error = 'runtime:error',
}

/**
 * Base interface for all telemetry events.
 */
export interface BaseTelemetryEvent {
  /** Unique ID for the event instance */
  id: string;
  /** Type of event */
  type: TelemetryEventType;
  /** Container ID */
  containerId: string;
  /** Timestamp of the event */
  timestamp: number;
  /** Page URL where event occurred */
  url: string;
  /** Environment */
  environment: Environment;
}

/**
 * Telemetry for tag execution.
 */
export interface TagExecutionTelemetry extends BaseTelemetryEvent {
  type: TelemetryEventType.TagExecution;
  tagId: string;
  tagName: string;
  triggerId: string;
  triggerName: string;
  status: 'fired' | 'blocked' | 'error';
  latency: number;
  success: boolean;
  error?: string;
  zone?: string;
}

/**
 * Telemetry for trigger evaluation.
 */
export interface TriggerEvaluationTelemetry extends BaseTelemetryEvent {
  type: TelemetryEventType.TriggerEvaluation;
  triggerId: string;
  triggerName: string;
  result: boolean;
  conditions: Array<{
    variable: string;
    operator: string;
    value: unknown;
    actualValue: unknown;
    passed: boolean;
  }>;
}

/**
 * Telemetry for DataLayer pushes.
 */
export interface DataLayerPushTelemetry extends BaseTelemetryEvent {
  type: TelemetryEventType.DataLayerPush;
  payload: Record<string, unknown>;
  keyCount: number;
}

/**
 * Telemetry for variable resolution.
 */
export interface VariableResolutionTelemetry extends BaseTelemetryEvent {
  type: TelemetryEventType.VariableResolution;
  variableName: string;
  value: unknown;
  latency: number;
  fromCache: boolean;
}

/**
 * Telemetry for consent changes.
 */
export interface ConsentChangeTelemetry extends BaseTelemetryEvent {
  type: TelemetryEventType.ConsentChange;
  granted: ConsentCategory[];
  denied: ConsentCategory[];
  previousState: Record<ConsentCategory, boolean>;
}

/**
 * Unified Telemetry Event for WebSocket streaming and preview mode.
 */
export type TelemetryEvent =
  | TagExecutionTelemetry
  | TriggerEvaluationTelemetry
  | DataLayerPushTelemetry
  | VariableResolutionTelemetry
  | ConsentChangeTelemetry;

// ============================================================================
// Runtime Types
// ============================================================================

/**
 * Container runtime state.
 */
export interface ContainerState {
  /** Container ID */
  containerId: string;
  /** Current environment */
  environment: Environment;
  /** Whether container is initialized */
  initialized: boolean;
  /** Loaded tags */
  tags: Map<string, TagDefinition>;
  /** Loaded triggers */
  triggers: Map<string, TriggerDefinition>;
  /** Loaded variables */
  variables: Map<string, VariableDefinition>;
  /** Loaded zones */
  zones: Map<string, ZoneDefinition>;
  /** Current consent state */
  consent: ConsentState;
  /** Tag firing counts */
  firingCounts: Map<string, number>;
  /** Performance telemetry */
  telemetry: TagTelemetry[];
  /** Debug mode */
  debug: boolean;
}

/**
 * Event emitted when a tag fires.
 */
export interface TagFireEvent {
  /** Event type */
  type: 'tag:fire';
  /** Tag that fired */
  tag: TagDefinition;
  /** Trigger that caused the fire */
  trigger: TriggerDefinition;
  /** Execution context */
  context: TagExecuteContext;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Event emitted when tag execution completes.
 */
export interface TagCompleteEvent {
  /** Event type */
  type: 'tag:complete';
  /** Tag that completed */
  tag: TagDefinition;
  /** Whether execution was successful */
  success: boolean;
  /** Execution duration in ms */
  duration: number;
  /** Error if failed */
  error?: Error;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Event emitted when consent changes.
 */
export interface ConsentChangeEvent {
  /** Event type */
  type: 'consent:change';
  /** Previous consent state */
  previous: ConsentState;
  /** New consent state */
  current: ConsentState;
  /** Categories that changed */
  changed: {
    granted: ConsentCategory[];
    revoked: ConsentCategory[];
  };
  /** Timestamp */
  timestamp: Date;
}

/**
 * Union of all container events.
 */
export type ContainerEvent = TagFireEvent | TagCompleteEvent | ConsentChangeEvent;

/**
 * Event listener callback.
 */
export type ContainerEventListener<T extends ContainerEvent = ContainerEvent> = (
  event: T
) => void;
