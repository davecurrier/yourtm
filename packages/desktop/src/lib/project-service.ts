import { Project, SyntaxKind, ObjectLiteralExpression } from 'ts-morph';
import { Compiler, loadConfig, allTagTemplates, buildCommand } from '@yourtm/cli';
import path from 'path';

// Analysis types matching CLI output
export interface AnalysisResult {
  zoneChanges?: Array<{ file: string; from: string; to: string }>;
  consolidation?: Array<{ platform: string; tags: string[]; event?: string; savesCount?: number }>;
  dependencyFixes?: Array<{ file: string; add: string }>;
  consentFixes?: Array<{ file: string; add: string }>;
  triggerFixes?: Array<{ file: string; issue: string; fix: string }>;
  performance?: { current: number; optimized: number; reduction: number };
}

/**
 * The ProjectService is the "Source of Truth" for the Desktop app.
 */
export class ProjectService {
  private compiler: Compiler | null = null;
  private project: Project;
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.project = new Project();
    // Index all TypeScript files in the yourtm directory
    const pattern = `${projectPath}/yourtm/**/*.ts`;
    console.log('[ProjectService] Loading source files from:', pattern);
    const files = this.project.addSourceFilesAtPaths(pattern);
    console.log('[ProjectService] Loaded', files.length, 'source files');
  }

  /**
   * Find the matching template for a tag based on its platform or vendor
   */
  getTemplateForTag(tag: any) {
    const all = allTagTemplates as any[];
    return all.find(t => 
      (t.id === tag.vendor) || 
      (t.id === tag.platform) ||
      (tag.platform && t.id.includes(tag.platform)) ||
      (t.name.toLowerCase().includes(tag.name.toLowerCase()))
    );
  }
/**
 * Initialize the compiler using the project's yourtm.config.ts
 */
async init() {
  try {
    console.log('[ProjectService] Initializing project at:', this.projectPath);
    const config = await loadConfig(this.projectPath);
    if (!config) throw new Error('Could not load yourtm.config.ts');

    this.compiler = new Compiler(config);
    console.log('[ProjectService] Compiler created for container:', config.containerId);

    const refreshResult = await this.refresh();
    console.log('[ProjectService] Initialization complete, found', refreshResult.tags.length, 'tags');
    return refreshResult;
  } catch (error) {
    console.error('[ProjectService] Failed to initialize:', error);
    throw error;
  }
}

/**
 * Re-scan the project to get the latest Tags, Triggers, and Zones
 */
  async refresh() {
    if (!this.compiler) {
      console.error('[ProjectService] Refresh called before initialization');
      throw new Error('Service not initialized');
    }

    // Use the existing CLI compiler logic to "Understand" the project
    const result = await this.compiler.compile({ skipBundles: true });

    return {
      tags: result.tags,
      triggers: result.triggers,
      zones: result.zones,
      variables: result.variables,
      errors: result.errors,
      warnings: result.warnings,
    };
  }

  /**
   * Get the source code of any asset (tag, trigger, variable, zone)
   */
  async getAssetSource(type: 'tags' | 'triggers' | 'variables' | 'zones', id: string) {
    const data = await this.refresh();
    const assets = (data as any)[type] || [];
    const asset = assets.find((a: any) => a.id === id || a.name === id);
    
    if (asset && asset.sourcePath) {
      const fullPath = path.resolve(this.projectPath, asset.sourcePath);
      const sourceFile = this.project.getSourceFile(asset.sourcePath) || 
                         this.project.getSourceFile(fullPath);
      
      if (sourceFile) return sourceFile.getText();
    }

    // Fallback: search content by both id and name patterns
    const files = this.project.getSourceFiles();
    for (const file of files) {
      const text = file.getText();
      // Check for id: 'value' or name: 'value' patterns
      if (text.includes(`id: '${id}'`) ||
          text.includes(`id: "${id}"`) ||
          text.includes(`name: '${id}'`) ||
          text.includes(`name: "${id}"`)) {
        return text;
      }
    }
    return null;
  }

  /**
   * Update properties of any asset using AST
   */
  async updateAssetProperties(type: string, id: string, updates: Record<string, any>) {
    const data = await this.refresh();
    const assets = (data as any)[type] || [];
    const asset = assets.find((a: any) => a.id === id || a.name === id);
    if (!asset || !asset.sourcePath) return false;

    const fullPath = path.resolve(this.projectPath, asset.sourcePath);
    const sourceFile = this.project.getSourceFile(asset.sourcePath) || 
                       this.project.getSourceFile(fullPath);

    if (!sourceFile) return false;

    // Detect the definition function name
    const defineFn = type === 'tags' ? 'defineTag' : 
                     type === 'triggers' ? 'defineTrigger' : 
                     type === 'variables' ? 'defineVariable' : 'defineZone';

    const callExpression = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
      .find(c => c.getExpression().getText() === defineFn);

    if (!callExpression) return false;

    const arg = callExpression.getArguments()[0] as ObjectLiteralExpression;
    
    // Standard properties for each type that stay at top level
    const standardPropsMap: Record<string, string[]> = {
      tags: ['name', 'description', 'triggers', 'blocking', 'zones', 'consent', 'priority', 'status', 'vendor', 'code'],
      triggers: ['name', 'description', 'type', 'priority', 'enabled', 'event', 'selector'],
      zones: ['name', 'description', 'patterns', 'priority', 'enabled'],
      variables: ['name', 'description', 'type', 'default', 'format', 'value', 'key', 'code']
    };

    const standards = standardPropsMap[type] || [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id') continue; // Don't allow ID updates via AST for now

      let targetObj = arg;
      
      // Handle 'config' or 'settings' nesting
      const needsNesting = !standards.includes(key);
      if (needsNesting) {
        const nestKey = type === 'triggers' ? 'config' : 'settings';
        let nestProp = arg.getProperty(nestKey);
        if (!nestProp) {
          arg.addPropertyAssignment({ name: nestKey, initializer: '{}' });
          nestProp = arg.getProperty(nestKey);
        }
        const nestObj = nestProp?.asKind(SyntaxKind.PropertyAssignment)?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
        if (nestObj) targetObj = nestObj;
      }

      const prop = targetObj.getProperty(key);
      // Serialize to a VALID TS initializer: multiline strings become escaped
      // template literals; single-line strings use JSON (double-quoted) form.
      const formattedValue =
        typeof value === 'string'
          ? value.includes('\n')
            ? '`' + value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`'
            : JSON.stringify(value)
          : JSON.stringify(value);

      if (prop) {
        prop.set({ initializer: formattedValue });
      } else {
        targetObj.addPropertyAssignment({ name: key, initializer: formattedValue });
      }
    }

    sourceFile.formatText();
    await sourceFile.save();
    return true;
  }

  /**
   * Run AI analysis on the project
   */
  async runAnalysis(apiKey: string, provider: 'anthropic' | 'openai' = 'anthropic'): Promise<AnalysisResult> {
    if (!this.compiler) {
      throw new Error('Service not initialized');
    }

    const compileResult = await this.compiler.compile({ skipBundles: true });

    // Extract tag data
    const tags = compileResult.tags.map((tag: any) => ({
      id: tag.id,
      name: tag.name,
      file: tag.sourcePath || `yourtm/tags/${tag.id}.ts`,
      size: this.estimateTagSize(tag),
      zone: tag.zone || 'global',
      triggers: tag.triggers || [],
    }));

    const triggers = compileResult.triggers.map((trigger: any) => ({
      id: trigger.id,
      name: trigger.name,
      type: trigger.type,
    }));

    const zones = compileResult.zones?.map((zone: any) => ({
      id: zone.id,
      name: zone.name,
      patterns: zone.patterns,
    })) || [];

    // Group tags by platform
    const tagsByPlatform: Record<string, string[]> = {};
    tags.forEach((t: any) => {
      const prefix = t.id.split('-')[0] || 'other';
      if (!tagsByPlatform[prefix]) tagsByPlatform[prefix] = [];
      tagsByPlatform[prefix].push(t.id);
    });

    const context = {
      summary: {
        totalTags: tags.length,
        totalTriggers: triggers.length,
        totalZones: zones.length,
        totalSize: tags.reduce((sum: number, t: any) => sum + t.size, 0),
      },
      availableZones: zones.map((z: any) => z.id),
      tagsByPlatform,
      tags,
      triggers,
      zones,
    };

    // Call AI API
    const result = await this.callAI(provider, apiKey, context);
    return result;
  }

  private estimateTagSize(tag: any): number {
    const code = this.extractTagCode(tag);
    return Math.round(code.length * 0.6);
  }

  private extractTagCode(tag: any): string {
    const parts: string[] = [];
    if (tag.execute) {
      parts.push(typeof tag.execute === 'function' ? tag.execute.toString() : String(tag.execute));
    }
    if (tag.setup) {
      parts.push(typeof tag.setup === 'function' ? tag.setup.toString() : String(tag.setup));
    }
    return parts.join('\n');
  }

  private async callAI(provider: 'anthropic' | 'openai', apiKey: string, context: any): Promise<AnalysisResult> {
    const systemPrompt = `You are a tag management optimization expert. Analyze this container and provide ACTIONABLE instructions.

## Response Requirements
- Be concise - no full code blocks, just file paths and property changes
- Every instruction must be executable
- IMPORTANT: Use the exact "file" property from each tag in the input data.

## Analysis Rules

### Zone Assignment
Map each tag to the correct zone based on its triggers:
- ga4-view-item → pdp
- ga4-view-item-list → plp
- ga4-begin-checkout, ga4-add-payment-info → checkout
- ga4-purchase → purchase
- Tags with "homepage" in name → homepage
- initialization, page-view, ga4-add-to-cart → global

### Consolidation Detection
Group tags by platform prefix (meta-, tiktok-, snapchat-, pinterest-, etc.).
If multiple tags exist for same event type, they can be consolidated.

### Consent Detection
All ad platform tags need: consent: ['marketing']

## Response Format (JSON only):
{
  "zoneChanges": [{"file": "yourtm/tags/TAG_ID.ts", "from": "global", "to": "purchase"}],
  "consolidation": [{"platform": "meta", "tags": ["tag1", "tag2"], "event": "purchase", "savesCount": 1}],
  "dependencyFixes": [{"file": "yourtm/tags/TAG_ID.ts", "add": "dependsOn: ['meta-base-pixel']"}],
  "consentFixes": [{"file": "yourtm/tags/TAG_ID.ts", "add": "consent: ['marketing']"}],
  "triggerFixes": [{"file": "yourtm/tags/TAG_ID.ts", "issue": "unknown trigger", "fix": "create trigger"}],
  "performance": {"current": 175000, "optimized": 65000, "reduction": 63}
}

ONLY output valid JSON.`;

    const userContent = JSON.stringify(context, null, 2);

    const response = await (provider === 'anthropic'
      ? this.callAnthropic(apiKey, systemPrompt, userContent)
      : this.callOpenAI(apiKey, systemPrompt, userContent));

    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }
    return JSON.parse(jsonMatch[0]);
  }

  private async callAnthropic(apiKey: string, systemPrompt: string, userContent: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Analyze this tag container:\n\n${userContent}`,
        }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { content: Array<{ type: string; text: string }> };
    return data.content.find((c) => c.type === 'text')?.text || '';
  }

  private async callOpenAI(apiKey: string, systemPrompt: string, userContent: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze this tag container:\n\n${userContent}` },
        ],
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

  /**
   * Build the container
   */
  async build(): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      // Change to project directory for build
      const originalCwd = process.cwd();
      process.chdir(this.projectPath);

      await buildCommand({ clean: false, sourcemap: false, watch: false });

      process.chdir(originalCwd);
      return { success: true, output: 'Build completed successfully' };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}
