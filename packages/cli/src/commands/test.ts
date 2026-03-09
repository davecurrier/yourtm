import ora from 'ora';
import { chromium, type Browser } from 'playwright';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';

interface TestOptions {
  url?: string;
  urls?: string;
  container?: string;
  output?: string;
  watch?: boolean;
  headless?: boolean;
  timeout?: number;
}

interface TagFireEvent {
  tag: string;
  status: 'fired' | 'blocked' | 'error';
  latency?: number;
  timestamp: Date;
  data?: Record<string, unknown>;
}

export async function testCommand(urlArg?: string, options: TestOptions = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM Tag Testing');
  logger.newline();

  const spinner = ora('Initializing test runner...').start();

  try {
    // Load configuration
    const config = await loadConfig(cwd).catch(() => null);

    const containerId = options.container || config?.containerId;
    if (!containerId) {
      throw new Error('Container ID required. Use --container or configure in yourtm.config.ts');
    }

    // Determine test mode
    const testUrl = urlArg || options.url;
    const urlsFile = options.urls;

    if (!testUrl && !urlsFile) {
      throw new Error('URL required. Provide a URL argument or use --urls for bulk testing.');
    }

    spinner.text = 'Loading test configuration...';

    logger.table([
      { label: 'Container', value: containerId },
      { label: 'Mode', value: urlsFile ? 'Bulk Test' : 'Single URL' },
      { label: 'Headless', value: String(options.headless !== false) },
      { label: 'Timeout', value: `${options.timeout || 30000}ms` },
    ]);
    logger.newline();

    if (urlsFile) {
      spinner.text = 'Running bulk tests...';
      await runBulkTests(urlsFile, containerId, options);
    } else if (testUrl) {
      spinner.text = `Testing ${testUrl}...`;
      await runSingleTest(testUrl, containerId, options);
    }

    spinner.succeed('Tests completed');
    logger.newline();

  } catch (error) {
    spinner.fail('Test failed');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function runSingleTest(
  url: string,
  containerId: string,
  options: TestOptions
): Promise<void> {
  logger.info(`Testing URL: ${url}`);
  logger.newline();

  const browser = await chromium.launch({
    headless: options.headless !== false,
  });

  try {
    const page = await browser.newPage();
    const events: TagFireEvent[] = [];

    // Capture console messages for tag events
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[YourTM]') || text.includes('ytm:')) {
        const match = text.match(/\[YourTM\]\s*(\w+):\s*(.+)/);
        if (match) {
          events.push({
            tag: match[2],
            status: 'fired',
            timestamp: new Date(),
          });
        }
      }
    });

    // Capture network requests for tracking pixels
    page.on('request', request => {
      const url = request.url();
      // Common tracking endpoints
      if (url.includes('google-analytics.com') ||
          url.includes('googletagmanager.com') ||
          url.includes('facebook.com/tr') ||
          url.includes('connect.facebook.net') ||
          url.includes('analytics.tiktok.com')) {
        const tagName = getTagNameFromUrl(url);
        events.push({
          tag: tagName,
          status: 'fired',
          timestamp: new Date(),
          data: { url },
        });
      }
    });

    // Navigate to the URL
    const startTime = Date.now();
    await page.goto(url, {
      timeout: options.timeout || 30000,
      waitUntil: 'networkidle',
    });
    const loadTime = Date.now() - startTime;

    // Wait a bit more for any lazy-loaded tags
    await page.waitForTimeout(2000);

    // Check for dataLayer
    const dataLayerEvents = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = globalThis as any;
      const dl = w.dataLayer;
      if (Array.isArray(dl)) {
        return dl.filter((e: any) => e.event).map((e: any) => ({
          event: e.event,
          data: e,
        }));
      }
      return [];
    });

    // Add dataLayer events
    dataLayerEvents.forEach((e: { event: string; data: unknown }) => {
      events.push({
        tag: `dataLayer: ${e.event}`,
        status: 'fired',
        timestamp: new Date(),
        data: e.data as Record<string, unknown>,
      });
    });

    // Display results
    logger.info('Results:');
    logger.newline();

    if (events.length === 0) {
      logger.warn('No tag events detected');
    } else {
      // Deduplicate events by tag name
      const uniqueEvents = events.reduce((acc, event) => {
        const key = event.tag;
        if (!acc.has(key)) {
          acc.set(key, event);
        }
        return acc;
      }, new Map<string, TagFireEvent>());

      uniqueEvents.forEach(event => {
        logger.tag(event.tag, event.status, event.latency);
      });
    }

    logger.newline();
    logger.divider();

    logger.table([
      { label: 'Container', value: containerId },
      { label: 'Events Captured', value: String(events.length) },
      { label: 'Load Time', value: `${loadTime}ms` },
    ]);

  } finally {
    await browser.close();
  }
}

function getTagNameFromUrl(url: string): string {
  if (url.includes('google-analytics.com') || url.includes('googletagmanager.com/gtag')) {
    return 'GA4';
  }
  if (url.includes('facebook.com/tr') || url.includes('connect.facebook.net')) {
    return 'Meta Pixel';
  }
  if (url.includes('analytics.tiktok.com')) {
    return 'TikTok Pixel';
  }
  if (url.includes('googleadservices.com') || url.includes('googleads.g.doubleclick.net')) {
    return 'Google Ads';
  }
  if (url.includes('snap.licdn.com') || url.includes('linkedin.com/px')) {
    return 'LinkedIn Insight';
  }
  return 'Network Request';
}

async function runBulkTests(
  urlsFile: string,
  _containerId: string,
  _options: TestOptions
): Promise<void> {
  logger.info(`Loading URLs from: ${urlsFile}`);
  logger.newline();

  // Placeholder for bulk testing
  logger.warn('Bulk testing not yet implemented');
  logger.info('This feature will support:');
  console.log('  - Excel files (.xlsx)');
  console.log('  - CSV files (.csv)');
  console.log('  - Text files (.txt)');
  console.log('  - Parallel processing');
  console.log('  - Report generation');
}

export async function watchCommand(urlArg?: string, options: TestOptions = {}): Promise<void> {
  logger.header('YourTM Watch Mode');
  logger.newline();

  const testUrl = urlArg || options.url;
  if (!testUrl) {
    logger.error('URL required for watch mode');
    process.exit(1);
  }

  logger.info(`Watching: ${testUrl}`);
  logger.info('Press Ctrl+C to stop');
  logger.newline();

  let browser: Browser | null = null;

  // Handle graceful shutdown
  const cleanup = async () => {
    logger.newline();
    logger.info('Stopping watch mode...');
    if (browser) {
      await browser.close();
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    browser = await chromium.launch({
      headless: options.headless !== false,
    });

    const page = await browser.newPage();
    let eventCount = 0;

    // Capture console messages
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();

      // Show YourTM-related console messages
      if (text.includes('[YourTM]') || text.includes('ytm:') || text.includes('dataLayer')) {
        eventCount++;
        const timestamp = new Date().toLocaleTimeString();
        console.log(logger.chalk.gray(`[${timestamp}]`), logger.chalk.cyan(`[Console ${type}]`), text);
      }
    });

    // Capture network requests
    page.on('request', request => {
      const url = request.url();
      const tagName = getTagNameFromUrl(url);

      if (tagName !== 'Network Request') {
        eventCount++;
        const timestamp = new Date().toLocaleTimeString();
        console.log(
          logger.chalk.gray(`[${timestamp}]`),
          logger.chalk.green('✓'),
          logger.chalk.yellow(tagName),
          logger.chalk.gray('→'),
          truncateUrl(url)
        );
      }
    });

    // Capture response status
    page.on('response', response => {
      const url = response.url();
      const status = response.status();
      const tagName = getTagNameFromUrl(url);

      if (tagName !== 'Network Request' && status >= 400) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(
          logger.chalk.gray(`[${timestamp}]`),
          logger.chalk.red('✗'),
          logger.chalk.yellow(tagName),
          logger.chalk.red(`HTTP ${status}`)
        );
      }
    });

    // Navigate and watch
    logger.info('Loading page...');
    await page.goto(testUrl, {
      timeout: options.timeout || 30000,
      waitUntil: 'domcontentloaded',
    });

    // Check for dataLayer
    const hasDataLayer = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = globalThis as any;
      return Array.isArray(w.dataLayer);
    });

    if (hasDataLayer) {
      logger.success('dataLayer detected');
    } else {
      logger.warn('No dataLayer detected on page');
    }

    logger.newline();
    logger.divider();
    logger.info('Monitoring for tag events...');
    logger.newline();

    // Set up dataLayer monitoring
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = globalThis as any;
      const originalPush = w.dataLayer?.push;
      if (originalPush) {
        w.dataLayer.push = function(...args: unknown[]) {
          console.log('[YourTM] dataLayer.push:', JSON.stringify(args[0]));
          return originalPush.apply(this, args);
        };
      }
    });

    // Keep the browser open and monitoring
    // The process will stay alive until Ctrl+C
    await new Promise<void>((resolve) => {
      // Check every second if we should still be running
      const interval = setInterval(() => {
        // This keeps the process alive
      }, 1000);

      process.on('SIGINT', () => {
        clearInterval(interval);
        resolve();
      });
    });

  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    if (browser) {
      await browser.close();
    }
    process.exit(1);
  }
}

function truncateUrl(url: string, maxLength: number = 60): string {
  if (url.length <= maxLength) return url;
  return url.slice(0, maxLength - 3) + '...';
}

export async function diffCommand(options: { baseline?: string; current?: string }): Promise<void> {
  logger.header('YourTM Diff Mode');
  logger.newline();

  if (!options.baseline || !options.current) {
    logger.error('Both --baseline and --current are required for diff mode');
    process.exit(1);
  }

  logger.info(`Comparing:`);
  logger.table([
    { label: 'Baseline', value: options.baseline },
    { label: 'Current', value: options.current },
  ]);
  logger.newline();

  // TODO: Implement diff comparison
  logger.warn('Diff mode not yet implemented');
}
