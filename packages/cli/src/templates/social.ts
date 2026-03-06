/**
 * Social/Advertising Platform Templates
 *
 * Templates for Meta, TikTok, LinkedIn, Twitter/X, Snapchat, and Pinterest
 */

export interface TemplateQuestion {
  id: string;
  type: 'text' | 'select' | 'multiselect' | 'number' | 'boolean';
  label: string;
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  };
}

export interface TemplateContext {
  containerId: string;
  environment: string;
  timestamp: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  platform: string;
  questions: TemplateQuestion[];
  generate: (answers: Record<string, unknown>, context: TemplateContext) => string;
}

// Meta Standard Events
const META_STANDARD_EVENTS = [
  { value: 'PageView', label: 'PageView - Track page views' },
  { value: 'ViewContent', label: 'ViewContent - View product/content' },
  { value: 'Search', label: 'Search - Search for products/content' },
  { value: 'AddToCart', label: 'AddToCart - Add item to cart' },
  { value: 'AddToWishlist', label: 'AddToWishlist - Add to wishlist' },
  { value: 'InitiateCheckout', label: 'InitiateCheckout - Start checkout' },
  { value: 'AddPaymentInfo', label: 'AddPaymentInfo - Add payment info' },
  { value: 'Purchase', label: 'Purchase - Complete purchase' },
  { value: 'Lead', label: 'Lead - Lead form submission' },
  { value: 'CompleteRegistration', label: 'CompleteRegistration - User registration' },
  { value: 'Contact', label: 'Contact - Contact business' },
  { value: 'CustomizeProduct', label: 'CustomizeProduct - Customize product' },
  { value: 'Donate', label: 'Donate - Make a donation' },
  { value: 'FindLocation', label: 'FindLocation - Find store location' },
  { value: 'Schedule', label: 'Schedule - Schedule appointment' },
  { value: 'StartTrial', label: 'StartTrial - Start free trial' },
  { value: 'SubmitApplication', label: 'SubmitApplication - Submit application' },
  { value: 'Subscribe', label: 'Subscribe - Subscribe to service' },
];

// TikTok Standard Events
const TIKTOK_STANDARD_EVENTS = [
  { value: 'ViewContent', label: 'ViewContent - View product/content' },
  { value: 'ClickButton', label: 'ClickButton - Button click' },
  { value: 'Search', label: 'Search - Search for products/content' },
  { value: 'AddToWishlist', label: 'AddToWishlist - Add to wishlist' },
  { value: 'AddToCart', label: 'AddToCart - Add item to cart' },
  { value: 'InitiateCheckout', label: 'InitiateCheckout - Start checkout' },
  { value: 'AddPaymentInfo', label: 'AddPaymentInfo - Add payment info' },
  { value: 'CompletePayment', label: 'CompletePayment - Complete purchase' },
  { value: 'PlaceAnOrder', label: 'PlaceAnOrder - Place order' },
  { value: 'Contact', label: 'Contact - Contact business' },
  { value: 'Download', label: 'Download - Download content' },
  { value: 'SubmitForm', label: 'SubmitForm - Submit form' },
  { value: 'CompleteRegistration', label: 'CompleteRegistration - User registration' },
  { value: 'Subscribe', label: 'Subscribe - Subscribe to service' },
];

// LinkedIn Conversion Types
const LINKEDIN_CONVERSION_TYPES = [
  { value: 'conversion', label: 'Conversion - General conversion' },
  { value: 'lead', label: 'Lead - Lead form submission' },
  { value: 'purchase', label: 'Purchase - Product purchase' },
  { value: 'sign_up', label: 'Sign Up - User registration' },
  { value: 'download', label: 'Download - Content download' },
  { value: 'key_page_view', label: 'Key Page View - Important page view' },
  { value: 'add_to_cart', label: 'Add to Cart - Cart addition' },
  { value: 'install', label: 'Install - App installation' },
  { value: 'other', label: 'Other - Other conversion type' },
];

// Twitter/X Event Types
const TWITTER_EVENT_TYPES = [
  { value: 'PageView', label: 'PageView - Track page views' },
  { value: 'ViewContent', label: 'ViewContent - View content' },
  { value: 'Search', label: 'Search - Search query' },
  { value: 'AddToCart', label: 'AddToCart - Add to cart' },
  { value: 'AddToWishlist', label: 'AddToWishlist - Add to wishlist' },
  { value: 'InitiateCheckout', label: 'InitiateCheckout - Start checkout' },
  { value: 'AddPaymentInfo', label: 'AddPaymentInfo - Add payment info' },
  { value: 'Purchase', label: 'Purchase - Complete purchase' },
  { value: 'SignUp', label: 'SignUp - User registration' },
  { value: 'Lead', label: 'Lead - Lead generation' },
  { value: 'Download', label: 'Download - Content download' },
  { value: 'CustomEvent', label: 'CustomEvent - Custom event' },
];

// Snapchat Event Types
const SNAPCHAT_EVENT_TYPES = [
  { value: 'PAGE_VIEW', label: 'Page View - Track page views' },
  { value: 'VIEW_CONTENT', label: 'View Content - View product/content' },
  { value: 'ADD_CART', label: 'Add to Cart - Add item to cart' },
  { value: 'ADD_BILLING', label: 'Add Billing - Add payment info' },
  { value: 'START_CHECKOUT', label: 'Start Checkout - Begin checkout' },
  { value: 'PURCHASE', label: 'Purchase - Complete purchase' },
  { value: 'SIGN_UP', label: 'Sign Up - User registration' },
  { value: 'SEARCH', label: 'Search - Search query' },
  { value: 'SUBSCRIBE', label: 'Subscribe - Subscribe to service' },
  { value: 'SAVE', label: 'Save - Save content/product' },
  { value: 'COMPLETE_TUTORIAL', label: 'Complete Tutorial - Tutorial completion' },
  { value: 'LIST_VIEW', label: 'List View - View product list' },
  { value: 'ACHIEVEMENT_UNLOCKED', label: 'Achievement Unlocked - Achievement' },
  { value: 'SHARE', label: 'Share - Share content' },
  { value: 'INVITE', label: 'Invite - Invite friend' },
  { value: 'APP_OPEN', label: 'App Open - Open app' },
  { value: 'CUSTOM_EVENT_1', label: 'Custom Event 1' },
  { value: 'CUSTOM_EVENT_2', label: 'Custom Event 2' },
];

// Pinterest Event Types
const PINTEREST_EVENT_TYPES = [
  { value: 'pagevisit', label: 'Page Visit - Track page views' },
  { value: 'viewcategory', label: 'View Category - Browse category' },
  { value: 'search', label: 'Search - Search query' },
  { value: 'addtocart', label: 'Add to Cart - Add item to cart' },
  { value: 'checkout', label: 'Checkout - Complete purchase' },
  { value: 'watchvideo', label: 'Watch Video - Video view' },
  { value: 'signup', label: 'Sign Up - User registration' },
  { value: 'lead', label: 'Lead - Lead form submission' },
  { value: 'custom', label: 'Custom - Custom event' },
];

// ============================================================================
// META (FACEBOOK) TEMPLATES
// ============================================================================

const metaPixelBaseConfig: Template = {
  id: 'meta-pixel-config',
  name: 'Meta Pixel - Base Configuration',
  description: 'Initialize the Meta (Facebook) Pixel on your site. Required before tracking any events.',
  category: 'social',
  platform: 'meta',
  questions: [
    {
      id: 'pixelId',
      type: 'text',
      label: 'Pixel ID',
      description: 'Your Meta Pixel ID (found in Events Manager)',
      required: true,
      placeholder: '1234567890123456',
      validation: {
        pattern: '^[0-9]{15,16}$',
        minLength: 15,
        maxLength: 16,
      },
    },
    {
      id: 'tagName',
      type: 'text',
      label: 'Tag Name',
      description: 'A unique name for this tag',
      required: true,
      default: 'meta-pixel-config',
      placeholder: 'meta-pixel-config',
    },
    {
      id: 'triggerName',
      type: 'text',
      label: 'Trigger',
      description: 'The trigger that fires this tag',
      required: true,
      default: 'pageview',
      placeholder: 'pageview',
    },
    {
      id: 'autoPageView',
      type: 'boolean',
      label: 'Auto-track PageView',
      description: 'Automatically track a PageView event on initialization',
      default: true,
    },
    {
      id: 'advancedMatching',
      type: 'boolean',
      label: 'Enable Advanced Matching',
      description: 'Use advanced matching for better attribution',
      default: false,
    },
  ],
  generate: (answers, context) => {
    const pixelId = answers.pixelId as string;
    const tagName = answers.tagName as string;
    const triggerName = answers.triggerName as string;
    const autoPageView = answers.autoPageView !== false;
    const advancedMatching = answers.advancedMatching === true;

    return `import { defineTag } from '@yourtm/core'
import { loadFbq, fbq } from '@yourtm/vendors/meta'

/**
 * Meta Pixel - Base Configuration
 * Generated: ${context.timestamp}
 * Container: ${context.containerId}
 */
export default defineTag({
  name: '${tagName}',
  description: 'Meta Pixel initialization and PageView tracking',
  triggers: ['${triggerName}'],
  zones: ['all-pages'],
  consent: ['marketing'],
  vendor: 'meta',
  priority: 100, // High priority to ensure pixel loads first

  async setup() {
    await loadFbq('${pixelId}'${advancedMatching ? ', { advancedMatching: true }' : ''})
  },

  execute(ctx) {
    ${autoPageView ? `// Track PageView event
    fbq('track', 'PageView')` : '// PageView tracking disabled - fire events manually'}
  },
})
`;
  },
};

const metaPixelStandardEvent: Template = {
  id: 'meta-pixel-standard-event',
  name: 'Meta Pixel - Standard Event',
  description: 'Track a standard Meta Pixel event like Purchase, AddToCart, Lead, etc.',
  category: 'social',
  platform: 'meta',
  questions: [
    {
      id: 'pixelId',
      type: 'text',
      label: 'Pixel ID',
      description: 'Your Meta Pixel ID (found in Events Manager)',
      required: true,
      placeholder: '1234567890123456',
      validation: {
        pattern: '^[0-9]{15,16}$',
      },
    },
    {
      id: 'eventType',
      type: 'select',
      label: 'Event Type',
      description: 'The standard Meta event to track',
      required: true,
      options: META_STANDARD_EVENTS,
    },
    {
      id: 'tagName',
      type: 'text',
      label: 'Tag Name',
      description: 'A unique name for this tag',
      required: true,
      placeholder: 'meta-purchase',
    },
    {
      id: 'triggerName',
      type: 'text',
      label: 'Trigger',
      description: 'The trigger that fires this tag',
      required: true,
      placeholder: 'purchase-complete',
    },
    {
      id: 'zoneName',
      type: 'text',
      label: 'Zone',
      description: 'The zone where this tag should fire',
      required: false,
      placeholder: 'checkout',
    },
    {
      id: 'useEcommerce',
      type: 'boolean',
      label: 'Use E-commerce DataLayer',
      description: 'Read event data from ctx.dataLayer.ecommerce',
      default: true,
    },
    {
      id: 'currency',
      type: 'text',
      label: 'Default Currency',
      description: 'Default currency code if not in dataLayer',
      default: 'USD',
      placeholder: 'USD',
    },
  ],
  generate: (answers, context) => {
    const pixelId = answers.pixelId as string;
    const eventType = answers.eventType as string;
    const tagName = answers.tagName as string || `meta-${eventType.toLowerCase()}`;
    const triggerName = answers.triggerName as string;
    const zoneName = answers.zoneName as string || 'all-pages';
    const useEcommerce = answers.useEcommerce !== false;
    const currency = answers.currency as string || 'USD';

    // Generate event-specific code based on event type
    let executeCode = '';

    if (eventType === 'Purchase' && useEcommerce) {
      executeCode = `const order = ctx.dataLayer.ecommerce?.purchase
    if (!order) return

    fbq('track', 'Purchase', {
      value: order.value,
      currency: order.currency || '${currency}',
      content_ids: order.items?.map((i: { id: string }) => i.id),
      content_type: 'product',
      num_items: order.items?.length,
    })`;
    } else if (eventType === 'AddToCart' && useEcommerce) {
      executeCode = `const item = ctx.dataLayer.ecommerce?.add?.products?.[0] || ctx.dataLayer.ecommerce?.items?.[0]
    if (!item) return

    fbq('track', 'AddToCart', {
      value: item.price,
      currency: ctx.dataLayer.ecommerce?.currency || '${currency}',
      content_ids: [item.id],
      content_name: item.name,
      content_type: 'product',
    })`;
    } else if (eventType === 'ViewContent' && useEcommerce) {
      executeCode = `const item = ctx.dataLayer.ecommerce?.detail?.products?.[0] || ctx.dataLayer.ecommerce?.items?.[0]
    if (!item) return

    fbq('track', 'ViewContent', {
      value: item.price,
      currency: ctx.dataLayer.ecommerce?.currency || '${currency}',
      content_ids: [item.id],
      content_name: item.name,
      content_type: 'product',
      content_category: item.category,
    })`;
    } else if (eventType === 'InitiateCheckout' && useEcommerce) {
      executeCode = `const checkout = ctx.dataLayer.ecommerce?.checkout || ctx.dataLayer.ecommerce
    if (!checkout) return

    fbq('track', 'InitiateCheckout', {
      value: checkout.value,
      currency: checkout.currency || '${currency}',
      content_ids: checkout.items?.map((i: { id: string }) => i.id),
      content_type: 'product',
      num_items: checkout.items?.length,
    })`;
    } else if (eventType === 'Search') {
      executeCode = `const searchQuery = ctx.dataLayer.search_term || ctx.dataLayer.query

    fbq('track', 'Search', {
      search_string: searchQuery,
    })`;
    } else if (eventType === 'Lead') {
      executeCode = `fbq('track', 'Lead', {
      value: ctx.dataLayer.value || 0,
      currency: '${currency}',
    })`;
    } else if (eventType === 'CompleteRegistration') {
      executeCode = `fbq('track', 'CompleteRegistration', {
      value: ctx.dataLayer.value || 0,
      currency: '${currency}',
      status: ctx.dataLayer.status || 'completed',
    })`;
    } else {
      executeCode = `fbq('track', '${eventType}', {
      // Add your event parameters here
      value: ctx.dataLayer.value || 0,
      currency: '${currency}',
    })`;
    }

    return `import { defineTag } from '@yourtm/core'
import { loadFbq, fbq } from '@yourtm/vendors/meta'

/**
 * Meta Pixel - ${eventType} Event
 * Generated: ${context.timestamp}
 * Container: ${context.containerId}
 */
export default defineTag({
  name: '${tagName}',
  description: 'Meta Pixel ${eventType} Event',
  triggers: ['${triggerName}'],
  zones: ['${zoneName}'],
  consent: ['marketing'],
  vendor: 'meta',

  async setup() {
    await loadFbq('${pixelId}')
  },

  execute(ctx) {
    ${executeCode}
  },
})
`;
  },
};

const metaPixelCustomEvent: Template = {
  id: 'meta-pixel-custom-event',
  name: 'Meta Pixel - Custom Event',
  description: 'Track a custom Meta Pixel event with your own event name and parameters.',
  category: 'social',
  platform: 'meta',
  questions: [
    {
      id: 'pixelId',
      type: 'text',
      label: 'Pixel ID',
      description: 'Your Meta Pixel ID',
      required: true,
      placeholder: '1234567890123456',
    },
    {
      id: 'eventName',
      type: 'text',
      label: 'Custom Event Name',
      description: 'Name of your custom event',
      required: true,
      placeholder: 'MyCustomEvent',
    },
    {
      id: 'tagName',
      type: 'text',
      label: 'Tag Name',
      description: 'A unique name for this tag',
      required: true,
      placeholder: 'meta-custom-event',
    },
    {
      id: 'triggerName',
      type: 'text',
      label: 'Trigger',
      description: 'The trigger that fires this tag',
      required: true,
      placeholder: 'custom-action',
    },
    {
      id: 'zoneName',
      type: 'text',
      label: 'Zone',
      description: 'The zone where this tag should fire',
      required: false,
      placeholder: 'all-pages',
    },
  ],
  generate: (answers, context) => {
    const pixelId = answers.pixelId as string;
    const eventName = answers.eventName as string;
    const tagName = answers.tagName as string;
    const triggerName = answers.triggerName as string;
    const zoneName = answers.zoneName as string || 'all-pages';

    return `import { defineTag } from '@yourtm/core'
import { loadFbq, fbq } from '@yourtm/vendors/meta'

/**
 * Meta Pixel - Custom Event: ${eventName}
 * Generated: ${context.timestamp}
 * Container: ${context.containerId}
 */
export default defineTag({
  name: '${tagName}',
  description: 'Meta Pixel Custom Event - ${eventName}',
  triggers: ['${triggerName}'],
  zones: ['${zoneName}'],
  consent: ['marketing'],
  vendor: 'meta',

  async setup() {
    await loadFbq('${pixelId}')
  },

  execute(ctx) {
    fbq('trackCustom', '${eventName}', {
      // Add your custom event parameters here
      // Example parameters:
      value: ctx.dataLayer.value || 0,
      content_name: ctx.dataLayer.content_name,
      content_category: ctx.dataLayer.content_category,
    })
  },
})
`;
  },
};

const metaConversionsAPI: Template = {
  id: 'meta-conversions-api',
  name: 'Meta Conversions API (Server-Side)',
  description: 'Send events server-side via Meta Conversions API for better attribution and ad-blocker bypass.',
  category: 'social',
  platform: 'meta',
  questions: [
    {
      id: 'pixelId',
      type: 'text',
      label: 'Pixel ID',
      description: 'Your Meta Pixel ID',
      required: true,
      placeholder: '1234567890123456',
    },
    {
      id: 'accessToken',
      type: 'text',
      label: 'Access Token Variable',
      description: 'Server-side variable containing your access token (use env variable)',
      required: true,
      default: 'process.env.META_CAPI_TOKEN',
      placeholder: 'process.env.META_CAPI_TOKEN',
    },
    {
      id: 'eventType',
      type: 'select',
      label: 'Event Type',
      description: 'The event to send via CAPI',
      required: true,
      options: META_STANDARD_EVENTS,
    },
    {
      id: 'tagName',
      type: 'text',
      label: 'Tag Name',
      description: 'A unique name for this tag',
      required: true,
      placeholder: 'meta-capi-purchase',
    },
    {
      id: 'triggerName',
      type: 'text',
      label: 'Trigger',
      description: 'The trigger that fires this tag',
      required: true,
      placeholder: 'purchase-complete',
    },
    {
      id: 'testEventCode',
      type: 'text',
      label: 'Test Event Code',
      description: 'Optional test event code for debugging',
      required: false,
      placeholder: 'TEST12345',
    },
  ],
  generate: (answers, context) => {
    const pixelId = answers.pixelId as string;
    const accessToken = answers.accessToken as string || 'process.env.META_CAPI_TOKEN';
    const eventType = answers.eventType as string;
    const tagName = answers.tagName as string;
    const triggerName = answers.triggerName as string;
    const testEventCode = answers.testEventCode as string;

    return `import { defineTag } from '@yourtm/core'
import { sendCAPIEvent, type CAPIEventData } from '@yourtm/vendors/meta-capi'

/**
 * Meta Conversions API - ${eventType} Event (Server-Side)
 * Generated: ${context.timestamp}
 * Container: ${context.containerId}
 *
 * NOTE: This tag should be executed on your server, not in the browser.
 * Ensure proper deduplication by using the same event_id as your browser pixel.
 */
export default defineTag({
  name: '${tagName}',
  description: 'Meta Conversions API ${eventType} Event',
  triggers: ['${triggerName}'],
  zones: ['server'],
  consent: ['marketing'],
  vendor: 'meta',
  runtime: 'server', // Server-side only tag

  async execute(ctx) {
    const eventData: CAPIEventData = {
      event_name: '${eventType}',
      event_time: Math.floor(Date.now() / 1000),
      event_id: ctx.dataLayer.event_id || crypto.randomUUID(), // For deduplication
      event_source_url: ctx.dataLayer.page_url,
      action_source: 'website',
      user_data: {
        // Hash PII before sending (SHA-256)
        em: ctx.dataLayer.user?.email_hash, // Hashed email
        ph: ctx.dataLayer.user?.phone_hash, // Hashed phone
        fn: ctx.dataLayer.user?.first_name_hash, // Hashed first name
        ln: ctx.dataLayer.user?.last_name_hash, // Hashed last name
        client_ip_address: ctx.request?.ip,
        client_user_agent: ctx.request?.userAgent,
        fbc: ctx.cookies?.fbc, // Facebook click ID
        fbp: ctx.cookies?.fbp, // Facebook browser ID
      },
      custom_data: {
        value: ctx.dataLayer.ecommerce?.purchase?.value || ctx.dataLayer.value,
        currency: ctx.dataLayer.ecommerce?.purchase?.currency || 'USD',
        content_ids: ctx.dataLayer.ecommerce?.purchase?.items?.map((i: { id: string }) => i.id),
        content_type: 'product',
        num_items: ctx.dataLayer.ecommerce?.purchase?.items?.length,
      },
    }

    await sendCAPIEvent({
      pixelId: '${pixelId}',
      accessToken: ${accessToken},
      eventData,${testEventCode ? `\n      testEventCode: '${testEventCode}',` : ''}
    })
  },
})
`;
  },
};

// ============================================================================
// TIKTOK TEMPLATES
// ============================================================================

const tiktokPixelConfig: Template = {
  id: 'tiktok-pixel-config',
  name: 'TikTok Pixel - Configuration',
  description: 'Initialize the TikTok Pixel on your site for conversion tracking.',
  category: 'social',
  platform: 'tiktok',
  questions: [
    {
      id: 'pixelId',
      type: 'text',
      label: 'Pixel ID',
      description: 'Your TikTok Pixel ID',
      required: true,
      placeholder: 'CXXXXXXXXXXXXXXXXX',
    },
    {
      id: 'tagName',
      type: 'text',
      label: 'Tag Name',
      description: 'A unique name for this tag',
      required: true,
      default: 'tiktok-pixel-config',
    },
    {
      id: 'triggerName',
      type: 'text',
      label: 'Trigger',
      description: 'The trigger that fires this tag',
      required: true,
      default: 'pageview',
    },
    {
      id: 'autoPageView',
      type: 'boolean',
      label: 'Auto-track PageView',
      description: 'Automatically track a PageView event',
      default: true,
    },
  ],
  generate: (answers, context) => {
    const pixelId = answers.pixelId as string;
    const tagName = answers.tagName as string;
    const triggerName = answers.triggerName as string;
    const autoPageView = answers.autoPageView !== false;

    return `import { defineTag } from '@yourtm/core'
import { loadTtq, ttq } from '@yourtm/vendors/tiktok'

/**
 * TikTok Pixel - Base Configuration
 * Generated: ${context.timestamp}
 * Container: ${context.containerId}
 */
export default defineTag({
  name: '${tagName}',
  description: 'TikTok Pixel initialization',
  triggers: ['${triggerName}'],
  zones: ['all-pages'],
  consent: ['marketing'],
  vendor: 'tiktok',
  priority: 100,

  async setup() {
    await loadTtq('${pixelId}')
  },

  execute(ctx) {
    ${autoPageView ? `// Track PageView event
    ttq.page()` : '// PageView tracking disabled'}
  },
})
`;
  },
};

const tiktokPixelStandardEvent: Template = {
  id: 'tiktok-pixel-standard-event',
  name: 'TikTok Pixel - Standard Event',
  description: 'Track a standard TikTok Pixel event like Purchase, AddToCart, etc.',
  category: 'social',
  platform: 'tiktok',
  questions: [
    {
      id: 'pixelId',
      type: 'text',
      label: 'Pixel ID',
      description: 'Your TikTok Pixel ID',
      required: true,
      placeholder: 'CXXXXXXXXXXXXXXXXX',
    },
    {
      id: 'eventType',
      type: 'select',
      label: 'Event Type',
      description: 'The standard TikTok event to track',
      required: true,
      options: TIKTOK_STANDARD_EVENTS,
    },
    {
      id: 'tagName',
      type: 'text',
      label: 'Tag Name',
      description: 'A unique name for this tag',
      required: true,
      placeholder: 'tiktok-purchase',
    },
    {
      id: 'triggerName',
      type: 'text',
      label: 'Trigger',
      description: 'The trigger that fires this tag',
      required: true,
      placeholder: 'purchase-complete',
    },
    {
      id: 'zoneName',
      type: 'text',
      label: 'Zone',
      description: 'The zone where this tag should fire',
      required: false,
      placeholder: 'checkout',
    },
    {
      id: 'currency',
      type: 'text',
      label: 'Default Currency',
      description: 'Default currency code',
      default: 'USD',
    },
  ],
  generate: (answers, context) => {
    const pixelId = answers.pixelId as string;
    const eventType = answers.eventType as string;
    const tagName = answers.tagName as string || `tiktok-${eventType.toLowerCase()}`;
    const triggerName = answers.triggerName as string;
    const zoneName = answers.zoneName as string || 'all-pages';
    const currency = answers.currency as string || 'USD';

    let executeCode = '';

    if (eventType === 'CompletePayment') {
      executeCode = `const order = ctx.dataLayer.ecommerce?.purchase
    if (!order) return

    ttq.track('CompletePayment', {
      value: order.value,
      currency: order.currency || '${currency}',
      contents: order.items?.map((i: { id: string; name: string; price: number; quantity: number }) => ({
        content_id: i.id,
        content_name: i.name,
        price: i.price,
        quantity: i.quantity || 1,
      })),
      content_type: 'product',
    })`;
    } else if (eventType === 'AddToCart') {
      executeCode = `const item = ctx.dataLayer.ecommerce?.add?.products?.[0] || ctx.dataLayer.ecommerce?.items?.[0]
    if (!item) return

    ttq.track('AddToCart', {
      value: item.price,
      currency: ctx.dataLayer.ecommerce?.currency || '${currency}',
      contents: [{
        content_id: item.id,
        content_name: item.name,
        price: item.price,
        quantity: item.quantity || 1,
      }],
      content_type: 'product',
    })`;
    } else if (eventType === 'ViewContent') {
      executeCode = `const item = ctx.dataLayer.ecommerce?.detail?.products?.[0] || ctx.dataLayer.ecommerce?.items?.[0]
    if (!item) return

    ttq.track('ViewContent', {
      value: item.price,
      currency: ctx.dataLayer.ecommerce?.currency || '${currency}',
      contents: [{
        content_id: item.id,
        content_name: item.name,
        price: item.price,
      }],
      content_type: 'product',
    })`;
    } else {
      executeCode = `ttq.track('${eventType}', {
      // Add your event parameters here
      value: ctx.dataLayer.value || 0,
      currency: '${currency}',
    })`;
    }

    return `import { defineTag } from '@yourtm/core'
import { loadTtq, ttq } from '@yourtm/vendors/tiktok'

/**
 * TikTok Pixel - ${eventType} Event
 * Generated: ${context.timestamp}
 * Container: ${context.containerId}
 */
export default defineTag({
  name: '${tagName}',
  description: 'TikTok Pixel ${eventType} Event',
  triggers: ['${triggerName}'],
  zones: ['${zoneName}'],
  consent: ['marketing'],
  vendor: 'tiktok',

  async setup() {
    await loadTtq('${pixelId}')
  },

  execute(ctx) {
    ${executeCode}
  },
})
`;
  },
};

const tiktokEventsAPI: Template = {
  id: 'tiktok-events-api',
  name: 'TikTok Events API (Server-Side)',
  description: 'Send events server-side via TikTok Events API.',
  category: 'social',
  platform: 'tiktok',
  questions: [
    {
      id: 'pixelId',
      type: 'text',
      label: 'Pixel ID',
      description: 'Your TikTok Pixel ID',
      required: true,
    },
    {
      id: 'accessToken',
      type: 'text',
      label: 'Access Token Variable',
      description: 'Server-side variable containing your access token',
      required: true,
      default: 'process.env.TIKTOK_ACCESS_TOKEN',
    },
    {
      id: 'eventType',
      type: 'select',
      label: 'Event Type',
      description: 'The event to send',
      required: true,
      options: TIKTOK_STANDARD_EVENTS,
    },
    {
      id: 'tagName',
      type: 'text',
      label: 'Tag Name',
      required: true,
      placeholder: 'tiktok-events-api-purchase',
    },
    {
      id: 'triggerName',
      type: 'text',
      label: 'Trigger',
      required: true,
      placeholder: 'purchase-complete',
    },
  ],
  generate: (answers, context) => {
    const pixelId = answers.pixelId as string;
    const accessToken = answers.accessToken as string;
    const eventType = answers.eventType as string;
    const tagName = answers.tagName as string;
    const triggerName = answers.triggerName as string;

    return `import { defineTag } from '@yourtm/core'
import { sendTikTokEvent, type TikTokEventData } from '@yourtm/vendors/tiktok-events-api'

/**
 * TikTok Events API - ${eventType} Event (Server-Side)
 * Generated: ${context.timestamp}
 * Container: ${context.containerId}
 */
export default defineTag({
  name: '${tagName}',
  description: 'TikTok Events API ${eventType} Event',
  triggers: ['${triggerName}'],
  zones: ['server'],
  consent: ['marketing'],
  vendor: 'tiktok',
  runtime: 'server',

  async execute(ctx) {
    const eventData: TikTokEventData = {
      event: '${eventType}',
      event_id: ctx.dataLayer.event_id || crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      context: {
        page: {
          url: ctx.dataLayer.page_url,
          referrer: ctx.dataLayer.page_referrer,
        },
        user: {
          external_id: ctx.dataLayer.user?.id,
          email: ctx.dataLayer.user?.email_hash, // SHA-256 hashed
          phone_number: ctx.dataLayer.user?.phone_hash, // SHA-256 hashed
        },
        ip: ctx.request?.ip,
        user_agent: ctx.request?.userAgent,
      },
      properties: {
        value: ctx.dataLayer.ecommerce?.purchase?.value || ctx.dataLayer.value,
        currency: ctx.dataLayer.ecommerce?.purchase?.currency || 'USD',
        contents: ctx.dataLayer.ecommerce?.purchase?.items?.map((i: { id: string; price: number; quantity: number }) => ({
          content_id: i.id,
          price: i.price,
          quantity: i.quantity || 1,
        })),
        content_type: 'product',
      },
    }

    await sendTikTokEvent({
      pixelId: '${pixelId}',
      accessToken: ${accessToken},
      eventData,
    })
  },
})
`;
  },
};

// ============================================================================
// LINKEDIN TEMPLATES
// ============================================================================

const linkedinInsightTag: Template = {
  id: 'linkedin-insight-config',
  name: 'LinkedIn Insight Tag - Configuration',
  description: 'Initialize the LinkedIn Insight Tag for conversion tracking and audience building.',
  category: 'social',
  platform: 'linkedin',
  questions: [
    {
      id: 'partnerId',
      type: 'text',
      label: 'Partner ID',
      description: 'Your LinkedIn Partner ID',
      required: true,
      placeholder: '123456',
    },
    {
      id: 'tagName',
      type: 'text',
      label: 'Tag Name',
      required: true,
      default: 'linkedin-insight-tag',
    },
    {
      id: 'triggerName',
      type: 'text',
      label: 'Trigger',
      required: true,
      default: 'pageview',
    },
  ],
  generate: (answers, context) => {
    const partnerId = answers.partnerId as string;
    const tagName = answers.tagName as string;
    const triggerName = answers.triggerName as string;

    return `import { defineTag } from '@yourtm/core'
import { loadLinkedIn, lintrk } from '@yourtm/vendors/linkedin'

/**
 * LinkedIn Insight Tag - Base Configuration
 * Generated: ${context.timestamp}
 * Container: ${context.containerId}
 */
export default defineTag({
  name: '${tagName}',
  description: 'LinkedIn Insight Tag initialization',
  triggers: ['${triggerName}'],
  zones: ['all-pages'],
  consent: ['marketing'],
  vendor: 'linkedin',
  priority: 100,

  async setup() {
    await loadLinkedIn('${partnerId}')
  },

  execute(ctx) {
    // Insight Tag automatically tracks page views
    // Use LinkedIn Conversion Tracking tag for specific conversions
  },
})
`;
  },
};

const linkedinConversionTracking: Template = {
  id: 'linkedin-conversion',
  name: 'LinkedIn Conversion Tracking',
  description: 'Track conversions on LinkedIn for campaign optimization.',
  category: 'social',
  platform: 'linkedin',
  questions: [
    {
      id: 'partnerId',
      type: 'text',
      label: 'Partner ID',
      description: 'Your LinkedIn Partner ID',
      required: true,
    },
    {
      id: 'conversionId',
      type: 'text',
      label: 'Conversion ID',
      description: 'The conversion ID from LinkedIn Campaign Manager',
      required: true,
      placeholder: '1234567',
    },
    {
      id: 'conversionType',
      type: 'select',
      label: 'Conversion Type',
      options: LINKEDIN_CONVERSION_TYPES,
      required: true,
    },
    {
      id: 'tagName',
      type: 'text',
      label: 'Tag Name',
      required: true,
      placeholder: 'linkedin-lead-conversion',
    },
    {
      id: 'triggerName',
      type: 'text',
      label: 'Trigger',
      required: true,
      placeholder: 'form-submit',
    },
    {
      id: 'zoneName',
      type: 'text',
      label: 'Zone',
      required: false,
      placeholder: 'contact-page',
    },
  ],
  generate: (answers, context) => {
    const partnerId = answers.partnerId as string;
    const conversionId = answers.conversionId as string;
    const conversionType = answers.conversionType as string;
    const tagName = answers.tagName as string;
    const triggerName = answers.triggerName as string;
    const zoneName = answers.zoneName as string || 'all-pages';

    return `import { defineTag } from '@yourtm/core'
import { loadLinkedIn, lintrk } from '@yourtm/vendors/linkedin'

/**
 * LinkedIn Conversion Tracking - ${conversionType}
 * Generated: ${context.timestamp}
 * Container: ${context.containerId}
 */
export default defineTag({
  name: '${tagName}',
  description: 'LinkedIn Conversion - ${conversionType}',
  triggers: ['${triggerName}'],
  zones: ['${zoneName}'],
  consent: ['marketing'],
  vendor: 'linkedin',

  async setup() {
    await loadLinkedIn('${partnerId}')
  },

  execute(ctx) {
    lintrk('track', {
      conversion_id: ${conversionId},
    })
  },
})
`;
  },
};

// ============================================================================
// TWITTER/X TEMPLATES
// ============================================================================

const twitterPixelConfig: Template = {
  id: 'twitter-pixel-config',
  name: 'Twitter/X Pixel - Configuration',
  description: 'Initialize the Twitter/X Pixel for conversion tracking.',
  category: 'social',
  platform: 'twitter',
  questions: [
    {
      id: 'pixelId',
      type: 'text',
      label: 'Pixel ID',
      description: 'Your Twitter Pixel ID',
      required: true,
      placeholder: 'tw-xxxxx-xxxxx',
    },
    {
      id: 'tagName',
      type: 'text',
      label: 'Tag Name',
      required: true,
      default: 'twitter-pixel-config',
    },
    {
      id: 'triggerName',
      type: 'text',
      label: 'Trigger',
      required: true,
      default: 'pageview',
    },
    {
      id: 'autoPageView',
      type: 'boolean',
      label: 'Auto-track PageView',
      default: true,
    },
  ],
  generate: (answers, context) => {
    const pixelId = answers.pixelId as string;
    const tagName = answers.tagName as string;
    const triggerName = answers.triggerName as string;
    const autoPageView = answers.autoPageView !== false;

    return `import { defineTag } from '@yourtm/core'
import { loadTwq, twq } from '@yourtm/vendors/twitter'

/**
 * Twitter/X Pixel - Base Configuration
 * Generated: ${context.timestamp}
 * Container: ${context.containerId}
 */
export default defineTag({
  name: '${tagName}',
  description: 'Twitter/X Pixel initialization',
  triggers: ['${triggerName}'],
  zones: ['all-pages'],
  consent: ['marketing'],
  vendor: 'twitter',
  priority: 100,

  async setup() {
    await loadTwq('${pixelId}')
  },

  execute(ctx) {
    ${autoPageView ? `// Track PageView event
    twq('track', 'PageView')` : '// PageView tracking disabled'}
  },
})
`;
  },
};

const twitterConversionEvent: Template = {
  id: 'twitter-conversion-event',
  name: 'Twitter/X Conversion Event',
  description: 'Track a conversion event on Twitter/X.',
  category: 'social',
  platform: 'twitter',
  questions: [
    {
      id: 'pixelId',
      type: 'text',
      label: 'Pixel ID',
      required: true,
    },
    {
      id: 'eventType',
      type: 'select',
      label: 'Event Type',
      options: TWITTER_EVENT_TYPES,
      required: true,
    },
    {
      id: 'tagName',
      type: 'text',
      label: 'Tag Name',
      required: true,
      placeholder: 'twitter-purchase',
    },
    {
      id: 'triggerName',
      type: 'text',
      label: 'Trigger',
      required: true,
      placeholder: 'purchase-complete',
    },
    {
      id: 'zoneName',
      type: 'text',
      label: 'Zone',
      required: false,
    },
    {
      id: 'currency',
      type: 'text',
      label: 'Default Currency',
      default: 'USD',
    },
  ],
  generate: (answers, context) => {
    const pixelId = answers.pixelId as string;
    const eventType = answers.eventType as string;
    const tagName = answers.tagName as string;
    const triggerName = answers.triggerName as string;
    const zoneName = answers.zoneName as string || 'all-pages';
    const currency = answers.currency as string || 'USD';

    let executeCode = '';

    if (eventType === 'Purchase') {
      executeCode = `const order = ctx.dataLayer.ecommerce?.purchase
    if (!order) return

    twq('track', 'Purchase', {
      value: order.value,
      currency: order.currency || '${currency}',
      num_items: order.items?.length,
      content_ids: order.items?.map((i: { id: string }) => i.id),
    })`;
    } else if (eventType === 'AddToCart') {
      executeCode = `const item = ctx.dataLayer.ecommerce?.add?.products?.[0] || ctx.dataLayer.ecommerce?.items?.[0]
    if (!item) return

    twq('track', 'AddToCart', {
      value: item.price,
      currency: ctx.dataLayer.ecommerce?.currency || '${currency}',
      content_ids: [item.id],
    })`;
    } else {
      executeCode = `twq('track', '${eventType}', {
      // Add your event parameters here
      value: ctx.dataLayer.value || 0,
      currency: '${currency}',
    })`;
    }

    return `import { defineTag } from '@yourtm/core'
import { loadTwq, twq } from '@yourtm/vendors/twitter'

/**
 * Twitter/X Pixel - ${eventType} Event
 * Generated: ${context.timestamp}
 * Container: ${context.containerId}
 */
export default defineTag({
  name: '${tagName}',
  description: 'Twitter/X ${eventType} Event',
  triggers: ['${triggerName}'],
  zones: ['${zoneName}'],
  consent: ['marketing'],
  vendor: 'twitter',

  async setup() {
    await loadTwq('${pixelId}')
  },

  execute(ctx) {
    ${executeCode}
  },
})
`;
  },
};

// ============================================================================
// SNAPCHAT TEMPLATES
// ============================================================================

const snapchatPixelConfig: Template = {
  id: 'snapchat-pixel-config',
  name: 'Snapchat Pixel - Configuration',
  description: 'Initialize the Snapchat Pixel for conversion tracking.',
  category: 'social',
  platform: 'snapchat',
  questions: [
    {
      id: 'pixelId',
      type: 'text',
      label: 'Pixel ID',
      description: 'Your Snapchat Pixel ID',
      required: true,
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    },
    {
      id: 'tagName',
      type: 'text',
      label: 'Tag Name',
      required: true,
      default: 'snapchat-pixel-config',
    },
    {
      id: 'triggerName',
      type: 'text',
      label: 'Trigger',
      required: true,
      default: 'pageview',
    },
    {
      id: 'autoPageView',
      type: 'boolean',
      label: 'Auto-track Page View',
      default: true,
    },
  ],
  generate: (answers, context) => {
    const pixelId = answers.pixelId as string;
    const tagName = answers.tagName as string;
    const triggerName = answers.triggerName as string;
    const autoPageView = answers.autoPageView !== false;

    return `import { defineTag } from '@yourtm/core'
import { loadSnaptr, snaptr } from '@yourtm/vendors/snapchat'

/**
 * Snapchat Pixel - Base Configuration
 * Generated: ${context.timestamp}
 * Container: ${context.containerId}
 */
export default defineTag({
  name: '${tagName}',
  description: 'Snapchat Pixel initialization',
  triggers: ['${triggerName}'],
  zones: ['all-pages'],
  consent: ['marketing'],
  vendor: 'snapchat',
  priority: 100,

  async setup() {
    await loadSnaptr('${pixelId}')
  },

  execute(ctx) {
    ${autoPageView ? `// Track Page View event
    snaptr('track', 'PAGE_VIEW')` : '// Page View tracking disabled'}
  },
})
`;
  },
};

const snapchatConversionEvent: Template = {
  id: 'snapchat-conversion-event',
  name: 'Snapchat Conversion Event',
  description: 'Track a conversion event on Snapchat.',
  category: 'social',
  platform: 'snapchat',
  questions: [
    {
      id: 'pixelId',
      type: 'text',
      label: 'Pixel ID',
      required: true,
    },
    {
      id: 'eventType',
      type: 'select',
      label: 'Event Type',
      options: SNAPCHAT_EVENT_TYPES,
      required: true,
    },
    {
      id: 'tagName',
      type: 'text',
      label: 'Tag Name',
      required: true,
      placeholder: 'snapchat-purchase',
    },
    {
      id: 'triggerName',
      type: 'text',
      label: 'Trigger',
      required: true,
      placeholder: 'purchase-complete',
    },
    {
      id: 'zoneName',
      type: 'text',
      label: 'Zone',
      required: false,
    },
    {
      id: 'currency',
      type: 'text',
      label: 'Default Currency',
      default: 'USD',
    },
  ],
  generate: (answers, context) => {
    const pixelId = answers.pixelId as string;
    const eventType = answers.eventType as string;
    const tagName = answers.tagName as string;
    const triggerName = answers.triggerName as string;
    const zoneName = answers.zoneName as string || 'all-pages';
    const currency = answers.currency as string || 'USD';

    let executeCode = '';

    if (eventType === 'PURCHASE') {
      executeCode = `const order = ctx.dataLayer.ecommerce?.purchase
    if (!order) return

    snaptr('track', 'PURCHASE', {
      price: order.value,
      currency: order.currency || '${currency}',
      transaction_id: order.transaction_id,
      item_ids: order.items?.map((i: { id: string }) => i.id),
      number_items: order.items?.length,
    })`;
    } else if (eventType === 'ADD_CART') {
      executeCode = `const item = ctx.dataLayer.ecommerce?.add?.products?.[0] || ctx.dataLayer.ecommerce?.items?.[0]
    if (!item) return

    snaptr('track', 'ADD_CART', {
      price: item.price,
      currency: ctx.dataLayer.ecommerce?.currency || '${currency}',
      item_ids: [item.id],
    })`;
    } else if (eventType === 'VIEW_CONTENT') {
      executeCode = `const item = ctx.dataLayer.ecommerce?.detail?.products?.[0] || ctx.dataLayer.ecommerce?.items?.[0]
    if (!item) return

    snaptr('track', 'VIEW_CONTENT', {
      price: item.price,
      currency: ctx.dataLayer.ecommerce?.currency || '${currency}',
      item_ids: [item.id],
      item_category: item.category,
    })`;
    } else {
      executeCode = `snaptr('track', '${eventType}', {
      // Add your event parameters here
      price: ctx.dataLayer.value || 0,
      currency: '${currency}',
    })`;
    }

    return `import { defineTag } from '@yourtm/core'
import { loadSnaptr, snaptr } from '@yourtm/vendors/snapchat'

/**
 * Snapchat Pixel - ${eventType} Event
 * Generated: ${context.timestamp}
 * Container: ${context.containerId}
 */
export default defineTag({
  name: '${tagName}',
  description: 'Snapchat ${eventType} Event',
  triggers: ['${triggerName}'],
  zones: ['${zoneName}'],
  consent: ['marketing'],
  vendor: 'snapchat',

  async setup() {
    await loadSnaptr('${pixelId}')
  },

  execute(ctx) {
    ${executeCode}
  },
})
`;
  },
};

// ============================================================================
// PINTEREST TEMPLATES
// ============================================================================

const pinterestTagConfig: Template = {
  id: 'pinterest-tag-config',
  name: 'Pinterest Tag - Configuration',
  description: 'Initialize the Pinterest Tag for conversion tracking.',
  category: 'social',
  platform: 'pinterest',
  questions: [
    {
      id: 'tagId',
      type: 'text',
      label: 'Tag ID',
      description: 'Your Pinterest Tag ID',
      required: true,
      placeholder: '1234567890123',
    },
    {
      id: 'tagName',
      type: 'text',
      label: 'Tag Name',
      required: true,
      default: 'pinterest-tag-config',
    },
    {
      id: 'triggerName',
      type: 'text',
      label: 'Trigger',
      required: true,
      default: 'pageview',
    },
    {
      id: 'autoPageVisit',
      type: 'boolean',
      label: 'Auto-track Page Visit',
      default: true,
    },
    {
      id: 'enhancedMatch',
      type: 'boolean',
      label: 'Enable Enhanced Match',
      description: 'Use enhanced matching for better attribution',
      default: false,
    },
  ],
  generate: (answers, context) => {
    const tagId = answers.tagId as string;
    const tagName = answers.tagName as string;
    const triggerName = answers.triggerName as string;
    const autoPageVisit = answers.autoPageVisit !== false;
    const enhancedMatch = answers.enhancedMatch === true;

    return `import { defineTag } from '@yourtm/core'
import { loadPintrk, pintrk } from '@yourtm/vendors/pinterest'

/**
 * Pinterest Tag - Base Configuration
 * Generated: ${context.timestamp}
 * Container: ${context.containerId}
 */
export default defineTag({
  name: '${tagName}',
  description: 'Pinterest Tag initialization',
  triggers: ['${triggerName}'],
  zones: ['all-pages'],
  consent: ['marketing'],
  vendor: 'pinterest',
  priority: 100,

  async setup() {
    await loadPintrk('${tagId}'${enhancedMatch ? ', { em: true }' : ''})
  },

  execute(ctx) {
    ${autoPageVisit ? `// Track Page Visit event
    pintrk('track', 'pagevisit')` : '// Page Visit tracking disabled'}
  },
})
`;
  },
};

const pinterestConversionEvent: Template = {
  id: 'pinterest-conversion-event',
  name: 'Pinterest Conversion Event',
  description: 'Track a conversion event on Pinterest.',
  category: 'social',
  platform: 'pinterest',
  questions: [
    {
      id: 'tagId',
      type: 'text',
      label: 'Tag ID',
      required: true,
    },
    {
      id: 'eventType',
      type: 'select',
      label: 'Event Type',
      options: PINTEREST_EVENT_TYPES,
      required: true,
    },
    {
      id: 'tagName',
      type: 'text',
      label: 'Tag Name',
      required: true,
      placeholder: 'pinterest-checkout',
    },
    {
      id: 'triggerName',
      type: 'text',
      label: 'Trigger',
      required: true,
      placeholder: 'purchase-complete',
    },
    {
      id: 'zoneName',
      type: 'text',
      label: 'Zone',
      required: false,
    },
    {
      id: 'currency',
      type: 'text',
      label: 'Default Currency',
      default: 'USD',
    },
  ],
  generate: (answers, context) => {
    const tagId = answers.tagId as string;
    const eventType = answers.eventType as string;
    const tagName = answers.tagName as string;
    const triggerName = answers.triggerName as string;
    const zoneName = answers.zoneName as string || 'all-pages';
    const currency = answers.currency as string || 'USD';

    let executeCode = '';

    if (eventType === 'checkout') {
      executeCode = `const order = ctx.dataLayer.ecommerce?.purchase
    if (!order) return

    pintrk('track', 'checkout', {
      value: order.value,
      order_quantity: order.items?.length || 1,
      currency: order.currency || '${currency}',
      order_id: order.transaction_id,
      line_items: order.items?.map((i: { id: string; name: string; category: string; price: number; quantity: number }) => ({
        product_id: i.id,
        product_name: i.name,
        product_category: i.category,
        product_price: i.price,
        product_quantity: i.quantity || 1,
      })),
    })`;
    } else if (eventType === 'addtocart') {
      executeCode = `const item = ctx.dataLayer.ecommerce?.add?.products?.[0] || ctx.dataLayer.ecommerce?.items?.[0]
    if (!item) return

    pintrk('track', 'addtocart', {
      value: item.price,
      order_quantity: item.quantity || 1,
      currency: ctx.dataLayer.ecommerce?.currency || '${currency}',
      line_items: [{
        product_id: item.id,
        product_name: item.name,
        product_category: item.category,
        product_price: item.price,
        product_quantity: item.quantity || 1,
      }],
    })`;
    } else if (eventType === 'lead') {
      executeCode = `pintrk('track', 'lead', {
      lead_type: ctx.dataLayer.lead_type || 'signup',
    })`;
    } else if (eventType === 'signup') {
      executeCode = `pintrk('track', 'signup')`;
    } else if (eventType === 'search') {
      executeCode = `pintrk('track', 'search', {
      search_query: ctx.dataLayer.search_term || ctx.dataLayer.query,
    })`;
    } else if (eventType === 'custom') {
      executeCode = `pintrk('track', 'custom', {
      // Add your custom event parameters here
      custom_event_name: ctx.dataLayer.event_name,
      value: ctx.dataLayer.value || 0,
      currency: '${currency}',
    })`;
    } else {
      executeCode = `pintrk('track', '${eventType}', {
      // Add your event parameters here
      value: ctx.dataLayer.value || 0,
      currency: '${currency}',
    })`;
    }

    return `import { defineTag } from '@yourtm/core'
import { loadPintrk, pintrk } from '@yourtm/vendors/pinterest'

/**
 * Pinterest Tag - ${eventType} Event
 * Generated: ${context.timestamp}
 * Container: ${context.containerId}
 */
export default defineTag({
  name: '${tagName}',
  description: 'Pinterest ${eventType} Event',
  triggers: ['${triggerName}'],
  zones: ['${zoneName}'],
  consent: ['marketing'],
  vendor: 'pinterest',

  async setup() {
    await loadPintrk('${tagId}')
  },

  execute(ctx) {
    ${executeCode}
  },
})
`;
  },
};

// ============================================================================
// EXPORT ALL TEMPLATES
// ============================================================================

export const socialTemplates: Template[] = [
  // Meta (Facebook)
  metaPixelBaseConfig,
  metaPixelStandardEvent,
  metaPixelCustomEvent,
  metaConversionsAPI,

  // TikTok
  tiktokPixelConfig,
  tiktokPixelStandardEvent,
  tiktokEventsAPI,

  // LinkedIn
  linkedinInsightTag,
  linkedinConversionTracking,

  // Twitter/X
  twitterPixelConfig,
  twitterConversionEvent,

  // Snapchat
  snapchatPixelConfig,
  snapchatConversionEvent,

  // Pinterest
  pinterestTagConfig,
  pinterestConversionEvent,
];

export default socialTemplates;
