import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, basename, dirname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
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
  private errors: CompileError[] = [];
  private warnings: string[] = [];

  constructor(config: YourTMConfig) {
    this.config = config;
  }

  async compile(): Promise<CompileResult> {
    this.tags.clear();
    this.triggers.clear();
    this.zones.clear();
    this.errors = [];
    this.warnings = [];

    // Load all definitions
    await this.loadTriggers();
    await this.loadTags();
    await this.loadZones();

    // Validate references
    this.validateReferences();

    if (this.errors.length > 0) {
      return {
        bundles: [],
        tags: [],
        triggers: [],
        zones: [],
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
    });

    const code = result.outputFiles[0].text;

    // Write to temp file and import
    const tempDir = join(dirname(filepath), '.ytm-temp');
    await mkdir(tempDir, { recursive: true });
    const tempPath = join(tempDir, `${basename(filepath, '.ts')}.mjs`);

    try {
      await writeFile(tempPath, code);
      const moduleUrl = pathToFileURL(tempPath).href + `?t=${Date.now()}`;
      const module = await import(moduleUrl);
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
    const runtimeCode = this.generateRuntimeCode();

    const result = await esbuild.build({
      stdin: {
        contents: runtimeCode,
        loader: 'js',
      },
      bundle: true,
      minify: this.config.minify,
      sourcemap: this.config.sourcemap ? 'external' : false,
      format: 'iife',
      globalName: 'YTM',
      write: false,
      target: ['es2020'],
    });

    // esbuild with stdin outputs to '<stdin>.js' or just the first file
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

  private generateRuntimeCode(): string {
    const triggers = Array.from(this.triggers.values());
    const triggersJson = JSON.stringify(triggers, (_key, value) => {
      if (value instanceof RegExp) {
        return { __regexp: value.source, flags: value.flags };
      }
      return value;
    });

    return `
(function() {
  'use strict';

  // YourTM Runtime v${this.config.containerId}
  const containerId = '${this.config.containerId}';

  // Data layer
  window.dataLayer = window.dataLayer || [];

  // Internal state
  const state = {
    tags: new Map(),
    triggers: new Map(),
    zones: new Map(),
    consent: {},
    initialized: false,
  };

  // Trigger registry
  const triggers = ${triggersJson};
  triggers.forEach(t => state.triggers.set(t.id, t));

  // Event handlers
  const handlers = {
    pageview: () => {
      fireTrigger('pageview');
    },
    click: (e) => {
      fireTrigger('click', { element: e.target, event: e });
    },
    scroll: () => {
      fireTrigger('scroll', { scrollY: window.scrollY });
    },
  };

  function fireTrigger(type, context = {}) {
    const trigger = Array.from(state.triggers.values()).find(t => t.type === type);
    if (!trigger) return;

    const tagsToFire = Array.from(state.tags.values())
      .filter(tag => tag.triggers.includes(trigger.id))
      .filter(tag => checkConsent(tag))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    tagsToFire.forEach(tag => executeTag(tag, context));
  }

  function checkConsent(tag) {
    if (!tag.consent || tag.consent.length === 0) return true;
    return tag.consent.every(c => state.consent[c] === true);
  }

  async function executeTag(tag, context) {
    const start = performance.now();
    try {
      if (typeof tag.code === 'function') {
        const result = tag.code(context);
        if (result instanceof Promise) {
          await Promise.race([
            result,
            new Promise(resolve => setTimeout(resolve, 10000))
          ]);
        }
      }
      const latency = performance.now() - start;
      trackTelemetry(tag.id, true, latency);
    } catch (error) {
      const latency = performance.now() - start;
      trackTelemetry(tag.id, false, latency, error);
      console.error('[YTM] Tag error:', tag.id, error);
    }
  }

  function trackTelemetry(tagId, success, latency, error) {
    // Send telemetry to YourTM servers
    if (window.__YTM_TELEMETRY__) {
      window.__YTM_TELEMETRY__.push({
        tagId,
        success,
        latency,
        error: error?.message,
        timestamp: Date.now(),
      });
    }
  }

  // Public API
  window.YTM = {
    init: function() {
      if (state.initialized) return;
      state.initialized = true;
      document.addEventListener('DOMContentLoaded', handlers.pageview);
      document.addEventListener('click', handlers.click);
      window.addEventListener('scroll', handlers.scroll, { passive: true });
    },
    registerTag: function(tag) {
      state.tags.set(tag.id, tag);
    },
    setConsent: function(consent) {
      state.consent = { ...state.consent, ...consent };
    },
    push: function(data) {
      window.dataLayer.push(data);
    },
    _state: state,
  };

  // Auto-initialize
  window.YTM.init();
})();
`;
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
    window.YTM.registerTag(tag);
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
