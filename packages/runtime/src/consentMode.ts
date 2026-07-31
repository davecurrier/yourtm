import { getConsent, onConsentChange, type ConsentState } from './consent';

/**
 * Google Consent Mode v2 signals.
 *
 * Since 15 June 2026 `ad_storage` is the *sole* control over what advertising
 * data reaches a linked Google Ads account — Google Signals no longer acts as a
 * backstop, it only governs signed-in reporting inside Analytics. So a wrong or
 * missing default now passes straight through to Ads.
 *
 * Consent Mode is not blocking. Under `denied` a Google tag still loads and
 * sends cookieless pings, which is what feeds conversion and behavioural
 * modelling. Blocking the tag outright sends nothing and forfeits that, so
 * Google tags should be signalled, not gated — unlike Meta/LinkedIn/Microsoft,
 * which have no equivalent and stay blocked.
 */
export type GoogleSignal =
  | 'ad_storage'
  | 'ad_user_data'
  | 'ad_personalization'
  | 'analytics_storage'
  | 'functionality_storage'
  | 'personalization_storage'
  | 'security_storage';

export type SignalValue = 'granted' | 'denied';

export interface ConsentModeConfig {
  enabled?: boolean;
  /** Applied everywhere unless a region entry overrides them. */
  defaults?: Partial<Record<GoogleSignal, SignalValue>>;
  /**
   * Region-scoped defaults, as Google's `region` parameter. Entries are emitted
   * as additional `default` commands and take precedence over the global one
   * for matching visitors. Region matching happens on Google's side, so no
   * geolocation is needed here.
   */
  regions?: Array<{ region: string[] } & Partial<Record<GoogleSignal, SignalValue>>>;
  /** Milliseconds gtag waits for an `update` before acting on defaults. */
  waitForUpdate?: number;
  urlPassthrough?: boolean;
  adsDataRedaction?: boolean;
}

/**
 * Default posture: deny advertising and analytics storage in the EEA and UK,
 * allow elsewhere.
 *
 * This is a legal posture rather than a technical default, which is why the
 * whole feature is opt-in and every value is overridable — a container should
 * state its own position rather than inherit one.
 */
export const RECOMMENDED: ConsentModeConfig = {
  enabled: true,
  defaults: {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted',
    functionality_storage: 'granted',
    personalization_storage: 'granted',
    security_storage: 'granted',
  },
  regions: [
    {
      region: ['EEA', 'GB', 'CH'],
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      personalization_storage: 'denied',
      functionality_storage: 'granted',
      security_storage: 'granted',
    },
  ],
  waitForUpdate: 500,
  urlPassthrough: true,
  adsDataRedaction: true,
};

/** YourTM consent categories mapped onto Google's signals. */
function signalsFor(state: ConsentState): Record<GoogleSignal, SignalValue> {
  const yes = (b: boolean): SignalValue => (b ? 'granted' : 'denied');
  return {
    ad_storage: yes(state.marketing),
    ad_user_data: yes(state.marketing),
    ad_personalization: yes(state.marketing),
    analytics_storage: yes(state.analytics),
    functionality_storage: yes(state.functional),
    personalization_storage: yes(state.functional),
    // Strictly necessary; Google treats this as always available.
    security_storage: 'granted',
  };
}

/**
 * gtag pushes its own `arguments` object, and gtag.js distinguishes that from a
 * plain array — pushing `['consent', …]` is silently ignored. So the command
 * queue has to be fed through a real function.
 */
// The rest parameter exists only to type the call sites; the body pushes the
// `arguments` object itself, which is what gtag.js inspects.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtagPush(..._args: unknown[]): void {
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  w.dataLayer.push(arguments);
}

let initialised = false;

/**
 * Emit the `default` commands and keep them updated.
 *
 * Must run before any Google tag loads: gtag applies whatever defaults are
 * already queued when it initialises, and hits sent before that carry no
 * consent state at all. Measured on vitaldesign.com, the first GA4 and Ads
 * requests went out with no `gcs` parameter for exactly this reason.
 */
export function initConsentMode(config: ConsentModeConfig | undefined): void {
  if (!config?.enabled || initialised) return;
  if (typeof window === 'undefined') return;
  initialised = true;

  if (config.adsDataRedaction !== undefined) {
    gtagPush('set', 'ads_data_redaction', config.adsDataRedaction);
  }
  if (config.urlPassthrough !== undefined) {
    gtagPush('set', 'url_passthrough', config.urlPassthrough);
  }

  // Region-scoped defaults first; gtag applies the most specific match.
  for (const region of config.regions ?? []) {
    const { region: codes, ...signals } = region;
    gtagPush('consent', 'default', {
      ...signals,
      region: codes,
      ...(config.waitForUpdate ? { wait_for_update: config.waitForUpdate } : {}),
    });
  }

  if (config.defaults && Object.keys(config.defaults).length > 0) {
    gtagPush('consent', 'default', {
      ...config.defaults,
      ...(config.waitForUpdate ? { wait_for_update: config.waitForUpdate } : {}),
    });
  }

  // If consent was already stored from a previous visit, state it immediately
  // rather than leaving the visitor on defaults until they interact again.
  const stored = getConsent();
  if (stored.timestamp) {
    gtagPush('consent', 'update', signalsFor(stored));
  }

  onConsentChange(state => {
    gtagPush('consent', 'update', signalsFor(state));
  });
}

/** Test seam: lets a suite re-run init against a fresh page. */
export function resetConsentMode(): void {
  initialised = false;
}
