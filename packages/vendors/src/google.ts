/**
 * Google Analytics 4 (gtag.js) wrapper
 * Provides type-safe access to Google's gtag API
 */

import { loadScript, scriptLoaded } from './utils.js';

// ============================================================================
// Type Definitions
// ============================================================================

/** gtag.js command types */
export type GtagCommand = 'config' | 'event' | 'set' | 'get' | 'consent' | 'js';

/** Common GA4 event names */
export type GA4StandardEvent =
  | 'page_view'
  | 'scroll'
  | 'click'
  | 'view_search_results'
  | 'file_download'
  | 'video_start'
  | 'video_progress'
  | 'video_complete'
  // Ecommerce events
  | 'view_item'
  | 'view_item_list'
  | 'select_item'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'view_cart'
  | 'begin_checkout'
  | 'add_shipping_info'
  | 'add_payment_info'
  | 'purchase'
  | 'refund'
  // Lead generation
  | 'generate_lead'
  | 'sign_up'
  | 'login'
  | 'search'
  | 'share'
  | 'select_content'
  | 'select_promotion'
  | 'view_promotion';

/** GA4 item object for ecommerce */
export interface GA4Item {
  item_id?: string;
  item_name?: string;
  affiliation?: string;
  coupon?: string;
  discount?: number;
  index?: number;
  item_brand?: string;
  item_category?: string;
  item_category2?: string;
  item_category3?: string;
  item_category4?: string;
  item_category5?: string;
  item_list_id?: string;
  item_list_name?: string;
  item_variant?: string;
  location_id?: string;
  price?: number;
  quantity?: number;
}

/** GA4 event parameters */
export interface GA4EventParams {
  // Common parameters
  send_to?: string | string[];
  event_callback?: () => void;
  event_timeout?: number;

  // Page view
  page_title?: string;
  page_location?: string;
  page_path?: string;

  // Ecommerce
  currency?: string;
  value?: number;
  items?: GA4Item[];
  transaction_id?: string;
  affiliation?: string;
  coupon?: string;
  shipping?: number;
  tax?: number;

  // User properties
  user_id?: string;
  user_properties?: Record<string, unknown>;

  // Custom parameters
  [key: string]: unknown;
}

/** GA4 config parameters */
export interface GA4ConfigParams {
  send_page_view?: boolean;
  cookie_domain?: string;
  cookie_expires?: number;
  cookie_prefix?: string;
  cookie_update?: boolean;
  cookie_flags?: string;
  user_id?: string;
  user_properties?: Record<string, unknown>;
  debug_mode?: boolean;
  anonymize_ip?: boolean;
  allow_google_signals?: boolean;
  allow_ad_personalization_signals?: boolean;
  page_title?: string;
  page_location?: string;
  page_path?: string;
  linker?: {
    domains?: string[];
    decorate_forms?: boolean;
    accept_incoming?: boolean;
  };
  groups?: string | string[];
  transport_url?: string;
  first_party_collection?: boolean;
  [key: string]: unknown;
}

/** Consent mode parameters */
export interface GtagConsentParams {
  ad_storage?: 'granted' | 'denied';
  analytics_storage?: 'granted' | 'denied';
  functionality_storage?: 'granted' | 'denied';
  personalization_storage?: 'granted' | 'denied';
  security_storage?: 'granted' | 'denied';
  ad_user_data?: 'granted' | 'denied';
  ad_personalization?: 'granted' | 'denied';
  wait_for_update?: number;
  region?: string[];
}

/** gtag function type - overloaded for different commands */
export interface Gtag {
  (command: 'js', date: Date): void;
  (command: 'config', targetId: string, config?: GA4ConfigParams): void;
  (command: 'event', eventName: string | GA4StandardEvent, params?: GA4EventParams): void;
  (command: 'set', params: Record<string, unknown>): void;
  (command: 'set', targetId: string, params: Record<string, unknown>): void;
  (command: 'get', targetId: string, fieldName: string, callback: (value: unknown) => void): void;
  (command: 'consent', consentArg: 'default' | 'update', params: GtagConsentParams): void;
}

// ============================================================================
// Global Window Extension
// ============================================================================

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: Gtag;
  }
}

// ============================================================================
// Loading State
// ============================================================================

let gtagPromise: Promise<void> | null = null;
let isInitialized = false;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Initialize the dataLayer and gtag function stub
 * Called automatically by loadGtag, but can be called early
 */
export function initGtag(): void {
  if (isInitialized) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  };

  isInitialized = true;
}

/**
 * Load Google's gtag.js library
 *
 * @param measurementId - Your GA4 measurement ID (e.g., 'G-XXXXXXXXXX')
 * @returns Promise that resolves when gtag.js is loaded
 *
 * @example
 * ```ts
 * await loadGtag('G-XXXXXXXXXX');
 * gtag('event', 'page_view');
 * ```
 */
export async function loadGtag(measurementId: string): Promise<void> {
  // Return existing promise if already loading/loaded
  if (gtagPromise) {
    return gtagPromise;
  }

  // Initialize gtag stub immediately
  initGtag();

  // Set js timestamp
  gtag('js', new Date());

  // Load the script
  gtagPromise = loadScript(
    `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
  );

  await gtagPromise;
}

/**
 * The gtag function - sends commands to Google Analytics
 *
 * @example
 * ```ts
 * // Track page view
 * gtag('event', 'page_view', { page_title: 'Home' });
 *
 * // Track custom event
 * gtag('event', 'button_click', { button_id: 'cta-1' });
 *
 * // Configure GA4
 * gtag('config', 'G-XXXXXXXXXX', { send_page_view: false });
 * ```
 */
export const gtag: Gtag = function gtag(...args: unknown[]): void {
  // Auto-initialize if not done
  if (!isInitialized) {
    initGtag();
  }
  window.dataLayer.push(args);
};

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Configure a GA4 property
 */
export function configureGA4(measurementId: string, config?: GA4ConfigParams): void {
  gtag('config', measurementId, config);
}

/**
 * Track a page view
 */
export function trackPageView(params?: {
  page_title?: string;
  page_location?: string;
  page_path?: string;
  send_to?: string;
}): void {
  gtag('event', 'page_view', params);
}

/**
 * Track an ecommerce purchase
 */
export function trackPurchase(params: {
  transaction_id: string;
  value: number;
  currency: string;
  items: GA4Item[];
  tax?: number;
  shipping?: number;
  coupon?: string;
  affiliation?: string;
}): void {
  gtag('event', 'purchase', params);
}

/**
 * Track add to cart
 */
export function trackAddToCart(params: {
  value: number;
  currency: string;
  items: GA4Item[];
}): void {
  gtag('event', 'add_to_cart', params);
}

/**
 * Track view item
 */
export function trackViewItem(params: {
  value: number;
  currency: string;
  items: GA4Item[];
}): void {
  gtag('event', 'view_item', params);
}

/**
 * Track begin checkout
 */
export function trackBeginCheckout(params: {
  value: number;
  currency: string;
  items: GA4Item[];
  coupon?: string;
}): void {
  gtag('event', 'begin_checkout', params);
}

/**
 * Set user properties
 */
export function setUserProperties(properties: Record<string, unknown>): void {
  gtag('set', { user_properties: properties });
}

/**
 * Set user ID
 */
export function setUserId(userId: string): void {
  gtag('set', { user_id: userId });
}

/**
 * Set consent mode defaults
 */
export function setConsentDefaults(params: GtagConsentParams): void {
  gtag('consent', 'default', params);
}

/**
 * Update consent mode
 */
export function updateConsent(params: GtagConsentParams): void {
  gtag('consent', 'update', params);
}

/**
 * Check if gtag is loaded
 */
export function isGtagLoaded(): boolean {
  return scriptLoaded('gtag') && isInitialized;
}
