/**
 * YourTM CLI Create Command
 *
 * Interactive wizard for creating tags, triggers, zones, and variables from templates.
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { loadConfig, findConfigFile, type YourTMConfig } from '../utils/config.js';
import {
  getTemplateById,
  allTagTemplates,
  type Template,
  type TemplateType,
} from '../templates/index.js';
import { slugify, detectExistingIds } from '../templates/utils.js';

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
 * Main create command - interactive wizard entry point
 */
export async function createCommand(
  subcommand?: string,
  options: CreateOptions = {}
): Promise<void> {
  const cwd = process.cwd();

  // Print header
  logger.header('YourTM Create Wizard');
  logger.newline();

  // Try to load config for context
  let config: YourTMConfig | null = null;
  try {
    const configPath = await findConfigFile(cwd);
    if (configPath) {
      config = await loadConfig(cwd);
      logger.info(`Using config from ${chalk.cyan(relative(cwd, configPath))}`);
      logger.newline();
    }
  } catch {
    logger.warn('No yourtm.config.ts found. Run `ytm init` to create one.');
    logger.newline();
  }

  // Determine what to create
  let createType: TemplateType;

  if (subcommand) {
    // Validate subcommand
    const validTypes: TemplateType[] = ['tag', 'trigger', 'zone', 'variable'];
    if (!validTypes.includes(subcommand as TemplateType)) {
      logger.error(`Invalid type: ${subcommand}. Must be one of: ${validTypes.join(', ')}`);
      process.exit(1);
    }
    createType = subcommand as TemplateType;
  } else {
    // Ask what to create
    const typeResponse = await prompts({
      type: 'select',
      name: 'type',
      message: 'What would you like to create?',
      choices: [
        { title: 'Tag', value: 'tag', description: 'A tracking tag (GA4, Meta Pixel, etc.)' },
        { title: 'Trigger', value: 'trigger', description: 'An event that fires tags' },
        { title: 'Zone', value: 'zone', description: 'A URL-based grouping for tags' },
        { title: 'Variable', value: 'variable', description: 'A reusable value or function' },
      ],
      initial: 0,
    });

    if (!typeResponse.type) {
      logger.info('Cancelled.');
      return;
    }

    createType = typeResponse.type;
  }

  // Route to appropriate creation flow
  switch (createType) {
    case 'tag':
      await createTag(config, options, cwd);
      break;
    case 'trigger':
      await createTrigger(config, options, cwd);
      break;
    case 'zone':
      await createZone(config, options, cwd);
      break;
    case 'variable':
      await createVariable(config, options, cwd);
      break;
  }
}

/**
 * Create a tag from template
 */
async function createTag(
  config: YourTMConfig | null,
  options: CreateOptions,
  cwd: string
): Promise<void> {
  logger.info(chalk.bold('Creating a new tag'));
  logger.newline();

  // Get existing IDs for context (can be used for suggestions)
  await detectExistingIds(config);

  // Show platform selection (or use from options)
  let platform = options.platform;

  if (!platform) {
    // Group templates by platform for selection
    const platformGroups = new Map<string, Template[]>();
    for (const template of allTagTemplates) {
      const p = ('platform' in template ? template.platform : 'custom') || 'custom';
      if (!platformGroups.has(p as string)) {
        platformGroups.set(p as string, []);
      }
      platformGroups.get(p as string)!.push(template);
    }

    const platformChoices = [
      { title: 'Google (GA4, Ads)', value: 'google', description: 'Google Analytics 4 and Google Ads tags' },
      { title: 'Meta (Facebook)', value: 'meta', description: 'Meta Pixel and Conversions API' },
      { title: 'TikTok', value: 'tiktok', description: 'TikTok Pixel events' },
      { title: 'LinkedIn', value: 'linkedin', description: 'LinkedIn Insight Tag' },
      { title: 'Twitter/X', value: 'twitter', description: 'Twitter/X pixel and events' },
      { title: 'Pinterest', value: 'pinterest', description: 'Pinterest Tag' },
      { title: 'Snapchat', value: 'snapchat', description: 'Snap Pixel' },
      { title: 'E-commerce', value: 'ecommerce', description: 'E-commerce tracking templates' },
      { title: 'Custom', value: 'custom', description: 'Create a custom tag' },
    ];

    const platformResponse = await prompts({
      type: 'select',
      name: 'platform',
      message: 'Select a platform:',
      choices: platformChoices,
      initial: 0,
    });

    if (!platformResponse.platform) {
      logger.info('Cancelled.');
      return;
    }

    platform = platformResponse.platform;
  }

  // Get templates for selected platform
  const templates = allTagTemplates.filter(t => {
    const tPlatform = 'platform' in t ? t.platform : undefined;
    if (platform === 'custom') return tPlatform === 'custom' || !tPlatform;
    // Google includes both google-analytics and google-ads platforms
    if (platform === 'google') return tPlatform === 'google-analytics' || tPlatform === 'google-ads';
    if (platform === 'ecommerce') return t.category === 'ecommerce';
    return tPlatform === platform;
  });

  if (templates.length === 0) {
    logger.warn(`No templates found for platform: ${platform}`);
    logger.info('Creating a custom tag instead.');
    await createCustomTag(config, options, cwd);
    return;
  }

  // Select template
  const templateResponse = await prompts({
    type: 'select',
    name: 'template',
    message: 'Select a template:',
    choices: templates.map(t => ({
      title: t.name,
      value: t.id,
      description: t.description,
    })),
    initial: 0,
  });

  if (!templateResponse.template) {
    logger.info('Cancelled.');
    return;
  }

  const template = getTemplateById(templateResponse.template);
  if (!template) {
    logger.error(`Template not found: ${templateResponse.template}`);
    return;
  }

  // Run template questions
  await runTemplateQuestions(template, config, options, cwd, 'tag');
}

/**
 * Create a custom tag (no template)
 */
async function createCustomTag(
  config: YourTMConfig | null,
  options: CreateOptions,
  cwd: string
): Promise<void> {
  const questions: prompts.PromptObject[] = [
    {
      type: 'text',
      name: 'name',
      message: 'Tag name:',
      initial: options.name || 'Custom Tag',
    },
    {
      type: 'text',
      name: 'description',
      message: 'Description (optional):',
    },
    {
      type: 'select',
      name: 'trigger',
      message: 'Default trigger:',
      choices: [
        { title: 'Page View', value: 'pageview' },
        { title: 'DOM Ready', value: 'dom-ready' },
        { title: 'Click', value: 'click' },
        { title: 'Form Submit', value: 'form-submit' },
        { title: 'Custom', value: 'custom' },
      ],
      initial: 0,
    },
    {
      type: 'confirm',
      name: 'requiresConsent',
      message: 'Requires user consent?',
      initial: false,
    },
    {
      type: (prev) => prev ? 'multiselect' : null,
      name: 'consentCategories',
      message: 'Consent categories:',
      choices: [
        { title: 'Analytics', value: 'analytics' },
        { title: 'Marketing', value: 'marketing' },
        { title: 'Functional', value: 'functional' },
      ],
    },
  ];

  const answers = await prompts(questions);
  if (!answers.name) {
    logger.info('Cancelled.');
    return;
  }

  const id = slugify(answers.name);
  const consent = answers.consentCategories || [];
  const consentLine = consent.length > 0
    ? `  consent: [${consent.map((c: string) => `'${c}'`).join(', ')}],\n`
    : '';

  const content = `import { defineTag } from '@yourtm/cli';

export default defineTag({
  id: '${id}',
  name: '${answers.name}',
  type: 'script',
  triggers: ['${answers.trigger}'],
  priority: 50,
${consentLine}
  code: \`
    // Your custom code here
    console.log('[YourTM] ${answers.name} fired');
  \`,
});
`;

  await writeTagFile(id, content, config, options, cwd);
}

/**
 * Create a trigger from template
 */
async function createTrigger(
  config: YourTMConfig | null,
  options: CreateOptions,
  cwd: string
): Promise<void> {
  logger.info(chalk.bold('Creating a new trigger'));
  logger.newline();

  // Select trigger type
  const triggerTypeResponse = await prompts({
    type: 'select',
    name: 'type',
    message: 'Trigger type:',
    choices: [
      { title: 'Page View', value: 'pageview', description: 'Fires when a page loads' },
      { title: 'DOM Ready', value: 'dom-ready', description: 'Fires when DOM is parsed' },
      { title: 'Window Load', value: 'window-load', description: 'Fires when page fully loads' },
      { title: 'Click', value: 'click', description: 'Fires on element clicks' },
      { title: 'Form Submit', value: 'form', description: 'Fires on form submissions' },
      { title: 'Scroll Depth', value: 'scroll', description: 'Fires at scroll positions' },
      { title: 'Timer', value: 'timer', description: 'Fires after a time delay' },
      { title: 'Element Visibility', value: 'visibility', description: 'Fires when element is visible' },
      { title: 'Custom Event', value: 'custom', description: 'Fires on dataLayer events' },
    ],
    initial: 0,
  });

  if (!triggerTypeResponse.type) {
    logger.info('Cancelled.');
    return;
  }

  // Get questions based on trigger type
  const triggerQuestions = getTriggerQuestions(triggerTypeResponse.type, options);
  const answers = await prompts(triggerQuestions);

  if (!answers.name) {
    logger.info('Cancelled.');
    return;
  }

  const id = slugify(answers.name);
  const content = generateTriggerContent(id, answers, triggerTypeResponse.type);

  await writeTriggerFile(id, content, config, options, cwd);
}

/**
 * Get questions for trigger creation based on type
 */
function getTriggerQuestions(
  type: string,
  options: CreateOptions
): prompts.PromptObject[] {
  const baseQuestions: prompts.PromptObject[] = [
    {
      type: 'text',
      name: 'name',
      message: 'Trigger name:',
      initial: options.name || getTriggerDefaultName(type),
    },
  ];

  const typeSpecificQuestions = getTriggerTypeSpecificQuestions(type);

  return [...baseQuestions, ...typeSpecificQuestions];
}

function getTriggerDefaultName(type: string): string {
  const names: Record<string, string> = {
    'pageview': 'All Pages - Page View',
    'dom-ready': 'All Pages - DOM Ready',
    'window-load': 'All Pages - Window Load',
    'click': 'All Elements - Click',
    'form': 'All Forms - Submit',
    'scroll': 'Scroll Depth Trigger',
    'timer': 'Timer Trigger',
    'visibility': 'Element Visibility Trigger',
    'custom': 'Custom Event Trigger',
  };
  return names[type] || 'Custom Trigger';
}

function getTriggerTypeSpecificQuestions(type: string): prompts.PromptObject[] {
  switch (type) {
    case 'pageview':
    case 'dom-ready':
    case 'window-load':
      return [
        {
          type: 'confirm',
          name: 'hasConditions',
          message: 'Add URL conditions?',
          initial: false,
        },
        {
          type: (prev) => prev ? 'select' : null,
          name: 'urlOperator',
          message: 'URL condition type:',
          choices: [
            { title: 'Contains', value: 'contains' },
            { title: 'Equals', value: 'equals' },
            { title: 'Starts with', value: 'startsWith' },
            { title: 'Matches regex', value: 'matches' },
          ],
        },
        {
          type: (_, values) => values.hasConditions ? 'text' : null,
          name: 'urlValue',
          message: 'URL value:',
          hint: 'e.g., /blog, /products, ^/checkout',
        },
      ];

    case 'click':
      return [
        {
          type: 'select',
          name: 'clickType',
          message: 'Click target:',
          choices: [
            { title: 'All Elements', value: 'all' },
            { title: 'Just Links', value: 'links' },
            { title: 'Specific Elements', value: 'specific' },
          ],
        },
        {
          type: (prev) => prev === 'specific' ? 'text' : null,
          name: 'selector',
          message: 'CSS Selector:',
          hint: 'e.g., .cta-button, #signup-btn, [data-track]',
        },
        {
          type: 'confirm',
          name: 'waitForTags',
          message: 'Wait for tags before navigation?',
          initial: true,
        },
        {
          type: (prev) => prev ? 'number' : null,
          name: 'waitTimeout',
          message: 'Wait timeout (ms):',
          initial: 2000,
        },
      ];

    case 'form':
      return [
        {
          type: 'select',
          name: 'formType',
          message: 'Form selection:',
          choices: [
            { title: 'All Forms', value: 'all' },
            { title: 'Specific Forms', value: 'specific' },
          ],
        },
        {
          type: (prev) => prev === 'specific' ? 'text' : null,
          name: 'formSelector',
          message: 'Form CSS selector:',
          hint: 'e.g., #contact-form, .newsletter-form',
        },
        {
          type: 'confirm',
          name: 'waitForValidation',
          message: 'Wait for form validation?',
          initial: true,
        },
      ];

    case 'scroll':
      return [
        {
          type: 'select',
          name: 'scrollType',
          message: 'Scroll measurement:',
          choices: [
            { title: 'Percentage', value: 'percentage' },
            { title: 'Pixels', value: 'pixels' },
          ],
        },
        {
          type: 'number',
          name: 'threshold',
          message: 'Threshold:',
          hint: 'Percentage (0-100) or pixels',
          initial: 50,
        },
      ];

    case 'timer':
      return [
        {
          type: 'number',
          name: 'interval',
          message: 'Interval (milliseconds):',
          initial: 5000,
          hint: '5000 = 5 seconds',
        },
        {
          type: 'confirm',
          name: 'repeat',
          message: 'Repeat?',
          initial: false,
        },
        {
          type: (prev) => prev ? 'number' : null,
          name: 'maxCount',
          message: 'Maximum times to fire:',
          initial: 3,
        },
      ];

    case 'visibility':
      return [
        {
          type: 'text',
          name: 'elementSelector',
          message: 'Element CSS selector:',
          hint: 'e.g., #hero-section, .product-card',
        },
        {
          type: 'number',
          name: 'visibilityThreshold',
          message: 'Visibility threshold (%):',
          initial: 50,
          hint: 'Percentage of element visible (0-100)',
        },
        {
          type: 'confirm',
          name: 'fireOnce',
          message: 'Fire only once per element?',
          initial: true,
        },
      ];

    case 'custom':
      return [
        {
          type: 'text',
          name: 'eventName',
          message: 'Custom event name:',
          hint: 'The event name pushed to dataLayer',
        },
      ];

    default:
      return [];
  }
}

function generateTriggerContent(
  id: string,
  answers: Record<string, unknown>,
  type: string
): string {
  let conditionsStr = '';
  let optionsStr = '';

  // Handle conditions
  if (answers.hasConditions && answers.urlValue) {
    conditionsStr = `  conditions: [
    {
      variable: 'page.path',
      operator: '${answers.urlOperator}',
      value: '${answers.urlValue}',
    },
  ],
`;
  }

  if (answers.clickType === 'links') {
    conditionsStr = `  conditions: [
    {
      variable: 'click.element.tagName',
      operator: 'equals',
      value: 'A',
    },
  ],
`;
  } else if (answers.clickType === 'specific' && answers.selector) {
    conditionsStr = `  conditions: [
    {
      variable: 'click.element.matches',
      operator: 'equals',
      value: '${answers.selector}',
    },
  ],
`;
  }

  if (answers.formType === 'specific' && answers.formSelector) {
    conditionsStr = `  conditions: [
    {
      variable: 'form.element.matches',
      operator: 'equals',
      value: '${answers.formSelector}',
    },
  ],
`;
  }

  // Handle options
  const options: Record<string, unknown> = {};

  if (answers.waitForTags) {
    options.waitForTags = true;
    options.waitTimeout = answers.waitTimeout || 2000;
  }

  if (answers.waitForValidation !== undefined) {
    options.waitForValidation = answers.waitForValidation;
  }

  if (answers.scrollType) {
    options.scrollType = answers.scrollType;
    options.threshold = answers.threshold;
  }

  if (answers.interval) {
    options.interval = answers.interval;
    options.repeat = answers.repeat || false;
    if (answers.repeat && answers.maxCount) {
      options.maxCount = answers.maxCount;
    }
  }

  if (answers.elementSelector) {
    options.selector = answers.elementSelector;
    options.threshold = (answers.visibilityThreshold as number) / 100;
    options.fireOnce = answers.fireOnce;
  }

  if (answers.eventName) {
    options.eventName = answers.eventName;
  }

  if (Object.keys(options).length > 0) {
    const optionLines = Object.entries(options)
      .map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`)
      .join(',\n');
    optionsStr = `  options: {
${optionLines},
  },
`;
  }

  // Map type aliases
  const triggerType = type === 'dom-ready' || type === 'window-load' ? 'pageview' : type;

  return `import { defineTrigger } from '@yourtm/cli';

export default defineTrigger({
  id: '${id}',
  name: '${answers.name}',
  type: '${triggerType}',
${optionsStr}${conditionsStr}});
`;
}

/**
 * Create a zone
 */
async function createZone(
  config: YourTMConfig | null,
  options: CreateOptions,
  cwd: string
): Promise<void> {
  logger.info(chalk.bold('Creating a new zone'));
  logger.newline();

  const questions: prompts.PromptObject[] = [
    {
      type: 'select',
      name: 'zoneType',
      message: 'Zone type:',
      choices: [
        { title: 'All Pages', value: 'all', description: 'Matches all pages on the site' },
        { title: 'URL Pattern', value: 'pattern', description: 'Match specific URL patterns' },
        { title: 'E-commerce Page', value: 'ecommerce', description: 'Pre-configured for e-commerce' },
      ],
    },
    {
      type: 'text',
      name: 'name',
      message: 'Zone name:',
      initial: options.name || 'My Zone',
    },
    {
      type: (_, values) => values.zoneType === 'pattern' ? 'text' : null,
      name: 'urlPattern',
      message: 'URL pattern:',
      hint: 'e.g., /products/*, /blog/*, /checkout',
      initial: '/*',
    },
    {
      type: (_, values) => values.zoneType === 'ecommerce' ? 'select' : null,
      name: 'ecommerceType',
      message: 'E-commerce page type:',
      choices: [
        { title: 'Product Pages', value: 'product' },
        { title: 'Category Pages', value: 'category' },
        { title: 'Cart Page', value: 'cart' },
        { title: 'Checkout Pages', value: 'checkout' },
        { title: 'Order Confirmation', value: 'confirmation' },
      ],
    },
    {
      type: 'number',
      name: 'priority',
      message: 'Priority (higher = fires first):',
      initial: 0,
      hint: 'Use higher values for more specific zones',
    },
  ];

  const answers = await prompts(questions);
  if (!answers.name) {
    logger.info('Cancelled.');
    return;
  }

  const id = slugify(answers.name);
  const content = generateZoneContent(id, answers);

  await writeZoneFile(id, content, config, options, cwd);
}

function generateZoneContent(
  id: string,
  answers: Record<string, unknown>
): string {
  let urlPatterns = ['*'];

  if (answers.zoneType === 'pattern' && answers.urlPattern) {
    urlPatterns = [answers.urlPattern as string];
  } else if (answers.zoneType === 'ecommerce') {
    const patterns: Record<string, string> = {
      product: '/products/*',
      category: '/collections/*',
      cart: '/cart',
      checkout: '/checkout/*',
      confirmation: '/thank-you',
    };
    urlPatterns = [patterns[answers.ecommerceType as string] || '/*'];
  }

  return `import { defineZone } from '@yourtm/cli';

export default defineZone({
  id: '${id}',
  name: '${answers.name}',
  urlPatterns: [${urlPatterns.map(p => `'${p}'`).join(', ')}],
  priority: ${answers.priority || 0},
});
`;
}

/**
 * Create a variable
 */
async function createVariable(
  config: YourTMConfig | null,
  options: CreateOptions,
  cwd: string
): Promise<void> {
  logger.info(chalk.bold('Creating a new variable'));
  logger.newline();

  const questions: prompts.PromptObject[] = [
    {
      type: 'select',
      name: 'varType',
      message: 'Variable type:',
      choices: [
        { title: 'JavaScript', value: 'javascript', description: 'Execute JavaScript to get value' },
        { title: 'DataLayer', value: 'dataLayer', description: 'Read from dataLayer' },
        { title: 'URL', value: 'url', description: 'Extract from current URL' },
        { title: 'Cookie', value: 'cookie', description: 'Read a cookie value' },
        { title: 'Constant', value: 'constant', description: 'A fixed value' },
      ],
    },
    {
      type: 'text',
      name: 'name',
      message: 'Variable name:',
      initial: options.name || 'My Variable',
    },
  ];

  // Add type-specific questions
  const typeQuestions: Record<string, prompts.PromptObject[]> = {
    javascript: [
      {
        type: 'text',
        name: 'jsCode',
        message: 'JavaScript expression:',
        hint: 'e.g., window.location.pathname, document.title',
        initial: 'window.location.pathname',
      },
    ],
    dataLayer: [
      {
        type: 'text',
        name: 'dataLayerKey',
        message: 'DataLayer key:',
        hint: 'Use dot notation for nested: user.email',
      },
      {
        type: 'text',
        name: 'defaultValue',
        message: 'Default value (if not found):',
      },
    ],
    url: [
      {
        type: 'select',
        name: 'urlPart',
        message: 'URL part:',
        choices: [
          { title: 'Full URL', value: 'href' },
          { title: 'Path', value: 'pathname' },
          { title: 'Hostname', value: 'hostname' },
          { title: 'Query String', value: 'search' },
          { title: 'Hash', value: 'hash' },
          { title: 'Query Parameter', value: 'param' },
        ],
      },
      {
        type: (prev) => prev === 'param' ? 'text' : null,
        name: 'paramName',
        message: 'Query parameter name:',
      },
    ],
    cookie: [
      {
        type: 'text',
        name: 'cookieName',
        message: 'Cookie name:',
      },
    ],
    constant: [
      {
        type: 'text',
        name: 'constantValue',
        message: 'Constant value:',
      },
    ],
  };

  // First get the type
  const typeAnswer = await prompts(questions);
  if (!typeAnswer.name) {
    logger.info('Cancelled.');
    return;
  }

  // Then get type-specific answers
  const specificQuestions = typeQuestions[typeAnswer.varType] || [];
  const specificAnswers = await prompts(specificQuestions);

  const allAnswers = { ...typeAnswer, ...specificAnswers };
  const id = slugify(allAnswers.name);
  const content = generateVariableContent(id, allAnswers);

  await writeVariableFile(id, content, config, options, cwd);
}

function generateVariableContent(
  id: string,
  answers: Record<string, unknown>
): string {
  const varType = answers.varType as string;
  let valueCode: string;

  switch (varType) {
    case 'javascript':
      valueCode = `() => ${answers.jsCode}`;
      break;

    case 'dataLayer':
      const defaultVal = answers.defaultValue
        ? ` || '${answers.defaultValue}'`
        : '';
      valueCode = `() => {
    const keys = '${answers.dataLayerKey}'.split('.');
    let value = window.dataLayer;
    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return${answers.defaultValue ? ` '${answers.defaultValue}'` : ' undefined'};
      }
    }
    return value${defaultVal};
  }`;
      break;

    case 'url':
      if (answers.urlPart === 'param') {
        valueCode = `() => new URLSearchParams(window.location.search).get('${answers.paramName}')`;
      } else {
        valueCode = `() => window.location.${answers.urlPart}`;
      }
      break;

    case 'cookie':
      valueCode = `() => {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === '${answers.cookieName}') {
        return decodeURIComponent(value);
      }
    }
    return undefined;
  }`;
      break;

    case 'constant':
      valueCode = `'${answers.constantValue}'`;
      break;

    default:
      valueCode = `() => undefined`;
  }

  return `// Variable: ${answers.name}
export default {
  id: '${id}',
  name: '${answers.name}',
  type: '${varType}',
  value: ${valueCode},
};
`;
}

/**
 * Run template questions and generate files
 */
async function runTemplateQuestions(
  template: Template,
  config: YourTMConfig | null,
  options: CreateOptions,
  cwd: string,
  type: TemplateType
): Promise<void> {
  logger.info(`Using template: ${chalk.cyan(template.name)}`);
  logger.info(chalk.dim(template.description));
  logger.newline();

  // Convert template questions to prompts format
  const promptQuestions: prompts.PromptObject[] = template.questions.map((q: any) => {
    // Map type first
    const qType = q.type || 'text';
    let mappedType: prompts.PromptType = 'text';
    switch (qType) {
      case 'input':
      case 'text':
        mappedType = 'text';
        break;
      case 'number':
        mappedType = 'number';
        break;
      case 'confirm':
      case 'boolean':
        mappedType = 'confirm';
        break;
      case 'list':
      case 'select':
        mappedType = 'select';
        break;
      case 'checkbox':
      case 'multiselect':
        mappedType = 'multiselect';
        break;
      default:
        mappedType = 'text';
    }

    // Handle the different question formats from existing templates
    const baseQuestion: prompts.PromptObject = {
      type: mappedType,
      name: q.name,
      message: q.message || q.label || q.name,
    };

    // Handle default values
    if ((q as any).default !== undefined) {
      baseQuestion.initial = typeof (q as any).default === 'function'
        ? undefined
        : (q as any).default;
    }

    // Handle choices
    if ((q as any).choices) {
      baseQuestion.choices = ((q as any).choices as any[]).map(c => {
        if (typeof c === 'string') {
          return { title: c, value: c };
        }
        return {
          title: c.name || c.label || c.title || c.value,
          value: c.value,
          description: c.description,
        };
      });
    }

    // Handle validation
    if ((q as any).validate) {
      baseQuestion.validate = (q as any).validate;
    }

    // Handle conditional display
    if ((q as any).when) {
      const whenFn = (q as any).when;
      baseQuestion.type = (_, values) => {
        if (whenFn(values)) {
          return qType === 'input' ? 'text' :
                 qType === 'confirm' || qType === 'boolean' ? 'confirm' :
                 qType === 'list' ? 'select' :
                 qType === 'checkbox' ? 'multiselect' :
                 qType;
        }
        return null;
      };
    }

    return baseQuestion;
  });

  // Run prompts
  const answers = await prompts(promptQuestions, {
    onCancel: () => {
      logger.info('Cancelled.');
      process.exit(0);
    },
  });

  // Generate files using template
  const context = {
    projectPath: cwd,
    tagsDir: config?.tagsDir || join(cwd, 'yourtm/tags'),
    triggersDir: config?.triggersDir || join(cwd, 'yourtm/triggers'),
    zonesDir: config?.zonesDir || join(cwd, 'yourtm/zones'),
    variablesDir: config?.variablesDir || join(cwd, 'yourtm/variables'),
  };

  // Call generate with any type to handle different template signatures
  const result = (template as any).generate(answers, context);

  // Handle different return types
  let outputPath: string;
  let content: string;

  if (typeof result === 'string') {
    // Trigger/zone templates return string directly
    const id = slugify(answers.name as string || answers.tagName as string || 'generated');
    outputPath = options.output || join(context.tagsDir, `${id}.ts`);
    content = result;
  } else if (result && typeof result === 'object' && 'path' in result && 'content' in result) {
    // Google/social templates return { path, content }
    outputPath = options.output || result.path;
    content = result.content;
  } else if (Array.isArray(result)) {
    // Some templates return GeneratedFile[]
    const file = result[0];
    outputPath = options.output || file.path;
    content = file.content;
  } else {
    logger.error('Template returned unexpected format');
    return;
  }

  const fullPath = outputPath.startsWith('/') ? outputPath : join(cwd, outputPath);

  // Ensure directory exists
  const dir = dirname(fullPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  // Check if file exists
  if (existsSync(fullPath) && !options.yes) {
    const overwrite = await prompts({
      type: 'confirm',
      name: 'value',
      message: `File ${relative(cwd, fullPath)} already exists. Overwrite?`,
      initial: false,
    });

    if (!overwrite.value) {
      logger.info('Cancelled.');
      return;
    }
  }

  const spinner = ora('Writing file...').start();
  await writeFile(fullPath, content);
  spinner.succeed(`Created ${chalk.cyan(relative(cwd, fullPath))}`);

  logger.newline();
  logger.success(`${type.charAt(0).toUpperCase() + type.slice(1)} created successfully!`);
  logger.newline();
  logger.info('Next steps:');
  console.log(`  1. Review the generated file at ${chalk.cyan(relative(cwd, fullPath))}`);
  console.log(`  2. Run ${chalk.cyan('ytm build')} to compile your container`);
  console.log(`  3. Run ${chalk.cyan('ytm dev')} to test locally`);
}

/**
 * Write a tag file
 */
async function writeTagFile(
  id: string,
  content: string,
  config: YourTMConfig | null,
  options: CreateOptions,
  cwd: string
): Promise<void> {
  const tagsDir = config?.tagsDir || join(cwd, 'yourtm/tags');
  const filePath = options.output || join(tagsDir, `${id}.ts`);
  const fullPath = filePath.startsWith('/') ? filePath : join(cwd, filePath);

  await writeGeneratedFile(fullPath, content, 'Tag', cwd, options);
}

/**
 * Write a trigger file
 */
async function writeTriggerFile(
  id: string,
  content: string,
  config: YourTMConfig | null,
  options: CreateOptions,
  cwd: string
): Promise<void> {
  const triggersDir = config?.triggersDir || join(cwd, 'yourtm/triggers');
  const filePath = options.output || join(triggersDir, `${id}.ts`);
  const fullPath = filePath.startsWith('/') ? filePath : join(cwd, filePath);

  await writeGeneratedFile(fullPath, content, 'Trigger', cwd, options);
}

/**
 * Write a zone file
 */
async function writeZoneFile(
  id: string,
  content: string,
  config: YourTMConfig | null,
  options: CreateOptions,
  cwd: string
): Promise<void> {
  const zonesDir = config?.zonesDir || join(cwd, 'yourtm/zones');
  const filePath = options.output || join(zonesDir, `${id}.ts`);
  const fullPath = filePath.startsWith('/') ? filePath : join(cwd, filePath);

  await writeGeneratedFile(fullPath, content, 'Zone', cwd, options);
}

/**
 * Write a variable file
 */
async function writeVariableFile(
  id: string,
  content: string,
  config: YourTMConfig | null,
  options: CreateOptions,
  cwd: string
): Promise<void> {
  const variablesDir = config?.variablesDir || join(cwd, 'yourtm/variables');
  const filePath = options.output || join(variablesDir, `${id}.ts`);
  const fullPath = filePath.startsWith('/') ? filePath : join(cwd, filePath);

  await writeGeneratedFile(fullPath, content, 'Variable', cwd, options);
}

/**
 * Write a generated file with confirmation
 */
async function writeGeneratedFile(
  fullPath: string,
  content: string,
  typeName: string,
  cwd: string,
  options: CreateOptions
): Promise<void> {
  // Ensure directory exists
  const dir = dirname(fullPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  // Check if file exists
  if (existsSync(fullPath) && !options.yes) {
    const overwrite = await prompts({
      type: 'confirm',
      name: 'value',
      message: `File ${relative(cwd, fullPath)} already exists. Overwrite?`,
      initial: false,
    });

    if (!overwrite.value) {
      logger.info('Cancelled.');
      return;
    }
  }

  const spinner = ora('Writing file...').start();
  await writeFile(fullPath, content);
  spinner.succeed(`Created ${chalk.cyan(relative(cwd, fullPath))}`);

  logger.newline();
  logger.success(`${typeName} created successfully!`);
  logger.newline();
  logger.info('Next steps:');
  console.log(`  1. Review the generated file at ${chalk.cyan(relative(cwd, fullPath))}`);
  console.log(`  2. Run ${chalk.cyan('ytm build')} to compile your container`);
  console.log(`  3. Run ${chalk.cyan('ytm dev')} to test locally`);
}

export default createCommand;
