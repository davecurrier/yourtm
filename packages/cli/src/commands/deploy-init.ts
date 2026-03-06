/**
 * ytm deploy init - Cloudflare infrastructure setup command
 *
 * This command provisions Cloudflare infrastructure for YourTM:
 * - Creates R2 bucket for static bundle storage (CDN-cached)
 * - Optionally creates KV namespace for metadata
 * - Optionally deploys a Cloudflare Worker for API endpoints
 * - Updates yourtm.config.ts with deployment settings
 *
 * Architecture (R2-first):
 * - Static bundles served from R2 public bucket → Cloudflare CDN (fast, cheap)
 * - Worker only for API endpoints: telemetry, preview mode (reduces invocations)
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import prompts from 'prompts';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { loadConfig, findConfigFile } from '../utils/config.js';
import {
  CloudflareClient,
  deployWorker,
  listKVNamespaces,
  createKVNamespace,
  getWorkerStatus,
  type CloudflareCredentials,
  type DeployResult,
} from '../cloudflare/index.js';

// Credentials file location
const CREDENTIALS_DIR = join(homedir(), '.yourtm');
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, 'credentials.json');

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

export interface DeployInitOptions {
  yes?: boolean;
  accountId?: string;
  apiToken?: string;
  workerName?: string;
  environment?: 'staging' | 'production' | 'both';
  skipWorker?: boolean;
  saveCredentials?: boolean;
  /** Use legacy KV-only mode (not recommended) */
  legacyKvMode?: boolean;
  /** Custom R2 bucket name */
  r2BucketName?: string;
  /** Custom domain for R2 bucket (requires zone in Cloudflare) */
  r2CustomDomain?: string;
}

export async function deployInitCommand(options: DeployInitOptions = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Cloudflare Setup');
  logger.newline();

  // Check for existing config
  const configPath = await findConfigFile(cwd);
  if (!configPath) {
    logger.error('No yourtm.config.ts found. Run "ytm init" first to create a project.');
    process.exit(1);
  }

  const spinner = ora('Loading configuration...').start();

  let config;
  try {
    config = await loadConfig(cwd);
    spinner.succeed('Configuration loaded');
  } catch (error) {
    spinner.fail('Failed to load configuration');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  logger.newline();
  logger.table([
    { label: 'Container ID', value: config.containerId },
    { label: 'Container Name', value: config.containerName || 'Unnamed' },
  ]);
  logger.newline();

  // Step 1: Get Cloudflare credentials
  const credentials = await getCredentials(options);

  // Step 2: Validate credentials
  spinner.start('Validating API token...');

  const validation = await validateApiToken(credentials);
  if (!validation.valid) {
    spinner.fail('API token validation failed');
    logger.error(validation.error || 'Invalid API token');
    logger.newline();
    logger.info('Make sure your API token has these permissions:');
    console.log('  - Account > Workers KV Storage > Edit');
    console.log('  - Account > Workers Scripts > Edit');
    logger.newline();
    process.exit(1);
  }

  spinner.succeed('API token validated');

  // Step 3: Optionally save credentials
  if (!options.yes && options.saveCredentials === undefined) {
    const storedCreds = await loadStoredCredentials();
    if (!storedCreds) {
      const { save } = await prompts({
        type: 'confirm',
        name: 'save',
        message: 'Save credentials to ~/.yourtm/credentials.json for future use?',
        initial: true,
      });

      if (save) {
        await saveCredentials(credentials);
        logger.success('Credentials saved');
      }
    }
  } else if (options.saveCredentials) {
    await saveCredentials(credentials);
    logger.success('Credentials saved');
  }

  // Step 4: Select environment(s)
  const environment = await selectEnvironment(options);

  // Step 5: Select storage mode
  let useR2 = !options.legacyKvMode;

  if (!options.yes && !options.legacyKvMode) {
    const { storageMode } = await prompts({
      type: 'select',
      name: 'storageMode',
      message: 'Storage mode for tag bundles:',
      choices: [
        {
          title: 'R2 Bucket (Recommended)',
          value: 'r2',
          description: 'Fast CDN delivery, no Worker invocation for static files',
        },
        {
          title: 'KV Namespace (Legacy)',
          value: 'kv',
          description: 'Worker serves all requests (higher cost at scale)',
        },
      ],
      initial: 0,
    });
    useR2 = storageMode === 'r2';
  }

  // Step 6: Create storage (R2 bucket or KV namespace)
  const environments = environment === 'both' ? ['staging', 'production'] : [environment];
  const client = new CloudflareClient(credentials);

  // R2 bucket info
  let r2BucketName: string | undefined;
  let r2PublicUrl: string | undefined;

  // KV namespace info (for legacy mode or metadata)
  const namespaces: Record<string, { id: string; name: string }> = {};

  if (useR2) {
    // Create R2 bucket for static bundles
    r2BucketName = options.r2BucketName || `ytm-${config.containerId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;

    spinner.start(`Creating R2 bucket "${r2BucketName}"...`);

    try {
      // Check if bucket already exists
      const existingBucket = await client.getR2Bucket(r2BucketName);

      if (existingBucket) {
        spinner.succeed(`R2 bucket "${r2BucketName}" already exists`);
      } else {
        await client.createR2Bucket(r2BucketName);
        spinner.succeed(`Created R2 bucket "${r2BucketName}"`);
      }

      // Enable public access
      spinner.start('Enabling public access for R2 bucket...');

      if (options.r2CustomDomain) {
        // Custom domain requires zone setup - show instructions
        spinner.stop();
        logger.info('To use a custom domain, you need to:');
        logger.info('  1. Add a CNAME record pointing to your R2 bucket');
        logger.info('  2. Configure the domain in Cloudflare dashboard');
        logger.newline();
        r2PublicUrl = `https://${options.r2CustomDomain}`;
      } else {
        // Use r2.dev public URL
        try {
          const publicAccess = await client.enableR2PublicAccess(r2BucketName, { useR2Dev: true });
          r2PublicUrl = publicAccess.publicUrl;
          spinner.succeed(`Public access enabled: ${r2PublicUrl}`);
        } catch (error) {
          spinner.warn('Could not enable public access automatically');
          // Construct expected URL
          r2PublicUrl = `https://pub-${credentials.accountId.slice(0, 8)}.r2.dev/${r2BucketName}`;
          logger.info(`Expected public URL: ${r2PublicUrl}`);
          logger.info('You may need to enable public access in Cloudflare dashboard.');
        }
      }
    } catch (error) {
      spinner.fail('Failed to create R2 bucket');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  } else {
    // Legacy: Create KV namespaces
    for (const env of environments) {
      const namespaceName = generateKVNamespaceName(config.containerId, env);

      spinner.start(`Creating KV namespace for ${env}...`);

      try {
        // Check if namespace already exists
        const existingResult = await listKVNamespaces(credentials);
        if (!existingResult.success) {
          throw new Error(existingResult.error || 'Failed to list KV namespaces');
        }

        const existing = existingResult.namespaces?.find(ns => ns.title === namespaceName);

        if (existing) {
          spinner.succeed(`KV namespace "${namespaceName}" already exists`);
          namespaces[env] = { id: existing.id, name: namespaceName };
        } else {
          const createResult = await createKVNamespace(credentials, namespaceName);
          if (!createResult.success || !createResult.namespaceId) {
            throw new Error(createResult.error || 'Failed to create KV namespace');
          }
          spinner.succeed(`Created KV namespace "${namespaceName}"`);
          namespaces[env] = { id: createResult.namespaceId, name: namespaceName };
        }
      } catch (error) {
        spinner.fail(`Failed to create KV namespace for ${env}`);
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }
  }

  // Step 7: Deploy Worker (unless skipped)
  // In R2 mode: Worker is optional (only needed for telemetry/preview API)
  // In KV mode: Worker is required (serves all bundles)
  let deployResult: DeployResult | undefined;
  let workerUrl: string | undefined;

  const shouldDeployWorker = !options.skipWorker && (!useR2 || !options.yes);

  // In R2 mode, ask if they want the API worker
  if (useR2 && !options.skipWorker && !options.yes) {
    const { deployApiWorker } = await prompts({
      type: 'confirm',
      name: 'deployApiWorker',
      message: 'Deploy API worker for telemetry and preview mode? (optional)',
      initial: false,
    });

    if (!deployApiWorker) {
      logger.info('Skipping worker deployment. Bundles will be served directly from R2 CDN.');
    } else {
      // Continue with worker deployment
    }
  }

  if (shouldDeployWorker || !useR2) {
    const workerName = options.workerName || generateWorkerName(config.containerId);
    const primaryEnv = environments.includes('production') ? 'production' : environments[0];
    const primaryNamespaceId = namespaces[primaryEnv]?.id;

    // Only deploy if we have KV (legacy mode) or user wants API worker
    if (!useR2 || shouldDeployWorker) {
      spinner.start('Checking for existing worker...');

      // Check if worker already exists
      const existingWorker = await getWorkerStatus(credentials, workerName);

      if (existingWorker.success && existingWorker.exists) {
        spinner.info(`Worker "${workerName}" already exists`);

        if (!options.yes) {
          const { overwrite } = await prompts({
            type: 'confirm',
            name: 'overwrite',
            message: 'Worker already exists. Update it with new configuration?',
            initial: true,
          });

          if (!overwrite) {
            logger.info('Skipping worker deployment');
            workerUrl = await getWorkerUrl(credentials, workerName);
            deployResult = {
              success: true,
              workerUrl,
              kvNamespaceId: primaryNamespaceId,
            };
          }
        }
      }

      if (!deployResult && primaryNamespaceId) {
        spinner.start('Deploying Cloudflare Worker...');

        try {
          deployResult = await deployWorker(credentials, {
            containerId: config.containerId,
            workerName,
            kvNamespaceId: primaryNamespaceId,
            enableTelemetry: true,
            corsOrigins: ['*'],
            debugMode: false,
          });

          if (!deployResult.success) {
            throw new Error(deployResult.error || 'Failed to deploy worker');
          }

          workerUrl = deployResult.workerUrl;
          spinner.succeed(`Deployed worker to ${workerUrl || workerName}`);
        } catch (error) {
          spinner.fail('Failed to deploy worker');
          logger.error(error instanceof Error ? error.message : String(error));
          logger.newline();
          if (useR2) {
            logger.info('Worker is optional in R2 mode. Bundles will still be served from CDN.');
          } else {
            logger.info('You can deploy the worker manually later, or run this command again.');
            logger.info('The KV namespaces have been created successfully.');
          }
        }
      }
    }
  }

  // Step 8: Update config file
  spinner.start('Updating yourtm.config.ts...');

  try {
    const primaryEnv = environments.includes('production') ? 'production' : environments[0];

    await updateConfigFile(configPath, {
      accountId: credentials.accountId,
      // R2 config
      r2BucketName: useR2 ? r2BucketName : undefined,
      r2PublicUrl: useR2 ? r2PublicUrl : undefined,
      // KV config (legacy or for metadata)
      kvNamespaceId: namespaces[primaryEnv]?.id,
      workerUrl: workerUrl,
      environment: primaryEnv,
    });

    spinner.succeed('Updated yourtm.config.ts');
  } catch (error) {
    spinner.fail('Failed to update config file');
    logger.warn('You may need to update yourtm.config.ts manually.');
    logger.debug(error instanceof Error ? error.message : String(error));
  }

  // Step 9: Show summary and next steps
  logger.newline();
  logger.divider();
  logger.newline();
  logger.success('Cloudflare setup complete!');
  logger.newline();

  // Show created resources
  logger.info('Created resources:');
  logger.newline();

  if (useR2 && r2BucketName) {
    console.log(`  R2 Bucket: ${logger.chalk.cyan(r2BucketName)}`);
    if (r2PublicUrl) {
      console.log(`    Public URL: ${logger.chalk.cyan(r2PublicUrl)}`);
    }
    logger.newline();
  }

  for (const [env, ns] of Object.entries(namespaces)) {
    console.log(`  KV Namespace (${env}): ${logger.chalk.cyan(ns.name)}`);
    console.log(`    ID: ${logger.chalk.gray(ns.id)}`);
  }

  if (workerUrl) {
    logger.newline();
    const workerName = generateWorkerName(config.containerId);
    console.log(`  Worker: ${logger.chalk.cyan(workerName)}`);
    console.log(`    URL: ${logger.chalk.cyan(workerUrl)}`);
  }

  logger.newline();
  logger.divider();
  logger.newline();

  // Show script tag
  if (useR2 && r2PublicUrl) {
    logger.info('Add this to your site:');
    logger.newline();
    console.log(
      logger.chalk.cyan(
        `  <script src="${r2PublicUrl}/latest/core.js" async></script>`
      )
    );
    logger.newline();

    // Show architecture info
    logger.info('Architecture:');
    console.log('  • Static bundles served from R2 CDN (fast, low cost)');
    console.log('  • No Worker invocations for bundle requests');
    if (workerUrl) {
      console.log('  • Worker available for API endpoints (telemetry, preview)');
    }
    logger.newline();
  } else if (workerUrl) {
    logger.info('Add this to your site:');
    logger.newline();
    console.log(
      logger.chalk.cyan(
        `  <script src="${workerUrl}/_ytm/runtime.js" async></script>`
      )
    );
    logger.newline();
  }

  // Show next steps
  logger.info('Next steps:');
  logger.newline();
  console.log(`  1. Run ${logger.chalk.cyan('ytm build')} to compile your tags`);
  console.log(`  2. Run ${logger.chalk.cyan('ytm deploy')} to publish to Cloudflare`);
  if (environments.length > 1) {
    console.log(`  3. Use ${logger.chalk.cyan('ytm deploy --env staging')} or ${logger.chalk.cyan('--env production')}`);
  }
  logger.newline();

  // Show environment variables for CI/CD
  logger.info('For CI/CD, set these environment variables:');
  logger.newline();
  console.log(`  CLOUDFLARE_ACCOUNT_ID=${logger.chalk.gray(credentials.accountId)}`);
  console.log(`  CLOUDFLARE_API_TOKEN=${logger.chalk.gray('(your API token)')}`);
  if (useR2 && r2BucketName) {
    console.log(`  CLOUDFLARE_R2_BUCKET=${logger.chalk.gray(r2BucketName)}`);
    if (r2PublicUrl) {
      console.log(`  CLOUDFLARE_R2_PUBLIC_URL=${logger.chalk.gray(r2PublicUrl)}`);
    }
  }
  logger.newline();
}

// ============================================================================
// Credential Management
// ============================================================================

/**
 * Load stored credentials from ~/.yourtm/credentials.json
 */
async function loadStoredCredentials(): Promise<CloudflareCredentials | null> {
  try {
    if (!existsSync(CREDENTIALS_FILE)) {
      return null;
    }
    const content = await readFile(CREDENTIALS_FILE, 'utf-8');
    const data = JSON.parse(content);
    if (data.accountId && data.apiToken) {
      return {
        accountId: data.accountId,
        apiToken: data.apiToken,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save credentials to ~/.yourtm/credentials.json
 */
async function saveCredentials(credentials: CloudflareCredentials): Promise<void> {
  await mkdir(CREDENTIALS_DIR, { recursive: true });
  await writeFile(
    CREDENTIALS_FILE,
    JSON.stringify(credentials, null, 2),
    { mode: 0o600 } // Read/write for owner only
  );
}

/**
 * Get credentials from environment variables
 */
function getEnvCredentials(): CloudflareCredentials | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (accountId && apiToken) {
    return { accountId, apiToken };
  }
  return null;
}

/**
 * Get Cloudflare credentials from various sources
 */
async function getCredentials(options: DeployInitOptions): Promise<CloudflareCredentials> {
  // Priority 1: Command line options
  if (options.accountId && options.apiToken) {
    return {
      accountId: options.accountId,
      apiToken: options.apiToken,
    };
  }

  // Priority 2: Environment variables
  const envCreds = getEnvCredentials();
  if (envCreds) {
    logger.info('Using credentials from environment variables');
    return envCreds;
  }

  // Priority 3: Stored credentials
  const storedCreds = await loadStoredCredentials();
  if (storedCreds) {
    logger.info('Using stored credentials from ~/.yourtm/credentials.json');

    if (!options.yes) {
      const { useStored } = await prompts({
        type: 'confirm',
        name: 'useStored',
        message: `Use stored credentials for account ${storedCreds.accountId}?`,
        initial: true,
      });

      if (useStored) {
        return storedCreds;
      }
    } else {
      return storedCreds;
    }
  }

  // Priority 4: Interactive prompt
  logger.info('Enter your Cloudflare credentials:');
  logger.newline();

  const response = await prompts([
    {
      type: 'text',
      name: 'accountId',
      message: 'Cloudflare Account ID',
      hint: 'Find at: https://dash.cloudflare.com -> Overview -> Account ID',
      validate: (value: string) => {
        if (!value || value.trim().length === 0) {
          return 'Account ID is required';
        }
        // Cloudflare account IDs are 32 character hex strings
        if (!/^[a-f0-9]{32}$/i.test(value.trim())) {
          return 'Account ID should be a 32-character hex string';
        }
        return true;
      },
    },
    {
      type: 'password',
      name: 'apiToken',
      message: 'Cloudflare API Token',
      hint: 'Create at: https://dash.cloudflare.com/profile/api-tokens',
      validate: (value: string) => {
        if (!value || value.trim().length === 0) {
          return 'API Token is required';
        }
        return true;
      },
    },
  ]);

  if (!response.accountId || !response.apiToken) {
    logger.error('Credentials are required. Exiting.');
    process.exit(1);
  }

  logger.newline();
  logger.info('Required API Token permissions:');
  console.log('  - Account > Workers KV Storage > Edit');
  console.log('  - Account > Workers Scripts > Edit');
  logger.newline();

  return {
    accountId: response.accountId.trim(),
    apiToken: response.apiToken.trim(),
  };
}

// ============================================================================
// API Token Validation
// ============================================================================

/**
 * Validate that the API token has the required permissions
 */
async function validateApiToken(
  credentials: CloudflareCredentials
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Verify token
    const verifyResponse = await fetch(`${CF_API_BASE}/user/tokens/verify`, {
      headers: {
        Authorization: `Bearer ${credentials.apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!verifyResponse.ok) {
      const error = await verifyResponse.json().catch(() => ({}));
      return {
        valid: false,
        error: (error as { errors?: Array<{ message: string }> }).errors?.[0]?.message || 'Invalid API token',
      };
    }

    const verifyData = await verifyResponse.json() as {
      success: boolean;
      result: { status: string };
    };
    if (!verifyData.success || verifyData.result?.status !== 'active') {
      return {
        valid: false,
        error: 'API token is not active',
      };
    }

    // Check account access
    const accountResponse = await fetch(
      `${CF_API_BASE}/accounts/${credentials.accountId}`,
      {
        headers: {
          Authorization: `Bearer ${credentials.apiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!accountResponse.ok) {
      return {
        valid: false,
        error: 'Cannot access the specified Cloudflare account. Verify the Account ID is correct.',
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Failed to validate API token: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================================================
// Environment Selection
// ============================================================================

/**
 * Select which environment(s) to set up
 */
async function selectEnvironment(
  options: DeployInitOptions
): Promise<'staging' | 'production' | 'both'> {
  if (options.environment) {
    return options.environment;
  }

  if (options.yes) {
    return 'production';
  }

  const response = await prompts({
    type: 'select',
    name: 'environment',
    message: 'Which environment(s) to set up?',
    choices: [
      { title: 'Production only', value: 'production' },
      { title: 'Staging only', value: 'staging' },
      { title: 'Both (staging + production)', value: 'both' },
    ],
    initial: 0,
  });

  if (!response.environment) {
    logger.error('Environment selection is required. Exiting.');
    process.exit(1);
  }

  return response.environment;
}

// ============================================================================
// Config File Updates
// ============================================================================

/**
 * Update yourtm.config.ts with Cloudflare settings
 */
async function updateConfigFile(
  configPath: string,
  options: {
    accountId: string;
    r2BucketName?: string;
    r2PublicUrl?: string;
    kvNamespaceId?: string;
    workerUrl?: string;
    environment: string;
  }
): Promise<void> {
  const content = await readFile(configPath, 'utf-8');

  // Build the cloudflare config object
  const configLines: string[] = [
    `    accountId: '${options.accountId}',`,
  ];

  // R2 config (new, recommended)
  if (options.r2BucketName) {
    configLines.push(`    r2BucketName: '${options.r2BucketName}',`);
  }
  if (options.r2PublicUrl) {
    configLines.push(`    r2PublicUrl: '${options.r2PublicUrl}',`);
  }

  // KV config (legacy or for metadata)
  if (options.kvNamespaceId) {
    configLines.push(`    kvNamespaceId: '${options.kvNamespaceId}',`);
  }

  // Worker URL (optional)
  if (options.workerUrl) {
    configLines.push(`    workerUrl: '${options.workerUrl}',`);
  }

  const cloudflareConfigBlock = `cloudflare: {\n${configLines.join('\n')}\n  }`;

  // Check if cloudflare config already exists
  if (content.includes('cloudflare:')) {
    // Update existing cloudflare config
    const updatedContent = content.replace(
      /cloudflare:\s*\{[^}]*\}/s,
      cloudflareConfigBlock
    );
    await writeFile(configPath, updatedContent);
  } else {
    // Add cloudflare config before the last closing brace
    const insertionPoint = content.lastIndexOf('}');
    if (insertionPoint === -1) {
      throw new Error('Invalid config file format');
    }

    const cloudflareConfig = `
  // Cloudflare deployment settings
  ${cloudflareConfigBlock},
`;

    // Check if there's already content that needs a comma
    const beforeInsertion = content.slice(0, insertionPoint).trimEnd();
    const needsComma = !beforeInsertion.endsWith(',') && !beforeInsertion.endsWith('{');

    const updatedContent =
      content.slice(0, insertionPoint) +
      (needsComma ? ',' : '') +
      cloudflareConfig +
      content.slice(insertionPoint);

    await writeFile(configPath, updatedContent);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a valid worker name from container ID
 */
function generateWorkerName(containerId: string): string {
  // Worker names must be lowercase and can only contain alphanumeric characters and dashes
  return `yourtm-${containerId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
}

/**
 * Generate KV namespace name
 */
function generateKVNamespaceName(containerId: string, environment: string): string {
  return `YourTM - ${containerId} (${environment})`;
}

/**
 * Get worker URL from subdomain
 */
async function getWorkerUrl(
  credentials: CloudflareCredentials,
  workerName: string
): Promise<string | undefined> {
  try {
    const response = await fetch(
      `${CF_API_BASE}/accounts/${credentials.accountId}/workers/subdomain`,
      {
        headers: {
          Authorization: `Bearer ${credentials.apiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      const data = await response.json() as { result?: { subdomain: string } };
      if (data.result?.subdomain) {
        return `https://${workerName}.${data.result.subdomain}.workers.dev`;
      }
    }
  } catch {
    // Ignore errors, return undefined
  }
  return undefined;
}
