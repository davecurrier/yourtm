/**
 * YourTM Consent Management
 * Category-based consent with persistence and listeners
 */

export type ConsentCategory = 'essential' | 'analytics' | 'marketing' | 'social' | 'functional';

export interface ConsentState {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
  social: boolean;
  functional: boolean;
  timestamp: number;
}

export type ConsentChangeCallback = (state: ConsentState) => void;

const KEY = 'ytm_consent';
const DEFAULT: ConsentState = { essential: true, analytics: false, marketing: false, social: false, functional: false, timestamp: 0 };
let state: ConsentState = { ...DEFAULT };
const listeners: ConsentChangeCallback[] = [];
let inited = false;

/**
 * Initialize consent management
 */
export function initConsent(): void {
  if (inited) return;
  inited = true;
  try {
    const s = localStorage.getItem(KEY);
    if (s) state = { ...DEFAULT, ...JSON.parse(s), essential: true };
  } catch {}
}

/**
 * Get current consent state
 */
export function getConsent(): ConsentState {
  return { ...state };
}

/**
 * Check if a category has consent
 */
export function hasConsent(cat: ConsentCategory): boolean {
  return cat === 'essential' || state[cat] === true;
}

/**
 * Set consent for categories
 */
export function setConsent(cats: Partial<Omit<ConsentState, 'essential' | 'timestamp'>>): void {
  const prev = { ...state };
  state = { ...state, ...cats, essential: true, timestamp: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  for (const l of listeners) { try { l(state); } catch {} }
  if (typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ytm:consentchange', { detail: { current: state, previous: prev } }));
  }
}

/**
 * Accept all consent categories
 */
export function acceptAll(): void {
  setConsent({ analytics: true, marketing: true, social: true, functional: true });
}

/**
 * Reject all non-essential consent
 */
export function rejectAll(): void {
  setConsent({ analytics: false, marketing: false, social: false, functional: false });
}

/**
 * Toggle a specific category
 */
export function toggleConsent(cat: ConsentCategory): boolean {
  if (cat === 'essential') return true;
  const v = !state[cat];
  setConsent({ [cat]: v });
  return v;
}

/**
 * Subscribe to consent changes
 */
export function onConsentChange(cb: ConsentChangeCallback): () => void {
  listeners.push(cb);
  return () => { const i = listeners.indexOf(cb); if (i > -1) listeners.splice(i, 1); };
}

/**
 * Wait for consent to be given for a category
 */
export function waitForConsent(cat: ConsentCategory, timeout = 30000): Promise<boolean> {
  return new Promise(res => {
    if (hasConsent(cat)) { res(true); return; }
    const t = setTimeout(() => { unsub(); res(false); }, timeout);
    const unsub = onConsentChange(s => { if (s[cat]) { clearTimeout(t); unsub(); res(true); } });
  });
}

/**
 * Check if consent has been given (any interaction)
 */
export function hasInteracted(): boolean {
  return state.timestamp > 0;
}

/**
 * Check if consent needs renewal (13 months)
 */
export function needsRenewal(): boolean {
  return !state.timestamp || Date.now() - state.timestamp > 13 * 30 * 24 * 60 * 60 * 1000;
}

/**
 * Reset consent (for testing)
 */
export function resetConsent(): void {
  state = { ...DEFAULT };
  try { localStorage.removeItem(KEY); } catch {}
  inited = false;
}

/**
 * Get consent categories that have been granted
 */
export function getGrantedCategories(): ConsentCategory[] {
  const cats: ConsentCategory[] = ['essential'];
  if (state.analytics) cats.push('analytics');
  if (state.marketing) cats.push('marketing');
  if (state.social) cats.push('social');
  if (state.functional) cats.push('functional');
  return cats;
}

/**
 * Check if all categories are consented
 */
export function hasFullConsent(): boolean {
  return state.analytics && state.marketing && state.social && state.functional;
}

/**
 * Consent API for external banner integrations
 */
export const ConsentAPI = {
  get: getConsent, set: setConsent, has: hasConsent,
  acceptAll, rejectAll, toggle: toggleConsent, onChange: onConsentChange,
  waitFor: waitForConsent, hasInteracted, needsRenewal, getGranted: getGrantedCategories, hasFullConsent
};
