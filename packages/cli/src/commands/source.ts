/**
 * YourTM Source Control Commands
 *
 * Git-like version control for YourTM containers.
 * Stores source code in R2, metadata in KV.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import { getCloudflareCredentials, CloudflareClient } from '../cloudflare/api.js';

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
  author: {
    email: string;
    name: string;
  };
  message: string;
  files: Record<string, { hash: string; size: number }>;
  stats: {
    tags: number;
    triggers: number;
    variables: number;
    zones: number;
  };
}

interface ContainerMeta {
  name: string;
  containerId: string;
  owner: string;
  created: string;
  defaultBranch: string;
  branches: string[];
  latestVersion: string;
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

// ============================================================================
// Constants
// ============================================================================

const YOURTMRC_FILE = '.yourtmrc';
const REMOTE_URL = 'https://api.yourtm.dev';

// Files/folders to exclude
const IGNORE_PATTERNS = [
  'node_modules',
  'dist',
  '.git',
  '.yourtmrc',
];

// ============================================================================
// Helper Functions
// ============================================================================

function getYourtmRC(cwd: string): YourtmRC | null {
  const rcPath = join(cwd, YOURTMRC_FILE);
  if (!existsSync(rcPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(rcPath, 'utf-8'));
  } catch {
    return null;
  }
}

function saveYourtmRC(cwd: string, rc: YourtmRC): void {
  const rcPath = join(cwd, YOURTMRC_FILE);
  writeFileSync(rcPath, JSON.stringify(rc, null, 2));
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

function getGitUserInfo(): { name: string; email: string } {
  try {
    const gitConfigPath = join(homedir(), '.gitconfig');
    if (existsSync(gitConfigPath)) {
      const content = readFileSync(gitConfigPath, 'utf-8');
      const nameMatch = content.match(/name\s*=\s*(.+)/);
      const emailMatch = content.match(/email\s*=\s*(.+)/);
      return {
        name: nameMatch?.[1]?.trim() || 'Unknown',
        email: emailMatch?.[1]?.trim() || 'unknown@local',
      };
    }
  } catch {
    // Ignore errors
  }
  return { name: 'Unknown', email: 'unknown@local' };
}

function collectSourceFiles(cwd: string): Map<string, string> {
  const files = new Map<string, string>();

  function walkDir(dir: string, baseDir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = relative(baseDir, fullPath);

      // Skip ignored patterns
      if (IGNORE_PATTERNS.some(p => relativePath.includes(p))) {
        continue;
      }

      if (entry.isDirectory()) {
        walkDir(fullPath, baseDir);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name === 'yourtm.config.ts')) {
        const content = readFileSync(fullPath, 'utf-8');
        files.set(relativePath, content);
      }
    }
  }

  // Walk yourtm directory
  const yourtmDir = join(cwd, 'yourtm');
  if (existsSync(yourtmDir)) {
    walkDir(yourtmDir, cwd);
  }

  // Include config file
  const configPath = join(cwd, 'yourtm.config.ts');
  if (existsSync(configPath)) {
    files.set('yourtm.config.ts', readFileSync(configPath, 'utf-8'));
  }

  return files;
}

function countFileTypes(files: Map<string, string>): { tags: number; triggers: number; variables: number; zones: number } {
  let tags = 0, triggers = 0, variables = 0, zones = 0;

  for (const path of files.keys()) {
    if (path.includes('/tags/')) tags++;
    else if (path.includes('/triggers/')) triggers++;
    else if (path.includes('/variables/')) variables++;
    else if (path.includes('/zones/')) zones++;
  }

  return { tags, triggers, variables, zones };
}

function getNextVersion(currentVersion: string | null): string {
  if (!currentVersion) return 'v1';
  const num = parseInt(currentVersion.slice(1), 10);
  return `v${num + 1}`;
}

// ============================================================================
// Storage Layer (R2/KV)
// ============================================================================

async function getContainerMeta(client: CloudflareClient, kvNamespaceId: string, containerId: string): Promise<ContainerMeta | null> {
  try {
    const key = `source:${containerId}:meta`;
    const value = await client.getKVValue(kvNamespaceId, key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

async function saveContainerMeta(client: CloudflareClient, kvNamespaceId: string, meta: ContainerMeta): Promise<void> {
  const key = `source:${meta.containerId}:meta`;
  await client.putKVValue(kvNamespaceId, key, JSON.stringify(meta));
}

async function getBranchInfo(client: CloudflareClient, kvNamespaceId: string, containerId: string, branch: string): Promise<BranchInfo | null> {
  try {
    const key = `source:${containerId}:branch:${branch}`;
    const value = await client.getKVValue(kvNamespaceId, key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

async function saveBranchInfo(client: CloudflareClient, kvNamespaceId: string, containerId: string, branch: string, info: BranchInfo): Promise<void> {
  const key = `source:${containerId}:branch:${branch}`;
  await client.putKVValue(kvNamespaceId, key, JSON.stringify(info));
}

async function saveVersion(
  client: CloudflareClient,
  kvNamespaceId: string,
  containerId: string,
  branch: string,
  version: string,
  manifest: VersionManifest,
  files: Map<string, string>
): Promise<void> {
  // Save manifest
  const manifestKey = `source:${containerId}:${branch}:${version}:manifest`;
  await client.putKVValue(kvNamespaceId, manifestKey, JSON.stringify(manifest));

  // Save each file
  for (const [path, content] of files) {
    const fileKey = `source:${containerId}:${branch}:${version}:file:${path}`;
    await client.putKVValue(kvNamespaceId, fileKey, content);
  }
}

async function getVersionManifest(
  client: CloudflareClient,
  kvNamespaceId: string,
  containerId: string,
  branch: string,
  version: string
): Promise<VersionManifest | null> {
  try {
    const key = `source:${containerId}:${branch}:${version}:manifest`;
    const value = await client.getKVValue(kvNamespaceId, key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

async function getVersionFiles(
  client: CloudflareClient,
  kvNamespaceId: string,
  containerId: string,
  branch: string,
  version: string,
  manifest: VersionManifest
): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  for (const path of Object.keys(manifest.files)) {
    const key = `source:${containerId}:${branch}:${version}:file:${path}`;
    const content = await client.getKVValue(kvNamespaceId, key);
    if (content) {
      files.set(path, content);
    }
  }

  return files;
}

async function findOrCreateKVNamespace(client: CloudflareClient, containerId: string): Promise<string> {
  const namespaces = await client.listKVNamespaces();
  const existing = namespaces.find(ns => ns.title === `yourtm-${containerId}`);

  if (existing) {
    return existing.id;
  }

  const newNs = await client.createKVNamespace(`yourtm-${containerId}`);
  return newNs.id;
}

// ============================================================================
// Commands
// ============================================================================

export interface PushOptions {
  message?: string;
  force?: boolean;
}

export async function pushCommand(options: PushOptions = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Push');
  logger.newline();

  const spinner = ora('Preparing push...').start();

  try {
    // Check for .yourtmrc or config
    let rc = getYourtmRC(cwd);
    let containerId: string;

    if (rc) {
      containerId = rc.containerId;
    } else {
      // Try to get from config
      const config = await loadConfig(cwd).catch(() => null);
      if (!config?.containerId) {
        throw new Error('No .yourtmrc found. Run "ytm clone" first or initialize with "ytm init".');
      }
      containerId = config.containerId;
      // Create .yourtmrc
      rc = {
        containerId,
        remote: REMOTE_URL,
        branch: 'main',
      };
    }

    // Get credentials
    const credentials = getCloudflareCredentials();
    if (!credentials) {
      throw new Error('Cloudflare credentials not configured. Run "ytm setup" first.');
    }

    const client = new CloudflareClient(credentials);

    spinner.text = 'Connecting to remote...';

    // Find or create KV namespace
    const kvNamespaceId = await findOrCreateKVNamespace(client, containerId);

    // Get current container meta
    let meta = await getContainerMeta(client, kvNamespaceId, containerId);
    const branch = rc.branch || 'main';

    // Collect local files
    spinner.text = 'Collecting source files...';
    const files = collectSourceFiles(cwd);

    if (files.size === 0) {
      throw new Error('No source files found. Make sure you have a yourtm/ directory.');
    }

    // Get branch info
    let branchInfo = await getBranchInfo(client, kvNamespaceId, containerId, branch);
    const currentVersion = branchInfo?.head || null;
    const newVersion = getNextVersion(currentVersion);

    // Build file manifest
    const fileManifest: Record<string, { hash: string; size: number }> = {};
    for (const [path, content] of files) {
      fileManifest[path] = {
        hash: hashContent(content),
        size: content.length,
      };
    }

    // Create version manifest
    const userInfo = getGitUserInfo();
    const stats = countFileTypes(files);

    const manifest: VersionManifest = {
      version: newVersion,
      parent: currentVersion,
      branch,
      timestamp: new Date().toISOString(),
      author: userInfo,
      message: options.message || `Push ${newVersion}`,
      files: fileManifest,
      stats,
    };

    // Show what we're pushing
    spinner.stop();

    logger.info(`Pushing to ${containerId} (${branch})`);
    logger.newline();

    logger.table([
      { label: 'Version', value: `${currentVersion || '(new)'} → ${newVersion}` },
      { label: 'Files', value: String(files.size) },
      { label: 'Tags', value: String(stats.tags) },
      { label: 'Triggers', value: String(stats.triggers) },
      { label: 'Variables', value: String(stats.variables) },
      { label: 'Zones', value: String(stats.zones) },
    ]);
    logger.newline();

    spinner.start('Uploading files...');

    // Save version
    await saveVersion(client, kvNamespaceId, containerId, branch, newVersion, manifest, files);

    // Update branch info
    const versionEntry = {
      id: newVersion,
      message: manifest.message,
      author: userInfo.email,
      timestamp: manifest.timestamp,
    };

    if (branchInfo) {
      branchInfo.head = newVersion;
      branchInfo.versions.unshift(versionEntry);
      // Keep last 100 versions in quick lookup
      branchInfo.versions = branchInfo.versions.slice(0, 100);
    } else {
      branchInfo = {
        head: newVersion,
        versions: [versionEntry],
      };
    }

    await saveBranchInfo(client, kvNamespaceId, containerId, branch, branchInfo);

    // Update container meta
    if (!meta) {
      meta = {
        name: containerId,
        containerId,
        owner: userInfo.email,
        created: new Date().toISOString(),
        defaultBranch: 'main',
        branches: [branch],
        latestVersion: newVersion,
      };
    } else {
      meta.latestVersion = newVersion;
      if (!meta.branches.includes(branch)) {
        meta.branches.push(branch);
      }
    }

    await saveContainerMeta(client, kvNamespaceId, meta);

    // Update local .yourtmrc
    rc.lastPush = new Date().toISOString();
    rc.version = newVersion;
    saveYourtmRC(cwd, rc);

    spinner.succeed(`Pushed ${newVersion} to ${containerId}`);
    logger.newline();
    logger.success(`${files.size} files uploaded`);

  } catch (error) {
    spinner.fail('Push failed');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export interface CloneOptions {
  branch?: string;
  version?: string;
}

export async function cloneCommand(containerId: string, options: CloneOptions = {}): Promise<void> {
  logger.header('YourTM Clone');
  logger.newline();

  const spinner = ora('Connecting to remote...').start();

  try {
    if (!containerId) {
      throw new Error('Container ID required. Usage: ytm clone <container-id>');
    }

    // Get credentials
    const credentials = getCloudflareCredentials();
    if (!credentials) {
      throw new Error('Cloudflare credentials not configured. Run "ytm setup" first.');
    }

    const client = new CloudflareClient(credentials);

    // Find KV namespace
    const namespaces = await client.listKVNamespaces();
    const namespace = namespaces.find(ns => ns.title === `yourtm-${containerId}`);

    if (!namespace) {
      throw new Error(`Container ${containerId} not found. Make sure it has been pushed at least once.`);
    }

    const kvNamespaceId = namespace.id;

    // Get container meta
    const meta = await getContainerMeta(client, kvNamespaceId, containerId);
    if (!meta) {
      throw new Error(`Container ${containerId} metadata not found.`);
    }

    const branch = options.branch || meta.defaultBranch || 'main';

    // Get branch info
    const branchInfo = await getBranchInfo(client, kvNamespaceId, containerId, branch);
    if (!branchInfo) {
      throw new Error(`Branch '${branch}' not found.`);
    }

    const version = options.version || branchInfo.head;

    spinner.text = `Fetching ${version}...`;

    // Get manifest
    const manifest = await getVersionManifest(client, kvNamespaceId, containerId, branch, version);
    if (!manifest) {
      throw new Error(`Version ${version} not found.`);
    }

    // Get files
    spinner.text = `Downloading ${Object.keys(manifest.files).length} files...`;
    const files = await getVersionFiles(client, kvNamespaceId, containerId, branch, version, manifest);

    // Create target directory
    const targetDir = join(process.cwd(), containerId.toLowerCase());

    if (existsSync(targetDir)) {
      throw new Error(`Directory ${containerId.toLowerCase()} already exists.`);
    }

    mkdirSync(targetDir, { recursive: true });

    // Write files
    spinner.text = 'Writing files...';
    for (const [path, content] of files) {
      const fullPath = join(targetDir, path);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content);
    }

    // Create .yourtmrc
    const rc: YourtmRC = {
      containerId,
      remote: REMOTE_URL,
      branch,
      version,
      lastPull: new Date().toISOString(),
    };
    saveYourtmRC(targetDir, rc);

    spinner.succeed(`Cloned ${containerId}`);
    logger.newline();

    logger.table([
      { label: 'Container', value: containerId },
      { label: 'Branch', value: branch },
      { label: 'Version', value: version },
      { label: 'Files', value: String(files.size) },
      { label: 'Directory', value: `./${containerId.toLowerCase()}` },
    ]);

    logger.newline();
    logger.info(`cd ${containerId.toLowerCase()} to get started`);

  } catch (error) {
    spinner.fail('Clone failed');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export async function pullCommand(): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Pull');
  logger.newline();

  const spinner = ora('Checking for updates...').start();

  try {
    const rc = getYourtmRC(cwd);
    if (!rc) {
      throw new Error('No .yourtmrc found. Run "ytm clone" first.');
    }

    // Get credentials
    const credentials = getCloudflareCredentials();
    if (!credentials) {
      throw new Error('Cloudflare credentials not configured. Run "ytm setup" first.');
    }

    const client = new CloudflareClient(credentials);

    // Find KV namespace
    const namespaces = await client.listKVNamespaces();
    const namespace = namespaces.find(ns => ns.title === `yourtm-${rc.containerId}`);

    if (!namespace) {
      throw new Error(`Container ${rc.containerId} not found on remote.`);
    }

    const kvNamespaceId = namespace.id;
    const branch = rc.branch || 'main';

    // Get branch info
    const branchInfo = await getBranchInfo(client, kvNamespaceId, rc.containerId, branch);
    if (!branchInfo) {
      throw new Error(`Branch '${branch}' not found on remote.`);
    }

    const remoteVersion = branchInfo.head;
    const localVersion = rc.version;

    if (remoteVersion === localVersion) {
      spinner.succeed('Already up to date');
      logger.info(`Version: ${localVersion}`);
      return;
    }

    spinner.text = `Fetching ${remoteVersion}...`;

    // Get manifest
    const manifest = await getVersionManifest(client, kvNamespaceId, rc.containerId, branch, remoteVersion);
    if (!manifest) {
      throw new Error(`Version ${remoteVersion} not found.`);
    }

    // Get files
    spinner.text = `Downloading ${Object.keys(manifest.files).length} files...`;
    const files = await getVersionFiles(client, kvNamespaceId, rc.containerId, branch, remoteVersion, manifest);

    // Write files
    spinner.text = 'Updating files...';
    let updated = 0;
    let created = 0;

    for (const [path, content] of files) {
      const fullPath = join(cwd, path);
      const existed = existsSync(fullPath);

      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content);

      if (existed) updated++;
      else created++;
    }

    // Update .yourtmrc
    rc.version = remoteVersion;
    rc.lastPull = new Date().toISOString();
    saveYourtmRC(cwd, rc);

    spinner.succeed(`Updated to ${remoteVersion}`);
    logger.newline();

    logger.table([
      { label: 'Previous', value: localVersion || '(none)' },
      { label: 'Current', value: remoteVersion },
      { label: 'Updated', value: String(updated) },
      { label: 'Created', value: String(created) },
    ]);

  } catch (error) {
    spinner.fail('Pull failed');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export interface LogOptions {
  limit?: number;
}

export async function logCommand(options: LogOptions = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Log');
  logger.newline();

  const spinner = ora('Fetching history...').start();

  try {
    const rc = getYourtmRC(cwd);
    if (!rc) {
      throw new Error('No .yourtmrc found. Run "ytm clone" first.');
    }

    // Get credentials
    const credentials = getCloudflareCredentials();
    if (!credentials) {
      throw new Error('Cloudflare credentials not configured. Run "ytm setup" first.');
    }

    const client = new CloudflareClient(credentials);

    // Find KV namespace
    const namespaces = await client.listKVNamespaces();
    const namespace = namespaces.find(ns => ns.title === `yourtm-${rc.containerId}`);

    if (!namespace) {
      throw new Error(`Container ${rc.containerId} not found on remote.`);
    }

    const kvNamespaceId = namespace.id;
    const branch = rc.branch || 'main';

    // Get branch info
    const branchInfo = await getBranchInfo(client, kvNamespaceId, rc.containerId, branch);
    if (!branchInfo) {
      throw new Error(`Branch '${branch}' not found.`);
    }

    spinner.stop();

    const limit = options.limit || 10;
    const versions = branchInfo.versions.slice(0, limit);

    logger.info(`${rc.containerId} (${branch})`);
    logger.newline();

    for (const v of versions) {
      const isCurrent = v.id === rc.version;
      const marker = isCurrent ? logger.chalk.green('*') : ' ';
      const versionLabel = isCurrent ? logger.chalk.green(v.id) : logger.chalk.yellow(v.id);

      const date = new Date(v.timestamp);
      const relativeTime = getRelativeTime(date);

      console.log(`${marker} ${versionLabel} - ${logger.chalk.gray(relativeTime)}`);
      console.log(`    "${v.message}"`);
      console.log(`    ${logger.chalk.gray(`by ${v.author}`)}`);
      console.log();
    }

    if (branchInfo.versions.length > limit) {
      logger.info(`Showing ${limit} of ${branchInfo.versions.length} versions. Use --limit for more.`);
    }

  } catch (error) {
    spinner.fail('Log failed');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}

// ============================================================================
// Token Commands (for sharing access)
// ============================================================================

export interface LoginOptions {
  token?: string;
}

export async function loginCommand(token?: string): Promise<void> {
  logger.header('YourTM Login');
  logger.newline();

  if (!token) {
    logger.error('Token required. Usage: ytm login <token>');
    logger.info('Get a token from your YourTM dashboard or from someone sharing access.');
    process.exit(1);
  }

  // For now, we're using Cloudflare credentials directly
  // In the future, this would validate against YourTM's auth service
  logger.warn('Token-based login not yet implemented.');
  logger.info('Currently using Cloudflare credentials from ~/.yourtm/credentials.json');
  logger.info('Run "ytm setup" to configure credentials.');
}
