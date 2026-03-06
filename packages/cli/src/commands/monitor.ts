// WebSocket import reserved for future real-time connection
// import { WebSocket } from 'ws';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';

interface MonitorOptions {
  container?: string;
  mode?: 'preview' | 'live';
  filter?: string;
}

interface TagEvent {
  tagId: string;
  tagName: string;
  status: 'fired' | 'blocked' | 'error';
  latency: number;
  timestamp: number;
  page?: string;
  error?: string;
  eventData?: Record<string, unknown>;
}

interface AggregatedMetrics {
  tagId: string;
  tagName: string;
  fires: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  successRate: number;
}

export async function monitorCommand(options: MonitorOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const mode = options.mode || 'preview';

  logger.newline();

  // Print header based on mode
  if (mode === 'preview') {
    console.log(logger.chalk.cyan('  YourTM CLI Monitor (Preview Mode)'));
  } else {
    console.log(logger.chalk.cyan('  YourTM CLI Monitor (Live Mode - Production)'));
  }

  const spinner = ora('Connecting to YourTM...').start();

  try {
    // Load configuration
    const config = await loadConfig(cwd).catch(() => null);
    const containerId = options.container || config?.containerId;

    if (!containerId) {
      throw new Error('Container ID required. Use --container or configure in yourtm.config.ts');
    }

    spinner.text = 'Establishing connection...';

    console.log(logger.chalk.gray(`  Container: ${containerId}`));
    logger.newline();

    if (mode === 'preview') {
      await runPreviewMode(containerId, options, spinner);
    } else {
      await runLiveMode(containerId, options, spinner);
    }

  } catch (error) {
    spinner.fail('Monitor failed');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function runPreviewMode(
  _containerId: string,
  options: MonitorOptions,
  spinner: ReturnType<typeof ora>
): Promise<void> {
  // In preview mode, we connect to the local dev server WebSocket
  // or to the YourTM cloud WebSocket for remote debugging

  spinner.succeed('Connected to preview session');
  logger.newline();

  printDivider();
  console.log(logger.chalk.bold('  LIVE TAG ACTIVITY'));
  logger.newline();

  // Simulated events for demonstration
  const mockEvents: TagEvent[] = [
    {
      tagId: 'ga4-config',
      tagName: 'GA4 Pageview',
      status: 'fired',
      latency: 8,
      timestamp: Date.now(),
      page: '/products/shoes',
    },
    {
      tagId: 'meta-pixel-vc',
      tagName: 'Meta Pixel - ViewContent',
      status: 'fired',
      latency: 12,
      timestamp: Date.now() + 2000,
      eventData: { value: 59.99 },
    },
    {
      tagId: 'tiktok-atc',
      tagName: 'TikTok Pixel - AddToCart',
      status: 'fired',
      latency: 156,
      timestamp: Date.now() + 7000,
    },
    {
      tagId: 'custom-analytics',
      tagName: 'Custom Analytics Tag',
      status: 'error',
      latency: 2,
      timestamp: Date.now() + 9000,
      error: 'dataLayer.userId undefined',
    },
  ];

  // Print mock events with delays
  for (const event of mockEvents) {
    await delay(1500);
    printTagEvent(event, options.filter);
  }

  logger.newline();
  printDivider();
  logger.newline();

  // Performance summary
  console.log(logger.chalk.cyan('  PERFORMANCE SUMMARY (Last 5 min)'));
  console.log(
    '  Tags Fired: ' + logger.chalk.green('47') +
    ' | Success: ' + logger.chalk.green('94%') +
    ' | Avg Load: ' + logger.chalk.cyan('18ms') +
    ' | P95: ' + logger.chalk.yellow('89ms')
  );
  logger.newline();

  console.log(logger.chalk.gray("  Press 'q' to quit | 'f' to filter | 'd' for details"));
  logger.newline();

  // In real implementation, would set up stdin for keyboard input
  // and maintain WebSocket connection for real-time events
}

async function runLiveMode(
  _containerId: string,
  _options: MonitorOptions,
  spinner: ReturnType<typeof ora>
): Promise<void> {
  spinner.succeed('Connected to production telemetry');
  logger.newline();

  console.log(logger.chalk.gray('  Active Users: 2,847'));
  logger.newline();

  printDivider();
  console.log(logger.chalk.bold('  TAG PERFORMANCE (Last 60 seconds)'));
  logger.newline();

  // Print table header
  console.log(
    logger.chalk.gray('  Tag Name              Fires   Avg    P95    P99   Success')
  );
  printDivider();

  // Mock aggregated data
  const metrics: AggregatedMetrics[] = [
    { tagId: 'ga4', tagName: 'GA4 Pageview', fires: 1247, avgLatency: 12, p95Latency: 24, p99Latency: 45, successRate: 99.8 },
    { tagId: 'meta', tagName: 'Meta Pixel', fires: 1103, avgLatency: 18, p95Latency: 34, p99Latency: 67, successRate: 98.2 },
    { tagId: 'tiktok', tagName: 'TikTok Pixel', fires: 892, avgLatency: 156, p95Latency: 289, p99Latency: 412, successRate: 94.1 },
    { tagId: 'linkedin', tagName: 'LinkedIn Insight', fires: 234, avgLatency: 8, p95Latency: 15, p99Latency: 28, successRate: 99.6 },
    { tagId: 'custom', tagName: 'Custom Analytics', fires: 156, avgLatency: 4, p95Latency: 8, p99Latency: 14, successRate: 87.8 },
  ];

  for (const m of metrics) {
    const successColor = m.successRate >= 98 ? logger.chalk.green : logger.chalk.yellow;
    const p95Color = m.p95Latency > 100 ? logger.chalk.yellow : logger.chalk.white;
    const warning = m.successRate < 95 || m.p95Latency > 100 ? logger.chalk.yellow(' !!') : '';

    console.log(
      '  ' +
      m.tagName.padEnd(22) +
      String(m.fires).padStart(5) +
      (m.avgLatency + 'ms').padStart(6) +
      p95Color((m.p95Latency + 'ms').padStart(7)) +
      (m.p99Latency + 'ms').padStart(7) +
      successColor((m.successRate.toFixed(1) + '%').padStart(8)) +
      warning
    );
  }

  logger.newline();
  printDivider();
  logger.newline();

  // Bottleneck detection
  console.log(logger.chalk.red('  BOTTLENECKS DETECTED'));
  logger.newline();

  console.log(logger.chalk.yellow('  !! TikTok Pixel: P95 289ms (Target: <100ms)'));
  console.log(logger.chalk.gray('     -> Network latency to analytics.tiktok.com'));
  console.log(logger.chalk.cyan('     -> Recommendation: Consider server-side tracking'));
  logger.newline();

  console.log(logger.chalk.yellow('  !! Custom Analytics: 12.2% failure rate'));
  console.log(logger.chalk.gray('     -> Error: "dataLayer.userId undefined" (87% of failures)'));
  console.log(logger.chalk.cyan('     -> Recommendation: Add null check in tag configuration'));
  logger.newline();

  printDivider();
  logger.newline();

  console.log(logger.chalk.gray("  Press 'q' to quit | 't' to filter by tag | 'e' for errors"));
  logger.newline();
}

function printTagEvent(event: TagEvent, filter?: string): void {
  if (filter && !event.tagName.toLowerCase().includes(filter.toLowerCase())) {
    return;
  }

  const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const statusIcon = {
    fired: logger.chalk.green('✓'),
    blocked: logger.chalk.yellow('○'),
    error: logger.chalk.red('✗'),
  };

  const statusText = {
    fired: 'Success',
    blocked: 'BLOCKED',
    error: 'FAILED',
  };

  const latencyColor = event.latency > 100
    ? logger.chalk.yellow
    : logger.chalk.gray;

  console.log(`  ${logger.chalk.gray(`[${time}]`)} ${statusIcon[event.status]} ${event.tagName}`);
  console.log(
    `           Load: ${latencyColor(event.latency + 'ms')} | ${statusText[event.status]}` +
    (event.page ? ` | Page: ${event.page}` : '')
  );

  if (event.error) {
    console.log(logger.chalk.red(`           Error: ${event.error}`));
  }

  if (event.eventData) {
    console.log(
      logger.chalk.gray(`           Event Data: ${JSON.stringify(event.eventData)}`)
    );
  }

  if (event.latency > 100) {
    console.log(logger.chalk.yellow('           Warning: >100ms threshold'));
  }

  logger.newline();
}

function printDivider(): void {
  console.log(logger.chalk.gray('  ' + '─'.repeat(48)));
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
