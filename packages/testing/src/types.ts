/**
 * Core types for YourTM tag testing
 */

/**
 * Consent state for privacy compliance
 */
export interface ConsentState {
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
  social: boolean;
  hasConsented: boolean;
}

/**
 * Page context information
 */
export interface PageContext {
  url: string;
  hostname: string;
  pathname: string;
  search: string;
  hash: string;
  title: string;
  referrer: string;
}

/**
 * User context information
 */
export interface UserContext {
  userId?: string;
  email?: string;
  isLoggedIn: boolean;
  userType?: 'guest' | 'customer' | 'subscriber' | 'admin';
  traits?: Record<string, unknown>;
}

/**
 * E-commerce product information
 */
export interface Product {
  id: string;
  name: string;
  price: number;
  quantity?: number;
  category?: string;
  brand?: string;
  variant?: string;
  sku?: string;
}

/**
 * E-commerce cart information
 */
export interface Cart {
  items: Product[];
  total: number;
  currency: string;
  coupon?: string;
}

/**
 * E-commerce order information
 */
export interface Order {
  id: string;
  revenue: number;
  tax?: number;
  shipping?: number;
  currency: string;
  items: Product[];
  coupon?: string;
}

/**
 * E-commerce context
 */
export interface EcommerceContext {
  cart?: Cart;
  order?: Order;
  products?: Product[];
  currency: string;
}

/**
 * DataLayer interface for tag communication
 */
export interface DataLayer {
  get(key: string): unknown;
  push(data: Record<string, unknown>): void;
  getAll(): Record<string, unknown>;
  clear(): void;
}

/**
 * Complete tag context available during execution
 */
export interface TagContext {
  dataLayer: DataLayer;
  page: PageContext;
  user: UserContext;
  consent: ConsentState;
  ecommerce?: EcommerceContext;
  event?: string;
  eventData?: Record<string, unknown>;
  timestamp: number;
  containerId: string;
}

/**
 * Recorded function call
 */
export interface RecordedCall {
  fn: string;
  args: unknown[];
  timestamp: number;
}

/**
 * Recorded fetch request
 */
export interface RecordedFetch {
  url: string;
  options?: RequestInit;
  timestamp: number;
}

/**
 * Recorded dataLayer push
 */
export interface RecordedDataLayerPush {
  data: Record<string, unknown>;
  timestamp: number;
}

/**
 * Tag execution result
 */
export interface TagExecutionResult {
  success: boolean;
  error?: Error;
  duration: number;
  calls: RecordedCall[];
  fetches: RecordedFetch[];
  dataLayerPushes: RecordedDataLayerPush[];
  consoleOutput: Array<{ level: string; args: unknown[] }>;
}

/**
 * Tag definition that can be tested
 */
export interface TagDefinition {
  name: string;
  code: (context: TagContext) => void | Promise<void>;
  triggers?: string[];
  priority?: number;
}

/**
 * Expected call in test assertion
 */
export type ExpectedCall = [string, ...unknown[]];

/**
 * Expected fetch in test assertion
 */
export interface ExpectedFetch {
  url: string | RegExp;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Test case definition
 */
export interface TestCase {
  name: string;
  dataLayer?: Record<string, unknown>;
  page?: Partial<PageContext>;
  user?: Partial<UserContext>;
  consent?: Partial<ConsentState>;
  ecommerce?: EcommerceContext;
  event?: string;
  eventData?: Record<string, unknown>;
  expect?: {
    calls?: ExpectedCall[];
    fetches?: ExpectedFetch[];
    dataLayerPushes?: Record<string, unknown>[];
    noErrors?: boolean;
    success?: boolean;
  };
  setup?: () => void | Promise<void>;
  teardown?: () => void | Promise<void>;
}

/**
 * Mock context options
 */
export interface MockContextOptions {
  dataLayer?: Record<string, unknown>;
  page?: Partial<PageContext>;
  user?: Partial<UserContext>;
  consent?: Partial<ConsentState>;
  ecommerce?: EcommerceContext;
  event?: string;
  eventData?: Record<string, unknown>;
  containerId?: string;
}

/**
 * Call recorder for tracking function invocations
 */
export interface CallRecorder {
  calls: RecordedCall[];
  record(fn: string, args: unknown[]): void;
  getCalls(fn?: string): RecordedCall[];
  clear(): void;
}

/**
 * Fetch recorder for tracking network requests
 */
export interface FetchRecorder {
  fetches: RecordedFetch[];
  record(url: string, options?: RequestInit): void;
  getFetches(urlPattern?: string | RegExp): RecordedFetch[];
  clear(): void;
}
