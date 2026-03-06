/**
 * Test fixtures for YourTM tag testing
 */

import type {
  TagContext,
  EcommerceContext,
  Product,
  Cart,
  Order,
  ConsentState,
  MockContextOptions,
} from './types.js';
import { createMockContext } from './mocks.js';

/**
 * Sample page context for a typical marketing page
 */
export function samplePageContext(): MockContextOptions {
  return {
    page: {
      url: 'https://example.com/products/shoes',
      hostname: 'example.com',
      pathname: '/products/shoes',
      search: '?utm_source=google&utm_medium=cpc&utm_campaign=spring_sale',
      hash: '',
      title: 'Running Shoes - Example Store',
      referrer: 'https://google.com/search?q=running+shoes',
    },
    dataLayer: {
      'page.type': 'product',
      'page.category': 'shoes',
      'page.title': 'Running Shoes - Example Store',
      'utm.source': 'google',
      'utm.medium': 'cpc',
      'utm.campaign': 'spring_sale',
    },
  };
}

/**
 * Sample product for testing
 */
export function sampleProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'PROD-001',
    name: 'Running Shoes',
    price: 99.99,
    quantity: 1,
    category: 'Footwear',
    brand: 'ExampleBrand',
    variant: 'Blue / Size 10',
    sku: 'SKU-RS-BLUE-10',
    ...overrides,
  };
}

/**
 * Sample cart for testing
 */
export function sampleCart(overrides: Partial<Cart> = {}): Cart {
  const defaultItems = [
    sampleProduct({ id: 'PROD-001', name: 'Running Shoes', price: 99.99, quantity: 1 }),
    sampleProduct({ id: 'PROD-002', name: 'Athletic Socks', price: 12.99, quantity: 2 }),
  ];

  return {
    items: defaultItems,
    total: 125.97,
    currency: 'USD',
    coupon: 'SAVE10',
    ...overrides,
  };
}

/**
 * Sample order for testing
 */
export function sampleOrder(overrides: Partial<Order> = {}): Order {
  const defaultItems = [
    sampleProduct({ id: 'PROD-001', name: 'Running Shoes', price: 99.99, quantity: 1 }),
    sampleProduct({ id: 'PROD-002', name: 'Athletic Socks', price: 12.99, quantity: 2 }),
  ];

  return {
    id: 'ORD-12345',
    revenue: 125.97,
    tax: 10.08,
    shipping: 5.99,
    currency: 'USD',
    items: defaultItems,
    coupon: 'SAVE10',
    ...overrides,
  };
}

/**
 * Sample e-commerce context with cart
 */
export function sampleEcommerceContext(
  overrides: Partial<EcommerceContext> = {}
): MockContextOptions {
  return {
    ecommerce: {
      cart: sampleCart(),
      currency: 'USD',
      products: [sampleProduct()],
      ...overrides,
    },
    page: {
      url: 'https://example.com/cart',
      hostname: 'example.com',
      pathname: '/cart',
      search: '',
      hash: '',
      title: 'Shopping Cart - Example Store',
      referrer: 'https://example.com/products/shoes',
    },
    dataLayer: {
      'page.type': 'cart',
      'cart.total': 125.97,
      'cart.itemCount': 3,
      'cart.currency': 'USD',
    },
  };
}

/**
 * Sample e-commerce context with completed order
 */
export function sampleCheckoutContext(
  overrides: Partial<EcommerceContext> = {}
): MockContextOptions {
  return {
    ecommerce: {
      order: sampleOrder(),
      currency: 'USD',
      ...overrides,
    },
    event: 'purchase',
    eventData: {
      transaction_id: 'ORD-12345',
      value: 125.97,
      currency: 'USD',
    },
    page: {
      url: 'https://example.com/checkout/confirmation',
      hostname: 'example.com',
      pathname: '/checkout/confirmation',
      search: '?order=ORD-12345',
      hash: '',
      title: 'Order Confirmation - Example Store',
      referrer: 'https://example.com/checkout/payment',
    },
    dataLayer: {
      'page.type': 'confirmation',
      'order.id': 'ORD-12345',
      'order.revenue': 125.97,
      'order.tax': 10.08,
      'order.shipping': 5.99,
      'order.currency': 'USD',
    },
  };
}

/**
 * Sample logged-in user context
 */
export function sampleUserContext(): MockContextOptions {
  return {
    user: {
      userId: 'USR-12345',
      email: 'user@example.com',
      isLoggedIn: true,
      userType: 'customer',
      traits: {
        firstName: 'John',
        lastName: 'Doe',
        totalOrders: 5,
        lifetimeValue: 499.95,
        memberSince: '2023-01-15',
      },
    },
    dataLayer: {
      'user.id': 'USR-12345',
      'user.email': 'user@example.com',
      'user.loggedIn': true,
      'user.type': 'customer',
    },
  };
}

/**
 * Sample guest user context
 */
export function sampleGuestContext(): MockContextOptions {
  return {
    user: {
      isLoggedIn: false,
      userType: 'guest',
    },
    dataLayer: {
      'user.loggedIn': false,
      'user.type': 'guest',
    },
  };
}

/**
 * Sample consent state with all permissions granted
 */
export function sampleFullConsent(): Partial<ConsentState> {
  return {
    analytics: true,
    marketing: true,
    functional: true,
    social: true,
    hasConsented: true,
  };
}

/**
 * Sample consent state with only essential (functional) permissions
 */
export function sampleMinimalConsent(): Partial<ConsentState> {
  return {
    analytics: false,
    marketing: false,
    functional: true,
    social: false,
    hasConsented: true,
  };
}

/**
 * Sample consent state with no consent given
 */
export function sampleNoConsent(): Partial<ConsentState> {
  return {
    analytics: false,
    marketing: false,
    functional: false,
    social: false,
    hasConsented: false,
  };
}

/**
 * Sample product view event context
 */
export function sampleProductViewContext(): MockContextOptions {
  const product = sampleProduct();
  return {
    ...samplePageContext(),
    event: 'view_item',
    eventData: {
      item_id: product.id,
      item_name: product.name,
      price: product.price,
      currency: 'USD',
    },
    ecommerce: {
      products: [product],
      currency: 'USD',
    },
    dataLayer: {
      'page.type': 'product',
      'product.id': product.id,
      'product.name': product.name,
      'product.price': product.price,
      'product.category': product.category,
      'product.brand': product.brand,
    },
  };
}

/**
 * Sample add to cart event context
 */
export function sampleAddToCartContext(): MockContextOptions {
  const product = sampleProduct();
  return {
    event: 'add_to_cart',
    eventData: {
      item_id: product.id,
      item_name: product.name,
      price: product.price,
      quantity: 1,
      currency: 'USD',
    },
    ecommerce: {
      cart: sampleCart({ items: [product], total: product.price }),
      products: [product],
      currency: 'USD',
    },
    page: {
      url: 'https://example.com/products/shoes',
      hostname: 'example.com',
      pathname: '/products/shoes',
      search: '',
      hash: '',
      title: 'Running Shoes - Example Store',
      referrer: 'https://example.com/products',
    },
    dataLayer: {
      'event': 'add_to_cart',
      'cart.total': product.price,
      'cart.itemCount': 1,
    },
  };
}

/**
 * Sample search results page context
 */
export function sampleSearchContext(query = 'running shoes'): MockContextOptions {
  return {
    page: {
      url: `https://example.com/search?q=${encodeURIComponent(query)}`,
      hostname: 'example.com',
      pathname: '/search',
      search: `?q=${encodeURIComponent(query)}`,
      hash: '',
      title: `Search: ${query} - Example Store`,
      referrer: 'https://example.com/',
    },
    event: 'search',
    eventData: {
      search_term: query,
      results_count: 24,
    },
    dataLayer: {
      'page.type': 'search',
      'search.term': query,
      'search.resultsCount': 24,
    },
  };
}

/**
 * Sample login event context
 */
export function sampleLoginContext(): MockContextOptions {
  return {
    ...sampleUserContext(),
    event: 'login',
    eventData: {
      method: 'email',
    },
  };
}

/**
 * Sample signup event context
 */
export function sampleSignupContext(): MockContextOptions {
  return {
    user: {
      userId: 'USR-NEW-001',
      email: 'newuser@example.com',
      isLoggedIn: true,
      userType: 'customer',
      traits: {
        firstName: 'Jane',
        lastName: 'Smith',
      },
    },
    event: 'sign_up',
    eventData: {
      method: 'email',
    },
    dataLayer: {
      'event': 'sign_up',
      'user.id': 'USR-NEW-001',
      'user.email': 'newuser@example.com',
      'user.loggedIn': true,
    },
  };
}

/**
 * Creates a complete mock context from fixture options
 */
export function fixtureContext(options: MockContextOptions): TagContext {
  return createMockContext(options);
}

/**
 * Combines multiple fixture options into one
 */
export function combineFixtures(
  ...fixtures: MockContextOptions[]
): MockContextOptions {
  const result: MockContextOptions = {};

  for (const fixture of fixtures) {
    // Merge page
    if (fixture.page) {
      result.page = { ...result.page, ...fixture.page };
    }

    // Merge user
    if (fixture.user) {
      result.user = { ...result.user, ...fixture.user };
    }

    // Merge consent
    if (fixture.consent) {
      result.consent = { ...result.consent, ...fixture.consent };
    }

    // Merge ecommerce
    if (fixture.ecommerce) {
      result.ecommerce = { ...result.ecommerce, ...fixture.ecommerce };
    }

    // Merge dataLayer
    if (fixture.dataLayer) {
      result.dataLayer = { ...result.dataLayer, ...fixture.dataLayer };
    }

    // Override event
    if (fixture.event) {
      result.event = fixture.event;
    }

    // Merge eventData
    if (fixture.eventData) {
      result.eventData = { ...result.eventData, ...fixture.eventData };
    }

    // Override containerId
    if (fixture.containerId) {
      result.containerId = fixture.containerId;
    }
  }

  return result;
}
