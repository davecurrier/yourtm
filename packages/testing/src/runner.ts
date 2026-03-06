/**
 * Test runner integration for Vitest
 */

import type {
  TagDefinition,
  TestCase,
  TagExecutionResult,
} from './types.js';
import { testTag, type TestTagOptions } from './testTag.js';

// Vitest types
type DescribeFn = (name: string, fn: () => void) => void;
type ItFn = (name: string, fn: () => void | Promise<void>) => void;
type BeforeEachFn = (fn: () => void | Promise<void>) => void;
type AfterEachFn = (fn: () => void | Promise<void>) => void;
type ExpectFn = (value: unknown) => {
  toBe: (expected: unknown) => void;
  toEqual: (expected: unknown) => void;
  toBeTruthy: () => void;
  toBeFalsy: () => void;
  toBeGreaterThan: (expected: number) => void;
  toBeLessThan: (expected: number) => void;
  toBeUndefined: () => void;
  toBeDefined: () => void;
  toContain: (expected: unknown) => void;
  toHaveLength: (expected: number) => void;
  toThrow: (expected?: string | RegExp) => void;
  not: {
    toBe: (expected: unknown) => void;
    toEqual: (expected: unknown) => void;
    toBeTruthy: () => void;
    toBeFalsy: () => void;
    toBeUndefined: () => void;
    toBeDefined: () => void;
    toContain: (expected: unknown) => void;
    toThrow: (expected?: string | RegExp) => void;
  };
};

/**
 * Gets Vitest globals from the environment
 */
function getVitestGlobals(): {
  describe: DescribeFn;
  it: ItFn;
  beforeEach: BeforeEachFn;
  afterEach: AfterEachFn;
  expect: ExpectFn;
} {
  const g = globalThis as Record<string, unknown>;

  if (!g.describe || !g.it || !g.expect) {
    throw new Error(
      'Vitest globals not found. Make sure you are running tests with Vitest and globals are enabled.'
    );
  }

  return {
    describe: g.describe as DescribeFn,
    it: g.it as ItFn,
    beforeEach: g.beforeEach as BeforeEachFn,
    afterEach: g.afterEach as AfterEachFn,
    expect: g.expect as ExpectFn,
  };
}

/**
 * Creates a Vitest test suite for a tag
 */
export function describeTag(
  tag: TagDefinition,
  testCases: TestCase[],
  options: TestTagOptions = {}
): void {
  const { describe, it, beforeEach, afterEach, expect } = getVitestGlobals();

  describe(tag.name, () => {
    if (options.beforeEach) {
      beforeEach(options.beforeEach);
    }

    if (options.afterEach) {
      afterEach(options.afterEach);
    }

    for (const testCase of testCases) {
      it(testCase.name, async () => {
        const result = await testTag(tag, testCase, options);

        // Additional Vitest assertions for better error messages
        if (testCase.expect?.success) {
          expect(result.success).toBe(true);
        }

        if (testCase.expect?.noErrors) {
          expect(result.error).toBeUndefined();
        }
      });
    }
  });
}

/**
 * Formats test results for console output
 */
export function formatTestResult(
  tagName: string,
  testName: string,
  result: TagExecutionResult
): string {
  const status = result.success ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  const duration = `${result.duration.toFixed(2)}ms`;

  let output = `${status} ${tagName} > ${testName} (${duration})`;

  if (!result.success && result.error) {
    output += `\n  Error: ${result.error.message}`;
  }

  if (result.calls.length > 0) {
    output += `\n  Calls: ${result.calls.map((c) => c.fn).join(', ')}`;
  }

  if (result.fetches.length > 0) {
    output += `\n  Fetches: ${result.fetches.map((f) => f.url).join(', ')}`;
  }

  return output;
}

/**
 * Formats test results as a summary table
 */
export function formatTestSummary(
  results: Map<string, TagExecutionResult>
): string {
  const passed = Array.from(results.values()).filter((r) => r.success).length;
  const failed = results.size - passed;
  const totalDuration = Array.from(results.values()).reduce(
    (sum, r) => sum + r.duration,
    0
  );

  const lines: string[] = [];
  lines.push('');
  lines.push('\x1b[1mTest Summary\x1b[0m');
  lines.push('─'.repeat(50));

  for (const [name, result] of results) {
    const icon = result.success ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    const duration = `${result.duration.toFixed(2)}ms`;
    lines.push(`${icon} ${name} (${duration})`);

    if (!result.success && result.error) {
      lines.push(`  \x1b[31mError: ${result.error.message}\x1b[0m`);
    }
  }

  lines.push('─'.repeat(50));
  lines.push(
    `\x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m (${totalDuration.toFixed(2)}ms)`
  );
  lines.push('');

  return lines.join('\n');
}

/**
 * Coverage helper - tracks which tags have been tested
 */
export class TagCoverage {
  private testedTags = new Set<string>();
  private allTags = new Set<string>();

  /**
   * Register all tags that should be tested
   */
  registerTags(tags: TagDefinition[]): void {
    for (const tag of tags) {
      this.allTags.add(tag.name);
    }
  }

  /**
   * Mark a tag as tested
   */
  markTested(tagName: string): void {
    this.testedTags.add(tagName);
  }

  /**
   * Get coverage percentage
   */
  getCoverage(): number {
    if (this.allTags.size === 0) return 100;
    return (this.testedTags.size / this.allTags.size) * 100;
  }

  /**
   * Get untested tags
   */
  getUntestedTags(): string[] {
    return Array.from(this.allTags).filter((tag) => !this.testedTags.has(tag));
  }

  /**
   * Get coverage report
   */
  getReport(): string {
    const coverage = this.getCoverage();
    const untested = this.getUntestedTags();

    const lines: string[] = [];
    lines.push('');
    lines.push('\x1b[1mTag Coverage Report\x1b[0m');
    lines.push('─'.repeat(50));
    lines.push(`Coverage: ${coverage.toFixed(1)}% (${this.testedTags.size}/${this.allTags.size} tags)`);

    if (untested.length > 0) {
      lines.push('');
      lines.push('\x1b[33mUntested Tags:\x1b[0m');
      for (const tag of untested) {
        lines.push(`  - ${tag}`);
      }
    }

    lines.push('─'.repeat(50));
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Reset coverage tracking
   */
  reset(): void {
    this.testedTags.clear();
    this.allTags.clear();
  }
}

/**
 * Global coverage tracker instance
 */
export const tagCoverage = new TagCoverage();

/**
 * Test runner that integrates with Vitest and tracks coverage
 */
export async function runTagTests(
  tag: TagDefinition,
  testCases: TestCase[],
  options: TestTagOptions = {}
): Promise<{
  results: Map<string, TagExecutionResult>;
  passed: number;
  failed: number;
  duration: number;
}> {
  const results = new Map<string, TagExecutionResult>();
  let passed = 0;
  let failed = 0;
  const startTime = performance.now();

  for (const testCase of testCases) {
    if (options.beforeEach) {
      await options.beforeEach();
    }

    try {
      const result = await testTag(tag, testCase, options);
      results.set(testCase.name, result);

      if (result.success) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      results.set(testCase.name, {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: 0,
        calls: [],
        fetches: [],
        dataLayerPushes: [],
        consoleOutput: [],
      });
      failed++;
    }

    if (options.afterEach) {
      await options.afterEach();
    }
  }

  const duration = performance.now() - startTime;

  // Track coverage
  tagCoverage.markTested(tag.name);

  return { results, passed, failed, duration };
}

/**
 * Creates a test helper that runs in Vitest
 */
export function createTagTest(
  tag: TagDefinition,
  options: TestTagOptions = {}
): (testCase: TestCase) => Promise<TagExecutionResult> {
  return async (testCase: TestCase) => {
    const result = await testTag(tag, testCase, options);
    tagCoverage.markTested(tag.name);
    return result;
  };
}

/**
 * Vitest matcher for tag execution results
 */
export function createTagMatchers() {
  return {
    toHaveFired(received: TagExecutionResult) {
      const pass = received.success;
      return {
        pass,
        message: () =>
          pass
            ? `Expected tag not to have fired, but it did`
            : `Expected tag to have fired, but it failed${
                received.error ? `: ${received.error.message}` : ''
              }`,
      };
    },

    toHaveCalled(received: TagExecutionResult, fn: string, args?: unknown[]) {
      const calls = received.calls.filter((c) => c.fn === fn);
      const hasCall = calls.length > 0;
      const hasMatchingArgs =
        !args ||
        calls.some((c) => JSON.stringify(c.args) === JSON.stringify(args));

      const pass = hasCall && hasMatchingArgs;

      return {
        pass,
        message: () => {
          if (!hasCall) {
            return `Expected ${fn} to be called, but it was never called`;
          }
          if (!hasMatchingArgs) {
            return `Expected ${fn} to be called with ${JSON.stringify(args)}, but got ${calls.map((c) => JSON.stringify(c.args)).join(', ')}`;
          }
          return `Expected ${fn} not to be called`;
        },
      };
    },

    toHaveFetched(received: TagExecutionResult, url: string | RegExp) {
      const match =
        typeof url === 'string'
          ? received.fetches.some((f) => f.url.includes(url))
          : received.fetches.some((f) => url.test(f.url));

      return {
        pass: match,
        message: () =>
          match
            ? `Expected not to fetch ${url}`
            : `Expected to fetch ${url}, but got ${received.fetches.map((f) => f.url).join(', ')}`,
      };
    },
  };
}
