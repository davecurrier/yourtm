/**
 * YourTM Deploy Command
 *
 * Deploys compiled bundles to Cloudflare Workers KV.
 * Self-hosted: Users deploy to their own Cloudflare account.
 */

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import ora from 'ora';
// @ts-ignore - prompts types are incorrect for ESM
import prompts from 'prompts';
import { logger } from '../utils/logger.js';
import { loadConfig, findConfigFile } from '../utils/config.js';
import { buildCommand } from './build.js';
import {
  CloudflareClient,
  CloudflareAPIError,
  getCloudflareCredentials,
  generateWorkerScript,
  generateVersion,
  generateContentHash,
} from '../cloudflare/api.js';
import type {
  DeployOptions,
  DeployInitOptions,
  DeployedVersion,
  DeployedBundle,
  VersionIndex,
  VersionEntry,
} from '../cloudflare/types.js';

// Extended config type for deploy settings
interface ExtendedConfig {
  containerId: string;
  containerName?: string;
  outDir: string;
  environments?: Record<string, {
    deployTo?: string;
    accountId?: string;
    /** R2 bucket for static bundles (new, recommended) */
    r2BucketName?: string;
    /** Public URL for R2 bucket */
    r2PublicUrl?: string;
    /** KV namespace for metadata only */
    kvNamespaceId?: string;
    workerName?: string;
    customDomain?: string;
    debug?: boolean;
  }>;
}

// ============================================
// Deploy Command
// ============================================

export async function deployCommand(options: DeployOptions = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Deploy');
  logger.newline();

  const spinner = ora('Preparing deployment...').start();

  try {
    // Load configuration
    const config = await loadConfig(cwd) as unknown as ExtendedConfig;
    const environment = options.env || 'staging';

    // Get environment-specific config
    const envConfig = config.environments?.[environment];

    // Check if this environment is configured for Cloudflare
    if (envConfig?.deployTo && envConfig.deployTo !== 'cloudflare') {
      throw new Error(`Environment '${environment}' is not configured for Cloudflare deployment`);
    }

    // Get Cloudflare credentials
    const credentials = getCloudflareCredentials({
      token: options.token,
      accountId: envConfig?.accountId,
    });

    if (!credentials) {
      spinner.fail('Cloudflare credentials not found');
      logger.newline();
      logger.error('Missing Cloudflare credentials. Please set:');
      logger.info('  - CLOUDFLARE_API_TOKEN environment variable');
      logger.info('  - CLOUDFLARE_ACCOUNT_ID environment variable');
      logger.newline();
      logger.info('Or run "ytm deploy init" to set up deployment.');
      process.exit(1);
    }

    // Check for R2 bucket (primary) or KV namespace (legacy)
    const r2BucketName = envConfig?.r2BucketName || process.env.CLOUDFLARE_R2_BUCKET;
    const r2PublicUrl = envConfig?.r2PublicUrl || process.env.CLOUDFLARE_R2_PUBLIC_URL;
    const kvNamespaceId = envConfig?.kvNamespaceId || process.env.CLOUDFLARE_KV_NAMESPACE_ID;

    // Determine storage mode
    const useR2 = !!r2BucketName;

    if (!useR2 && !kvNamespaceId) {
      spinner.fail('Storage not configured');
      logger.newline();
      logger.error('No R2 bucket or KV namespace configured for this environment.');
      logger.info('Run "ytm deploy init" to set up a new deployment.');
      process.exit(1);
    }

    spinner.text = 'Checking build output...';

    // Check if build exists, run build if not
    if (!existsSync(config.outDir)) {
      spinner.text = 'No build found. Running build...';
      spinner.stop();

      await buildCommand({ clean: true });

      logger.newline();
      spinner.start('Continuing deployment...');
    }

    // Verify build directory has files
    const files = await readdir(config.outDir);
    const jsFiles = files.filter(f => f.endsWith('.js'));

    if (jsFiles.length === 0) {
      throw new Error(`No JavaScript files found in ${config.outDir}. Run "ytm build" first.`);
    }

    // Create Cloudflare client
    const client = new CloudflareClient(credentials);

    // Verify token
    spinner.text = 'Verifying Cloudflare credentials...';
    const tokenValid = await client.verifyToken();
    if (!tokenValid) {
      throw new Error('Invalid Cloudflare API token. Check your CLOUDFLARE_API_TOKEN.');
    }

    // Display deployment info
    spinner.stop();

    logger.info('Deployment Configuration:');
    const configTable = [
      { label: 'Container', value: config.containerId },
      { label: 'Environment', value: environment },
    ];

    if (useR2) {
      configTable.push({ label: 'Storage', value: 'R2 Bucket (CDN)' });
      configTable.push({ label: 'R2 Bucket', value: r2BucketName! });
      if (r2PublicUrl) {
        configTable.push({ label: 'CDN URL', value: r2PublicUrl });
      }
    } else {
      configTable.push({ label: 'Storage', value: 'KV (Legacy)' });
      configTable.push({ label: 'KV Namespace', value: kvNamespaceId!.slice(0, 12) + '...' });
    }

    configTable.push({ label: 'Dry Run', value: String(options.dryRun || false) });
    logger.table(configTable);
    logger.newline();

    // Collect bundles to deploy
    spinner.start('Reading bundles...');

    const bundles: Array<{
      name: string;
      content: string;
      size: number;
      hash: string;
    }> = [];

    let totalSize = 0;

    for (const file of jsFiles) {
      const filepath = join(config.outDir, file);
      const content = await readFile(filepath, 'utf-8');
      const size = Buffer.byteLength(content, 'utf8');
      const hash = generateContentHash(content);

      bundles.push({ name: file, content, size, hash });
      totalSize += size;
    }

    spinner.stop();

    // Display bundles
    logger.info('Bundles to deploy:');
    logger.newline();

    for (const bundle of bundles) {
      logger.bundle(bundle.name, bundle.size);
    }

    logger.divider();
    logger.bundle('Total', totalSize);
    logger.newline();

    // Production safety check
    if (environment === 'production' && !options.force && !options.dryRun) {
      const confirm = await prompts({
        type: 'confirm',
        name: 'proceed',
        message: 'Deploy to production?',
        initial: false,
      });

      if (!confirm.proceed) {
        logger.info('Deployment cancelled.');
        return;
      }
    }

    // Dry run mode
    if (options.dryRun) {
      logger.newline();
      logger.success('Dry run completed. No changes made.');
      logger.info('Remove --dry-run to deploy.');
      return;
    }

    // Generate version
    const version = generateVersion();
    spinner.start(`Deploying version ${version}...`);

    // Upload bundles
    const deployedBundles: DeployedBundle[] = [];

    if (useR2) {
      // Upload to R2 bucket (static CDN serving)
      for (let i = 0; i < bundles.length; i++) {
        const bundle = bundles[i];
        spinner.text = `Uploading ${bundle.name} to R2 (${i + 1}/${bundles.length})...`;

        const key = `v/${version}/${bundle.name}`;
        await client.uploadToR2(r2BucketName!, key, bundle.content, {
          contentType: 'application/javascript; charset=utf-8',
          cacheControl: 'public, max-age=31536000, immutable', // 1 year, immutable (versioned)
          metadata: {
            'ytm-version': version,
            'ytm-container': config.containerId,
            'ytm-hash': bundle.hash,
          },
        });

        deployedBundles.push({
          name: bundle.name,
          key,
          size: bundle.size,
          hash: bundle.hash,
        });
      }

      // Also upload a "latest" copy for convenience
      spinner.text = 'Creating latest symlinks...';
      for (const bundle of bundles) {
        const latestKey = `latest/${bundle.name}`;
        await client.uploadToR2(r2BucketName!, latestKey, bundle.content, {
          contentType: 'application/javascript; charset=utf-8',
          cacheControl: 'public, max-age=300, s-maxage=60', // Short cache for latest
          metadata: {
            'ytm-version': version,
            'ytm-container': config.containerId,
            'ytm-hash': bundle.hash,
          },
        });
      }
    } else {
      // Legacy: Upload to KV
      for (let i = 0; i < bundles.length; i++) {
        const bundle = bundles[i];
        spinner.text = `Uploading ${bundle.name} to KV (${i + 1}/${bundles.length})...`;

        const key = `bundles/${version}/${bundle.name}`;
        await client.putKVValue(kvNamespaceId!, key, bundle.content, {
          metadata: {
            containerId: config.containerId,
            environment,
            version,
            hash: bundle.hash,
            uploadedAt: new Date().toISOString(),
          },
        });

        deployedBundles.push({
          name: bundle.name,
          key,
          size: bundle.size,
          hash: bundle.hash,
        });
      }
    }

    // Store version metadata
    spinner.text = 'Storing version metadata...';

    const versionData: DeployedVersion = {
      version,
      timestamp: Date.now(),
      containerId: config.containerId,
      environment,
      bundles: deployedBundles,
      metadata: {
        message: options.message,
        deployer: process.env.USER || process.env.USERNAME,
        gitCommit: process.env.GIT_COMMIT || process.env.GITHUB_SHA,
        gitBranch: process.env.GIT_BRANCH || process.env.GITHUB_REF_NAME,
      },
    };

    if (useR2) {
      // Store metadata in R2 as JSON files
      await client.uploadToR2(r2BucketName!, `meta/versions/${version}.json`, JSON.stringify(versionData, null, 2), {
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'public, max-age=31536000, immutable',
      });

      // Update version index
      spinner.text = 'Updating version index...';

      let versionIndex: VersionIndex;
      try {
        const existingIndexResponse = await fetch(`${r2PublicUrl || `https://${r2BucketName}.r2.dev`}/meta/versions.json`);
        if (existingIndexResponse.ok) {
          versionIndex = await existingIndexResponse.json() as VersionIndex;
        } else {
          versionIndex = { versions: [], current: '' };
        }
      } catch {
        versionIndex = { versions: [], current: '' };
      }

      // Add new version to index
      const versionEntry: VersionEntry = {
        version,
        timestamp: versionData.timestamp,
        environment,
        size: totalSize,
        message: options.message,
      };

      versionIndex.previous = versionIndex.current;
      versionIndex.current = version;
      versionIndex.versions.unshift(versionEntry);

      // Keep last 50 versions in index
      if (versionIndex.versions.length > 50) {
        versionIndex.versions = versionIndex.versions.slice(0, 50);
      }

      await client.uploadToR2(r2BucketName!, 'meta/versions.json', JSON.stringify(versionIndex, null, 2), {
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'public, max-age=60', // Short cache for index
      });
    } else {
      // Legacy: Store in KV
      await client.putKVValue(
        kvNamespaceId!,
        `versions/${version}`,
        JSON.stringify(versionData)
      );

      // Update version index
      spinner.text = 'Updating version index...';

      let versionIndex: VersionIndex;
      const existingIndex = await client.getKVValue(kvNamespaceId!, 'versions');

      if (existingIndex) {
        versionIndex = JSON.parse(existingIndex);
      } else {
        versionIndex = { versions: [], current: '' };
      }

      // Add new version to index
      const versionEntry: VersionEntry = {
        version,
        timestamp: versionData.timestamp,
        environment,
        size: totalSize,
        message: options.message,
      };

      versionIndex.previous = versionIndex.current;
      versionIndex.current = version;
      versionIndex.versions.unshift(versionEntry);

      // Keep last 50 versions in index
      if (versionIndex.versions.length > 50) {
        versionIndex.versions = versionIndex.versions.slice(0, 50);
      }

      await client.putKVValue(kvNamespaceId!, 'versions', JSON.stringify(versionIndex));

      // Update "latest" pointer
      spinner.text = 'Updating latest pointer...';
      await client.putKVValue(kvNamespaceId!, 'latest', version);
    }

    spinner.succeed('Deployment completed!');
    logger.newline();

    // Display success info
    logger.table([
      { label: 'Status', value: 'Published' },
      { label: 'Version', value: version },
      { label: 'Environment', value: environment },
      { label: 'Bundles', value: String(bundles.length) },
      { label: 'Total Size', value: formatBytes(totalSize) },
      { label: 'Storage', value: useR2 ? 'R2 CDN' : 'KV' },
    ]);
    logger.newline();

    // Show CDN URLs
    logger.info('CDN URLs:');

    if (useR2 && r2PublicUrl) {
      // R2 public bucket URLs (fast CDN)
      console.log(`  Latest:     ${r2PublicUrl}/latest/core.js`);
      console.log(`  Versioned:  ${r2PublicUrl}/v/${version}/core.js`);
      logger.newline();

      // Show embed code
      logger.info('Embed in your site:');
      console.log(logger.chalk.cyan(`  <script src="${r2PublicUrl}/latest/core.js" async></script>`));
    } else if (useR2) {
      // R2 without custom domain
      const publicUrl = `https://pub-${credentials.accountId.slice(0, 8)}.r2.dev/${r2BucketName}`;
      console.log(`  Latest:     ${publicUrl}/latest/core.js`);
      console.log(`  Versioned:  ${publicUrl}/v/${version}/core.js`);
      logger.newline();
      logger.warn('No custom domain configured for R2 bucket.');
      logger.info('Configure r2PublicUrl in yourtm.config.ts for a cleaner URL.');
    } else {
      // Legacy KV/Worker URLs
      const subdomain = await client.getWorkerSubdomain();
      const workerName = envConfig?.workerName || `ytm-${config.containerId.toLowerCase()}`;

      if (subdomain) {
        const baseUrl = `https://${workerName}.${subdomain.subdomain}.workers.dev`;
        console.log(`  Latest:     ${baseUrl}/latest/core.js`);
        console.log(`  Versioned:  ${baseUrl}/v/${version}/core.js`);
        console.log(`  Container:  ${baseUrl}/${config.containerId}.js`);
      } else {
        logger.warn('Worker subdomain not configured. Run "ytm deploy init" to set up.');
      }
    }

    logger.newline();

    if (options.message) {
      logger.info(`Message: ${options.message}`);
    }

    logger.success(`Container ${config.containerId} deployed to ${environment}!`);

  } catch (error) {
    spinner.fail('Deployment failed');

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
// Deploy Init Command
// ============================================

export async function deployInitCommand(options: DeployInitOptions = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Deploy Setup');
  logger.newline();

  const spinner = ora('Loading configuration...').start();

  try {
    // Check for existing config
    const configPath = await findConfigFile(cwd);
    if (!configPath) {
      spinner.fail('No YourTM project found');
      logger.error('Run "ytm init" first to create a project.');
      process.exit(1);
    }

    const config = await loadConfig(cwd) as unknown as ExtendedConfig;

    spinner.stop();

    // Collect Cloudflare credentials
    logger.info('Cloudflare Setup');
    logger.info('This will create a KV namespace and deploy a CDN worker to your Cloudflare account.');
    logger.newline();

    // Get API token
    let apiToken = options.apiToken || process.env.CLOUDFLARE_API_TOKEN;
    if (!apiToken) {
      const response = await prompts({
        type: 'password',
        name: 'token',
        message: 'Cloudflare API Token:',
        validate: (v) => v.length > 0 || 'API token is required',
      });
      apiToken = response.token;
    }

    if (!apiToken) {
      logger.error('API token is required.');
      process.exit(1);
    }

    // Get Account ID
    let accountId = options.accountId || process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId) {
      const response = await prompts({
        type: 'text',
        name: 'accountId',
        message: 'Cloudflare Account ID:',
        validate: (v) => v.length > 0 || 'Account ID is required',
      });
      accountId = response.accountId;
    }

    if (!accountId) {
      logger.error('Account ID is required.');
      process.exit(1);
    }

    // Create client
    const client = new CloudflareClient({ apiToken, accountId });

    // Verify credentials
    spinner.start('Verifying Cloudflare credentials...');
    const tokenValid = await client.verifyToken();
    if (!tokenValid) {
      spinner.fail('Invalid API token');
      logger.error('Could not verify Cloudflare API token. Check your credentials.');
      process.exit(1);
    }

    spinner.succeed('Credentials verified');

    // Get worker name
    let workerName = options.workerName;
    if (!workerName) {
      const defaultName = `ytm-${config.containerId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const response = await prompts({
        type: 'text',
        name: 'workerName',
        message: 'Worker name:',
        initial: defaultName,
        validate: (v) => /^[a-z0-9-]+$/.test(v) || 'Worker name must be lowercase alphanumeric with dashes',
      });
      workerName = response.workerName || defaultName;
    }

    // Check if KV namespace already exists
    spinner.start('Checking for existing KV namespaces...');
    const namespaces = await client.listKVNamespaces();
    const namespaceName = `ytm-${config.containerId}`;
    const existingNamespace = namespaces.find(ns => ns.title === namespaceName);

    let kvNamespaceId: string;

    if (existingNamespace) {
      spinner.succeed(`Found existing KV namespace: ${namespaceName}`);
      kvNamespaceId = existingNamespace.id;
    } else {
      spinner.text = `Creating KV namespace: ${namespaceName}...`;
      const namespace = await client.createKVNamespace(namespaceName);
      kvNamespaceId = namespace.id;
      spinner.succeed(`Created KV namespace: ${namespaceName}`);
    }

    // Ensure workerName is set
    if (!workerName) {
      workerName = `ytm-${config.containerId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    }

    // Check for existing worker
    spinner.start(`Checking for existing worker: ${workerName}...`);
    const existingWorker = await client.getWorker(workerName);

    if (existingWorker) {
      spinner.stop();
      const response = await prompts({
        type: 'confirm',
        name: 'overwrite',
        message: `Worker "${workerName}" already exists. Overwrite?`,
        initial: false,
      });

      if (!response.overwrite) {
        logger.info('Setup cancelled.');
        return;
      }
      spinner.start('Updating worker...');
    } else {
      spinner.text = `Deploying CDN worker: ${workerName}...`;
    }

    // Generate and deploy worker
    const workerScript = generateWorkerScript({
      containerId: config.containerId,
      kvNamespaceBinding: 'YTM_KV',
    });

    await client.deployWorkerServiceWorker(workerName, workerScript, [
      {
        name: 'YTM_KV',
        type: 'kv_namespace',
        namespace_id: kvNamespaceId,
      },
    ]);

    spinner.succeed(`Deployed CDN worker: ${workerName}`);

    // Enable workers.dev subdomain if not already
    spinner.start('Configuring workers.dev subdomain...');
    let subdomain = await client.getWorkerSubdomain();

    if (!subdomain) {
      // Generate a subdomain from account ID
      const suggestedSubdomain = `ytm-${accountId.slice(0, 8)}`;
      spinner.stop();

      const response = await prompts({
        type: 'text',
        name: 'subdomain',
        message: 'Workers subdomain (yourname.workers.dev):',
        initial: suggestedSubdomain,
        validate: (v) => /^[a-z0-9-]+$/.test(v) || 'Subdomain must be lowercase alphanumeric with dashes',
      });

      if (response.subdomain) {
        spinner.start('Enabling workers.dev subdomain...');
        try {
          subdomain = await client.enableWorkerSubdomain(response.subdomain);
          spinner.succeed(`Enabled subdomain: ${subdomain.subdomain}.workers.dev`);
        } catch (error) {
          spinner.warn('Could not enable subdomain (may already be taken)');
          subdomain = { subdomain: response.subdomain };
        }
      }
    } else {
      spinner.succeed(`Using subdomain: ${subdomain.subdomain}.workers.dev`);
    }

    logger.newline();

    // Display configuration to add to yourtm.config.ts
    logger.info('Add this to your yourtm.config.ts:');
    logger.newline();

    console.log(logger.chalk.cyan(`environments: {
  staging: {
    deployTo: 'cloudflare',
    accountId: '${accountId}',
    kvNamespaceId: '${kvNamespaceId}',
    workerName: '${workerName}',
  },
  production: {
    deployTo: 'cloudflare',
    accountId: '${accountId}',
    kvNamespaceId: '${kvNamespaceId}',
    workerName: '${workerName}',
  },
}`));

    logger.newline();

    // Display environment variables to set
    logger.info('Set these environment variables:');
    logger.newline();

    console.log(`  export CLOUDFLARE_API_TOKEN="${apiToken.slice(0, 10)}..."`);
    console.log(`  export CLOUDFLARE_ACCOUNT_ID="${accountId}"`);

    logger.newline();

    // Display CDN URL
    if (subdomain) {
      const cdnUrl = `https://${workerName}.${subdomain.subdomain}.workers.dev`;
      logger.success(`CDN URL: ${cdnUrl}`);
      logger.newline();

      logger.info('Embed in your site:');
      console.log(logger.chalk.cyan(`<script src="${cdnUrl}/${config.containerId}.js" async></script>`));
    }

    logger.newline();
    logger.success('Deploy setup complete! Run "ytm deploy" to deploy your container.');

  } catch (error) {
    spinner.fail('Setup failed');

    if (error instanceof CloudflareAPIError) {
      logger.error(`Cloudflare API Error: ${error.message}`);
    } else {
      logger.error(error instanceof Error ? error.message : String(error));
    }

    process.exit(1);
  }
}

// ============================================
// Status Command
// ============================================

export async function statusCommand(): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Deployment Status');
  logger.newline();

  const spinner = ora('Loading configuration...').start();

  try {
    const config = await loadConfig(cwd) as unknown as ExtendedConfig;

    // Get Cloudflare credentials
    const credentials = getCloudflareCredentials();

    if (!credentials) {
      spinner.stop();
      logger.table([
        { label: 'Container', value: config.containerId },
        { label: 'Name', value: config.containerName || 'Unnamed' },
      ]);
      logger.newline();

      logger.warn('Cloudflare credentials not configured.');
      logger.info('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to see deployment status.');
      return;
    }

    // Check environments
    const environments = ['development', 'staging', 'production'];
    const client = new CloudflareClient(credentials);

    spinner.stop();

    logger.table([
      { label: 'Container', value: config.containerId },
      { label: 'Name', value: config.containerName || 'Unnamed' },
    ]);
    logger.newline();

    logger.info('Environment Status:');
    logger.newline();

    for (const env of environments) {
      const envConfig = config.environments?.[env];
      const kvNamespaceId = envConfig?.kvNamespaceId || process.env.CLOUDFLARE_KV_NAMESPACE_ID;

      if (!kvNamespaceId) {
        const statusIcon = logger.chalk.gray('○');
        console.log(`  ${statusIcon} ${env.padEnd(15)} ${logger.chalk.gray('not configured')}`);
        continue;
      }

      try {
        spinner.start(`Checking ${env}...`);

        // Get latest version
        const latest = await client.getKVValue(kvNamespaceId, 'latest');

        if (!latest) {
          spinner.stop();
          const statusIcon = logger.chalk.yellow('○');
          console.log(`  ${statusIcon} ${env.padEnd(15)} ${logger.chalk.gray('no deployments')}`);
          continue;
        }

        // Get version info
        const versionData = await client.getKVValue(kvNamespaceId, `versions/${latest}`);

        spinner.stop();

        if (versionData) {
          const version = JSON.parse(versionData) as DeployedVersion;
          const statusIcon = logger.chalk.green('●');
          const age = formatAge(version.timestamp);
          console.log(
            `  ${statusIcon} ${env.padEnd(15)} ${logger.chalk.cyan(latest)} ${logger.chalk.gray(`(${age})`)}`
          );
        } else {
          const statusIcon = logger.chalk.green('●');
          console.log(`  ${statusIcon} ${env.padEnd(15)} ${logger.chalk.cyan(latest)}`);
        }
      } catch (error) {
        spinner.stop();
        const statusIcon = logger.chalk.red('●');
        console.log(`  ${statusIcon} ${env.padEnd(15)} ${logger.chalk.red('error')}`);
      }
    }

    logger.newline();

  } catch (error) {
    spinner.fail('Status check failed');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================
// Versions Command
// ============================================

export async function versionsCommand(options: { env?: string; limit?: number } = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Deployed Versions');
  logger.newline();

  const spinner = ora('Loading versions...').start();

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

    // Get version index
    const versionsJson = await client.getKVValue(kvNamespaceId, 'versions');

    spinner.stop();

    if (!versionsJson) {
      logger.info('No versions found.');
      return;
    }

    const versionIndex = JSON.parse(versionsJson) as VersionIndex;
    const limit = options.limit || 10;
    const versions = versionIndex.versions.slice(0, limit);

    logger.table([
      { label: 'Container', value: config.containerId },
      { label: 'Environment', value: environment },
      { label: 'Current', value: versionIndex.current },
    ]);
    logger.newline();

    logger.info('Recent Versions:');
    logger.newline();

    for (const version of versions) {
      const isCurrent = version.version === versionIndex.current;
      const isPrevious = version.version === versionIndex.previous;

      const icon = isCurrent
        ? logger.chalk.green('●')
        : isPrevious
        ? logger.chalk.yellow('○')
        : logger.chalk.gray('○');

      const label = isCurrent
        ? logger.chalk.green(' (current)')
        : isPrevious
        ? logger.chalk.yellow(' (previous)')
        : '';

      const age = formatAge(version.timestamp);
      const size = formatBytes(version.size);

      console.log(
        `  ${icon} ${logger.chalk.cyan(version.version)}${label}`
      );
      console.log(
        `    ${logger.chalk.gray(`${age} | ${size}${version.message ? ` | ${version.message}` : ''}`)}`
      );
    }

    logger.newline();

    if (versionIndex.versions.length > limit) {
      logger.info(`Showing ${limit} of ${versionIndex.versions.length} versions. Use --limit to see more.`);
    }

  } catch (error) {
    spinner.fail('Failed to load versions');
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
