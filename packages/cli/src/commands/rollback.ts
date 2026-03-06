/**
 * YourTM Rollback Command
 *
 * Rolls back to a previous version of the deployed container.
 * Supports both interactive version selection and direct version specification.
 */

import ora from 'ora';
// @ts-ignore - prompts types are incorrect for ESM
import prompts from 'prompts';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import {
  CloudflareClient,
  CloudflareAPIError,
  getCloudflareCredentials,
} from '../cloudflare/api.js';
import type {
  RollbackOptions,
  DeployedVersion,
  VersionIndex,
} from '../cloudflare/types.js';

// Extended config type for deploy settings
interface ExtendedConfig {
  containerId: string;
  containerName?: string;
  outDir: string;
  environments?: Record<string, {
    deployTo?: string;
    accountId?: string;
    kvNamespaceId?: string;
    workerName?: string;
    customDomain?: string;
    debug?: boolean;
  }>;
}

export async function rollbackCommand(options: RollbackOptions = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Rollback');
  logger.newline();

  const spinner = ora('Loading configuration...').start();

  try {
    // Load configuration
    const config = await loadConfig(cwd) as unknown as ExtendedConfig;
    const environment = options.env || 'staging';

    // Get environment-specific config
    const envConfig = config.environments?.[environment];

    // Get Cloudflare credentials
    const credentials = getCloudflareCredentials({
      accountId: envConfig?.accountId,
    });

    if (!credentials) {
      spinner.fail('Cloudflare credentials not found');
      logger.newline();
      logger.error('Missing Cloudflare credentials. Please set:');
      logger.info('  - CLOUDFLARE_API_TOKEN environment variable');
      logger.info('  - CLOUDFLARE_ACCOUNT_ID environment variable');
      process.exit(1);
    }

    // Check for KV namespace
    const kvNamespaceId = envConfig?.kvNamespaceId || process.env.CLOUDFLARE_KV_NAMESPACE_ID;
    if (!kvNamespaceId) {
      spinner.fail('KV namespace not configured');
      logger.error('No KV namespace configured for this environment.');
      process.exit(1);
    }

    // Create Cloudflare client
    const client = new CloudflareClient(credentials);

    // Get current version index
    spinner.text = 'Loading version history...';
    const versionsJson = await client.getKVValue(kvNamespaceId, 'versions');

    if (!versionsJson) {
      spinner.fail('No versions found');
      logger.error('No deployed versions found. Deploy first with "ytm deploy".');
      process.exit(1);
    }

    const versionIndex = JSON.parse(versionsJson) as VersionIndex;

    // Check if we have versions to rollback to
    if (versionIndex.versions.length < 2) {
      spinner.fail('Not enough versions');
      logger.error('Need at least 2 versions to perform a rollback.');
      process.exit(1);
    }

    spinner.stop();

    // Display current state
    logger.info('Current Deployment:');
    logger.table([
      { label: 'Container', value: config.containerId },
      { label: 'Environment', value: environment },
      { label: 'Current Version', value: versionIndex.current },
      { label: 'Previous Version', value: versionIndex.previous || 'none' },
    ]);
    logger.newline();

    // Determine target version
    let targetVersion: string;

    if (options.version) {
      // Use specified version
      targetVersion = options.version;

      // Validate version exists
      const versionExists = versionIndex.versions.some(v => v.version === targetVersion);
      if (!versionExists) {
        logger.error(`Version ${targetVersion} not found.`);
        logger.newline();
        logger.info('Available versions:');
        versionIndex.versions.slice(0, 10).forEach(v => {
          const label = v.version === versionIndex.current ? ' (current)' : '';
          console.log(`  - ${v.version}${label}`);
        });
        process.exit(1);
      }

      // Check if trying to rollback to current
      if (targetVersion === versionIndex.current) {
        logger.warn(`Version ${targetVersion} is already the current version.`);
        return;
      }
    } else {
      // Interactive version selection
      const choices = versionIndex.versions
        .filter(v => v.version !== versionIndex.current)
        .slice(0, 20)
        .map(v => {
          const age = formatAge(v.timestamp);
          const size = formatBytes(v.size);
          const label = v.version === versionIndex.previous ? ' (previous)' : '';
          const msg = v.message ? ` - ${v.message}` : '';

          return {
            title: `${v.version}${label} (${age}, ${size})${msg}`,
            value: v.version,
          };
        });

      if (choices.length === 0) {
        logger.error('No other versions available to rollback to.');
        process.exit(1);
      }

      logger.info('Select a version to rollback to:');
      logger.newline();

      const response = await prompts({
        type: 'select',
        name: 'version',
        message: 'Version',
        choices,
      });

      if (!response.version) {
        logger.info('Rollback cancelled.');
        return;
      }

      targetVersion = response.version;
    }

    // Load target version details
    spinner.start(`Loading version ${targetVersion}...`);

    const targetVersionData = await client.getKVValue(kvNamespaceId, `versions/${targetVersion}`);
    if (!targetVersionData) {
      spinner.fail('Version data not found');
      logger.error(`Could not load version data for ${targetVersion}.`);
      process.exit(1);
    }

    const targetVersionInfo = JSON.parse(targetVersionData) as DeployedVersion;

    // Verify bundles still exist
    spinner.text = 'Verifying bundles...';

    for (const bundle of targetVersionInfo.bundles) {
      const bundleContent = await client.getKVValue(kvNamespaceId, bundle.key);
      if (!bundleContent) {
        spinner.fail('Bundle not found');
        logger.error(`Bundle ${bundle.name} not found in KV. Version may have been cleaned up.`);
        process.exit(1);
      }
    }

    spinner.stop();

    // Display rollback info
    logger.info('Rollback Details:');
    logger.table([
      { label: 'From Version', value: versionIndex.current },
      { label: 'To Version', value: targetVersion },
      { label: 'Bundles', value: String(targetVersionInfo.bundles.length) },
      { label: 'Total Size', value: formatBytes(targetVersionInfo.bundles.reduce((sum, b) => sum + b.size, 0)) },
    ]);
    logger.newline();

    // Confirmation for production
    if (environment === 'production' && !options.force) {
      const confirm = await prompts({
        type: 'confirm',
        name: 'proceed',
        message: `Rollback ${environment} to version ${targetVersion}?`,
        initial: false,
      });

      if (!confirm.proceed) {
        logger.info('Rollback cancelled.');
        return;
      }
    }

    // Perform rollback
    spinner.start('Performing rollback...');

    // Update version index
    const newIndex: VersionIndex = {
      ...versionIndex,
      previous: versionIndex.current,
      current: targetVersion,
    };

    // Move rolled-back version to front of versions list
    const targetVersionEntry = versionIndex.versions.find(v => v.version === targetVersion);
    if (targetVersionEntry) {
      newIndex.versions = [
        { ...targetVersionEntry, timestamp: Date.now() },
        ...versionIndex.versions.filter(v => v.version !== targetVersion),
      ];
    }

    spinner.text = 'Updating version index...';
    await client.putKVValue(kvNamespaceId, 'versions', JSON.stringify(newIndex));

    // Update "latest" pointer
    spinner.text = 'Updating latest pointer...';
    await client.putKVValue(kvNamespaceId, 'latest', targetVersion);

    // Store rollback event in version history
    spinner.text = 'Recording rollback event...';

    const rollbackEvent = {
      type: 'rollback',
      timestamp: Date.now(),
      fromVersion: versionIndex.current,
      toVersion: targetVersion,
      environment,
      user: process.env.USER || process.env.USERNAME,
    };

    // Append to rollback history
    const historyKey = `history/rollbacks`;
    const existingHistory = await client.getKVValue(kvNamespaceId, historyKey);
    const history = existingHistory ? JSON.parse(existingHistory) : [];
    history.unshift(rollbackEvent);
    // Keep last 100 rollback events
    if (history.length > 100) {
      history.splice(100);
    }
    await client.putKVValue(kvNamespaceId, historyKey, JSON.stringify(history));

    spinner.succeed('Rollback completed!');
    logger.newline();

    // Display success info
    logger.table([
      { label: 'Status', value: 'Rolled Back' },
      { label: 'Previous Version', value: versionIndex.current },
      { label: 'Current Version', value: targetVersion },
      { label: 'Environment', value: environment },
    ]);
    logger.newline();

    // Get worker subdomain for CDN URL
    const subdomain = await client.getWorkerSubdomain();
    const workerName = envConfig?.workerName || `ytm-${config.containerId.toLowerCase()}`;

    if (subdomain) {
      const baseUrl = `https://${workerName}.${subdomain.subdomain}.workers.dev`;
      logger.info('CDN URLs (now serving rolled-back version):');
      console.log(`  Latest:     ${baseUrl}/latest/core.js`);
      console.log(`  Versioned:  ${baseUrl}/v/${targetVersion}/core.js`);
      logger.newline();
    }

    logger.success(`Container ${config.containerId} rolled back to ${targetVersion}!`);

    logger.newline();
    logger.info('To undo this rollback, run:');
    console.log(`  ytm rollback ${versionIndex.current}`);

  } catch (error) {
    spinner.fail('Rollback failed');

    if (error instanceof CloudflareAPIError) {
      logger.error(`Cloudflare API Error: ${error.message}`);
      if (error.errors.length > 0) {
        error.errors.forEach(e => {
          logger.info(`  [${e.code}] ${e.message}`);
        });
      }
    } else {
      logger.error(error instanceof Error ? error.message : String(error));
    }

    process.exit(1);
  }
}

// ============================================
// Quick Rollback Command
// ============================================

/**
 * Quick rollback to the previous version without prompts
 */
export async function quickRollbackCommand(options: { env?: string; force?: boolean } = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Quick Rollback');
  logger.newline();

  const spinner = ora('Loading configuration...').start();

  try {
    const config = await loadConfig(cwd) as unknown as ExtendedConfig;
    const environment = options.env || 'staging';

    // Get environment-specific config
    const envConfig = config.environments?.[environment];

    // Get Cloudflare credentials
    const credentials = getCloudflareCredentials({
      accountId: envConfig?.accountId,
    });

    if (!credentials) {
      spinner.fail('Cloudflare credentials not found');
      process.exit(1);
    }

    const kvNamespaceId = envConfig?.kvNamespaceId || process.env.CLOUDFLARE_KV_NAMESPACE_ID;
    if (!kvNamespaceId) {
      spinner.fail('KV namespace not configured');
      process.exit(1);
    }

    const client = new CloudflareClient(credentials);

    // Get version index
    spinner.text = 'Loading version history...';
    const versionsJson = await client.getKVValue(kvNamespaceId, 'versions');

    if (!versionsJson) {
      spinner.fail('No versions found');
      process.exit(1);
    }

    const versionIndex = JSON.parse(versionsJson) as VersionIndex;

    // Check for previous version
    if (!versionIndex.previous) {
      spinner.fail('No previous version');
      logger.error('No previous version available for quick rollback.');
      process.exit(1);
    }

    spinner.stop();

    logger.info(`Rolling back from ${versionIndex.current} to ${versionIndex.previous}...`);
    logger.newline();

    // Perform rollback
    await rollbackCommand({
      version: versionIndex.previous,
      env: options.env as 'development' | 'staging' | 'production' | undefined,
      force: options.force,
    });

  } catch (error) {
    spinner.fail('Quick rollback failed');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================
// Rollback History Command
// ============================================

export async function rollbackHistoryCommand(options: { env?: string; limit?: number } = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Rollback History');
  logger.newline();

  const spinner = ora('Loading history...').start();

  try {
    const config = await loadConfig(cwd) as unknown as ExtendedConfig;
    const environment = options.env || 'staging';

    // Get credentials
    const credentials = getCloudflareCredentials();
    if (!credentials) {
      spinner.fail('Cloudflare credentials not configured');
      process.exit(1);
    }

    // Get KV namespace
    const envConfig = config.environments?.[environment];
    const kvNamespaceId = envConfig?.kvNamespaceId || process.env.CLOUDFLARE_KV_NAMESPACE_ID;

    if (!kvNamespaceId) {
      spinner.fail(`No KV namespace configured for ${environment}`);
      process.exit(1);
    }

    const client = new CloudflareClient(credentials);

    // Get rollback history
    const historyJson = await client.getKVValue(kvNamespaceId, 'history/rollbacks');

    spinner.stop();

    if (!historyJson) {
      logger.info('No rollback history found.');
      return;
    }

    interface RollbackEvent {
      type: string;
      timestamp: number;
      fromVersion: string;
      toVersion: string;
      environment: string;
      user?: string;
    }

    const history = JSON.parse(historyJson) as RollbackEvent[];
    const limit = options.limit || 10;
    const events = history.slice(0, limit);

    logger.table([
      { label: 'Container', value: config.containerId },
      { label: 'Environment', value: environment },
      { label: 'Total Rollbacks', value: String(history.length) },
    ]);
    logger.newline();

    logger.info('Recent Rollbacks:');
    logger.newline();

    for (const event of events) {
      const age = formatAge(event.timestamp);
      const user = event.user ? ` by ${event.user}` : '';

      console.log(
        `  ${logger.chalk.yellow('●')} ${logger.chalk.cyan(event.fromVersion)} -> ${logger.chalk.green(event.toVersion)}`
      );
      console.log(
        `    ${logger.chalk.gray(`${age}${user}`)}`
      );
    }

    logger.newline();

    if (history.length > limit) {
      logger.info(`Showing ${limit} of ${history.length} rollbacks. Use --limit to see more.`);
    }

  } catch (error) {
    spinner.fail('Failed to load history');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================
// Helper Functions
// ============================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatAge(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}
