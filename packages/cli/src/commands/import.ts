import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import readline from 'node:readline';
import { logger } from '../utils/logger.js';
import { loadConfig, type YourTMConfig } from '../utils/config.js';
import { slugify } from '../templates/utils.js';

interface ImportOptions {
  output?: string;
  force?: boolean;
  skipZoneDiscovery?: boolean;
  apiKey?: string;
  provider?: 'anthropic' | 'openai';
}

// Zone discovery AI prompt
const ZONE_DISCOVERY_PROMPT = `You are a tag management expert. Analyze the GTM triggers to suggest URL zones for a YourTM container.

## Task
Analyze the provided GTM triggers and suggest zone definitions based on:
1. Event names in custom event triggers (e.g., "purchase", "view_item", "begin_checkout")
2. URL conditions in trigger filters
3. Trigger names that indicate page types

## Zone Naming Conventions
Use these standard zone IDs when applicable:
- purchase: Order confirmation, thank you pages
- checkout: Checkout flow pages
- pdp: Product detail pages (view_item events)
- plp: Product listing/category pages (view_item_list events)
- search: Search results pages
- homepage: Homepage only
- cart: Cart/bag pages
- global: Tags that fire everywhere (don't create this zone, it's built-in)

## Output Format (JSON only)
{
  "zones": [
    {
      "id": "purchase",
      "name": "Purchase Confirmation",
      "description": "Order confirmation and thank you pages",
      "patterns": ["/checkout/confirm*", "/order-complete*", "/thank-you*", "/thankyou*"],
      "eventSignals": ["purchase", "transaction_complete", "order_complete"]
    }
  ],
  "tagZoneAssignments": {
    "tag-name-slugified": "purchase",
    "another-tag": "pdp"
  }
}

## Rules
1. Only suggest zones that have clear evidence from triggers
2. Use convention-based URL patterns as defaults (can be customized by user)
3. Map tags to zones based on their trigger's event names
4. Tags with generic "All Pages" or "Page View" triggers should be assigned to "global"
5. Tags with initialization triggers should be assigned to "global"

ONLY output valid JSON.`;

// Convention-based URL defaults for common zones
const ZONE_URL_DEFAULTS: Record<string, { patterns: string[]; description: string }> = {
  purchase: {
    patterns: ['/checkout/confirm*', '/order-complete*', '/thank-you*', '/thankyou*', '/order/confirmation*'],
    description: 'Order confirmation and thank you pages',
  },
  checkout: {
    patterns: ['/checkout*', '/cart/checkout*', '/payment*'],
    description: 'Checkout flow pages',
  },
  pdp: {
    patterns: ['/products/*', '/product/*', '/p/*', '/item/*', '/items/*'],
    description: 'Product detail pages',
  },
  plp: {
    patterns: ['/collections/*', '/category/*', '/categories/*', '/c/*', '/shop/*'],
    description: 'Product listing and category pages',
  },
  search: {
    patterns: ['/search*', '/s/*', '/*?q=*', '/*?search=*'],
    description: 'Search results pages',
  },
  homepage: {
    patterns: ['/', '/home', '/index.html'],
    description: 'Homepage only',
  },
  cart: {
    patterns: ['/cart*', '/bag*', '/basket*'],
    description: 'Shopping cart pages',
  },
};

interface ZoneSuggestion {
  id: string;
  name: string;
  description: string;
  patterns: string[];
  eventSignals?: string[];
}

interface ZoneDiscoveryResult {
  zones: ZoneSuggestion[];
  tagZoneAssignments: Record<string, string>;
}

// AI API call functions (shared pattern with analyze.ts)
async function callAI(
  provider: 'anthropic' | 'openai',
  apiKey: string,
  systemPrompt: string,
  userContent: string
): Promise<string> {
  if (provider === 'anthropic') {
    return callAnthropic(apiKey, systemPrompt, userContent);
  } else {
    return callOpenAI(apiKey, systemPrompt, userContent);
  }
}

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userContent: string
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6-20260301',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> };
  const textContent = data.content.find((c) => c.type === 'text');
  return textContent?.text || '';
}

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userContent: string
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5.4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_completion_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content || '';
}

// Helper to prompt user for confirmation
async function promptUser(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export async function importCommand(
  source: string,
  filePath: string,
  options: ImportOptions = {}
): Promise<void> {
  if (source !== 'gtm') {
    logger.error(`Unsupported import source: ${source}. Currently only 'gtm' is supported.`);
    process.exit(1);
  }

  const cwd = process.cwd();
  logger.header(`Importing from ${source.toUpperCase()}`);
  logger.newline();

  if (!existsSync(filePath)) {
    logger.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const config = await loadConfig(cwd).catch(() => null);
  const importer = new GtmImporter(config, cwd, options);
  
  try {
    await importer.import(filePath);
  } catch (error) {
    logger.error(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// GTM built-in trigger IDs
const GTM_BUILTIN_TRIGGERS: Record<string, { name: string; type: string }> = {
  '2147479553': { name: 'All Pages', type: 'PAGEVIEW' },
  '2147479572': { name: 'Consent Initialization', type: 'CONSENT_INIT' },
  '2147479573': { name: 'Initialization', type: 'INIT' },
};

class GtmImporter {
  private config: YourTMConfig | null;
  private cwd: string;
  private options: ImportOptions;
  private triggerMap = new Map<string, string>(); // GTM ID -> Slugified ID
  private variableMap = new Map<string, string>(); // GTM Name -> Slugified ID
  private createdBuiltinTriggers = new Set<string>(); // Track which built-in triggers we've created
  private tagNameToId = new Map<string, string>(); // GTM Tag Name -> Slugified ID
  private tagSetupDeps = new Map<string, string[]>(); // Tag ID -> Array of setup tag IDs (dependsOn)
  private setupTagParents = new Map<string, string[]>(); // Setup tag ID -> Array of parent tag IDs (to inherit triggers)
  private discoveredZones: ZoneSuggestion[] = []; // AI-discovered zones
  private tagZoneAssignments = new Map<string, string>(); // Tag ID -> Zone ID

  constructor(config: YourTMConfig | null, cwd: string, options: ImportOptions) {
    this.config = config;
    this.cwd = cwd;
    this.options = options;

    // Pre-populate trigger map with built-in triggers
    for (const [id, info] of Object.entries(GTM_BUILTIN_TRIGGERS)) {
      this.triggerMap.set(id, slugify(info.name));
    }
  }

  /**
   * Sanitize identifier - ensure it's a valid JS identifier
   */
  private sanitizeIdentifier(name: string): string {
    let id = name.replace(/-/g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
    // If starts with number, prefix with underscore
    if (/^[0-9]/.test(id)) {
      id = '_' + id;
    }
    return id;
  }

  /**
   * Convert GTM {{Variable Name}} references to ctx.variables['variable-name']
   * Handles cases where the variable is inside a quoted string
   */
  private convertGtmVariableRefs(code: string): string {
    // Handle exact matches: '{{var}}' becomes ctx.variables['var']
    code = code.replace(/'(\{\{[^}]+\}\})'/g, (_, varRef) => {
      const varName = varRef.replace(/\{\{|\}\}/g, '').trim();
      const slugifiedName = slugify(varName);
      return `ctx.variables['${slugifiedName}']`;
    });

    // Handle exact matches: "{{var}}" becomes ctx.variables['var']
    code = code.replace(/"(\{\{[^}]+\}\})"/g, (_, varRef) => {
      const varName = varRef.replace(/\{\{|\}\}/g, '').trim();
      const slugifiedName = slugify(varName);
      return `ctx.variables['${slugifiedName}']`;
    });

    // Handle standalone variables (not in quotes)
    return code.replace(/\{\{([^}]+)\}\}/g, (_, varName) => {
      const slugifiedName = slugify(varName.trim());
      return `ctx.variables['${slugifiedName}']`;
    });
  }

  /**
   * Extract function body from GTM Custom JS
   * GTM stores it as: function() { ... } or function(){ ... }
   */
  private extractFunctionBody(jsCode: string): string {
    // Remove leading/trailing whitespace
    jsCode = jsCode.trim();

    // Check if it's a function declaration
    const funcMatch = jsCode.match(/^function\s*\([^)]*\)\s*\{([\s\S]*)\}$/);
    if (funcMatch) {
      return funcMatch[1].trim();
    }

    // If it's not a function wrapper, return as-is
    return jsCode;
  }

  /**
   * Check if the JS code is just returning a function (common GTM pattern)
   */
  private isReturningFunction(code: string): boolean {
    const trimmed = code.trim();
    return trimmed.startsWith('return function') || trimmed.startsWith('return async function');
  }

  async import(filePath: string): Promise<void> {
    const spinner = ora('Reading GTM export file...').start();
    const rawJson = await readFile(filePath, 'utf-8');
    const gtm = JSON.parse(rawJson);
    spinner.succeed('GTM export file loaded');

    const containerVersion = gtm.containerVersion;
    if (!containerVersion) {
      throw new Error('Invalid GTM export: missing containerVersion');
    }

    const { variable, trigger, tag } = containerVersion;

    // 1. Process Variables
    if (variable) {
      spinner.start(`Importing ${variable.length} variables...`);
      for (const v of variable) {
        await this.importVariable(v);
      }
      spinner.succeed(`Imported ${variable.length} variables`);
    }

    // 2. Process Triggers
    if (trigger) {
      spinner.start(`Importing ${trigger.length} triggers...`);
      for (const t of trigger) {
        await this.importTrigger(t);
      }
      spinner.succeed(`Imported ${trigger.length} triggers`);
    }

    // 3. AI Zone Discovery (before tags)
    if (!this.options.skipZoneDiscovery && tag && trigger) {
      await this.discoverZones(trigger, tag, spinner);
    }

    // 4. Process Tags (two-pass for tag sequencing)
    if (tag) {
      // First pass: build name->id map and extract setupTag relationships
      spinner.start(`Analyzing ${tag.length} tags for sequencing...`);
      for (const t of tag) {
        const tagId = slugify(t.name);
        this.tagNameToId.set(t.name, tagId);

        // Extract setupTag dependencies (fire-before tags)
        if (t.setupTag && Array.isArray(t.setupTag)) {
          const setupIds: string[] = [];
          for (const setup of t.setupTag) {
            if (setup.tagName) {
              const setupId = slugify(setup.tagName);
              setupIds.push(setupId);
              // Track that this setup tag is used by this parent tag
              const parents = this.setupTagParents.get(setupId) || [];
              parents.push(tagId);
              this.setupTagParents.set(setupId, parents);
            }
          }
          if (setupIds.length > 0) {
            this.tagSetupDeps.set(tagId, setupIds);
          }
        }
      }

      // Second pass: import tags with proper dependsOn and zone assignments
      spinner.text = `Importing ${tag.length} tags...`;
      for (const t of tag) {
        await this.importTag(t, tag);
      }
      spinner.succeed(`Imported ${tag.length} tags`);
    }

    logger.newline();
    logger.success('Import complete!');
    logger.info(`Generated files in ${chalk.cyan(relative(this.cwd, this.config?.tagsDir || 'yourtm/'))}`);

    // Show zone summary
    if (this.discoveredZones.length > 0) {
      logger.newline();
      logger.info('Zones created:');
      for (const zone of this.discoveredZones) {
        console.log(chalk.cyan(`  ${zone.id}: `) + chalk.gray(zone.description));
      }
      logger.newline();
      logger.info(chalk.yellow('Review zone patterns in yourtm/zones/ and adjust to match your site structure.'));
    }
  }

  /**
   * AI-powered zone discovery based on GTM triggers
   */
  private async discoverZones(triggers: any[], tags: any[], spinner: Ora): Promise<void> {
    // Check for API key
    const apiKey = this.options.apiKey || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      spinner.info('Skipping AI zone discovery (no API key). All tags will use "global" zone.');
      logger.info('To enable zone discovery, set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.');
      logger.newline();
      return;
    }

    const provider = this.options.provider ||
      (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY ? 'openai' : 'anthropic');

    spinner.start('Analyzing triggers for zone discovery...');

    // Extract trigger data for AI analysis
    const triggerData = triggers.map(t => ({
      id: t.triggerId,
      name: t.name,
      type: t.type,
      eventName: t.parameter?.find((p: any) => p.key === 'eventName')?.value,
      filters: t.filter?.map((f: any) => ({
        variable: f.parameter?.find((p: any) => p.key === 'arg0')?.value,
        operator: f.type,
        value: f.parameter?.find((p: any) => p.key === 'arg1')?.value,
      })) || [],
    }));

    // Extract tag-to-trigger mappings
    const tagTriggerMap = tags.map(t => ({
      id: slugify(t.name),
      name: t.name,
      triggerIds: t.firingTriggerId || [],
      type: t.type,
    }));

    // Build trigger ID to name/event map
    const triggerIdMap: Record<string, { name: string; eventName?: string; type: string }> = {};
    for (const t of triggerData) {
      triggerIdMap[t.id] = { name: t.name, eventName: t.eventName, type: t.type };
    }
    // Add built-in triggers
    for (const [id, info] of Object.entries(GTM_BUILTIN_TRIGGERS)) {
      triggerIdMap[id] = { name: info.name, type: info.type };
    }

    const analysisContext = {
      triggers: triggerData,
      tags: tagTriggerMap,
      triggerIdMap,
    };

    try {
      spinner.text = 'Calling AI for zone suggestions...';
      const response = await callAI(
        provider,
        apiKey,
        ZONE_DISCOVERY_PROMPT,
        JSON.stringify(analysisContext, null, 2)
      );

      // Parse AI response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const result: ZoneDiscoveryResult = JSON.parse(jsonMatch[0]);
      spinner.succeed(`AI suggested ${result.zones.length} zones`);

      if (result.zones.length === 0) {
        logger.info('No specific zones detected. All tags will use "global" zone.');
        return;
      }

      // Display suggested zones
      logger.newline();
      logger.header('Suggested Zones');
      logger.newline();

      for (const zone of result.zones) {
        console.log(chalk.cyan.bold(`  ${zone.id}`));
        console.log(chalk.gray(`    ${zone.description}`));
        console.log(chalk.gray(`    Patterns: ${zone.patterns.join(', ')}`));
        if (zone.eventSignals && zone.eventSignals.length > 0) {
          console.log(chalk.gray(`    Events: ${zone.eventSignals.join(', ')}`));
        }
        console.log('');
      }

      // Show tag assignments
      const assignmentCount = Object.keys(result.tagZoneAssignments).length;
      if (assignmentCount > 0) {
        logger.info(`Tag zone assignments: ${assignmentCount} tags mapped to specific zones`);
        logger.newline();
      }

      // Prompt for confirmation
      const proceed = await promptUser(
        chalk.yellow('Create these zone files and proceed with import? (y/n) ')
      );

      if (!proceed) {
        logger.info('Zone discovery cancelled. Importing with "global" zone for all tags.');
        return;
      }

      // Store zones and assignments
      this.discoveredZones = result.zones;
      for (const [tagId, zoneId] of Object.entries(result.tagZoneAssignments)) {
        this.tagZoneAssignments.set(tagId, zoneId);
      }

      // Write zone files
      spinner.start('Creating zone files...');
      for (const zone of result.zones) {
        await this.writeZoneFile(zone);
      }
      spinner.succeed(`Created ${result.zones.length} zone files`);

    } catch (error) {
      spinner.warn(`Zone discovery failed: ${error instanceof Error ? error.message : String(error)}`);
      logger.info('Proceeding with "global" zone for all tags.');
    }
  }

  /**
   * Write a zone definition file
   */
  private async writeZoneFile(zone: ZoneSuggestion): Promise<void> {
    // Use convention-based defaults if no patterns provided
    const defaults = ZONE_URL_DEFAULTS[zone.id];
    const patterns = zone.patterns.length > 0 ? zone.patterns : (defaults?.patterns || [`/${zone.id}/*`]);

    const content = `import { defineZone } from '@yourtm/core'

export default defineZone({
  name: '${zone.id}',
  description: '${zone.description.replace(/'/g, "\\'")}',
  patterns: ${JSON.stringify(patterns, null, 4).replace(/\n/g, '\n  ')},
})
`;

    await this.writeFile('zones', `${zone.id}.ts`, content);
  }

  private async importVariable(gtmVar: any): Promise<void> {
    const id = slugify(gtmVar.name);
    const safeId = this.sanitizeIdentifier(id);
    this.variableMap.set(gtmVar.name, id);

    let type = 'defineVariable';
    let configStr = '';
    let imports = ['defineVariable'];

    switch (gtmVar.type) {
      case 'v': // Data Layer Variable
        type = 'defineDataLayerVariable';
        imports = ['defineDataLayerVariable'];
        const path = gtmVar.parameter?.find((p: any) => p.key === 'name')?.value || '';
        const version = gtmVar.parameter?.find((p: any) => p.key === 'dataLayerVersion')?.value;
        configStr = `path: '${path}'`;
        if (version === '2') {
          configStr += `,\n  version: 2`;
        }
        break;

      case 'c': // Constant
        type = 'defineConstantVariable';
        imports = ['defineConstantVariable'];
        const constValue = gtmVar.parameter?.find((p: any) => p.key === 'value')?.value || '';
        configStr = `value: '${constValue.replace(/'/g, "\\'")}'`;
        break;

      case 'k': // Cookie
        type = 'defineCookieVariable';
        imports = ['defineCookieVariable'];
        const cookieName = gtmVar.parameter?.find((p: any) => p.key === 'name')?.value || '';
        configStr = `cookieName: '${cookieName}'`;
        break;

      case 'u': // URL
        type = 'defineURLVariable';
        imports = ['defineURLVariable'];
        const component = gtmVar.parameter?.find((p: any) => p.key === 'component')?.value || 'URL';
        const queryKey = gtmVar.parameter?.find((p: any) => p.key === 'queryKey')?.value;
        configStr = `part: '${component.toLowerCase()}'`;
        if (queryKey) {
          configStr += `,\n  queryParam: '${queryKey}'`;
        }
        break;

      case 'f': // First Party Cookie
        type = 'defineFirstPartyCookieVariable';
        imports = ['defineFirstPartyCookieVariable'];
        const fpCookieName = gtmVar.parameter?.find((p: any) => p.key === 'name')?.value || '';
        configStr = `cookieName: '${fpCookieName}'`;
        break;

      case 'd': // DOM Element
        type = 'defineDOMElementVariable';
        imports = ['defineDOMElementVariable'];
        const elementId = gtmVar.parameter?.find((p: any) => p.key === 'elementId')?.value;
        const selector = gtmVar.parameter?.find((p: any) => p.key === 'selectorType')?.value;
        const attribute = gtmVar.parameter?.find((p: any) => p.key === 'attribute')?.value;
        if (elementId) {
          configStr = `selector: '#${elementId}'`;
        } else if (selector) {
          configStr = `selector: '${selector}'`;
        }
        if (attribute) {
          configStr += `,\n  attribute: '${attribute}'`;
        }
        break;

      case 'jsm': // Custom JavaScript
        type = 'defineJavaScriptVariable';
        imports = ['defineJavaScriptVariable'];
        let jsCode = gtmVar.parameter?.find((p: any) => p.key === 'javascript')?.value || '';

        // Convert GTM variable references
        jsCode = this.convertGtmVariableRefs(jsCode);

        // Extract function body if wrapped in function()
        const funcBody = this.extractFunctionBody(jsCode);

        // If it's returning a function, we need different handling
        if (this.isReturningFunction(funcBody)) {
          configStr = `resolve: (ctx) => {\n    ${funcBody}\n  }`;
        } else {
          // Wrap in a function that returns the result
          configStr = `resolve: (ctx) => {\n    ${funcBody}\n  }`;
        }
        break;

      case 'smm': // Lookup Table
        type = 'defineComputedVariable';
        imports = ['defineComputedVariable'];
        const inputVar = gtmVar.parameter?.find((p: any) => p.key === 'input')?.value;
        const mapEntries = gtmVar.parameter?.find((p: any) => p.key === 'map')?.list || [];
        const defaultVal = gtmVar.parameter?.find((p: any) => p.key === 'defaultValue')?.value;

        let lookupCode = `const input = ctx.variables['${slugify(inputVar?.replace(/\{\{|\}\}/g, '') || '')}'];\n`;
        lookupCode += `    const lookup = {\n`;
        for (const entry of mapEntries) {
          const key = entry.map?.find((m: any) => m.key === 'key')?.value || '';
          const val = entry.map?.find((m: any) => m.key === 'value')?.value || '';
          lookupCode += `      '${key.replace(/'/g, "\\'")}': '${val.replace(/'/g, "\\'")}',\n`;
        }
        lookupCode += `    };\n`;
        lookupCode += `    return lookup[input]${defaultVal ? ` || '${defaultVal}'` : ''}`;
        configStr = `compute: (ctx) => {\n    ${lookupCode}\n  }`;
        break;

      case 'remm': // RegEx Table
        type = 'defineComputedVariable';
        imports = ['defineComputedVariable'];
        const regexInput = gtmVar.parameter?.find((p: any) => p.key === 'input')?.value;
        const regexEntries = gtmVar.parameter?.find((p: any) => p.key === 'map')?.list || [];
        const regexDefault = gtmVar.parameter?.find((p: any) => p.key === 'defaultValue')?.value;

        let regexCode = `const input = String(ctx.variables['${slugify(regexInput?.replace(/\{\{|\}\}/g, '') || '')}'] || '');\n`;
        for (let i = 0; i < regexEntries.length; i++) {
          const pattern = regexEntries[i].map?.find((m: any) => m.key === 'key')?.value || '';
          const replacement = regexEntries[i].map?.find((m: any) => m.key === 'value')?.value || '';
          // Escape special regex chars for use in regex literal - forward slash especially
          const safePattern = pattern
            .replace(/\\/g, '\\\\')
            .replace(/\//g, '\\/')
            .replace(/'/g, "\\'");
          regexCode += `    if (/${safePattern}/.test(input)) return '${replacement.replace(/'/g, "\\'")}';\n`;
        }
        regexCode += `    return ${regexDefault ? `'${regexDefault}'` : 'undefined'}`;
        configStr = `compute: (ctx) => {\n    ${regexCode}\n  }`;
        break;

      case 'j': // JavaScript Variable (global)
        type = 'defineJavaScriptVariable';
        imports = ['defineJavaScriptVariable'];
        const globalVarName = gtmVar.parameter?.find((p: any) => p.key === 'name')?.value || '';
        configStr = `resolve: () => {\n    return (window as any)['${globalVarName}'];\n  }`;
        break;

      default:
        // Fallback for unknown types
        type = 'defineVariable';
        imports = ['defineVariable'];
        configStr = `type: '${gtmVar.type}', // Unmapped GTM type - requires manual implementation\n  resolve: (ctx) => {\n    // TODO: Implement\n    return undefined;\n  }`;
    }

    const content = `import { ${imports.join(', ')} } from '@yourtm/core'

export const ${safeId} = ${type}({
  name: '${gtmVar.name.replace(/'/g, "\\'")}',
  ${configStr}
})

export default ${safeId}
`;

    await this.writeFile('variables', `${id}.ts`, content);
  }

  private async importTrigger(gtmTrigger: any): Promise<void> {
    const id = slugify(gtmTrigger.name);
    this.triggerMap.set(gtmTrigger.triggerId, id);

    let type = 'defineTrigger';
    let configLines: string[] = [];
    let imports = ['defineTrigger'];

    // Extract filter conditions if present
    const filters = gtmTrigger.filter || [];
    const conditions = this.extractTriggerConditions(filters);

    switch (gtmTrigger.type) {
      case 'PAGEVIEW':
        type = 'definePageviewTrigger';
        imports = ['definePageviewTrigger'];
        break;

      case 'DOM_READY':
        type = 'defineDOMReadyTrigger';
        imports = ['defineDOMReadyTrigger'];
        break;

      case 'WINDOW_LOADED':
        type = 'defineWindowLoadedTrigger';
        imports = ['defineWindowLoadedTrigger'];
        break;

      case 'CLICK':
      case 'LINK_CLICK':
        type = 'defineClickTrigger';
        imports = ['defineClickTrigger'];
        const clickSelector = this.extractClickSelector(gtmTrigger);
        if (clickSelector) {
          configLines.push(`selector: '${clickSelector}'`);
        }
        if (gtmTrigger.type === 'LINK_CLICK') {
          configLines.push(`linkOnly: true`);
        }
        break;

      case 'FORM_SUBMIT':
        type = 'defineFormSubmitTrigger';
        imports = ['defineFormSubmitTrigger'];
        const formSelector = this.extractFormSelector(gtmTrigger);
        if (formSelector) {
          configLines.push(`selector: '${formSelector}'`);
        }
        break;

      case 'HISTORY_CHANGE':
        type = 'defineHistoryChangeTrigger';
        imports = ['defineHistoryChangeTrigger'];
        break;

      case 'JAVASCRIPT_ERROR':
        type = 'defineErrorTrigger';
        imports = ['defineErrorTrigger'];
        break;

      case 'SCROLL_DEPTH':
        type = 'defineScrollTrigger';
        imports = ['defineScrollTrigger'];
        const scrollThreshold = gtmTrigger.parameter?.find((p: any) => p.key === 'verticalThresholdPercent')?.value;
        if (scrollThreshold) {
          configLines.push(`threshold: ${scrollThreshold}`);
        }
        break;

      case 'ELEMENT_VISIBILITY':
        type = 'defineVisibilityTrigger';
        imports = ['defineVisibilityTrigger'];
        const visSelector = gtmTrigger.parameter?.find((p: any) => p.key === 'elementSelector')?.value;
        if (visSelector) {
          configLines.push(`selector: '${visSelector}'`);
        }
        break;

      case 'YOUTUBE_VIDEO':
        type = 'defineYouTubeTrigger';
        imports = ['defineYouTubeTrigger'];
        break;

      case 'TIMER':
        type = 'defineTimerTrigger';
        imports = ['defineTimerTrigger'];
        const interval = gtmTrigger.parameter?.find((p: any) => p.key === 'interval')?.value;
        const limit = gtmTrigger.parameter?.find((p: any) => p.key === 'limit')?.value;
        if (interval) {
          configLines.push(`interval: ${interval}`);
        }
        if (limit) {
          configLines.push(`limit: ${limit}`);
        }
        break;

      case 'CUSTOM_EVENT':
        type = 'defineCustomEventTrigger';
        imports = ['defineCustomEventTrigger'];
        const eventName = gtmTrigger.parameter?.find((p: any) => p.key === 'eventName')?.value;
        if (eventName) {
          configLines.push(`eventName: '${eventName}'`);
        }
        break;

      default:
        // Fallback for unknown trigger types
        type = 'defineTrigger';
        imports = ['defineTrigger'];
        configLines.push(`type: '${gtmTrigger.type}'`);  // Unmapped GTM trigger type
    }

    // Add conditions if present
    if (conditions.length > 0) {
      configLines.push(`conditions: [${conditions.join(', ')}]`);
    }

    const configStr = configLines.length > 0 ? `\n  ${configLines.join(',\n  ')},` : '';

    const content = `import { ${imports.join(', ')} } from '@yourtm/core'

export default ${type}({
  id: '${id}',
  name: '${gtmTrigger.name.replace(/'/g, "\\'")}',${configStr}
})
`;

    await this.writeFile('triggers', `${id}.ts`, content);
  }

  /**
   * Extract trigger conditions from GTM filter
   */
  private extractTriggerConditions(filters: any[]): string[] {
    return filters.map(filter => {
      const variable = filter.parameter?.find((p: any) => p.key === 'arg0')?.value || '';
      const operator = filter.type || 'equals';
      const value = filter.parameter?.find((p: any) => p.key === 'arg1')?.value || '';

      // Extract variable name from {{Variable Name}} format and slugify it
      const varMatch = variable.match(/\{\{([^}]+)\}\}/);
      const varName = varMatch ? slugify(varMatch[1].trim()) : slugify(variable);

      // Escape single quotes in value
      const escapedValue = value.replace(/'/g, "\\'");

      return `{ variable: '${varName}', operator: '${operator}', value: '${escapedValue}' }`;
    });
  }

  /**
   * Extract click selector from GTM trigger
   */
  private extractClickSelector(gtmTrigger: any): string | null {
    const filters = gtmTrigger.filter || [];
    for (const filter of filters) {
      const varName = filter.parameter?.find((p: any) => p.key === 'arg0')?.value;
      if (varName === '{{Click Element}}' || varName === '{{Click ID}}' || varName === '{{Click Classes}}') {
        const value = filter.parameter?.find((p: any) => p.key === 'arg1')?.value;
        if (value) {
          if (varName === '{{Click ID}}') return `#${value}`;
          if (varName === '{{Click Classes}}') return `.${value.replace(/\s+/g, '.')}`;
          return value;
        }
      }
    }
    return null;
  }

  /**
   * Extract form selector from GTM trigger
   */
  private extractFormSelector(gtmTrigger: any): string | null {
    const filters = gtmTrigger.filter || [];
    for (const filter of filters) {
      const varName = filter.parameter?.find((p: any) => p.key === 'arg0')?.value;
      if (varName === '{{Form ID}}' || varName === '{{Form Classes}}') {
        const value = filter.parameter?.find((p: any) => p.key === 'arg1')?.value;
        if (value) {
          if (varName === '{{Form ID}}') return `#${value}`;
          if (varName === '{{Form Classes}}') return `.${value.replace(/\s+/g, '.')}`;
        }
      }
    }
    return null;
  }

  private async importTag(gtmTag: any, allTags: any[]): Promise<void> {
    const id = slugify(gtmTag.name);
    let triggerIds = gtmTag.firingTriggerId || [];

    // Check if this tag is used as a setup tag (fire-before) by another tag
    // If so and it has no triggers, inherit triggers from the first parent
    const parentTagIds = this.setupTagParents.get(id);
    if (triggerIds.length === 0 && parentTagIds && parentTagIds.length > 0) {
      // Find the first parent tag and inherit its triggers
      const parentTagName = [...this.tagNameToId.entries()]
        .find(([_, tagId]) => tagId === parentTagIds[0])?.[0];
      if (parentTagName) {
        const parentTag = allTags.find(t => t.name === parentTagName);
        if (parentTag?.firingTriggerId) {
          triggerIds = parentTag.firingTriggerId;
        }
      }
    }

    // Create any built-in triggers that are referenced
    for (const tid of triggerIds) {
      if (GTM_BUILTIN_TRIGGERS[tid] && !this.createdBuiltinTriggers.has(tid)) {
        await this.createBuiltinTrigger(tid);
        this.createdBuiltinTriggers.add(tid);
      }
    }

    const triggers = triggerIds.map((tid: string) => this.triggerMap.get(tid) || tid);

    // Get dependsOn from setupTag relationships (tags that must fire before this one)
    const dependsOn = this.tagSetupDeps.get(id) || [];

    let executeBody = '// Manual implementation required';

    if (gtmTag.type === 'html') {
      const html = gtmTag.parameter.find((p: any) => p.key === 'html')?.value || '';
      executeBody = `// Custom HTML Tag
    const script = document.createElement('script');
    script.text = \`${html.replace(/\`/g, '\\`')}\`;
    document.head.appendChild(script);`;
    } else if (gtmTag.type === 'gaawe') {
      executeBody = `// GA4 Event
    // Measurement ID: ${gtmTag.parameter.find((p: any) => p.key === 'measurementId')?.value}`;
    }

    // Build optional properties
    const dependsOnLine = dependsOn.length > 0 ? `\n  dependsOn: ${JSON.stringify(dependsOn)},` : '';

    // Get zone from AI discovery, or default to 'global'
    const zone = this.tagZoneAssignments.get(id) || 'global';

    const content = `import { defineTag } from '@yourtm/core'

export default defineTag({
  name: '${gtmTag.name}',
  triggers: ${JSON.stringify(triggers)},${dependsOnLine}
  zones: ['${zone}'],
  execute(ctx) {
    ${executeBody}
  }
})
`;

    await this.writeFile('tags', `${id}.ts`, content);
  }

  /**
   * Create a built-in GTM trigger
   */
  private async createBuiltinTrigger(triggerId: string): Promise<void> {
    const info = GTM_BUILTIN_TRIGGERS[triggerId];
    if (!info) return;

    const id = slugify(info.name);
    let type = 'defineTrigger';
    let imports = ['defineTrigger'];

    switch (info.type) {
      case 'PAGEVIEW':
        type = 'definePageviewTrigger';
        imports = ['definePageviewTrigger'];
        break;
      case 'CONSENT_INIT':
        type = 'defineConsentInitTrigger';
        imports = ['defineConsentInitTrigger'];
        break;
      case 'INIT':
        type = 'defineInitTrigger';
        imports = ['defineInitTrigger'];
        break;
    }

    const content = `import { ${imports.join(', ')} } from '@yourtm/core'

// GTM Built-in Trigger
export default ${type}({
  id: '${id}',
  name: '${info.name}',
})
`;

    await this.writeFile('triggers', `${id}.ts`, content);
  }

  private async writeFile(type: string, filename: string, content: string): Promise<void> {
    const baseDir = this.config?.[`${type}Dir` as keyof YourTMConfig] as string || join(this.cwd, `yourtm/${type}`);
    const fullPath = join(baseDir, filename);

    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }
}
