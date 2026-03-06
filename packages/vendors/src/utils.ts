/**
 * Shared utilities for vendor script loading
 */

/** Map to track script loading promises for deduplication */
const scriptLoadingMap = new Map<string, Promise<void>>();

/**
 * Load an external script by URL
 * Returns a promise that resolves when the script is loaded
 * Deduplicates requests - same URL won't be loaded twice
 */
export function loadScript(src: string): Promise<void> {
  // Check if we already have a loading promise for this script
  const existingPromise = scriptLoadingMap.get(src);
  if (existingPromise) {
    return existingPromise;
  }

  // Check if script is already in the DOM
  const existingScript = document.querySelector(`script[src="${src}"]`);
  if (existingScript) {
    const resolved = Promise.resolve();
    scriptLoadingMap.set(src, resolved);
    return resolved;
  }

  // Create new script element and load
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;

    script.onload = () => {
      resolve();
    };

    script.onerror = () => {
      scriptLoadingMap.delete(src);
      reject(new Error(`Failed to load script: ${src}`));
    };

    document.head.appendChild(script);
  });

  scriptLoadingMap.set(src, promise);
  return promise;
}

/**
 * Check if a global variable exists (script is loaded)
 */
export function scriptLoaded(globalVar: string): boolean {
  return globalVar in window;
}

/**
 * Hash an email address using SHA-256
 * Returns lowercase hex string
 */
export async function hashEmail(email: string): Promise<string> {
  // Normalize email: lowercase and trim
  const normalized = email.toLowerCase().trim();

  // Encode as UTF-8
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);

  // Hash with SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * Hash a phone number using SHA-256
 * Removes non-numeric characters before hashing
 */
export async function hashPhone(phone: string): Promise<string> {
  // Normalize: remove all non-numeric characters except leading +
  const normalized = phone.replace(/[^\d+]/g, '');

  // Encode as UTF-8
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);

  // Hash with SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * Generate a unique client ID
 * Uses crypto.randomUUID if available, falls back to timestamp + random
 */
export function generateClientId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return `${Date.now()}.${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Get or create a persistent client ID stored in localStorage
 */
export function getOrCreateClientId(storageKey = '_ytm_cid'): string {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      return stored;
    }
    const newId = generateClientId();
    localStorage.setItem(storageKey, newId);
    return newId;
  } catch {
    // localStorage not available, generate ephemeral ID
    return generateClientId();
  }
}
