import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getProjectPath } from '@/lib/project-config';

interface CreateRequest {
  type: 'tag' | 'trigger' | 'zone' | 'variable';
  template?: string;
  config: Record<string, unknown>;
}

// Generate a tag file from template and config
function generateTagFile(templateId: string, config: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const tagName = config.tagName as string || config.name as string || templateId;
  const triggerName = config.triggerName as string || 'pageview';

  // Custom code tag — matches the `code:` template-literal style used by
  // hand-written project tags. Code is escaped for safe embedding.
  if (templateId === 'custom-code') {
    const description = (config.description as string || 'Custom tag').replace(/'/g, "\\'");
    const triggers = Array.isArray(config.triggers) && config.triggers.length
      ? config.triggers as string[] : [triggerName];
    const zones = Array.isArray(config.zones) && config.zones.length
      ? config.zones as string[] : ['global'];
    const consent = Array.isArray(config.consent) ? config.consent as string[] : [];
    const rawCode = (config.code as string) ||
      "(function() {\n  // Your tag code here\n})();";
    // Escape for template-literal embedding: backslashes, backticks, ${
    const safeCode = rawCode
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$\{/g, '\\${');
    const list = (arr: string[]) => arr.map(v => `'${v.replace(/'/g, "\\'")}'`).join(', ');

    return `import { defineTag } from '@yourtm/core'

/**
 * ${tagName}
 * Generated: ${timestamp}
 */
export default defineTag({
  name: '${tagName.replace(/'/g, "\\'")}',
  type: 'script',
  triggers: [${list(triggers)}],
  zones: [${list(zones)}],${consent.length ? `\n  consent: [${list(consent)}],` : ''}
  description: '${description}',
  code: \`
${safeCode}
  \`,
})
`;
  }

  // GA4 Config
  if (templateId === 'ga4-config') {
    const measurementId = config.measurementId as string;
    const sendPageView = config.sendPageView !== false;
    const debugMode = config.debugMode === true;

    return `import { defineTag } from '@yourtm/core'
import { loadGtag, gtag } from '@yourtm/vendors/google'

/**
 * GA4 Configuration Tag
 * Generated: ${timestamp}
 */
export default defineTag({
  name: '${tagName}',
  description: 'Google Analytics 4 initialization',
  triggers: ['${triggerName}'],
  zones: ['all-pages'],
  consent: ['analytics'],
  vendor: 'google-analytics',
  priority: 100,

  async setup() {
    await loadGtag('${measurementId}'${debugMode ? ', { debug_mode: true }' : ''})
  },

  execute(ctx) {
    ${sendPageView ? `gtag('event', 'page_view', {
      page_title: document.title,
      page_location: window.location.href,
    })` : '// PageView tracking disabled'}
  },
})
`;
  }

  // GA4 Event
  if (templateId === 'ga4-event') {
    const eventName = config.eventName as string;

    return `import { defineTag } from '@yourtm/core'
import { gtag } from '@yourtm/vendors/google'

/**
 * GA4 Custom Event: ${eventName}
 * Generated: ${timestamp}
 */
export default defineTag({
  name: '${tagName}',
  description: 'GA4 custom event - ${eventName}',
  triggers: ['${triggerName}'],
  zones: ['all-pages'],
  consent: ['analytics'],
  vendor: 'google-analytics',

  execute(ctx) {
    gtag('event', '${eventName}', {
      // Add your event parameters here
      ...ctx.dataLayer,
    })
  },
})
`;
  }

  // Meta Pixel Config
  if (templateId === 'meta-pixel-config') {
    const pixelId = config.pixelId as string;
    const autoPageView = config.autoPageView !== false;
    const advancedMatching = config.advancedMatching === true;

    return `import { defineTag } from '@yourtm/core'
import { loadFbq, fbq } from '@yourtm/vendors/meta'

/**
 * Meta Pixel - Base Configuration
 * Generated: ${timestamp}
 */
export default defineTag({
  name: '${tagName}',
  description: 'Meta Pixel initialization and PageView tracking',
  triggers: ['${triggerName}'],
  zones: ['all-pages'],
  consent: ['marketing'],
  vendor: 'meta',
  priority: 100,

  async setup() {
    await loadFbq('${pixelId}'${advancedMatching ? ', { advancedMatching: true }' : ''})
  },

  execute(ctx) {
    ${autoPageView ? `fbq('track', 'PageView')` : '// PageView tracking disabled'}
  },
})
`;
  }

  // Meta Pixel Standard Event
  if (templateId === 'meta-pixel-standard-event') {
    const pixelId = config.pixelId as string;
    const eventType = config.eventType as string;

    return `import { defineTag } from '@yourtm/core'
import { loadFbq, fbq } from '@yourtm/vendors/meta'

/**
 * Meta Pixel - ${eventType} Event
 * Generated: ${timestamp}
 */
export default defineTag({
  name: '${tagName}',
  description: 'Meta Pixel ${eventType} Event',
  triggers: ['${triggerName}'],
  zones: ['all-pages'],
  consent: ['marketing'],
  vendor: 'meta',

  async setup() {
    await loadFbq('${pixelId}')
  },

  execute(ctx) {
    fbq('track', '${eventType}', {
      value: ctx.dataLayer.value || 0,
      currency: ctx.dataLayer.currency || 'USD',
    })
  },
})
`;
  }

  // TikTok Pixel Config
  if (templateId === 'tiktok-pixel-config') {
    const pixelId = config.pixelId as string;
    const autoPageView = config.autoPageView !== false;

    return `import { defineTag } from '@yourtm/core'
import { loadTtq, ttq } from '@yourtm/vendors/tiktok'

/**
 * TikTok Pixel - Base Configuration
 * Generated: ${timestamp}
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
    ${autoPageView ? `ttq.page()` : '// PageView tracking disabled'}
  },
})
`;
  }

  // LinkedIn Insight Tag
  if (templateId === 'linkedin-insight-config') {
    const partnerId = config.partnerId as string;

    return `import { defineTag } from '@yourtm/core'
import { loadLinkedIn, lintrk } from '@yourtm/vendors/linkedin'

/**
 * LinkedIn Insight Tag - Base Configuration
 * Generated: ${timestamp}
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
  },
})
`;
  }

  // Default/fallback template
  return `import { defineTag } from '@yourtm/core'

/**
 * Custom Tag: ${tagName}
 * Generated: ${timestamp}
 */
export default defineTag({
  name: '${tagName}',
  description: 'Custom tag',
  triggers: ['${triggerName}'],
  zones: ['all-pages'],
  consent: ['analytics'],

  execute(ctx) {
    // Add your tag code here
    console.log('Tag fired:', '${tagName}', ctx.dataLayer)
  },
})
`;
}

// Generate a trigger file
function generateTriggerFile(config: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const name = config.name as string;
  const type = config.type as string;
  const description = config.description as string || '';

  if (type === 'pageview') {
    return `import { defineTrigger } from '@yourtm/cli'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineTrigger({
  id: '${name}',
  name: '${name}',
  type: 'pageview',
})
`;
  }

  if (type === 'click') {
    const selector = config.selector as string;
    const waitForTags = config.waitForTags !== false;

    return `import { defineClickTrigger } from '@yourtm/core'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineClickTrigger({
  name: '${name}',
  description: '${description}',
  selector: '${selector}',
  waitForTags: ${waitForTags},

  extract(element) {
    return {
      text: element.textContent?.trim(),
      href: element.getAttribute('href'),
      ...Object.fromEntries(
        Object.entries(element.dataset).map(([key, value]) => ['data_' + key, value])
      ),
    }
  },
})
`;
  }

  if (type === 'scroll') {
    const threshold = config.threshold as number || 50;
    const scrollType = config.scrollType as string || 'percentage';

    return `import { defineScrollTrigger } from '@yourtm/core'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineScrollTrigger({
  name: '${name}',
  description: '${description}',
  thresholds: [${threshold}],
  unit: '${scrollType === 'pixels' ? 'pixels' : 'percent'}',
  fireOncePerThreshold: true,

  extract(threshold, scrollData) {
    return {
      scroll_threshold: threshold,
      scroll_depth_percent: scrollData.percentScrolled,
      scroll_depth_pixels: scrollData.pixelsScrolled,
    }
  },
})
`;
  }

  if (type === 'timer') {
    const interval = config.interval as number || 5000;
    const repeat = config.repeat as boolean;
    const maxCount = config.maxCount as number || 1;

    return `import { defineTrigger } from '@yourtm/cli'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineTrigger({
  id: '${name}',
  name: '${name}',
  type: 'timer',
  options: {
    delay: ${interval},
    ${repeat ? `interval: ${interval},\n    maxFires: ${maxCount === 0 ? 'Infinity' : maxCount},` : 'fireOnce: true,'}
  },
})
`;
  }

  if (type === 'form') {
    const selector = config.selector as string || 'form';

    return `import { defineFormTrigger } from '@yourtm/core'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineFormTrigger({
  name: '${name}',
  description: '${description}',
  selector: '${selector}',
  validateFirst: true,

  extract(form) {
    return {
      form_id: form.id,
      form_name: form.name,
      form_action: form.action,
    }
  },
})
`;
  }

  if (type === 'visibility') {
    const selector = config.selector as string;
    const threshold = config.threshold as number || 50;

    return `import { defineVisibilityTrigger } from '@yourtm/core'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineVisibilityTrigger({
  name: '${name}',
  description: '${description}',
  selector: '${selector}',
  visibilityThreshold: ${threshold / 100},
  fireOnce: true,

  extract(element, visibilityData) {
    return {
      element_id: element.id,
      element_class: element.className,
      visible_percent: visibilityData.visiblePercent,
    }
  },
})
`;
  }

  if (type === 'custom') {
    const eventName = config.eventName as string;

    return `import { defineDataLayerTrigger } from '@yourtm/core'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineDataLayerTrigger({
  name: '${name}',
  description: '${description}',
  event: '${eventName}',

  extract(dataLayerEvent) {
    const { event, ...data } = dataLayerEvent
    return data
  },
})
`;
  }

  // Default
  return `import { defineTrigger } from '@yourtm/cli'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineTrigger({
  id: '${name}',
  name: '${name}',
  type: 'custom',
})
`;
}

// Generate a zone file
function generateZoneFile(config: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const name = config.name as string;
  const description = config.description as string || '';
  const patterns = config.patterns as string[];
  const priority = config.priority as number || 0;

  return `import { defineZone } from '@yourtm/cli'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineZone({
  name: '${name}',
  description: '${description}',
  patterns: ${JSON.stringify(patterns, null, 2).replace(/\n/g, '\n  ')},
  ${priority > 0 ? `priority: ${priority},` : ''}
})
`;
}

// Generate a variable file
function generateVariableFile(config: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const name = config.name as string;
  const type = config.type as string;
  const description = config.description as string || '';

  if (type === 'dataLayer') {
    const dataLayerKey = config.dataLayerKey as string;
    const defaultValue = config.defaultValue as string;

    return `import { defineVariable } from '@yourtm/cli'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineVariable({
  name: '${name}',
  description: '${description}',
  type: 'dataLayer',
  key: '${dataLayerKey}',
  ${defaultValue ? `defaultValue: '${defaultValue}',` : ''}
})
`;
  }

  if (type === 'cookie') {
    const cookieName = config.cookieName as string;
    const defaultValue = config.defaultValue as string;

    return `import { defineVariable } from '@yourtm/cli'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineVariable({
  name: '${name}',
  description: '${description}',
  type: 'cookie',
  cookieName: '${cookieName}',
  ${defaultValue ? `defaultValue: '${defaultValue}',` : ''}
})
`;
  }

  if (type === 'localStorage') {
    const localStorageKey = config.localStorageKey as string;
    const defaultValue = config.defaultValue as string;

    return `import { defineVariable } from '@yourtm/cli'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineVariable({
  name: '${name}',
  description: '${description}',
  type: 'localStorage',
  key: '${localStorageKey}',
  ${defaultValue ? `defaultValue: '${defaultValue}',` : ''}
})
`;
  }

  if (type === 'javascript') {
    const jsExpression = config.jsExpression as string;

    return `import { defineVariable } from '@yourtm/cli'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineVariable({
  name: '${name}',
  description: '${description}',
  type: 'javascript',
  getValue() {
    return ${jsExpression}
  },
})
`;
  }

  if (type === 'url') {
    const urlPart = config.urlPart as string;
    const urlParam = config.urlParam as string;

    if (urlPart === 'param') {
      return `import { defineVariable } from '@yourtm/cli'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineVariable({
  name: '${name}',
  description: '${description}',
  type: 'url',
  component: 'query',
  queryKey: '${urlParam}',
})
`;
    }

    return `import { defineVariable } from '@yourtm/cli'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineVariable({
  name: '${name}',
  description: '${description}',
  type: 'url',
  component: '${urlPart}',
})
`;
  }

  if (type === 'constant') {
    const constantValue = config.constantValue as string;

    return `import { defineVariable } from '@yourtm/cli'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineVariable({
  name: '${name}',
  description: '${description}',
  type: 'constant',
  value: '${constantValue}',
})
`;
  }

  // Default
  return `import { defineVariable } from '@yourtm/cli'

/**
 * ${name}
 * ${description}
 * Generated: ${timestamp}
 */
export default defineVariable({
  name: '${name}',
  description: '${description}',
  type: 'custom',
  getValue() {
    return undefined
  },
})
`;
}

// Sanitize filename (remove special chars, convert to kebab-case)
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as CreateRequest;
    const { type, template, config } = body;

    if (!type || !config) {
      return NextResponse.json(
        { error: 'Missing required fields: type, config' },
        { status: 400 }
      );
    }

    // Get the project directory
    const projectDir = await getProjectPath();

    // Determine file content and path based on type
    let fileContent: string;
    let fileName: string;
    let subDir: string;

    const name = (config.name || config.tagName || template || 'untitled') as string;
    fileName = sanitizeFilename(name) + '.ts';

    switch (type) {
      case 'tag':
        fileContent = generateTagFile(template || '', config);
        subDir = 'tags';
        break;
      case 'trigger':
        fileContent = generateTriggerFile(config);
        subDir = 'triggers';
        break;
      case 'zone':
        fileContent = generateZoneFile(config);
        subDir = 'zones';
        break;
      case 'variable':
        fileContent = generateVariableFile(config);
        subDir = 'variables';
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid type. Must be tag, trigger, zone, or variable.' },
          { status: 400 }
        );
    }

    // Ensure the directory exists
    const targetDir = path.join(projectDir, 'yourtm', subDir);
    await fs.mkdir(targetDir, { recursive: true });

    // Write the file
    const filePath = path.join(targetDir, fileName);

    // Check if file already exists
    try {
      await fs.access(filePath);
      // File exists, add a number suffix
      let counter = 1;
      let newFileName = fileName;
      while (true) {
        try {
          await fs.access(path.join(targetDir, newFileName));
          counter++;
          newFileName = sanitizeFilename(name) + `-${counter}.ts`;
        } catch {
          fileName = newFileName;
          break;
        }
      }
    } catch {
      // File doesn't exist, use original name
    }

    const finalPath = path.join(targetDir, fileName);
    await fs.writeFile(finalPath, fileContent, 'utf-8');

    return NextResponse.json({
      success: true,
      id: sanitizeFilename(name),
      name,
      path: finalPath,
      type,
    });
  } catch (error) {
    console.error('Error creating asset:', error);
    return NextResponse.json(
      { error: 'Failed to create asset: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
