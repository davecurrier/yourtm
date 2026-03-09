/**
 * YourTM Init Command
 *
 * Simplified flow:
 * 1. Initialize in CURRENT directory
 * 2. Ask: "Start fresh" or "Import existing"
 * 3. If Import → scan for JSON files → select → import → AI analysis
 * 4. AI can programmatically apply fixes
 */

import prompts from 'prompts';
import chalk from 'chalk';
import { writeFileSync, mkdirSync, existsSync, readdirSync, appendFileSync } from 'fs';
import { join, basename } from 'path';
import { importCommand } from './import.js';
import { analyzeCommand, applyFixes } from './analyze.js';

// Colors
const gradient = {
  purple: chalk.hex('#a855f7'),
  pink: chalk.hex('#ec4899'),
  cyan: chalk.hex('#06b6d4'),
  green: chalk.hex('#10b981'),
  yellow: chalk.hex('#f59e0b'),
  dim: chalk.hex('#71717a'),
  white: chalk.hex('#fafafa'),
};

const icons = {
  success: gradient.green('✓'),
  error: chalk.red('✗'),
  warning: gradient.yellow('⚠'),
  info: gradient.cyan('ℹ'),
  sparkle: gradient.pink('✨'),
};

const logoText = chalk.bold(
  chalk.hex('#a855f7')('Your') + chalk.hex('#ec4899')('TM')
) + '  ' + gradient.white.bold('Initialize');

interface InitOptions {
  force?: boolean;
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  console.clear();
  console.log('\n  ' + logoText + '\n');

  const cwd = process.cwd();
  const folderName = basename(cwd);

  // Check if already initialized
  if (existsSync(join(cwd, 'yourtm.config.ts')) && !options.force) {
    console.log(`  ${icons.warning} This directory already has a ${gradient.cyan('yourtm.config.ts')}`);
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: 'Reinitialize?',
      initial: false,
    });
    if (!overwrite) {
      console.log(gradient.dim('\n  Cancelled.\n'));
      return;
    }
  }

  console.log(`  ${gradient.dim('Directory:')} ${gradient.cyan(cwd)}\n`);

  // Step 1: Start fresh or import?
  const { initType } = await prompts({
    type: 'select',
    name: 'initType',
    message: 'How would you like to start?',
    choices: [
      { title: 'Import from GTM', value: 'import', description: 'Convert an existing GTM container' },
      { title: 'Start fresh', value: 'fresh', description: 'Create empty project structure' },
    ],
  }, {
    onCancel: () => {
      console.log(gradient.dim('\n  Cancelled.\n'));
      process.exit(0);
    },
  });

  if (initType === 'import') {
    await handleImport(cwd, folderName);
  } else {
    await handleFresh(cwd, folderName);
  }
}

async function handleImport(cwd: string, folderName: string): Promise<void> {
  // Scan for JSON files
  const jsonFiles = findJsonFiles(cwd);

  if (jsonFiles.length === 0) {
    console.log(`\n  ${icons.warning} No JSON files found in this directory.`);
    console.log(gradient.dim('  Export your GTM container and place the JSON file here.\n'));
    return;
  }

  // Let user select which file
  const { selectedFile } = await prompts({
    type: 'select',
    name: 'selectedFile',
    message: 'Select the GTM export file:',
    choices: jsonFiles.map(f => ({
      title: f,
      value: f,
      description: formatFileSize(join(cwd, f)),
    })),
  }, {
    onCancel: () => {
      console.log(gradient.dim('\n  Cancelled.\n'));
      process.exit(0);
    },
  });

  // Ask about AI-powered zone discovery BEFORE import
  let apiKey: string | undefined;
  let provider: 'anthropic' | 'openai' | undefined;

  // Check for existing API keys in environment
  const existingKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;

  if (existingKey) {
    provider = process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai';
    apiKey = existingKey;
    console.log(`\n  ${icons.info} Found ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key in environment.`);
  } else {
    console.log(`\n  ${icons.info} AI-powered zone discovery can automatically map tags to URL zones.`);

    const { useZoneDiscovery } = await prompts({
      type: 'confirm',
      name: 'useZoneDiscovery',
      message: 'Enable AI zone discovery? (requires API key)',
      initial: true,
    });

    if (useZoneDiscovery) {
      const providerResponse = await prompts({
        type: 'select',
        name: 'provider',
        message: 'Which AI provider?',
        choices: [
          { title: 'Anthropic (Claude Opus 4.6)', value: 'anthropic' },
          { title: 'OpenAI (GPT-5.4)', value: 'openai' },
        ],
      });

      if (providerResponse.provider) {
        provider = providerResponse.provider as 'anthropic' | 'openai';

        const keyResponse = await prompts({
          type: 'password',
          name: 'apiKey',
          message: `Enter your ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key:`,
        });

        if (keyResponse.apiKey) {
          apiKey = keyResponse.apiKey;

          // Offer to save to .env
          const envPath = join(cwd, '.env');
          const saveResponse = await prompts({
            type: 'confirm',
            name: 'saveKey',
            message: 'Save API key to .env for future use?',
            initial: true,
          });

          if (saveResponse.saveKey) {
            const envVar = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
            // Create .env if needed, will be overwritten by createProjectStructure but that's ok
            appendFileSync(envPath, `${envVar}=${apiKey}\n`);
            console.log(`  ${icons.success} Saved to ${gradient.cyan('.env')}`);
          }
        }
      }
    }
  }

  // Create project structure first
  console.log('\n  ' + gradient.white.bold('Setting up project...\n'));
  await createProjectStructure(cwd, folderName);

  // Run import with zone discovery options
  console.log('\n  ' + gradient.white.bold('Importing GTM container...\n'));
  await importCommand('gtm', join(cwd, selectedFile), {
    output: join(cwd, 'yourtm'),
    force: true,
    apiKey,
    provider,
    skipZoneDiscovery: !apiKey,
  });

  // Offer additional AI analysis for optimizations (consolidation, dependencies, consent)
  if (apiKey) {
    console.log('\n');
    const { runAnalysis } = await prompts({
      type: 'confirm',
      name: 'runAnalysis',
      message: 'Run additional AI analysis for tag optimization? (consolidation, dependencies, consent)',
      initial: true,
    });

    if (runAnalysis) {
      await handleAIAnalysis(cwd, apiKey, provider);
    } else {
      showNextSteps(cwd);
    }
  } else {
    // No API key - offer to set one up for analysis
    console.log('\n');
    const { runAnalysis } = await prompts({
      type: 'confirm',
      name: 'runAnalysis',
      message: 'Run AI analysis to optimize the imported tags?',
      initial: true,
    });

    if (runAnalysis) {
      await handleAIAnalysis(cwd);
    } else {
      showNextSteps(cwd);
    }
  }
}

async function handleAIAnalysis(cwd: string, existingApiKey?: string, existingProvider?: 'anthropic' | 'openai'): Promise<void> {
  const envPath = join(cwd, '.env');

  let apiKey = existingApiKey;
  let provider = existingProvider;

  // If no API key provided, ask for one
  if (!apiKey) {
    console.log(`\n  ${icons.info} AI analysis requires an API key.\n`);

    // Ask for provider
    const providerResponse = await prompts({
      type: 'select',
      name: 'provider',
      message: 'Which AI provider?',
      choices: [
        { title: 'Anthropic (Claude)', value: 'anthropic' },
        { title: 'OpenAI (GPT-4o)', value: 'openai' },
      ],
    }, {
      onCancel: () => {
        console.log(gradient.dim('\n  Skipping AI analysis.\n'));
      },
    });

    if (!providerResponse.provider) {
      showNextSteps(cwd);
      return;
    }

    provider = providerResponse.provider as 'openai' | 'anthropic';

    // Ask for key
    const keyResponse = await prompts({
      type: 'password',
      name: 'apiKey',
      message: `Enter your ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key:`,
    }, {
      onCancel: () => {
        console.log(gradient.dim('\n  Skipping AI analysis.\n'));
      },
    });

    if (!keyResponse.apiKey) {
      showNextSteps(cwd);
      return;
    }

    apiKey = keyResponse.apiKey;

    // Save to .env
    const saveResponse = await prompts({
      type: 'confirm',
      name: 'saveKey',
      message: 'Save API key to .env for future use?',
      initial: true,
    });

    if (saveResponse.saveKey) {
      const envVar = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
      appendFileSync(envPath, `${envVar}=${apiKey}\n`);
      console.log(`  ${icons.success} Saved to ${gradient.cyan('.env')}`);
    }
  }

  // Run analysis and get the result back
  console.log('\n  ' + gradient.white.bold('Running AI analysis...\n'));

  let analysisResult: any = null;
  try {
    analysisResult = await analyzeCommand({ apiKey, provider, verbose: false, returnResult: true });
  } catch (error) {
    console.log(`  ${icons.error} Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    showNextSteps(cwd);
    return;
  }

  // Ask about applying fixes (only if we have results)
  if (analysisResult) {
    const applyResponse = await prompts({
      type: 'confirm',
      name: 'applyFixes',
      message: 'Apply the recommended fixes automatically?',
      initial: true,
    });

    if (applyResponse.applyFixes) {
      console.log(`\n  ${icons.info} Applying fixes...\n`);
      await applyFixes(cwd, analysisResult);
    }
  }

  showNextSteps(cwd);
}

async function handleFresh(cwd: string, folderName: string): Promise<void> {
  console.log('\n  ' + gradient.white.bold('Creating project...\n'));
  await createProjectStructure(cwd, folderName);
  showNextSteps(cwd);
}

async function createProjectStructure(cwd: string, folderName: string): Promise<void> {
  // Generate container ID from folder name
  const containerId = `YTM-${folderName.toUpperCase().slice(0, 6).replace(/[^A-Z0-9]/g, '')}`;

  // Create directories
  const dirs = [
    join(cwd, 'yourtm'),
    join(cwd, 'yourtm', 'tags'),
    join(cwd, 'yourtm', 'triggers'),
    join(cwd, 'yourtm', 'zones'),
    join(cwd, 'yourtm', 'variables'),
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
  console.log(`  ${icons.success} Created directories`);

  // Create config file
  const configContent = `import { defineConfig } from '@yourtm/core'

export default defineConfig({
  containerId: '${containerId}',
  name: '${folderName}',

  build: {
    outDir: 'dist/ytm',
    minify: true,
    sourcemap: false,
  },

  performance: {
    maxBundleSize: 100_000,
    maxTagSize: 10_000,
    slowTagThreshold: 100,
  },

  consent: {
    enabled: true,
    categories: ['necessary', 'analytics', 'marketing', 'preferences'],
  },
})
`;
  writeFileSync(join(cwd, 'yourtm.config.ts'), configContent);
  console.log(`  ${icons.success} Created ${gradient.cyan('yourtm.config.ts')}`);

  // Create package.json if it doesn't exist
  if (!existsSync(join(cwd, 'package.json'))) {
    const packageJson = {
      name: folderName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: {
        build: 'ytm build',
        dev: 'ytm dev',
        analyze: 'ytm analyze',
        deploy: 'ytm deploy',
      },
      dependencies: {
        '@yourtm/core': '^0.1.0',
      },
    };
    writeFileSync(join(cwd, 'package.json'), JSON.stringify(packageJson, null, 2));
    console.log(`  ${icons.success} Created ${gradient.cyan('package.json')}`);
  }

  // Create .gitignore
  if (!existsSync(join(cwd, '.gitignore'))) {
    const gitignoreContent = `# YourTM
dist/
node_modules/
.yourtm-cache/

# Environment
.env
.env.local
`;
    writeFileSync(join(cwd, '.gitignore'), gitignoreContent);
    console.log(`  ${icons.success} Created ${gradient.cyan('.gitignore')}`);
  }

  // Create .env template
  if (!existsSync(join(cwd, '.env'))) {
    const envContent = `# YourTM Configuration
# Uncomment and fill in your API key for AI analysis

# ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
`;
    writeFileSync(join(cwd, '.env'), envContent);
    console.log(`  ${icons.success} Created ${gradient.cyan('.env')}`);
  }

  // Create default global zone
  const globalZone = `import { defineZone } from '@yourtm/core'

export default defineZone({
  id: 'global',
  name: 'Global',
  patterns: ['**'],
  priority: 0,
})
`;
  writeFileSync(join(cwd, 'yourtm', 'zones', 'global.ts'), globalZone);
  console.log(`  ${icons.success} Created ${gradient.cyan('yourtm/zones/global.ts')}`);

  // Create page-view trigger
  const pageViewTrigger = `import { defineTrigger } from '@yourtm/core'

export default defineTrigger({
  id: 'page-view',
  name: 'Page View',
  type: 'pageview',
})
`;
  writeFileSync(join(cwd, 'yourtm', 'triggers', 'page-view.ts'), pageViewTrigger);
  console.log(`  ${icons.success} Created ${gradient.cyan('yourtm/triggers/page-view.ts')}`);
}

function findJsonFiles(dir: string): string[] {
  try {
    const files = readdirSync(dir);
    return files.filter(f => f.endsWith('.json') && !f.startsWith('.'));
  } catch {
    return [];
  }
}

function formatFileSize(filePath: string): string {
  try {
    const stats = require('fs').statSync(filePath);
    const kb = stats.size / 1024;
    if (kb > 1024) {
      return `${(kb / 1024).toFixed(1)} MB`;
    }
    return `${kb.toFixed(1)} KB`;
  } catch {
    return '';
  }
}

function showNextSteps(_cwd: string): void {
  console.log('\n');
  console.log(`  ${icons.sparkle} ${gradient.white.bold('Project ready!')}\n`);
  console.log(`  ${gradient.dim('Next steps:')}\n`);
  console.log(`    ${gradient.cyan('ytm build')}       Build the container`);
  console.log(`    ${gradient.cyan('ytm dev')}         Start dev server`);
  console.log(`    ${gradient.cyan('ytm analyze')}     Run AI analysis`);
  console.log(`    ${gradient.cyan('ytm deploy')}      Deploy to production`);
  console.log('');
}

// For backward compatibility with quickSetupCheck
export async function quickSetupCheck(): Promise<boolean> {
  return true;
}
