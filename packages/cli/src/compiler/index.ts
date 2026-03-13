import { existsSync } from 'node:fs';
import { mkdir, writeFile, unlink, rmdir } from 'node:fs/promises';
import { join, basename, dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import * as esbuild from 'esbuild';
import { glob } from 'glob';
import { logger } from '../utils/logger.js';
import type { YourTMConfig } from '../utils/config.js';

// Type definitions for tags, triggers, and zones
export interface TagDefinition {
  id: string;
  name: string;
  type?: 'script' | 'html' | 'pixel';
  triggers: string[];
  zones?: string[];
  priority?: number;
  code?: string | (() => void | Promise<void>);
  execute?: (context: unknown) => void | Promise<void>;
  setup?: (context: unknown) => void | Promise<unknown>;
  consent?: string[];
  platform?: string;
  vendor?: string;
  sourcePath?: string; // Path to the source file, relative to project root
}

export interface TriggerDefinition {
  id: string;
  name: string;
  type: 'pageview' | 'click' | 'scroll' | 'timer' | 'custom' | 'form' | 'visibility';
  conditions?: TriggerCondition[];
  options?: Record<string, unknown>;
}

export interface TriggerCondition {
  variable: string;
  operator: 'equals' | 'contains' | 'matches' | 'gt' | 'lt' | 'exists';
  value: string | number | boolean | RegExp;
}

export interface ZoneDefinition {
  id: string;
  name: string;
  patterns?: string[];
  urlPatterns?: string[];
  tags?: string[];
  priority?: number;
}

export interface VariableDefinition {
  id: string;
  name: string;
  type: 'dataLayer' | 'cookie' | 'url' | 'custom' | 'constant';
  key?: string;
  value?: unknown;
  getter?: () => unknown;
}

export interface CompiledBundle {
  name: string;
  code: string;
  map?: string;
  size: number;
  gzipSize?: number;
}

export interface CompileResult {
  bundles: CompiledBundle[];
  tags: TagDefinition[];
  triggers: TriggerDefinition[];
  zones: ZoneDefinition[];
  variables: VariableDefinition[];
  errors: CompileError[];
  warnings: string[];
}

export interface CompileError {
  file: string;
  message: string;
  line?: number;
  column?: number;
}

export class Compiler {
  private config: YourTMConfig;
  private tags: Map<string, TagDefinition> = new Map();
  private triggers: Map<string, TriggerDefinition> = new Map();
  private zones: Map<string, ZoneDefinition> = new Map();
  private variables: Map<string, VariableDefinition> = new Map();
  private errors: CompileError[] = [];
  private warnings: string[] = [];

  constructor(config: YourTMConfig) {
    this.config = config;
  }

  async compile(options: { skipBundles?: boolean } = {}): Promise<CompileResult> {
    this.tags.clear();
    this.triggers.clear();
    this.zones.clear();
    this.errors = [];
    this.warnings = [];

    // Load all definitions
    await this.loadTriggers();
    await this.loadTags();
    await this.loadZones();
    await this.loadVariables();

    // Validate references
    this.validateReferences();

    // For analysis/audit, we may want to skip bundle generation and just return what we loaded
    if (options.skipBundles) {
      return {
        bundles: [],
        tags: Array.from(this.tags.values()),
        triggers: Array.from(this.triggers.values()),
        zones: Array.from(this.zones.values()),
        variables: Array.from(this.variables.values()),
        errors: this.errors,
        warnings: this.warnings,
      };
    }

    if (this.errors.length > 0) {
      return {
        bundles: [],
        tags: [],
        triggers: [],
        zones: [],
        variables: [],
        errors: this.errors,
        warnings: this.warnings,
      };
    }

    // Generate bundles
    const bundles = await this.generateBundles();

    return {
      bundles,
      tags: Array.from(this.tags.values()),
      triggers: Array.from(this.triggers.values()),
      zones: Array.from(this.zones.values()),
      variables: Array.from(this.variables.values()),
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  private async loadTriggers(): Promise<void> {
    const triggersDir = this.config.triggersDir;
    if (!existsSync(triggersDir)) {
      this.warnings.push(`Triggers directory not found: ${triggersDir}`);
      return;
    }

    const files = await glob('**/*.{ts,js}', { cwd: triggersDir });

    for (const file of files) {
      try {
        const trigger = await this.loadDefinition<TriggerDefinition>(
          join(triggersDir, file),
          'trigger'
        );
        if (trigger) {
          this.triggers.set(trigger.id, trigger);
        }
      } catch (error) {
        this.errors.push({
          file: join(triggersDir, file),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async loadTags(): Promise<void> {
    const tagsDir = this.config.tagsDir;
    if (!existsSync(tagsDir)) {
      this.warnings.push(`Tags directory not found: ${tagsDir}`);
      return;
    }

    const files = await glob('**/*.{ts,js}', { cwd: tagsDir });

    for (const file of files) {
      try {
        const tag = await this.loadDefinition<TagDefinition>(
          join(tagsDir, file),
          'tag'
        );
        if (tag) {
          // Store the relative source path (e.g., "yourtm/tags/my-tag.ts")
          tag.sourcePath = join('yourtm/tags', file);
          this.tags.set(tag.id, tag);
        }
      } catch (error) {
        this.errors.push({
          file: join(tagsDir, file),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async loadZones(): Promise<void> {
    const zonesDir = this.config.zonesDir;
    if (!existsSync(zonesDir)) {
      this.warnings.push(`Zones directory not found: ${zonesDir}`);
      return;
    }

    const files = await glob('**/*.{ts,js}', { cwd: zonesDir });

    for (const file of files) {
      try {
        const zone = await this.loadDefinition<ZoneDefinition>(
          join(zonesDir, file),
          'zone'
        );
        if (zone) {
          this.zones.set(zone.id, zone);
        }
      } catch (error) {
        this.errors.push({
          file: join(zonesDir, file),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async loadVariables(): Promise<void> {
    const variablesDir = this.config.variablesDir;
    if (!variablesDir || !existsSync(variablesDir)) {
      // Variables are optional, no warning needed
      return;
    }

    const files = await glob('**/*.{ts,js}', { cwd: variablesDir });

    for (const file of files) {
      try {
        const variables = await this.loadVariableDefinitions(
          join(variablesDir, file)
        );
        for (const variable of variables) {
          this.variables.set(variable.id, variable);
        }
      } catch (error) {
        this.errors.push({
          file: join(variablesDir, file),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async loadVariableDefinitions(filepath: string): Promise<VariableDefinition[]> {
    if (!existsSync(filepath)) {
      return [];
    }

    // Compile TypeScript to JavaScript
    const result = await esbuild.build({
      entryPoints: [filepath],
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
      target: 'node18',
      external: ['@yourtm/core', '@yourtm/vendors', '@yourtm/runtime'],
    });

    // Inject shims for @yourtm/core helpers since they're external
    const shim = `
const defineVariable = (variable) => variable;
const defineDataLayerVariable = (variable) => ({ ...variable, type: 'dataLayer' });
const defineComputedVariable = (variable) => ({ ...variable, type: 'computed' });
const defineCookieVariable = (variable) => ({ ...variable, type: 'cookie' });
const defineURLVariable = (variable) => ({ ...variable, type: 'url' });
const defineLocalStorageVariable = (variable) => ({ ...variable, type: 'localStorage' });
const defineSessionStorageVariable = (variable) => ({ ...variable, type: 'sessionStorage' });
const defineDOMElementVariable = (variable) => ({ ...variable, type: 'domElement' });
const defineJavaScriptVariable = (variable) => ({ ...variable, type: 'javascript' });
const defineConstantVariable = (variable) => ({ ...variable, type: 'constant' });
const defineFirstPartyCookieVariable = (variable) => ({ ...variable, type: 'firstPartyCookie' });
const defineCustomVariable = (variable) => ({ ...variable, type: 'custom' });
`;

    let code = result.outputFiles[0].text;

    // Remove external imports and inject shims
    code = code.replace(/import\s*\{[^}]*\}\s*from\s*["']@yourtm\/core["'];?/g, shim);
    code = code.replace(/import\s*\{[^}]*\}\s*from\s*["']@yourtm\/vendors["'];?/g, '');
    code = code.replace(/import\s*\{[^}]*\}\s*from\s*["']@yourtm\/runtime["'];?/g, '');

    // Write to temp file and import
    const tempDir = join(dirname(filepath), '.ytm-temp');
    await mkdir(tempDir, { recursive: true });
    const tempPath = join(tempDir, `${basename(filepath, '.ts')}.mjs`);

    try {
      await writeFile(tempPath, code);
      const moduleUrl = pathToFileURL(tempPath).href + `?t=${Date.now()}`;
      // Use eval to bypass static analysis of dynamic imports
      const module = await eval(`import('${moduleUrl}')`);

      const variables: VariableDefinition[] = [];

      // Handle multiple named exports (each export can be a variable)
      for (const [exportName, exportValue] of Object.entries(module)) {
        if (exportName === 'default') continue; // Skip default, process named exports
        if (exportValue && typeof exportValue === 'object') {
          const def = exportValue as any;
          // Check if it looks like a variable definition
          if (def.id || def.name) {
            // Use name as id if id is not provided
            if (!def.id && def.name) {
              def.id = def.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
            }
            variables.push(def as VariableDefinition);
          }
        }
      }

      // Also check for default export (single variable or array of variables)
      if (module.default) {
        if (Array.isArray(module.default)) {
          for (const def of module.default) {
            if (def && (def.id || def.name)) {
              if (!def.id && def.name) {
                def.id = def.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
              }
              variables.push(def as VariableDefinition);
            }
          }
        } else if (module.default.id || module.default.name) {
          const def = module.default;
          if (!def.id && def.name) {
            def.id = def.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
          }
          variables.push(def as VariableDefinition);
        }
      }

      return variables;
    } finally {
      // Clean up temp file
      try {
        const { unlink, rmdir } = await import('node:fs/promises');
        await unlink(tempPath);
        await rmdir(tempDir);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private async loadDefinition<T>(filepath: string, type: string): Promise<T | null> {
    if (!existsSync(filepath)) {
      return null;
    }

    // Compile TypeScript to JavaScript
    const result = await esbuild.build({
      entryPoints: [filepath],
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
      target: 'node18',
      external: ['@yourtm/core', '@yourtm/vendors', '@yourtm/runtime'],
    });

    // Inject shims for @yourtm/core helpers since they're external
    const shim = `
const defineTag = (tag) => tag;
const defineOnceTag = (tag) => ({ ...tag, once: true });
const defineAsyncTag = (tag) => tag;
const defineTrigger = (trigger) => trigger;
const definePageviewTrigger = (trigger) => ({ ...trigger, type: 'pageview' });
const defineDOMReadyTrigger = (trigger) => ({ ...trigger, type: 'domReady' });
const defineWindowLoadedTrigger = (trigger) => ({ ...trigger, type: 'windowLoaded' });
const defineClickTrigger = (trigger) => ({ ...trigger, type: 'click' });
const defineScrollTrigger = (trigger) => ({ ...trigger, type: 'scroll' });
const defineTimerTrigger = (trigger) => ({ ...trigger, type: 'timer' });
const defineVisibilityTrigger = (trigger) => ({ ...trigger, type: 'visibility' });
const defineFormSubmitTrigger = (trigger) => ({ ...trigger, type: 'form' });
const defineDataLayerEventTrigger = (trigger) => ({ ...trigger, type: 'dataLayerEvent' });
const defineHistoryChangeTrigger = (trigger) => ({ ...trigger, type: 'historyChange' });
const defineYouTubeVideoTrigger = (trigger) => ({ ...trigger, type: 'youtubeVideo' });
const defineYouTubeTrigger = (trigger) => ({ ...trigger, type: 'youtubeVideo' });
const defineCustomTrigger = (trigger) => ({ ...trigger, type: 'custom' });
const defineCustomEventTrigger = (trigger) => ({ ...trigger, type: 'customEvent' });
const defineErrorTrigger = (trigger) => ({ ...trigger, type: 'error' });
const defineConsentInitTrigger = (trigger) => ({ ...trigger, type: 'consentInit' });
const defineInitTrigger = (trigger) => ({ ...trigger, type: 'init' });
const defineVariable = (variable) => variable;
const defineDataLayerVariable = (variable) => ({ ...variable, type: 'dataLayer' });
const defineComputedVariable = (variable) => ({ ...variable, type: 'computed' });
const defineCookieVariable = (variable) => ({ ...variable, type: 'cookie' });
const defineURLVariable = (variable) => ({ ...variable, type: 'url' });
const defineLocalStorageVariable = (variable) => ({ ...variable, type: 'localStorage' });
const defineSessionStorageVariable = (variable) => ({ ...variable, type: 'sessionStorage' });
const defineDOMElementVariable = (variable) => ({ ...variable, type: 'domElement' });
const defineJavaScriptVariable = (variable) => ({ ...variable, type: 'javascript' });
const defineConstantVariable = (variable) => ({ ...variable, type: 'constant' });
const defineFirstPartyCookieVariable = (variable) => ({ ...variable, type: 'firstPartyCookie' });
const defineCustomVariable = (variable) => ({ ...variable, type: 'custom' });
const defineZone = (zone) => zone;
const defineAllPagesZone = (zone) => ({ ...zone, patterns: ['*'] });
const defineConfig = (config) => config;
`;

    let code = result.outputFiles[0].text;

    // Remove external imports and inject shims
    code = code.replace(/import\s*\{[^}]*\}\s*from\s*["']@yourtm\/core["'];?/g, shim);
    code = code.replace(/import\s*\{[^}]*\}\s*from\s*["']@yourtm\/vendors["'];?/g, '');
    code = code.replace(/import\s*\{[^}]*\}\s*from\s*["']@yourtm\/runtime["'];?/g, '');

    // Write to temp file and import
    const tempDir = join(dirname(filepath), '.ytm-temp');
    await mkdir(tempDir, { recursive: true });
    const tempPath = join(tempDir, `${basename(filepath, '.ts')}.mjs`);

    try {
      await writeFile(tempPath, code);
      const moduleUrl = pathToFileURL(tempPath).href + `?t=${Date.now()}`;
      // Use eval to bypass static analysis
      const module = await eval(`import('${moduleUrl}')`);
      const definition = module.default || module;

      // Accept either 'id' or 'name' as the identifier
      if (!definition.id && !definition.name) {
        throw new Error(`${type} must have an 'id' or 'name' property`);
      }

      // Use name as id if id is not provided
      if (!definition.id && definition.name) {
        definition.id = definition.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
      }

      return definition as T;
    } finally {
      // Clean up temp file
      try {
        const { unlink, rmdir } = await import('node:fs/promises');
        await unlink(tempPath);
        await rmdir(tempDir);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private validateReferences(): void {
    // Check that all trigger references in tags are valid
    for (const [tagId, tag] of this.tags) {
      for (const triggerId of tag.triggers) {
        if (!this.triggers.has(triggerId)) {
          this.errors.push({
            file: `tags/${tagId}`,
            message: `Tag '${tagId}' references unknown trigger '${triggerId}'`,
          });
        }
      }
    }

    // Check that all tag references in zones are valid (if zones reference tags)
    for (const [zoneId, zone] of this.zones) {
      if (zone.tags) {
        for (const tagId of zone.tags) {
          if (!this.tags.has(tagId)) {
            this.errors.push({
              file: `zones/${zoneId}`,
              message: `Zone '${zoneId}' references unknown tag '${tagId}'`,
            });
          }
        }
      }
    }

    // Check that all zone references in tags are valid
    const zoneNames = new Set(Array.from(this.zones.values()).map(z => z.name));
    const zoneIds = new Set(Array.from(this.zones.keys()));
    for (const [tagId, tag] of this.tags) {
      const tagZones = (tag as any).zones || [];
      for (const zoneName of tagZones) {
        if (!zoneNames.has(zoneName) && !zoneIds.has(zoneName)) {
          this.warnings.push(`Tag '${tagId}' references unknown zone '${zoneName}'`);
        }
      }
    }

    // Check for circular dependencies (simplified)
    // TODO: More thorough cycle detection
  }

  private async generateBundles(): Promise<CompiledBundle[]> {
    const bundles: CompiledBundle[] = [];

    // Generate runtime core bundle
    const coreBundle = await this.generateCoreBundle();
    bundles.push(coreBundle);

    // Generate zone-specific bundles
    for (const [zoneId, zone] of this.zones) {
      const zoneBundle = await this.generateZoneBundle(zoneId, zone);
      bundles.push(zoneBundle);
    }

    // Generate a default bundle for tags not in any zone
    const orphanTags = this.findOrphanTags();
    if (orphanTags.length > 0) {
      const defaultBundle = await this.generateDefaultBundle(orphanTags);
      bundles.push(defaultBundle);
    }

    return bundles;
  }

  private async generateCoreBundle(): Promise<CompiledBundle> {
    const triggers = Array.from(this.triggers.values());
    const variables = Array.from(this.variables.values());
    
    const triggersJson = JSON.stringify(triggers, (_key, value) => {
      if (value instanceof RegExp) {
        return { __regexp: value.source, flags: value.flags };
      }
      return value;
    });

    const variablesJson = JSON.stringify(variables, (_key, value) => {
      if (typeof value === 'function') {
        return `__FUNC_${value.toString()}__`;
      }
      return value;
    });

    // Create a temporary entry point that initializes the runtime
    // We point to the actual source file in the workspace
    const runtimeSrcPath = resolve(process.cwd(), 'packages/runtime/src/index.ts');
    
    const entryCode = `
import { initYourTM } from '${runtimeSrcPath}';

const config = {
  containerId: '${this.config.containerId}',
  debug: ${!!this.config.debug},
  triggers: ${triggersJson},
  variables: ${variablesJson}
};

// Revive variables if they have functions
if (config.variables) {
  config.variables.forEach(v => {
    Object.keys(v).forEach(k => {
      if (typeof v[k] === 'string' && v[k].startsWith('__FUNC_')) {
        const fnStr = v[k].substring(7, v[k].length - 2);
        try {
          v[k] = eval('(' + fnStr + ')');
        } catch(e) {
          console.error('[YTM] Failed to revive function', k, e);
        }
      }
    });
  });
}

initYourTM(config);
`;

    const result = await esbuild.build({
      stdin: {
        contents: entryCode,
        loader: 'ts',
        resolveDir: process.cwd(),
      },
      bundle: true,
      minify: this.config.minify,
      sourcemap: this.config.sourcemap ? 'external' : false,
      format: 'iife',
      globalName: 'YTM_CORE',
      write: false,
      target: ['es2020'],
    });

    const jsFile = result.outputFiles.find(f => !f.path.endsWith('.map'));
    const mapFile = result.outputFiles.find(f => f.path.endsWith('.map'));
    const code = jsFile?.text || '';
    const map = mapFile?.text;

    return {
      name: 'core.js',
      code,
      map,
      size: Buffer.byteLength(code, 'utf8'),
    };
  }

  private async generateZoneBundle(zoneId: string, zone: ZoneDefinition): Promise<CompiledBundle> {
    // Find tags that reference this zone
    const tags: TagDefinition[] = [];
    for (const tag of this.tags.values()) {
      // Check if tag has this zone in its zones array
      const tagZones = (tag as any).zones || [];
      if (tagZones.includes(zoneId) || tagZones.includes(zone.name)) {
        tags.push(tag);
      }
    }
    // Also include tags explicitly listed in zone.tags (if present)
    if (zone.tags) {
      for (const tagId of zone.tags) {
        const tag = this.tags.get(tagId);
        if (tag && !tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }
    const code = this.generateTagsCode(tags, zone);

    const result = await esbuild.build({
      stdin: {
        contents: code,
        loader: 'js',
      },
      bundle: true,
      minify: this.config.minify,
      sourcemap: this.config.sourcemap ? 'external' : false,
      format: 'iife',
      write: false,
      target: ['es2020'],
    });

    const jsFile = result.outputFiles.find(f => !f.path.endsWith('.map'));
    const mapFile = result.outputFiles.find(f => f.path.endsWith('.map'));
    const jsCode = jsFile?.text || '';
    const map = mapFile?.text;

    return {
      name: `zone-${zoneId}.js`,
      code: jsCode,
      map,
      size: Buffer.byteLength(jsCode, 'utf8'),
    };
  }

  private async generateDefaultBundle(tags: TagDefinition[]): Promise<CompiledBundle> {
    const code = this.generateTagsCode(tags);

    const result = await esbuild.build({
      stdin: {
        contents: code,
        loader: 'js',
      },
      bundle: true,
      minify: this.config.minify,
      sourcemap: this.config.sourcemap ? 'external' : false,
      format: 'iife',
      write: false,
      target: ['es2020'],
    });

    const jsFile = result.outputFiles.find(f => !f.path.endsWith('.map'));
    const mapFile = result.outputFiles.find(f => f.path.endsWith('.map'));
    const jsCode = jsFile?.text || '';
    const map = mapFile?.text;

    return {
      name: 'tags.js',
      code: jsCode,
      map,
      size: Buffer.byteLength(jsCode, 'utf8'),
    };
  }

  private sanitizeId(id: string): string {
    // Convert hyphens and spaces to underscores for valid JS identifiers
    return id.replace(/[-\s]/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  }

  private generateTagsCode(tags: TagDefinition[], zone?: ZoneDefinition): string {
    const tagsJson = tags.map(tag => {
      const safeId = this.sanitizeId(tag.id);
      return {
        id: tag.id,
        name: tag.name,
        type: tag.type,
        triggers: tag.triggers,
        priority: tag.priority || 0,
        consent: tag.consent || [],
        platform: tag.platform,
        code: `__TAG_${safeId}__`,
      };
    });

    let code = `
(function() {
  'use strict';
`;

    // Generate tag functions
    tags.forEach(tag => {
      const safeId = this.sanitizeId(tag.id);
      // Prefer execute over code
      const executeFunc = tag.execute || tag.code;
      let tagCode: string;

      if (typeof executeFunc === 'function') {
        let fnStr = executeFunc.toString();
        // Handle ES6 method shorthand (execute(ctx) {...} -> function execute(ctx) {...})
        // Also handle async method shorthand (async setup() {...} -> async function setup() {...})
        if (fnStr.startsWith('async ') && !fnStr.startsWith('async function')) {
          fnStr = fnStr.replace(/^async\s+/, 'async function ');
        } else if (!fnStr.startsWith('function') && !fnStr.startsWith('async') && !fnStr.startsWith('(')) {
          fnStr = 'function ' + fnStr;
        }
        tagCode = fnStr;
      } else if (typeof executeFunc === 'string') {
        tagCode = `function(context) { ${executeFunc} }`;
      } else {
        tagCode = 'function(context) {}';
      }

      // Handle setup function if present
      let setupCode: string | null = null;
      if (tag.setup && typeof tag.setup === 'function') {
        let setupStr = tag.setup.toString();
        // Handle async method shorthand
        if (setupStr.startsWith('async ') && !setupStr.startsWith('async function')) {
          setupStr = setupStr.replace(/^async\s+/, 'async function ');
        } else if (!setupStr.startsWith('function') && !setupStr.startsWith('async') && !setupStr.startsWith('(')) {
          setupStr = 'function ' + setupStr;
        }
        setupCode = setupStr;
      }

      code += `
  function __TAG_${safeId}__(context) {
    return (${tagCode})(context);
  }
`;

      if (setupCode) {
        code += `
  __TAG_${safeId}__._setup = ${setupCode};
`;
      }
    });

    // Register tags - use the pre-computed code reference
    code += `
  var tags = ${JSON.stringify(tagsJson)};
  tags.forEach(function(tag) {
    tag.code = eval(tag.code);
    window.YourTM.registerTag(tag);
  });
`;

    if (zone) {
      const patterns = zone.patterns || zone.urlPatterns || [];
      code += `
  // Zone: ${zone.name}
  // URL Patterns: ${JSON.stringify(patterns)}
`;
    }

    code += `
})();
`;

    return code;
  }

  private findOrphanTags(): TagDefinition[] {
    // Find tags that don't belong to any zone
    const zoneNames = new Set(Array.from(this.zones.values()).map(z => z.name));
    const zoneIds = new Set(Array.from(this.zones.keys()));

    return Array.from(this.tags.values()).filter(tag => {
      const tagZones = (tag as any).zones || [];
      // Tag is an orphan if it has no zones or none of its zones exist
      if (tagZones.length === 0) return true;
      return !tagZones.some((z: string) => zoneNames.has(z) || zoneIds.has(z));
    });
  }

  async writeBundles(bundles: CompiledBundle[]): Promise<void> {
    const outDir = this.config.outDir;
    await mkdir(outDir, { recursive: true });

    for (const bundle of bundles) {
      const outPath = join(outDir, bundle.name);
      await writeFile(outPath, bundle.code);
      logger.file('create', relative(process.cwd(), outPath));

      if (bundle.map) {
        const mapPath = join(outDir, bundle.name + '.map');
        await writeFile(mapPath, bundle.map);
        logger.file('create', relative(process.cwd(), mapPath));
      }
    }
  }
}

// Helper functions for defining tags, triggers, and zones
export function defineTag(tag: TagDefinition): TagDefinition {
  return tag;
}

export function defineTrigger(trigger: TriggerDefinition): TriggerDefinition {
  return trigger;
}

export function defineZone(zone: ZoneDefinition): ZoneDefinition {
  return zone;
}

export function defineVariable(variable: VariableDefinition): VariableDefinition {
  return variable;
}
