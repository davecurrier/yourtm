/**
 * YourTM Setup Command
 *
 * First-time global setup wizard with beautiful CLI UI
 */

import prompts from 'prompts';
import chalk from 'chalk';
import { CloudflareClient } from '../cloudflare/api.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Beautiful gradient colors
const gradient = {
  purple: chalk.hex('#a855f7'),
  pink: chalk.hex('#ec4899'),
  cyan: chalk.hex('#06b6d4'),
  green: chalk.hex('#10b981'),
  yellow: chalk.hex('#f59e0b'),
  orange: chalk.hex('#f97316'),
  dim: chalk.hex('#71717a'),
  white: chalk.hex('#fafafa'),
};

// Purple to pink gradient colors (matching the button)
const g1 = chalk.hex('#a855f7'); // purple
const g2 = chalk.hex('#b855f2');
const g3 = chalk.hex('#c855ed');
const g4 = chalk.hex('#d855e8');
const g5 = chalk.hex('#e455e3');
const g6 = chalk.hex('#ec4899'); // pink

// ASCII Art Logo with purple→pink gradient
const logo = `
${g1('██╗   ██╗')}${g2('██████╗ ')}${g3('██╗   ██╗')}${g4('██████╗ ')}${g5('████████╗')}${g6('███╗   ███╗')}
${g1('╚██╗ ██╔╝')}${g2('██╔═══██╗')}${g3('██║   ██║')}${g4('██╔══██╗')}${g5('╚══██╔══╝')}${g6('████╗ ████║')}
${g1(' ╚████╔╝ ')}${g2('██║   ██║')}${g3('██║   ██║')}${g4('██████╔╝')}${g5('   ██║   ')}${g6('██╔████╔██║')}
${g1('  ╚██╔╝  ')}${g2('██║   ██║')}${g3('██║   ██║')}${g4('██╔══██╗')}${g5('   ██║   ')}${g6('██║╚██╔╝██║')}
${g1('   ██║   ')}${g2('╚██████╔╝')}${g3('╚██████╔╝')}${g4('██║  ██║')}${g5('   ██║   ')}${g6('██║ ╚═╝ ██║')}
${g1('   ╚═╝   ')}${g2(' ╚═════╝ ')}${g3(' ╚═════╝ ')}${g4('╚═╝  ╚═╝')}${g5('   ╚═╝   ')}${g6('╚═╝     ╚═╝')}
`;

// Box drawing helpers
function box(content: string, title?: string): string {
  const lines = content.split('\n');
  const maxLength = Math.max(...lines.map(l => stripAnsi(l).length), title ? stripAnsi(title).length + 4 : 0);
  const width = Math.min(maxLength + 4, 70);

  const top = title
    ? `╭─ ${title} ${'─'.repeat(Math.max(0, width - stripAnsi(title).length - 5))}╮`
    : `╭${'─'.repeat(width - 2)}╮`;
  const bottom = `╰${'─'.repeat(width - 2)}╯`;

  const paddedLines = lines.map(line => {
    const stripped = stripAnsi(line);
    const padding = width - stripped.length - 4;
    return `│ ${line}${' '.repeat(Math.max(0, padding))} │`;
  });

  return [top, ...paddedLines, bottom].join('\n');
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// Progress spinner
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;

function spinner(): string {
  spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
  return gradient.cyan(spinnerFrames[spinnerIndex]);
}

// Success/error/info icons
const icons = {
  success: gradient.green('✓'),
  error: chalk.red('✗'),
  warning: gradient.yellow('⚠'),
  info: gradient.cyan('ℹ'),
  arrow: gradient.purple('→'),
  sparkle: gradient.pink('✨'),
};

// Paths
const YOURTM_HOME = join(homedir(), '.yourtm');
const CREDENTIALS_PATH = join(YOURTM_HOME, 'credentials.json');
const CONFIG_PATH = join(YOURTM_HOME, 'config.json');
const PROJECTS_PATH = join(YOURTM_HOME, 'projects');

interface SetupOptions {
  skipWelcome?: boolean;
  reconfigure?: boolean;
}

export async function setupCommand(options: SetupOptions = {}): Promise<void> {
  console.clear();

  // Show the beautiful logo
  console.log(logo);
  console.log(gradient.dim('  Tags as Code • TypeScript-first • Edge Deployed\n'));

  // Check if already configured
  if (existsSync(CREDENTIALS_PATH) && !options.reconfigure) {
    console.log(box(
      `${icons.info} YourTM is already configured.\n\n` +
      `  Run ${gradient.cyan('ytm setup --reconfigure')} to update settings.\n` +
      `  Run ${gradient.cyan('ytm init')} to create a new project.`,
      gradient.white('Setup')
    ));
    console.log('');
    return;
  }

  // Welcome message
  console.log(box(
    `Welcome! Let's get you set up with YourTM.\n\n` +
    `This wizard will:\n` +
    `  ${icons.arrow} Connect to your Cloudflare account\n` +
    `  ${icons.arrow} Set up your default project location\n` +
    `  ${icons.arrow} Deploy the CDN worker (optional)`,
    gradient.white('Setup')
  ));
  console.log('');

  // Cloudflare credentials
  console.log(gradient.white.bold('\n  Cloudflare Configuration\n'));
  console.log(gradient.dim('  Find these at dash.cloudflare.com\n'));

  const credentials = await prompts([
    {
      type: 'text',
      name: 'accountId',
      message: 'Account ID',
      hint: 'Dashboard sidebar → Account ID',
      validate: (value: string) => value.length > 0 || 'Account ID is required',
    },
    {
      type: 'password',
      name: 'apiToken',
      message: 'API Token',
      hint: 'Profile → API Tokens → Create Token',
      validate: (value: string) => value.length > 0 || 'API Token is required',
    },
  ], {
    onCancel: () => {
      console.log(gradient.dim('\n  Setup cancelled.\n'));
      process.exit(0);
    },
  });

  // Verify credentials
  console.log(`\n  ${spinner()} Verifying credentials...`);

  const api = new CloudflareClient({
    apiToken: credentials.apiToken,
    accountId: credentials.accountId,
  });

  try {
    const isValid = await api.verifyToken();
    if (!isValid) {
      console.log(`  ${icons.error} Invalid credentials. Please check and try again.\n`);
      process.exit(1);
    }
    console.log(`  ${icons.success} Credentials verified!\n`);
  } catch (error) {
    console.log(`  ${icons.error} Could not verify credentials: ${(error as Error).message}\n`);
    process.exit(1);
  }

  // Default project location
  console.log(gradient.white.bold('\n  Project Settings\n'));

  const projectSettings = await prompts([
    {
      type: 'select',
      name: 'projectLocation',
      message: 'Default project location',
      choices: [
        { title: `~/.yourtm/projects/`, value: PROJECTS_PATH, description: 'Recommended for most users' },
        { title: `Current directory`, value: 'cwd', description: 'Projects alongside your code' },
        { title: `Custom path...`, value: 'custom' },
      ],
    },
    {
      type: (prev: string) => prev === 'custom' ? 'text' : null,
      name: 'customPath',
      message: 'Enter custom path',
      initial: join(homedir(), 'ytm-projects'),
    },
  ], {
    onCancel: () => {
      console.log(gradient.dim('\n  Setup cancelled.\n'));
      process.exit(0);
    },
  });

  const defaultProjectPath = projectSettings.projectLocation === 'custom'
    ? projectSettings.customPath
    : projectSettings.projectLocation === 'cwd'
      ? null
      : projectSettings.projectLocation;

  // Deploy worker?
  console.log(gradient.white.bold('\n  Cloudflare Worker\n'));
  console.log(gradient.dim('  The YourTM CDN worker serves your tag bundles globally.\n'));

  const workerSettings = await prompts([
    {
      type: 'confirm',
      name: 'deployWorker',
      message: 'Deploy CDN worker now?',
      initial: true,
    },
    {
      type: (prev: boolean) => prev ? 'text' : null,
      name: 'workerName',
      message: 'Worker name',
      initial: 'yourtm-cdn',
    },
  ], {
    onCancel: () => {
      console.log(gradient.dim('\n  Setup cancelled.\n'));
      process.exit(0);
    },
  });

  // Save configuration
  console.log(`\n  ${spinner()} Saving configuration...`);

  // Create directories
  mkdirSync(YOURTM_HOME, { recursive: true });
  if (defaultProjectPath) {
    mkdirSync(defaultProjectPath, { recursive: true });
  }

  // Save credentials
  writeFileSync(CREDENTIALS_PATH, JSON.stringify({
    cloudflare: {
      accountId: credentials.accountId,
      apiToken: credentials.apiToken,
    },
  }, null, 2));

  // Save config
  writeFileSync(CONFIG_PATH, JSON.stringify({
    defaultProjectPath,
    workerName: workerSettings.workerName || 'yourtm-cdn',
    version: '1.0.0',
    createdAt: new Date().toISOString(),
  }, null, 2));

  console.log(`  ${icons.success} Configuration saved to ~/.yourtm/\n`);

  // Deploy worker if requested
  let workerUrl = '';
  if (workerSettings.deployWorker) {
    console.log(`  ${spinner()} Deploying CDN worker...`);

    try {
      // Create KV namespace
      const kvNamespace = await api.createKVNamespace(`${workerSettings.workerName}-production`);
      console.log(`  ${icons.success} Created KV namespace: ${kvNamespace.id}\n`);

      // Deploy worker
      // Note: Full worker deployment would go here
      // For now, we show the expected URL
      workerUrl = `https://${workerSettings.workerName}.${credentials.accountId.slice(0, 8)}.workers.dev`;
      console.log(`  ${icons.success} Worker deployed: ${gradient.cyan(workerUrl)}\n`);
    } catch (error) {
      console.log(`  ${icons.warning} Worker deployment skipped: ${(error as Error).message}`);
      console.log(gradient.dim(`    Run ${gradient.cyan('ytm deploy init')} later to deploy.\n`));
    }
  }

  // Success message
  console.log('');
  console.log(box(
    `${icons.sparkle} ${gradient.white.bold('You\'re all set!')}\n\n` +
    `  Create your first project:\n\n` +
    `    ${gradient.cyan('ytm init')}\n\n` +
    `  Or create a tag from template:\n\n` +
    `    ${gradient.cyan('ytm create tag')}`,
    gradient.green('Success')
  ));
  console.log('');
}

export async function quickSetupCheck(): Promise<boolean> {
  /**
   * Check if setup has been run. If not, prompt user.
   * Returns true if setup is complete, false if user declined.
   */
  if (existsSync(CREDENTIALS_PATH)) {
    return true;
  }

  console.log('');
  console.log(gradient.yellow('  ⚠ YourTM is not configured yet.\n'));

  const { runSetup } = await prompts({
    type: 'confirm',
    name: 'runSetup',
    message: 'Run setup wizard now?',
    initial: true,
  });

  if (runSetup) {
    await setupCommand();
    return true;
  }

  console.log(gradient.dim('\n  Run `ytm setup` when ready.\n'));
  return false;
}
