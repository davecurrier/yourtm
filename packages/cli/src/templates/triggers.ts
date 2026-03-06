/**
 * Trigger and Zone Templates for YourTM CLI
 *
 * This module provides interactive templates for creating triggers and zones.
 * Each template includes:
 * - id: Unique identifier for the template
 * - name: Human-readable name
 * - description: What the template does
 * - category: 'trigger' or 'zone'
 * - questions: Interactive prompts for configuration
 * - generate: Function that produces the TypeScript file content
 */

export interface TemplateQuestion {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'multiselect';
  message: string;
  default?: string | number | boolean | string[];
  choices?: Array<{ value: string; label: string }>;
  validate?: (value: unknown) => boolean | string;
  when?: (answers: Record<string, unknown>) => boolean;
}

export interface TemplateContext {
  containerId?: string;
  containerName?: string;
  projectDir?: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: 'trigger' | 'zone';
  questions: TemplateQuestion[];
  generate: (answers: Record<string, unknown>, context: TemplateContext) => string;
}

// ============================================================================
// PAGE TRIGGERS
// ============================================================================

const pageLoadTrigger: Template = {
  id: 'page-load',
  name: 'Page Load',
  description: 'Fire on every page load',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'page-load',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires on every page load',
    },
  ],
  generate: (answers) => `import { defineTrigger } from '@yourtm/cli';

export default defineTrigger({
  id: '${answers.name}',
  name: '${answers.name}',
  type: 'pageview',
  // Fires immediately when the page starts loading
  // Use for analytics initialization and early tracking
});
`,
};

const domReadyTrigger: Template = {
  id: 'dom-ready',
  name: 'DOM Ready',
  description: 'Fire when DOM is fully parsed (DOMContentLoaded)',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'dom-ready',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires when DOM is ready',
    },
  ],
  generate: (answers) => `import { defineTrigger } from '@yourtm/cli';

export default defineTrigger({
  id: '${answers.name}',
  name: '${answers.name}',
  type: 'pageview',
  options: {
    // Wait for DOM to be fully parsed before firing
    timing: 'domReady',
  },
  // Best for tags that need to access DOM elements
});
`,
};

const windowLoadedTrigger: Template = {
  id: 'window-loaded',
  name: 'Window Loaded',
  description: 'Fire when window fully loads (including images, stylesheets)',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'window-loaded',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires when window is fully loaded',
    },
  ],
  generate: (answers) => `import { defineTrigger } from '@yourtm/cli';

export default defineTrigger({
  id: '${answers.name}',
  name: '${answers.name}',
  type: 'pageview',
  options: {
    // Wait for all resources (images, CSS, etc.) to load
    timing: 'windowLoaded',
  },
  // Use for tags that depend on fully rendered page content
});
`,
};

const spaPageViewTrigger: Template = {
  id: 'spa-page-view',
  name: 'SPA Page View',
  description: 'Fire on history changes (React, Vue, Angular, etc.)',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'spa-page-view',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires on SPA navigation',
    },
    {
      name: 'includeInitial',
      type: 'boolean',
      message: 'Fire on initial page load too?',
      default: true,
    },
    {
      name: 'debounceMs',
      type: 'number',
      message: 'Debounce time (ms) to prevent duplicate fires:',
      default: 100,
    },
  ],
  generate: (answers) => `import { defineTrigger } from '@yourtm/cli';

export default defineTrigger({
  id: '${answers.name}',
  name: '${answers.name}',
  type: 'custom',
  options: {
    // Monitors History API (pushState, replaceState, popstate)
    historyChange: true,
    // Also fire on initial page load
    includeInitialPageview: ${answers.includeInitial},
    // Debounce to prevent multiple fires on rapid navigation
    debounceMs: ${answers.debounceMs},
  },
  // Works with React Router, Vue Router, Next.js, etc.
});
`,
};

// ============================================================================
// USER INTERACTION TRIGGERS
// ============================================================================

const elementClickTrigger: Template = {
  id: 'element-click',
  name: 'Click - Element Click',
  description: 'Fire when a specific element is clicked',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'element-click',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires on element click',
    },
    {
      name: 'selector',
      type: 'text',
      message: 'CSS selector (e.g., .btn-primary, [data-track]):',
      default: '[data-track]',
    },
    {
      name: 'waitForTags',
      type: 'boolean',
      message: 'Wait for tags to complete before navigation?',
      default: true,
    },
    {
      name: 'oncePerPage',
      type: 'boolean',
      message: 'Fire only once per page?',
      default: false,
    },
    {
      name: 'extractData',
      type: 'boolean',
      message: 'Extract data attributes from clicked element?',
      default: true,
    },
  ],
  generate: (answers) => `import { defineClickTrigger } from '@yourtm/core';

export default defineClickTrigger({
  name: '${answers.name}',
  description: '${answers.description}',
  selector: '${answers.selector}',
  waitForTags: ${answers.waitForTags},
  oncePerPage: ${answers.oncePerPage},
${answers.extractData ? `
  extract(element) {
    // Extract data from the clicked element
    return {
      text: element.textContent?.trim(),
      href: element.getAttribute('href'),
      // Add custom data attributes
      ...Object.fromEntries(
        Object.entries(element.dataset).map(([key, value]) => ['data_' + key, value])
      ),
    };
  },` : ''}
});
`,
};

const linkClickTrigger: Template = {
  id: 'link-click',
  name: 'Click - Link Click',
  description: 'Fire when links are clicked (with filtering options)',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'link-click',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires on link click',
    },
    {
      name: 'urlContains',
      type: 'text',
      message: 'URL must contain (leave empty for all links):',
      default: '',
    },
    {
      name: 'externalOnly',
      type: 'boolean',
      message: 'Only external links?',
      default: false,
    },
    {
      name: 'fileTypes',
      type: 'text',
      message: 'File types to track (comma-separated, e.g., pdf,doc,xls):',
      default: '',
    },
    {
      name: 'waitForTags',
      type: 'boolean',
      message: 'Wait for tags before navigation?',
      default: true,
    },
  ],
  generate: (answers) => {
    const fileTypes = (answers.fileTypes as string).split(',').filter(Boolean).map(t => t.trim());
    const hasFileTypes = fileTypes.length > 0;
    const hasUrlContains = (answers.urlContains as string).length > 0;

    return `import { defineClickTrigger } from '@yourtm/core';

export default defineClickTrigger({
  name: '${answers.name}',
  description: '${answers.description}',
  selector: 'a[href]',
  waitForTags: ${answers.waitForTags},

  // Filter which link clicks should fire the trigger
  filter(element) {
    const href = element.getAttribute('href') || '';
    const url = new URL(href, window.location.origin);
${answers.externalOnly ? `
    // Only external links
    if (url.hostname === window.location.hostname) {
      return false;
    }` : ''}
${hasUrlContains ? `
    // URL must contain specific string
    if (!href.includes('${answers.urlContains}')) {
      return false;
    }` : ''}
${hasFileTypes ? `
    // Only specific file types
    const fileTypes = ${JSON.stringify(fileTypes)};
    const extension = url.pathname.split('.').pop()?.toLowerCase();
    if (!extension || !fileTypes.includes(extension)) {
      return false;
    }` : ''}

    return true;
  },

  extract(element) {
    const href = element.getAttribute('href') || '';
    const url = new URL(href, window.location.origin);
    return {
      link_url: href,
      link_text: element.textContent?.trim(),
      link_domain: url.hostname,
      is_external: url.hostname !== window.location.hostname,
      file_extension: url.pathname.split('.').pop()?.toLowerCase(),
    };
  },
});
`;
  },
};

const formSubmitTrigger: Template = {
  id: 'form-submit',
  name: 'Form Submit',
  description: 'Fire when a form is submitted',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'form-submit',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires on form submission',
    },
    {
      name: 'selector',
      type: 'text',
      message: 'Form selector (leave empty for all forms):',
      default: '',
    },
    {
      name: 'preventDefault',
      type: 'boolean',
      message: 'Prevent default submission? (for AJAX handling)',
      default: false,
    },
    {
      name: 'validateFirst',
      type: 'boolean',
      message: 'Only fire if form is valid?',
      default: true,
    },
    {
      name: 'captureFields',
      type: 'boolean',
      message: 'Capture form field values? (excluding passwords)',
      default: true,
    },
  ],
  generate: (answers) => `import { defineFormTrigger } from '@yourtm/core';

export default defineFormTrigger({
  name: '${answers.name}',
  description: '${answers.description}',
  selector: '${answers.selector || 'form'}',
  preventDefault: ${answers.preventDefault},
  validateFirst: ${answers.validateFirst},
${answers.captureFields ? `
  extract(form) {
    const formData = new FormData(form);
    const data: Record<string, string> = {};

    // Capture all fields except sensitive ones
    const sensitiveFields = ['password', 'pwd', 'pass', 'credit', 'card', 'cvv', 'ssn'];

    for (const [key, value] of formData.entries()) {
      // Skip sensitive fields
      const isSSensitive = sensitiveFields.some(s =>
        key.toLowerCase().includes(s)
      );
      if (!isSSensitive && typeof value === 'string') {
        data[key] = value;
      }
    }

    return {
      form_id: form.id,
      form_name: form.name,
      form_action: form.action,
      form_method: form.method,
      field_count: formData.entries.length,
      ...data,
    };
  },` : ''}
});
`,
};

const scrollDepthTrigger: Template = {
  id: 'scroll-depth',
  name: 'Scroll Depth',
  description: 'Fire at specific scroll depth thresholds',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'scroll-depth',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires at scroll depth thresholds',
    },
    {
      name: 'thresholds',
      type: 'text',
      message: 'Thresholds as percentages (comma-separated):',
      default: '25,50,75,100',
    },
    {
      name: 'fireOncePerThreshold',
      type: 'boolean',
      message: 'Fire only once per threshold?',
      default: true,
    },
    {
      name: 'usePixels',
      type: 'boolean',
      message: 'Use pixel values instead of percentages?',
      default: false,
    },
  ],
  generate: (answers) => {
    const thresholds = (answers.thresholds as string)
      .split(',')
      .map(t => parseInt(t.trim(), 10))
      .filter(n => !isNaN(n));

    return `import { defineScrollTrigger } from '@yourtm/core';

export default defineScrollTrigger({
  name: '${answers.name}',
  description: '${answers.description}',
  thresholds: ${JSON.stringify(thresholds)},
  unit: '${answers.usePixels ? 'pixels' : 'percent'}',
  fireOncePerThreshold: ${answers.fireOncePerThreshold},

  extract(threshold, scrollData) {
    return {
      scroll_threshold: threshold,
      scroll_depth_percent: scrollData.percentScrolled,
      scroll_depth_pixels: scrollData.pixelsScrolled,
      page_height: scrollData.pageHeight,
      viewport_height: scrollData.viewportHeight,
    };
  },
});
`;
  },
};

const elementVisibilityTrigger: Template = {
  id: 'element-visibility',
  name: 'Element Visibility',
  description: 'Fire when an element becomes visible in the viewport',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'element-visibility',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires when element becomes visible',
    },
    {
      name: 'selector',
      type: 'text',
      message: 'CSS selector for the element(s):',
      default: '[data-track-visibility]',
    },
    {
      name: 'visibilityPercent',
      type: 'number',
      message: 'Minimum visibility percentage (0-100):',
      default: 50,
    },
    {
      name: 'fireOnce',
      type: 'boolean',
      message: 'Fire only once per element?',
      default: true,
    },
    {
      name: 'minimumTime',
      type: 'number',
      message: 'Minimum time visible (ms, 0 for immediate):',
      default: 0,
    },
  ],
  generate: (answers) => `import { defineVisibilityTrigger } from '@yourtm/core';

export default defineVisibilityTrigger({
  name: '${answers.name}',
  description: '${answers.description}',
  selector: '${answers.selector}',
  visibilityThreshold: ${(answers.visibilityPercent as number) / 100},
  fireOnce: ${answers.fireOnce},
  minimumVisibleTime: ${answers.minimumTime},

  extract(element, visibilityData) {
    return {
      element_id: element.id,
      element_class: element.className,
      visible_percent: visibilityData.visiblePercent,
      time_visible: visibilityData.timeVisible,
      ...Object.fromEntries(
        Object.entries(element.dataset).map(([key, value]) => ['data_' + key, value])
      ),
    };
  },
});
`,
};

// ============================================================================
// TIMER TRIGGERS
// ============================================================================

const timerDelayTrigger: Template = {
  id: 'timer-delay',
  name: 'Timer - Delay',
  description: 'Fire after a specified delay',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'timer-delay',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires after a delay',
    },
    {
      name: 'delaySeconds',
      type: 'number',
      message: 'Delay in seconds:',
      default: 5,
    },
    {
      name: 'fireOnce',
      type: 'boolean',
      message: 'Fire only once?',
      default: true,
    },
  ],
  generate: (answers) => `import { defineTrigger } from '@yourtm/cli';

export default defineTrigger({
  id: '${answers.name}',
  name: '${answers.name}',
  type: 'timer',
  options: {
    delay: ${(answers.delaySeconds as number) * 1000},
    fireOnce: ${answers.fireOnce},
    // Use for time-on-page tracking, delayed popups, etc.
  },
});
`,
};

const timerIntervalTrigger: Template = {
  id: 'timer-interval',
  name: 'Timer - Interval',
  description: 'Fire repeatedly at specified intervals',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'timer-interval',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires at regular intervals',
    },
    {
      name: 'intervalSeconds',
      type: 'number',
      message: 'Interval in seconds:',
      default: 30,
    },
    {
      name: 'maxFires',
      type: 'number',
      message: 'Maximum number of fires (0 for unlimited):',
      default: 10,
    },
    {
      name: 'startImmediately',
      type: 'boolean',
      message: 'Fire immediately on start?',
      default: false,
    },
  ],
  generate: (answers) => `import { defineTrigger } from '@yourtm/cli';

export default defineTrigger({
  id: '${answers.name}',
  name: '${answers.name}',
  type: 'timer',
  options: {
    interval: ${(answers.intervalSeconds as number) * 1000},
    maxFires: ${answers.maxFires === 0 ? 'Infinity' : answers.maxFires},
    startImmediately: ${answers.startImmediately},
    // Use for heartbeat tracking, session keepalive, etc.
  },
});
`,
};

// ============================================================================
// E-COMMERCE TRIGGERS
// ============================================================================

const addToCartTrigger: Template = {
  id: 'add-to-cart',
  name: 'Add to Cart Click',
  description: 'Fire when add to cart button is clicked',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'add-to-cart',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires when add to cart is clicked',
    },
    {
      name: 'selector',
      type: 'text',
      message: 'CSS selector for add to cart buttons:',
      default: '[data-action="add-to-cart"], .add-to-cart-btn, .add-to-cart',
    },
  ],
  generate: (answers) => `import { defineClickTrigger } from '@yourtm/core';

export default defineClickTrigger({
  name: '${answers.name}',
  description: '${answers.description}',
  selector: '${answers.selector}',
  waitForTags: true,

  extract(element) {
    // Extract product data from element or nearest product container
    const productContainer = element.closest('[data-product]') || element;

    return {
      product_id: productContainer.dataset.productId || element.dataset.productId,
      product_name: productContainer.dataset.productName || element.dataset.productName,
      product_sku: productContainer.dataset.sku || element.dataset.sku,
      price: parseFloat(productContainer.dataset.price || element.dataset.price || '0'),
      quantity: parseInt(productContainer.dataset.quantity || element.dataset.quantity || '1', 10),
      currency: productContainer.dataset.currency || element.dataset.currency || 'USD',
      category: productContainer.dataset.category || element.dataset.category,
      variant: productContainer.dataset.variant || element.dataset.variant,
    };
  },
});
`,
};

const removeFromCartTrigger: Template = {
  id: 'remove-from-cart',
  name: 'Remove from Cart Click',
  description: 'Fire when remove from cart button is clicked',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'remove-from-cart',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires when item is removed from cart',
    },
    {
      name: 'selector',
      type: 'text',
      message: 'CSS selector for remove buttons:',
      default: '[data-action="remove-from-cart"], .remove-from-cart, .cart-remove',
    },
  ],
  generate: (answers) => `import { defineClickTrigger } from '@yourtm/core';

export default defineClickTrigger({
  name: '${answers.name}',
  description: '${answers.description}',
  selector: '${answers.selector}',
  waitForTags: true,

  extract(element) {
    const cartItem = element.closest('[data-cart-item]') || element;

    return {
      product_id: cartItem.dataset.productId || element.dataset.productId,
      product_name: cartItem.dataset.productName || element.dataset.productName,
      price: parseFloat(cartItem.dataset.price || element.dataset.price || '0'),
      quantity: parseInt(cartItem.dataset.quantity || element.dataset.quantity || '1', 10),
    };
  },
});
`,
};

const checkoutClickTrigger: Template = {
  id: 'checkout-click',
  name: 'Checkout Button Click',
  description: 'Fire when checkout button is clicked',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'checkout-click',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires when checkout is initiated',
    },
    {
      name: 'selector',
      type: 'text',
      message: 'CSS selector for checkout buttons:',
      default: '[data-action="checkout"], .checkout-btn, #checkout-button',
    },
  ],
  generate: (answers) => `import { defineClickTrigger } from '@yourtm/core';

export default defineClickTrigger({
  name: '${answers.name}',
  description: '${answers.description}',
  selector: '${answers.selector}',
  waitForTags: true,

  extract(element) {
    // Try to get cart total from data layer or DOM
    const cartTotal = window.dataLayer?.find(d => d.cart_total)?.cart_total
      || document.querySelector('[data-cart-total]')?.textContent
      || '0';

    return {
      cart_total: parseFloat(cartTotal.replace(/[^0-9.]/g, '')),
      currency: document.querySelector('[data-currency]')?.textContent || 'USD',
      checkout_step: 'initiate',
    };
  },
});
`,
};

const purchaseCompleteTrigger: Template = {
  id: 'purchase-complete',
  name: 'Purchase Complete',
  description: 'Fire on purchase completion via dataLayer event',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'purchase-complete',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires when purchase is completed',
    },
    {
      name: 'eventName',
      type: 'text',
      message: 'DataLayer event name:',
      default: 'purchase',
    },
  ],
  generate: (answers) => `import { defineDataLayerTrigger } from '@yourtm/core';

export default defineDataLayerTrigger({
  name: '${answers.name}',
  description: '${answers.description}',
  event: '${answers.eventName}',

  extract(dataLayerEvent) {
    // Expected dataLayer structure:
    // { event: 'purchase', ecommerce: { transaction_id, value, items, ... } }
    const ecommerce = dataLayerEvent.ecommerce || {};

    return {
      transaction_id: ecommerce.transaction_id,
      value: ecommerce.value,
      currency: ecommerce.currency || 'USD',
      tax: ecommerce.tax,
      shipping: ecommerce.shipping,
      coupon: ecommerce.coupon,
      items: ecommerce.items,
      item_count: ecommerce.items?.length || 0,
    };
  },
});
`,
};

// ============================================================================
// VIDEO TRIGGERS
// ============================================================================

const youtubeVideoTrigger: Template = {
  id: 'youtube-video',
  name: 'YouTube Video',
  description: 'Fire on YouTube video play, pause, progress, and complete',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'youtube-video',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Tracks YouTube video engagement',
    },
    {
      name: 'events',
      type: 'multiselect',
      message: 'Which events to track:',
      choices: [
        { value: 'play', label: 'Play' },
        { value: 'pause', label: 'Pause' },
        { value: 'progress', label: 'Progress (25%, 50%, 75%, 90%)' },
        { value: 'complete', label: 'Complete (100%)' },
      ],
      default: ['play', 'pause', 'progress', 'complete'],
    },
  ],
  generate: (answers) => {
    const events = answers.events as string[];
    return `import { defineVideoTrigger } from '@yourtm/core';

export default defineVideoTrigger({
  name: '${answers.name}',
  description: '${answers.description}',
  provider: 'youtube',

  // Track these video events
  events: {
    play: ${events.includes('play')},
    pause: ${events.includes('pause')},
    progress: ${events.includes('progress')},
    complete: ${events.includes('complete')},
  },

  // Progress milestones (percentage of video watched)
  progressMilestones: [25, 50, 75, 90],

  extract(videoData) {
    return {
      video_provider: 'youtube',
      video_id: videoData.videoId,
      video_title: videoData.title,
      video_url: videoData.url,
      video_duration: videoData.duration,
      video_current_time: videoData.currentTime,
      video_percent: videoData.percentWatched,
      video_event: videoData.event,
    };
  },
});
`;
  },
};

const vimeoVideoTrigger: Template = {
  id: 'vimeo-video',
  name: 'Vimeo Video',
  description: 'Fire on Vimeo video play, pause, progress, and complete',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'vimeo-video',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Tracks Vimeo video engagement',
    },
    {
      name: 'events',
      type: 'multiselect',
      message: 'Which events to track:',
      choices: [
        { value: 'play', label: 'Play' },
        { value: 'pause', label: 'Pause' },
        { value: 'progress', label: 'Progress (25%, 50%, 75%, 90%)' },
        { value: 'complete', label: 'Complete (100%)' },
      ],
      default: ['play', 'pause', 'progress', 'complete'],
    },
  ],
  generate: (answers) => {
    const events = answers.events as string[];
    return `import { defineVideoTrigger } from '@yourtm/core';

export default defineVideoTrigger({
  name: '${answers.name}',
  description: '${answers.description}',
  provider: 'vimeo',

  events: {
    play: ${events.includes('play')},
    pause: ${events.includes('pause')},
    progress: ${events.includes('progress')},
    complete: ${events.includes('complete')},
  },

  progressMilestones: [25, 50, 75, 90],

  extract(videoData) {
    return {
      video_provider: 'vimeo',
      video_id: videoData.videoId,
      video_title: videoData.title,
      video_url: videoData.url,
      video_duration: videoData.duration,
      video_current_time: videoData.currentTime,
      video_percent: videoData.percentWatched,
      video_event: videoData.event,
    };
  },
});
`;
  },
};

const html5VideoTrigger: Template = {
  id: 'html5-video',
  name: 'HTML5 Video',
  description: 'Fire on native HTML5 video events',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'html5-video',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Tracks HTML5 video engagement',
    },
    {
      name: 'selector',
      type: 'text',
      message: 'Video selector (leave empty for all videos):',
      default: 'video',
    },
    {
      name: 'events',
      type: 'multiselect',
      message: 'Which events to track:',
      choices: [
        { value: 'play', label: 'Play' },
        { value: 'pause', label: 'Pause' },
        { value: 'progress', label: 'Progress milestones' },
        { value: 'complete', label: 'Ended' },
        { value: 'error', label: 'Error' },
      ],
      default: ['play', 'pause', 'progress', 'complete'],
    },
  ],
  generate: (answers) => {
    const events = answers.events as string[];
    return `import { defineVideoTrigger } from '@yourtm/core';

export default defineVideoTrigger({
  name: '${answers.name}',
  description: '${answers.description}',
  provider: 'html5',
  selector: '${answers.selector}',

  events: {
    play: ${events.includes('play')},
    pause: ${events.includes('pause')},
    progress: ${events.includes('progress')},
    complete: ${events.includes('complete')},
    error: ${events.includes('error')},
  },

  progressMilestones: [25, 50, 75, 90],

  extract(videoData) {
    const video = videoData.element as HTMLVideoElement;
    return {
      video_provider: 'html5',
      video_src: video.currentSrc,
      video_duration: video.duration,
      video_current_time: video.currentTime,
      video_percent: videoData.percentWatched,
      video_event: videoData.event,
      video_volume: video.volume,
      video_muted: video.muted,
    };
  },
});
`;
  },
};

// ============================================================================
// CUSTOM TRIGGERS
// ============================================================================

const dataLayerEventTrigger: Template = {
  id: 'datalayer-event',
  name: 'DataLayer Event',
  description: 'Fire on specific dataLayer push events',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'datalayer-event',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires on dataLayer event',
    },
    {
      name: 'eventName',
      type: 'text',
      message: 'Event name to listen for:',
      default: 'custom_event',
    },
    {
      name: 'captureAllData',
      type: 'boolean',
      message: 'Capture all event data?',
      default: true,
    },
  ],
  generate: (answers) => `import { defineDataLayerTrigger } from '@yourtm/core';

export default defineDataLayerTrigger({
  name: '${answers.name}',
  description: '${answers.description}',
  event: '${answers.eventName}',
${answers.captureAllData ? `
  extract(dataLayerEvent) {
    // Capture all properties from the dataLayer push
    const { event, ...data } = dataLayerEvent;
    return data;
  },` : ''}
});
`,
};

const customEventTrigger: Template = {
  id: 'custom-event',
  name: 'Custom Event',
  description: 'Fire on custom JavaScript events (addEventListener)',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'custom-event',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires on custom JS event',
    },
    {
      name: 'eventName',
      type: 'text',
      message: 'Custom event name:',
      default: 'myCustomEvent',
    },
    {
      name: 'target',
      type: 'select',
      message: 'Event target:',
      choices: [
        { value: 'document', label: 'document' },
        { value: 'window', label: 'window' },
        { value: 'custom', label: 'Custom selector' },
      ],
      default: 'document',
    },
    {
      name: 'customSelector',
      type: 'text',
      message: 'Custom selector:',
      when: (answers) => answers.target === 'custom',
    },
  ],
  generate: (answers) => {
    const target = answers.target === 'custom'
      ? `document.querySelector('${answers.customSelector}')`
      : answers.target;

    return `import { defineCustomEventTrigger } from '@yourtm/core';

export default defineCustomEventTrigger({
  name: '${answers.name}',
  description: '${answers.description}',
  eventName: '${answers.eventName}',
  target: ${target},

  extract(event) {
    // Access CustomEvent detail if available
    const detail = (event as CustomEvent).detail || {};
    return {
      event_name: '${answers.eventName}',
      ...detail,
    };
  },
});
`;
  },
};

const jsVariableTrigger: Template = {
  id: 'js-variable',
  name: 'JavaScript Variable',
  description: 'Fire when a JavaScript variable changes',
  category: 'trigger',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Trigger name:',
      default: 'js-variable',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Fires when variable changes',
    },
    {
      name: 'variablePath',
      type: 'text',
      message: 'Variable path (e.g., window.user.isLoggedIn):',
      default: 'window.user.isLoggedIn',
    },
    {
      name: 'pollInterval',
      type: 'number',
      message: 'Poll interval in milliseconds:',
      default: 500,
    },
    {
      name: 'fireOnce',
      type: 'boolean',
      message: 'Fire only once?',
      default: false,
    },
  ],
  generate: (answers) => `import { defineVariableTrigger } from '@yourtm/core';

export default defineVariableTrigger({
  name: '${answers.name}',
  description: '${answers.description}',
  variablePath: '${answers.variablePath}',
  pollInterval: ${answers.pollInterval},
  fireOnce: ${answers.fireOnce},

  // Optional: Only fire when condition is met
  condition(value, previousValue) {
    // Example: Only fire when value changes to truthy
    return value !== previousValue && Boolean(value);
  },

  extract(value, previousValue) {
    return {
      variable_path: '${answers.variablePath}',
      current_value: value,
      previous_value: previousValue,
    };
  },
});
`,
};

// ============================================================================
// ZONE TEMPLATES
// ============================================================================

const allPagesZone: Template = {
  id: 'all-pages',
  name: 'All Pages',
  description: 'Global zone that matches all pages',
  category: 'zone',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Zone name:',
      default: 'all-pages',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Matches all pages on the site',
    },
  ],
  generate: (answers) => `import { defineZone } from '@yourtm/cli';

export default defineZone({
  name: '${answers.name}',
  description: '${answers.description}',
  patterns: ['*'],
  // All tags assigned to this zone will fire on every page
});
`,
};

const homepageZone: Template = {
  id: 'homepage',
  name: 'Homepage Only',
  description: 'Zone that matches only the homepage',
  category: 'zone',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Zone name:',
      default: 'homepage',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Matches homepage only',
    },
    {
      name: 'includeTrailingSlash',
      type: 'boolean',
      message: 'Include trailing slash variant (/)?',
      default: true,
    },
  ],
  generate: (answers) => {
    const patterns = answers.includeTrailingSlash ? ['/', ''] : ['/'];
    return `import { defineZone } from '@yourtm/cli';

export default defineZone({
  name: '${answers.name}',
  description: '${answers.description}',
  patterns: ${JSON.stringify(patterns)},
});
`;
  },
};

const productPagesZone: Template = {
  id: 'product-pages',
  name: 'Product Pages',
  description: 'Zone for product detail pages',
  category: 'zone',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Zone name:',
      default: 'product-pages',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Product detail pages',
    },
    {
      name: 'patterns',
      type: 'text',
      message: 'URL patterns (comma-separated):',
      default: '/product/*, /products/*, /p/*',
    },
  ],
  generate: (answers) => {
    const patterns = (answers.patterns as string).split(',').map(p => p.trim());
    return `import { defineZone } from '@yourtm/cli';

export default defineZone({
  name: '${answers.name}',
  description: '${answers.description}',
  patterns: ${JSON.stringify(patterns)},
});
`;
  },
};

const categoryPagesZone: Template = {
  id: 'category-pages',
  name: 'Category Pages',
  description: 'Zone for category/collection listing pages',
  category: 'zone',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Zone name:',
      default: 'category-pages',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Category and collection pages',
    },
    {
      name: 'patterns',
      type: 'text',
      message: 'URL patterns (comma-separated):',
      default: '/category/*, /collection/*, /collections/*, /c/*',
    },
  ],
  generate: (answers) => {
    const patterns = (answers.patterns as string).split(',').map(p => p.trim());
    return `import { defineZone } from '@yourtm/cli';

export default defineZone({
  name: '${answers.name}',
  description: '${answers.description}',
  patterns: ${JSON.stringify(patterns)},
});
`;
  },
};

const checkoutPagesZone: Template = {
  id: 'checkout-pages',
  name: 'Checkout Pages',
  description: 'Zone for checkout and cart pages',
  category: 'zone',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Zone name:',
      default: 'checkout',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Checkout and cart pages',
    },
    {
      name: 'patterns',
      type: 'text',
      message: 'URL patterns (comma-separated):',
      default: '/checkout/*, /cart, /cart/*, /order/*',
    },
  ],
  generate: (answers) => {
    const patterns = (answers.patterns as string).split(',').map(p => p.trim());
    return `import { defineZone } from '@yourtm/cli';

export default defineZone({
  name: '${answers.name}',
  description: '${answers.description}',
  patterns: ${JSON.stringify(patterns)},
});
`;
  },
};

const accountPagesZone: Template = {
  id: 'account-pages',
  name: 'Account Pages',
  description: 'Zone for user account and profile pages',
  category: 'zone',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Zone name:',
      default: 'account',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Account and profile pages',
    },
    {
      name: 'patterns',
      type: 'text',
      message: 'URL patterns (comma-separated):',
      default: '/account/*, /profile/*, /my-account/*, /user/*',
    },
  ],
  generate: (answers) => {
    const patterns = (answers.patterns as string).split(',').map(p => p.trim());
    return `import { defineZone } from '@yourtm/cli';

export default defineZone({
  name: '${answers.name}',
  description: '${answers.description}',
  patterns: ${JSON.stringify(patterns)},
});
`;
  },
};

const blogPagesZone: Template = {
  id: 'blog-pages',
  name: 'Blog/Content Pages',
  description: 'Zone for blog and content pages',
  category: 'zone',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Zone name:',
      default: 'blog',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Blog and content pages',
    },
    {
      name: 'patterns',
      type: 'text',
      message: 'URL patterns (comma-separated):',
      default: '/blog/*, /article/*, /articles/*, /news/*, /post/*',
    },
  ],
  generate: (answers) => {
    const patterns = (answers.patterns as string).split(',').map(p => p.trim());
    return `import { defineZone } from '@yourtm/cli';

export default defineZone({
  name: '${answers.name}',
  description: '${answers.description}',
  patterns: ${JSON.stringify(patterns)},
});
`;
  },
};

const customPatternZone: Template = {
  id: 'custom-pattern',
  name: 'Custom Pattern',
  description: 'Zone with user-defined URL patterns',
  category: 'zone',
  questions: [
    {
      name: 'name',
      type: 'text',
      message: 'Zone name:',
      default: 'custom-zone',
    },
    {
      name: 'description',
      type: 'text',
      message: 'Description:',
      default: 'Custom URL pattern zone',
    },
    {
      name: 'patterns',
      type: 'text',
      message: 'URL patterns (comma-separated, use * for wildcards):',
      default: '/custom/*',
    },
    {
      name: 'excludePatterns',
      type: 'text',
      message: 'Exclude patterns (optional, comma-separated):',
      default: '',
    },
  ],
  generate: (answers) => {
    const patterns = (answers.patterns as string).split(',').map(p => p.trim()).filter(Boolean);
    const excludePatterns = (answers.excludePatterns as string).split(',').map(p => p.trim()).filter(Boolean);

    let code = `import { defineZone } from '@yourtm/cli';

export default defineZone({
  name: '${answers.name}',
  description: '${answers.description}',
  patterns: ${JSON.stringify(patterns)},`;

    if (excludePatterns.length > 0) {
      code += `
  excludePatterns: ${JSON.stringify(excludePatterns)},`;
    }

    code += `
});
`;
    return code;
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * All available trigger templates
 */
export const triggerTemplates: Template[] = [
  // Page triggers
  pageLoadTrigger,
  domReadyTrigger,
  windowLoadedTrigger,
  spaPageViewTrigger,

  // User interaction triggers
  elementClickTrigger,
  linkClickTrigger,
  formSubmitTrigger,
  scrollDepthTrigger,
  elementVisibilityTrigger,

  // Timer triggers
  timerDelayTrigger,
  timerIntervalTrigger,

  // E-commerce triggers
  addToCartTrigger,
  removeFromCartTrigger,
  checkoutClickTrigger,
  purchaseCompleteTrigger,

  // Video triggers
  youtubeVideoTrigger,
  vimeoVideoTrigger,
  html5VideoTrigger,

  // Custom triggers
  dataLayerEventTrigger,
  customEventTrigger,
  jsVariableTrigger,
];

/**
 * All available zone templates
 */
export const zoneTemplates: Template[] = [
  allPagesZone,
  homepageZone,
  productPagesZone,
  categoryPagesZone,
  checkoutPagesZone,
  accountPagesZone,
  blogPagesZone,
  customPatternZone,
];

/**
 * All templates combined
 */
export const allTemplates: Template[] = [...triggerTemplates, ...zoneTemplates];

/**
 * Get a template by ID
 */
export function getTemplate(id: string): Template | undefined {
  return allTemplates.find(t => t.id === id);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: 'trigger' | 'zone'): Template[] {
  return allTemplates.filter(t => t.category === category);
}

/**
 * Get trigger templates grouped by type
 */
export function getTriggerTemplatesGrouped(): Record<string, Template[]> {
  return {
    'Page Triggers': [pageLoadTrigger, domReadyTrigger, windowLoadedTrigger, spaPageViewTrigger],
    'User Interaction': [elementClickTrigger, linkClickTrigger, formSubmitTrigger, scrollDepthTrigger, elementVisibilityTrigger],
    'Timer Triggers': [timerDelayTrigger, timerIntervalTrigger],
    'E-commerce': [addToCartTrigger, removeFromCartTrigger, checkoutClickTrigger, purchaseCompleteTrigger],
    'Video Triggers': [youtubeVideoTrigger, vimeoVideoTrigger, html5VideoTrigger],
    'Custom Triggers': [dataLayerEventTrigger, customEventTrigger, jsVariableTrigger],
  };
}

/**
 * Search templates by name or description
 */
export function searchTemplates(query: string): Template[] {
  const lowerQuery = query.toLowerCase();
  return allTemplates.filter(
    t => t.name.toLowerCase().includes(lowerQuery) ||
         t.description.toLowerCase().includes(lowerQuery)
  );
}
