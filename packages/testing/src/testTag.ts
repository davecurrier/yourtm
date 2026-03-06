/**
 * Main testing utility for YourTM tags
 */

import type {
  TagDefinition,
  TestCase,
  TagContext,
  TagExecutionResult,
  RecordedDataLayerPush,
} from './types.js';
import { createMockContext, setupGlobalMocks } from './mocks.js';
import {
  expectTagFired,
  expectNoErrors,
  assertExpectedCalls,
  assertExpectedFetches,
  assertExpectedDataLayerPushes,
} from './assertions.js';

/**
 * Configuration options for tag testing
 */
export interface TestTagOptions {
  /**
   * Timeout for async tags in milliseconds
   */
  timeout?: number;

  /**
   * Whether to capture console output
   */
  captureConsole?: boolean;

  /**
   * Whether to run assertions automatically
   */
  autoAssert?: boolean;

  /**
   * Custom setup function to run before each test
   */
  beforeEach?: () => void | Promise<void>;

  /**
   * Custom teardown function to run after each test
   */
  afterEach?: () => void | Promise<void>;
}

const DEFAULT_OPTIONS: TestTagOptions = {
  timeout: 5000,
  captureConsole: true,
  autoAssert: true,
};

/**
 * Executes a tag in a mock environment and captures all calls
 */
export async function executeTag(
  tag: TagDefinition,
  context: TagContext,
  options: TestTagOptions = {}
): Promise<TagExecutionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { callRecorder, fetchRecorder, cleanup } = setupGlobalMocks();

  // Capture console output
  const consoleOutput: Array<{ level: string; args: unknown[] }> = [];
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  };

  if (opts.captureConsole) {
    console.log = (...args: unknown[]) => {
      consoleOutput.push({ level: 'log', args });
    };
    console.warn = (...args: unknown[]) => {
      consoleOutput.push({ level: 'warn', args });
    };
    console.error = (...args: unknown[]) => {
      consoleOutput.push({ level: 'error', args });
    };
    console.info = (...args: unknown[]) => {
      consoleOutput.push({ level: 'info', args });
    };
    console.debug = (...args: unknown[]) => {
      consoleOutput.push({ level: 'debug', args });
    };
  }

  let success = true;
  let error: Error | undefined;
  const startTime = performance.now();

  try {
    const result = tag.code(context);

    // Handle async tags with timeout
    if (result instanceof Promise) {
      await Promise.race([
        result,
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Tag execution timed out after ${opts.timeout}ms`)),
            opts.timeout
          )
        ),
      ]);
    }
  } catch (e) {
    success = false;
    error = e instanceof Error ? e : new Error(String(e));
  }

  const duration = performance.now() - startTime;

  // Restore console
  if (opts.captureConsole) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
  }

  // Extract dataLayer pushes from the mock dataLayer
  const dataLayerPushes: RecordedDataLayerPush[] = (
    context.dataLayer as { pushes?: RecordedDataLayerPush[] }
  ).pushes || [];

  // Cleanup global mocks
  cleanup();

  return {
    success,
    error,
    duration,
    calls: callRecorder.calls,
    fetches: fetchRecorder.fetches,
    dataLayerPushes,
    consoleOutput,
  };
}

/**
 * Main testing function that creates context, executes tag, and runs assertions
 */
export async function testTag(
  tag: TagDefinition,
  testCase: TestCase,
  options: TestTagOptions = {}
): Promise<TagExecutionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Run setup if provided
  if (testCase.setup) {
    await testCase.setup();
  }

  // Create mock context from test case
  const context = createMockContext({
    dataLayer: testCase.dataLayer,
    page: testCase.page,
    user: testCase.user,
    consent: testCase.consent,
    ecommerce: testCase.ecommerce,
    event: testCase.event,
    eventData: testCase.eventData,
  });

  // Execute the tag
  const result = await executeTag(tag, context, opts);

  // Run automatic assertions if enabled
  if (opts.autoAssert && testCase.expect) {
    // Check success
    if (testCase.expect.success !== undefined) {
      if (testCase.expect.success) {
        expectTagFired(result, tag.name);
      }
    }

    // Check for no errors
    if (testCase.expect.noErrors) {
      expectNoErrors(result);
    }

    // Check expected calls
    if (testCase.expect.calls) {
      assertExpectedCalls(result.calls, testCase.expect.calls);
    }

    // Check expected fetches
    if (testCase.expect.fetches) {
      assertExpectedFetches(result.fetches, testCase.expect.fetches);
    }

    // Check expected dataLayer pushes
    if (testCase.expect.dataLayerPushes) {
      assertExpectedDataLayerPushes(result.dataLayerPushes, testCase.expect.dataLayerPushes);
    }
  }

  // Run teardown if provided
  if (testCase.teardown) {
    await testCase.teardown();
  }

  return result;
}

/**
 * Creates a test suite for a tag with multiple test cases
 */
export function createTagTestSuite(
  tag: TagDefinition,
  testCases: TestCase[],
  options: TestTagOptions = {}
): () => Promise<Map<string, TagExecutionResult>> {
  return async () => {
    const results = new Map<string, TagExecutionResult>();

    // Run beforeEach/afterEach for each test
    for (const testCase of testCases) {
      if (options.beforeEach) {
        await options.beforeEach();
      }

      const result = await testTag(tag, testCase, options);
      results.set(testCase.name, result);

      if (options.afterEach) {
        await options.afterEach();
      }
    }

    return results;
  };
}

/**
 * Runs a quick smoke test on a tag
 */
export async function smokeTest(
  tag: TagDefinition,
  minimalContext?: Partial<TestCase>
): Promise<boolean> {
  try {
    const result = await testTag(
      tag,
      {
        name: 'Smoke test',
        ...minimalContext,
        expect: {
          success: true,
          noErrors: true,
        },
      },
      { autoAssert: true }
    );
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Tests that a tag respects consent settings
 */
export async function testConsentCompliance(
  tag: TagDefinition,
  requiredConsent: 'analytics' | 'marketing' | 'functional' | 'social'
): Promise<{ withConsent: TagExecutionResult; withoutConsent: TagExecutionResult }> {
  // Test with consent granted
  const withConsent = await testTag(
    tag,
    {
      name: `With ${requiredConsent} consent`,
      consent: { [requiredConsent]: true, hasConsented: true },
    },
    { autoAssert: false }
  );

  // Test without consent
  const withoutConsent = await testTag(
    tag,
    {
      name: `Without ${requiredConsent} consent`,
      consent: { [requiredConsent]: false, hasConsented: true },
    },
    { autoAssert: false }
  );

  return { withConsent, withoutConsent };
}

/**
 * Tests tag performance
 */
export async function testPerformance(
  tag: TagDefinition,
  testCase: TestCase,
  iterations = 100
): Promise<{
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}> {
  const durations: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const result = await testTag(tag, testCase, { autoAssert: false });
    durations.push(result.duration);
  }

  durations.sort((a, b) => a - b);

  const sum = durations.reduce((a, b) => a + b, 0);
  const percentile = (p: number) => durations[Math.floor(durations.length * p)];

  return {
    min: durations[0],
    max: durations[durations.length - 1],
    avg: sum / durations.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
  };
}

/**
 * Helper to create a simple tag definition for testing
 */
export function defineTag(
  name: string,
  code: (context: TagContext) => void | Promise<void>,
  options: Partial<Omit<TagDefinition, 'name' | 'code'>> = {}
): TagDefinition {
  return {
    name,
    code,
    ...options,
  };
}
