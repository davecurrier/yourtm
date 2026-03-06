/**
 * @yourtm/testing - Testing utilities for YourTM tags
 *
 * This package provides comprehensive testing utilities for unit testing
 * YourTM tags, including mock contexts, assertions, fixtures, and
 * Vitest integration.
 *
 * @example
 * ```typescript
 * import { testTag, createMockContext } from '@yourtm/testing'
 * import myTag from './myTag'
 *
 * testTag(myTag, {
 *   name: 'fires gtag with correct params',
 *   dataLayer: { 'page.title': 'Home' },
 *   expect: {
 *     calls: [['gtag', 'event', 'page_view', { page_title: 'Home' }]]
 *   }
 * })
 * ```
 */

// Core types
export type {
  // Context types
  TagContext,
  PageContext,
  UserContext,
  ConsentState,
  EcommerceContext,
  DataLayer,
  // E-commerce types
  Product,
  Cart,
  Order,
  // Test types
  TagDefinition,
  TestCase,
  ExpectedCall,
  ExpectedFetch,
  TagExecutionResult,
  MockContextOptions,
  // Recorder types
  RecordedCall,
  RecordedFetch,
  RecordedDataLayerPush,
  CallRecorder,
  FetchRecorder,
} from './types.js';

// Mock utilities
export {
  createMockContext,
  createMockDataLayer,
  createMockConsent,
  createMockPage,
  createMockUser,
  createCallRecorder,
  createFetchRecorder,
  setupGlobalMocks,
  mockGtag,
  mockFbq,
  mockFetch,
  mockTtq,
} from './mocks.js';

// Assertions
export {
  TagAssertionError,
  expectTagFired,
  expectTagFailed,
  expectCall,
  expectNotCalled,
  expectCallCount,
  expectFetch,
  expectNoFetch,
  expectDataLayerPush,
  expectNoErrors,
  expectConsoleLog,
  assertExpectedCalls,
  assertExpectedFetches,
  assertExpectedDataLayerPushes,
} from './assertions.js';

// Test fixtures
export {
  // Page fixtures
  samplePageContext,
  sampleSearchContext,
  // User fixtures
  sampleUserContext,
  sampleGuestContext,
  sampleLoginContext,
  sampleSignupContext,
  // E-commerce fixtures
  sampleProduct,
  sampleCart,
  sampleOrder,
  sampleEcommerceContext,
  sampleCheckoutContext,
  sampleProductViewContext,
  sampleAddToCartContext,
  // Consent fixtures
  sampleFullConsent,
  sampleMinimalConsent,
  sampleNoConsent,
  // Fixture utilities
  fixtureContext,
  combineFixtures,
} from './fixtures.js';

// Main testing utilities
export {
  testTag,
  executeTag,
  createTagTestSuite,
  smokeTest,
  testConsentCompliance,
  testPerformance,
  defineTag,
  type TestTagOptions,
} from './testTag.js';

// Test runner integration
export {
  describeTag,
  formatTestResult,
  formatTestSummary,
  TagCoverage,
  tagCoverage,
  runTagTests,
  createTagTest,
  createTagMatchers,
} from './runner.js';
