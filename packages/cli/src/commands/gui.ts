/**
 * YourTM GUI Command
 *
 * Launches the desktop GUI (Next.js + Electron).
 * Starts the Next.js dev server on port 3344, then opens the Electron window.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface GuiOptions {
  port?: number;
  noBrowser?: boolean;
}

/**
 * Find the desktop package directory.
 * Checks common locations relative to the CLI package.
 */
function findDesktopDir(): string | null {
  const candidates = [
    // Monorepo sibling (development)
    resolve(__dirname, '..', '..', '..', 'desktop'),
    // Monorepo from dist (compiled)
    resolve(__dirname, '..', '..', '..', '..', 'desktop'),
    // npm global install - look for workspace
    resolve(__dirname, '..', '..', '..', '..', '..', 'packages', 'desktop'),
  ];

  for (const dir of candidates) {
    if (existsSync(join(dir, 'main.js')) && existsSync(join(dir, 'package.json'))) {
      return dir;
    }
  }

  return null;
}

export async function guiCommand(options: GuiOptions = {}): Promise<void> {
  const port = options.port || 3344;

  logger.header('YourTM Desktop');
  logger.newline();

  const desktopDir = findDesktopDir();

  if (!desktopDir) {
    logger.error('Could not find the desktop package.');
    logger.info('Make sure you are running from the YourTM monorepo,');
    logger.info('or that @yourtm/desktop is installed.');
    process.exit(1);
  }

  logger.info(`Desktop package: ${desktopDir}`);
  logger.info(`Starting on port ${port}...`);
  logger.newline();

  // Check if port is already in use
  const portInUse = await checkPort(port);

  let nextProcess: ChildProcess | null = null;

  if (!portInUse) {
    // Start Next.js dev server
    nextProcess = spawn('npx', ['next', 'dev', '-p', String(port)], {
      cwd: desktopDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    nextProcess.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) logger.info(line);
    });

    nextProcess.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      // Filter out noisy Next.js warnings
      if (line && !line.includes('ExperimentalWarning')) {
        process.stderr.write(data);
      }
    });

    // Wait for server to be ready
    logger.info('Waiting for dev server...');
    await waitForServer(port, 30000);
    logger.success(`Dev server ready on http://localhost:${port}`);
  } else {
    logger.info(`Dev server already running on port ${port}`);
  }

  // Launch Electron
  if (!options.noBrowser) {
    logger.info('Launching Electron...');

    const electronPath = await resolveElectron(desktopDir);
    if (!electronPath) {
      logger.error('Could not find Electron binary.');
      logger.info(`Open http://localhost:${port} in your browser instead.`);
      // Keep the Next.js server running
      if (nextProcess) {
        await new Promise(() => {}); // Block forever
      }
      return;
    }

    const electronProcess = spawn(electronPath, [desktopDir], {
      cwd: desktopDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        ELECTRON_IS_DEV: '1',
      },
    });

    electronProcess.on('close', (code) => {
      logger.info('Electron closed.');
      if (nextProcess) {
        nextProcess.kill();
      }
      process.exit(code || 0);
    });
  } else {
    logger.success(`GUI available at http://localhost:${port}`);
    logger.info('Press Ctrl+C to stop.');
    // Block until killed
    await new Promise(() => {});
  }

  // Clean up on exit
  process.on('SIGINT', () => {
    if (nextProcess) nextProcess.kill();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    if (nextProcess) nextProcess.kill();
    process.exit(0);
  });
}

/**
 * Check if a port is in use.
 */
async function checkPort(port: number): Promise<boolean> {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

/**
 * Wait for the dev server to respond.
 */
async function waitForServer(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}`, { method: 'HEAD' });
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not start within ${timeoutMs / 1000}s`);
}

/**
 * Find the Electron binary.
 */
async function resolveElectron(desktopDir: string): Promise<string | null> {
  const { readFileSync } = await import('node:fs');

  // Look for the electron package in common locations
  const candidates = [
    join(desktopDir, 'node_modules', 'electron'),
    join(desktopDir, '..', '..', 'node_modules', 'electron'),
    join(desktopDir, '..', '..', '..', 'node_modules', 'electron'),
  ];

  for (const candidate of candidates) {
    const pathFile = join(candidate, 'path.txt');
    if (existsSync(pathFile)) {
      const relativeBin = readFileSync(pathFile, 'utf-8').trim();
      const fullPath = join(candidate, 'dist', relativeBin);
      if (existsSync(fullPath)) return fullPath;
    }
  }

  return null;
}
