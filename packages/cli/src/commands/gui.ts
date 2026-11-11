/**
 * YourTM GUI Command
 *
 * Opens the native YourTM Mac app. It replaced the Next.js + Electron desktop
 * GUI this command used to start.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Installed copies first, then a build in this checkout (development). */
function findApp(): string | null {
  const candidates = [
    '/Applications/YourTM.app',
    join(homedir(), 'Applications', 'YourTM.app'),
    resolve(__dirname, '..', '..', '..', 'macos', 'dist', 'YourTM.app'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

export async function guiCommand(): Promise<void> {
  if (process.platform !== 'darwin') {
    logger.error('The YourTM app is macOS only.');
    process.exit(1);
  }

  const app = findApp();
  if (!app) {
    logger.error('YourTM.app is not installed.');
    logger.info('Install it with the installer (curl -fsSL https://yourtm.dev/install | bash),');
    logger.info('or build it from a checkout with packages/macos/build-app.sh.');
    process.exit(1);
  }

  logger.info(`Opening ${app}`);
  const child = spawn('open', [app], { stdio: 'inherit' });
  await new Promise<void>((done) => child.on('exit', () => done()));
}
