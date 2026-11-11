/**
 * Vendor Detection and Code Generation for GTM Import
 *
 * Detects known vendors from GTM tag types and generates proper YTM implementations.
 */

import { slugify } from '../utils/slug.js';

export interface VendorTagResult {
  vendor: string;
  type: 'setup' | 'event' | 'config';
  code: string;
  consent?: string[];
  description?: string;
}

export interface GTMTag {
  name: string;
  type: string;
  parameter?: Array<{ key: string; value?: string; list?: any[] }>;
  firingTriggerId?: string[];
  blockingTriggerId?: string[];
  tagFiringOption?: string;
  [key: string]: any;
}

/**
 * Detect vendor and generate implementation code
 */
export function detectVendor(gtmTag: GTMTag): VendorTagResult | null {
  const detector = VENDOR_DETECTORS[gtmTag.type];
  if (detector) {
    return detector(gtmTag);
  }

  // Try to detect from HTML content for custom HTML tags
  if (gtmTag.type === 'html') {
    return detectFromHTML(gtmTag);
  }

  // Try to detect custom templates (cvt_*) from their parameters
  if (gtmTag.type.startsWith('cvt_')) {
    return detectFromCustomTemplate(gtmTag);
  }

  return null;
}

/**
 * Detect vendor from custom template parameters
 */
function detectFromCustomTemplate(tag: GTMTag): VendorTagResult | null {
  // LinkedIn Insight Tag - has partnerId parameter
  const partnerId = getParam(tag, 'partnerId');
  if (partnerId) {
    const eventId = getParam(tag, 'eventId');

    // If eventId is present, it's a conversion event
    if (eventId) {
      return {
        vendor: 'linkedin',
        type: 'event',
        description: `LinkedIn Conversion: ${tag.name}`,
        consent: ['marketing'],
        code: `
    if (!window.lintrk) return;
    window.lintrk('track', { conversion_id: ${jsString(eventId)} });`
      };
    }

    // Base insight tag
    return {
      vendor: 'linkedin',
      type: 'setup',
      description: 'LinkedIn Insight Tag',
      consent: ['marketing'],
      code: `
    if (window.lintrk) return;

    window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
    window._linkedin_data_partner_ids.push(${jsString(partnerId)});

    const script = document.createElement('script');
    script.src = 'https://snap.licdn.com/li.lms-analytics/insight.min.js';
    script.async = true;
    document.head.appendChild(script);`
    };
  }

  return null;
}

/**
 * Get parameter value from GTM tag
 */
function getParam(tag: GTMTag, key: string): string | undefined {
  return tag.parameter?.find(p => p.key === key)?.value;
}

/**
 * Get parameter list from GTM tag
 */
function getParamList(tag: GTMTag, key: string): any[] | undefined {
  return tag.parameter?.find(p => p.key === key)?.list;
}

/**
 * Render GTM param values as one JavaScript string *expression*.
 *
 * GTM parameters routinely hold `{{Variable}}` references — agency containers
 * keep conversion IDs and pixel IDs in variables rather than inline. Dropping
 * one into a quoted literal produces `'{{Conversion ID}}/label'`, and the
 * import's later reference rewrite turns that into
 * `'ctx.variables['conversion-id']/label'` — a syntax error, in a file that
 * still parses as TypeScript, so nothing catches it until the tag runs.
 *
 * Anything containing a reference becomes a template literal instead. Fully
 * static values stay a plain quoted string, so the common case reads the way a
 * person would have written it.
 */
function jsString(...parts: Array<string | undefined>): string {
  const joined = parts.map(p => p ?? '').join('');
  if (!/\{\{[^}]+\}\}/.test(joined)) {
    return `'${joined.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  // Escape before substituting: the `${` we insert below is deliberate and
  // must survive, and `{{Name}}` contains nothing the escapes would touch.
  const body = joined
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/\{\{([^}]+)\}\}/g, (_m, name) => `\${ctx.variables['${slugify(name.trim())}']}`);
  return `\`${body}\``;
}

// =============================================================================
// Vendor Detectors
// =============================================================================

const VENDOR_DETECTORS: Record<string, (tag: GTMTag) => VendorTagResult> = {

  // GA4 Configuration Tag
  'gaawc': (tag) => {
    const measurementId = getParam(tag, 'measurementId') || '';
    const sendPageView = getParam(tag, 'sendPageView') !== 'false';
    const fields = getParamList(tag, 'fieldsToSet') || [];

    let fieldCode = '';
    if (fields.length > 0) {
      const fieldEntries = fields.map(f => {
        const name = f.map?.find((m: any) => m.key === 'name')?.value;
        const value = f.map?.find((m: any) => m.key === 'value')?.value;
        return `        ${name}: ctx.variables['${slugify(value?.replace(/\{\{|\}\}/g, '') || '')}']`;
      }).join(',\n');
      fieldCode = `,\n${fieldEntries}`;
    }

    return {
      vendor: 'ga4',
      type: 'config',
      description: 'Google Analytics 4 Configuration',
      consent: ['analytics'],
      code: `
    if (window.gtag) return;

    const script = document.createElement('script');
    script.src = ${jsString('https://www.googletagmanager.com/gtag/js?id=', measurementId)};
    script.async = true;
    script.onload = () => {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function() { dataLayer.push(arguments); };
      gtag('js', new Date());
      gtag('config', ${jsString(measurementId)}, {
        send_page_view: ${sendPageView}${fieldCode}
      });
    };
    document.head.appendChild(script);`
    };
  },

  // Google Tag (new GA4 config tag type)
  'googtag': (tag) => {
    const tagId = getParam(tag, 'tagId') || '';
    const configSettings = getParamList(tag, 'configSettingsTable') || [];

    let configCode = '';
    if (configSettings.length > 0) {
      const configEntries = configSettings.map(s => {
        const param = s.map?.find((m: any) => m.key === 'parameter')?.value;
        const value = s.map?.find((m: any) => m.key === 'parameterValue')?.value;
        // Check if value is a GTM variable reference
        if (value?.startsWith('{{') && value?.endsWith('}}')) {
          const varName = value.replace(/\{\{|\}\}/g, '');
          return `        ${param}: ctx.variables['${slugify(varName)}']`;
        }
        // Handle boolean strings
        if (value === 'true' || value === 'false') {
          return `        ${param}: ${value}`;
        }
        return `        ${param}: '${value?.replace(/'/g, "\\'") || ''}'`;
      }).join(',\n');
      configCode = `\n${configEntries}`;
    }

    return {
      vendor: 'ga4',
      type: 'config',
      description: 'Google Analytics 4 Configuration',
      consent: ['analytics'],
      code: `
    if (window.gtag) return;

    const script = document.createElement('script');
    script.src = ${jsString('https://www.googletagmanager.com/gtag/js?id=', tagId)};
    script.async = true;
    script.onload = () => {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function() { dataLayer.push(arguments); };
      gtag('js', new Date());
      gtag('config', ${jsString(tagId)}${configCode ? `, {${configCode}
      }` : ''});
    };
    document.head.appendChild(script);`
    };
  },

  // GA4 Event Tag
  'gaawe': (tag) => {
    const eventName = getParam(tag, 'eventName') || '';
    const params = getParamList(tag, 'eventParameters') || [];

    let paramCode = '';
    if (params.length > 0) {
      const paramEntries = params.map(p => {
        const name = p.map?.find((m: any) => m.key === 'name')?.value;
        const value = p.map?.find((m: any) => m.key === 'value')?.value;
        // Check if value is a GTM variable reference
        if (value?.startsWith('{{') && value?.endsWith('}}')) {
          const varName = value.replace(/\{\{|\}\}/g, '');
          return `      ${name}: ctx.variables['${slugify(varName)}']`;
        }
        return `      ${name}: '${value?.replace(/'/g, "\\'") || ''}'`;
      }).join(',\n');
      paramCode = `, {\n${paramEntries}\n    }`;
    }

    return {
      vendor: 'ga4',
      type: 'event',
      description: `GA4 Event: ${eventName}`,
      consent: ['analytics'],
      code: `
    if (!window.gtag) return;
    gtag('event', ${jsString(eventName)}${paramCode});`
    };
  },

  // Meta/Facebook Pixel - Base
  'flc': (tag) => {
    const pixelId = getParam(tag, 'pixelId') || '';

    return {
      vendor: 'meta',
      type: 'setup',
      description: 'Meta (Facebook) Pixel',
      consent: ['marketing'],
      code: `
    if (window.fbq) return;

    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');

    fbq('init', ${jsString(pixelId)});
    fbq('track', 'PageView');`
    };
  },

  // Meta/Facebook Pixel - Event
  'flp': (tag) => {
    const eventName = getParam(tag, 'eventName') || 'PageView';
    const params = getParamList(tag, 'eventParameters') || [];

    let paramCode = '';
    if (params.length > 0) {
      const paramEntries = params.map(p => {
        const name = p.map?.find((m: any) => m.key === 'name')?.value;
        const value = p.map?.find((m: any) => m.key === 'value')?.value;
        if (value?.startsWith('{{') && value?.endsWith('}}')) {
          const varName = value.replace(/\{\{|\}\}/g, '');
          return `      ${name}: ctx.variables['${slugify(varName)}']`;
        }
        return `      ${name}: '${value?.replace(/'/g, "\\'") || ''}'`;
      }).join(',\n');
      paramCode = `, {\n${paramEntries}\n    }`;
    }

    return {
      vendor: 'meta',
      type: 'event',
      description: `Meta Pixel Event: ${eventName}`,
      consent: ['marketing'],
      code: `
    if (!window.fbq) return;
    fbq('track', ${jsString(eventName)}${paramCode});`
    };
  },

  // LinkedIn Insight Tag
  'linkedin_insight': (tag) => {
    const partnerId = getParam(tag, 'partner_id') || '';

    return {
      vendor: 'linkedin',
      type: 'setup',
      description: 'LinkedIn Insight Tag',
      consent: ['marketing'],
      code: `
    if (window.lintrk) return;

    window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
    window._linkedin_data_partner_ids.push(${jsString(partnerId)});

    const script = document.createElement('script');
    script.src = 'https://snap.licdn.com/li.lms-analytics/insight.min.js';
    script.async = true;
    document.head.appendChild(script);`
    };
  },

  // Microsoft/Bing UET Tag (handles both setup and events)
  'baut': (tag) => {
    const eventType = getParam(tag, 'eventType') || 'PAGE_LOAD';
    const tagId = getParam(tag, 'tagId') || '';
    const customEventAction = getParam(tag, 'customEventAction') || '';

    // Event tracking (userDefined eventType)
    if (eventType === 'userDefined' && customEventAction) {
      return {
        vendor: 'microsoft',
        type: 'event',
        description: `Microsoft Ads Event: ${customEventAction}`,
        consent: ['marketing'],
        code: `
    if (!window.uetq) return;
    window.uetq.push('event', ${jsString(customEventAction)}, {});`
      };
    }

    // Base setup tag (PAGE_LOAD eventType)
    return {
      vendor: 'microsoft',
      type: 'setup',
      description: 'Microsoft Ads UET Tag',
      consent: ['marketing'],
      code: `
    if (window.uetq) return;

    window.uetq = window.uetq || [];

    const script = document.createElement('script');
    script.src = 'https://bat.bing.com/bat.js';
    script.async = true;
    script.onload = () => {
      window.uetq.push('config', ${jsString(tagId)}, { ti: ${jsString(tagId)} });
    };
    document.head.appendChild(script);`
    };
  },

  // Google Ads Conversion
  'awct': (tag) => {
    const conversionId = getParam(tag, 'conversionId') || '';
    const conversionLabel = getParam(tag, 'conversionLabel') || '';
    const value = getParam(tag, 'conversionValue') || '';
    const currency = getParam(tag, 'currencyCode') || 'USD';

    return {
      vendor: 'google-ads',
      type: 'event',
      description: 'Google Ads Conversion',
      consent: ['marketing'],
      code: `
    if (!window.gtag) return;
    gtag('event', 'conversion', {
      send_to: ${jsString(conversionId, '/', conversionLabel)}${value ? `,
      value: ${value},
      currency: ${jsString(currency)}` : ''}
    });`
    };
  },

  // Google Ads Remarketing
  'sp': (tag) => {
    const conversionId = getParam(tag, 'conversionId') || '';

    return {
      vendor: 'google-ads',
      type: 'setup',
      description: 'Google Ads Remarketing',
      consent: ['marketing'],
      code: `
    if (!window.gtag) return;
    gtag('config', ${jsString(conversionId)});`
    };
  },

  // Hotjar
  'hotjar': (tag) => {
    const siteId = getParam(tag, 'siteId') || '';

    return {
      vendor: 'hotjar',
      type: 'setup',
      description: 'Hotjar Tracking',
      consent: ['analytics'],
      code: `
    if (window.hj) return;

    (function(h,o,t,j,a,r){
      h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
      h._hjSettings={hjid:${siteId},hjsv:6};
      a=o.getElementsByTagName('head')[0];
      r=o.createElement('script');r.async=1;
      r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
      a.appendChild(r);
    })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`
    };
  },

  // HubSpot
  'hubspot': (tag) => {
    const portalId = getParam(tag, 'portalId') || '';

    return {
      vendor: 'hubspot',
      type: 'setup',
      description: 'HubSpot Tracking Code',
      consent: ['analytics', 'marketing'],
      code: `
    const script = document.createElement('script');
    script.src = ${jsString('//js.hs-scripts.com/', portalId, '.js')};
    script.async = true;
    document.head.appendChild(script);`
    };
  },

  // TikTok Pixel
  'tiktok_pixel': (tag) => {
    const pixelId = getParam(tag, 'pixelId') || '';

    return {
      vendor: 'tiktok',
      type: 'setup',
      description: 'TikTok Pixel',
      consent: ['marketing'],
      code: `
    if (window.ttq) return;

    !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
    ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
    ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
    for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
    ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
    ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
    ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
    ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=document.createElement("script");
    o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;
    var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
    ttq.load(${jsString(pixelId)});ttq.page()}(window,document,'ttq');`
    };
  },

  // Pinterest Tag
  'pinterest': (tag) => {
    const tagId = getParam(tag, 'tagId') || '';

    return {
      vendor: 'pinterest',
      type: 'setup',
      description: 'Pinterest Tag',
      consent: ['marketing'],
      code: `
    if (window.pintrk) return;

    !function(e){if(!window.pintrk){window.pintrk=function(){window.pintrk.queue.push(Array.prototype.slice.call(arguments))};
    var n=window.pintrk;n.queue=[],n.version="3.0";var t=document.createElement("script");
    t.async=!0,t.src=e;var r=document.getElementsByTagName("script")[0];
    r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");

    pintrk('load', ${jsString(tagId)});
    pintrk('page');`
    };
  },

  // Snapchat Pixel
  'snapchat': (tag) => {
    const pixelId = getParam(tag, 'pixelId') || '';

    return {
      vendor: 'snapchat',
      type: 'setup',
      description: 'Snapchat Pixel',
      consent: ['marketing'],
      code: `
    if (window.snaptr) return;

    (function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};
    a.queue=[];var s='script';r=t.createElement(s);r.async=!0;
    r.src=n;var u=t.getElementsByTagName(s)[0];
    u.parentNode.insertBefore(r,u);})(window,document,'https://sc-static.net/scevent.min.js');

    snaptr('init', ${jsString(pixelId)});
    snaptr('track', 'PAGE_VIEW');`
    };
  },

  // Conversion Linker
  'gclidw': () => {
    return {
      vendor: 'google',
      type: 'setup',
      description: 'Conversion Linker',
      consent: ['marketing'],
      code: `
    const params = new URLSearchParams(window.location.search);
    ['gclid', 'wbraid', 'gbraid', 'dclid'].forEach(param => {
      const value = params.get(param);
      if (value) {
        document.cookie = '_gc_' + param + '=' + value + ';path=/;max-age=7776000;SameSite=Lax';
      }
    });`
    };
  },
};

// =============================================================================
// HTML Tag Detection
// =============================================================================

/**
 * Detect vendor from custom HTML tag content
 */
function detectFromHTML(tag: GTMTag): VendorTagResult | null {
  const html = getParam(tag, 'html') || '';

  // Check for known vendor patterns in HTML
  const patterns: Array<{
    pattern: RegExp;
    vendor: string;
    extract: (match: RegExpMatchArray, html: string) => VendorTagResult;
  }> = [
    // Facebook/Meta Pixel
    {
      pattern: /fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/,
      vendor: 'meta',
      extract: (match) => ({
        vendor: 'meta',
        type: 'setup',
        description: 'Meta (Facebook) Pixel',
        consent: ['marketing'],
        code: `
    if (window.fbq) return;

    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');

    fbq('init', '${match[1]}');
    fbq('track', 'PageView');`
      })
    },
    // LinkedIn
    {
      pattern: /_linkedin_partner_id\s*=\s*['"]?(\d+)['"]?/,
      vendor: 'linkedin',
      extract: (match) => ({
        vendor: 'linkedin',
        type: 'setup',
        description: 'LinkedIn Insight Tag',
        consent: ['marketing'],
        code: `
    if (window.lintrk) return;

    window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
    window._linkedin_data_partner_ids.push('${match[1]}');

    const script = document.createElement('script');
    script.src = 'https://snap.licdn.com/li.lms-analytics/insight.min.js';
    script.async = true;
    document.head.appendChild(script);`
      })
    },
    // Microsoft/Bing UET
    {
      pattern: /uetq\.push\s*\(\s*['"]config['"]\s*,\s*['"]?(\d+)['"]?/,
      vendor: 'microsoft',
      extract: (match) => ({
        vendor: 'microsoft',
        type: 'setup',
        description: 'Microsoft Ads UET Tag',
        consent: ['marketing'],
        code: `
    if (window.uetq) return;

    window.uetq = window.uetq || [];

    const script = document.createElement('script');
    script.src = 'https://bat.bing.com/bat.js';
    script.async = true;
    script.onload = () => {
      window.uetq.push('config', '${match[1]}', { ti: '${match[1]}' });
    };
    document.head.appendChild(script);`
      })
    },
    // HubSpot
    {
      pattern: /hs-scripts\.com\/(\d+)\.js/,
      vendor: 'hubspot',
      extract: (match) => ({
        vendor: 'hubspot',
        type: 'setup',
        description: 'HubSpot Tracking Code',
        consent: ['analytics', 'marketing'],
        code: `
    const script = document.createElement('script');
    script.src = '//js.hs-scripts.com/${match[1]}.js';
    script.async = true;
    document.head.appendChild(script);`
      })
    },
    // OptinMonster
    {
      pattern: /omappapi\.com.*data-campaign\s*=\s*['"]([^'"]+)['"]/,
      vendor: 'optinmonster',
      extract: (match, html) => {
        const userMatch = html.match(/data-user\s*=\s*['"]?(\d+)['"]?/);
        const userId = userMatch ? userMatch[1] : '';
        return {
          vendor: 'optinmonster',
          type: 'setup',
          description: 'OptinMonster Campaign',
          code: `
    const script = document.createElement('script');
    script.src = 'https://a.omappapi.com/app/js/api.min.js';
    script.async = true;
    script.dataset.user = '${userId}';
    script.dataset.campaign = '${match[1]}';
    document.head.appendChild(script);`
        };
      }
    },
    // VWO (URL pattern)
    {
      pattern: /visualwebsiteoptimizer\.com.*[?&]a=(\d+)/,
      vendor: 'vwo',
      extract: (match) => ({
        vendor: 'vwo',
        type: 'setup',
        description: 'VWO Visual Website Optimizer',
        consent: ['analytics'],
        code: `
    if (window._vwo_code) return;

    const accountId = '${match[1]}';

    window._vwo_code = {
      finish: function() {
        const t = document.getElementById('_vis_opt_path_hides');
        if (t) t.parentNode.removeChild(t);
      },
      init: function() {
        if (document.URL.indexOf('__vwo_disable__') > -1) return;
        const script = document.createElement('script');
        script.src = 'https://dev.visualwebsiteoptimizer.com/j.php?a=' + accountId + '&u=' + encodeURIComponent(document.URL) + '&vn=2.1&x=true';
        script.async = true;
        document.head.appendChild(script);
      }
    };
    window._vwo_code.init();`
      })
    },
    // VWO (account_id variable pattern)
    {
      pattern: /var\s+account_id\s*=\s*(\d+)[\s\S]*?visualwebsiteoptimizer/,
      vendor: 'vwo',
      extract: (match) => ({
        vendor: 'vwo',
        type: 'setup',
        description: 'VWO Visual Website Optimizer',
        consent: ['analytics'],
        code: `
    if (window._vwo_code) return;

    const accountId = '${match[1]}';

    window._vwo_code = {
      finish: function() {
        const t = document.getElementById('_vis_opt_path_hides');
        if (t) t.parentNode.removeChild(t);
      },
      init: function() {
        if (document.URL.indexOf('__vwo_disable__') > -1) return;
        const script = document.createElement('script');
        script.src = 'https://dev.visualwebsiteoptimizer.com/j.php?a=' + accountId + '&u=' + encodeURIComponent(document.URL) + '&vn=2.1&x=true';
        script.async = true;
        document.head.appendChild(script);
      }
    };
    window._vwo_code.init();`
      })
    },
    // Hotjar
    {
      pattern: /hjid\s*:\s*(\d+)/,
      vendor: 'hotjar',
      extract: (match) => ({
        vendor: 'hotjar',
        type: 'setup',
        description: 'Hotjar Tracking',
        consent: ['analytics'],
        code: `
    if (window.hj) return;

    (function(h,o,t,j,a,r){
      h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
      h._hjSettings={hjid:${match[1]},hjsv:6};
      a=o.getElementsByTagName('head')[0];
      r=o.createElement('script');r.async=1;
      r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
      a.appendChild(r);
    })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`
      })
    },
    // Google Analytics (gtag.js)
    {
      pattern: /gtag\/js\?id=(G-[A-Z0-9]+|UA-\d+-\d+)/,
      vendor: 'ga4',
      extract: (match) => ({
        vendor: 'ga4',
        type: 'config',
        description: 'Google Analytics',
        consent: ['analytics'],
        code: `
    if (window.gtag) return;

    const script = document.createElement('script');
    script.src = 'https://www.googletagmanager.com/gtag/js?id=${match[1]}';
    script.async = true;
    script.onload = () => {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function() { dataLayer.push(arguments); };
      gtag('js', new Date());
      gtag('config', '${match[1]}');
    };
    document.head.appendChild(script);`
      })
    },
  ];

  for (const { pattern, extract } of patterns) {
    const match = html.match(pattern);
    if (match) {
      return extract(match, html);
    }
  }

  return null;
}

/**
 * Get all supported vendor types
 */
export function getSupportedVendors(): string[] {
  return [
    'ga4 (Google Analytics 4)',
    'meta (Facebook/Meta Pixel)',
    'linkedin (LinkedIn Insight)',
    'microsoft (Microsoft Ads/Bing UET)',
    'google-ads (Google Ads Conversions)',
    'tiktok (TikTok Pixel)',
    'pinterest (Pinterest Tag)',
    'snapchat (Snapchat Pixel)',
    'hotjar (Hotjar)',
    'hubspot (HubSpot)',
    'vwo (Visual Website Optimizer)',
    'optinmonster (OptinMonster)',
  ];
}
