import { NextRequest, NextResponse } from 'next/server';

// Tag templates data - represents the templates available from @yourtm/cli
// In production, this would be dynamically loaded from the CLI package
const tagTemplates = [
  // Google Analytics
  {
    id: 'ga4-config',
    name: 'GA4 - Configuration',
    description: 'Initialize Google Analytics 4 with your Measurement ID. Required before sending any GA4 events.',
    platform: 'google-analytics',
    category: 'analytics',
    questions: [
      { name: 'measurementId', type: 'text', message: 'GA4 Measurement ID', initial: 'G-XXXXXXXXXX' },
      { name: 'tagName', type: 'text', message: 'Tag Name', initial: 'ga4-config' },
      { name: 'triggerName', type: 'text', message: 'Trigger', initial: 'pageview' },
      { name: 'sendPageView', type: 'confirm', message: 'Send PageView on config?', initial: true },
      { name: 'debugMode', type: 'confirm', message: 'Enable Debug Mode?', initial: false },
    ],
  },
  {
    id: 'ga4-event',
    name: 'GA4 - Custom Event',
    description: 'Send a custom event to Google Analytics 4. Use for tracking user interactions and conversions.',
    platform: 'google-analytics',
    category: 'analytics',
    questions: [
      { name: 'measurementId', type: 'text', message: 'GA4 Measurement ID', initial: 'G-XXXXXXXXXX' },
      { name: 'eventName', type: 'text', message: 'Event Name', initial: 'custom_event' },
      { name: 'tagName', type: 'text', message: 'Tag Name' },
      { name: 'triggerName', type: 'text', message: 'Trigger' },
    ],
  },
  {
    id: 'ga4-ecommerce',
    name: 'GA4 - E-commerce Event',
    description: 'Track e-commerce events like purchases, add to cart, and product views.',
    platform: 'google-analytics',
    category: 'ecommerce',
    questions: [
      { name: 'measurementId', type: 'text', message: 'GA4 Measurement ID', initial: 'G-XXXXXXXXXX' },
      {
        name: 'eventType',
        type: 'select',
        message: 'Event Type',
        choices: [
          { value: 'purchase', title: 'Purchase' },
          { value: 'add_to_cart', title: 'Add to Cart' },
          { value: 'view_item', title: 'View Item' },
          { value: 'begin_checkout', title: 'Begin Checkout' },
          { value: 'add_payment_info', title: 'Add Payment Info' },
        ],
      },
      { name: 'tagName', type: 'text', message: 'Tag Name' },
      { name: 'triggerName', type: 'text', message: 'Trigger' },
    ],
  },

  // Meta (Facebook)
  {
    id: 'meta-pixel-config',
    name: 'Meta Pixel - Base Configuration',
    description: 'Initialize the Meta (Facebook) Pixel on your site. Required before tracking any events.',
    platform: 'meta',
    category: 'social',
    questions: [
      { name: 'pixelId', type: 'text', message: 'Pixel ID', initial: '1234567890123456' },
      { name: 'tagName', type: 'text', message: 'Tag Name', initial: 'meta-pixel-config' },
      { name: 'triggerName', type: 'text', message: 'Trigger', initial: 'pageview' },
      { name: 'autoPageView', type: 'confirm', message: 'Auto-track PageView', initial: true },
      { name: 'advancedMatching', type: 'confirm', message: 'Enable Advanced Matching', initial: false },
    ],
  },
  {
    id: 'meta-pixel-standard-event',
    name: 'Meta Pixel - Standard Event',
    description: 'Track a standard Meta Pixel event like Purchase, AddToCart, Lead, etc.',
    platform: 'meta',
    category: 'social',
    questions: [
      { name: 'pixelId', type: 'text', message: 'Pixel ID' },
      {
        name: 'eventType',
        type: 'select',
        message: 'Event Type',
        choices: [
          { value: 'Purchase', title: 'Purchase' },
          { value: 'AddToCart', title: 'Add to Cart' },
          { value: 'ViewContent', title: 'View Content' },
          { value: 'InitiateCheckout', title: 'Initiate Checkout' },
          { value: 'Lead', title: 'Lead' },
          { value: 'CompleteRegistration', title: 'Complete Registration' },
          { value: 'Search', title: 'Search' },
          { value: 'AddPaymentInfo', title: 'Add Payment Info' },
        ],
      },
      { name: 'tagName', type: 'text', message: 'Tag Name' },
      { name: 'triggerName', type: 'text', message: 'Trigger' },
      { name: 'useEcommerce', type: 'confirm', message: 'Use E-commerce DataLayer', initial: true },
    ],
  },

  // TikTok
  {
    id: 'tiktok-pixel-config',
    name: 'TikTok Pixel - Configuration',
    description: 'Initialize the TikTok Pixel on your site for conversion tracking.',
    platform: 'tiktok',
    category: 'social',
    questions: [
      { name: 'pixelId', type: 'text', message: 'Pixel ID' },
      { name: 'tagName', type: 'text', message: 'Tag Name', initial: 'tiktok-pixel-config' },
      { name: 'triggerName', type: 'text', message: 'Trigger', initial: 'pageview' },
      { name: 'autoPageView', type: 'confirm', message: 'Auto-track PageView', initial: true },
    ],
  },
  {
    id: 'tiktok-pixel-standard-event',
    name: 'TikTok Pixel - Standard Event',
    description: 'Track a standard TikTok Pixel event like Purchase, AddToCart, etc.',
    platform: 'tiktok',
    category: 'social',
    questions: [
      { name: 'pixelId', type: 'text', message: 'Pixel ID' },
      {
        name: 'eventType',
        type: 'select',
        message: 'Event Type',
        choices: [
          { value: 'CompletePayment', title: 'Complete Payment' },
          { value: 'AddToCart', title: 'Add to Cart' },
          { value: 'ViewContent', title: 'View Content' },
          { value: 'InitiateCheckout', title: 'Initiate Checkout' },
          { value: 'CompleteRegistration', title: 'Complete Registration' },
          { value: 'Search', title: 'Search' },
          { value: 'Contact', title: 'Contact' },
        ],
      },
      { name: 'tagName', type: 'text', message: 'Tag Name' },
      { name: 'triggerName', type: 'text', message: 'Trigger' },
    ],
  },

  // LinkedIn
  {
    id: 'linkedin-insight-config',
    name: 'LinkedIn Insight Tag - Configuration',
    description: 'Initialize the LinkedIn Insight Tag for conversion tracking and audience building.',
    platform: 'linkedin',
    category: 'social',
    questions: [
      { name: 'partnerId', type: 'text', message: 'Partner ID' },
      { name: 'tagName', type: 'text', message: 'Tag Name', initial: 'linkedin-insight-tag' },
      { name: 'triggerName', type: 'text', message: 'Trigger', initial: 'pageview' },
    ],
  },
  {
    id: 'linkedin-conversion',
    name: 'LinkedIn Conversion Tracking',
    description: 'Track conversions on LinkedIn for campaign optimization.',
    platform: 'linkedin',
    category: 'social',
    questions: [
      { name: 'partnerId', type: 'text', message: 'Partner ID' },
      { name: 'conversionId', type: 'text', message: 'Conversion ID' },
      {
        name: 'conversionType',
        type: 'select',
        message: 'Conversion Type',
        choices: [
          { value: 'conversion', title: 'General Conversion' },
          { value: 'lead', title: 'Lead' },
          { value: 'purchase', title: 'Purchase' },
          { value: 'sign_up', title: 'Sign Up' },
        ],
      },
      { name: 'tagName', type: 'text', message: 'Tag Name' },
      { name: 'triggerName', type: 'text', message: 'Trigger' },
    ],
  },

  // Google Ads
  {
    id: 'google-ads-config',
    name: 'Google Ads - Configuration',
    description: 'Initialize Google Ads tracking on your site.',
    platform: 'google-ads',
    category: 'advertising',
    questions: [
      { name: 'conversionId', type: 'text', message: 'Conversion ID', initial: 'AW-XXXXXXXXX' },
      { name: 'tagName', type: 'text', message: 'Tag Name', initial: 'google-ads-config' },
      { name: 'triggerName', type: 'text', message: 'Trigger', initial: 'pageview' },
    ],
  },
  {
    id: 'google-ads-conversion',
    name: 'Google Ads - Conversion',
    description: 'Track a conversion event in Google Ads.',
    platform: 'google-ads',
    category: 'advertising',
    questions: [
      { name: 'conversionId', type: 'text', message: 'Conversion ID' },
      { name: 'conversionLabel', type: 'text', message: 'Conversion Label' },
      { name: 'tagName', type: 'text', message: 'Tag Name' },
      { name: 'triggerName', type: 'text', message: 'Trigger' },
    ],
  },

  // Twitter/X
  {
    id: 'twitter-pixel-config',
    name: 'Twitter/X Pixel - Configuration',
    description: 'Initialize the Twitter/X Pixel for conversion tracking.',
    platform: 'twitter',
    category: 'social',
    questions: [
      { name: 'pixelId', type: 'text', message: 'Pixel ID' },
      { name: 'tagName', type: 'text', message: 'Tag Name', initial: 'twitter-pixel-config' },
      { name: 'triggerName', type: 'text', message: 'Trigger', initial: 'pageview' },
      { name: 'autoPageView', type: 'confirm', message: 'Auto-track PageView', initial: true },
    ],
  },

  // Snapchat
  {
    id: 'snapchat-pixel-config',
    name: 'Snapchat Pixel - Configuration',
    description: 'Initialize the Snapchat Pixel for conversion tracking.',
    platform: 'snapchat',
    category: 'social',
    questions: [
      { name: 'pixelId', type: 'text', message: 'Pixel ID' },
      { name: 'tagName', type: 'text', message: 'Tag Name', initial: 'snapchat-pixel-config' },
      { name: 'triggerName', type: 'text', message: 'Trigger', initial: 'pageview' },
      { name: 'autoPageView', type: 'confirm', message: 'Auto-track PageView', initial: true },
    ],
  },

  // Pinterest
  {
    id: 'pinterest-tag-config',
    name: 'Pinterest Tag - Configuration',
    description: 'Initialize the Pinterest Tag for conversion tracking.',
    platform: 'pinterest',
    category: 'social',
    questions: [
      { name: 'tagId', type: 'text', message: 'Tag ID' },
      { name: 'tagName', type: 'text', message: 'Tag Name', initial: 'pinterest-tag-config' },
      { name: 'triggerName', type: 'text', message: 'Trigger', initial: 'pageview' },
      { name: 'autoPageVisit', type: 'confirm', message: 'Auto-track Page Visit', initial: true },
      { name: 'enhancedMatch', type: 'confirm', message: 'Enable Enhanced Match', initial: false },
    ],
  },
];

// Trigger templates
const triggerTemplates = [
  {
    id: 'page-load',
    name: 'Page Load',
    description: 'Fire on every page load',
    category: 'page',
    questions: [
      { name: 'name', type: 'text', message: 'Trigger name', initial: 'page-load' },
      { name: 'description', type: 'text', message: 'Description', initial: 'Fires on every page load' },
    ],
  },
  {
    id: 'element-click',
    name: 'Click - Element Click',
    description: 'Fire when a specific element is clicked',
    category: 'interaction',
    questions: [
      { name: 'name', type: 'text', message: 'Trigger name', initial: 'element-click' },
      { name: 'selector', type: 'text', message: 'CSS Selector', initial: '[data-track]' },
      { name: 'waitForTags', type: 'confirm', message: 'Wait for tags before navigation?', initial: true },
    ],
  },
  {
    id: 'scroll-depth',
    name: 'Scroll Depth',
    description: 'Fire at specific scroll depth thresholds',
    category: 'interaction',
    questions: [
      { name: 'name', type: 'text', message: 'Trigger name', initial: 'scroll-depth' },
      { name: 'thresholds', type: 'text', message: 'Thresholds (comma-separated)', initial: '25,50,75,100' },
      { name: 'fireOncePerThreshold', type: 'confirm', message: 'Fire only once per threshold?', initial: true },
    ],
  },
];

// Zone templates
const zoneTemplates = [
  {
    id: 'all-pages',
    name: 'All Pages',
    description: 'Global zone that matches all pages',
    category: 'global',
    questions: [
      { name: 'name', type: 'text', message: 'Zone name', initial: 'all-pages' },
      { name: 'description', type: 'text', message: 'Description', initial: 'Matches all pages on the site' },
    ],
  },
  {
    id: 'product-pages',
    name: 'Product Pages',
    description: 'Zone for product detail pages',
    category: 'ecommerce',
    questions: [
      { name: 'name', type: 'text', message: 'Zone name', initial: 'product-pages' },
      { name: 'patterns', type: 'text', message: 'URL patterns (comma-separated)', initial: '/product/*, /products/*, /p/*' },
    ],
  },
  {
    id: 'checkout-pages',
    name: 'Checkout Pages',
    description: 'Zone for checkout and cart pages',
    category: 'ecommerce',
    questions: [
      { name: 'name', type: 'text', message: 'Zone name', initial: 'checkout' },
      { name: 'patterns', type: 'text', message: 'URL patterns (comma-separated)', initial: '/checkout/*, /cart, /cart/*' },
    ],
  },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  let templates;

  switch (type) {
    case 'tag':
      templates = tagTemplates;
      break;
    case 'trigger':
      templates = triggerTemplates;
      break;
    case 'zone':
      templates = zoneTemplates;
      break;
    default:
      templates = [...tagTemplates, ...triggerTemplates, ...zoneTemplates];
  }

  return NextResponse.json({ templates });
}
