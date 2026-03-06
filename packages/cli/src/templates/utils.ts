/**
 * Template utilities for the YourTM CLI create command
 */

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { YourTMConfig } from '../utils/config.js';

/**
 * Generate a tag TypeScript file
 */
export function generateTagFile(
  id: string,
  name: string,
  options: {
    platform?: string;
    triggers?: string[];
    priority?: number;
    consent?: string[];
    code: string;
  }
): string {
  const { platform, triggers = ['pageview'], priority = 50, consent = [], code } = options;

  const platformLine = platform ? `  platform: '${platform}',\n` : '';
  const consentLine = consent.length > 0 ? `  consent: [${consent.map(c => `'${c}'`).join(', ')}],\n` : '';

  return `import { defineTag } from '@yourtm/cli';

export default defineTag({
  id: '${id}',
  name: '${name}',
  type: 'script',
${platformLine}  triggers: [${triggers.map(t => `'${t}'`).join(', ')}],
  priority: ${priority},
${consentLine}
  code: \`
${code}
  \`,
});
`;
}

/**
 * Generate a trigger TypeScript file
 */
export function generateTriggerFile(
  id: string,
  name: string,
  options: {
    type: 'pageview' | 'click' | 'scroll' | 'timer' | 'custom' | 'form' | 'visibility';
    conditions?: Array<{
      variable: string;
      operator: string;
      value: string | number | boolean;
    }>;
    triggerOptions?: Record<string, unknown>;
  }
): string {
  const { type, conditions = [], triggerOptions } = options;

  let conditionsStr = '';
  if (conditions.length > 0) {
    const conditionLines = conditions.map(c => {
      const valueStr = typeof c.value === 'string' ? `'${c.value}'` : String(c.value);
      return `    {
      variable: '${c.variable}',
      operator: '${c.operator}',
      value: ${valueStr},
    }`;
    }).join(',\n');
    conditionsStr = `  conditions: [\n${conditionLines},\n  ],\n`;
  }

  let optionsStr = '';
  if (triggerOptions && Object.keys(triggerOptions).length > 0) {
    const optionLines = Object.entries(triggerOptions).map(([key, value]) => {
      const valueStr = typeof value === 'string' ? `'${value}'` : JSON.stringify(value);
      return `    ${key}: ${valueStr}`;
    }).join(',\n');
    optionsStr = `  options: {\n${optionLines},\n  },\n`;
  }

  return `import { defineTrigger } from '@yourtm/cli';

export default defineTrigger({
  id: '${id}',
  name: '${name}',
  type: '${type}',
${optionsStr}${conditionsStr}});
`;
}

/**
 * Generate a zone TypeScript file
 */
export function generateZoneFile(
  id: string,
  name: string,
  options: {
    urlPatterns?: string[];
    tags?: string[];
    priority?: number;
  }
): string {
  const { urlPatterns = ['*'], tags = [], priority = 0 } = options;

  const patternsStr = urlPatterns.map(p => `'${p}'`).join(', ');
  const tagsStr = tags.length > 0 ? `  tags: [${tags.map(t => `'${t}'`).join(', ')}],\n` : '';

  return `import { defineZone } from '@yourtm/cli';

export default defineZone({
  id: '${id}',
  name: '${name}',
  urlPatterns: [${patternsStr}],
${tagsStr}  priority: ${priority},
});
`;
}

/**
 * Generate a variable TypeScript file
 */
export function generateVariableFile(
  id: string,
  name: string,
  options: {
    type: 'javascript' | 'dataLayer' | 'cookie' | 'url' | 'constant';
    value: string;
  }
): string {
  const { type, value } = options;

  let valueStr: string;
  if (type === 'javascript') {
    valueStr = `() => ${value}`;
  } else if (type === 'constant') {
    valueStr = `'${value}'`;
  } else {
    valueStr = `'${value}'`;
  }

  return `// Variable: ${name}
export default {
  id: '${id}',
  name: '${name}',
  type: '${type}',
  value: ${valueStr},
};
`;
}

/**
 * Validate GA4 Measurement ID format (G-XXXXXXXXXX)
 */
export function validateMeasurementId(id: string): boolean | string {
  if (!id) {
    return 'Measurement ID is required';
  }
  if (!/^G-[A-Z0-9]{8,12}$/i.test(id)) {
    return 'Invalid format. Expected: G-XXXXXXXXXX (e.g., G-ABC123DEF4)';
  }
  return true;
}

/**
 * Validate Meta Pixel ID format (15-16 digit number)
 */
export function validatePixelId(id: string): boolean | string {
  if (!id) {
    return 'Pixel ID is required';
  }
  if (!/^\d{15,16}$/.test(id)) {
    return 'Invalid format. Expected: 15-16 digit number (e.g., 123456789012345)';
  }
  return true;
}

/**
 * Validate TikTok Pixel ID format
 */
export function validateTikTokPixelId(id: string): boolean | string {
  if (!id) {
    return 'Pixel ID is required';
  }
  if (!/^[A-Z0-9]{10,20}$/i.test(id)) {
    return 'Invalid format. Expected: Alphanumeric ID (e.g., C8L3K9H7J2)';
  }
  return true;
}

/**
 * Validate LinkedIn Partner ID format
 */
export function validateLinkedInPartnerId(id: string): boolean | string {
  if (!id) {
    return 'Partner ID is required';
  }
  if (!/^\d{6,10}$/.test(id)) {
    return 'Invalid format. Expected: 6-10 digit number';
  }
  return true;
}

/**
 * Validate Google Ads Conversion ID format
 */
export function validateGoogleAdsConversionId(id: string): boolean | string {
  if (!id) {
    return 'Conversion ID is required';
  }
  if (!/^AW-\d{9,11}$/.test(id)) {
    return 'Invalid format. Expected: AW-XXXXXXXXXXX (e.g., AW-123456789)';
  }
  return true;
}

/**
 * Convert a name to a URL-safe slug
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')      // Remove non-word chars
    .replace(/[\s_-]+/g, '-')      // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, '');      // Remove leading/trailing hyphens
}

/**
 * Convert a name to a valid identifier
 */
export function toIdentifier(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')       // Remove non-word chars
    .replace(/[\s-]+/g, '_')       // Replace spaces/hyphens with underscores
    .replace(/^_+|_+$/g, '')       // Remove leading/trailing underscores
    .replace(/^(\d)/, '_$1');      // Prefix with underscore if starts with digit
}

/**
 * Detect existing IDs from tags in the project
 */
export async function detectExistingIds(config: YourTMConfig | null): Promise<{
  measurementIds: string[];
  pixelIds: string[];
  conversionIds: string[];
  tagIds: string[];
  triggerIds: string[];
  zoneIds: string[];
}> {
  const result = {
    measurementIds: [] as string[],
    pixelIds: [] as string[],
    conversionIds: [] as string[],
    tagIds: [] as string[],
    triggerIds: [] as string[],
    zoneIds: [] as string[],
  };

  if (!config) {
    return result;
  }

  // Scan tags directory
  if (existsSync(config.tagsDir)) {
    try {
      const files = await readdir(config.tagsDir);
      for (const file of files) {
        if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;

        const content = await readFile(join(config.tagsDir, file), 'utf-8');

        // Extract tag ID
        const idMatch = content.match(/id:\s*['"]([^'"]+)['"]/);
        if (idMatch) {
          result.tagIds.push(idMatch[1]);
        }

        // Look for GA4 measurement IDs
        const ga4Matches = content.matchAll(/G-[A-Z0-9]{8,12}/gi);
        for (const match of ga4Matches) {
          if (!result.measurementIds.includes(match[0])) {
            result.measurementIds.push(match[0]);
          }
        }

        // Look for Meta Pixel IDs
        const pixelMatches = content.matchAll(/fbq\(['"]init['"],\s*['"](\d{15,16})['"]/g);
        for (const match of pixelMatches) {
          if (!result.pixelIds.includes(match[1])) {
            result.pixelIds.push(match[1]);
          }
        }

        // Look for Google Ads conversion IDs
        const convMatches = content.matchAll(/AW-\d{9,11}/g);
        for (const match of convMatches) {
          if (!result.conversionIds.includes(match[0])) {
            result.conversionIds.push(match[0]);
          }
        }
      }
    } catch {
      // Ignore errors reading tags
    }
  }

  // Scan triggers directory
  if (existsSync(config.triggersDir)) {
    try {
      const files = await readdir(config.triggersDir);
      for (const file of files) {
        if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;

        const content = await readFile(join(config.triggersDir, file), 'utf-8');
        const idMatch = content.match(/id:\s*['"]([^'"]+)['"]/);
        if (idMatch) {
          result.triggerIds.push(idMatch[1]);
        }
      }
    } catch {
      // Ignore errors
    }
  }

  // Scan zones directory
  if (existsSync(config.zonesDir)) {
    try {
      const files = await readdir(config.zonesDir);
      for (const file of files) {
        if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;

        const content = await readFile(join(config.zonesDir, file), 'utf-8');
        const idMatch = content.match(/id:\s*['"]([^'"]+)['"]/);
        if (idMatch) {
          result.zoneIds.push(idMatch[1]);
        }
      }
    } catch {
      // Ignore errors
    }
  }

  return result;
}

/**
 * Check if a file already exists
 */
export function fileExists(path: string): boolean {
  return existsSync(path);
}

/**
 * Get the filename from a path without extension
 */
export function getFileBasename(path: string): string {
  const name = basename(path);
  const dotIndex = name.lastIndexOf('.');
  return dotIndex > 0 ? name.slice(0, dotIndex) : name;
}

/**
 * Format a consent category for display
 */
export function formatConsentCategory(category: string): string {
  const categories: Record<string, string> = {
    analytics: 'Analytics',
    marketing: 'Marketing',
    functional: 'Functional',
    necessary: 'Necessary',
    preferences: 'Preferences',
    social: 'Social Media',
  };
  return categories[category] || category;
}

/**
 * Get default consent categories for a platform
 */
export function getDefaultConsent(platform: string): string[] {
  const consentMap: Record<string, string[]> = {
    'google-analytics': ['analytics'],
    'google-ads': ['marketing'],
    'meta': ['marketing'],
    'tiktok': ['marketing'],
    'linkedin': ['marketing'],
    'twitter': ['marketing', 'social'],
    'pinterest': ['marketing'],
    'snapchat': ['marketing'],
    'microsoft': ['marketing'],
  };
  return consentMap[platform] || [];
}

/**
 * Escape backticks in code strings for template literals
 */
export function escapeTemplateString(code: string): string {
  return code.replace(/`/g, '\\`').replace(/\${/g, '\\${');
}

/**
 * Indent code by a given number of spaces
 */
export function indentCode(code: string, spaces: number): string {
  const indent = ' '.repeat(spaces);
  return code
    .split('\n')
    .map(line => (line.trim() ? indent + line : line))
    .join('\n');
}
