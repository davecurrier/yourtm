/**
 * E-commerce and Utility Templates for YourTM
 *
 * This module provides cross-platform e-commerce templates and utility templates
 * for common tag management scenarios.
 */

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface TemplateQuestion {
  id: string;
  type: 'text' | 'select' | 'multiselect' | 'confirm' | 'number';
  message: string;
  default?: string | number | boolean | string[];
  choices?: Array<{ value: string; label: string }>;
  required?: boolean;
  validate?: (value: unknown) => boolean | string;
}

export interface TemplateContext {
  projectName?: string;
  containerId?: string;
  environment?: 'development' | 'staging' | 'production';
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: 'ecommerce' | 'utilities';
  platform: string | 'multi';
  questions: TemplateQuestion[];
  generate: (answers: Record<string, unknown>, context: TemplateContext) => string;
}

// =============================================================================
// Platform Choices (reusable)
// =============================================================================

const PLATFORM_CHOICES = [
  { value: 'ga4', label: 'Google Analytics 4' },
  { value: 'meta', label: 'Meta Pixel (Facebook)' },
  { value: 'tiktok', label: 'TikTok Pixel' },
  { value: 'pinterest', label: 'Pinterest Tag' },
  { value: 'snapchat', label: 'Snapchat Pixel' },
  { value: 'linkedin', label: 'LinkedIn Insight' },
  { value: 'twitter', label: 'Twitter/X Pixel' },
  { value: 'microsoft', label: 'Microsoft Ads (Bing)' },
];

const SESSION_RECORDING_CHOICES = [
  { value: 'hotjar', label: 'Hotjar' },
  { value: 'fullstory', label: 'FullStory' },
  { value: 'clarity', label: 'Microsoft Clarity' },
  { value: 'logrocket', label: 'LogRocket' },
  { value: 'mouseflow', label: 'Mouseflow' },
  { value: 'smartlook', label: 'Smartlook' },
];

const AB_TESTING_CHOICES = [
  { value: 'optimizely', label: 'Optimizely' },
  { value: 'vwo', label: 'VWO' },
  { value: 'abtasty', label: 'AB Tasty' },
  { value: 'google-optimize', label: 'Google Optimize (legacy)' },
  { value: 'launchdarkly', label: 'LaunchDarkly' },
];

const CHAT_WIDGET_CHOICES = [
  { value: 'intercom', label: 'Intercom' },
  { value: 'drift', label: 'Drift' },
  { value: 'zendesk', label: 'Zendesk Chat' },
  { value: 'hubspot', label: 'HubSpot Chat' },
  { value: 'crisp', label: 'Crisp' },
  { value: 'tawk', label: 'Tawk.to' },
  { value: 'freshchat', label: 'Freshchat' },
];

const ERROR_TRACKING_CHOICES = [
  { value: 'sentry', label: 'Sentry' },
  { value: 'bugsnag', label: 'Bugsnag' },
  { value: 'rollbar', label: 'Rollbar' },
  { value: 'raygun', label: 'Raygun' },
  { value: 'trackjs', label: 'TrackJS' },
];

// =============================================================================
// Helper Functions
// =============================================================================

function generateImports(platforms: string[]): string {
  const imports: string[] = ["import { defineTag } from '@yourtm/core'"];

  if (platforms.includes('ga4')) {
    imports.push("import { gtag } from '@yourtm/vendors/google'");
  }
  if (platforms.includes('meta')) {
    imports.push("import { fbq } from '@yourtm/vendors/meta'");
  }
  if (platforms.includes('tiktok')) {
    imports.push("import { ttq } from '@yourtm/vendors/tiktok'");
  }
  if (platforms.includes('pinterest')) {
    imports.push("import { pintrk } from '@yourtm/vendors/pinterest'");
  }
  if (platforms.includes('snapchat')) {
    imports.push("import { snaptr } from '@yourtm/vendors/snapchat'");
  }
  if (platforms.includes('linkedin')) {
    imports.push("import { lintrk } from '@yourtm/vendors/linkedin'");
  }
  if (platforms.includes('twitter')) {
    imports.push("import { twq } from '@yourtm/vendors/twitter'");
  }
  if (platforms.includes('microsoft')) {
    imports.push("import { uetq } from '@yourtm/vendors/microsoft'");
  }

  return imports.join('\n');
}

function generateDependsOn(platforms: string[]): string[] {
  const deps: string[] = [];
  if (platforms.includes('ga4')) deps.push('ga4-config');
  if (platforms.includes('meta')) deps.push('meta-pixel');
  if (platforms.includes('tiktok')) deps.push('tiktok-pixel');
  if (platforms.includes('pinterest')) deps.push('pinterest-tag');
  if (platforms.includes('snapchat')) deps.push('snapchat-pixel');
  if (platforms.includes('linkedin')) deps.push('linkedin-insight');
  if (platforms.includes('twitter')) deps.push('twitter-pixel');
  if (platforms.includes('microsoft')) deps.push('microsoft-ads');
  return deps;
}

function generateConsent(platforms: string[]): string[] {
  const consent = new Set<string>();
  platforms.forEach((p) => {
    if (p === 'ga4') consent.add('analytics');
    else consent.add('marketing');
  });
  return Array.from(consent);
}

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// =============================================================================
// E-commerce Templates
// =============================================================================

const purchaseTemplate: Template = {
  id: 'purchase-tracking',
  name: 'Purchase Tracking (All Platforms)',
  description:
    'Track purchase/conversion events across multiple advertising and analytics platforms',
  category: 'ecommerce',
  platform: 'multi',
  questions: [
    {
      id: 'platforms',
      type: 'multiselect',
      message: 'Which platforms should receive purchase events?',
      choices: PLATFORM_CHOICES,
      default: ['ga4', 'meta'],
      required: true,
    },
    {
      id: 'tagName',
      type: 'text',
      message: 'Tag name',
      default: 'purchase-tracking',
    },
    {
      id: 'trigger',
      type: 'text',
      message: 'Trigger name (e.g., purchase-complete, order-confirmation)',
      default: 'purchase-complete',
    },
    {
      id: 'zone',
      type: 'text',
      message: 'Zone (e.g., checkout, global)',
      default: 'checkout',
    },
    {
      id: 'dataLayerPath',
      type: 'text',
      message: 'Data layer path for purchase data',
      default: 'ecommerce.purchase',
    },
  ],
  generate: (answers, _context) => {
    const platforms = answers.platforms as string[];
    const tagName = (answers.tagName as string) || 'purchase-tracking';
    const trigger = (answers.trigger as string) || 'purchase-complete';
    const zone = (answers.zone as string) || 'checkout';
    const dataLayerPath = (answers.dataLayerPath as string) || 'ecommerce.purchase';

    const imports = generateImports(platforms);
    const dependsOn = generateDependsOn(platforms);
    const consent = generateConsent(platforms);

    let executeBody = `    const order = ctx.dataLayer.${dataLayerPath.replace(/\./g, '?.')}
    if (!order) return
`;

    if (platforms.includes('ga4')) {
      executeBody += `
    // Google Analytics 4
    gtag('event', 'purchase', {
      transaction_id: order.id,
      value: order.value,
      currency: order.currency,
      tax: order.tax,
      shipping: order.shipping,
      coupon: order.coupon,
      items: order.items,
    })
`;
    }

    if (platforms.includes('meta')) {
      executeBody += `
    // Meta Pixel
    fbq('track', 'Purchase', {
      value: order.value,
      currency: order.currency,
      content_ids: order.items?.map(i => i.id),
      content_type: 'product',
      num_items: order.items?.length,
    })
`;
    }

    if (platforms.includes('tiktok')) {
      executeBody += `
    // TikTok Pixel
    ttq.track('CompletePayment', {
      value: order.value,
      currency: order.currency,
      contents: order.items?.map(i => ({
        content_id: i.id,
        content_type: 'product',
        quantity: i.quantity,
        price: i.price,
      })),
    })
`;
    }

    if (platforms.includes('pinterest')) {
      executeBody += `
    // Pinterest Tag
    pintrk('track', 'checkout', {
      value: order.value,
      currency: order.currency,
      order_id: order.id,
      line_items: order.items?.map(i => ({
        product_id: i.id,
        product_quantity: i.quantity,
        product_price: i.price,
      })),
    })
`;
    }

    if (platforms.includes('snapchat')) {
      executeBody += `
    // Snapchat Pixel
    snaptr('track', 'PURCHASE', {
      price: order.value,
      currency: order.currency,
      transaction_id: order.id,
      item_ids: order.items?.map(i => i.id),
    })
`;
    }

    if (platforms.includes('linkedin')) {
      executeBody += `
    // LinkedIn Insight
    lintrk('track', { conversion_id: 'purchase' })
`;
    }

    if (platforms.includes('twitter')) {
      executeBody += `
    // Twitter/X Pixel
    twq('event', 'tw-purchase', {
      value: order.value,
      currency: order.currency,
      conversion_id: order.id,
      num_items: order.items?.length,
    })
`;
    }

    if (platforms.includes('microsoft')) {
      executeBody += `
    // Microsoft Ads (Bing)
    uetq.push('event', 'purchase', {
      revenue_value: order.value,
      currency: order.currency,
      transaction_id: order.id,
    })
`;
    }

    return `${imports}

export default defineTag({
  name: '${tagName}',
  description: 'Multi-platform purchase tracking',
  triggers: ['${trigger}'],
  zones: ['${zone}'],
  consent: ${JSON.stringify(consent)},
  dependsOn: ${JSON.stringify(dependsOn)},

  execute(ctx) {
${executeBody}  },
})
`;
  },
};

const addToCartTemplate: Template = {
  id: 'add-to-cart',
  name: 'Add to Cart (All Platforms)',
  description: 'Track add-to-cart events across multiple advertising and analytics platforms',
  category: 'ecommerce',
  platform: 'multi',
  questions: [
    {
      id: 'platforms',
      type: 'multiselect',
      message: 'Which platforms should receive add-to-cart events?',
      choices: PLATFORM_CHOICES,
      default: ['ga4', 'meta'],
      required: true,
    },
    {
      id: 'tagName',
      type: 'text',
      message: 'Tag name',
      default: 'add-to-cart',
    },
    {
      id: 'trigger',
      type: 'text',
      message: 'Trigger name',
      default: 'add-to-cart',
    },
    {
      id: 'zone',
      type: 'text',
      message: 'Zone',
      default: 'global',
    },
  ],
  generate: (answers, _context) => {
    const platforms = answers.platforms as string[];
    const tagName = (answers.tagName as string) || 'add-to-cart';
    const trigger = (answers.trigger as string) || 'add-to-cart';
    const zone = (answers.zone as string) || 'global';

    const imports = generateImports(platforms);
    const dependsOn = generateDependsOn(platforms);
    const consent = generateConsent(platforms);

    let executeBody = `    const item = ctx.dataLayer.ecommerce?.add?.products?.[0] || ctx.dataLayer.ecommerce?.items?.[0]
    if (!item) return
`;

    if (platforms.includes('ga4')) {
      executeBody += `
    // Google Analytics 4
    gtag('event', 'add_to_cart', {
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
      value: item.price * (item.quantity || 1),
      items: [{
        item_id: item.id,
        item_name: item.name,
        item_brand: item.brand,
        item_category: item.category,
        price: item.price,
        quantity: item.quantity || 1,
      }],
    })
`;
    }

    if (platforms.includes('meta')) {
      executeBody += `
    // Meta Pixel
    fbq('track', 'AddToCart', {
      content_ids: [item.id],
      content_name: item.name,
      content_type: 'product',
      value: item.price * (item.quantity || 1),
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
    })
`;
    }

    if (platforms.includes('tiktok')) {
      executeBody += `
    // TikTok Pixel
    ttq.track('AddToCart', {
      contents: [{
        content_id: item.id,
        content_name: item.name,
        content_type: 'product',
        quantity: item.quantity || 1,
        price: item.price,
      }],
      value: item.price * (item.quantity || 1),
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
    })
`;
    }

    if (platforms.includes('pinterest')) {
      executeBody += `
    // Pinterest Tag
    pintrk('track', 'addtocart', {
      value: item.price * (item.quantity || 1),
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
      line_items: [{
        product_id: item.id,
        product_name: item.name,
        product_quantity: item.quantity || 1,
        product_price: item.price,
      }],
    })
`;
    }

    if (platforms.includes('snapchat')) {
      executeBody += `
    // Snapchat Pixel
    snaptr('track', 'ADD_CART', {
      item_ids: [item.id],
      price: item.price,
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
      number_items: item.quantity || 1,
    })
`;
    }

    if (platforms.includes('linkedin')) {
      executeBody += `
    // LinkedIn Insight
    lintrk('track', { conversion_id: 'add_to_cart' })
`;
    }

    if (platforms.includes('twitter')) {
      executeBody += `
    // Twitter/X Pixel
    twq('event', 'tw-add-to-cart', {
      value: item.price * (item.quantity || 1),
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
      num_items: item.quantity || 1,
    })
`;
    }

    if (platforms.includes('microsoft')) {
      executeBody += `
    // Microsoft Ads (Bing)
    uetq.push('event', 'add_to_cart', {
      ecomm_prodid: item.id,
      ecomm_quantity: item.quantity || 1,
      revenue_value: item.price * (item.quantity || 1),
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
    })
`;
    }

    return `${imports}

export default defineTag({
  name: '${tagName}',
  description: 'Multi-platform add-to-cart tracking',
  triggers: ['${trigger}'],
  zones: ['${zone}'],
  consent: ${JSON.stringify(consent)},
  dependsOn: ${JSON.stringify(dependsOn)},

  execute(ctx) {
${executeBody}  },
})
`;
  },
};

const productViewTemplate: Template = {
  id: 'product-view',
  name: 'Product View (All Platforms)',
  description: 'Track product view events across multiple advertising and analytics platforms',
  category: 'ecommerce',
  platform: 'multi',
  questions: [
    {
      id: 'platforms',
      type: 'multiselect',
      message: 'Which platforms should receive product view events?',
      choices: PLATFORM_CHOICES,
      default: ['ga4', 'meta'],
      required: true,
    },
    {
      id: 'tagName',
      type: 'text',
      message: 'Tag name',
      default: 'product-view',
    },
    {
      id: 'trigger',
      type: 'text',
      message: 'Trigger name',
      default: 'product-view',
    },
    {
      id: 'zone',
      type: 'text',
      message: 'Zone',
      default: 'product-pages',
    },
  ],
  generate: (answers, _context) => {
    const platforms = answers.platforms as string[];
    const tagName = (answers.tagName as string) || 'product-view';
    const trigger = (answers.trigger as string) || 'product-view';
    const zone = (answers.zone as string) || 'product-pages';

    const imports = generateImports(platforms);
    const dependsOn = generateDependsOn(platforms);
    const consent = generateConsent(platforms);

    let executeBody = `    const item = ctx.dataLayer.ecommerce?.detail?.products?.[0] || ctx.dataLayer.ecommerce?.items?.[0]
    if (!item) return
`;

    if (platforms.includes('ga4')) {
      executeBody += `
    // Google Analytics 4
    gtag('event', 'view_item', {
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
      value: item.price,
      items: [{
        item_id: item.id,
        item_name: item.name,
        item_brand: item.brand,
        item_category: item.category,
        price: item.price,
      }],
    })
`;
    }

    if (platforms.includes('meta')) {
      executeBody += `
    // Meta Pixel
    fbq('track', 'ViewContent', {
      content_ids: [item.id],
      content_name: item.name,
      content_type: 'product',
      value: item.price,
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
    })
`;
    }

    if (platforms.includes('tiktok')) {
      executeBody += `
    // TikTok Pixel
    ttq.track('ViewContent', {
      contents: [{
        content_id: item.id,
        content_name: item.name,
        content_type: 'product',
        price: item.price,
      }],
      value: item.price,
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
    })
`;
    }

    if (platforms.includes('pinterest')) {
      executeBody += `
    // Pinterest Tag
    pintrk('track', 'pagevisit', {
      line_items: [{
        product_id: item.id,
        product_name: item.name,
        product_price: item.price,
      }],
    })
`;
    }

    if (platforms.includes('snapchat')) {
      executeBody += `
    // Snapchat Pixel
    snaptr('track', 'VIEW_CONTENT', {
      item_ids: [item.id],
      price: item.price,
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
    })
`;
    }

    if (platforms.includes('linkedin')) {
      executeBody += `
    // LinkedIn Insight
    lintrk('track', { conversion_id: 'view_product' })
`;
    }

    if (platforms.includes('twitter')) {
      executeBody += `
    // Twitter/X Pixel
    twq('event', 'tw-view-content', {
      value: item.price,
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
    })
`;
    }

    if (platforms.includes('microsoft')) {
      executeBody += `
    // Microsoft Ads (Bing)
    uetq.push('event', 'view_item', {
      ecomm_prodid: item.id,
      revenue_value: item.price,
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
    })
`;
    }

    return `${imports}

export default defineTag({
  name: '${tagName}',
  description: 'Multi-platform product view tracking',
  triggers: ['${trigger}'],
  zones: ['${zone}'],
  consent: ${JSON.stringify(consent)},
  dependsOn: ${JSON.stringify(dependsOn)},

  execute(ctx) {
${executeBody}  },
})
`;
  },
};

const beginCheckoutTemplate: Template = {
  id: 'begin-checkout',
  name: 'Begin Checkout (All Platforms)',
  description: 'Track checkout initiation events across multiple platforms',
  category: 'ecommerce',
  platform: 'multi',
  questions: [
    {
      id: 'platforms',
      type: 'multiselect',
      message: 'Which platforms should receive checkout events?',
      choices: PLATFORM_CHOICES,
      default: ['ga4', 'meta'],
      required: true,
    },
    {
      id: 'tagName',
      type: 'text',
      message: 'Tag name',
      default: 'begin-checkout',
    },
    {
      id: 'trigger',
      type: 'text',
      message: 'Trigger name',
      default: 'begin-checkout',
    },
    {
      id: 'zone',
      type: 'text',
      message: 'Zone',
      default: 'checkout',
    },
  ],
  generate: (answers, _context) => {
    const platforms = answers.platforms as string[];
    const tagName = (answers.tagName as string) || 'begin-checkout';
    const trigger = (answers.trigger as string) || 'begin-checkout';
    const zone = (answers.zone as string) || 'checkout';

    const imports = generateImports(platforms);
    const dependsOn = generateDependsOn(platforms);
    const consent = generateConsent(platforms);

    let executeBody = `    const cart = ctx.dataLayer.ecommerce?.checkout || ctx.dataLayer.ecommerce
    if (!cart) return

    const items = cart.products || cart.items || []
    const value = items.reduce((sum, i) => sum + (i.price * (i.quantity || 1)), 0)
`;

    if (platforms.includes('ga4')) {
      executeBody += `
    // Google Analytics 4
    gtag('event', 'begin_checkout', {
      currency: cart.currency || 'USD',
      value: value,
      coupon: cart.coupon,
      items: items.map(i => ({
        item_id: i.id,
        item_name: i.name,
        price: i.price,
        quantity: i.quantity || 1,
      })),
    })
`;
    }

    if (platforms.includes('meta')) {
      executeBody += `
    // Meta Pixel
    fbq('track', 'InitiateCheckout', {
      content_ids: items.map(i => i.id),
      content_type: 'product',
      value: value,
      currency: cart.currency || 'USD',
      num_items: items.length,
    })
`;
    }

    if (platforms.includes('tiktok')) {
      executeBody += `
    // TikTok Pixel
    ttq.track('InitiateCheckout', {
      contents: items.map(i => ({
        content_id: i.id,
        content_type: 'product',
        quantity: i.quantity || 1,
        price: i.price,
      })),
      value: value,
      currency: cart.currency || 'USD',
    })
`;
    }

    if (platforms.includes('pinterest')) {
      executeBody += `
    // Pinterest Tag
    pintrk('track', 'checkout', {
      value: value,
      currency: cart.currency || 'USD',
      line_items: items.map(i => ({
        product_id: i.id,
        product_quantity: i.quantity || 1,
        product_price: i.price,
      })),
    })
`;
    }

    if (platforms.includes('snapchat')) {
      executeBody += `
    // Snapchat Pixel
    snaptr('track', 'START_CHECKOUT', {
      item_ids: items.map(i => i.id),
      price: value,
      currency: cart.currency || 'USD',
      number_items: items.length,
    })
`;
    }

    if (platforms.includes('linkedin')) {
      executeBody += `
    // LinkedIn Insight
    lintrk('track', { conversion_id: 'begin_checkout' })
`;
    }

    if (platforms.includes('twitter')) {
      executeBody += `
    // Twitter/X Pixel
    twq('event', 'tw-checkout-initiated', {
      value: value,
      currency: cart.currency || 'USD',
      num_items: items.length,
    })
`;
    }

    if (platforms.includes('microsoft')) {
      executeBody += `
    // Microsoft Ads (Bing)
    uetq.push('event', 'begin_checkout', {
      revenue_value: value,
      currency: cart.currency || 'USD',
    })
`;
    }

    return `${imports}

export default defineTag({
  name: '${tagName}',
  description: 'Multi-platform begin checkout tracking',
  triggers: ['${trigger}'],
  zones: ['${zone}'],
  consent: ${JSON.stringify(consent)},
  dependsOn: ${JSON.stringify(dependsOn)},

  execute(ctx) {
${executeBody}  },
})
`;
  },
};

const removeFromCartTemplate: Template = {
  id: 'remove-from-cart',
  name: 'Remove from Cart (All Platforms)',
  description: 'Track cart removal events across multiple platforms',
  category: 'ecommerce',
  platform: 'multi',
  questions: [
    {
      id: 'platforms',
      type: 'multiselect',
      message: 'Which platforms should receive remove-from-cart events?',
      choices: PLATFORM_CHOICES,
      default: ['ga4', 'meta'],
      required: true,
    },
    {
      id: 'tagName',
      type: 'text',
      message: 'Tag name',
      default: 'remove-from-cart',
    },
    {
      id: 'trigger',
      type: 'text',
      message: 'Trigger name',
      default: 'remove-from-cart',
    },
    {
      id: 'zone',
      type: 'text',
      message: 'Zone',
      default: 'global',
    },
  ],
  generate: (answers, _context) => {
    const platforms = answers.platforms as string[];
    const tagName = (answers.tagName as string) || 'remove-from-cart';
    const trigger = (answers.trigger as string) || 'remove-from-cart';
    const zone = (answers.zone as string) || 'global';

    const imports = generateImports(platforms);
    const dependsOn = generateDependsOn(platforms);
    const consent = generateConsent(platforms);

    let executeBody = `    const item = ctx.dataLayer.ecommerce?.remove?.products?.[0] || ctx.dataLayer.ecommerce?.items?.[0]
    if (!item) return
`;

    if (platforms.includes('ga4')) {
      executeBody += `
    // Google Analytics 4
    gtag('event', 'remove_from_cart', {
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
      value: item.price * (item.quantity || 1),
      items: [{
        item_id: item.id,
        item_name: item.name,
        price: item.price,
        quantity: item.quantity || 1,
      }],
    })
`;
    }

    if (platforms.includes('meta')) {
      executeBody += `
    // Meta Pixel - Custom event for remove from cart
    fbq('trackCustom', 'RemoveFromCart', {
      content_ids: [item.id],
      content_name: item.name,
      value: item.price * (item.quantity || 1),
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
    })
`;
    }

    if (platforms.includes('tiktok')) {
      executeBody += `
    // TikTok Pixel - Custom event
    ttq.track('RemoveFromCart', {
      contents: [{
        content_id: item.id,
        content_name: item.name,
        quantity: item.quantity || 1,
        price: item.price,
      }],
      value: item.price * (item.quantity || 1),
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
    })
`;
    }

    return `${imports}

export default defineTag({
  name: '${tagName}',
  description: 'Multi-platform remove-from-cart tracking',
  triggers: ['${trigger}'],
  zones: ['${zone}'],
  consent: ${JSON.stringify(consent)},
  dependsOn: ${JSON.stringify(dependsOn)},

  execute(ctx) {
${executeBody}  },
})
`;
  },
};

const viewCartTemplate: Template = {
  id: 'view-cart',
  name: 'View Cart (All Platforms)',
  description: 'Track cart view events across multiple platforms',
  category: 'ecommerce',
  platform: 'multi',
  questions: [
    {
      id: 'platforms',
      type: 'multiselect',
      message: 'Which platforms should receive view-cart events?',
      choices: PLATFORM_CHOICES,
      default: ['ga4', 'meta'],
      required: true,
    },
    {
      id: 'tagName',
      type: 'text',
      message: 'Tag name',
      default: 'view-cart',
    },
    {
      id: 'trigger',
      type: 'text',
      message: 'Trigger name',
      default: 'view-cart',
    },
    {
      id: 'zone',
      type: 'text',
      message: 'Zone',
      default: 'cart',
    },
  ],
  generate: (answers, _context) => {
    const platforms = answers.platforms as string[];
    const tagName = (answers.tagName as string) || 'view-cart';
    const trigger = (answers.trigger as string) || 'view-cart';
    const zone = (answers.zone as string) || 'cart';

    const imports = generateImports(platforms);
    const dependsOn = generateDependsOn(platforms);
    const consent = generateConsent(platforms);

    let executeBody = `    const cart = ctx.dataLayer.ecommerce?.cart || ctx.dataLayer.ecommerce
    if (!cart) return

    const items = cart.products || cart.items || []
    const value = items.reduce((sum, i) => sum + (i.price * (i.quantity || 1)), 0)
`;

    if (platforms.includes('ga4')) {
      executeBody += `
    // Google Analytics 4
    gtag('event', 'view_cart', {
      currency: cart.currency || 'USD',
      value: value,
      items: items.map(i => ({
        item_id: i.id,
        item_name: i.name,
        price: i.price,
        quantity: i.quantity || 1,
      })),
    })
`;
    }

    if (platforms.includes('meta')) {
      executeBody += `
    // Meta Pixel - Custom event for cart view
    fbq('trackCustom', 'ViewCart', {
      content_ids: items.map(i => i.id),
      value: value,
      currency: cart.currency || 'USD',
      num_items: items.length,
    })
`;
    }

    if (platforms.includes('tiktok')) {
      executeBody += `
    // TikTok Pixel
    ttq.track('ViewCart', {
      contents: items.map(i => ({
        content_id: i.id,
        quantity: i.quantity || 1,
        price: i.price,
      })),
      value: value,
      currency: cart.currency || 'USD',
    })
`;
    }

    return `${imports}

export default defineTag({
  name: '${tagName}',
  description: 'Multi-platform view-cart tracking',
  triggers: ['${trigger}'],
  zones: ['${zone}'],
  consent: ${JSON.stringify(consent)},
  dependsOn: ${JSON.stringify(dependsOn)},

  execute(ctx) {
${executeBody}  },
})
`;
  },
};

const addToWishlistTemplate: Template = {
  id: 'add-to-wishlist',
  name: 'Add to Wishlist (All Platforms)',
  description: 'Track wishlist add events across multiple platforms',
  category: 'ecommerce',
  platform: 'multi',
  questions: [
    {
      id: 'platforms',
      type: 'multiselect',
      message: 'Which platforms should receive wishlist events?',
      choices: PLATFORM_CHOICES,
      default: ['ga4', 'meta'],
      required: true,
    },
    {
      id: 'tagName',
      type: 'text',
      message: 'Tag name',
      default: 'add-to-wishlist',
    },
    {
      id: 'trigger',
      type: 'text',
      message: 'Trigger name',
      default: 'add-to-wishlist',
    },
    {
      id: 'zone',
      type: 'text',
      message: 'Zone',
      default: 'global',
    },
  ],
  generate: (answers, _context) => {
    const platforms = answers.platforms as string[];
    const tagName = (answers.tagName as string) || 'add-to-wishlist';
    const trigger = (answers.trigger as string) || 'add-to-wishlist';
    const zone = (answers.zone as string) || 'global';

    const imports = generateImports(platforms);
    const dependsOn = generateDependsOn(platforms);
    const consent = generateConsent(platforms);

    let executeBody = `    const item = ctx.dataLayer.ecommerce?.wishlist?.products?.[0] || ctx.dataLayer.ecommerce?.items?.[0]
    if (!item) return
`;

    if (platforms.includes('ga4')) {
      executeBody += `
    // Google Analytics 4
    gtag('event', 'add_to_wishlist', {
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
      value: item.price,
      items: [{
        item_id: item.id,
        item_name: item.name,
        price: item.price,
      }],
    })
`;
    }

    if (platforms.includes('meta')) {
      executeBody += `
    // Meta Pixel
    fbq('track', 'AddToWishlist', {
      content_ids: [item.id],
      content_name: item.name,
      content_type: 'product',
      value: item.price,
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
    })
`;
    }

    if (platforms.includes('tiktok')) {
      executeBody += `
    // TikTok Pixel
    ttq.track('AddToWishlist', {
      contents: [{
        content_id: item.id,
        content_name: item.name,
        price: item.price,
      }],
      value: item.price,
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
    })
`;
    }

    if (platforms.includes('pinterest')) {
      executeBody += `
    // Pinterest Tag - Custom event
    pintrk('track', 'custom', {
      event_name: 'add_to_wishlist',
      line_items: [{
        product_id: item.id,
        product_name: item.name,
        product_price: item.price,
      }],
    })
`;
    }

    if (platforms.includes('snapchat')) {
      executeBody += `
    // Snapchat Pixel
    snaptr('track', 'ADD_TO_WISHLIST', {
      item_ids: [item.id],
      price: item.price,
      currency: ctx.dataLayer.ecommerce?.currency || 'USD',
    })
`;
    }

    return `${imports}

export default defineTag({
  name: '${tagName}',
  description: 'Multi-platform add-to-wishlist tracking',
  triggers: ['${trigger}'],
  zones: ['${zone}'],
  consent: ${JSON.stringify(consent)},
  dependsOn: ${JSON.stringify(dependsOn)},

  execute(ctx) {
${executeBody}  },
})
`;
  },
};

// =============================================================================
// Utility Templates
// =============================================================================

const customHtmlTemplate: Template = {
  id: 'custom-html',
  name: 'Custom HTML',
  description: 'Inject arbitrary HTML/JavaScript into the page',
  category: 'utilities',
  platform: 'custom',
  questions: [
    {
      id: 'tagName',
      type: 'text',
      message: 'Tag name',
      default: 'custom-widget',
      required: true,
    },
    {
      id: 'description',
      type: 'text',
      message: 'Description',
      default: 'Custom HTML widget',
    },
    {
      id: 'trigger',
      type: 'text',
      message: 'Trigger name',
      default: 'page-load',
    },
    {
      id: 'zone',
      type: 'text',
      message: 'Zone',
      default: 'global',
    },
    {
      id: 'consent',
      type: 'multiselect',
      message: 'Required consent categories',
      choices: [
        { value: 'essential', label: 'Essential (always allowed)' },
        { value: 'analytics', label: 'Analytics' },
        { value: 'marketing', label: 'Marketing' },
        { value: 'functional', label: 'Functional' },
      ],
      default: ['essential'],
    },
    {
      id: 'insertPosition',
      type: 'select',
      message: 'Where to insert the HTML?',
      choices: [
        { value: 'body-end', label: 'End of body' },
        { value: 'body-start', label: 'Start of body' },
        { value: 'head', label: 'Head' },
        { value: 'custom', label: 'Custom selector' },
      ],
      default: 'body-end',
    },
    {
      id: 'customSelector',
      type: 'text',
      message: 'Custom CSS selector (if custom position selected)',
      default: '#my-container',
    },
  ],
  generate: (answers, _context) => {
    const tagName = toKebabCase((answers.tagName as string) || 'custom-widget');
    const description = (answers.description as string) || 'Custom HTML widget';
    const trigger = (answers.trigger as string) || 'page-load';
    const zone = (answers.zone as string) || 'global';
    const consent = (answers.consent as string[]) || ['essential'];
    const insertPosition = (answers.insertPosition as string) || 'body-end';
    const customSelector = (answers.customSelector as string) || '#my-container';

    let insertCode: string;
    switch (insertPosition) {
      case 'body-start':
        insertCode = `document.body.insertBefore(container, document.body.firstChild)`;
        break;
      case 'head':
        insertCode = `document.head.appendChild(container)`;
        break;
      case 'custom':
        insertCode = `const target = document.querySelector('${customSelector}')
    if (target) target.appendChild(container)
    else document.body.appendChild(container)`;
        break;
      default:
        insertCode = `document.body.appendChild(container)`;
    }

    return `import { defineTag } from '@yourtm/core'

export default defineTag({
  name: '${tagName}',
  description: '${description}',
  triggers: ['${trigger}'],
  zones: ['${zone}'],
  consent: ${JSON.stringify(consent)},

  execute(ctx) {
    // Create container for custom HTML
    const container = document.createElement('div')
    container.id = 'ytm-${tagName}'

    // Your custom HTML/JavaScript here
    container.innerHTML = \`
      <!-- Custom HTML content -->
      <div class="my-custom-widget">
        <p>Hello from YourTM!</p>
      </div>
    \`

    // Insert into page
    ${insertCode}

    // Optional: Execute custom JavaScript
    // const script = document.createElement('script')
    // script.textContent = \`console.log('Custom widget loaded')\`
    // document.body.appendChild(script)
  },
})
`;
  },
};

const customScriptTemplate: Template = {
  id: 'custom-script',
  name: 'Custom Script',
  description: 'Load an external JavaScript file',
  category: 'utilities',
  platform: 'custom',
  questions: [
    {
      id: 'tagName',
      type: 'text',
      message: 'Tag name',
      default: 'custom-script',
      required: true,
    },
    {
      id: 'scriptUrl',
      type: 'text',
      message: 'Script URL',
      default: 'https://example.com/script.js',
      required: true,
    },
    {
      id: 'async',
      type: 'confirm',
      message: 'Load asynchronously?',
      default: true,
    },
    {
      id: 'defer',
      type: 'confirm',
      message: 'Defer execution?',
      default: false,
    },
    {
      id: 'trigger',
      type: 'text',
      message: 'Trigger name',
      default: 'page-load',
    },
    {
      id: 'zone',
      type: 'text',
      message: 'Zone',
      default: 'global',
    },
    {
      id: 'consent',
      type: 'multiselect',
      message: 'Required consent categories',
      choices: [
        { value: 'essential', label: 'Essential (always allowed)' },
        { value: 'analytics', label: 'Analytics' },
        { value: 'marketing', label: 'Marketing' },
        { value: 'functional', label: 'Functional' },
      ],
      default: ['functional'],
    },
  ],
  generate: (answers, _context) => {
    const tagName = toKebabCase((answers.tagName as string) || 'custom-script');
    const scriptUrl = (answers.scriptUrl as string) || 'https://example.com/script.js';
    const isAsync = answers.async !== false;
    const isDefer = answers.defer === true;
    const trigger = (answers.trigger as string) || 'page-load';
    const zone = (answers.zone as string) || 'global';
    const consent = (answers.consent as string[]) || ['functional'];

    return `import { defineTag } from '@yourtm/core'

export default defineTag({
  name: '${tagName}',
  description: 'Load external script: ${scriptUrl}',
  triggers: ['${trigger}'],
  zones: ['${zone}'],
  consent: ${JSON.stringify(consent)},

  execute(ctx) {
    return new Promise((resolve, reject) => {
      // Check if script already loaded
      if (document.querySelector('script[src="${scriptUrl}"]')) {
        resolve()
        return
      }

      const script = document.createElement('script')
      script.src = '${scriptUrl}'
      script.async = ${isAsync}
      script.defer = ${isDefer}

      script.onload = () => {
        console.log('[YTM] Script loaded: ${scriptUrl}')
        resolve()
      }

      script.onerror = (error) => {
        console.error('[YTM] Script failed to load: ${scriptUrl}', error)
        resolve() // Resolve anyway to not block other tags
      }

      document.head.appendChild(script)
    })
  },
})
`;
  },
};

const dataLayerPushTemplate: Template = {
  id: 'datalayer-push',
  name: 'Data Layer Push',
  description: 'Push data to the dataLayer',
  category: 'utilities',
  platform: 'custom',
  questions: [
    {
      id: 'tagName',
      type: 'text',
      message: 'Tag name',
      default: 'datalayer-push',
      required: true,
    },
    {
      id: 'eventName',
      type: 'text',
      message: 'Event name',
      default: 'custom_event',
    },
    {
      id: 'trigger',
      type: 'text',
      message: 'Trigger name',
      default: 'page-load',
    },
    {
      id: 'zone',
      type: 'text',
      message: 'Zone',
      default: 'global',
    },
  ],
  generate: (answers, _context) => {
    const tagName = toKebabCase((answers.tagName as string) || 'datalayer-push');
    const eventName = (answers.eventName as string) || 'custom_event';
    const trigger = (answers.trigger as string) || 'page-load';
    const zone = (answers.zone as string) || 'global';

    return `import { defineTag } from '@yourtm/core'

export default defineTag({
  name: '${tagName}',
  description: 'Push data to dataLayer',
  triggers: ['${trigger}'],
  zones: ['${zone}'],
  consent: ['essential'],

  execute(ctx) {
    // Initialize dataLayer if needed
    window.dataLayer = window.dataLayer || []

    // Push event to dataLayer
    window.dataLayer.push({
      event: '${eventName}',
      timestamp: new Date().toISOString(),
      page: {
        path: window.location.pathname,
        title: document.title,
        url: window.location.href,
      },
      // Add your custom data here
      // customData: {
      //   key: 'value',
      // },
    })

    console.log('[YTM] DataLayer push: ${eventName}')
  },
})
`;
  },
};

const cookieWriterTemplate: Template = {
  id: 'cookie-writer',
  name: 'Cookie Writer',
  description: 'Set cookies with configurable options',
  category: 'utilities',
  platform: 'custom',
  questions: [
    {
      id: 'tagName',
      type: 'text',
      message: 'Tag name',
      default: 'cookie-writer',
      required: true,
    },
    {
      id: 'cookieName',
      type: 'text',
      message: 'Cookie name',
      default: 'my_cookie',
      required: true,
    },
    {
      id: 'cookieValue',
      type: 'text',
      message: 'Cookie value (or "dynamic" for runtime value)',
      default: 'dynamic',
    },
    {
      id: 'expireDays',
      type: 'number',
      message: 'Cookie expiration (days)',
      default: 365,
    },
    {
      id: 'secure',
      type: 'confirm',
      message: 'Secure cookie (HTTPS only)?',
      default: true,
    },
    {
      id: 'sameSite',
      type: 'select',
      message: 'SameSite attribute',
      choices: [
        { value: 'Strict', label: 'Strict' },
        { value: 'Lax', label: 'Lax' },
        { value: 'None', label: 'None' },
      ],
      default: 'Lax',
    },
    {
      id: 'trigger',
      type: 'text',
      message: 'Trigger name',
      default: 'page-load',
    },
    {
      id: 'consent',
      type: 'multiselect',
      message: 'Required consent categories',
      choices: [
        { value: 'essential', label: 'Essential (always allowed)' },
        { value: 'analytics', label: 'Analytics' },
        { value: 'marketing', label: 'Marketing' },
        { value: 'functional', label: 'Functional' },
      ],
      default: ['functional'],
    },
  ],
  generate: (answers, _context) => {
    const tagName = toKebabCase((answers.tagName as string) || 'cookie-writer');
    const cookieName = (answers.cookieName as string) || 'my_cookie';
    const cookieValue = (answers.cookieValue as string) || 'dynamic';
    const expireDays = (answers.expireDays as number) || 365;
    const secure = answers.secure !== false;
    const sameSite = (answers.sameSite as string) || 'Lax';
    const trigger = (answers.trigger as string) || 'page-load';
    const consent = (answers.consent as string[]) || ['functional'];

    const valueCode =
      cookieValue === 'dynamic'
        ? `// Generate dynamic value
    const value = ctx.dataLayer.userId || generateUUID()`
        : `const value = '${cookieValue}'`;

    return `import { defineTag } from '@yourtm/core'

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export default defineTag({
  name: '${tagName}',
  description: 'Set cookie: ${cookieName}',
  triggers: ['${trigger}'],
  zones: ['global'],
  consent: ${JSON.stringify(consent)},

  execute(ctx) {
    ${valueCode}

    // Calculate expiration date
    const expires = new Date()
    expires.setTime(expires.getTime() + ${expireDays} * 24 * 60 * 60 * 1000)

    // Build cookie string
    const cookieParts = [
      '${cookieName}=' + encodeURIComponent(value),
      'expires=' + expires.toUTCString(),
      'path=/',
      'SameSite=${sameSite}',
    ]

    ${secure ? "cookieParts.push('Secure')" : '// Not using Secure flag'}
    ${sameSite === 'None' ? "cookieParts.push('Secure') // Required for SameSite=None" : ''}

    document.cookie = cookieParts.join('; ')

    console.log('[YTM] Cookie set: ${cookieName}')
  },
})
`;
  },
};

const localStorageTemplate: Template = {
  id: 'local-storage',
  name: 'Local Storage',
  description: 'Read/write data to localStorage',
  category: 'utilities',
  platform: 'custom',
  questions: [
    {
      id: 'tagName',
      type: 'text',
      message: 'Tag name',
      default: 'local-storage',
      required: true,
    },
    {
      id: 'operation',
      type: 'select',
      message: 'Operation type',
      choices: [
        { value: 'write', label: 'Write to localStorage' },
        { value: 'read', label: 'Read from localStorage' },
        { value: 'delete', label: 'Delete from localStorage' },
      ],
      default: 'write',
    },
    {
      id: 'storageKey',
      type: 'text',
      message: 'Storage key',
      default: 'ytm_data',
      required: true,
    },
    {
      id: 'trigger',
      type: 'text',
      message: 'Trigger name',
      default: 'page-load',
    },
    {
      id: 'consent',
      type: 'multiselect',
      message: 'Required consent categories',
      choices: [
        { value: 'essential', label: 'Essential (always allowed)' },
        { value: 'analytics', label: 'Analytics' },
        { value: 'marketing', label: 'Marketing' },
        { value: 'functional', label: 'Functional' },
      ],
      default: ['functional'],
    },
  ],
  generate: (answers, _context) => {
    const tagName = toKebabCase((answers.tagName as string) || 'local-storage');
    const operation = (answers.operation as string) || 'write';
    const storageKey = (answers.storageKey as string) || 'ytm_data';
    const trigger = (answers.trigger as string) || 'page-load';
    const consent = (answers.consent as string[]) || ['functional'];

    let operationCode: string;
    switch (operation) {
      case 'read':
        operationCode = `// Read from localStorage
    const stored = localStorage.getItem('${storageKey}')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        // Push to dataLayer for use by other tags
        window.dataLayer = window.dataLayer || []
        window.dataLayer.push({
          event: 'storage_read',
          storageKey: '${storageKey}',
          storageValue: data,
        })
        console.log('[YTM] localStorage read: ${storageKey}', data)
      } catch (e) {
        console.error('[YTM] Failed to parse localStorage data', e)
      }
    }`;
        break;
      case 'delete':
        operationCode = `// Delete from localStorage
    localStorage.removeItem('${storageKey}')
    console.log('[YTM] localStorage deleted: ${storageKey}')`;
        break;
      default:
        operationCode = `// Write to localStorage
    const data = {
      timestamp: new Date().toISOString(),
      pageViews: (getStoredData()?.pageViews || 0) + 1,
      lastPage: window.location.pathname,
      // Add your custom data here
    }

    localStorage.setItem('${storageKey}', JSON.stringify(data))
    console.log('[YTM] localStorage write: ${storageKey}', data)

    function getStoredData() {
      try {
        const stored = localStorage.getItem('${storageKey}')
        return stored ? JSON.parse(stored) : null
      } catch {
        return null
      }
    }`;
    }

    return `import { defineTag } from '@yourtm/core'

export default defineTag({
  name: '${tagName}',
  description: 'LocalStorage ${operation}: ${storageKey}',
  triggers: ['${trigger}'],
  zones: ['global'],
  consent: ${JSON.stringify(consent)},

  execute(ctx) {
    // Check for localStorage support
    if (typeof localStorage === 'undefined') {
      console.warn('[YTM] localStorage not available')
      return
    }

    ${operationCode}
  },
})
`;
  },
};

const sessionRecordingTemplate: Template = {
  id: 'session-recording',
  name: 'Session Recording',
  description: 'Load session recording tools like Hotjar, FullStory, or Clarity',
  category: 'utilities',
  platform: 'multi',
  questions: [
    {
      id: 'provider',
      type: 'select',
      message: 'Session recording provider',
      choices: SESSION_RECORDING_CHOICES,
      required: true,
    },
    {
      id: 'siteId',
      type: 'text',
      message: 'Site/Project ID',
      required: true,
    },
    {
      id: 'tagName',
      type: 'text',
      message: 'Tag name',
      default: 'session-recording',
    },
    {
      id: 'trigger',
      type: 'text',
      message: 'Trigger name',
      default: 'page-load',
    },
  ],
  generate: (answers, _context) => {
    const provider = (answers.provider as string) || 'hotjar';
    const siteId = (answers.siteId as string) || 'YOUR_SITE_ID';
    const tagName = toKebabCase((answers.tagName as string) || `${provider}-recording`);
    const trigger = (answers.trigger as string) || 'page-load';

    let providerCode: string;
    let providerName: string;

    switch (provider) {
      case 'hotjar':
        providerName = 'Hotjar';
        providerCode = `// Hotjar Tracking Code
    (function(h,o,t,j,a,r){
      h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
      h._hjSettings={hjid:${siteId},hjsv:6};
      a=o.getElementsByTagName('head')[0];
      r=o.createElement('script');r.async=1;
      r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
      a.appendChild(r);
    })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`;
        break;
      case 'fullstory':
        providerName = 'FullStory';
        providerCode = `// FullStory
    window['_fs_host'] = 'fullstory.com';
    window['_fs_script'] = 'edge.fullstory.com/s/fs.js';
    window['_fs_org'] = '${siteId}';
    window['_fs_namespace'] = 'FS';
    (function(m,n,e,t,l,o,g,y){
      if (e in m) {if(m.console && m.console.log) { m.console.log('FullStory namespace conflict.'); } return;}
      g=m[e]=function(a,b,s){g.q?g.q.push([a,b,s]):g._api(a,b,s);};g.q=[];
      o=n.createElement(t);o.async=1;o.crossOrigin='anonymous';o.src='https://'+_fs_script;
      y=n.getElementsByTagName(t)[0];y.parentNode.insertBefore(o,y);
      g.identify=function(i,v,s){g(l,{uid:i},s);if(v)g(l,v,s)};g.setUserVars=function(v,s){g(l,v,s)};g.event=function(i,v,s){g('event',{n:i,p:v},s)};
      g.anonymize=function(){g.identify(!!0)};
      g.shutdown=function(){g("rec",!1)};g.restart=function(){g("rec",!0)};
      g.log = function(a,b){g("log",[a,b])};
      g.consent=function(a){g("consent",!arguments.length||a)};
      g.identifyAccount=function(i,v){o='account';v=v||{};v.acctId=i;g(o,v)};
      g.clearUserCookie=function(){};
      g.setVars=function(n,p){g('setVars',[n,p]);};
      g._w={};y='XMLHttpRequest';g._w[y]=m[y];y='fetch';g._w[y]=m[y];
      if(m[y])m[y]=function(){return g._w[y].apply(this,arguments)};
      g._v="1.3.0";
    })(window,document,window['_fs_namespace'],'script','user');`;
        break;
      case 'clarity':
        providerName = 'Microsoft Clarity';
        providerCode = `// Microsoft Clarity
    (function(c,l,a,r,i,t,y){
      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
      t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "${siteId}");`;
        break;
      case 'logrocket':
        providerName = 'LogRocket';
        providerCode = `// LogRocket
    const script = document.createElement('script')
    script.src = 'https://cdn.lr-in-prod.com/LogRocket.min.js'
    script.crossOrigin = 'anonymous'
    script.onload = () => {
      window.LogRocket && window.LogRocket.init('${siteId}')
    }
    document.head.appendChild(script)`;
        break;
      case 'mouseflow':
        providerName = 'Mouseflow';
        providerCode = `// Mouseflow
    window._mfq = window._mfq || [];
    (function() {
      var mf = document.createElement("script");
      mf.type = "text/javascript"; mf.defer = true;
      mf.src = "//cdn.mouseflow.com/projects/${siteId}.js";
      document.getElementsByTagName("head")[0].appendChild(mf);
    })();`;
        break;
      case 'smartlook':
        providerName = 'Smartlook';
        providerCode = `// Smartlook
    window.smartlook||(function(d) {
      var o=smartlook=function(){ o.api.push(arguments)},h=d.getElementsByTagName('head')[0];
      var c=d.createElement('script');o.api=new Array();c.async=true;c.type='text/javascript';
      c.charset='utf-8';c.src='https://web-sdk.smartlook.com/recorder.js';h.appendChild(c);
    })(document);
    smartlook('init', '${siteId}', { region: 'eu' });`;
        break;
      default:
        providerName = provider;
        providerCode = `// Add your ${provider} initialization code here`;
    }

    return `import { defineTag } from '@yourtm/core'

export default defineTag({
  name: '${tagName}',
  description: '${providerName} session recording',
  triggers: ['${trigger}'],
  zones: ['global'],
  consent: ['analytics', 'functional'],

  execute(ctx) {
    ${providerCode}

    console.log('[YTM] ${providerName} loaded')
  },
})
`;
  },
};

const abTestingTemplate: Template = {
  id: 'ab-testing',
  name: 'A/B Testing',
  description: 'Load A/B testing tools like Optimizely, VWO, or AB Tasty',
  category: 'utilities',
  platform: 'multi',
  questions: [
    {
      id: 'provider',
      type: 'select',
      message: 'A/B testing provider',
      choices: AB_TESTING_CHOICES,
      required: true,
    },
    {
      id: 'projectId',
      type: 'text',
      message: 'Project/Account ID',
      required: true,
    },
    {
      id: 'tagName',
      type: 'text',
      message: 'Tag name',
      default: 'ab-testing',
    },
    {
      id: 'trigger',
      type: 'text',
      message: 'Trigger name',
      default: 'page-load',
    },
  ],
  generate: (answers, _context) => {
    const provider = (answers.provider as string) || 'optimizely';
    const projectId = (answers.projectId as string) || 'YOUR_PROJECT_ID';
    const tagName = toKebabCase((answers.tagName as string) || `${provider}-testing`);
    const trigger = (answers.trigger as string) || 'page-load';

    let providerCode: string;
    let providerName: string;

    switch (provider) {
      case 'optimizely':
        providerName = 'Optimizely';
        providerCode = `// Optimizely Web
    const script = document.createElement('script')
    script.src = 'https://cdn.optimizely.com/js/${projectId}.js'
    script.async = false // Load synchronously to prevent flicker
    document.head.insertBefore(script, document.head.firstChild)`;
        break;
      case 'vwo':
        providerName = 'VWO';
        providerCode = `// VWO
    window._vwo_code || (function() {
      var account_id=${projectId},
      version=2.0,
      settings_tolerance=2000,
      hide_element='body',
      hide_element_style = 'opacity:0 !important;filter:alpha(opacity=0) !important;background:none !important',
      /* DO NOT EDIT BELOW THIS LINE */
      f=false,w=window,d=document,v=d.querySelector('#vwoCode'),cK='_vwo_'+account_id+'_settings',cc={};try{var c=JSON.parse(localStorage.getItem('_vwo_'+account_id+'_config'));cc=c&&typeof c==='object'?c:{}}catch(e){}var stT=cc.stT==='session'?w.sessionStorage:w.localStorage;code={use_hierarchical_targeting:true,n498:true,settings_timer:null,init:function(){var a=d.createElement('style'),b=hide_element?hide_element+'{'+hide_element_style+'}':'',h=d.getElementsByTagName('head')[0];a.setAttribute('id','_vis_opt_path_hides');v&&a.setAttribute('nonce',v.nonce);a.setAttribute('type','text/css');if(a.styleSheet)a.styleSheet.cssText=b;else a.appendChild(d.createTextNode(b));h.appendChild(a);var i=this;this.load('https://dev.visualwebsiteoptimizer.com/j.php?a='+account_id+'&u='+encodeURIComponent(d.URL)+'&f='+ +f+'&vn='+version,{onLoad:function(){stT.setItem(cK,JSON.stringify({lt:Date.now(),v:code.lib&&code.lib.v||'unknown'}));if(i.s&&i.s.finish)i.s.finish()},onFinish:function(){if(f)return;a.remove()}})},load:function(a,b){var i=d.createElement('script'),s=d.getElementsByTagName('script')[0];i.src=a;i.type='text/javascript';i.onerror=function(){stT.removeItem(cK);if(b&&b.onFinish)b.onFinish()};i.onload=function(){if(b&&b.onLoad)b.onLoad();if(b&&b.onFinish)b.onFinish()};v&&i.setAttribute('nonce',v.nonce);s.parentNode.insertBefore(i,s)},getVersion:function(){return version},finish:function(){if(!f){f=true;var a=d.getElementById('_vis_opt_path_hides');if(a)a.parentNode.removeChild(a)}},finished:function(){return f}};w._vwo_code=code;code.init();})();`;
        break;
      case 'abtasty':
        providerName = 'AB Tasty';
        providerCode = `// AB Tasty
    (function() {
      var b = document.createElement('script');
      b.type = 'text/javascript';
      b.async = true;
      b.src = 'https://try.abtasty.com/${projectId}.js';
      var s = document.getElementsByTagName('script')[0];
      s.parentNode.insertBefore(b, s);
    })();`;
        break;
      case 'google-optimize':
        providerName = 'Google Optimize (Legacy)';
        providerCode = `// Google Optimize (Note: Sunset in 2023, consider migrating)
    const script = document.createElement('script')
    script.src = 'https://www.googleoptimize.com/optimize.js?id=${projectId}'
    script.async = true
    document.head.appendChild(script)

    console.warn('[YTM] Google Optimize was sunset in September 2023. Consider migrating to another provider.')`;
        break;
      case 'launchdarkly':
        providerName = 'LaunchDarkly';
        providerCode = `// LaunchDarkly
    const script = document.createElement('script')
    script.src = 'https://sdk.launchdarkly.com/client/2/ld.min.js'
    script.crossOrigin = 'anonymous'
    script.onload = () => {
      if (window.LDClient) {
        const user = { key: 'anonymous-' + Math.random().toString(36).substr(2, 9) }
        window.ldClient = window.LDClient.initialize('${projectId}', user)
        window.ldClient.on('ready', () => {
          console.log('[YTM] LaunchDarkly initialized')
        })
      }
    }
    document.head.appendChild(script)`;
        break;
      default:
        providerName = provider;
        providerCode = `// Add your ${provider} initialization code here`;
    }

    return `import { defineTag } from '@yourtm/core'

export default defineTag({
  name: '${tagName}',
  description: '${providerName} A/B testing',
  triggers: ['${trigger}'],
  zones: ['global'],
  consent: ['functional'],
  priority: 100, // Load early to prevent flicker

  execute(ctx) {
    ${providerCode}

    console.log('[YTM] ${providerName} loaded')
  },
})
`;
  },
};

const chatWidgetTemplate: Template = {
  id: 'chat-widget',
  name: 'Chat Widget',
  description: 'Load chat widgets like Intercom, Drift, or Zendesk',
  category: 'utilities',
  platform: 'multi',
  questions: [
    {
      id: 'provider',
      type: 'select',
      message: 'Chat widget provider',
      choices: CHAT_WIDGET_CHOICES,
      required: true,
    },
    {
      id: 'appId',
      type: 'text',
      message: 'App/Workspace ID',
      required: true,
    },
    {
      id: 'tagName',
      type: 'text',
      message: 'Tag name',
      default: 'chat-widget',
    },
    {
      id: 'trigger',
      type: 'text',
      message: 'Trigger name',
      default: 'page-load',
    },
  ],
  generate: (answers, _context) => {
    const provider = (answers.provider as string) || 'intercom';
    const appId = (answers.appId as string) || 'YOUR_APP_ID';
    const tagName = toKebabCase((answers.tagName as string) || `${provider}-chat`);
    const trigger = (answers.trigger as string) || 'page-load';

    let providerCode: string;
    let providerName: string;

    switch (provider) {
      case 'intercom':
        providerName = 'Intercom';
        providerCode = `// Intercom
    window.intercomSettings = {
      api_base: "https://api-iam.intercom.io",
      app_id: "${appId}",
      // Optional: Pass user data
      // name: ctx.dataLayer.user?.name,
      // email: ctx.dataLayer.user?.email,
      // user_id: ctx.dataLayer.user?.id,
    };

    (function(){var w=window;var ic=w.Intercom;if(typeof ic==="function"){ic('reattach_activator');ic('update',w.intercomSettings);}else{var d=document;var i=function(){i.c(arguments);};i.q=[];i.c=function(args){i.q.push(args);};w.Intercom=i;var l=function(){var s=d.createElement('script');s.type='text/javascript';s.async=true;s.src='https://widget.intercom.io/widget/${appId}';var x=d.getElementsByTagName('script')[0];x.parentNode.insertBefore(s,x);};if(document.readyState==='complete'){l();}else if(w.attachEvent){w.attachEvent('onload',l);}else{w.addEventListener('load',l,false);}}})();`;
        break;
      case 'drift':
        providerName = 'Drift';
        providerCode = `// Drift
    !function() {
      var t = window.driftt = window.drift = window.driftt || [];
      if (!t.init) {
        if (t.invoked) return void (window.console && console.error && console.error("Drift snippet included twice."));
        t.invoked = !0, t.methods = [ "identify", "config", "track", "reset", "debug", "show", "ping", "page", "hide", "off", "on" ],
        t.factory = function(e) {
          return function() {
            var n = Array.prototype.slice.call(arguments);
            return n.unshift(e), t.push(n), t;
          };
        }, t.methods.forEach(function(e) {
          t[e] = t.factory(e);
        }), t.load = function(t) {
          var e = 3e5, n = Math.ceil(new Date() / e) * e, o = document.createElement("script");
          o.type = "text/javascript", o.async = !0, o.crossorigin = "anonymous", o.src = "https://js.driftt.com/include/" + n + "/" + t + ".js";
          var i = document.getElementsByTagName("script")[0];
          i.parentNode.insertBefore(o, i);
        };
      }
    }();
    drift.SNIPPET_VERSION = '0.3.1';
    drift.load('${appId}');`;
        break;
      case 'zendesk':
        providerName = 'Zendesk Chat';
        providerCode = `// Zendesk Chat
    window.$zopim||(function(d,s){var z=$zopim=function(c){z._.push(c)},$=z.s=
    d.createElement(s),e=d.getElementsByTagName(s)[0];z.set=function(o){z.set.
    _.push(o)};z._=[];z.set._=[];$.async=!0;$.setAttribute("charset","utf-8");
    $.src="https://v2.zopim.com/?${appId}";z.t=+new Date;$.
    type="text/javascript";e.parentNode.insertBefore($,e)})(document,"script");`;
        break;
      case 'hubspot':
        providerName = 'HubSpot Chat';
        providerCode = `// HubSpot
    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.id = 'hs-script-loader'
    script.async = true
    script.defer = true
    script.src = '//js.hs-scripts.com/${appId}.js'
    document.head.appendChild(script)`;
        break;
      case 'crisp':
        providerName = 'Crisp';
        providerCode = `// Crisp
    window.$crisp=[];window.CRISP_WEBSITE_ID="${appId}";
    (function(){
      d=document;s=d.createElement("script");
      s.src="https://client.crisp.chat/l.js";
      s.async=1;d.getElementsByTagName("head")[0].appendChild(s);
    })();`;
        break;
      case 'tawk':
        providerName = 'Tawk.to';
        providerCode = `// Tawk.to
    var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
    (function(){
      var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
      s1.async=true;
      s1.src='https://embed.tawk.to/${appId}/default';
      s1.charset='UTF-8';
      s1.setAttribute('crossorigin','*');
      s0.parentNode.insertBefore(s1,s0);
    })();`;
        break;
      case 'freshchat':
        providerName = 'Freshchat';
        providerCode = `// Freshchat
    function initFreshChat() {
      window.fcWidget.init({
        token: "${appId}",
        host: "https://wchat.freshchat.com"
      });
    }
    function initialize(i,t){var e;i.getElementById(t)?initFreshChat():((e=i.createElement("script")).id=t,e.async=!0,e.src="https://wchat.freshchat.com/js/widget.js",e.onload=initFreshChat,i.head.appendChild(e))}
    function initiateCall(){initialize(document,"Freshchat-js-sdk")}
    window.addEventListener?window.addEventListener("load",initiateCall,!1):window.attachEvent("load",initiateCall,!1);`;
        break;
      default:
        providerName = provider;
        providerCode = `// Add your ${provider} initialization code here`;
    }

    return `import { defineTag } from '@yourtm/core'

export default defineTag({
  name: '${tagName}',
  description: '${providerName} chat widget',
  triggers: ['${trigger}'],
  zones: ['global'],
  consent: ['functional'],

  execute(ctx) {
    ${providerCode}

    console.log('[YTM] ${providerName} loaded')
  },
})
`;
  },
};

const errorTrackingTemplate: Template = {
  id: 'error-tracking',
  name: 'Error Tracking',
  description: 'Load error tracking tools like Sentry or Bugsnag',
  category: 'utilities',
  platform: 'multi',
  questions: [
    {
      id: 'provider',
      type: 'select',
      message: 'Error tracking provider',
      choices: ERROR_TRACKING_CHOICES,
      required: true,
    },
    {
      id: 'dsn',
      type: 'text',
      message: 'DSN/API Key',
      required: true,
    },
    {
      id: 'environment',
      type: 'select',
      message: 'Environment',
      choices: [
        { value: 'production', label: 'Production' },
        { value: 'staging', label: 'Staging' },
        { value: 'development', label: 'Development' },
      ],
      default: 'production',
    },
    {
      id: 'tagName',
      type: 'text',
      message: 'Tag name',
      default: 'error-tracking',
    },
    {
      id: 'trigger',
      type: 'text',
      message: 'Trigger name',
      default: 'page-load',
    },
  ],
  generate: (answers, _context) => {
    const provider = (answers.provider as string) || 'sentry';
    const dsn = (answers.dsn as string) || 'YOUR_DSN';
    const environment = (answers.environment as string) || 'production';
    const tagName = toKebabCase((answers.tagName as string) || `${provider}-errors`);
    const trigger = (answers.trigger as string) || 'page-load';

    let providerCode: string;
    let providerName: string;

    switch (provider) {
      case 'sentry':
        providerName = 'Sentry';
        providerCode = `// Sentry
    const script = document.createElement('script')
    script.src = 'https://browser.sentry-cdn.com/7.109.0/bundle.tracing.min.js'
    script.integrity = 'sha384-...' // Add actual integrity hash
    script.crossOrigin = 'anonymous'
    script.onload = () => {
      if (window.Sentry) {
        window.Sentry.init({
          dsn: '${dsn}',
          environment: '${environment}',
          tracesSampleRate: 0.1,
          // Optional: Add release version
          // release: 'my-app@1.0.0',
        })
      }
    }
    document.head.appendChild(script)`;
        break;
      case 'bugsnag':
        providerName = 'Bugsnag';
        providerCode = `// Bugsnag
    const script = document.createElement('script')
    script.src = 'https://d2wy8f7a9ursnm.cloudfront.net/v7/bugsnag.min.js'
    script.onload = () => {
      if (window.Bugsnag) {
        window.Bugsnag.start({
          apiKey: '${dsn}',
          releaseStage: '${environment}',
          enabledReleaseStages: ['production', 'staging'],
        })
      }
    }
    document.head.appendChild(script)`;
        break;
      case 'rollbar':
        providerName = 'Rollbar';
        providerCode = `// Rollbar
    var _rollbarConfig = {
      accessToken: "${dsn}",
      captureUncaught: true,
      captureUnhandledRejections: true,
      payload: {
        environment: "${environment}",
        client: {
          javascript: {
            source_map_enabled: true,
            code_version: "1.0.0",
            guess_uncaught_frames: true
          }
        }
      }
    };
    !function(r){var e={};function o(n){if(e[n])return e[n].exports;var t=e[n]={i:n,l:!1,exports:{}};return r[n].call(t.exports,t,t.exports,o),t.l=!0,t.exports}o.m=r,o.c=e,o.d=function(r,e,n){o.o(r,e)||Object.defineProperty(r,e,{enumerable:!0,get:n})},o.r=function(r){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(r,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(r,"__esModule",{value:!0})},o.t=function(r,e){if(1&e&&(r=o(r)),8&e)return r;if(4&e&&"object"==typeof r&&r&&r.__esModule)return r;var n=Object.create(null);if(o.r(n),Object.defineProperty(n,"default",{enumerable:!0,value:r}),2&e&&"string"!=typeof r)for(var t in r)o.d(n,t,function(e){return r[e]}.bind(null,t));return n},o.n=function(r){var e=r&&r.__esModule?function(){return r.default}:function(){return r};return o.d(e,"a",e),e},o.o=function(r,e){return Object.prototype.hasOwnProperty.call(r,e)},o.p="",o(o.s=0)}([function(r,e,o){"use strict";var n=o(1),t=o(5);_rollbarConfig=_rollbarConfig||{},_rollbarConfig.rollbarJsUrl=_rollbarConfig.rollbarJsUrl||"https://cdn.rollbar.com/rollbarjs/refs/tags/v2.26.0/rollbar.min.js",_rollbarConfig.async=void 0===_rollbarConfig.async||_rollbarConfig.async;var a=n.setupShim(window,_rollbarConfig),l=t(_rollbarConfig);window.rollbar=n.Rollbar,a.loadFull(window,document,!_rollbarConfig.async,_rollbarConfig,l)}]);`;
        break;
      case 'raygun':
        providerName = 'Raygun';
        providerCode = `// Raygun
    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.async = true
    script.src = 'https://cdn.raygun.io/raygun4js/raygun.min.js'
    script.onload = () => {
      if (window.rg4js) {
        window.rg4js('apiKey', '${dsn}')
        window.rg4js('setVersion', '1.0.0')
        window.rg4js('enableCrashReporting', true)
        window.rg4js('enablePulse', true)
        window.rg4js('options', {
          debugMode: ${environment === 'development'}
        })
      }
    }
    document.getElementsByTagName('head')[0].appendChild(script)`;
        break;
      case 'trackjs':
        providerName = 'TrackJS';
        providerCode = `// TrackJS
    window._trackJs = {
      token: "${dsn}",
      application: "my-app",
      version: "1.0.0",
      console: { enabled: true },
      network: { enabled: true },
    };
    (function(t,r,a,c,k,j,s){t.TrackJS=t.TrackJS||function(){
    (t.TrackJS.q=t.TrackJS.q||[]).push(arguments)};k=r.createElement(a);j=r.getElementsByTagName(a)[0];
    k.async=1;k.src="https://cdn.trackjs.com/releases/current/tracker.js";j.parentNode.insertBefore(k,j);
    })(window,document,"script");`;
        break;
      default:
        providerName = provider;
        providerCode = `// Add your ${provider} initialization code here`;
    }

    return `import { defineTag } from '@yourtm/core'

export default defineTag({
  name: '${tagName}',
  description: '${providerName} error tracking',
  triggers: ['${trigger}'],
  zones: ['global'],
  consent: ['essential'],
  priority: 100, // Load early to catch errors

  execute(ctx) {
    ${providerCode}

    console.log('[YTM] ${providerName} loaded')
  },
})
`;
  },
};

// =============================================================================
// Template Registry
// =============================================================================

export const ecommerceTemplates: Template[] = [
  purchaseTemplate,
  addToCartTemplate,
  productViewTemplate,
  beginCheckoutTemplate,
  removeFromCartTemplate,
  viewCartTemplate,
  addToWishlistTemplate,
];

export const utilityTemplates: Template[] = [
  customHtmlTemplate,
  customScriptTemplate,
  dataLayerPushTemplate,
  cookieWriterTemplate,
  localStorageTemplate,
  sessionRecordingTemplate,
  abTestingTemplate,
  chatWidgetTemplate,
  errorTrackingTemplate,
];

export const allTemplates: Template[] = [...ecommerceTemplates, ...utilityTemplates];

// =============================================================================
// Template Functions
// =============================================================================

/**
 * Get all available templates
 */
export function getTemplates(): Template[] {
  return allTemplates;
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: 'ecommerce' | 'utilities'): Template[] {
  return allTemplates.filter((t) => t.category === category);
}

/**
 * Get a template by ID
 */
export function getTemplateById(id: string): Template | undefined {
  return allTemplates.find((t) => t.id === id);
}

/**
 * Generate tag code from a template
 */
export function generateFromTemplate(
  templateId: string,
  answers: Record<string, unknown>,
  context: TemplateContext = {}
): string {
  const template = getTemplateById(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }
  return template.generate(answers, context);
}

/**
 * Get platform choices for multi-platform templates
 */
export function getPlatformChoices(): Array<{ value: string; label: string }> {
  return PLATFORM_CHOICES;
}

/**
 * Get session recording provider choices
 */
export function getSessionRecordingChoices(): Array<{ value: string; label: string }> {
  return SESSION_RECORDING_CHOICES;
}

/**
 * Get A/B testing provider choices
 */
export function getABTestingChoices(): Array<{ value: string; label: string }> {
  return AB_TESTING_CHOICES;
}

/**
 * Get chat widget provider choices
 */
export function getChatWidgetChoices(): Array<{ value: string; label: string }> {
  return CHAT_WIDGET_CHOICES;
}

/**
 * Get error tracking provider choices
 */
export function getErrorTrackingChoices(): Array<{ value: string; label: string }> {
  return ERROR_TRACKING_CHOICES;
}
