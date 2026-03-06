import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { glob } from 'glob';
import * as esbuild from 'esbuild';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { loadConfig, findConfigFile } from '../utils/config.js';

interface CheckOptions {
  fix?: boolean;
}

interface CheckResult {
  errors: CheckError[];
  warnings: CheckWarning[];
}

interface CheckError {
  type: 'typescript' | 'reference' | 'circular' | 'config';
  file: string;
  message: string;
  line?: number;
  column?: number;
}

interface CheckWarning {
  type: 'unused' | 'duplicate' | 'performance' | 'best-practice';
  file: string;
  message: string;
}

export async function checkCommand(_options: CheckOptions = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('Checking YourTM Configuration');
  logger.newline();

  const spinner = ora('Running checks...').start();
  const result: CheckResult = { errors: [], warnings: [] };

  try {
    // Check 1: Config file exists and is valid
    spinner.text = 'Checking configuration...';
    await checkConfig(cwd, result);

    // Check 2: TypeScript type checking
    spinner.text = 'Type checking...';
    await checkTypeScript(cwd, result);

    // Check 3: Validate trigger references
    spinner.text = 'Validating references...';
    await checkReferences(cwd, result);

    // Check 4: Check zone patterns
    spinner.text = 'Checking zone patterns...';
    await checkZonePatterns(cwd, result);

    // Check 5: Detect circular dependencies
    spinner.text = 'Detecting circular dependencies...';
    await checkCircularDependencies(cwd, result);

    // Check 6: Best practices
    spinner.text = 'Checking best practices...';
    await checkBestPractices(cwd, result);

    spinner.stop();

    // Print results
    logger.newline();

    if (result.errors.length === 0 && result.warnings.length === 0) {
      logger.success('All checks passed!');
      logger.newline();
      return;
    }

    // Print errors
    if (result.errors.length > 0) {
      logger.error(`Found ${result.errors.length} error(s):`);
      logger.newline();

      result.errors.forEach((error, index) => {
        const location = error.line
          ? ` (${error.line}:${error.column || 0})`
          : '';
        console.log(
          logger.chalk.red(`  ${index + 1}. [${error.type}] `) +
          logger.chalk.white(relative(cwd, error.file) + location)
        );
        console.log(logger.chalk.gray(`     ${error.message}`));
      });
      logger.newline();
    }

    // Print warnings
    if (result.warnings.length > 0) {
      logger.warn(`Found ${result.warnings.length} warning(s):`);
      logger.newline();

      result.warnings.forEach((warning, index) => {
        console.log(
          logger.chalk.yellow(`  ${index + 1}. [${warning.type}] `) +
          logger.chalk.white(relative(cwd, warning.file))
        );
        console.log(logger.chalk.gray(`     ${warning.message}`));
      });
      logger.newline();
    }

    // Summary
    logger.divider();
    logger.table([
      { label: 'Errors', value: String(result.errors.length) },
      { label: 'Warnings', value: String(result.warnings.length) },
    ]);
    logger.newline();

    if (result.errors.length > 0) {
      process.exit(1);
    }

  } catch (error) {
    spinner.fail('Check failed');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function checkConfig(cwd: string, result: CheckResult): Promise<void> {
  const configPath = await findConfigFile(cwd);

  if (!configPath) {
    result.errors.push({
      type: 'config',
      file: cwd,
      message: 'No yourtm.config.ts found. Run "ytm init" to create one.',
    });
    return;
  }

  try {
    const config = await loadConfig(cwd);

    // Validate container ID format
    if (!config.containerId.match(/^YTM-[A-Z0-9]+$/)) {
      result.warnings.push({
        type: 'best-practice',
        file: configPath,
        message: 'Container ID should match format YTM-XXXXXX',
      });
    }

    // Check directories exist
    const dirs = [
      { name: 'tagsDir', path: config.tagsDir },
      { name: 'triggersDir', path: config.triggersDir },
      { name: 'zonesDir', path: config.zonesDir },
    ];

    for (const { name, path } of dirs) {
      if (!existsSync(path)) {
        result.warnings.push({
          type: 'best-practice',
          file: configPath,
          message: `${name} directory does not exist: ${path}`,
        });
      }
    }
  } catch (error) {
    result.errors.push({
      type: 'config',
      file: configPath,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function checkTypeScript(cwd: string, result: CheckResult): Promise<void> {
  const config = await loadConfig(cwd).catch(() => null);
  if (!config) return;

  const dirs = [config.tagsDir, config.triggersDir, config.zonesDir];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;

    const files = await glob('**/*.ts', { cwd: dir });

    for (const file of files) {
      const filepath = join(dir, file);

      try {
        await esbuild.build({
          entryPoints: [filepath],
          bundle: false,
          write: false,
          platform: 'node',
          format: 'esm',
          logLevel: 'silent',
        });
      } catch (error) {
        const esbuildError = error as esbuild.BuildFailure;
        if (esbuildError.errors) {
          for (const err of esbuildError.errors) {
            result.errors.push({
              type: 'typescript',
              file: filepath,
              message: err.text,
              line: err.location?.line,
              column: err.location?.column,
            });
          }
        }
      }
    }
  }
}

async function checkReferences(cwd: string, result: CheckResult): Promise<void> {
  const config = await loadConfig(cwd).catch(() => null);
  if (!config) return;

  // Collect all trigger IDs
  const triggerIds = new Set<string>();
  if (existsSync(config.triggersDir)) {
    const triggerFiles = await glob('**/*.ts', { cwd: config.triggersDir });
    for (const file of triggerFiles) {
      const content = await readFile(join(config.triggersDir, file), 'utf-8');
      const idMatch = content.match(/id:\s*['"]([^'"]+)['"]/);
      if (idMatch) {
        triggerIds.add(idMatch[1]);
      }
    }
  }

  // Collect all tag IDs
  const tagIds = new Set<string>();
  if (existsSync(config.tagsDir)) {
    const tagFiles = await glob('**/*.ts', { cwd: config.tagsDir });
    for (const file of tagFiles) {
      const filepath = join(config.tagsDir, file);
      const content = await readFile(filepath, 'utf-8');

      const idMatch = content.match(/id:\s*['"]([^'"]+)['"]/);
      if (idMatch) {
        tagIds.add(idMatch[1]);
      }

      // Check trigger references
      const triggersMatch = content.match(/triggers:\s*\[([^\]]+)\]/);
      if (triggersMatch) {
        const triggers = triggersMatch[1].match(/['"]([^'"]+)['"]/g) || [];
        for (const trigger of triggers) {
          const triggerId = trigger.replace(/['"]/g, '');
          if (!triggerIds.has(triggerId)) {
            result.errors.push({
              type: 'reference',
              file: filepath,
              message: `References unknown trigger: ${triggerId}`,
            });
          }
        }
      }
    }
  }

  // Check zone tag references
  if (existsSync(config.zonesDir)) {
    const zoneFiles = await glob('**/*.ts', { cwd: config.zonesDir });
    for (const file of zoneFiles) {
      const filepath = join(config.zonesDir, file);
      const content = await readFile(filepath, 'utf-8');

      const tagsMatch = content.match(/tags:\s*\[([^\]]+)\]/);
      if (tagsMatch) {
        const tags = tagsMatch[1].match(/['"]([^'"]+)['"]/g) || [];
        for (const tag of tags) {
          const tagId = tag.replace(/['"]/g, '');
          if (!tagIds.has(tagId)) {
            result.errors.push({
              type: 'reference',
              file: filepath,
              message: `References unknown tag: ${tagId}`,
            });
          }
        }
      }
    }
  }
}

async function checkZonePatterns(cwd: string, result: CheckResult): Promise<void> {
  const config = await loadConfig(cwd).catch(() => null);
  if (!config || !existsSync(config.zonesDir)) return;

  const zoneFiles = await glob('**/*.ts', { cwd: config.zonesDir });

  for (const file of zoneFiles) {
    const filepath = join(config.zonesDir, file);
    const content = await readFile(filepath, 'utf-8');

    const patternsMatch = content.match(/urlPatterns:\s*\[([^\]]+)\]/);
    if (patternsMatch) {
      const patterns = patternsMatch[1].match(/['"]([^'"]+)['"]/g) || [];

      for (const pattern of patterns) {
        const p = pattern.replace(/['"]/g, '');

        // Check for common pattern issues
        if (p === '*' || p === '**') {
          // Valid catch-all
          continue;
        }

        if (p.includes('**') && !p.endsWith('**') && !p.includes('/**')) {
          result.warnings.push({
            type: 'best-practice',
            file: filepath,
            message: `URL pattern "${p}" may not match as expected. Use "/**" for path wildcards.`,
          });
        }

        // Check for potentially slow regex patterns
        if (p.includes('.*.*') || p.includes('.+.+')) {
          result.warnings.push({
            type: 'performance',
            file: filepath,
            message: `URL pattern "${p}" may be slow. Consider simplifying.`,
          });
        }
      }
    }
  }
}

async function checkCircularDependencies(cwd: string, result: CheckResult): Promise<void> {
  const config = await loadConfig(cwd).catch(() => null);
  if (!config) return;

  // Build dependency graph
  const deps = new Map<string, Set<string>>();

  // Collect tag dependencies
  if (existsSync(config.tagsDir)) {
    const tagFiles = await glob('**/*.ts', { cwd: config.tagsDir });

    for (const file of tagFiles) {
      const filepath = join(config.tagsDir, file);
      const content = await readFile(filepath, 'utf-8');

      const idMatch = content.match(/id:\s*['"]([^'"]+)['"]/);
      if (!idMatch) continue;

      const tagId = idMatch[1];
      deps.set(tagId, new Set());

      // Check for explicit dependencies (future feature)
      const depsMatch = content.match(/dependsOn:\s*\[([^\]]+)\]/);
      if (depsMatch) {
        const dependencies = depsMatch[1].match(/['"]([^'"]+)['"]/g) || [];
        for (const dep of dependencies) {
          deps.get(tagId)!.add(dep.replace(/['"]/g, ''));
        }
      }
    }
  }

  // Detect cycles using DFS
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(node: string, path: string[]): string[] | null {
    visited.add(node);
    recursionStack.add(node);

    const neighbors = deps.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const cycle = hasCycle(neighbor, [...path, node]);
        if (cycle) return cycle;
      } else if (recursionStack.has(neighbor)) {
        return [...path, node, neighbor];
      }
    }

    recursionStack.delete(node);
    return null;
  }

  for (const node of deps.keys()) {
    if (!visited.has(node)) {
      const cycle = hasCycle(node, []);
      if (cycle) {
        result.errors.push({
          type: 'circular',
          file: join(config.tagsDir, `${cycle[0]}.ts`),
          message: `Circular dependency detected: ${cycle.join(' -> ')}`,
        });
        break; // Report first cycle found
      }
    }
  }
}

async function checkBestPractices(cwd: string, result: CheckResult): Promise<void> {
  const config = await loadConfig(cwd).catch(() => null);
  if (!config) return;

  // Check for tags without consent configuration
  if (existsSync(config.tagsDir)) {
    const tagFiles = await glob('**/*.ts', { cwd: config.tagsDir });

    for (const file of tagFiles) {
      const filepath = join(config.tagsDir, file);
      const content = await readFile(filepath, 'utf-8');

      if (!content.includes('consent:')) {
        result.warnings.push({
          type: 'best-practice',
          file: filepath,
          message: 'Tag does not specify consent requirements. Consider adding consent categories.',
        });
      }

      // Check for large inline code
      const codeMatch = content.match(/code:\s*`([^`]+)`/s);
      if (codeMatch && codeMatch[1].length > 5000) {
        result.warnings.push({
          type: 'performance',
          file: filepath,
          message: 'Tag code is very large. Consider splitting into separate modules.',
        });
      }

      // Check for hardcoded IDs
      if (content.match(/G-[A-Z0-9]{10}/)) {
        result.warnings.push({
          type: 'best-practice',
          file: filepath,
          message: 'Hardcoded Google Analytics ID detected. Consider using environment variables.',
        });
      }
    }
  }

  // Check for unused triggers
  const usedTriggers = new Set<string>();

  if (existsSync(config.tagsDir)) {
    const tagFiles = await glob('**/*.ts', { cwd: config.tagsDir });
    for (const file of tagFiles) {
      const content = await readFile(join(config.tagsDir, file), 'utf-8');
      const triggersMatch = content.match(/triggers:\s*\[([^\]]+)\]/);
      if (triggersMatch) {
        const triggers = triggersMatch[1].match(/['"]([^'"]+)['"]/g) || [];
        triggers.forEach(t => usedTriggers.add(t.replace(/['"]/g, '')));
      }
    }
  }

  if (existsSync(config.triggersDir)) {
    const triggerFiles = await glob('**/*.ts', { cwd: config.triggersDir });
    for (const file of triggerFiles) {
      const filepath = join(config.triggersDir, file);
      const content = await readFile(filepath, 'utf-8');
      const idMatch = content.match(/id:\s*['"]([^'"]+)['"]/);
      if (idMatch && !usedTriggers.has(idMatch[1])) {
        result.warnings.push({
          type: 'unused',
          file: filepath,
          message: `Trigger "${idMatch[1]}" is not used by any tags.`,
        });
      }
    }
  }
}
