/**
 * Mock implementations for YourTM tag testing
 */

import type {
  TagContext,
  DataLayer,
  PageContext,
  UserContext,
  ConsentState,
  MockContextOptions,
  RecordedCall,
  RecordedFetch,
  RecordedDataLayerPush,
  CallRecorder,
  FetchRecorder,
} from './types.js';

/**
 * Creates a mock DataLayer with get/push capabilities
 */
export function createMockDataLayer(
  initialData: Record<string, unknown> = {}
): DataLayer & { pushes: RecordedDataLayerPush[] } {
  const data: Record<string, unknown> = { ...initialData };
  const pushes: RecordedDataLayerPush[] = [];

  return {
    pushes,
    get(key: string): unknown {
      // Support dot notation for nested keys
      const parts = key.split('.');
      let value: unknown = data;
      for (const part of parts) {
        if (value === null || value === undefined) {
          return undefined;
        }
        value = (value as Record<string, unknown>)[part];
      }
      return value;
    },
    push(newData: Record<string, unknown>): void {
      pushes.push({
        data: { ...newData },
        timestamp: Date.now(),
      });
      // Merge new data into existing data
      for (const [key, value] of Object.entries(newData)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          data[key] = {
            ...(data[key] as Record<string, unknown> || {}),
            ...value,
          };
        } else {
          data[key] = value;
        }
      }
    },
    getAll(): Record<string, unknown> {
      return { ...data };
    },
    clear(): void {
      for (const key of Object.keys(data)) {
        delete data[key];
      }
      pushes.length = 0;
    },
  };
}

/**
 * Creates a mock consent state
 */
export function createMockConsent(
  overrides: Partial<ConsentState> = {}
): ConsentState {
  return {
    analytics: true,
    marketing: true,
    functional: true,
    social: true,
    hasConsented: true,
    ...overrides,
  };
}

/**
 * Creates a mock page context
 */
export function createMockPage(overrides: Partial<PageContext> = {}): PageContext {
  const defaultUrl = 'https://example.com/page?utm_source=test';
  const url = new URL(overrides.url || defaultUrl);

  return {
    url: url.href,
    hostname: url.hostname,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    title: 'Test Page',
    referrer: 'https://google.com',
    ...overrides,
  };
}

/**
 * Creates a mock user context
 */
export function createMockUser(overrides: Partial<UserContext> = {}): UserContext {
  return {
    isLoggedIn: false,
    ...overrides,
  };
}

/**
 * Creates a complete mock TagContext
 */
export function createMockContext(options: MockContextOptions = {}): TagContext {
  const dataLayer = createMockDataLayer(options.dataLayer);

  return {
    dataLayer,
    page: createMockPage(options.page),
    user: createMockUser(options.user),
    consent: createMockConsent(options.consent),
    ecommerce: options.ecommerce,
    event: options.event,
    eventData: options.eventData,
    timestamp: Date.now(),
    containerId: options.containerId || 'YTM-TEST123',
  };
}

/**
 * Creates a call recorder for tracking function invocations
 */
export function createCallRecorder(): CallRecorder {
  const calls: RecordedCall[] = [];

  return {
    calls,
    record(fn: string, args: unknown[]): void {
      calls.push({
        fn,
        args: [...args],
        timestamp: Date.now(),
      });
    },
    getCalls(fn?: string): RecordedCall[] {
      if (fn) {
        return calls.filter((c) => c.fn === fn);
      }
      return [...calls];
    },
    clear(): void {
      calls.length = 0;
    },
  };
}

/**
 * Creates a fetch recorder for tracking network requests
 */
export function createFetchRecorder(): FetchRecorder {
  const fetches: RecordedFetch[] = [];

  return {
    fetches,
    record(url: string, options?: RequestInit): void {
      fetches.push({
        url,
        options: options ? { ...options } : undefined,
        timestamp: Date.now(),
      });
    },
    getFetches(urlPattern?: string | RegExp): RecordedFetch[] {
      if (urlPattern) {
        if (typeof urlPattern === 'string') {
          return fetches.filter((f) => f.url.includes(urlPattern));
        }
        return fetches.filter((f) => urlPattern.test(f.url));
      }
      return [...fetches];
    },
    clear(): void {
      fetches.length = 0;
    },
  };
}

// Global recorders for mock functions
let globalCallRecorder: CallRecorder | null = null;
let globalFetchRecorder: FetchRecorder | null = null;
let originalFetch: typeof globalThis.fetch | null = null;

/**
 * Sets up global mock functions and returns cleanup function
 */
export function setupGlobalMocks(): {
  callRecorder: CallRecorder;
  fetchRecorder: FetchRecorder;
  cleanup: () => void;
} {
  globalCallRecorder = createCallRecorder();
  globalFetchRecorder = createFetchRecorder();

  // Store original fetch
  if (typeof globalThis.fetch !== 'undefined') {
    originalFetch = globalThis.fetch;
  }

  // Mock fetch
  (globalThis as Record<string, unknown>).fetch = (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    globalFetchRecorder!.record(url, init);
    return Promise.resolve(new Response('{}', { status: 200 }));
  };

  // Mock gtag
  (globalThis as Record<string, unknown>).gtag = (...args: unknown[]): void => {
    globalCallRecorder!.record('gtag', args);
  };

  // Mock dataLayer.push (Google style)
  (globalThis as Record<string, unknown>).dataLayer = [];
  const dataLayerArray = (globalThis as unknown as { dataLayer: unknown[] }).dataLayer;
  const originalPush = dataLayerArray.push.bind(dataLayerArray);
  dataLayerArray.push = (...args: unknown[]): number => {
    for (const arg of args) {
      globalCallRecorder!.record('dataLayer.push', [arg]);
    }
    return originalPush(...args);
  };

  // Mock fbq (Meta Pixel)
  (globalThis as Record<string, unknown>).fbq = (...args: unknown[]): void => {
    globalCallRecorder!.record('fbq', args);
  };

  // Mock ttq (TikTok Pixel)
  (globalThis as Record<string, unknown>).ttq = {
    track: (...args: unknown[]): void => {
      globalCallRecorder!.record('ttq.track', args);
    },
    page: (...args: unknown[]): void => {
      globalCallRecorder!.record('ttq.page', args);
    },
    identify: (...args: unknown[]): void => {
      globalCallRecorder!.record('ttq.identify', args);
    },
  };

  // Mock lintrk (LinkedIn)
  (globalThis as Record<string, unknown>).lintrk = (...args: unknown[]): void => {
    globalCallRecorder!.record('lintrk', args);
  };

  // Mock pinterest tag
  (globalThis as Record<string, unknown>).pintrk = (...args: unknown[]): void => {
    globalCallRecorder!.record('pintrk', args);
  };

  // Mock Twitter/X pixel
  (globalThis as Record<string, unknown>).twq = (...args: unknown[]): void => {
    globalCallRecorder!.record('twq', args);
  };

  // Mock Snap pixel
  (globalThis as Record<string, unknown>).snaptr = (...args: unknown[]): void => {
    globalCallRecorder!.record('snaptr', args);
  };

  const cleanup = (): void => {
    if (originalFetch) {
      (globalThis as Record<string, unknown>).fetch = originalFetch;
      originalFetch = null;
    }
    delete (globalThis as Record<string, unknown>).gtag;
    delete (globalThis as Record<string, unknown>).dataLayer;
    delete (globalThis as Record<string, unknown>).fbq;
    delete (globalThis as Record<string, unknown>).ttq;
    delete (globalThis as Record<string, unknown>).lintrk;
    delete (globalThis as Record<string, unknown>).pintrk;
    delete (globalThis as Record<string, unknown>).twq;
    delete (globalThis as Record<string, unknown>).snaptr;
    globalCallRecorder = null;
    globalFetchRecorder = null;
  };

  return {
    callRecorder: globalCallRecorder,
    fetchRecorder: globalFetchRecorder,
    cleanup,
  };
}

/**
 * Creates a mock gtag function
 */
export function mockGtag(): {
  gtag: (...args: unknown[]) => void;
  getCalls: () => RecordedCall[];
  clear: () => void;
} {
  const recorder = createCallRecorder();

  const gtag = (...args: unknown[]): void => {
    recorder.record('gtag', args);
  };

  return {
    gtag,
    getCalls: () => recorder.getCalls('gtag'),
    clear: () => recorder.clear(),
  };
}

/**
 * Creates a mock fbq (Meta Pixel) function
 */
export function mockFbq(): {
  fbq: (...args: unknown[]) => void;
  getCalls: () => RecordedCall[];
  clear: () => void;
} {
  const recorder = createCallRecorder();

  const fbq = (...args: unknown[]): void => {
    recorder.record('fbq', args);
  };

  return {
    fbq,
    getCalls: () => recorder.getCalls('fbq'),
    clear: () => recorder.clear(),
  };
}

/**
 * Creates a mock fetch function
 */
export function mockFetch(
  responseData: unknown = {},
  status = 200
): {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  getFetches: (urlPattern?: string | RegExp) => RecordedFetch[];
  clear: () => void;
} {
  const recorder = createFetchRecorder();

  const fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    recorder.record(url, init);
    return Promise.resolve(
      new Response(JSON.stringify(responseData), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  };

  return {
    fetch,
    getFetches: (urlPattern?: string | RegExp) => recorder.getFetches(urlPattern),
    clear: () => recorder.clear(),
  };
}

/**
 * Creates a mock ttq (TikTok Pixel) object
 */
export function mockTtq(): {
  ttq: {
    track: (...args: unknown[]) => void;
    page: (...args: unknown[]) => void;
    identify: (...args: unknown[]) => void;
  };
  getCalls: (method?: string) => RecordedCall[];
  clear: () => void;
} {
  const recorder = createCallRecorder();

  const ttq = {
    track: (...args: unknown[]): void => {
      recorder.record('ttq.track', args);
    },
    page: (...args: unknown[]): void => {
      recorder.record('ttq.page', args);
    },
    identify: (...args: unknown[]): void => {
      recorder.record('ttq.identify', args);
    },
  };

  return {
    ttq,
    getCalls: (method?: string) => {
      if (method) {
        return recorder.getCalls(`ttq.${method}`);
      }
      return recorder.getCalls();
    },
    clear: () => recorder.clear(),
  };
}
