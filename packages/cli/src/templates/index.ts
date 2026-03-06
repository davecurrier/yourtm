/**
 * Tag Templates Index
 *
 * This module exports all available tag templates organized by platform and type.
 */

import { googleTemplates } from './google.js';
import { triggerTemplates, zoneTemplates, type Template as TriggerZoneTemplate } from './triggers.js';
import { socialTemplates, type Template as SocialTemplate } from './social.js';
import { ecommerceTemplates, type Template as EcommerceTemplate } from './ecommerce.js';

// Re-export the types from types.js
export * from './types.js';
export * from './utils.js';

// Import types from types.js for local use
import type { TagTemplate, TemplateQuestion as TypesTemplateQuestion } from './types.js';

// Union type for all template types
export type Template = TagTemplate | TriggerZoneTemplate | SocialTemplate | EcommerceTemplate;
export type TemplateQuestion = TypesTemplateQuestion;

// Type for template categories
export type TemplateCategory = 'analytics' | 'advertising' | 'ecommerce' | 'social' | 'utilities' | 'trigger' | 'zone';

// Type for template types
export type TemplateType = 'tag' | 'trigger' | 'zone' | 'variable';

// All templates combined
export const allTagTemplates: Template[] = [
  ...googleTemplates,
  ...socialTemplates,
  ...ecommerceTemplates,
];

// All trigger templates
export const allTriggerTemplates = triggerTemplates;

// All zone templates
export const allZoneTemplates = zoneTemplates;

// Templates organized by platform
export const templatesByPlatform = {
  google: googleTemplates,
  social: socialTemplates,
  ecommerce: ecommerceTemplates,
} as const;

// Templates organized by category
export const templatesByCategory = {
  analytics: allTagTemplates.filter((t) => t.category === 'analytics'),
  advertising: allTagTemplates.filter((t) => t.category === 'advertising'),
  ecommerce: ecommerceTemplates,
  trigger: triggerTemplates,
  zone: zoneTemplates,
} as const;

// Get all templates of a specific type
export function getTemplates(type?: TemplateType): Template[] {
  if (!type) {
    return [...allTagTemplates, ...triggerTemplates, ...zoneTemplates];
  }
  switch (type) {
    case 'tag':
      return allTagTemplates;
    case 'trigger':
      return triggerTemplates;
    case 'zone':
      return zoneTemplates;
    case 'variable':
      return []; // Variable templates not yet implemented
    default:
      return [];
  }
}

// Helper to find a template by ID
export function getTemplateById(id: string): Template | undefined {
  const all = [...allTagTemplates, ...triggerTemplates, ...zoneTemplates];
  return all.find((t) => t.id === id);
}

// Alias for getTemplateById
export function getTemplate(id: string): Template | undefined {
  return getTemplateById(id);
}

// Helper to get templates by platform
export function getTemplatesByPlatform(platform: string): Template[] {
  return allTagTemplates.filter((t) => 'platform' in t && t.platform === platform);
}

// Helper to get templates by category
export function getTemplatesByCategory(category: TemplateCategory): Template[] {
  const categoryMap: Record<string, Template[]> = {
    analytics: allTagTemplates.filter((t) => t.category === 'analytics'),
    advertising: allTagTemplates.filter((t) => t.category === 'advertising'),
    ecommerce: ecommerceTemplates,
    social: socialTemplates,
    trigger: triggerTemplates,
    zone: zoneTemplates,
    utilities: [...triggerTemplates, ...zoneTemplates],
  };
  return categoryMap[category] || [];
}

// Get available platforms
export function getAvailablePlatforms(): string[] {
  const platforms = new Set<string>();
  for (const template of allTagTemplates) {
    if ('platform' in template && template.platform) {
      platforms.add(template.platform as string);
    }
  }
  return Array.from(platforms);
}

// Get available categories
export function getAvailableCategories(): TemplateCategory[] {
  return ['analytics', 'advertising', 'ecommerce', 'social', 'utilities'];
}

// Default export
export default allTagTemplates;
