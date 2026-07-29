#!/usr/bin/env node

import { Command } from 'commander';
import { logger } from './utils/logger.js';

// Import commands
import { setupCommand } from './commands/setup.js';
import { initCommand } from './commands/init.js';
import { buildCommand } from './commands/build.js';
import { auditCommand } from './commands/audit.js';
import { importCommand } from './commands/import.js';
import { devCommand } from './commands/dev.js';
import { testCommand, watchCommand, diffCommand } from './commands/test.js';
import { deployCommand, statusCommand, versionsCommand } from './commands/deploy.js';
import { deployInitCommand } from './commands/deploy-init.js';
// Rollback is now handled by deployCommand with --version flag
import { monitorCommand } from './commands/monitor.js';
import { createCommand } from './commands/create.js';
import { pushCommand, cloneCommand, pullCommand, logCommand, loginCommand } from './commands/source.js';
import { analyzeCommand } from './commands/analyze.js';
import { guiCommand } from './commands/gui.js';

const program = new Command();

program
  .name('ytm')
  .description('YourTM CLI - Modern tag management from the command line')
  .version('0.1.0');

// Setup command (first-time global configuration)
program
  .command('setup')
  .description('First-time setup wizard (Cloudflare credentials, defaults)')
  .option('--reconfigure', 'Reconfigure existing setup')
  .action(async (options) => {
    await setupCommand(options);
  });

// Init command
program
  .command('init')
  .description('Create a new YourTM project')
  .option('-f, --force', 'Overwrite existing configuration')
  .action(async (options) => {
    await initCommand(options);
  });

// Build command
program
  .command('build')
  .description('Build the container for production')
  .option('-c, --clean', 'Clean output directory before building')
  .option('--sourcemap', 'Generate source maps')
  .option('--no-minify', 'Disable minification')
  .option('-w, --watch', 'Watch for changes and rebuild')
  .action(async (options) => {
    await buildCommand(options);
  });

// Audit command
program
  .command('audit')
  .description('Perform system audit (redundancy, performance, best practices)')
  .option('--fix', 'Automatically fix issues where possible')
  .action(async (options) => {
    await auditCommand(options);
  });

// Analyze command (AI-powered)
program
  .command('analyze')
  .description('AI-powered analysis for tag consolidation, zone optimization, and performance')
  .option('--api-key <key>', 'API key for AI provider (or set ANTHROPIC_API_KEY/OPENAI_API_KEY)')
  .option('-p, --provider <provider>', 'AI provider: anthropic or openai', 'anthropic')
  .option('-o, --output <file>', 'Output analysis to file (json)')
  .option('-v, --verbose', 'Show detailed analysis information')
  .option('-a, --apply', 'Automatically apply recommended fixes')
  .action(async (options) => {
    await analyzeCommand(options);
  });

// Import command
program
  .command('import <source> <file>')
  .description('Import tags, triggers, and variables from another platform (e.g. gtm)')
  .option('-o, --output <dir>', 'Custom output directory')
  .option('-f, --force', 'Overwrite existing files')
  .option('--skip-zones', 'Skip AI zone discovery (use global zone for all tags)')
  .option('--api-key <key>', 'API key for AI zone discovery (or set ANTHROPIC_API_KEY/OPENAI_API_KEY)')
  .option('-p, --provider <provider>', 'AI provider for zone discovery: anthropic or openai', 'anthropic')
  .action(async (source, file, options) => {
    await importCommand(source, file, {
      output: options.output,
      force: options.force,
      skipZoneDiscovery: options.skipZones,
      apiKey: options.apiKey,
      provider: options.provider,
    });
  });

// Dev command
program
  .command('dev')
  .description('Start development server with hot reload')
  .option('-p, --port <port>', 'Port to listen on', '3456')
  .option('-h, --host <host>', 'Host to bind to', 'localhost')
  .option('-o, --open', 'Open browser automatically')
  .option('--preview', 'Enable preview mode (send telemetry to desktop app)')
  .option('--preview-endpoint <url>', 'Preview telemetry endpoint', 'http://localhost:3344/api/preview/telemetry')
  .action(async (options) => {
    await devCommand({
      ...options,
      port: parseInt(options.port, 10),
      preview: options.preview,
      previewEndpoint: options.previewEndpoint,
    });
  });

// Test command
program
  .command('test [url]')
  .description('Test tag firing on a URL')
  .option('-u, --url <url>', 'URL to test')
  .option('--urls <file>', 'File containing URLs for bulk testing')
  .option('-c, --container <id>', 'Container ID to test')
  .option('-o, --output <file>', 'Output report file (xlsx, json, html)')
  .option('-w, --watch', 'Watch mode for continuous testing')
  .option('--no-headless', 'Run browser in headed mode')
  .option('-t, --timeout <ms>', 'Timeout in milliseconds', '30000')
  .action(async (url, options) => {
    await testCommand(url, {
      ...options,
      timeout: parseInt(options.timeout, 10),
    });
  });

// Watch command (alias for test --watch)
program
  .command('watch [url]')
  .description('Watch a URL for tag firing in real-time')
  .option('-c, --container <id>', 'Container ID')
  .action(async (url, options) => {
    await watchCommand(url, { ...options, watch: true });
  });

// Diff command
program
  .command('diff')
  .description('Compare tag behavior between versions')
  .option('-b, --baseline <file>', 'Baseline results file')
  .option('--current <file>', 'Current results file')
  .action(async (options) => {
    await diffCommand(options);
  });

// Deploy command with subcommands
const deploy = program
  .command('deploy [environment]')
  .description('Deploy a pushed version to an environment')
  .option('--ver <version>', 'Specific version to deploy (default: latest pushed)')
  .option('-d, --dry-run', 'Simulate deployment without making changes')
  .option('-f, --force', 'Force deployment (skip checks and confirmations)')
  .action(async (environment, options) => {
    await deployCommand({ ...options, version: options.ver, env: environment || 'staging' });
  });

// Deploy init subcommand - Cloudflare infrastructure setup
deploy
  .command('init')
  .description('Set up Cloudflare infrastructure (R2 bucket, optional Worker)')
  .option('-y, --yes', 'Skip confirmation prompts (use defaults)')
  .option('--account-id <id>', 'Cloudflare Account ID')
  .option('--api-token <token>', 'Cloudflare API Token')
  .option('--worker-name <name>', 'Custom worker name')
  .option('--env <environment>', 'Environment to set up (staging, production, both)', 'production')
  .option('--skip-worker', 'Skip deploying the Cloudflare Worker')
  .option('--save-credentials', 'Save credentials to ~/.yourtm/credentials.json')
  .option('--r2-bucket <name>', 'Custom R2 bucket name')
  .option('--r2-domain <domain>', 'Custom domain for R2 bucket (e.g., cdn.yourdomain.com)')
  .option('--legacy-kv', 'Use legacy KV-only mode (not recommended)')
  .action(async (options) => {
    await deployInitCommand({
      yes: options.yes,
      accountId: options.accountId,
      apiToken: options.apiToken,
      workerName: options.workerName,
      environment: options.env,
      skipWorker: options.skipWorker,
      saveCredentials: options.saveCredentials,
      r2BucketName: options.r2Bucket,
      r2CustomDomain: options.r2Domain,
      legacyKvMode: options.legacyKv,
    });
  });

// Deploy versions subcommand
deploy
  .command('versions')
  .description('List deployed versions')
  .option('-e, --env <environment>', 'Environment (staging, production)', 'staging')
  .option('-l, --limit <count>', 'Number of versions to show', '10')
  .action(async (options) => {
    await versionsCommand({
      env: options.env,
      limit: parseInt(options.limit, 10),
    });
  });

// Rollback command (alias for deploy --version)
program
  .command('rollback <version> [environment]')
  .description('Rollback to a previous version (alias for deploy --version)')
  .option('-f, --force', 'Force rollback without confirmation')
  .action(async (version, environment, options) => {
    // Rollback is just deploying a specific version
    await deployCommand({
      version,
      env: environment || 'staging',
      force: options.force,
    });
  });

// Status command
program
  .command('status')
  .description('Show deployment status')
  .action(async () => {
    await statusCommand();
  });

// Monitor command
program
  .command('monitor')
  .description('Real-time tag performance monitoring')
  .option('-c, --container <id>', 'Container ID')
  .option('-m, --mode <mode>', 'Monitor mode: preview or live', 'preview')
  .option('-f, --filter <tag>', 'Filter by tag name')
  .action(async (options) => {
    await monitorCommand(options);
  });

// Create command
const create = program
  .command('create [type]')
  .description('Create tags, triggers, zones, or variables from templates')
  .option('-p, --platform <platform>', 'Pre-select platform (skip platform selection)')
  .option('-n, --name <name>', 'Set the name')
  .option('-o, --output <path>', 'Custom output path')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (type, options) => {
    await createCommand(type, options);
  });

// Create subcommands for convenience
create
  .command('tag')
  .description('Create a new tag from template')
  .option('-p, --platform <platform>', 'Pre-select platform')
  .option('-n, --name <name>', 'Set the tag name')
  .option('-o, --output <path>', 'Custom output path')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (options) => {
    await createCommand('tag', options);
  });

create
  .command('trigger')
  .description('Create a new trigger')
  .option('-n, --name <name>', 'Set the trigger name')
  .option('-o, --output <path>', 'Custom output path')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (options) => {
    await createCommand('trigger', options);
  });

create
  .command('zone')
  .description('Create a new zone')
  .option('-n, --name <name>', 'Set the zone name')
  .option('-o, --output <path>', 'Custom output path')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (options) => {
    await createCommand('zone', options);
  });

create
  .command('variable')
  .description('Create a new variable')
  .option('-n, --name <name>', 'Set the variable name')
  .option('-o, --output <path>', 'Custom output path')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (options) => {
    await createCommand('variable', options);
  });

// ============================================================================
// Source Control Commands (git-like version control)
// ============================================================================

// Push command - upload local source to remote
program
  .command('push')
  .description('Push local changes to YourTM remote')
  .option('-m, --message <message>', 'Version message')
  .option('-f, --force', 'Force push (overwrite remote)')
  .action(async (options) => {
    await pushCommand(options);
  });

// Clone command - download container source
program
  .command('clone <container-id>')
  .description('Clone a container from YourTM remote')
  .option('-b, --branch <branch>', 'Branch to clone', 'main')
  .option('-v, --version <version>', 'Specific version to clone')
  .action(async (containerId, options) => {
    await cloneCommand(containerId, options);
  });

// Pull command - sync latest from remote
program
  .command('pull')
  .description('Pull latest changes from YourTM remote')
  .action(async () => {
    await pullCommand();
  });

// Log command - show version history
program
  .command('log')
  .description('Show version history')
  .option('-n, --limit <count>', 'Number of versions to show', '10')
  .action(async (options) => {
    await logCommand({ limit: parseInt(options.limit, 10) });
  });

// Login command - authenticate with token
program
  .command('login [token]')
  .description('Authenticate with a YourTM access token')
  .action(async (token) => {
    await loginCommand(token);
  });

// GUI command
program
  .command('gui')
  .description('Launch the desktop GUI')
  .option('-p, --port <port>', 'Port for the dev server', '3344')
  .option('--no-browser', 'Start dev server only (open in browser instead of Electron)')
  .action(async (options) => {
    await guiCommand({
      port: parseInt(options.port, 10),
      noBrowser: options.browser === false,
    });
  });

// Error handling
program.on('command:*', () => {
  logger.error(`Invalid command: ${program.args.join(' ')}`);
  logger.info('Run "ytm --help" for available commands');
  process.exit(1);
});

// Parse arguments
program.parseAsync(process.argv).catch((error) => {
  logger.error(error.message);
  process.exit(1);
});
