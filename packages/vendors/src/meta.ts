/**
 * Meta (Facebook) Pixel wrapper
 * Provides type-safe access to Meta's fbq API
 */

import { loadScript, scriptLoaded, hashEmail, hashPhone } from './utils.js';

// ============================================================================
// Type Definitions
// ============================================================================

/** Meta Pixel standard events */
export type MetaStandardEvent =
  | 'AddPaymentInfo'
  | 'AddToCart'
  | 'AddToWishlist'
  | 'CompleteRegistration'
  | 'Contact'
  | 'CustomizeProduct'
  | 'Donate'
  | 'FindLocation'
  | 'InitiateCheckout'
  | 'Lead'
  | 'PageView'
  | 'Purchase'
  | 'Schedule'
  | 'Search'
  | 'StartTrial'
  | 'SubmitApplication'
  | 'Subscribe'
  | 'ViewContent';

/** Content info for ecommerce events */
export interface MetaContentInfo {
  content_ids?: string[];
  content_name?: string;
  content_type?: 'product' | 'product_group';
  contents?: Array<{
    id: string;
    quantity: number;
    item_price?: number;
  }>;
  currency?: string;
  value?: number;
}

/** Lead event parameters */
export interface MetaLeadParams {
  content_category?: string;
  content_name?: string;
  currency?: string;
  value?: number;
}

/** Purchase event parameters */
export interface MetaPurchaseParams {
  content_ids?: string[];
  content_name?: string;
  content_type?: 'product' | 'product_group';
  contents?: Array<{
    id: string;
    quantity: number;
    item_price?: number;
  }>;
  currency: string;
  value: number;
  num_items?: number;
}

/** Search event parameters */
export interface MetaSearchParams {
  content_category?: string;
  content_ids?: string[];
  contents?: Array<{
    id: string;
    quantity: number;
  }>;
  currency?: string;
  search_string?: string;
  value?: number;
}

/** ViewContent event parameters */
export interface MetaViewContentParams {
  content_ids?: string[];
  content_name?: string;
  content_type?: 'product' | 'product_group';
  contents?: Array<{
    id: string;
    quantity: number;
  }>;
  content_category?: string;
  currency?: string;
  value?: number;
}

/** Add to cart event parameters */
export interface MetaAddToCartParams {
  content_ids?: string[];
  content_name?: string;
  content_type?: 'product' | 'product_group';
  contents?: Array<{
    id: string;
    quantity: number;
    item_price?: number;
  }>;
  currency?: string;
  value?: number;
}

/** Initiate checkout event parameters */
export interface MetaInitiateCheckoutParams {
  content_ids?: string[];
  content_name?: string;
  content_type?: 'product' | 'product_group';
  contents?: Array<{
    id: string;
    quantity: number;
    item_price?: number;
  }>;
  currency?: string;
  value?: number;
  num_items?: number;
}

/** Complete registration event parameters */
export interface MetaCompleteRegistrationParams {
  content_name?: string;
  currency?: string;
  status?: string;
  value?: number;
}

/** Subscribe event parameters */
export interface MetaSubscribeParams {
  currency?: string;
  value?: number;
  predicted_ltv?: number;
}

/** User data for Advanced Matching */
export interface MetaUserData {
  em?: string; // Email (will be hashed if not already)
  ph?: string; // Phone (will be hashed if not already)
  fn?: string; // First name (will be hashed)
  ln?: string; // Last name (will be hashed)
  ge?: 'm' | 'f'; // Gender
  db?: string; // Date of birth (YYYYMMDD)
  ct?: string; // City (lowercase, no spaces)
  st?: string; // State (2-letter code)
  zp?: string; // Zip code
  country?: string; // Country (2-letter code)
  external_id?: string; // External ID
}

/** Event options */
export interface MetaEventOptions {
  eventID?: string;
}

/** fbq function type - callable interface */
export interface Fbq {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  push?: (...args: unknown[]) => void;
  loaded?: boolean;
  version?: string;
  queue?: unknown[][];
}

// ============================================================================
// Global Window Extension
// ============================================================================

declare global {
  interface Window {
    fbq: Fbq;
    _fbq: Fbq;
  }
}

// ============================================================================
// Loading State
// ============================================================================

let fbqPromise: Promise<void> | null = null;
let isInitialized = false;
let initializedPixels: Set<string> = new Set();

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Initialize the fbq function stub
 * Called automatically by loadFbq, but can be called early
 */
export function initFbq(): void {
  if (isInitialized) return;

  const n = window.fbq = function(...args: unknown[]) {
    if (n.callMethod) {
      n.callMethod(...args);
    } else {
      n.queue = n.queue || [];
      n.queue.push(args as unknown[]);
    }
  } as Fbq;

  if (!window._fbq) {
    window._fbq = n;
  }
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];

  isInitialized = true;
}

/**
 * Load Meta's Pixel library
 *
 * @param pixelId - Your Meta Pixel ID
 * @param userData - Optional user data for Advanced Matching
 * @returns Promise that resolves when fbevents.js is loaded
 *
 * @example
 * ```ts
 * await loadFbq('1234567890');
 * fbq('track', 'PageView');
 * ```
 */
export async function loadFbq(pixelId: string, userData?: MetaUserData): Promise<void> {
  // Initialize stub immediately
  initFbq();

  // Initialize this pixel if not already done
  if (!initializedPixels.has(pixelId)) {
    fbq('init', pixelId, userData);
    initializedPixels.add(pixelId);
  }

  // Return existing promise if script is already loading/loaded
  if (fbqPromise) {
    return fbqPromise;
  }

  // Load the script
  fbqPromise = loadScript('https://connect.facebook.net/en_US/fbevents.js');

  await fbqPromise;
}

/**
 * The fbq function - sends commands to Meta Pixel
 *
 * @example
 * ```ts
 * // Track page view
 * fbq('track', 'PageView');
 *
 * // Track purchase
 * fbq('track', 'Purchase', { value: 99.99, currency: 'USD' });
 *
 * // Track custom event
 * fbq('trackCustom', 'ButtonClick', { button_id: 'cta-1' });
 * ```
 */
export const fbq: Fbq = function fbq(...args: unknown[]): void {
  // Auto-initialize if not done
  if (!isInitialized) {
    initFbq();
  }
  window.fbq(...args);
};

// ============================================================================
// Standard Event Functions
// ============================================================================

/**
 * Track a page view
 */
export function trackPageView(options?: MetaEventOptions): void {
  fbq('track', 'PageView', undefined, options);
}

/**
 * Track view content
 */
export function trackViewContent(params: MetaViewContentParams, options?: MetaEventOptions): void {
  fbq('track', 'ViewContent', params, options);
}

/**
 * Track add to cart
 */
export function trackAddToCart(params: MetaAddToCartParams, options?: MetaEventOptions): void {
  fbq('track', 'AddToCart', params, options);
}

/**
 * Track add to wishlist
 */
export function trackAddToWishlist(params: MetaContentInfo, options?: MetaEventOptions): void {
  fbq('track', 'AddToWishlist', params, options);
}

/**
 * Track initiate checkout
 */
export function trackInitiateCheckout(params: MetaInitiateCheckoutParams, options?: MetaEventOptions): void {
  fbq('track', 'InitiateCheckout', params, options);
}

/**
 * Track add payment info
 */
export function trackAddPaymentInfo(params?: MetaContentInfo, options?: MetaEventOptions): void {
  fbq('track', 'AddPaymentInfo', params, options);
}

/**
 * Track purchase
 */
export function trackPurchase(params: MetaPurchaseParams, options?: MetaEventOptions): void {
  fbq('track', 'Purchase', params, options);
}

/**
 * Track lead
 */
export function trackLead(params?: MetaLeadParams, options?: MetaEventOptions): void {
  fbq('track', 'Lead', params, options);
}

/**
 * Track complete registration
 */
export function trackCompleteRegistration(params?: MetaCompleteRegistrationParams, options?: MetaEventOptions): void {
  fbq('track', 'CompleteRegistration', params, options);
}

/**
 * Track search
 */
export function trackSearch(params: MetaSearchParams, options?: MetaEventOptions): void {
  fbq('track', 'Search', params, options);
}

/**
 * Track contact
 */
export function trackContact(options?: MetaEventOptions): void {
  fbq('track', 'Contact', undefined, options);
}

/**
 * Track subscribe
 */
export function trackSubscribe(params: MetaSubscribeParams, options?: MetaEventOptions): void {
  fbq('track', 'Subscribe', params, options);
}

/**
 * Track start trial
 */
export function trackStartTrial(params?: { currency?: string; value?: number; predicted_ltv?: number }, options?: MetaEventOptions): void {
  fbq('track', 'StartTrial', params, options);
}

/**
 * Track custom event
 */
export function trackCustom(eventName: string, params?: Record<string, unknown>, options?: MetaEventOptions): void {
  fbq('trackCustom', eventName, params, options);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Grant consent for pixel tracking
 */
export function grantConsent(): void {
  fbq('consent', 'grant');
}

/**
 * Revoke consent for pixel tracking
 */
export function revokeConsent(): void {
  fbq('consent', 'revoke');
}

/**
 * Hash user data for Advanced Matching
 * Returns hashed version of email and phone if provided
 */
export async function hashUserData(userData: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  dateOfBirth?: string;
  gender?: 'm' | 'f';
  externalId?: string;
}): Promise<MetaUserData> {
  const result: MetaUserData = {};

  if (userData.email) {
    result.em = await hashEmail(userData.email);
  }
  if (userData.phone) {
    result.ph = await hashPhone(userData.phone);
  }
  if (userData.firstName) {
    result.fn = userData.firstName.toLowerCase().trim();
  }
  if (userData.lastName) {
    result.ln = userData.lastName.toLowerCase().trim();
  }
  if (userData.city) {
    result.ct = userData.city.toLowerCase().replace(/\s+/g, '');
  }
  if (userData.state) {
    result.st = userData.state.toLowerCase().trim();
  }
  if (userData.zipCode) {
    result.zp = userData.zipCode.trim();
  }
  if (userData.country) {
    result.country = userData.country.toLowerCase().trim();
  }
  if (userData.dateOfBirth) {
    result.db = userData.dateOfBirth.replace(/[-/]/g, '');
  }
  if (userData.gender) {
    result.ge = userData.gender;
  }
  if (userData.externalId) {
    result.external_id = userData.externalId;
  }

  return result;
}

/**
 * Check if Meta Pixel is loaded
 */
export function isFbqLoaded(): boolean {
  return scriptLoaded('fbq') && isInitialized;
}

/**
 * Generate an event ID for deduplication
 */
export function generateEventId(): string {
  return `${Date.now()}.${Math.random().toString(36).substring(2, 15)}`;
}
