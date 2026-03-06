/**
 * Custom assertions for YourTM tag testing
 */

import type {
  RecordedCall,
  RecordedFetch,
  RecordedDataLayerPush,
  TagExecutionResult,
  ExpectedCall,
  ExpectedFetch,
} from './types.js';

/**
 * Assertion error with detailed message
 */
export class TagAssertionError extends Error {
  constructor(
    message: string,
    public expected: unknown,
    public actual: unknown
  ) {
    super(message);
    this.name = 'TagAssertionError';
  }
}

/**
 * Asserts that a tag fired successfully
 */
export function expectTagFired(
  result: TagExecutionResult,
  tagName?: string
): void {
  if (!result.success) {
    throw new TagAssertionError(
      `Expected tag${tagName ? ` "${tagName}"` : ''} to fire successfully, but it failed${
        result.error ? `: ${result.error.message}` : ''
      }`,
      { success: true },
      { success: false, error: result.error?.message }
    );
  }
}

/**
 * Asserts that a tag failed to fire
 */
export function expectTagFailed(
  result: TagExecutionResult,
  tagName?: string
): void {
  if (result.success) {
    throw new TagAssertionError(
      `Expected tag${tagName ? ` "${tagName}"` : ''} to fail, but it succeeded`,
      { success: false },
      { success: true }
    );
  }
}

/**
 * Deep equality comparison for assertion matching
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object') {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => deepEqual(item, b[index]));
    }
    if (Array.isArray(a) !== Array.isArray(b)) return false;

    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
  }

  return false;
}

/**
 * Partial match - checks if actual contains all properties of expected
 */
function partialMatch(expected: unknown, actual: unknown): boolean {
  if (expected === actual) return true;
  if (expected === null || actual === null) return expected === actual;
  if (typeof expected !== typeof actual) return false;

  if (typeof expected === 'object') {
    if (Array.isArray(expected) && Array.isArray(actual)) {
      if (expected.length !== actual.length) return false;
      return expected.every((item, index) => partialMatch(item, actual[index]));
    }
    if (Array.isArray(expected) !== Array.isArray(actual)) return false;

    const expectedObj = expected as Record<string, unknown>;
    const actualObj = actual as Record<string, unknown>;

    // Check that all expected properties exist in actual
    return Object.keys(expectedObj).every((key) =>
      partialMatch(expectedObj[key], actualObj[key])
    );
  }

  return false;
}

/**
 * Asserts that a specific function was called with expected arguments
 */
export function expectCall(
  calls: RecordedCall[],
  fn: string,
  expectedArgs?: unknown[],
  options: { exact?: boolean; nth?: number } = {}
): void {
  const { exact = false, nth } = options;
  const fnCalls = calls.filter((c) => c.fn === fn);

  if (fnCalls.length === 0) {
    throw new TagAssertionError(
      `Expected ${fn} to be called, but it was never called`,
      { fn, called: true },
      { fn, called: false }
    );
  }

  if (nth !== undefined) {
    if (nth >= fnCalls.length) {
      throw new TagAssertionError(
        `Expected ${fn} to be called at least ${nth + 1} times, but it was only called ${fnCalls.length} times`,
        { callCount: nth + 1 },
        { callCount: fnCalls.length }
      );
    }
    const call = fnCalls[nth];
    if (expectedArgs !== undefined) {
      const matcher = exact ? deepEqual : partialMatch;
      if (!matcher(expectedArgs, call.args)) {
        throw new TagAssertionError(
          `Expected ${fn} call #${nth + 1} to have args matching:\n${JSON.stringify(expectedArgs, null, 2)}\n\nBut got:\n${JSON.stringify(call.args, null, 2)}`,
          expectedArgs,
          call.args
        );
      }
    }
    return;
  }

  if (expectedArgs !== undefined) {
    const matcher = exact ? deepEqual : partialMatch;
    const matchingCall = fnCalls.find((c) => matcher(expectedArgs, c.args));
    if (!matchingCall) {
      throw new TagAssertionError(
        `Expected ${fn} to be called with args matching:\n${JSON.stringify(expectedArgs, null, 2)}\n\nActual calls:\n${fnCalls.map((c) => JSON.stringify(c.args)).join('\n')}`,
        expectedArgs,
        fnCalls.map((c) => c.args)
      );
    }
  }
}

/**
 * Asserts that a function was NOT called
 */
export function expectNotCalled(calls: RecordedCall[], fn: string): void {
  const fnCalls = calls.filter((c) => c.fn === fn);
  if (fnCalls.length > 0) {
    throw new TagAssertionError(
      `Expected ${fn} to not be called, but it was called ${fnCalls.length} times`,
      { fn, called: false },
      { fn, called: true, callCount: fnCalls.length }
    );
  }
}

/**
 * Asserts that a function was called a specific number of times
 */
export function expectCallCount(
  calls: RecordedCall[],
  fn: string,
  count: number
): void {
  const fnCalls = calls.filter((c) => c.fn === fn);
  if (fnCalls.length !== count) {
    throw new TagAssertionError(
      `Expected ${fn} to be called ${count} times, but it was called ${fnCalls.length} times`,
      { callCount: count },
      { callCount: fnCalls.length }
    );
  }
}

/**
 * Asserts that fetch was called with expected URL and options
 */
export function expectFetch(
  fetches: RecordedFetch[],
  expected: ExpectedFetch | string
): void {
  const expectedFetch: ExpectedFetch =
    typeof expected === 'string' ? { url: expected } : expected;

  if (fetches.length === 0) {
    throw new TagAssertionError(
      `Expected fetch to be called, but no fetches were recorded`,
      { fetched: true },
      { fetched: false }
    );
  }

  const matchingFetch = fetches.find((f) => {
    // Match URL
    if (typeof expectedFetch.url === 'string') {
      if (!f.url.includes(expectedFetch.url)) return false;
    } else {
      if (!expectedFetch.url.test(f.url)) return false;
    }

    // Match method if specified
    if (expectedFetch.method) {
      const actualMethod = f.options?.method || 'GET';
      if (actualMethod.toUpperCase() !== expectedFetch.method.toUpperCase()) {
        return false;
      }
    }

    // Match body if specified
    if (expectedFetch.body !== undefined) {
      let actualBody = f.options?.body;
      if (typeof actualBody === 'string') {
        try {
          actualBody = JSON.parse(actualBody);
        } catch {
          // Keep as string
        }
      }
      if (!partialMatch(expectedFetch.body, actualBody)) {
        return false;
      }
    }

    // Match headers if specified
    if (expectedFetch.headers) {
      const actualHeaders = f.options?.headers as
        | Record<string, string>
        | undefined;
      if (!actualHeaders) return false;
      for (const [key, value] of Object.entries(expectedFetch.headers)) {
        if (actualHeaders[key] !== value) return false;
      }
    }

    return true;
  });

  if (!matchingFetch) {
    throw new TagAssertionError(
      `Expected fetch matching:\n${JSON.stringify(expectedFetch, null, 2)}\n\nActual fetches:\n${fetches.map((f) => JSON.stringify({ url: f.url, options: f.options })).join('\n')}`,
      expectedFetch,
      fetches
    );
  }
}

/**
 * Asserts that no fetch calls were made
 */
export function expectNoFetch(fetches: RecordedFetch[]): void {
  if (fetches.length > 0) {
    throw new TagAssertionError(
      `Expected no fetch calls, but ${fetches.length} were made:\n${fetches.map((f) => f.url).join('\n')}`,
      { fetchCount: 0 },
      { fetchCount: fetches.length }
    );
  }
}

/**
 * Asserts that dataLayer was pushed with expected data
 */
export function expectDataLayerPush(
  pushes: RecordedDataLayerPush[],
  expectedData: Record<string, unknown>,
  options: { exact?: boolean } = {}
): void {
  const { exact = false } = options;

  if (pushes.length === 0) {
    throw new TagAssertionError(
      `Expected dataLayer.push to be called, but no pushes were recorded`,
      { pushed: true },
      { pushed: false }
    );
  }

  const matcher = exact ? deepEqual : partialMatch;
  const matchingPush = pushes.find((p) => matcher(expectedData, p.data));

  if (!matchingPush) {
    throw new TagAssertionError(
      `Expected dataLayer.push with data matching:\n${JSON.stringify(expectedData, null, 2)}\n\nActual pushes:\n${pushes.map((p) => JSON.stringify(p.data)).join('\n')}`,
      expectedData,
      pushes.map((p) => p.data)
    );
  }
}

/**
 * Asserts that no errors occurred during tag execution
 */
export function expectNoErrors(result: TagExecutionResult): void {
  if (result.error) {
    throw new TagAssertionError(
      `Expected no errors, but got: ${result.error.message}`,
      { hasError: false },
      { hasError: true, error: result.error.message }
    );
  }

  const errorLogs = result.consoleOutput.filter((c) => c.level === 'error');
  if (errorLogs.length > 0) {
    throw new TagAssertionError(
      `Expected no console errors, but got ${errorLogs.length}:\n${errorLogs.map((e) => JSON.stringify(e.args)).join('\n')}`,
      { consoleErrors: 0 },
      { consoleErrors: errorLogs.length }
    );
  }
}

/**
 * Asserts that a console message was logged
 */
export function expectConsoleLog(
  result: TagExecutionResult,
  level: 'log' | 'warn' | 'error' | 'info' | 'debug',
  message?: string | RegExp
): void {
  const logs = result.consoleOutput.filter((c) => c.level === level);

  if (logs.length === 0) {
    throw new TagAssertionError(
      `Expected console.${level} to be called, but it was never called`,
      { [level]: true },
      { [level]: false }
    );
  }

  if (message !== undefined) {
    const matchingLog = logs.find((log) => {
      const logMessage = log.args.map(String).join(' ');
      if (typeof message === 'string') {
        return logMessage.includes(message);
      }
      return message.test(logMessage);
    });

    if (!matchingLog) {
      throw new TagAssertionError(
        `Expected console.${level} with message matching "${message}", but got:\n${logs.map((l) => l.args.map(String).join(' ')).join('\n')}`,
        { message },
        logs.map((l) => l.args)
      );
    }
  }
}

/**
 * Asserts multiple expected calls match (for use in testTag)
 */
export function assertExpectedCalls(
  calls: RecordedCall[],
  expectedCalls: ExpectedCall[]
): void {
  for (const expected of expectedCalls) {
    const [fn, ...args] = expected;
    expectCall(calls, fn, args);
  }
}

/**
 * Asserts multiple expected fetches match
 */
export function assertExpectedFetches(
  fetches: RecordedFetch[],
  expectedFetches: ExpectedFetch[]
): void {
  for (const expected of expectedFetches) {
    expectFetch(fetches, expected);
  }
}

/**
 * Asserts multiple expected dataLayer pushes match
 */
export function assertExpectedDataLayerPushes(
  pushes: RecordedDataLayerPush[],
  expectedPushes: Record<string, unknown>[]
): void {
  for (const expected of expectedPushes) {
    expectDataLayerPush(pushes, expected);
  }
}
