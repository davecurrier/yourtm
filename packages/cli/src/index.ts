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

// Command exports
export { analyzeCommand } from './commands/analyze.js';
export { createCommand } from './commands/create.js';
export { initCommand } from './commands/init.js';
export { buildCommand } from './commands/build.js';
export { devCommand } from './commands/dev.js';
export { deployCommand, statusCommand, versionsCommand } from './commands/deploy.js';
export { deployInitCommand } from './commands/deploy-init.js';
export { pushCommand, cloneCommand, pullCommand, logCommand, loginCommand } from './commands/source.js';
export { monitorCommand } from './commands/monitor.js';
export { auditCommand } from './commands/audit.js';
export { setupCommand } from './commands/setup.js';
export { testCommand, watchCommand, diffCommand } from './commands/test.js';
export { importCommand } from './commands/import.js';

// Template exports
export {
  allTagTemplates,
  allTriggerTemplates,
  allZoneTemplates,
  getTemplates,
  getTemplate,
} from './templates/index.js';

// Logger for custom scripts
export { logger } from './utils/logger.js';

// Cloudflare exports
export {
  CloudflareClient,
  CloudflareAPIError,
  getCloudflareCredentials,
  generateWorkerScript,
} from './cloudflare/api.js';

// GTM vendor detection — used by the importer to turn a GTM tag into a real
// implementation rather than a "manual implementation required" stub.
export { detectVendor, getSupportedVendors } from './vendors/index.js';
export type { VendorTagResult, GTMTag } from './vendors/index.js';
