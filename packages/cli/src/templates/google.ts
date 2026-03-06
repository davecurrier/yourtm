/**
 * Google Analytics and Google Ads Tag Templates
 *
 * This module exports templates for creating Google-related tracking tags.
 * Each template includes interactive prompts and code generation.
 */

import type {
  TagTemplate,
  TemplateContext,
  GeneratedFile,
} from './types.js';

// ============================================================================
// Helper Functions
// ============================================================================

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^./, (c) => c.toUpperCase());
}

function validateMeasurementId(input: unknown): boolean | string {
  if (!input || typeof input !== 'string') {
    return 'Measurement ID is required';
  }
  if (!/^G-[A-Z0-9]+$/i.test(input)) {
    return 'Invalid format. GA4 Measurement ID should start with "G-" (e.g., G-XXXXXXXXXX)';
  }
  return true;
}

function validateConversionId(input: unknown): boolean | string {
  if (!input || typeof input !== 'string') {
    return 'Conversion ID is required';
  }
  if (!/^AW-\d+$/i.test(input)) {
    return 'Invalid format. Google Ads Conversion ID should start with "AW-" (e.g., AW-123456789)';
  }
  return true;
}

function validateEventName(input: unknown): boolean | string {
  if (!input || typeof input !== 'string') {
    return 'Event name is required';
  }
  if (!/^[a-z][a-z0-9_]*$/i.test(input)) {
    return 'Event name must start with a letter and contain only letters, numbers, and underscores';
  }
  return true;
}

// ============================================================================
// GA4 Configuration Template
// ============================================================================

const ga4ConfigTemplate: TagTemplate = {
  id: 'ga4-config',
  name: 'GA4 Configuration',
  description: 'Base Google Analytics 4 setup with measurement ID and configuration options',
  category: 'analytics',
  type: 'tag',
  platform: 'google-analytics',
  icon: '📊',
  questions: [
    {
      type: 'text',
      name: 'measurementId',
      message: 'Enter your GA4 Measurement ID:',
      initial: 'G-XXXXXXXXXX',
      validate: validateMeasurementId,
    },
    {
      type: 'confirm',
      name: 'autoPageViews',
      message: 'Enable automatic page view tracking?',
      initial: true,
    },
    {
      type: 'confirm',
      name: 'debugMode',
      message: 'Enable debug mode (for development)?',
      initial: false,
    },
    {
      type: 'confirm',
      name: 'enableUserIdTracking',
      message: 'Enable User ID tracking?',
      initial: false,
    },
    {
      type: 'text',
      name: 'userIdVariable',
      message: 'Enter the dataLayer variable name for User ID:',
      initial: 'userId',
      when: (answers) => answers.enableUserIdTracking === true,
    },
    {
      type: 'select',
      name: 'cookieFlags',
      message: 'Cookie configuration:',
      choices: [
        { title: 'Default (no restrictions)', value: 'default' },
        { title: 'SameSite=Strict', value: 'strict' },
        { title: 'SameSite=Lax', value: 'lax' },
        { title: 'Secure only', value: 'secure' },
      ],
      initial: 'default',
    },
  ],
  generate: (context: TemplateContext): GeneratedFile[] => {
    const {
      measurementId,
      autoPageViews,
      debugMode,
      enableUserIdTracking,
      userIdVariable,
      cookieFlags,
    } = context.answers;

    const tagId = 'ga4-config';
    const fileName = `${tagId}.ts`;

    // Build config object
    const configOptions: string[] = [];
    if (autoPageViews === false) {
      configOptions.push('send_page_view: false');
    }
    if (debugMode === true) {
      configOptions.push('debug_mode: true');
    }
    if (cookieFlags === 'strict') {
      configOptions.push("cookie_flags: 'SameSite=Strict'");
    } else if (cookieFlags === 'lax') {
      configOptions.push("cookie_flags: 'SameSite=Lax'");
    } else if (cookieFlags === 'secure') {
      configOptions.push("cookie_flags: 'Secure'");
    }

    const configString =
      configOptions.length > 0
        ? `{
        page_title: document.title,
        page_location: ctx.url.href,
        ${configOptions.join(',\n        ')},
      }`
        : `{
        page_title: document.title,
        page_location: ctx.url.href,
      }`;

    const userIdCode = enableUserIdTracking
      ? `
    // Set User ID if available
    const userId = window.dataLayer?.find((item: any) => item.${userIdVariable})?.${userIdVariable};
    if (userId) {
      gtag('set', { user_id: userId });
    }`
      : '';

    const content = `import { defineTag } from '@yourtm/cli'
import { loadGtag, gtag } from '@yourtm/vendors/google'

/**
 * GA4 Configuration Tag
 *
 * This tag initializes Google Analytics 4 with your measurement ID.
 * It should fire on all pages where you want to track analytics.
 */
export default defineTag({
  id: '${tagId}',
  name: 'GA4 Configuration',
  description: 'Google Analytics 4 base configuration',
  type: 'script',
  platform: 'google-analytics',
  vendor: 'google',

  // Fire on page load for all pages
  triggers: ['pageview'],

  // Assign to global zone (fires on all pages)
  zones: ['global'],

  // Requires analytics consent
  consent: ['analytics'],

  // High priority - should load before other GA4 tags
  priority: 100,

  /**
   * Load the gtag.js library
   */
  async setup() {
    await loadGtag('${measurementId}')
  },

  /**
   * Configure GA4 with page data
   */
  execute(ctx) {
    gtag('config', '${measurementId}', ${configString})${userIdCode}
  },
})
`;

    return [
      {
        path: `yourtm/tags/${fileName}`,
        content,
      },
    ];
  },
};

// ============================================================================
// GA4 Custom Event Template
// ============================================================================

const ga4EventTemplate: TagTemplate = {
  id: 'ga4-event',
  name: 'GA4 Custom Event',
  description: 'Track custom events in Google Analytics 4',
  category: 'analytics',
  type: 'tag',
  platform: 'google-analytics',
  icon: '🎯',
  questions: [
    {
      type: 'text',
      name: 'eventName',
      message: 'Enter the event name:',
      initial: 'custom_event',
      validate: validateEventName,
    },
    {
      type: 'text',
      name: 'tagName',
      message: 'Enter a display name for this tag:',
      initial: 'GA4 Event',
    },
    {
      type: 'multiselect',
      name: 'triggers',
      message: 'Select triggers for this event:',
      choices: [
        { title: 'Page View', value: 'pageview' },
        { title: 'Click', value: 'click' },
        { title: 'Form Submit', value: 'form-submit' },
        { title: 'Scroll', value: 'scroll' },
        { title: 'Custom', value: 'custom' },
      ],
      initial: ['click'],
    },
    {
      type: 'text',
      name: 'eventParameters',
      message: 'Enter event parameters (JSON format):',
      initial: '{"parameter_name": "parameter_value"}',
    },
    {
      type: 'confirm',
      name: 'hasConditions',
      message: 'Add firing conditions?',
      initial: false,
    },
    {
      type: 'text',
      name: 'conditionSelector',
      message: 'Enter CSS selector for element (e.g., ".cta-button"):',
      when: (answers) =>
        answers.hasConditions === true &&
        (answers.triggers as string[])?.includes('click'),
    },
  ],
  generate: (context: TemplateContext): GeneratedFile[] => {
    const { eventName, tagName, triggers, eventParameters, conditionSelector } =
      context.answers;

    const tagId = `ga4-event-${toKebabCase(eventName as string)}`;
    const fileName = `${tagId}.ts`;
    const displayName = tagName || `GA4 Event - ${toPascalCase(eventName as string)}`;

    // Parse event parameters
    let parsedParams = {};
    try {
      parsedParams = JSON.parse(eventParameters as string);
    } catch {
      parsedParams = { custom_parameter: 'value' };
    }

    const paramsString = JSON.stringify(parsedParams, null, 6).replace(
      /^/gm,
      '      '
    );

    const conditionCode = conditionSelector
      ? `
    // Check if the clicked element matches our selector
    if (ctx.event?.target) {
      const element = ctx.event.target as Element;
      if (!element.matches('${conditionSelector}')) {
        return; // Don't fire if condition not met
      }
    }`
      : '';

    const content = `import { defineTag } from '@yourtm/cli'
import { gtag } from '@yourtm/vendors/google'

/**
 * ${displayName}
 *
 * Tracks the "${eventName}" event in Google Analytics 4.
 * This tag requires the GA4 Configuration tag to be loaded first.
 */
export default defineTag({
  id: '${tagId}',
  name: '${displayName}',
  description: 'Custom GA4 event tracking for ${eventName}',
  type: 'script',
  platform: 'google-analytics',
  vendor: 'google',

  // Event triggers
  triggers: ${JSON.stringify(triggers)},

  // Zones (leave empty for all pages, or specify zones)
  zones: ['global'],

  // Requires analytics consent
  consent: ['analytics'],

  // Lower priority than config tag
  priority: 50,

  /**
   * Fire the custom event
   */
  execute(ctx) {${conditionCode}
    gtag('event', '${eventName}', ${paramsString.trim()})
  },
})
`;

    return [
      {
        path: `yourtm/tags/${fileName}`,
        content,
      },
    ];
  },
};

// ============================================================================
// GA4 E-commerce: Purchase Template
// ============================================================================

const ga4PurchaseTemplate: TagTemplate = {
  id: 'ga4-ecommerce-purchase',
  name: 'GA4 E-commerce - Purchase',
  description: 'Track purchase/conversion events for e-commerce',
  category: 'analytics',
  type: 'tag',
  platform: 'google-analytics',
  icon: '💰',
  questions: [
    {
      type: 'text',
      name: 'measurementId',
      message: 'Enter your GA4 Measurement ID (or leave empty to use config tag):',
      initial: '',
    },
    {
      type: 'select',
      name: 'dataSource',
      message: 'Where does your transaction data come from?',
      choices: [
        { title: 'dataLayer (recommended)', value: 'dataLayer' },
        { title: 'JavaScript variable', value: 'variable' },
        { title: 'DOM element', value: 'dom' },
      ],
      initial: 'dataLayer',
    },
    {
      type: 'text',
      name: 'dataLayerEvent',
      message: 'Enter the dataLayer event name that triggers purchase:',
      initial: 'purchase',
      when: (answers) => answers.dataSource === 'dataLayer',
    },
    {
      type: 'text',
      name: 'transactionIdPath',
      message: 'Path to transaction ID in dataLayer:',
      initial: 'ecommerce.transaction_id',
      when: (answers) => answers.dataSource === 'dataLayer',
    },
    {
      type: 'confirm',
      name: 'includeItems',
      message: 'Include item/product details?',
      initial: true,
    },
  ],
  generate: (context: TemplateContext): GeneratedFile[] => {
    const {
      measurementId,
      dataSource,
      dataLayerEvent,
      includeItems,
    } = context.answers;

    const tagId = 'ga4-ecommerce-purchase';
    const fileName = `${tagId}.ts`;

    const measurementIdCode = measurementId
      ? `'${measurementId}'`
      : '// Uses measurement ID from GA4 config tag';

    const dataLayerCode = `
    // Get purchase data from dataLayer
    const purchaseData = window.dataLayer?.find(
      (item: any) => item.event === '${dataLayerEvent}'
    );

    if (!purchaseData?.ecommerce) {
      console.warn('[YourTM] Purchase event fired but no ecommerce data found');
      return;
    }

    const ecommerce = purchaseData.ecommerce;`;

    const variableCode = `
    // Get purchase data from JavaScript variable
    const ecommerce = (window as any).transactionData;

    if (!ecommerce) {
      console.warn('[YourTM] Purchase event fired but no transaction data found');
      return;
    }`;

    const domCode = `
    // Get purchase data from DOM elements
    const ecommerce = {
      transaction_id: document.querySelector('[data-transaction-id]')?.textContent,
      value: parseFloat(document.querySelector('[data-order-total]')?.textContent || '0'),
      currency: document.querySelector('[data-currency]')?.textContent || 'USD',
    };

    if (!ecommerce.transaction_id) {
      console.warn('[YourTM] Purchase event fired but no transaction ID found in DOM');
      return;
    }`;

    let dataCode: string;
    if (dataSource === 'dataLayer') {
      dataCode = dataLayerCode;
    } else if (dataSource === 'variable') {
      dataCode = variableCode;
    } else {
      dataCode = domCode;
    }

    const itemsCode = includeItems
      ? `
      items: ecommerce.items || [],`
      : '';

    const content = `import { defineTag } from '@yourtm/cli'
import { gtag } from '@yourtm/vendors/google'

/**
 * GA4 E-commerce Purchase Tag
 *
 * Tracks purchase/transaction events for e-commerce conversion tracking.
 * This tag requires the GA4 Configuration tag to be loaded first.
 *
 * Expected dataLayer format:
 * {
 *   event: '${dataLayerEvent || 'purchase'}',
 *   ecommerce: {
 *     transaction_id: 'T12345',
 *     value: 99.99,
 *     currency: 'USD',
 *     tax: 5.00,
 *     shipping: 10.00,
 *     items: [{ item_id: 'SKU123', item_name: 'Product', price: 84.99, quantity: 1 }]
 *   }
 * }
 */
export default defineTag({
  id: '${tagId}',
  name: 'GA4 E-commerce - Purchase',
  description: 'Track purchase conversions in Google Analytics 4',
  type: 'script',
  platform: 'google-analytics',
  vendor: 'google',

  // Fire on custom trigger (usually after order confirmation)
  triggers: ['purchase', 'order-complete'],

  // Typically fires on thank-you/confirmation pages
  zones: ['checkout', 'global'],

  // Requires analytics consent
  consent: ['analytics'],

  // Standard priority
  priority: 50,

  /**
   * Track the purchase event
   */
  execute(ctx) {
    ${measurementIdCode}
${dataCode}

    // Send purchase event to GA4
    gtag('event', 'purchase', {
      transaction_id: ecommerce.transaction_id,
      value: ecommerce.value,
      currency: ecommerce.currency || 'USD',
      tax: ecommerce.tax,
      shipping: ecommerce.shipping,
      coupon: ecommerce.coupon,${itemsCode}
    })

    console.log('[YourTM] Purchase tracked:', ecommerce.transaction_id)
  },
})
`;

    return [
      {
        path: `yourtm/tags/${fileName}`,
        content,
      },
    ];
  },
};

// ============================================================================
// GA4 E-commerce: Add to Cart Template
// ============================================================================

const ga4AddToCartTemplate: TagTemplate = {
  id: 'ga4-ecommerce-add-to-cart',
  name: 'GA4 E-commerce - Add to Cart',
  description: 'Track add to cart events for e-commerce',
  category: 'analytics',
  type: 'tag',
  platform: 'google-analytics',
  icon: '🛒',
  questions: [
    {
      type: 'text',
      name: 'measurementId',
      message: 'Enter your GA4 Measurement ID (or leave empty to use config tag):',
      initial: '',
    },
    {
      type: 'select',
      name: 'dataSource',
      message: 'Where does your product data come from?',
      choices: [
        { title: 'dataLayer (recommended)', value: 'dataLayer' },
        { title: 'Click element data attributes', value: 'attributes' },
        { title: 'JavaScript variable', value: 'variable' },
      ],
      initial: 'dataLayer',
    },
    {
      type: 'text',
      name: 'buttonSelector',
      message: 'CSS selector for add-to-cart button:',
      initial: '.add-to-cart, [data-action="add-to-cart"]',
    },
  ],
  generate: (context: TemplateContext): GeneratedFile[] => {
    const { dataSource, buttonSelector } = context.answers;

    const tagId = 'ga4-ecommerce-add-to-cart';
    const fileName = `${tagId}.ts`;

    const dataLayerExtraction = `
    // Get product data from dataLayer
    const addToCartData = window.dataLayer?.find(
      (item: any) => item.event === 'add_to_cart'
    );

    if (!addToCartData?.ecommerce?.items?.[0]) {
      console.warn('[YourTM] Add to cart fired but no product data found');
      return;
    }

    const item = addToCartData.ecommerce.items[0];
    const value = addToCartData.ecommerce.value || item.price * (item.quantity || 1);`;

    const attributesExtraction = `
    // Get product data from clicked element's data attributes
    const button = ctx.event?.target as HTMLElement;
    if (!button) return;

    const productElement = button.closest('[data-product-id]') || button;

    const item = {
      item_id: productElement.getAttribute('data-product-id') || '',
      item_name: productElement.getAttribute('data-product-name') || '',
      price: parseFloat(productElement.getAttribute('data-product-price') || '0'),
      quantity: parseInt(productElement.getAttribute('data-quantity') || '1', 10),
      item_category: productElement.getAttribute('data-product-category') || '',
    };

    if (!item.item_id) {
      console.warn('[YourTM] Add to cart fired but no product ID found');
      return;
    }

    const value = item.price * item.quantity;`;

    const variableExtraction = `
    // Get product data from JavaScript variable
    const productData = (window as any).currentProduct;

    if (!productData?.id) {
      console.warn('[YourTM] Add to cart fired but no product data found');
      return;
    }

    const item = {
      item_id: productData.id,
      item_name: productData.name,
      price: productData.price,
      quantity: productData.quantity || 1,
      item_category: productData.category,
    };

    const value = item.price * item.quantity;`;

    let extractionCode: string;
    if (dataSource === 'dataLayer') {
      extractionCode = dataLayerExtraction;
    } else if (dataSource === 'attributes') {
      extractionCode = attributesExtraction;
    } else {
      extractionCode = variableExtraction;
    }

    const content = `import { defineTag } from '@yourtm/cli'
import { gtag } from '@yourtm/vendors/google'

/**
 * GA4 E-commerce Add to Cart Tag
 *
 * Tracks when users add products to their shopping cart.
 * This tag requires the GA4 Configuration tag to be loaded first.
 *
 * Button selector: ${buttonSelector}
 */
export default defineTag({
  id: '${tagId}',
  name: 'GA4 E-commerce - Add to Cart',
  description: 'Track add to cart events in Google Analytics 4',
  type: 'script',
  platform: 'google-analytics',
  vendor: 'google',

  // Fire on click events
  triggers: ['click', 'add-to-cart'],

  // Product pages and anywhere add-to-cart can occur
  zones: ['global'],

  // Requires analytics consent
  consent: ['analytics'],

  // Standard priority
  priority: 50,

  /**
   * Track the add to cart event
   */
  execute(ctx) {
    // Check if clicked element matches add-to-cart selector
    const target = ctx.event?.target as Element;
    if (target && !target.closest('${buttonSelector}')) {
      return; // Not an add-to-cart click
    }
${extractionCode}

    // Send add_to_cart event to GA4
    gtag('event', 'add_to_cart', {
      currency: 'USD',
      value: value,
      items: [item],
    })

    console.log('[YourTM] Add to cart tracked:', item.item_id)
  },
})
`;

    return [
      {
        path: `yourtm/tags/${fileName}`,
        content,
      },
    ];
  },
};

// ============================================================================
// GA4 E-commerce: View Item Template
// ============================================================================

const ga4ViewItemTemplate: TagTemplate = {
  id: 'ga4-ecommerce-view-item',
  name: 'GA4 E-commerce - View Item',
  description: 'Track product page views for e-commerce',
  category: 'analytics',
  type: 'tag',
  platform: 'google-analytics',
  icon: '👁️',
  questions: [
    {
      type: 'text',
      name: 'measurementId',
      message: 'Enter your GA4 Measurement ID (or leave empty to use config tag):',
      initial: '',
    },
    {
      type: 'select',
      name: 'dataSource',
      message: 'Where does your product data come from?',
      choices: [
        { title: 'dataLayer (recommended)', value: 'dataLayer' },
        { title: 'JSON-LD structured data', value: 'jsonld' },
        { title: 'Meta tags', value: 'meta' },
        { title: 'JavaScript variable', value: 'variable' },
      ],
      initial: 'dataLayer',
    },
    {
      type: 'text',
      name: 'productPagePattern',
      message: 'URL pattern for product pages (regex):',
      initial: '/products?/[^/]+$',
    },
  ],
  generate: (context: TemplateContext): GeneratedFile[] => {
    const { dataSource, productPagePattern } = context.answers;

    const tagId = 'ga4-ecommerce-view-item';
    const fileName = `${tagId}.ts`;

    const dataLayerExtraction = `
    // Get product data from dataLayer
    const viewItemData = window.dataLayer?.find(
      (item: any) => item.event === 'view_item' || item.ecommerce?.items
    );

    if (!viewItemData?.ecommerce?.items?.[0]) {
      console.warn('[YourTM] View item fired but no product data found in dataLayer');
      return;
    }

    const item = viewItemData.ecommerce.items[0];
    const value = viewItemData.ecommerce.value || item.price;`;

    const jsonldExtraction = `
    // Get product data from JSON-LD structured data
    const jsonLdScript = document.querySelector('script[type="application/ld+json"]');
    if (!jsonLdScript) {
      console.warn('[YourTM] View item fired but no JSON-LD data found');
      return;
    }

    let productData: any;
    try {
      const jsonLd = JSON.parse(jsonLdScript.textContent || '{}');
      productData = jsonLd['@type'] === 'Product' ? jsonLd : jsonLd['@graph']?.find((item: any) => item['@type'] === 'Product');
    } catch {
      console.warn('[YourTM] Failed to parse JSON-LD data');
      return;
    }

    if (!productData) {
      console.warn('[YourTM] No Product found in JSON-LD');
      return;
    }

    const item = {
      item_id: productData.sku || productData.productID || productData['@id'],
      item_name: productData.name,
      price: parseFloat(productData.offers?.price || productData.offers?.[0]?.price || '0'),
      item_category: productData.category,
      item_brand: productData.brand?.name || productData.brand,
    };

    const value = item.price;`;

    const metaExtraction = `
    // Get product data from meta tags
    const getMeta = (name: string) =>
      document.querySelector(\`meta[property="\${name}"], meta[name="\${name}"]\`)?.getAttribute('content');

    const item = {
      item_id: getMeta('product:sku') || getMeta('og:product:id') || '',
      item_name: getMeta('og:title') || document.title,
      price: parseFloat(getMeta('product:price:amount') || getMeta('og:price:amount') || '0'),
      item_category: getMeta('product:category') || '',
      item_brand: getMeta('product:brand') || '',
    };

    if (!item.item_id && !item.item_name) {
      console.warn('[YourTM] View item fired but no product data found in meta tags');
      return;
    }

    const value = item.price;`;

    const variableExtraction = `
    // Get product data from JavaScript variable
    const productData = (window as any).productData || (window as any).currentProduct;

    if (!productData) {
      console.warn('[YourTM] View item fired but no product data found');
      return;
    }

    const item = {
      item_id: productData.id || productData.sku,
      item_name: productData.name || productData.title,
      price: productData.price,
      item_category: productData.category,
      item_brand: productData.brand,
    };

    const value = item.price;`;

    let extractionCode: string;
    if (dataSource === 'dataLayer') {
      extractionCode = dataLayerExtraction;
    } else if (dataSource === 'jsonld') {
      extractionCode = jsonldExtraction;
    } else if (dataSource === 'meta') {
      extractionCode = metaExtraction;
    } else {
      extractionCode = variableExtraction;
    }

    const content = `import { defineTag } from '@yourtm/cli'
import { gtag } from '@yourtm/vendors/google'

/**
 * GA4 E-commerce View Item Tag
 *
 * Tracks when users view a product detail page.
 * This tag requires the GA4 Configuration tag to be loaded first.
 *
 * Product page pattern: ${productPagePattern}
 */
export default defineTag({
  id: '${tagId}',
  name: 'GA4 E-commerce - View Item',
  description: 'Track product page views in Google Analytics 4',
  type: 'script',
  platform: 'google-analytics',
  vendor: 'google',

  // Fire on page view
  triggers: ['pageview'],

  // Product detail pages
  zones: ['product-pages', 'global'],

  // Requires analytics consent
  consent: ['analytics'],

  // Standard priority (after config tag)
  priority: 50,

  /**
   * Track the view item event
   */
  execute(ctx) {
    // Check if this is a product page
    const productPageRegex = new RegExp('${productPagePattern}');
    if (!productPageRegex.test(ctx.url.pathname)) {
      return; // Not a product page
    }
${extractionCode}

    // Send view_item event to GA4
    gtag('event', 'view_item', {
      currency: 'USD',
      value: value,
      items: [item],
    })

    console.log('[YourTM] View item tracked:', item.item_id)
  },
})
`;

    return [
      {
        path: `yourtm/tags/${fileName}`,
        content,
      },
    ];
  },
};

// ============================================================================
// GA4 User Properties Template
// ============================================================================

const ga4UserPropertiesTemplate: TagTemplate = {
  id: 'ga4-user-properties',
  name: 'GA4 User Properties',
  description: 'Set custom user properties in Google Analytics 4',
  category: 'analytics',
  type: 'tag',
  platform: 'google-analytics',
  icon: '👤',
  questions: [
    {
      type: 'text',
      name: 'properties',
      message: 'Define user properties (JSON format - property name: source path):',
      initial: '{"user_type": "dataLayer.userType", "membership_level": "dataLayer.membershipLevel"}',
    },
    {
      type: 'select',
      name: 'triggerTiming',
      message: 'When should user properties be set?',
      choices: [
        { title: 'On every page view', value: 'pageview' },
        { title: 'Once per session', value: 'session' },
        { title: 'On user login', value: 'login' },
      ],
      initial: 'pageview',
    },
  ],
  generate: (context: TemplateContext): GeneratedFile[] => {
    const { properties, triggerTiming } = context.answers;

    const tagId = 'ga4-user-properties';
    const fileName = `${tagId}.ts`;

    // Parse properties
    let parsedProperties: Record<string, string> = {};
    try {
      parsedProperties = JSON.parse(properties as string);
    } catch {
      parsedProperties = { user_type: 'dataLayer.userType' };
    }

    // Generate property extraction code
    const propertyExtractions = Object.entries(parsedProperties)
      .map(([propName, sourcePath]) => {
        const [source, ...path] = sourcePath.split('.');
        if (source === 'dataLayer') {
          return `    ${propName}: getDataLayerValue('${path.join('.')}'),`;
        }
        return `    ${propName}: (window as any).${sourcePath},`;
      })
      .join('\n');

    const sessionCheckCode =
      triggerTiming === 'session'
        ? `
    // Check if already set this session
    const sessionKey = 'ytm_user_props_set';
    if (sessionStorage.getItem(sessionKey)) {
      return; // Already set this session
    }
    sessionStorage.setItem(sessionKey, 'true');
`
        : '';

    const triggers =
      triggerTiming === 'login' ? ['user-login', 'pageview'] : ['pageview'];

    const content = `import { defineTag } from '@yourtm/cli'
import { gtag } from '@yourtm/vendors/google'

/**
 * GA4 User Properties Tag
 *
 * Sets custom user properties for user-scoped analytics dimensions.
 * This tag requires the GA4 Configuration tag to be loaded first.
 *
 * Properties configured:
${Object.entries(parsedProperties)
  .map(([name, source]) => ` *   - ${name}: ${source}`)
  .join('\n')}
 */
export default defineTag({
  id: '${tagId}',
  name: 'GA4 User Properties',
  description: 'Set custom user properties in Google Analytics 4',
  type: 'script',
  platform: 'google-analytics',
  vendor: 'google',

  // Trigger timing: ${triggerTiming}
  triggers: ${JSON.stringify(triggers)},

  // Global zone
  zones: ['global'],

  // Requires analytics consent
  consent: ['analytics'],

  // Should fire after config tag
  priority: 90,

  /**
   * Set user properties
   */
  execute(ctx) {${sessionCheckCode}
    // Helper to get nested dataLayer values
    const getDataLayerValue = (path: string) => {
      const parts = path.split('.');
      let value: any;

      for (const item of (window.dataLayer || [])) {
        let current = item;
        let found = true;

        for (const part of parts) {
          if (current && typeof current === 'object' && part in current) {
            current = current[part];
          } else {
            found = false;
            break;
          }
        }

        if (found && current !== undefined) {
          value = current;
        }
      }

      return value;
    };

    // Collect user properties
    const userProperties = {
${propertyExtractions}
    };

    // Filter out undefined values
    const filteredProperties = Object.fromEntries(
      Object.entries(userProperties).filter(([_, v]) => v !== undefined)
    );

    if (Object.keys(filteredProperties).length === 0) {
      return; // No properties to set
    }

    // Set user properties in GA4
    gtag('set', 'user_properties', filteredProperties);

    console.log('[YourTM] User properties set:', filteredProperties);
  },
})
`;

    return [
      {
        path: `yourtm/tags/${fileName}`,
        content,
      },
    ];
  },
};

// ============================================================================
// Google Ads Conversion Template
// ============================================================================

const googleAdsConversionTemplate: TagTemplate = {
  id: 'google-ads-conversion',
  name: 'Google Ads Conversion',
  description: 'Track conversions for Google Ads campaigns',
  category: 'advertising',
  type: 'tag',
  platform: 'google-ads',
  icon: '📈',
  questions: [
    {
      type: 'text',
      name: 'conversionId',
      message: 'Enter your Google Ads Conversion ID:',
      initial: 'AW-123456789',
      validate: validateConversionId,
    },
    {
      type: 'text',
      name: 'conversionLabel',
      message: 'Enter your Conversion Label:',
      initial: 'AbCdEfGhIjK',
      validate: (input: unknown) => {
        if (!input || typeof input !== 'string' || input.length < 5) {
          return 'Conversion label is required (usually 10-15 characters)';
        }
        return true;
      },
    },
    {
      type: 'select',
      name: 'valueSource',
      message: 'Where does the conversion value come from?',
      choices: [
        { title: 'Fixed value', value: 'fixed' },
        { title: 'dataLayer variable', value: 'dataLayer' },
        { title: 'JavaScript variable', value: 'variable' },
        { title: 'No value tracking', value: 'none' },
      ],
      initial: 'dataLayer',
    },
    {
      type: 'number',
      name: 'fixedValue',
      message: 'Enter the fixed conversion value:',
      initial: 1,
      when: (answers) => answers.valueSource === 'fixed',
    },
    {
      type: 'text',
      name: 'valueVariable',
      message: 'Enter the variable path for conversion value:',
      initial: 'ecommerce.value',
      when: (answers) =>
        answers.valueSource === 'dataLayer' ||
        answers.valueSource === 'variable',
    },
    {
      type: 'text',
      name: 'currency',
      message: 'Currency code:',
      initial: 'USD',
    },
    {
      type: 'text',
      name: 'transactionIdPath',
      message: 'Path to transaction/order ID (optional):',
      initial: 'ecommerce.transaction_id',
    },
  ],
  generate: (context: TemplateContext): GeneratedFile[] => {
    const {
      conversionId,
      conversionLabel,
      valueSource,
      fixedValue,
      valueVariable,
      currency,
      transactionIdPath,
    } = context.answers;

    const tagId = `google-ads-conversion-${toKebabCase(conversionLabel as string)}`;
    const fileName = `${tagId}.ts`;

    let valueCode: string;
    if (valueSource === 'fixed') {
      valueCode = `const value = ${fixedValue};
    const transactionId = undefined;`;
    } else if (valueSource === 'dataLayer') {
      valueCode = `
    // Get value from dataLayer
    const getDataLayerValue = (path: string) => {
      const parts = path.split('.');
      for (const item of (window.dataLayer || [])) {
        let current = item;
        for (const part of parts) {
          if (current && typeof current === 'object' && part in current) {
            current = current[part];
          } else {
            current = undefined;
            break;
          }
        }
        if (current !== undefined) return current;
      }
      return undefined;
    };

    const value = getDataLayerValue('${valueVariable}') || 0;
    const transactionId = getDataLayerValue('${transactionIdPath}');`;
    } else if (valueSource === 'variable') {
      const varPath = (valueVariable as string).split('.');
      valueCode = `
    // Get value from JavaScript variable
    const value = (window as any).${varPath.join('?.')} || 0;
    const transactionId = (window as any).${(transactionIdPath as string).split('.').join('?.')};`;
    } else {
      valueCode = `const value = undefined; // No value tracking
    const transactionId = undefined;`;
    }

    const content = `import { defineTag } from '@yourtm/cli'
import { loadGtag, gtag } from '@yourtm/vendors/google'

/**
 * Google Ads Conversion Tag
 *
 * Tracks conversions for Google Ads campaign optimization and bidding.
 *
 * Conversion ID: ${conversionId}
 * Conversion Label: ${conversionLabel}
 */
export default defineTag({
  id: '${tagId}',
  name: 'Google Ads Conversion - ${conversionLabel}',
  description: 'Track conversions for Google Ads campaigns',
  type: 'script',
  platform: 'google-ads',
  vendor: 'google',

  // Fire on conversion events
  triggers: ['purchase', 'form-submit', 'conversion'],

  // Conversion pages (e.g., thank you page)
  zones: ['conversion', 'global'],

  // Requires marketing consent
  consent: ['marketing'],

  // Standard priority
  priority: 50,

  /**
   * Load the gtag.js library (if not already loaded by GA4)
   */
  async setup() {
    await loadGtag('${conversionId}')
  },

  /**
   * Fire the conversion
   */
  execute(ctx) {
    ${valueCode}

    // Send conversion event to Google Ads
    gtag('event', 'conversion', {
      send_to: '${conversionId}/${conversionLabel}',
      value: value,
      currency: '${currency}',
      transaction_id: transactionId,
    })

    console.log('[YourTM] Google Ads conversion tracked:', {
      conversion_id: '${conversionId}',
      label: '${conversionLabel}',
      value: value,
      transaction_id: transactionId,
    })
  },
})
`;

    return [
      {
        path: `yourtm/tags/${fileName}`,
        content,
      },
    ];
  },
};

// ============================================================================
// Google Ads Remarketing Template
// ============================================================================

const googleAdsRemarketingTemplate: TagTemplate = {
  id: 'google-ads-remarketing',
  name: 'Google Ads Remarketing',
  description: 'Dynamic remarketing for Google Ads campaigns',
  category: 'advertising',
  type: 'tag',
  platform: 'google-ads',
  icon: '🎯',
  questions: [
    {
      type: 'text',
      name: 'conversionId',
      message: 'Enter your Google Ads Conversion ID:',
      initial: 'AW-123456789',
      validate: validateConversionId,
    },
    {
      type: 'select',
      name: 'pageType',
      message: 'What type of page is this tag for?',
      choices: [
        { title: 'Home page', value: 'home' },
        { title: 'Category/Search results', value: 'category' },
        { title: 'Product detail page', value: 'product' },
        { title: 'Shopping cart', value: 'cart' },
        { title: 'Purchase confirmation', value: 'purchase' },
        { title: 'All pages (general)', value: 'other' },
      ],
      initial: 'product',
    },
    {
      type: 'select',
      name: 'dataSource',
      message: 'Where does your product data come from?',
      choices: [
        { title: 'dataLayer (recommended)', value: 'dataLayer' },
        { title: 'JSON-LD structured data', value: 'jsonld' },
        { title: 'JavaScript variable', value: 'variable' },
      ],
      initial: 'dataLayer',
      when: (answers) =>
        ['product', 'cart', 'purchase', 'category'].includes(
          answers.pageType as string
        ),
    },
  ],
  generate: (context: TemplateContext): GeneratedFile[] => {
    const { conversionId, pageType, dataSource } = context.answers;

    const tagId = `google-ads-remarketing-${pageType}`;
    const fileName = `${tagId}.ts`;

    // Page type specific event data
    const pageTypeConfig: Record<
      string,
      { event: string; description: string; dataCode: string }
    > = {
      home: {
        event: 'view_item_list',
        description: 'Home page visit for remarketing',
        dataCode: `
    // Home page - no specific product data needed
    const eventData = {
      send_to: '${conversionId}',
      ecomm_pagetype: 'home',
    };`,
      },
      category: {
        event: 'view_item_list',
        description: 'Category/search page for remarketing',
        dataCode: `
    // Get product IDs from category/search results
    const getProductIds = () => {
      ${dataSource === 'dataLayer' ? `
      const listData = window.dataLayer?.find(
        (item: any) => item.ecommerce?.items || item.ecommerce?.impressions
      );
      const items = listData?.ecommerce?.items || listData?.ecommerce?.impressions || [];
      return items.slice(0, 10).map((item: any) => item.item_id || item.id);` : `
      const productElements = document.querySelectorAll('[data-product-id]');
      return Array.from(productElements).slice(0, 10).map(el => el.getAttribute('data-product-id'));`}
    };

    const productIds = getProductIds();

    const eventData = {
      send_to: '${conversionId}',
      ecomm_pagetype: 'category',
      ecomm_prodid: productIds,
    };`,
      },
      product: {
        event: 'view_item',
        description: 'Product page for remarketing',
        dataCode: `
    // Get product data for remarketing
    const getProductData = () => {
      ${dataSource === 'dataLayer' ? `
      const productData = window.dataLayer?.find(
        (item: any) => item.ecommerce?.items?.[0] || item.event === 'view_item'
      );
      const item = productData?.ecommerce?.items?.[0];
      return item ? {
        id: item.item_id || item.id,
        price: item.price,
        category: item.item_category || item.category,
      } : null;` : dataSource === 'jsonld' ? `
      const jsonLd = document.querySelector('script[type="application/ld+json"]');
      if (!jsonLd) return null;
      try {
        const data = JSON.parse(jsonLd.textContent || '{}');
        const product = data['@type'] === 'Product' ? data : null;
        return product ? {
          id: product.sku || product.productID,
          price: parseFloat(product.offers?.price || product.offers?.[0]?.price || '0'),
          category: product.category,
        } : null;
      } catch { return null; }` : `
      const productData = (window as any).productData;
      return productData ? {
        id: productData.id || productData.sku,
        price: productData.price,
        category: productData.category,
      } : null;`}
    };

    const product = getProductData();
    if (!product) {
      console.warn('[YourTM] Remarketing: No product data found');
      return;
    }

    const eventData = {
      send_to: '${conversionId}',
      ecomm_pagetype: 'product',
      ecomm_prodid: product.id,
      ecomm_totalvalue: product.price,
      ecomm_category: product.category,
    };`,
      },
      cart: {
        event: 'add_to_cart',
        description: 'Shopping cart for remarketing',
        dataCode: `
    // Get cart data for remarketing
    const getCartData = () => {
      ${dataSource === 'dataLayer' ? `
      const cartData = window.dataLayer?.find(
        (item: any) => item.ecommerce?.items && item.event?.includes('cart')
      );
      const items = cartData?.ecommerce?.items || [];
      return {
        ids: items.map((item: any) => item.item_id || item.id),
        total: cartData?.ecommerce?.value || items.reduce((sum: number, item: any) => sum + (item.price * (item.quantity || 1)), 0),
      };` : `
      const cartData = (window as any).cartData;
      return cartData ? {
        ids: cartData.items?.map((item: any) => item.id) || [],
        total: cartData.total || 0,
      } : { ids: [], total: 0 };`}
    };

    const cart = getCartData();

    const eventData = {
      send_to: '${conversionId}',
      ecomm_pagetype: 'cart',
      ecomm_prodid: cart.ids,
      ecomm_totalvalue: cart.total,
    };`,
      },
      purchase: {
        event: 'purchase',
        description: 'Purchase confirmation for remarketing',
        dataCode: `
    // Get purchase data for remarketing
    const getPurchaseData = () => {
      ${dataSource === 'dataLayer' ? `
      const purchaseData = window.dataLayer?.find(
        (item: any) => item.event === 'purchase' || item.ecommerce?.transaction_id
      );
      const ecommerce = purchaseData?.ecommerce;
      return ecommerce ? {
        ids: ecommerce.items?.map((item: any) => item.item_id || item.id) || [],
        total: ecommerce.value || 0,
      } : { ids: [], total: 0 };` : `
      const orderData = (window as any).orderData;
      return orderData ? {
        ids: orderData.items?.map((item: any) => item.id) || [],
        total: orderData.total || 0,
      } : { ids: [], total: 0 };`}
    };

    const purchase = getPurchaseData();

    const eventData = {
      send_to: '${conversionId}',
      ecomm_pagetype: 'purchase',
      ecomm_prodid: purchase.ids,
      ecomm_totalvalue: purchase.total,
    };`,
      },
      other: {
        event: 'page_view',
        description: 'General page for remarketing',
        dataCode: `
    // General remarketing - basic page data
    const eventData = {
      send_to: '${conversionId}',
      ecomm_pagetype: 'other',
    };`,
      },
    };

    const config = pageTypeConfig[pageType as string] || pageTypeConfig.other;

    const content = `import { defineTag } from '@yourtm/cli'
import { loadGtag, gtag } from '@yourtm/vendors/google'

/**
 * Google Ads Dynamic Remarketing Tag - ${toPascalCase(pageType as string)}
 *
 * ${config.description}
 * Sends audience signals to Google Ads for dynamic remarketing campaigns.
 *
 * Conversion ID: ${conversionId}
 * Page Type: ${pageType}
 */
export default defineTag({
  id: '${tagId}',
  name: 'Google Ads Remarketing - ${toPascalCase(pageType as string)}',
  description: '${config.description}',
  type: 'script',
  platform: 'google-ads',
  vendor: 'google',

  // Fire on page view
  triggers: ['pageview'],

  // Zone based on page type
  zones: ['${pageType === 'home' ? 'home' : pageType === 'purchase' ? 'conversion' : 'global'}'],

  // Requires marketing consent
  consent: ['marketing'],

  // Standard priority
  priority: 50,

  /**
   * Load the gtag.js library (if not already loaded)
   */
  async setup() {
    await loadGtag('${conversionId}')
  },

  /**
   * Send remarketing data
   */
  execute(ctx) {
    ${config.dataCode}

    // Send remarketing event to Google Ads
    gtag('event', '${config.event}', eventData);

    console.log('[YourTM] Google Ads remarketing:', eventData);
  },
})
`;

    return [
      {
        path: `yourtm/tags/${fileName}`,
        content,
      },
    ];
  },
};

// ============================================================================
// Export all templates
// ============================================================================

export const googleTemplates: TagTemplate[] = [
  ga4ConfigTemplate,
  ga4EventTemplate,
  ga4PurchaseTemplate,
  ga4AddToCartTemplate,
  ga4ViewItemTemplate,
  ga4UserPropertiesTemplate,
  googleAdsConversionTemplate,
  googleAdsRemarketingTemplate,
];

export default googleTemplates;
