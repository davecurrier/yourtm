#!/usr/bin/env node

import { Command } from 'commander';
import { logger } from './utils/logger.js';

// Import commands
import { setupCommand } from './commands/setup.js';
import { initCommand } from './commands/init.js';
import { buildCommand } from './commands/build.js';
import { checkCommand } from './commands/check.js';
import { devCommand } from './commands/dev.js';
import { testCommand, watchCommand, diffCommand } from './commands/test.js';
import { deployCommand, statusCommand, versionsCommand } from './commands/deploy.js';
import { deployInitCommand } from './commands/deploy-init.js';
import { rollbackCommand, quickRollbackCommand, rollbackHistoryCommand } from './commands/rollback.js';
import { monitorCommand } from './commands/monitor.js';
import { createCommand } from './commands/create.js';

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

// Check command
program
  .command('check')
  .description('Validate configuration and check for issues')
  .option('--fix', 'Automatically fix issues where possible')
  .action(async (options) => {
    await checkCommand(options);
  });

// Dev command
program
  .command('dev')
  .description('Start development server with hot reload')
  .option('-p, --port <port>', 'Port to listen on', '3456')
  .option('-h, --host <host>', 'Host to bind to', 'localhost')
  .option('-o, --open', 'Open browser automatically')
  .action(async (options) => {
    await devCommand({
      ...options,
      port: parseInt(options.port, 10),
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
  .command('deploy')
  .description('Deploy container to YourTM CDN')
  .option('-e, --env <environment>', 'Target environment (development, staging, production)')
  .option('-d, --dry-run', 'Simulate deployment without making changes')
  .option('-f, --force', 'Force deployment without approval')
  .option('-m, --message <message>', 'Deployment message')
  .action(async (options) => {
    await deployCommand(options);
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

// Rollback command with subcommands
const rollback = program
  .command('rollback [version]')
  .description('Rollback to a previous version')
  .option('-e, --env <environment>', 'Target environment (staging, production)', 'staging')
  .option('-f, --force', 'Force rollback without confirmation')
  .action(async (version, options) => {
    await rollbackCommand({
      version,
      env: options.env,
      force: options.force,
    });
  });

// Quick rollback to previous version
rollback
  .command('quick')
  .description('Quickly rollback to the previous version')
  .option('-e, --env <environment>', 'Target environment', 'staging')
  .option('-f, --force', 'Force rollback without confirmation')
  .action(async (options) => {
    await quickRollbackCommand(options);
  });

// Rollback history
rollback
  .command('history')
  .description('Show rollback history')
  .option('-e, --env <environment>', 'Target environment', 'staging')
  .option('-l, --limit <count>', 'Number of entries to show', '10')
  .action(async (options) => {
    await rollbackHistoryCommand({
      env: options.env,
      limit: parseInt(options.limit, 10),
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
