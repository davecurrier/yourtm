/**
 * Twitter (X) Pixel wrapper
 * Provides type-safe access to Twitter's twq API
 */

import { loadScript, scriptLoaded, hashEmail, hashPhone } from './utils.js';

// ============================================================================
// Type Definitions
// ============================================================================

/** Twitter standard events */
export type TwitterStandardEvent =
  | 'PageView'
  | 'ViewContent'
  | 'Search'
  | 'AddToCart'
  | 'AddToWishlist'
  | 'InitiateCheckout'
  | 'AddPaymentInfo'
  | 'Purchase'
  | 'CompleteRegistration'
  | 'Download'
  | 'Lead'
  | 'Subscribe'
  | 'StartTrial'
  | 'CustomEvent';

/** Twitter event parameters */
export interface TwitterEventParams {
  // Content parameters
  content_ids?: string[];
  content_type?: string;
  content_name?: string;
  content_category?: string;
  num_items?: number;

  // Value parameters
  value?: number;
  currency?: string;
  order_id?: string;

  // Search
  search_string?: string;

  // Custom event
  event_id?: string;

  // Conversion ID (for specific conversion tracking)
  conversion_id?: string;

  // Custom parameters
  [key: string]: unknown;
}

/** Twitter user data for Enhanced Conversions */
export interface TwitterUserData {
  email?: string;
  phone_number?: string;
  email_sha256?: string;
  phone_sha256?: string;
}

/** Twitter init options */
export interface TwitterInitOptions {
  restricted_data_use?: boolean;
}

/** twq function type */
export interface Twq {
  (command: 'init', pixelId: string, options?: TwitterInitOptions): void;
  (command: 'track', eventName: TwitterStandardEvent | string, params?: TwitterEventParams): void;
  (command: 'set', params: Record<string, unknown>): void;
  (command: 'consent', consentType: 'granted' | 'denied'): void;
  (command: 'event', eventId: string, params?: TwitterEventParams): void;
  (command: 'config', pixelId: string, options?: TwitterInitOptions): void;
  exe?: (...args: unknown[]) => void;
  version?: string;
  queue?: unknown[][];
}

// ============================================================================
// Global Window Extension
// ============================================================================

declare global {
  interface Window {
    twq: Twq;
  }
}

// ============================================================================
// Loading State
// ============================================================================

let twqPromise: Promise<void> | null = null;
let isInitialized = false;
let initializedPixels: Set<string> = new Set();

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Initialize the twq function stub
 * Called automatically by loadTwq, but can be called early
 */
export function initTwq(): void {
  if (isInitialized) return;

  const twq = window.twq = function(...args: unknown[]) {
    if (twq.exe) {
      twq.exe(...args);
    } else {
      twq.queue = twq.queue || [];
      twq.queue.push(args as unknown[]);
    }
  } as Twq;

  twq.version = '1.1';
  twq.queue = [];

  isInitialized = true;
}

/**
 * Load Twitter Pixel library
 *
 * @param pixelId - Your Twitter Pixel ID
 * @param options - Optional initialization options
 * @returns Promise that resolves when uwt.js is loaded
 *
 * @example
 * ```ts
 * await loadTwq('xxxxxx');
 * twq('track', 'PageView');
 * ```
 */
export async function loadTwq(pixelId: string, options?: TwitterInitOptions): Promise<void> {
  // Initialize stub immediately
  initTwq();

  // Initialize this pixel if not already done
  if (!initializedPixels.has(pixelId)) {
    twq('init', pixelId, options);
    initializedPixels.add(pixelId);
  }

  // Return existing promise if script is already loading/loaded
  if (twqPromise) {
    return twqPromise;
  }

  // Load the script
  twqPromise = loadScript('https://static.ads-twitter.com/uwt.js');

  await twqPromise;
}

/**
 * The twq function - sends commands to Twitter Pixel
 *
 * @example
 * ```ts
 * // Track page view
 * twq('track', 'PageView');
 *
 * // Track purchase
 * twq('track', 'Purchase', {
 *   value: 99.99,
 *   currency: 'USD',
 *   order_id: 'order-123'
 * });
 * ```
 */
export const twq: Twq = function twq(...args: unknown[]): void {
  // Auto-initialize if not done
  if (!isInitialized) {
    initTwq();
  }
  (window.twq as Twq)(...(args as Parameters<Twq>));
};

// ============================================================================
// Standard Event Functions
// ============================================================================

/**
 * Track a page view
 */
export function trackPageView(): void {
  twq('track', 'PageView');
}

/**
 * Track view content
 */
export function trackViewContent(params: {
  content_ids?: string[];
  content_type?: string;
  content_name?: string;
  content_category?: string;
  value?: number;
  currency?: string;
}): void {
  twq('track', 'ViewContent', params);
}

/**
 * Track search
 */
export function trackSearch(params: {
  search_string: string;
  content_ids?: string[];
  content_type?: string;
  num_items?: number;
}): void {
  twq('track', 'Search', params);
}

/**
 * Track add to cart
 */
export function trackAddToCart(params: {
  content_ids?: string[];
  content_type?: string;
  content_name?: string;
  value?: number;
  currency?: string;
  num_items?: number;
}): void {
  twq('track', 'AddToCart', params);
}

/**
 * Track add to wishlist
 */
export function trackAddToWishlist(params: {
  content_ids?: string[];
  content_type?: string;
  content_name?: string;
  value?: number;
  currency?: string;
}): void {
  twq('track', 'AddToWishlist', params);
}

/**
 * Track initiate checkout
 */
export function trackInitiateCheckout(params: {
  content_ids?: string[];
  content_type?: string;
  value?: number;
  currency?: string;
  num_items?: number;
}): void {
  twq('track', 'InitiateCheckout', params);
}

/**
 * Track add payment info
 */
export function trackAddPaymentInfo(params?: {
  content_ids?: string[];
  content_type?: string;
  value?: number;
  currency?: string;
}): void {
  twq('track', 'AddPaymentInfo', params);
}

/**
 * Track purchase
 */
export function trackPurchase(params: {
  value: number;
  currency: string;
  order_id?: string;
  content_ids?: string[];
  content_type?: string;
  num_items?: number;
}): void {
  twq('track', 'Purchase', params);
}

/**
 * Track complete registration
 */
export function trackCompleteRegistration(params?: {
  content_name?: string;
  value?: number;
  currency?: string;
}): void {
  twq('track', 'CompleteRegistration', params);
}

/**
 * Track download
 */
export function trackDownload(params?: {
  content_ids?: string[];
  content_name?: string;
  content_category?: string;
}): void {
  twq('track', 'Download', params);
}

/**
 * Track lead
 */
export function trackLead(params?: {
  content_name?: string;
  content_category?: string;
  value?: number;
  currency?: string;
}): void {
  twq('track', 'Lead', params);
}

/**
 * Track subscribe
 */
export function trackSubscribe(params?: {
  value?: number;
  currency?: string;
}): void {
  twq('track', 'Subscribe', params);
}

/**
 * Track start trial
 */
export function trackStartTrial(params?: {
  value?: number;
  currency?: string;
}): void {
  twq('track', 'StartTrial', params);
}

/**
 * Track custom event
 */
export function trackCustomEvent(eventName: string, params?: TwitterEventParams): void {
  twq('track', eventName as TwitterStandardEvent, params);
}

/**
 * Track a specific conversion event by ID
 */
export function trackConversion(eventId: string, params?: TwitterEventParams): void {
  twq('event', eventId, params);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Set global parameters
 */
export function setParams(params: Record<string, unknown>): void {
  twq('set', params);
}

/**
 * Grant consent
 */
export function grantConsent(): void {
  twq('consent', 'granted');
}

/**
 * Deny consent
 */
export function denyConsent(): void {
  twq('consent', 'denied');
}

/**
 * Configure pixel with additional options
 */
export function configure(pixelId: string, options?: TwitterInitOptions): void {
  twq('config', pixelId, options);
}

/**
 * Enable restricted data use (for CCPA compliance)
 */
export function enableRestrictedDataUse(pixelId: string): void {
  twq('config', pixelId, { restricted_data_use: true });
}

/**
 * Hash user data for Enhanced Conversions
 */
export async function hashUserData(userData: {
  email?: string;
  phone?: string;
}): Promise<TwitterUserData> {
  const result: TwitterUserData = {};

  if (userData.email) {
    result.email_sha256 = await hashEmail(userData.email);
  }
  if (userData.phone) {
    result.phone_sha256 = await hashPhone(userData.phone);
  }

  return result;
}

/**
 * Check if Twitter Pixel is loaded
 */
export function isTwqLoaded(): boolean {
  return scriptLoaded('twq') && isInitialized;
}

/**
 * Generate an order ID for deduplication
 */
export function generateOrderId(): string {
  return `${Date.now()}.${Math.random().toString(36).substring(2, 15)}`;
}
