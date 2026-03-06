/**
 * Template type definitions for the YourTM CLI create command
 */

import type { YourTMConfig } from '../utils/config.js';
import type { TagDefinition, TriggerDefinition, ZoneDefinition } from '../compiler/index.js';

/**
 * Question types supported by prompts
 */
export type QuestionType =
  | 'text'
  | 'password'
  | 'number'
  | 'confirm'
  | 'select'
  | 'multiselect'
  | 'toggle'
  | 'autocomplete';

/**
 * A single question in a template questionnaire
 */
export interface TemplateQuestion {
  /** Unique name for the answer (used as key in answers object) */
  name: string;
  /** Question message to display */
  message: string;
  /** Type of prompt */
  type: QuestionType;
  /** Default value */
  initial?: string | number | boolean | string[];
  /** Choices for select/multiselect */
  choices?: Array<{
    title: string;
    value: string;
    description?: string;
    disabled?: boolean;
  }>;
  /** Validation function - return true if valid, string message if invalid */
  validate?: (value: unknown) => boolean | string;
  /** Conditional display - return true to show question */
  when?: (answers: Record<string, unknown>) => boolean;
  /** Transform the input value */
  format?: (value: unknown) => unknown;
  /** Hint text displayed below the prompt */
  hint?: string;
}

/**
 * Context provided to template generation functions
 */
export interface TemplateContext {
  /** Answers collected from questionnaire */
  answers: Record<string, unknown>;
  /** YourTM configuration */
  config: YourTMConfig | null;
  /** Existing tags in the project */
  existingTags: TagDefinition[];
  /** Existing triggers in the project */
  existingTriggers: TriggerDefinition[];
  /** Existing zones in the project */
  existingZones: ZoneDefinition[];
  /** Current working directory */
  cwd: string;
}

/**
 * A generated file from a template
 */
export interface GeneratedFile {
  /** Relative path from project root */
  path: string;
  /** File content */
  content: string;
  /** Whether to overwrite existing file */
  overwrite?: boolean;
}

/**
 * Template categories
 */
export type TemplateCategory =
  | 'analytics'
  | 'advertising'
  | 'ecommerce'
  | 'social'
  | 'utilities'
  | 'custom';

/**
 * Template types
 */
export type TemplateType = 'tag' | 'trigger' | 'zone' | 'variable';

/**
 * Platform identifiers for tag templates
 */
export type Platform =
  | 'google-analytics'
  | 'google-ads'
  | 'meta'
  | 'tiktok'
  | 'linkedin'
  | 'twitter'
  | 'pinterest'
  | 'snapchat'
  | 'microsoft'
  | 'custom';

/**
 * A template definition
 */
export interface Template<T = unknown> {
  /** Unique template identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this template creates */
  description: string;
  /** Template category */
  category: TemplateCategory;
  /** Template type (tag, trigger, zone, variable) */
  type: TemplateType;
  /** Platform (for tags) */
  platform?: Platform;
  /** Icon or emoji for display */
  icon?: string;
  /** Questions to ask during creation */
  questions: TemplateQuestion[];
  /** Generate files from template */
  generate: (context: TemplateContext) => GeneratedFile[] | Promise<GeneratedFile[]>;
  /** Post-generation message */
  postMessage?: (context: TemplateContext) => string;
  /** Generated definition type */
  _definitionType?: T;
}

/**
 * Template for creating tags
 */
export interface TagTemplate extends Template<TagDefinition> {
  type: 'tag';
  platform: Platform;
}

/**
 * Template for creating triggers
 */
export interface TriggerTemplate extends Template<TriggerDefinition> {
  type: 'trigger';
}

/**
 * Template for creating zones
 */
export interface ZoneTemplate extends Template<ZoneDefinition> {
  type: 'zone';
}

/**
 * Template for creating variables
 */
export interface VariableTemplate extends Template {
  type: 'variable';
}

/**
 * Union of all template types
 */
export type AnyTemplate = TagTemplate | TriggerTemplate | ZoneTemplate | VariableTemplate;

/**
 * Options for the create command
 */
export interface CreateOptions {
  /** Pre-select platform (skip platform selection prompt) */
  platform?: string;
  /** Pre-set name */
  name?: string;
  /** Custom output path */
  output?: string;
  /** Skip confirmation prompts */
  yes?: boolean;
}

/**
 * Result of running the create wizard
 */
export interface CreateResult {
  /** Type of item created */
  type: TemplateType;
  /** Template used */
  template: Template;
  /** Files generated */
  files: GeneratedFile[];
  /** Whether creation was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}
