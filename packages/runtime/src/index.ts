/**
 * YourTM Runtime
 * Lightweight browser runtime for tag execution
 *
 * @packageDocumentation
 */

// Core runtime
export {
  init,
  registerTag,
  registerTags,
  registerZone,
  detectZone,
  loadChunk,
  executeTag,
  executeTrigger,
  getTags,
  getExecutedTags,
  getTelemetry,
  isInitialized,
  getConfig,
  reset,
  type TagConfig,
  type TagContext,
  type ZoneConfig,
  type Telemetry,
  type RuntimeConfig
} from './core';

// DataLayer
export {
  initDataLayer,
  push,
  get,
  getAll,
  onEvent,
  on,
  clear,
  resolve,
  has,
  waitFor,
  type DataLayerValue,
  type DataLayerEvent,
  type DataLayerCallback
} from './dataLayer';

// Triggers
export {
  initTriggers,
  registerTrigger,
  removeTrigger,
  removeAllTriggers,
  fireEvent,
  type TriggerType,
  type TriggerConfig,
  type TriggerCondition
} from './triggers';

// Consent
export {
  initConsent,
  getConsent,
  hasConsent,
  setConsent,
  acceptAll,
  rejectAll,
  toggleConsent,
  onConsentChange,
  waitForConsent,
  hasInteracted,
  needsRenewal,
  resetConsent,
  getGrantedCategories,
  hasFullConsent,
  ConsentAPI,
  type ConsentCategory,
  type ConsentState,
  type ConsentChangeCallback
} from './consent';

import * as core from './core';
import * as dataLayer from './dataLayer';
import * as triggers from './triggers';
import * as consent from './consent';

// Types for external use
export interface YourTMConfig {
  containerId: string;
  previewMode?: boolean;
  previewEndpoint?: string;
  debug?: boolean;
  tags?: core.TagConfig[];
  triggers?: triggers.TriggerConfig[];
  zones?: core.ZoneConfig[];
}

/**
 * Initialize the YourTM runtime with full configuration
 */
export function initYourTM(config: YourTMConfig): void {
  // Initialize core
  core.init({
    containerId: config.containerId,
    previewMode: config.previewMode,
    previewEndpoint: config.previewEndpoint,
    debug: config.debug
  });

  // Initialize consent
  consent.initConsent();

  // Initialize dataLayer
  dataLayer.initDataLayer();

  // Register zones
  if (config.zones) {
    for (const zone of config.zones) {
      core.registerZone(zone);
    }
  }

  // Register tags
  if (config.tags) {
    core.registerTags(config.tags);
  }

  // Initialize triggers
  if (config.triggers) {
    triggers.initTriggers(config.triggers);
  }

  // Dispatch ready event
  if (typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ytm:ready', {
      detail: { containerId: config.containerId }
    }));
  }

  if (config.debug) {
    console.log('[YourTM] Runtime ready');
  }
}

// Auto-initialize if window._ytm_config exists
if (typeof window !== 'undefined') {
  const win = window as unknown as { _ytm_config?: YourTMConfig };
  if (win._ytm_config) {
    initYourTM(win._ytm_config);
  }

  // Expose global API
  (window as unknown as Record<string, unknown>).YourTM = {
    push: dataLayer.push,
    get: dataLayer.get,
    onEvent: dataLayer.onEvent,
    consent: consent.ConsentAPI,
    fire: triggers.fireEvent,
    executeTag: core.executeTag,
    getTelemetry: core.getTelemetry,
    version: '0.1.0'
  };
}
