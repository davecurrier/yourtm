import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { relative } from 'node:path';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import { Compiler } from '../compiler/index.js';

interface BuildOptions {
  clean?: boolean;
  sourcemap?: boolean;
  minify?: boolean;
  watch?: boolean;
}

export async function buildCommand(options: BuildOptions = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('Building YourTM Container');
  logger.newline();

  const spinner = ora('Loading configuration...').start();

  try {
    // Load configuration
    const config = await loadConfig(cwd);

    // Apply CLI options
    if (options.sourcemap !== undefined) {
      config.sourcemap = options.sourcemap;
    }
    if (options.minify !== undefined) {
      config.minify = options.minify;
    }

    spinner.text = `Building container ${config.containerId}...`;

    logger.table([
      { label: 'Container ID', value: config.containerId },
      { label: 'Environment', value: config.environment || 'development' },
      { label: 'Minify', value: String(config.minify) },
      { label: 'Sourcemaps', value: String(config.sourcemap) },
    ]);
    logger.newline();

    // Clean output directory if requested
    if (options.clean && existsSync(config.outDir)) {
      spinner.text = 'Cleaning output directory...';
      await rm(config.outDir, { recursive: true });
      logger.file('delete', relative(cwd, config.outDir));
    }

    // Ensure output directory exists
    await mkdir(config.outDir, { recursive: true });

    // Run compiler
    spinner.text = 'Compiling tags, triggers, and zones...';
    const compiler = new Compiler(config);
    const result = await compiler.compile();

    // Check for errors
    if (result.errors.length > 0) {
      spinner.fail('Build failed with errors');
      logger.newline();

      result.errors.forEach(error => {
        logger.error(`${error.file}: ${error.message}`);
        if (error.line) {
          logger.info(`  at line ${error.line}${error.column ? `:${error.column}` : ''}`);
        }
      });

      process.exit(1);
    }

    // Show warnings
    if (result.warnings.length > 0) {
      result.warnings.forEach(warning => {
        logger.warn(warning);
      });
      logger.newline();
    }

    // Write bundles
    spinner.text = 'Writing bundles...';
    await compiler.writeBundles(result.bundles);

    spinner.succeed('Build completed successfully!');
    logger.newline();

    // Print summary
    logger.info('Build Summary:');
    logger.newline();

    logger.table([
      { label: 'Tags', value: String(result.tags.length) },
      { label: 'Triggers', value: String(result.triggers.length) },
      { label: 'Zones', value: String(result.zones.length) },
      { label: 'Variables', value: String(result.variables.length) },
      { label: 'Bundles', value: String(result.bundles.length) },
    ]);
    logger.newline();

    // Print bundle sizes
    logger.info('Bundle Sizes:');
    logger.newline();

    let totalSize = 0;
    result.bundles.forEach(bundle => {
      logger.bundle(bundle.name, bundle.size);
      totalSize += bundle.size;
    });

    logger.divider();
    logger.bundle('Total', totalSize);
    logger.newline();

    // Check size budget
    const sizeBudget = 100 * 1024; // 100KB
    if (totalSize > sizeBudget) {
      logger.warn(`Total bundle size (${formatBytes(totalSize)}) exceeds budget (${formatBytes(sizeBudget)})`);
    } else {
      logger.success(`Bundle size within budget: ${formatBytes(totalSize)} / ${formatBytes(sizeBudget)}`);
    }

    logger.newline();
    logger.info(`Output: ${relative(cwd, config.outDir)}/`);

  } catch (error) {
    spinner.fail('Build failed');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
