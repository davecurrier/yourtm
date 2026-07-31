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
  registerVariable,
  registerVariables,
  registerZone,
  detectZone,
  loadChunk,
  executeTag,
  executeTrigger,
  onTelemetry,
  getTags,
  getExecutedTags,
  getTelemetry,
  isInitialized,
  getConfig,
  reset,
  type TagConfig,
  type TagContext,
  type ZoneConfig,
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
import { initConsentMode, type ConsentModeConfig } from './consentMode';
export { initConsentMode, RECOMMENDED as recommendedConsentMode } from './consentMode';
export type { ConsentModeConfig, GoogleSignal } from './consentMode';

import { type VariableDefinition, Environment } from '@yourtm/core';

// Types for external use
export interface YourTMConfig {
  containerId: string;
  environment?: Environment;
  previewMode?: boolean;
  previewEndpoint?: string;
  debug?: boolean;
  /**
   * Google Consent Mode v2. Emitted before any tag so gtag sees the defaults
   * when it initialises — hits sent earlier carry no consent state.
   */
  consentMode?: ConsentModeConfig;
  tags?: core.TagConfig[];
  triggers?: triggers.TriggerConfig[];
  variables?: VariableDefinition[];
  zones?: core.ZoneConfig[];
}

/**
 * Initialize the YourTM runtime with full configuration
 */
export function initYourTM(config: YourTMConfig): void {
  // Initialize core
  core.init({
    containerId: config.containerId,
    environment: config.environment || Environment.Production,
    previewMode: config.previewMode,
    previewEndpoint: config.previewEndpoint,
    debug: config.debug,
    // Needed so executeTag can tell a page-scoped trigger from an
    // interaction-scoped one when deciding what may be replayed after consent.
    triggers: config.triggers,
    variables: config.variables as Array<Record<string, unknown>> | undefined
  });

  // Initialize consent
  consent.initConsent();

  // Emit Google Consent Mode defaults immediately after consent state is
  // restored and before anything can load gtag. Since 15 June 2026 ad_storage
  // is the only control Google Ads consults, so a hit that leaves before this
  // runs is unattributable and irrecoverable.
  initConsentMode(config.consentMode);

  // Initialize dataLayer
  dataLayer.initDataLayer();

  // Register zones
  if (config.zones) {
    for (const zone of config.zones) {
      core.registerZone(zone);
    }
  }

  // Register variables
  if (config.variables) {
    core.registerVariables(config.variables);
  }

  // Register tags
  if (config.tags) {
    core.registerTags(config.tags);
  }

  // Initialize triggers
  if (config.triggers) {
    triggers.initTriggers(config.triggers);
  }

  // Replay consent-blocked tags when the visitor later accepts. Registered
  // after triggers so the registry is populated before any change can arrive.
  core.initConsentReplay();

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
    onTelemetry: core.onTelemetry,
    registerTag: core.registerTag,
    registerZone: core.registerZone,
    getTelemetry: core.getTelemetry,
    version: '0.1.0'
  };
}
