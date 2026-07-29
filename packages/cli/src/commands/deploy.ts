/**
 * YourTM Deploy Command
 *
 * Unified versioning: deploys a pushed source version (v1, v2, v3...) to an environment.
 * You must `ytm push` before you can `ytm deploy`.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import ora from 'ora';
// @ts-ignore - prompts types are incorrect for ESM
import prompts from 'prompts';
import { logger } from '../utils/logger.js';
import { loadConfig, findConfigFile } from '../utils/config.js';
import { Compiler } from '../compiler/index.js';
import {
  CloudflareClient,
  CloudflareAPIError,
  getCloudflareCredentials,
  generateWorkerScript,
} from '../cloudflare/api.js';
import type { DeployOptions, DeployInitOptions } from '../cloudflare/types.js';

// ============================================================================
// Types
// ============================================================================

interface YourtmRC {
  containerId: string;
  remote: string;
  branch: string;
  lastPull?: string;
  lastPush?: string;
  version?: string;
}

interface VersionManifest {
  version: string;
  parent: string | null;
  branch: string;
  timestamp: string;
  author: { email: string; name: string };
  message: string;
  files: Record<string, { hash: string; size: number }>;
  stats: { tags: number; triggers: number; variables: number; zones: number };
}

interface BranchInfo {
  head: string;
  versions: Array<{
    id: string;
    message: string;
    author: string;
    timestamp: string;
  }>;
}

interface DeploymentInfo {
  version: string;
  environment: string;
  deployedAt: string;
  deployedBy: string;
  bundles: Array<{ name: string; size: number; hash: string }>;
}

interface EnvironmentStatus {
  staging?: { version: string; deployedAt: string };
  production?: { version: string; deployedAt: string };
}

interface ExtendedConfig {
  containerId: string;
  containerName?: string;
  outDir: string;
  environments?: Record<string, {
    deployTo?: string;
    accountId?: string;
    r2BucketName?: string;
    r2PublicUrl?: string;
    kvNamespaceId?: string;
    workerName?: string;
    customDomain?: string;
    debug?: boolean;
  }>;
}

// ============================================================================
// Helper Functions
// ============================================================================

const YOURTMRC_FILE = '.yourtmrc';

function getYourtmRC(cwd: string): YourtmRC | null {
  const rcPath = join(cwd, YOURTMRC_FILE);
  if (!existsSync(rcPath)) return null;
  try {
    return JSON.parse(readFileSync(rcPath, 'utf-8'));
  } catch {
    return null;
  }
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

function collectLocalFiles(cwd: string): Map<string, string> {
  const files = new Map<string, string>();

  function walkDir(dir: string, baseDir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = fullPath.replace(baseDir + '/', '');
      if (relativePath.includes('node_modules') || relativePath.includes('.git')) continue;
      if (entry.isDirectory()) {
        walkDir(fullPath, baseDir);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.set(relativePath, readFileSync(fullPath, 'utf-8'));
      }
    }
  }

  const yourtmDir = join(cwd, 'yourtm');
  if (existsSync(yourtmDir)) walkDir(yourtmDir, cwd);
  const configPath = join(cwd, 'yourtm.config.ts');
  if (existsSync(configPath)) files.set('yourtm.config.ts', readFileSync(configPath, 'utf-8'));

  return files;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatAge(timestamp: string | number): string {
  const ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  const now = Date.now();
  const diff = now - ts;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

// ============================================================================
// Source Version Helpers (reads from KV)
// ============================================================================

async function getSourceVersion(
  client: CloudflareClient,
  kvNamespaceId: string,
  containerId: string,
  branch: string,
  version: string
): Promise<{ manifest: VersionManifest; files: Map<string, string> } | null> {
  try {
    const manifestKey = `source:${containerId}:${branch}:${version}:manifest`;
    const manifestJson = await client.getKVValue(kvNamespaceId, manifestKey);
    if (!manifestJson) return null;

    const manifest = JSON.parse(manifestJson) as VersionManifest;
    const files = new Map<string, string>();

    for (const path of Object.keys(manifest.files)) {
      const fileKey = `source:${containerId}:${branch}:${version}:file:${path}`;
      const content = await client.getKVValue(kvNamespaceId, fileKey);
      if (content) files.set(path, content);
    }

    return { manifest, files };
  } catch {
    return null;
  }
}

async function getBranchInfo(
  client: CloudflareClient,
  kvNamespaceId: string,
  containerId: string,
  branch: string
): Promise<BranchInfo | null> {
  try {
    const key = `source:${containerId}:branch:${branch}`;
    const value = await client.getKVValue(kvNamespaceId, key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

async function getEnvironmentStatus(
  client: CloudflareClient,
  kvNamespaceId: string,
  containerId: string
): Promise<EnvironmentStatus> {
  try {
    const key = `deploy:${containerId}:environments`;
    const value = await client.getKVValue(kvNamespaceId, key);
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

async function saveEnvironmentStatus(
  client: CloudflareClient,
  kvNamespaceId: string,
  containerId: string,
  status: EnvironmentStatus
): Promise<void> {
  const key = `deploy:${containerId}:environments`;
  await client.putKVValue(kvNamespaceId, key, JSON.stringify(status));
}

async function findOrCreateKVNamespace(client: CloudflareClient, containerId: string): Promise<string> {
  const namespaces = await client.listKVNamespaces();
  const existing = namespaces.find(ns => ns.title === `yourtm-${containerId}`);
  if (existing) return existing.id;
  const newNs = await client.createKVNamespace(`yourtm-${containerId}`);
  return newNs.id;
}

// ============================================================================
// Deploy Command
// ============================================================================

export async function deployCommand(options: DeployOptions = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Deploy');
  logger.newline();

  const spinner = ora('Preparing deployment...').start();

  try {
    // Load configuration
    const config = await loadConfig(cwd) as unknown as ExtendedConfig;
    const environment = options.env || 'staging';
    const rc = getYourtmRC(cwd);

    // Get Cloudflare credentials
    const credentials = getCloudflareCredentials();
    if (!credentials) {
      spinner.fail('Cloudflare credentials not found');
      logger.newline();
      logger.error('Run "ytm setup" to configure Cloudflare credentials.');
      process.exit(1);
    }

    const client = new CloudflareClient(credentials);
    const kvNamespaceId = await findOrCreateKVNamespace(client, config.containerId);
    const branch = rc?.branch || 'main';

    // Get branch info to find latest pushed version
    spinner.text = 'Checking source versions...';
    const branchInfo = await getBranchInfo(client, kvNamespaceId, config.containerId, branch);

    if (!branchInfo || !branchInfo.head) {
      spinner.fail('No pushed versions found');
      logger.newline();
      logger.error('You must push your code before deploying.');
      logger.info('Run: ytm push -m "Your message"');
      process.exit(1);
    }

    // Determine which version to deploy
    const targetVersion = options.version || branchInfo.head;

    // Check if version exists
    const sourceData = await getSourceVersion(client, kvNamespaceId, config.containerId, branch, targetVersion);
    if (!sourceData) {
      spinner.fail(`Version ${targetVersion} not found`);
      process.exit(1);
    }

    // Check for unpushed local changes (if deploying latest)
    if (!options.version && !options.force) {
      spinner.text = 'Checking for unpushed changes...';
      const localFiles = collectLocalFiles(cwd);
      let hasChanges = false;

      for (const [path, content] of localFiles) {
        const localHash = hashContent(content);
        const remoteHash = sourceData.manifest.files[path]?.hash;
        if (localHash !== remoteHash) {
          hasChanges = true;
          break;
        }
      }

      if (hasChanges) {
        spinner.fail('You have unpushed local changes');
        logger.newline();
        logger.error('Your local files differ from the latest pushed version.');
        logger.info('Options:');
        logger.info('  1. Run "ytm push" to save your changes first');
        logger.info(`  2. Run "ytm deploy --version ${branchInfo.head}" to deploy the last pushed version`);
        logger.info('  3. Run "ytm deploy --force" to deploy anyway (not recommended)');
        process.exit(1);
      }
    }

    spinner.stop();

    // Display deployment info
    logger.info('Deployment Configuration:');
    logger.table([
      { label: 'Container', value: config.containerId },
      { label: 'Version', value: targetVersion },
      { label: 'Environment', value: environment },
      { label: 'Message', value: sourceData.manifest.message },
      { label: 'Author', value: sourceData.manifest.author.email },
    ]);
    logger.newline();

    // Production safety check
    if (environment === 'production' && !options.force && !options.dryRun) {
      const confirm = await prompts({
        type: 'confirm',
        name: 'proceed',
        message: `Deploy ${targetVersion} to production?`,
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

    // Write source files to temp directory and compile
    spinner.start('Building from source...');

    const tempDir = join(cwd, '.yourtm-build');
    await mkdir(tempDir, { recursive: true });

    // Write source files
    for (const [path, content] of sourceData.files) {
      const fullPath = join(tempDir, path);
      await mkdir(join(fullPath, '..'), { recursive: true });
      writeFileSync(fullPath, content);
    }

    // Compile
    const buildConfig = {
      ...config,
      srcDir: join(tempDir, 'yourtm'),
      tagsDir: join(tempDir, 'yourtm/tags'),
      triggersDir: join(tempDir, 'yourtm/triggers'),
      zonesDir: join(tempDir, 'yourtm/zones'),
      variablesDir: join(tempDir, 'yourtm/variables'),
    };

    const compiler = new Compiler(buildConfig as any);
    const compileResult = await compiler.compile();

    if (compileResult.errors.length > 0) {
      spinner.fail('Build failed');
      compileResult.errors.forEach(e => logger.error(`${e.file}: ${e.message}`));
      process.exit(1);
    }

    // Use bundles from compile result
    const bundles = compileResult.bundles;

    // Get R2/KV config
    const envConfig = config.environments?.[environment];
    const r2BucketName = envConfig?.r2BucketName || process.env.CLOUDFLARE_R2_BUCKET;
    const r2PublicUrl = envConfig?.r2PublicUrl || process.env.CLOUDFLARE_R2_PUBLIC_URL;
    const useR2 = !!r2BucketName;

    // Upload bundles
    spinner.text = `Deploying ${targetVersion} to ${environment}...`;

    const deployedBundles: Array<{ name: string; size: number; hash: string }> = [];
    let totalSize = 0;

    for (const bundle of bundles) {
      const content = bundle.code;
      const size = Buffer.byteLength(content, 'utf8');
      const hash = hashContent(content);
      totalSize += size;

      if (useR2) {
        // Upload to R2
        const key = `v/${targetVersion}/${bundle.name}.js`;
        await client.uploadToR2(r2BucketName!, key, content, {
          contentType: 'application/javascript; charset=utf-8',
          cacheControl: 'public, max-age=31536000, immutable',
          metadata: {
            'ytm-version': targetVersion,
            'ytm-container': config.containerId,
          },
        });

        // Also update "latest" for this environment
        const latestKey = `${environment}/${bundle.name}.js`;
        await client.uploadToR2(r2BucketName!, latestKey, content, {
          contentType: 'application/javascript; charset=utf-8',
          cacheControl: 'public, max-age=300',
        });
      } else {
        // Upload to KV
        const key = `bundles/${targetVersion}/${bundle.name}.js`;
        await client.putKVValue(kvNamespaceId, key, content);
      }

      deployedBundles.push({ name: `${bundle.name}.js`, size, hash });
    }

    // Save deployment info
    spinner.text = 'Saving deployment metadata...';

    const deploymentInfo: DeploymentInfo = {
      version: targetVersion,
      environment,
      deployedAt: new Date().toISOString(),
      deployedBy: process.env.USER || 'unknown',
      bundles: deployedBundles,
    };

    // Save deployment record
    const deployKey = `deploy:${config.containerId}:${environment}:${targetVersion}`;
    await client.putKVValue(kvNamespaceId, deployKey, JSON.stringify(deploymentInfo));

    // Update environment status
    const envStatus = await getEnvironmentStatus(client, kvNamespaceId, config.containerId);
    envStatus[environment as keyof EnvironmentStatus] = {
      version: targetVersion,
      deployedAt: deploymentInfo.deployedAt,
    };
    await saveEnvironmentStatus(client, kvNamespaceId, config.containerId, envStatus);

    // Clean up temp directory
    const { rm } = await import('node:fs/promises');
    await rm(tempDir, { recursive: true, force: true });

    spinner.succeed(`Deployed ${targetVersion} to ${environment}`);
    logger.newline();

    // Display success info
    logger.table([
      { label: 'Version', value: targetVersion },
      { label: 'Environment', value: environment },
      { label: 'Bundles', value: String(deployedBundles.length) },
      { label: 'Total Size', value: formatBytes(totalSize) },
    ]);
    logger.newline();

    // Show CDN URL
    if (r2PublicUrl) {
      logger.info('CDN URLs:');
      console.log(`  Latest:     ${r2PublicUrl}/${environment}/core.js`);
      console.log(`  Versioned:  ${r2PublicUrl}/v/${targetVersion}/core.js`);
      logger.newline();
      logger.info('Embed in your site:');
      console.log(logger.chalk.cyan(`  <script src="${r2PublicUrl}/${environment}/core.js" async></script>`));
    }

    // Sync to WordPress sites (if configured)
    const wpConfig = (config as any).wordpress;
    if (wpConfig?.sites?.length > 0) {
      logger.newline();
      logger.info(`Syncing to ${wpConfig.sites.length} WordPress site(s)...`);

      for (const site of wpConfig.sites) {
        const siteUrl = site.url.replace(/\/+$/, '');
        const syncUrl = `${siteUrl}/wp-json/yourtm/v1/sync`;
        const wpSpinner = ora(`  → ${siteUrl}`).start();

        try {
          const bundlePayload = bundles.map(b => ({
            name: `${b.name}.js`,
            code: b.code,
            hash: hashContent(b.code),
            size: Buffer.byteLength(b.code, 'utf8'),
          }));

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);

          const res = await fetch(syncUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-YourTM-Key': site.apiKey,
            },
            body: JSON.stringify({
              bundles: bundlePayload,
              version: targetVersion,
              container_id: config.containerId,
              environment,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (res.ok) {
            wpSpinner.succeed(`  → ${siteUrl} synced`);
          } else {
            const errText = await res.text().catch(() => `HTTP ${res.status}`);
            wpSpinner.warn(`  → ${siteUrl} failed: ${errText.slice(0, 100)}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          wpSpinner.warn(`  → ${siteUrl} failed: ${msg}`);
        }
      }
    }

    logger.newline();
    logger.success(`${config.containerId} ${targetVersion} is now live on ${environment}!`);

  } catch (error) {
    spinner.fail('Deployment failed');
    if (error instanceof CloudflareAPIError) {
      logger.error(`Cloudflare API Error: ${error.message}`);
    } else {
      logger.error(error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

// ============================================================================
// Status Command (shows which versions are deployed where)
// ============================================================================

export async function statusCommand(): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Status');
  logger.newline();

  const spinner = ora('Loading status...').start();

  try {
    const config = await loadConfig(cwd) as unknown as ExtendedConfig;
    const rc = getYourtmRC(cwd);
    const credentials = getCloudflareCredentials();

    if (!credentials) {
      spinner.stop();
      logger.table([
        { label: 'Container', value: config.containerId },
        { label: 'Local Version', value: rc?.version || 'not pushed' },
      ]);
      logger.newline();
      logger.warn('Cloudflare credentials not configured. Run "ytm setup".');
      return;
    }

    const client = new CloudflareClient(credentials);
    const kvNamespaceId = await findOrCreateKVNamespace(client, config.containerId);
    const branch = rc?.branch || 'main';

    // Get branch info
    const branchInfo = await getBranchInfo(client, kvNamespaceId, config.containerId, branch);
    const latestPushed = branchInfo?.head || 'none';

    // Get environment status
    const envStatus = await getEnvironmentStatus(client, kvNamespaceId, config.containerId);

    spinner.stop();

    logger.table([
      { label: 'Container', value: config.containerId },
      { label: 'Branch', value: branch },
      { label: 'Local Version', value: rc?.version || 'not synced' },
      { label: 'Latest Pushed', value: latestPushed },
    ]);
    logger.newline();

    // Show environments
    logger.info('Deployments:');
    logger.newline();

    const environments = ['staging', 'production'] as const;
    for (const env of environments) {
      const status = envStatus[env];
      if (status) {
        const icon = logger.chalk.green('●');
        const age = formatAge(status.deployedAt);
        console.log(`  ${icon} ${env.padEnd(12)} ${logger.chalk.cyan(status.version)} ${logger.chalk.gray(`(${age})`)}`);
      } else {
        const icon = logger.chalk.gray('○');
        console.log(`  ${icon} ${env.padEnd(12)} ${logger.chalk.gray('not deployed')}`);
      }
    }

    logger.newline();

    // Show recent versions
    if (branchInfo && branchInfo.versions.length > 0) {
      logger.info('Recent Versions:');
      logger.newline();

      const versions = branchInfo.versions.slice(0, 5);
      for (const v of versions) {
        const isLocal = v.id === rc?.version;
        const isStaging = v.id === envStatus.staging?.version;
        const isProduction = v.id === envStatus.production?.version;

        const markers: string[] = [];
        if (isLocal) markers.push(logger.chalk.blue('local'));
        if (isStaging) markers.push(logger.chalk.yellow('staging'));
        if (isProduction) markers.push(logger.chalk.green('production'));

        const markerStr = markers.length > 0 ? ` (${markers.join(', ')})` : '';
        const age = formatAge(v.timestamp);

        console.log(`  ${logger.chalk.cyan(v.id)}${markerStr} - ${logger.chalk.gray(age)}`);
        console.log(`    "${v.message}" by ${v.author}`);
      }
    }

    logger.newline();

  } catch (error) {
    spinner.fail('Status check failed');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// Versions Command
// ============================================================================

export async function versionsCommand(options: { env?: string; limit?: number } = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Versions');
  logger.newline();

  const spinner = ora('Loading versions...').start();

  try {
    const config = await loadConfig(cwd) as unknown as ExtendedConfig;
    const rc = getYourtmRC(cwd);
    const credentials = getCloudflareCredentials();

    if (!credentials) {
      spinner.fail('Cloudflare credentials not configured');
      process.exit(1);
    }

    const client = new CloudflareClient(credentials);
    const kvNamespaceId = await findOrCreateKVNamespace(client, config.containerId);
    const branch = rc?.branch || 'main';

    // Get branch info
    const branchInfo = await getBranchInfo(client, kvNamespaceId, config.containerId, branch);
    if (!branchInfo) {
      spinner.stop();
      logger.info('No versions found. Run "ytm push" to create your first version.');
      return;
    }

    // Get environment status
    const envStatus = await getEnvironmentStatus(client, kvNamespaceId, config.containerId);

    spinner.stop();

    const limit = options.limit || 10;
    const versions = branchInfo.versions.slice(0, limit);

    logger.info(`${config.containerId} (${branch})`);
    logger.newline();

    for (const v of versions) {
      const isStaging = v.id === envStatus.staging?.version;
      const isProduction = v.id === envStatus.production?.version;

      const markers: string[] = [];
      if (isStaging) markers.push(logger.chalk.yellow('staging'));
      if (isProduction) markers.push(logger.chalk.green('production'));

      const markerStr = markers.length > 0 ? ` [${markers.join(', ')}]` : '';
      const age = formatAge(v.timestamp);

      console.log(`${logger.chalk.cyan(v.id)}${markerStr} - ${logger.chalk.gray(age)}`);
      console.log(`  "${v.message}"`);
      console.log(`  ${logger.chalk.gray(`by ${v.author}`)}`);
      console.log();
    }

    if (branchInfo.versions.length > limit) {
      logger.info(`Showing ${limit} of ${branchInfo.versions.length} versions. Use --limit for more.`);
    }

  } catch (error) {
    spinner.fail('Failed to load versions');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// Deploy Init Command (unchanged - sets up infrastructure)
// ============================================================================

export async function deployInitCommand(options: DeployInitOptions = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Deploy Setup');
  logger.newline();

  const spinner = ora('Loading configuration...').start();

  try {
    const configPath = await findConfigFile(cwd);
    if (!configPath) {
      spinner.fail('No YourTM project found');
      logger.error('Run "ytm init" first to create a project.');
      process.exit(1);
    }

    const config = await loadConfig(cwd) as unknown as ExtendedConfig;
    spinner.stop();

    logger.info('Cloudflare Setup');
    logger.info('This will create storage for your container.');
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

    const client = new CloudflareClient({ apiToken, accountId });

    // Verify credentials
    spinner.start('Verifying Cloudflare credentials...');
    const tokenValid = await client.verifyToken();
    if (!tokenValid) {
      spinner.fail('Invalid API token');
      process.exit(1);
    }
    spinner.succeed('Credentials verified');

    // Create KV namespace
    spinner.start('Setting up storage...');
    const kvNamespaceId = await findOrCreateKVNamespace(client, config.containerId);
    spinner.succeed(`Storage ready: yourtm-${config.containerId}`);

    // Optionally deploy worker
    if (!options.skipWorker) {
      const workerName = options.workerName || `ytm-${config.containerId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

      spinner.start(`Deploying CDN worker: ${workerName}...`);

      const workerScript = generateWorkerScript({
        containerId: config.containerId,
        kvNamespaceBinding: 'YTM_KV',
      });

      await client.deployWorkerServiceWorker(workerName, workerScript, [
        { name: 'YTM_KV', type: 'kv_namespace', namespace_id: kvNamespaceId },
      ]);

      spinner.succeed(`Deployed CDN worker: ${workerName}`);
    }

    logger.newline();
    logger.success('Deploy setup complete!');
    logger.newline();
    logger.info('Next steps:');
    logger.info('  1. ytm push -m "Initial version"    # Push your code');
    logger.info('  2. ytm deploy staging               # Deploy to staging');
    logger.info('  3. ytm deploy production            # Deploy to production');

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
