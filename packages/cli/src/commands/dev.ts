import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { extname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import chokidar from 'chokidar';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { loadConfig, YourTMConfig } from '../utils/config.js';
import { Compiler, CompiledBundle } from '../compiler/index.js';
import { 
  type TelemetryEvent, 
  TelemetryEventType, 
  type TagExecutionTelemetry,
} from '@yourtm/core';

interface DevOptions {
  port?: number;
  host?: string;
  open?: boolean;
  preview?: boolean;
  previewEndpoint?: string;
}

/**
 * Recent preview events, for `ytm monitor --mode preview` to read via
 * GET /_ytm/telemetry. Newest last; bounded.
 */
const MAX_RECENT_EVENTS = 500;
const recentEvents: Array<Record<string, unknown>> = [];

function rememberEvent(event: Record<string, unknown>): void {
  const id = `${event.tagId ?? '?'}-${event.timestamp ?? Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  recentEvents.push({ id, receivedAt: Date.now(), ...event });
  if (recentEvents.length > MAX_RECENT_EVENTS) recentEvents.splice(0, recentEvents.length - MAX_RECENT_EVENTS);
}

const MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.html': 'text/html',
  '.css': 'text/css',
  '.map': 'application/json',
};

export async function devCommand(options: DevOptions = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Development Server');
  logger.newline();

  const spinner = ora('Starting development server...').start();

  try {
    // Load configuration
    const config = await loadConfig(cwd);
    const port = options.port || config.devServer?.port || 3456;
    const host = options.host || config.devServer?.host || 'localhost';

    // Preview: the runtime beacons each tag execution to this server, which
    // prints it here and forwards it to the YourTM app (if it is running) at
    // --preview-endpoint. Built into the runtime config rather than injected:
    // an injected bridge runs before the runtime exists and never registers.
    const forwardTo = options.preview ? options.previewEndpoint : undefined;
    config.previewEndpoint = `http://${host}:${port}/_ytm/telemetry`;

    // Initial build
    spinner.text = 'Building container...';
    const compiler = new Compiler(config);
    let bundles = await buildAndReport(compiler);

    // Create HTTP server
    const server = createServer((req, res) => {
      handleRequest(req, res, config, bundles, forwardTo);
    });

    // Create WebSocket server for hot reload and telemetry
    const wss = new WebSocketServer({ server });
    const clients = new Set<WebSocket>();

    wss.on('connection', (ws) => {
      clients.add(ws);
      logger.debug('Client connected');

      ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString()) as TelemetryEvent;
          
          // Broadcast to all other clients (e.g., Desktop App)
          const message = JSON.stringify({ type: 'telemetry', event });
          clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(message);
            }
          });

          handleTelemetryEvent(event);
        } catch {
          // Ignore invalid messages
        }
      });

      ws.on('close', () => {
        clients.delete(ws);
        logger.debug('Client disconnected');
      });
    });

    // Watch for file changes
    const watchPaths = [
      config.tagsDir,
      config.triggersDir,
      config.zonesDir,
      config.variablesDir,
    ].filter(p => p && existsSync(p)) as string[];

    const watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      ignored: /\.ytm-temp/,
    });

    watcher.on('all', async (event, path) => {
      logger.newline();
      logger.info(`File ${event}: ${relative(cwd, path)}`);

      try {
        bundles = await buildAndReport(compiler);

        // Notify clients to reload
        const message = JSON.stringify({ type: 'reload' });
        clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        });

        logger.success('Hot reload triggered');
      } catch (error) {
        logger.error(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    // Start server
    server.listen(port, host, () => {
      spinner.succeed('Development server started');
      logger.newline();

      const localUrl = `http://${host}:${port}`;
      const tableRows = [
        { label: 'Local', value: localUrl },
        { label: 'Container', value: config.containerId },
        { label: 'Mode', value: 'development + preview' },
        { label: 'Test page', value: `${localUrl}/_ytm/test` },
      ];
      logger.table(tableRows);
      logger.newline();

      logger.info('Snippet to add to your HTML:');
      logger.newline();
      for (const name of bundleOrder(bundles)) {
        console.log(logger.chalk.gray('  <script src="' + localUrl + '/' + name + '" defer></script>'));
      }
      logger.newline();

      printDashboard();
    });

    // Handle shutdown
    process.on('SIGINT', () => {
      logger.newline();
      logger.info('Shutting down...');
      watcher.close();
      server.close();
      process.exit(0);
    });

  } catch (error) {
    spinner.fail('Failed to start development server');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function buildAndReport(compiler: Compiler): Promise<CompiledBundle[]> {
  const result = await compiler.compile();

  if (result.errors.length > 0) {
    result.errors.forEach(error => {
      logger.error(`${error.file}: ${error.message}`);
    });
    throw new Error('Build failed with errors');
  }

  result.warnings.forEach(warning => {
    logger.warn(warning);
  });

  return result.bundles;
}

/** Core first, then every zone/tag bundle this build actually produced. */
function bundleOrder(bundles: CompiledBundle[]): string[] {
  return bundles.map(b => b.name).filter(n => n.endsWith('.js'))
    .sort((a, b) => (a === 'core.js' ? -1 : b === 'core.js' ? 1 : a.localeCompare(b)));
}

function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: YourTMConfig,
  bundles: CompiledBundle[],
  forwardTo?: string
): void {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;

  // CORS headers for development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Chrome's Private/Local Network Access: lets a public HTTPS page reach this
  // loopback server once the user allows it.
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Handle telemetry POST from beacon/fetch
  if (pathname === '/_ytm/telemetry' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        // sendBeacon posts text/plain, so parse regardless of content type.
        const parsed = JSON.parse(body) as TelemetryEvent | TelemetryEvent[];
        for (const event of Array.isArray(parsed) ? parsed : [parsed]) {
          handleTelemetryEvent(event);
          const e = event as unknown as Record<string, unknown>;
          rememberEvent(e.pageUrl ? e : { ...e, pageUrl: req.headers.referer });
        }
        if (forwardTo) {
          // Best effort: the app may not be open.
          fetch(forwardTo, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } })
            .catch(() => {});
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (e) {
        res.writeHead(400);
        res.end('Invalid JSON');
      }
    });
    return;
  }

  // Recent events, read by `ytm monitor --mode preview`
  if (pathname === '/_ytm/telemetry' && req.method === 'GET') {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 200, MAX_RECENT_EVENTS);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ events: recentEvents.slice(-limit), total: recentEvents.length }));
    return;
  }

  // Serve bundle files
  const filename = pathname.slice(1) || 'index.html';
  const bundle = bundles.find(b => b.name === filename);

  if (bundle) {
    const ext = extname(filename);
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'text/plain');
    res.setHeader('Cache-Control', 'no-cache');
    res.writeHead(200);

    const code = bundle.code;
    res.end(code);
    return;
  }

  // Serve source maps
  if (filename.endsWith('.map')) {
    const jsName = filename.replace('.map', '');
    const jsBundle = bundles.find(b => b.name === jsName);
    if (jsBundle?.map) {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(jsBundle.map);
      return;
    }
  }

  // A blank page that loads every bundle, so preview works without wiring
  // the snippet into a site first.
  if (pathname === '/_ytm/test') {
    const scripts = bundleOrder(bundles)
      .map(name => `<script src="/${name}" defer></script>`).join('\n  ');
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>YourTM test page - ${config.containerId}</title>
  ${scripts}
</head><body style="font:15px -apple-system,sans-serif;margin:48px">
<h1>YourTM test page</h1><p>Container <code>${config.containerId}</code>. Tag events appear in the terminal running <code>ytm dev</code>.</p>
</body></html>`);
    return;
  }

  // Serve index page
  if (pathname === '/' || pathname === '/index.html') {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(generateIndexPage(config, bundles));
    return;
  }

  // 404
  res.writeHead(404);
  res.end('Not Found');
}

function generateIndexPage(config: YourTMConfig, bundles: CompiledBundle[]): string {
  const bundleList = bundles.map(b => `
    <tr>
      <td><a href="/${b.name}">${b.name}</a></td>
      <td>${formatBytes(b.size)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>YourTM Dev Server - ${config.containerId}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #0a0a0a;
      color: #fafafa;
    }
    h1 { color: #a855f7; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #333; }
    th { color: #888; }
    a { color: #06b6d4; }
    code {
      background: #1a1a1a;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 14px;
    }
    pre {
      background: #1a1a1a;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
    }
    .status { color: #10b981; }
  </style>
</head>
<body>
  <h1>YourTM Development Server</h1>
  <p>Container: <code>${config.containerId}</code> <span class="status">Running</span></p>

  <h2>Bundles</h2>
  <table>
    <thead>
      <tr><th>File</th><th>Size</th></tr>
    </thead>
    <tbody>
      ${bundleList}
    </tbody>
  </table>

  <h2>Usage</h2>
  <p>Add these scripts to your HTML:</p>
  <pre><code>&lt;script src="http://localhost:${config.devServer?.port || 3456}/core.js"&gt;&lt;/script&gt;
&lt;script src="http://localhost:${config.devServer?.port || 3456}/tags.js"&gt;&lt;/script&gt;</code></pre>

  <h2>WebSocket</h2>
  <p>Connect to <code>ws://localhost:${config.devServer?.port || 3456}</code> for hot reload and tag events.</p>
</body>
</html>`;
}

function handleTelemetryEvent(event: TelemetryEvent): void {
  const timestamp = new Date(event.timestamp).toLocaleTimeString();

  switch (event.type) {
    case TelemetryEventType.TagExecution: {
      const e = event as TagExecutionTelemetry;
      const latencyStr = e.latency.toFixed(1) + 'ms';
      
      switch (e.status) {
        case 'fired':
          console.log(
            logger.chalk.gray(`[${timestamp}]`) + ' ' +
            logger.chalk.green('✓') + ' ' +
            logger.chalk.white(e.tagName) + ' ' +
            logger.chalk.gray(latencyStr)
          );
          break;
        case 'blocked':
          console.log(
            logger.chalk.gray(`[${timestamp}]`) + ' ' +
            logger.chalk.yellow('○') + ' ' +
            logger.chalk.white(e.tagName) + ' ' +
            logger.chalk.yellow('(blocked)')
          );
          break;
        case 'error':
          console.log(
            logger.chalk.gray(`[${timestamp}]`) + ' ' +
            logger.chalk.red('✗') + ' ' +
            logger.chalk.white(e.tagName) + ' ' +
            logger.chalk.red(e.error || 'Unknown error')
          );
          break;
      }
      break;
    }
    
    case TelemetryEventType.TriggerEvaluation: {
      // Quietly log trigger evaluations unless they're high signal
      break;
    }
    
    case TelemetryEventType.DataLayerPush: {
      // Optional: log dataLayer pushes in dev console
      // console.log(logger.chalk.gray(`[${timestamp}]`) + ' ' + logger.chalk.blue('→') + ' dataLayer.push', (event as any).payload);
      break;
    }
  }
}

function printDashboard(): void {
  logger.divider();
  console.log(logger.chalk.gray('Tag Events:'));
  logger.newline();
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
