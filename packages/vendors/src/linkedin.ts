/**
 * LinkedIn Insight Tag wrapper
 * Provides type-safe access to LinkedIn's lintrk API
 */

import { loadScript, scriptLoaded } from './utils.js';

// ============================================================================
// Type Definitions
// ============================================================================

/** LinkedIn conversion event parameters */
export interface LinkedInConversionParams {
  conversion_id: string;
}

/** LinkedIn insight tag function */
export interface Lintrk {
  (command: 'track', params: LinkedInConversionParams): void;
  q?: unknown[][];
}

/** LinkedIn tracking configuration */
export interface LinkedInConfig {
  partnerId: string;
}

// ============================================================================
// Global Window Extension
// ============================================================================

declare global {
  interface Window {
    lintrk: Lintrk;
    _linkedin_data_partner_ids: string[];
    _linkedin_partner_id: string;
  }
}

// ============================================================================
// Loading State
// ============================================================================

let lintrkPromise: Promise<void> | null = null;
let isInitialized = false;
let initializedPartners: Set<string> = new Set();

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Initialize the lintrk function stub
 * Called automatically by loadLintrk, but can be called early
 */
export function initLintrk(partnerId: string): void {
  if (isInitialized && initializedPartners.has(partnerId)) return;

  window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
  if (!window._linkedin_data_partner_ids.includes(partnerId)) {
    window._linkedin_data_partner_ids.push(partnerId);
  }
  window._linkedin_partner_id = partnerId;

  if (!window.lintrk) {
    window.lintrk = function(_command: 'track', params: LinkedInConversionParams) {
      window.lintrk.q = window.lintrk.q || [];
      window.lintrk.q.push(['track', params]);
    };
    window.lintrk.q = [];
  }

  initializedPartners.add(partnerId);
  isInitialized = true;
}

/**
 * Load LinkedIn Insight Tag library
 *
 * @param partnerId - Your LinkedIn Partner ID
 * @returns Promise that resolves when the insight tag is loaded
 *
 * @example
 * ```ts
 * await loadLintrk('123456');
 * lintrk('track', { conversion_id: '7890123' });
 * ```
 */
export async function loadLintrk(partnerId: string): Promise<void> {
  // Initialize stub immediately
  initLintrk(partnerId);

  // Return existing promise if script is already loading/loaded
  if (lintrkPromise) {
    return lintrkPromise;
  }

  // Load the script
  lintrkPromise = loadScript('https://snap.licdn.com/li.lms-analytics/insight.min.js');

  await lintrkPromise;
}

/**
 * The lintrk function - sends commands to LinkedIn Insight Tag
 *
 * @example
 * ```ts
 * // Track a conversion
 * lintrk('track', { conversion_id: '7890123' });
 * ```
 */
export function lintrk(command: 'track', params: LinkedInConversionParams): void {
  if (!isInitialized) {
    console.warn('LinkedIn Insight Tag not initialized. Call loadLintrk first.');
    return;
  }
  window.lintrk(command, params);
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Track a LinkedIn conversion
 *
 * @param conversionId - The conversion ID from LinkedIn Campaign Manager
 *
 * @example
 * ```ts
 * trackConversion('7890123');
 * ```
 */
export function trackConversion(conversionId: string): void {
  lintrk('track', { conversion_id: conversionId });
}

/**
 * Track a page view (implicit with Insight Tag load)
 * Note: LinkedIn tracks page views automatically when the script loads
 * This function is provided for explicit tracking if needed
 */
export function trackPageView(): void {
  // LinkedIn Insight Tag tracks page views automatically
  // This is a no-op but provided for API consistency
  if (!isInitialized) {
    console.warn('LinkedIn Insight Tag not initialized. Call loadLintrk first.');
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if LinkedIn Insight Tag is loaded
 */
export function isLintrkLoaded(): boolean {
  return scriptLoaded('lintrk') && isInitialized;
}

/**
 * Get the current partner ID
 */
export function getPartnerId(): string | undefined {
  return window._linkedin_partner_id;
}

/**
 * Get all registered partner IDs (for multi-partner setups)
 */
export function getPartnerIds(): string[] {
  return window._linkedin_data_partner_ids || [];
}

/**
 * Add an additional partner ID for multi-account tracking
 */
export function addPartnerId(partnerId: string): void {
  window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
  if (!window._linkedin_data_partner_ids.includes(partnerId)) {
    window._linkedin_data_partner_ids.push(partnerId);
    initializedPartners.add(partnerId);
  }
}
