import ora from 'ora';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import { Compiler } from '../compiler/index.js';

interface AuditOptions {
  fix?: boolean;
}

interface AuditResult {
  errors: AuditIssue[];
  warnings: AuditIssue[];
  performance: AuditIssue[];
  redundancy: AuditIssue[];
}

interface AuditIssue {
  type: string;
  file: string;
  message: string;
  line?: number;
  column?: number;
}

export async function auditCommand(_options: AuditOptions = {}): Promise<void> {
  const cwd = process.cwd();

  logger.header('YourTM System Audit');
  logger.newline();

  const spinner = ora('Analyzing project structure...').start();
  const result: AuditResult = { 
    errors: [], 
    warnings: [], 
    performance: [],
    redundancy: [] 
  };

  try {
    const config = await loadConfig(cwd);
    const compiler = new Compiler(config);
    const compileResult = await compiler.compile();

    // 1. Redundancy Detection (DRY Checks)
    spinner.text = 'Checking for redundancy...';
    checkRedundancy(compileResult, result);

    // 2. Performance Analysis
    spinner.text = 'Analyzing performance...';
    checkPerformance(compileResult, result);

    // 3. Best Practices & Linting
    spinner.text = 'Checking best practices...';
    checkBestPractices(compileResult, result);

    // 4. Reference Integrity
    spinner.text = 'Validating references...';
    checkReferenceIntegrity(compileResult, result);

    spinner.stop();

    // Print Results
    if (result.redundancy.length > 0) {
      logger.warn('Redundancy Detected:');
      result.redundancy.forEach(issue => {
        console.log(logger.chalk.yellow(`  ⚠️  ${issue.message}`));
      });
      logger.newline();
    }

    if (result.performance.length > 0) {
      logger.info('Performance Insights:');
      result.performance.forEach(issue => {
        console.log(logger.chalk.cyan(`  ⚡ ${issue.message}`));
      });
      logger.newline();
    }

    if (result.errors.length > 0) {
      logger.error(`Critical Issues (${result.errors.length}):`);
      result.errors.forEach(err => {
        console.log(logger.chalk.red(`  ❌ [${err.type}] ${err.message}`));
      });
      logger.newline();
    }

    if (result.errors.length === 0 && result.redundancy.length === 0 && result.performance.length === 0) {
      logger.success('Audit complete! Your project is clean and optimized.');
    } else {
      logger.divider();
      logger.info('Audit finished with findings. Check the logs above.');
    }

    logger.newline();

    if (result.errors.length > 0) {
      process.exit(1);
    }

  } catch (error) {
    spinner.fail('Audit failed');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Common patterns that should use variables instead of direct access
 */
const VARIABLE_PATTERNS: Array<{ pattern: RegExp; variableName: string; description: string }> = [
  { pattern: /document\.title/g, variableName: 'Page Title', description: 'document.title' },
  { pattern: /window\.location\.href/g, variableName: 'Page URL', description: 'window.location.href' },
  { pattern: /location\.href/g, variableName: 'Page URL', description: 'location.href' },
  { pattern: /window\.location\.pathname/g, variableName: 'Page Path', description: 'window.location.pathname' },
  { pattern: /location\.pathname/g, variableName: 'Page Path', description: 'location.pathname' },
  { pattern: /window\.location\.hostname/g, variableName: 'Page Hostname', description: 'window.location.hostname' },
  { pattern: /document\.referrer/g, variableName: 'Page Referrer', description: 'document.referrer' },
];

/**
 * DRY Logic: Detect multiple variables pointing to the same source
 */
function checkRedundancy(compileResult: any, result: AuditResult): void {
  const vars = compileResult.variables || [];
  const tags = compileResult.tags || [];

  // Check if tags are bypassing variables by accessing values directly
  const availableVariables = new Set(vars.map((v: any) => v.name));

  tags.forEach((tag: any) => {
    // Get the tag's execute function as string
    const executeCode = tag.execute?.toString() || '';
    const setupCode = tag.setup?.toString() || '';
    const tagCode = executeCode + setupCode;

    VARIABLE_PATTERNS.forEach(({ pattern, variableName, description }) => {
      // Only flag if we have a variable defined for this
      if (availableVariables.has(variableName) && pattern.test(tagCode)) {
        result.redundancy.push({
          type: 'dry',
          file: tag.id || tag.name,
          message: `Tag '${tag.name}' uses ${description} directly. Consider using the '${variableName}' variable instead.`
        });
      }
    });
  });

  // Track sources for variable-to-variable redundancy
  const dataLayerPaths = new Map<string, string[]>();
  const cookieNames = new Map<string, string[]>();
  const storageKeys = new Map<string, string[]>();
  const functionHashes = new Map<string, string[]>();

  vars.forEach((v: any) => {
    // Check DataLayer Paths
    if (v.type === 'datalayer' && v.path) {
      const existing = dataLayerPaths.get(v.path) || [];
      dataLayerPaths.set(v.path, [...existing, v.name]);
    }

    // Check Cookies
    if (v.type === 'cookie' && v.cookieName) {
      const existing = cookieNames.get(v.cookieName) || [];
      cookieNames.set(v.cookieName, [...existing, v.name]);
    }

    // Check LocalStorage
    if (v.type === 'localStorage' && v.storageKey) {
      const existing = storageKeys.get(v.storageKey) || [];
      storageKeys.set(v.storageKey, [...existing, v.name]);
    }

    // Check Computed Logic (Functional DRY)
    if (v.compute) {
      const hash = v.compute.toString().replace(/\s+/g, '');
      const existing = functionHashes.get(hash) || [];
      functionHashes.set(hash, [...existing, v.name]);
    }
  });

  // Report Collisions
  dataLayerPaths.forEach((names, path) => {
    if (names.length > 1) {
      result.redundancy.push({
        type: 'dry',
        file: 'variables',
        message: `Variables ${names.map(n => `'${n}'`).join(' and ')} both read from dataLayer path '${path}'`
      });
    }
  });

  cookieNames.forEach((names, cookie) => {
    if (names.length > 1) {
      result.redundancy.push({
        type: 'dry',
        file: 'variables',
        message: `Variables ${names.map(n => `'${n}'`).join(' and ')} both read from cookie '${cookie}'`
      });
    }
  });

  functionHashes.forEach((names, _hash) => {
    if (names.length > 1) {
      result.redundancy.push({
        type: 'dry',
        file: 'variables',
        message: `Variables ${names.map(n => `'${n}'`).join(' and ')} have identical compute logic.`
      });
    }
  });
}

function checkPerformance(compileResult: any, result: AuditResult): void {
  // Check bundle sizes
  compileResult.bundles.forEach((b: any) => {
    if (b.size > 50000) { // 50KB
      result.performance.push({
        type: 'size',
        file: b.name,
        message: `Bundle '${b.name}' is large (${(b.size / 1024).toFixed(1)}KB). Consider using more specific zones.`
      });
    }
  });

  // Check for too many tags on one trigger
  const triggerTagCount = new Map<string, number>();
  compileResult.tags.forEach((t: any) => {
    t.triggers.forEach((trId: string) => {
      triggerTagCount.set(trId, (triggerTagCount.get(trId) || 0) + 1);
    });
  });

  triggerTagCount.forEach((count, trId) => {
    if (count > 10) {
      result.performance.push({
        type: 'execution',
        file: 'tags',
        message: `Trigger '${trId}' fires ${count} tags. This may impact page performance.`
      });
    }
  });
}

function checkBestPractices(compileResult: any, result: AuditResult): void {
  compileResult.tags.forEach((t: any) => {
    // Check for missing consent
    if (!t.consent || t.consent.length === 0) {
      result.warnings.push({
        type: 'privacy',
        file: t.id,
        message: `Tag '${t.name}' has no consent categories defined. Defaults to 'essential'.`
      });
    }
  });
}

function checkReferenceIntegrity(compileResult: any, result: AuditResult): void {
  // Use errors from compiler
  compileResult.errors.forEach((err: any) => {
    result.errors.push({
      type: 'compile',
      file: err.file,
      message: err.message
    });
  });
}
