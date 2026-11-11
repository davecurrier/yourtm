import { NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import { getProjectPath } from '@/lib/project-config';
import { existsSync } from 'fs';
import { join } from 'path';

// Store the dev server process
let devServerProcess: ChildProcess | null = null;
let devServerOutput: string[] = [];
let devServerPort: number = 3456;
let devServerStartTime: number | null = null;

/**
 * GET /api/preview/dev-server - Get dev server status
 */
export async function GET() {
  const projectPath = await getProjectPath();
  const isValidProject = existsSync(join(projectPath, 'yourtm.config.ts'));

  return NextResponse.json({
    running: devServerProcess !== null && !devServerProcess.killed,
    port: devServerPort,
    projectPath,
    isValidProject,
    startTime: devServerStartTime,
    recentOutput: devServerOutput.slice(-20),
  });
}

/**
 * POST /api/preview/dev-server - Start or stop dev server
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, port = 3456 } = body;

    if (action === 'start') {
      // Stop existing server if running
      if (devServerProcess && !devServerProcess.killed) {
        devServerProcess.kill('SIGTERM');
        devServerProcess = null;
      }

      const projectPath = await getProjectPath();

      // Verify it's a valid project
      if (!existsSync(join(projectPath, 'yourtm.config.ts'))) {
        return NextResponse.json(
          { error: 'No valid YourTM project found. Please link a project in Settings.' },
          { status: 400 }
        );
      }

      devServerOutput = [];
      devServerPort = port;
      devServerStartTime = Date.now();

      // Find the ytm binary - check common locations
      const possiblePaths = [
        join(projectPath, 'node_modules', '.bin', 'ytm'),
        join(projectPath, '..', 'cli', 'dist', 'bin.js'),
        'npx ytm', // fallback to npx
      ];

      let ytmPath = 'npx';
      let ytmArgs = ['ytm', 'dev', '--preview', '--port', String(port), '--preview-endpoint', 'http://localhost:3344/api/preview/telemetry'];

      for (const p of possiblePaths) {
        if (existsSync(p)) {
          ytmPath = p;
          ytmArgs = ['dev', '--preview', '--port', String(port), '--preview-endpoint', 'http://localhost:3344/api/preview/telemetry'];
          break;
        }
      }

      // Use node to run the CLI directly if we found the dist file
      if (ytmPath.endsWith('.js')) {
        ytmArgs = [ytmPath, 'dev', '--preview', '--port', String(port), '--preview-endpoint', 'http://localhost:3344/api/preview/telemetry'];
        ytmPath = 'node';
      }

      console.log(`[Dev Server] Starting: ${ytmPath} ${ytmArgs.join(' ')} in ${projectPath}`);

      devServerProcess = spawn(ytmPath, ytmArgs, {
        cwd: projectPath,
        env: { ...process.env, FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      });

      devServerProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter((l: string) => l.trim());
        devServerOutput.push(...lines);
        // Keep only last 100 lines
        if (devServerOutput.length > 100) {
          devServerOutput = devServerOutput.slice(-100);
        }
      });

      devServerProcess.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n').filter((l: string) => l.trim());
        devServerOutput.push(...lines.map((l: string) => `[stderr] ${l}`));
        if (devServerOutput.length > 100) {
          devServerOutput = devServerOutput.slice(-100);
        }
      });

      devServerProcess.on('exit', (code) => {
        console.log(`[Dev Server] Process exited with code ${code}`);
        devServerProcess = null;
        devServerStartTime = null;
      });

      devServerProcess.on('error', (err) => {
        console.error('[Dev Server] Process error:', err);
        devServerOutput.push(`[error] ${err.message}`);
        devServerProcess = null;
        devServerStartTime = null;
      });

      // Wait a moment for the server to start
      await new Promise(resolve => setTimeout(resolve, 1500));

      return NextResponse.json({
        status: 'started',
        port,
        projectPath,
        pid: devServerProcess?.pid,
      });
    }

    if (action === 'stop') {
      if (devServerProcess && !devServerProcess.killed) {
        devServerProcess.kill('SIGTERM');
        devServerProcess = null;
        devServerStartTime = null;
        return NextResponse.json({ status: 'stopped' });
      }
      return NextResponse.json({ status: 'not_running' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[Dev Server API] Error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
