// Public API exports for @yourtm/cli

// Config utilities
export { defineConfig, loadConfig, type YourTMConfig } from './utils/config.js';

// Compiler exports
export {
  Compiler,
  defineTag,
  defineTrigger,
  defineZone,
  type TagDefinition,
  type TriggerDefinition,
  type ZoneDefinition,
  type TriggerCondition,
  type CompiledBundle,
  type CompileResult,
  type CompileError,
} from './compiler/index.js';

// Logger for custom scripts
export { logger } from './utils/logger.js';
