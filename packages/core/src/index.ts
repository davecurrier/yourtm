/**
 * @yourtm/core
 *
 * Core types and helper functions for YourTM tag manager.
 * This package provides the foundation for building tag manager configurations
 * with full TypeScript support.
 *
 * @packageDocumentation
 */

// ============================================================================
// Types - All TypeScript interfaces and enums
// ============================================================================

export {
  // Enums
  TriggerType,
  ConsentCategory,
  VariableType,
  Environment,
  TagStatus,

  // Trigger Configurations
  type PageviewTriggerConfig,
  type ClickTriggerConfig,
  type ScrollTriggerConfig,
  type TimerTriggerConfig,
  type VisibilityTriggerConfig,
  type FormSubmitTriggerConfig,
  type DataLayerEventTriggerConfig,
  type HistoryChangeTriggerConfig,
  type YouTubeVideoTriggerConfig,
  type CustomTriggerConfig,
  type TriggerConfig,

  // Trigger Definition
  type TriggerDefinition,
  type TriggerContext,

  // Variable Definition
  type URLVariableConfig,
  type DOMElementConfig,
  type VariableDefinition,
  type VariableContext,

  // Zone Definition
  type ZoneDefinition,
  type ZoneContext,

  // Tag Definition
  type TagDefinition,
  type TagSetupContext,
  type TagExecuteContext,
  type LoadScriptOptions,
  type TagLogger,

  // Consent
  type ConsentState,
  type ConsentConfig,
  type ConsentBannerConfig,

  // Vendor Libraries
  type VendorLibrary,
  type VendorInitContext,

  // Performance
  type PerformanceBudget,
  type TagTelemetry,

  // Configuration
  type EnvironmentConfig,
  type BuildConfig,
  type ConfigDefinition,

  // Runtime
  type ContainerState,
  type TagFireEvent,
  type TagCompleteEvent,
  type ConsentChangeEvent,
  type ContainerEvent,
  type ContainerEventListener,
} from './types.js';

// ============================================================================
// Tag Definition Helper
// ============================================================================

export {
  defineTag,
  defineOnceTag,
  defineAsyncTag,
  isTagDefinition,
  type DefineTagInput,
} from './defineTag.js';

// ============================================================================
// Trigger Definition Helpers
// ============================================================================

export {
  // Generic helper
  defineTrigger,
  isTriggerDefinition,
  type GenericTriggerInput,

  // Specific trigger helpers
  definePageviewTrigger,
  defineClickTrigger,
  defineScrollTrigger,
  defineTimerTrigger,
  defineVisibilityTrigger,
  defineFormSubmitTrigger,
  defineDataLayerEventTrigger,
  defineHistoryChangeTrigger,
  defineYouTubeVideoTrigger,
  defineCustomTrigger,

  // Input types
  type PageviewTriggerInput,
  type ClickTriggerInput,
  type ScrollTriggerInput,
  type TimerTriggerInput,
  type VisibilityTriggerInput,
  type FormSubmitTriggerInput,
  type DataLayerEventTriggerInput,
  type HistoryChangeTriggerInput,
  type YouTubeVideoTriggerInput,
  type CustomTriggerInput,
} from './defineTrigger.js';

// ============================================================================
// Variable Definition Helpers
// ============================================================================

export {
  // Generic helper
  defineVariable,
  isVariableDefinition,
  type GenericVariableInput,

  // Specific variable helpers
  defineDataLayerVariable,
  defineComputedVariable,
  defineCookieVariable,
  defineURLVariable,
  defineLocalStorageVariable,
  defineSessionStorageVariable,
  defineDOMElementVariable,
  defineJavaScriptVariable,
  defineConstantVariable,
  defineFirstPartyCookieVariable,
  defineCustomVariable,

  // Input types
  type DataLayerVariableInput,
  type ComputedVariableInput,
  type CookieVariableInput,
  type URLVariableInput,
  type LocalStorageVariableInput,
  type SessionStorageVariableInput,
  type DOMElementVariableInput,
  type JavaScriptVariableInput,
  type ConstantVariableInput,
  type FirstPartyCookieVariableInput,
  type CustomVariableInput,
} from './defineVariable.js';

// ============================================================================
// Zone Definition Helpers
// ============================================================================

export {
  // Main helper
  defineZone,
  isZoneDefinition,
  type DefineZoneInput,

  // Zone presets
  defineAllPagesZone,
  defineHomepageZone,
  defineCheckoutZone,
  defineProductZone,
  defineCategoryZone,
  defineBlogZone,
  defineAccountZone,
  defineSearchZone,
  defineAdminZone,

  // Utilities
  combinePatterns,
  excludePatterns,
  globToRegex,
  testZoneMatch,
} from './defineZone.js';

// ============================================================================
// Configuration Helper
// ============================================================================

export {
  // Main helper
  defineConfig,
  isConfigDefinition,
  type DefineConfigInput,

  // Input types
  type EnvironmentConfigInput,
  type ConsentConfigInput,
  type VendorLibraryInput,
  type BuildConfigInput,
  type PerformanceBudgetInput,

  // Presets
  gdprPreset,
  ccpaPreset,
  ecommercePreset,
  mergePresets,
} from './defineConfig.js';
