/**
 * Snapchat Pixel wrapper
 * Provides type-safe access to Snapchat's snaptr API
 */

import { loadScript, scriptLoaded, hashEmail, hashPhone } from './utils.js';

// ============================================================================
// Type Definitions
// ============================================================================

/** Snapchat standard events */
export type SnapchatStandardEvent =
  | 'PAGE_VIEW'
  | 'VIEW_CONTENT'
  | 'ADD_CART'
  | 'ADD_BILLING'
  | 'ADD_TO_WISHLIST'
  | 'START_CHECKOUT'
  | 'PURCHASE'
  | 'SEARCH'
  | 'SIGN_UP'
  | 'APP_INSTALL'
  | 'APP_OPEN'
  | 'SAVE'
  | 'SUBSCRIBE'
  | 'COMPLETE_TUTORIAL'
  | 'INVITE'
  | 'LOGIN'
  | 'SHARE'
  | 'RESERVE'
  | 'ACHIEVEMENT_UNLOCKED'
  | 'SPENT_CREDITS'
  | 'RATE'
  | 'START_TRIAL'
  | 'LIST_VIEW';

/** Snapchat event parameters */
export interface SnapchatEventParams {
  // Content parameters
  item_ids?: string[];
  item_category?: string;
  description?: string;
  number_items?: number;
  price?: number;
  currency?: string;
  transaction_id?: string;
  payment_info_available?: boolean;

  // Search parameters
  search_string?: string;

  // User parameters
  user_email?: string; // Will be hashed
  user_phone_number?: string; // Will be hashed
  user_hashed_email?: string;
  user_hashed_phone_number?: string;

  // Level/achievement
  level?: number;

  // Custom parameters
  [key: string]: unknown;
}

/** Snapchat user data for Advanced Matching */
export interface SnapchatUserData {
  user_email?: string;
  user_phone_number?: string;
  user_hashed_email?: string;
  user_hashed_phone_number?: string;
}

/** Snapchat init options */
export interface SnapchatInitOptions {
  user_email?: string;
  user_phone_number?: string;
  user_hashed_email?: string;
  user_hashed_phone_number?: string;
}

/** snaptr function type */
export interface Snaptr {
  (...args: unknown[]): void;
  handleRequest?: (...args: unknown[]) => void;
  queue?: unknown[][];
}

// ============================================================================
// Global Window Extension
// ============================================================================

declare global {
  interface Window {
    snaptr: Snaptr;
  }
}

// ============================================================================
// Loading State
// ============================================================================

let snaptrPromise: Promise<void> | null = null;
let isInitialized = false;
let initializedPixels: Set<string> = new Set();

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Initialize the snaptr function stub
 * Called automatically by loadSnap, but can be called early
 */
export function initSnaptr(): void {
  if (isInitialized) return;

  const tr = window.snaptr = function(...args: unknown[]) {
    if (tr.handleRequest) {
      tr.handleRequest.call(tr, ...args);
    } else {
      tr.queue = tr.queue || [];
      tr.queue.push(args as unknown[]);
    }
  } as Snaptr;

  tr.queue = [];
  isInitialized = true;
}

/**
 * Load Snapchat Pixel library
 *
 * @param pixelId - Your Snapchat Pixel ID
 * @param options - Optional initialization options including user data
 * @returns Promise that resolves when scevent.min.js is loaded
 *
 * @example
 * ```ts
 * await loadSnap('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
 * snaptr('track', 'PAGE_VIEW');
 * ```
 */
export async function loadSnap(pixelId: string, options?: SnapchatInitOptions): Promise<void> {
  // Initialize stub immediately
  initSnaptr();

  // Initialize this pixel if not already done
  if (!initializedPixels.has(pixelId)) {
    snaptr('init', pixelId, options);
    initializedPixels.add(pixelId);
  }

  // Return existing promise if script is already loading/loaded
  if (snaptrPromise) {
    return snaptrPromise;
  }

  // Load the script
  snaptrPromise = loadScript('https://sc-static.net/scevent.min.js');

  await snaptrPromise;
}

/**
 * The snaptr function - sends commands to Snapchat Pixel
 *
 * @example
 * ```ts
 * // Track page view
 * snaptr('track', 'PAGE_VIEW');
 *
 * // Track purchase
 * snaptr('track', 'PURCHASE', {
 *   currency: 'USD',
 *   price: 99.99,
 *   transaction_id: 'order-123'
 * });
 * ```
 */
export const snaptr: Snaptr = function snaptr(...args: unknown[]): void {
  // Auto-initialize if not done
  if (!isInitialized) {
    initSnaptr();
  }
  (window.snaptr as Snaptr)(...(args as Parameters<Snaptr>));
};

// ============================================================================
// Standard Event Functions
// ============================================================================

/**
 * Track a page view
 */
export function trackPageView(): void {
  snaptr('track', 'PAGE_VIEW');
}

/**
 * Track view content
 */
export function trackViewContent(params: {
  item_ids?: string[];
  item_category?: string;
  description?: string;
  price?: number;
  currency?: string;
}): void {
  snaptr('track', 'VIEW_CONTENT', params);
}

/**
 * Track add to cart
 */
export function trackAddCart(params: {
  item_ids?: string[];
  item_category?: string;
  price?: number;
  currency?: string;
  number_items?: number;
}): void {
  snaptr('track', 'ADD_CART', params);
}

/**
 * Track add to wishlist
 */
export function trackAddToWishlist(params: {
  item_ids?: string[];
  item_category?: string;
  price?: number;
  currency?: string;
}): void {
  snaptr('track', 'ADD_TO_WISHLIST', params);
}

/**
 * Track start checkout
 */
export function trackStartCheckout(params: {
  item_ids?: string[];
  item_category?: string;
  price?: number;
  currency?: string;
  number_items?: number;
  payment_info_available?: boolean;
}): void {
  snaptr('track', 'START_CHECKOUT', params);
}

/**
 * Track add billing info
 */
export function trackAddBilling(params?: {
  item_ids?: string[];
  item_category?: string;
  price?: number;
  currency?: string;
}): void {
  snaptr('track', 'ADD_BILLING', params);
}

/**
 * Track purchase
 */
export function trackPurchase(params: {
  price: number;
  currency: string;
  transaction_id: string;
  item_ids?: string[];
  item_category?: string;
  number_items?: number;
}): void {
  snaptr('track', 'PURCHASE', params);
}

/**
 * Track search
 */
export function trackSearch(params: {
  search_string: string;
  item_ids?: string[];
  item_category?: string;
  number_items?: number;
}): void {
  snaptr('track', 'SEARCH', params);
}

/**
 * Track sign up
 */
export function trackSignUp(params?: {
  user_email?: string;
  user_phone_number?: string;
}): void {
  snaptr('track', 'SIGN_UP', params);
}

/**
 * Track login
 */
export function trackLogin(): void {
  snaptr('track', 'LOGIN');
}

/**
 * Track app install
 */
export function trackAppInstall(): void {
  snaptr('track', 'APP_INSTALL');
}

/**
 * Track app open
 */
export function trackAppOpen(): void {
  snaptr('track', 'APP_OPEN');
}

/**
 * Track subscribe
 */
export function trackSubscribe(params?: {
  price?: number;
  currency?: string;
}): void {
  snaptr('track', 'SUBSCRIBE', params);
}

/**
 * Track start trial
 */
export function trackStartTrial(params?: {
  price?: number;
  currency?: string;
}): void {
  snaptr('track', 'START_TRIAL', params);
}

/**
 * Track save/bookmark
 */
export function trackSave(params?: {
  item_ids?: string[];
  item_category?: string;
}): void {
  snaptr('track', 'SAVE', params);
}

/**
 * Track share
 */
export function trackShare(params?: {
  item_ids?: string[];
  item_category?: string;
  description?: string;
}): void {
  snaptr('track', 'SHARE', params);
}

/**
 * Track list view
 */
export function trackListView(params?: {
  item_ids?: string[];
  item_category?: string;
  number_items?: number;
}): void {
  snaptr('track', 'LIST_VIEW', params);
}

/**
 * Track custom event
 */
export function trackCustom(eventName: string, params?: SnapchatEventParams): void {
  snaptr('track', eventName as SnapchatStandardEvent, params);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Unbind Snapchat Pixel (stop tracking)
 */
export function unbind(): void {
  snaptr('unbind');
}

/**
 * Rebind Snapchat Pixel (resume tracking)
 */
export function rebind(): void {
  snaptr('rebind');
}

/**
 * Hash user data for Advanced Matching
 */
export async function hashUserData(userData: {
  email?: string;
  phone?: string;
}): Promise<SnapchatUserData> {
  const result: SnapchatUserData = {};

  if (userData.email) {
    result.user_hashed_email = await hashEmail(userData.email);
  }
  if (userData.phone) {
    result.user_hashed_phone_number = await hashPhone(userData.phone);
  }

  return result;
}

/**
 * Check if Snapchat Pixel is loaded
 */
export function isSnaptrLoaded(): boolean {
  return scriptLoaded('snaptr') && isInitialized;
}

/**
 * Generate a transaction ID for deduplication
 */
export function generateTransactionId(): string {
  return `${Date.now()}.${Math.random().toString(36).substring(2, 15)}`;
}
