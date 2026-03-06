/**
 * TikTok Pixel wrapper
 * Provides type-safe access to TikTok's ttq API
 */

import { scriptLoaded, hashEmail, hashPhone } from './utils.js';

// ============================================================================
// Type Definitions
// ============================================================================

/** TikTok standard events */
export type TikTokStandardEvent =
  | 'ViewContent'
  | 'ClickButton'
  | 'Search'
  | 'AddToWishlist'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'AddPaymentInfo'
  | 'CompletePayment'
  | 'PlaceAnOrder'
  | 'Contact'
  | 'Download'
  | 'SubmitForm'
  | 'CompleteRegistration'
  | 'Subscribe';

/** Content info for ecommerce events */
export interface TikTokContentInfo {
  content_id?: string;
  content_type?: 'product' | 'product_group';
  content_name?: string;
  content_category?: string;
  quantity?: number;
  price?: number;
  brand?: string;
}

/** Common event parameters */
export interface TikTokEventParams {
  contents?: TikTokContentInfo[];
  content_id?: string;
  content_type?: 'product' | 'product_group';
  content_name?: string;
  content_category?: string;
  currency?: string;
  value?: number;
  quantity?: number;
  description?: string;
  query?: string;
  [key: string]: unknown;
}

/** User data for Advanced Matching */
export interface TikTokUserData {
  email?: string; // Will be hashed
  phone_number?: string; // Will be hashed
  external_id?: string;
}

/** Page properties */
export interface TikTokPageProperties {
  url?: string;
  referrer?: string;
}

/** Identify properties */
export interface TikTokIdentifyProperties {
  email?: string;
  phone_number?: string;
  external_id?: string;
  [key: string]: unknown;
}

/** ttq object type */
export interface Ttq {
  load: (pixelId: string) => void;
  page: (properties?: TikTokPageProperties) => void;
  track: (eventName: TikTokStandardEvent | string, params?: TikTokEventParams, options?: { event_id?: string }) => void;
  identify: (properties: TikTokIdentifyProperties) => void;
  enableCookie: () => void;
  disableCookie: () => void;
  holdConsent: () => void;
  grantConsent: () => void;
  revokeConsent: () => void;
  setUserData: (userData: TikTokUserData) => void;
  debug: (enabled: boolean) => void;
  instance: (pixelId: string) => TtqInstance;
  _i?: Record<string, unknown>;
  _t?: Record<string, unknown>;
  _o?: Record<string, unknown>;
  _q?: unknown[];
  [key: string]: unknown;
}

/** ttq instance for specific pixel */
export interface TtqInstance {
  page: (properties?: TikTokPageProperties) => void;
  track: (eventName: TikTokStandardEvent | string, params?: TikTokEventParams, options?: { event_id?: string }) => void;
  identify: (properties: TikTokIdentifyProperties) => void;
}

// ============================================================================
// Global Window Extension
// ============================================================================

declare global {
  interface Window {
    ttq: Ttq;
    TiktokAnalyticsObject: string;
  }
}

// ============================================================================
// Loading State
// ============================================================================

let ttqPromise: Promise<void> | null = null;
let isInitialized = false;
let loadedPixels: Set<string> = new Set();

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Initialize the ttq function stub
 * Called automatically by loadTtq, but can be called early
 */
export function initTtq(): void {
  if (isInitialized) return;

  window.TiktokAnalyticsObject = 'ttq';

  const ttq = window.ttq = window.ttq || {} as Ttq;

  ttq._i = ttq._i || {};
  ttq._t = ttq._t || {};
  ttq._o = ttq._o || {};

  // Create method stubs
  const methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'grantConsent', 'revokeConsent'];

  methods.forEach((method) => {
    (ttq as Record<string, unknown>)[method] = (ttq as Record<string, unknown>)[method] || function(...args: unknown[]) {
      const queue = (ttq as Record<string, unknown[]>)._q = (ttq as Record<string, unknown[]>)._q || [];
      queue.push([method, ...args]);
    };
  });

  ttq.load = ttq.load || function(pixelId: string) {
    const n = 'ttq';
    const i = window[n as keyof Window] as Ttq;
    i._i = i._i || {};
    i._i[pixelId] = [];
    i._t = i._t || {};
    i._t[pixelId] = +new Date();
    i._o = i._o || {};
    i._o[pixelId] = {};

    const o = document.createElement('script');
    o.type = 'text/javascript';
    o.async = true;
    o.src = 'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + pixelId + '&lib=' + n;
    const e = document.getElementsByTagName('script')[0];
    e.parentNode?.insertBefore(o, e);
  };

  ttq.instance = ttq.instance || function(_pixelId: string): TtqInstance {
    return {
      page: (properties?: TikTokPageProperties) => ttq.page(properties),
      track: (eventName: string, params?: TikTokEventParams, options?: { event_id?: string }) => ttq.track(eventName, params, options),
      identify: (properties: TikTokIdentifyProperties) => ttq.identify(properties),
    };
  };

  isInitialized = true;
}

/**
 * Load TikTok Pixel library
 *
 * @param pixelId - Your TikTok Pixel ID
 * @returns Promise that resolves when events.js is loaded
 *
 * @example
 * ```ts
 * await loadTtq('XXXXXXXXXX');
 * ttq.page();
 * ttq.track('ViewContent', { content_id: 'product-1' });
 * ```
 */
export async function loadTtq(pixelId: string): Promise<void> {
  // Initialize stub immediately
  initTtq();

  // Load this pixel if not already done
  if (!loadedPixels.has(pixelId)) {
    window.ttq.load(pixelId);
    loadedPixels.add(pixelId);
  }

  // Return existing promise if script is already loading/loaded
  if (ttqPromise) {
    return ttqPromise;
  }

  // Wait for script to load (it's loaded by ttq.load)
  ttqPromise = new Promise((resolve) => {
    const checkLoaded = () => {
      if (window.ttq && typeof window.ttq.track === 'function' && !((window.ttq.track as unknown as Record<string, unknown>).toString?.().includes('_q'))) {
        resolve();
      } else {
        setTimeout(checkLoaded, 50);
      }
    };
    // Give initial time for script to start loading
    setTimeout(checkLoaded, 100);
  });

  await ttqPromise;
}

// ============================================================================
// Convenience Functions (using window.ttq directly)
// ============================================================================

/**
 * Track a page view
 */
export function trackPage(properties?: TikTokPageProperties): void {
  if (!isInitialized) initTtq();
  window.ttq.page(properties);
}

/**
 * Track an event
 */
export function track(eventName: TikTokStandardEvent | string, params?: TikTokEventParams, options?: { event_id?: string }): void {
  if (!isInitialized) initTtq();
  window.ttq.track(eventName, params, options);
}

/**
 * Identify a user
 */
export function identify(properties: TikTokIdentifyProperties): void {
  if (!isInitialized) initTtq();
  window.ttq.identify(properties);
}

// ============================================================================
// Standard Event Functions
// ============================================================================

/**
 * Track view content
 */
export function trackViewContent(params: {
  content_id?: string;
  content_type?: 'product' | 'product_group';
  content_name?: string;
  content_category?: string;
  currency?: string;
  value?: number;
  contents?: TikTokContentInfo[];
}, options?: { event_id?: string }): void {
  track('ViewContent', params, options);
}

/**
 * Track click button
 */
export function trackClickButton(params?: TikTokEventParams, options?: { event_id?: string }): void {
  track('ClickButton', params, options);
}

/**
 * Track search
 */
export function trackSearch(params: {
  query: string;
  contents?: TikTokContentInfo[];
}, options?: { event_id?: string }): void {
  track('Search', params, options);
}

/**
 * Track add to wishlist
 */
export function trackAddToWishlist(params: {
  content_id?: string;
  content_type?: 'product' | 'product_group';
  content_name?: string;
  currency?: string;
  value?: number;
  contents?: TikTokContentInfo[];
}, options?: { event_id?: string }): void {
  track('AddToWishlist', params, options);
}

/**
 * Track add to cart
 */
export function trackAddToCart(params: {
  content_id?: string;
  content_type?: 'product' | 'product_group';
  content_name?: string;
  currency?: string;
  value?: number;
  quantity?: number;
  contents?: TikTokContentInfo[];
}, options?: { event_id?: string }): void {
  track('AddToCart', params, options);
}

/**
 * Track initiate checkout
 */
export function trackInitiateCheckout(params: {
  content_id?: string;
  content_type?: 'product' | 'product_group';
  currency?: string;
  value?: number;
  quantity?: number;
  contents?: TikTokContentInfo[];
}, options?: { event_id?: string }): void {
  track('InitiateCheckout', params, options);
}

/**
 * Track add payment info
 */
export function trackAddPaymentInfo(params?: {
  content_id?: string;
  content_type?: 'product' | 'product_group';
  currency?: string;
  value?: number;
  contents?: TikTokContentInfo[];
}, options?: { event_id?: string }): void {
  track('AddPaymentInfo', params, options);
}

/**
 * Track complete payment (purchase)
 */
export function trackCompletePayment(params: {
  content_id?: string;
  content_type?: 'product' | 'product_group';
  content_name?: string;
  currency: string;
  value: number;
  quantity?: number;
  contents?: TikTokContentInfo[];
}, options?: { event_id?: string }): void {
  track('CompletePayment', params, options);
}

/**
 * Track place an order
 */
export function trackPlaceAnOrder(params: {
  content_id?: string;
  content_type?: 'product' | 'product_group';
  currency: string;
  value: number;
  quantity?: number;
  contents?: TikTokContentInfo[];
}, options?: { event_id?: string }): void {
  track('PlaceAnOrder', params, options);
}

/**
 * Track contact
 */
export function trackContact(params?: TikTokEventParams, options?: { event_id?: string }): void {
  track('Contact', params, options);
}

/**
 * Track download
 */
export function trackDownload(params?: TikTokEventParams, options?: { event_id?: string }): void {
  track('Download', params, options);
}

/**
 * Track form submission
 */
export function trackSubmitForm(params?: TikTokEventParams, options?: { event_id?: string }): void {
  track('SubmitForm', params, options);
}

/**
 * Track complete registration
 */
export function trackCompleteRegistration(params?: {
  content_id?: string;
  currency?: string;
  value?: number;
}, options?: { event_id?: string }): void {
  track('CompleteRegistration', params, options);
}

/**
 * Track subscribe
 */
export function trackSubscribe(params?: {
  currency?: string;
  value?: number;
}, options?: { event_id?: string }): void {
  track('Subscribe', params, options);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Enable cookies
 */
export function enableCookie(): void {
  if (!isInitialized) initTtq();
  window.ttq.enableCookie();
}

/**
 * Disable cookies
 */
export function disableCookie(): void {
  if (!isInitialized) initTtq();
  window.ttq.disableCookie();
}

/**
 * Hold consent (wait for consent before firing)
 */
export function holdConsent(): void {
  if (!isInitialized) initTtq();
  window.ttq.holdConsent();
}

/**
 * Grant consent
 */
export function grantConsent(): void {
  if (!isInitialized) initTtq();
  window.ttq.grantConsent();
}

/**
 * Revoke consent
 */
export function revokeConsent(): void {
  if (!isInitialized) initTtq();
  window.ttq.revokeConsent();
}

/**
 * Enable/disable debug mode
 */
export function debug(enabled: boolean): void {
  if (!isInitialized) initTtq();
  window.ttq.debug(enabled);
}

/**
 * Hash user data for Advanced Matching
 */
export async function hashUserData(userData: {
  email?: string;
  phone?: string;
  externalId?: string;
}): Promise<TikTokUserData> {
  const result: TikTokUserData = {};

  if (userData.email) {
    result.email = await hashEmail(userData.email);
  }
  if (userData.phone) {
    result.phone_number = await hashPhone(userData.phone);
  }
  if (userData.externalId) {
    result.external_id = userData.externalId;
  }

  return result;
}

/**
 * Check if TikTok Pixel is loaded
 */
export function isTtqLoaded(): boolean {
  return scriptLoaded('ttq') && isInitialized;
}

/**
 * Get a pixel instance for multi-pixel setups
 */
export function getInstance(pixelId: string): TtqInstance {
  if (!isInitialized) initTtq();
  return window.ttq.instance(pixelId);
}

/**
 * Generate an event ID for deduplication
 */
export function generateEventId(): string {
  return `${Date.now()}.${Math.random().toString(36).substring(2, 15)}`;
}

// Re-export the ttq object getter
export const ttq = {
  get current(): Ttq {
    if (!isInitialized) initTtq();
    return window.ttq;
  }
};
