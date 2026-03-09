import ora from 'ora';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import { Compiler } from '../compiler/index.js';

interface AnalyzeOptions {
  apiKey?: string;
  provider?: 'anthropic' | 'openai';
  output?: string;
  verbose?: boolean;
  apply?: boolean;
  returnResult?: boolean;
}

interface TagAnalysis {
  id: string;
  name: string;
  size: number;
  zone: string;
  triggers: string[];
  platform?: string;
  pixelIds?: string[];
  code: string;
  file: string; // Actual file path relative to project root
}

interface AnalysisResult {
  consolidation: ConsolidationRecommendation[];
  zoneOptimization: ZoneRecommendation[];
  lazyLoading: LazyLoadingRecommendation;
  performance: PerformanceProjection;
  issues: Issue[];
}

interface ConsolidationRecommendation {
  platform: string;
  currentTags: string[];
  consolidatedCount: number;
  pixelIds: Record<string, string>;
  savings: { tags: number; bytes: number };
  consolidationApi: string;
}

interface ZoneRecommendation {
  tagId: string;
  currentZone: string;
  recommendedZone: string;
  reason: string;
  trigger: string;
}

interface LazyLoadingRecommendation {
  immediateTags: { tags: string[]; size: number };
  lazyTags: Array<{ trigger: string; tags: string[]; size: number }>;
  estimatedInitialLoad: number;
}

interface PerformanceProjection {
  projections: Array<{
    pageType: string;
    immediateSize: number;
    zoneSize: number;
    totalSize: number;
  }>;
  vsBaseline: {
    baseline: number;
    optimized: number;
    savings: number;
    percentReduction: number;
  };
}

interface Issue {
  type: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  tagId?: string;
  recommendation?: string;
}

const ANALYSIS_PROMPT = `You are a tag management optimization expert. Analyze this container and provide ACTIONABLE instructions.

## Response Requirements
- Be concise - no full code blocks, just file paths and property changes
- Every instruction must be executable
- IMPORTANT: Use the exact "file" property from each tag in the input data. Do NOT construct file paths yourself.

## Analysis Rules

### Zone Assignment (MOST IMPORTANT)
Map each tag to the correct zone based on its triggers:
- ga4-view-item → pdp
- ga4-view-item-list → plp
- ga4-begin-checkout, ga4-add-payment-info, ga4-add-shipping-info → checkout
- ga4-purchase → purchase
- ga4-view-search-results → search
- Tags with "homepage" in name → homepage
- Tags with "support" in trigger → support
- initialization, page-view, ga4-add-to-cart → global (no change needed)

### Consolidation Detection
Group tags by platform prefix (meta-, tiktok-, snapchat-, pinterest-, reddit-, bing-, tradedesk-, amazon-, dcm-).
If multiple tags exist for same event type (e.g., meta-shark-purchase and meta-ninja-purchase), they can be consolidated.

### Dependency Detection
Tags that call platform APIs need dependsOn their base pixel.
IMPORTANT: Use the exact tag ID from the input data for dependsOn values. IDs use single dashes (e.g., "horizon-meta-ninja-base-pixel"), NOT triple dashes.
- Tags calling fbq() → find the matching base pixel tag ID in the input and use it
- Tags calling ttq → find the matching tiktok base tag ID in the input and use it
- Tags calling snaptr → find the matching snapchat base tag ID in the input and use it

### Tags With Empty Triggers
Tags with triggers: [] were likely GTM "setup tags" (fire-before). These should either:
- Be given the same triggers as their parent tag if identifiable
- Be marked for manual review if the parent relationship is unclear
Do NOT recommend removing these without understanding the sequencing relationship.

### Consent Detection
All ad platform tags (meta, tiktok, snapchat, pinterest, reddit, bing, tradedesk, amazon, dcm, google-ads) need:
consent: ['marketing']

## Response Format (JSON only, no text):
{
  "zoneChanges": [
    {"file": "yourtm/tags/TAG_ID.ts", "from": "global", "to": "purchase"}
  ],
  "consolidation": [
    {"platform": "meta", "tags": ["tag1", "tag2"], "event": "purchase", "savesCount": 1}
  ],
  "dependencyFixes": [
    {"file": "yourtm/tags/TAG_ID.ts", "add": "dependsOn: ['meta-base-pixel']"}
  ],
  "consentFixes": [
    {"file": "yourtm/tags/TAG_ID.ts", "add": "consent: ['marketing']"}
  ],
  "triggerFixes": [
    {"file": "yourtm/tags/TAG_ID.ts", "issue": "unknown trigger", "fix": "create trigger or use alternative"}
  ],
  "performance": {
    "current": 175000,
    "optimized": 65000,
    "reduction": 63
  }
}

ONLY output valid JSON.`;

export async function analyzeCommand(options: AnalyzeOptions = {}): Promise<any> {
  const cwd = process.cwd();

  logger.header('YourTM AI Analysis');
  logger.newline();

  // Check for API key
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  const provider = options.provider || (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY ? 'openai' : 'anthropic');

  if (!apiKey) {
    logger.error('No API key provided.');
    logger.info('Provide an API key using one of these methods:');
    console.log(logger.chalk.gray('  --api-key <key>           Pass key as argument'));
    console.log(logger.chalk.gray('  ANTHROPIC_API_KEY=...     Set environment variable'));
    console.log(logger.chalk.gray('  OPENAI_API_KEY=...        Set environment variable'));
    logger.newline();
    process.exit(1);
  }

  logger.table([
    { label: 'Provider', value: provider === 'anthropic' ? 'Claude Opus 4.6' : 'GPT-5.4' },
    { label: 'API Key', value: `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` },
  ]);
  logger.newline();

  const spinner = ora('Loading project configuration...').start();

  try {
    // Load and compile the project
    const config = await loadConfig(cwd);
    const compiler = new Compiler(config);

    spinner.text = 'Compiling tags and triggers...';
    // Use skipBundles to get tags even if there are validation errors
    const compileResult = await compiler.compile({ skipBundles: true });

    // Show any warnings or errors from compilation
    if (compileResult.warnings.length > 0) {
      spinner.stop();
      logger.warn('Compilation warnings:');
      compileResult.warnings.forEach(w => console.log(logger.chalk.yellow(`  ${w}`)));
      logger.newline();
      spinner.start();
    }

    if (compileResult.errors.length > 0) {
      spinner.stop();
      logger.error('Compilation errors:');
      compileResult.errors.forEach(e => console.log(logger.chalk.red(`  ${e.file}: ${e.message}`)));
      logger.newline();
      spinner.start();
    }

    // Debug output
    if (options.verbose) {
      spinner.stop();
      logger.info(`Found ${compileResult.tags.length} tags, ${compileResult.triggers.length} triggers, ${compileResult.zones?.length || 0} zones`);
      logger.newline();
      spinner.start();
    }

    // Extract tag analysis data
    spinner.text = 'Extracting tag data for analysis...';
    const tags = compileResult.tags.map((tag: any) => ({
      id: tag.id,
      name: tag.name,
      size: estimateTagSize(tag),
      zone: tag.zone || 'global',
      triggers: tag.triggers || [],
      code: extractTagCode(tag),
      file: tag.sourcePath || `yourtm/tags/${tag.id}.ts`, // Use actual path if available
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

    // Build the analysis context
    const analysisContext = {
      summary: {
        totalTags: tags.length,
        totalTriggers: triggers.length,
        totalZones: zones.length,
        totalSize: tags.reduce((sum: number, t: TagAnalysis) => sum + t.size, 0),
      },
      tags,
      triggers,
      zones,
    };

    spinner.text = `Analyzing ${tags.length} tags with AI...`;

    // Build a compact version of the context - minimal data for analysis
    // Group tags by platform prefix for consolidation analysis
    const tagsByPlatform: Record<string, string[]> = {};
    tags.forEach((t: TagAnalysis) => {
      const prefix = t.id.split('-')[0] || 'other';
      if (!tagsByPlatform[prefix]) tagsByPlatform[prefix] = [];
      tagsByPlatform[prefix].push(t.id);
    });

    // Extract zone IDs for the AI to use
    const availableZones = zones.map((z: any) => z.id);

    const compactContext = {
      summary: analysisContext.summary,
      availableZones, // Tell AI which zones exist
      tagsByPlatform,
      // Only include essential tag metadata
      tags: tags.map((t: TagAnalysis) => ({
        id: t.id,
        name: t.name,
        file: t.file, // Actual file path for edits
        size: t.size,
        zone: t.zone,
        triggers: t.triggers,
      })),
      triggers: triggers.map((tr: any) => ({
        id: tr.id,
        name: tr.name,
        type: tr.type,
      })),
      zones: zones,
    };

    const contextJson = JSON.stringify(compactContext, null, 2);

    if (options.verbose) {
      spinner.stop();
      logger.info(`Sending ${(contextJson.length / 1024).toFixed(1)}KB to AI...`);
      spinner.start();
    }

    // Call AI API
    spinner.text = `Analyzing ${tags.length} tags with AI...`;
    const analysis = await callAI(
      provider,
      apiKey,
      ANALYSIS_PROMPT,
      contextJson
    );

    spinner.stop();

    // Parse and display results
    let result: AnalysisResult;
    try {
      if (!analysis || analysis.trim() === '') {
        throw new Error('Empty response from AI');
      }
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = analysis.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      result = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      logger.error(`Failed to parse AI response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      if (analysis && analysis.length > 0) {
        logger.info('Raw response (first 500 chars):');
        console.log(analysis.slice(0, 500));
      } else {
        logger.info('Response was empty');
      }
      process.exit(1);
    }

    displayResults(result, options.verbose);

    // Save to file if requested
    if (options.output) {
      const { writeFile } = await import('node:fs/promises');
      const outputPath = options.output.endsWith('.json') ? options.output : `${options.output}.json`;
      await writeFile(outputPath, JSON.stringify(result, null, 2));
      logger.success(`Plan saved to ${outputPath}`);
      logger.newline();
    }

    // Apply fixes if requested
    if (options.apply) {
      await applyFixes(cwd, result);
    }

    // Return result if requested (for use by init command)
    if (options.returnResult) {
      return result;
    }

  } catch (error) {
    spinner.fail('Analysis failed');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export async function applyFixes(cwd: string, result: any): Promise<void> {
  const { readFile, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');

  logger.header('Applying Fixes');
  logger.newline();

  let appliedCount = 0;
  let errorCount = 0;

  // Apply zone changes
  if (result.zoneChanges && result.zoneChanges.length > 0) {
    console.log(logger.chalk.cyan('Updating zones...'));

    for (const change of result.zoneChanges) {
      try {
        const filePath = join(cwd, change.file);
        let content = await readFile(filePath, 'utf-8');

        const fromZone = change.from || 'global';
        const toZone = change.to || change.newZone;

        // Replace zone assignment
        const zonePatterns = [
          new RegExp(`zones:\\s*\\[\\s*['"]${fromZone}['"]\\s*\\]`, 'g'),
          new RegExp(`zone:\\s*['"]${fromZone}['"]`, 'g'),
        ];

        let changed = false;
        for (const pattern of zonePatterns) {
          if (pattern.test(content)) {
            content = content.replace(pattern, `zones: ['${toZone}']`);
            changed = true;
            break;
          }
        }

        if (changed) {
          await writeFile(filePath, content);
          console.log(logger.chalk.green(`  ✓ ${change.file}: ${fromZone} → ${toZone}`));
          appliedCount++;
        } else {
          console.log(logger.chalk.yellow(`  ⚠ ${change.file}: Could not find zone to replace`));
        }
      } catch (error) {
        console.log(logger.chalk.red(`  ✗ ${change.file}: ${error instanceof Error ? error.message : 'Failed'}`));
        errorCount++;
      }
    }
    logger.newline();
  }

  // Apply dependency fixes
  if (result.dependencyFixes && result.dependencyFixes.length > 0) {
    console.log(logger.chalk.cyan('Adding dependencies...'));

    for (const fix of result.dependencyFixes) {
      try {
        const filePath = join(cwd, fix.file);
        let content = await readFile(filePath, 'utf-8');

        const addProp = fix.add || fix.addProperty;

        // Check if dependsOn already exists
        if (content.includes('dependsOn:')) {
          console.log(logger.chalk.yellow(`  ⚠ ${fix.file}: dependsOn already exists`));
          continue;
        }

        // Add dependsOn after triggers line
        const triggersMatch = content.match(/triggers:\s*\[[^\]]*\]/);
        if (triggersMatch) {
          const insertPoint = triggersMatch.index! + triggersMatch[0].length;
          content = content.slice(0, insertPoint) + ',\n  ' + addProp + content.slice(insertPoint);
          await writeFile(filePath, content);
          console.log(logger.chalk.green(`  ✓ ${fix.file}: Added ${addProp}`));
          appliedCount++;
        } else {
          console.log(logger.chalk.yellow(`  ⚠ ${fix.file}: Could not find insertion point`));
        }
      } catch (error) {
        console.log(logger.chalk.red(`  ✗ ${fix.file}: ${error instanceof Error ? error.message : 'Failed'}`));
        errorCount++;
      }
    }
    logger.newline();
  }

  // Apply consent fixes
  if (result.consentFixes && result.consentFixes.length > 0) {
    console.log(logger.chalk.cyan('Adding consent requirements...'));

    for (const fix of result.consentFixes) {
      try {
        const filePath = join(cwd, fix.file);
        let content = await readFile(filePath, 'utf-8');

        const addProp = fix.add || fix.addProperty;

        // Check if consent already exists
        if (content.includes('consent:')) {
          console.log(logger.chalk.yellow(`  ⚠ ${fix.file}: consent already exists`));
          continue;
        }

        // Add consent after zones line
        const zonesMatch = content.match(/zones:\s*\[[^\]]*\]/);
        if (zonesMatch) {
          const insertPoint = zonesMatch.index! + zonesMatch[0].length;
          content = content.slice(0, insertPoint) + ',\n  ' + addProp + content.slice(insertPoint);
          await writeFile(filePath, content);
          console.log(logger.chalk.green(`  ✓ ${fix.file}: Added ${addProp}`));
          appliedCount++;
        } else {
          console.log(logger.chalk.yellow(`  ⚠ ${fix.file}: Could not find insertion point`));
        }
      } catch (error) {
        console.log(logger.chalk.red(`  ✗ ${fix.file}: ${error instanceof Error ? error.message : 'Failed'}`));
        errorCount++;
      }
    }
    logger.newline();
  }

  // Summary
  logger.divider();
  if (appliedCount > 0) {
    console.log(logger.chalk.green.bold(`\n  Applied ${appliedCount} fixes successfully.`));
  }
  if (errorCount > 0) {
    console.log(logger.chalk.yellow(`  ${errorCount} fixes could not be applied automatically.`));
  }
  if (appliedCount === 0 && errorCount === 0) {
    console.log(logger.chalk.gray('\n  No fixes to apply.'));
  }

  logger.newline();
  console.log(logger.chalk.cyan('  Next: Run `ytm build` to verify the changes.'));
  logger.newline();
}

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
  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6-20260301',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Please analyze this tag container and provide optimization recommendations:\n\n${userContent}`,
          },
        ],
      }),
    });
  } catch (fetchError) {
    const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
    throw new Error(`Network error calling Anthropic: ${errorMessage}`);
  }

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
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Please analyze this tag container and provide optimization recommendations:\n\n${userContent}`,
          },
        ],
        max_completion_tokens: 16384,
        response_format: { type: 'json_object' },
      }),
    });
  } catch (fetchError) {
    const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
    throw new Error(`Network error calling OpenAI: ${errorMessage}`);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string }; finish_reason: string }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  // Check for truncation or other issues
  const choice = data.choices[0];
  if (choice?.finish_reason === 'length') {
    console.warn('Warning: Response was truncated due to length');
  }

  return choice?.message?.content || '';
}

function estimateTagSize(tag: any): number {
  // Estimate size from execute function if available
  const code = extractTagCode(tag);
  // Rough estimate: 1 char ≈ 1 byte, compressed ≈ 60%
  return Math.round(code.length * 0.6);
}

function extractTagCode(tag: any): string {
  const parts: string[] = [];
  if (tag.execute) {
    parts.push(typeof tag.execute === 'function' ? tag.execute.toString() : String(tag.execute));
  }
  if (tag.setup) {
    parts.push(typeof tag.setup === 'function' ? tag.setup.toString() : String(tag.setup));
  }
  return parts.join('\n');
}

function displayResults(result: any, _verbose?: boolean): void {
  logger.header('Optimization Plan');
  logger.newline();

  let stepNum = 1;

  // Zone Changes - exact edits
  if (result.zoneChanges && result.zoneChanges.length > 0) {
    console.log(logger.chalk.magenta.bold(`${stepNum}. ZONE ASSIGNMENTS`));
    console.log(logger.chalk.gray('   Edit the zones property in each file:\n'));
    stepNum++;

    // Group by target zone for clarity
    const byZone: Record<string, any[]> = {};
    result.zoneChanges.forEach((change: any) => {
      const zone = change.to || change.newZone;
      if (!byZone[zone]) byZone[zone] = [];
      byZone[zone].push(change);
    });

    Object.entries(byZone).forEach(([zone, changes]) => {
      console.log(logger.chalk.cyan.bold(`   → ${zone.toUpperCase()} zone (${changes.length} files):`));
      changes.forEach((change: any) => {
        console.log(logger.chalk.yellow(`     ${change.file}`));
        console.log(logger.chalk.white(`       zones: ['${change.from || 'global'}']  →  zones: ['${zone}']`));
      });
      console.log('');
    });
    logger.newline();
  }

  // Consolidation
  if (result.consolidation && result.consolidation.length > 0) {
    console.log(logger.chalk.magenta.bold(`${stepNum}. TAG CONSOLIDATION`));
    console.log(logger.chalk.gray('   These platform tags can be merged:\n'));
    stepNum++;

    result.consolidation.forEach((rec: any) => {
      console.log(logger.chalk.cyan.bold(`   ${rec.platform.toUpperCase()} - ${rec.event || 'multiple events'}`));
      console.log(logger.chalk.gray(`     Tags to merge: ${(rec.tags || []).join(', ')}`));
      if (rec.savesCount) {
        console.log(logger.chalk.green(`     Saves: ${rec.savesCount} tag(s)`));
      }
      console.log('');
    });
    logger.newline();
  }

  // Dependency Fixes
  if (result.dependencyFixes && result.dependencyFixes.length > 0) {
    console.log(logger.chalk.magenta.bold(`${stepNum}. ADD DEPENDENCIES`));
    console.log(logger.chalk.gray('   Add dependsOn to ensure base pixels load first:\n'));
    stepNum++;

    result.dependencyFixes.forEach((fix: any) => {
      console.log(logger.chalk.yellow(`   ${fix.file}`));
      console.log(logger.chalk.white(`     Add property: ${fix.add || fix.addProperty}`));
    });
    logger.newline();
  }

  // Consent Fixes
  if (result.consentFixes && result.consentFixes.length > 0) {
    console.log(logger.chalk.magenta.bold(`${stepNum}. ADD CONSENT`));
    console.log(logger.chalk.gray('   Add consent property for GDPR/CCPA compliance:\n'));
    stepNum++;

    result.consentFixes.forEach((fix: any) => {
      console.log(logger.chalk.yellow(`   ${fix.file}`));
      console.log(logger.chalk.white(`     Add property: ${fix.add || fix.addProperty}`));
    });
    logger.newline();
  }

  // Trigger Fixes
  if (result.triggerFixes && result.triggerFixes.length > 0) {
    console.log(logger.chalk.magenta.bold(`${stepNum}. FIX TRIGGERS`));
    console.log(logger.chalk.gray('   These tags reference missing triggers:\n'));
    stepNum++;

    result.triggerFixes.forEach((fix: any) => {
      console.log(logger.chalk.yellow(`   ${fix.file}`));
      console.log(logger.chalk.red(`     Issue: ${fix.issue}`));
      console.log(logger.chalk.green(`     Fix: ${fix.fix}`));
    });
    logger.newline();
  }

  // Performance Summary
  if (result.performance) {
    console.log(logger.chalk.magenta.bold('PERFORMANCE IMPACT'));
    logger.divider();

    const perf = result.performance;
    console.log(logger.chalk.cyan('\n   Estimated Results:'));
    if (perf.current) {
      console.log(logger.chalk.gray(`     Current size:   ${formatBytes(perf.current)}`));
    }
    if (perf.optimized) {
      console.log(logger.chalk.gray(`     After changes:  ${formatBytes(perf.optimized)}`));
    }
    if (perf.reduction) {
      console.log(logger.chalk.green.bold(`     Reduction:      ${perf.reduction}%`));
    }
    logger.newline();
  }

  // Execution Summary
  logger.divider();
  console.log(logger.chalk.green.bold('\nEXECUTION CHECKLIST'));

  const zoneChanges = result.zoneChanges?.length || 0;
  const consolidations = result.consolidation?.length || 0;
  const depFixes = result.dependencyFixes?.length || 0;
  const consentFixes = result.consentFixes?.length || 0;
  const triggerFixes = result.triggerFixes?.length || 0;

  console.log(logger.chalk.cyan('\nTo optimize this container, execute in order:\n'));

  let checkNum = 1;
  if (zoneChanges > 0) {
    console.log(logger.chalk.white(`  ${checkNum}. [ ] Update zones property in ${zoneChanges} tag files`));
    checkNum++;
  }
  if (consolidations > 0) {
    console.log(logger.chalk.white(`  ${checkNum}. [ ] Consolidate ${consolidations} platform tag group(s)`));
    checkNum++;
  }
  if (depFixes > 0) {
    console.log(logger.chalk.white(`  ${checkNum}. [ ] Add dependsOn to ${depFixes} tag files`));
    checkNum++;
  }
  if (consentFixes > 0) {
    console.log(logger.chalk.white(`  ${checkNum}. [ ] Add consent to ${consentFixes} tag files`));
    checkNum++;
  }
  if (triggerFixes > 0) {
    console.log(logger.chalk.white(`  ${checkNum}. [ ] Fix ${triggerFixes} trigger reference(s)`));
    checkNum++;
  }
  console.log(logger.chalk.white(`  ${checkNum}. [ ] Run ytm build to verify changes`));
  console.log(logger.chalk.white(`  ${checkNum + 1}. [ ] Run ytm deploy staging to test`));

  logger.newline();
  console.log(logger.chalk.gray('Run with --output plan.json to save for reference.'));
  logger.newline();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}
