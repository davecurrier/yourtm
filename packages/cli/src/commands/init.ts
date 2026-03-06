/**
 * YourTM Init Command
 *
 * Create a new YourTM project with beautiful CLI UI
 */

import prompts from 'prompts';
import chalk from 'chalk';
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import { quickSetupCheck } from './setup.js';

// Beautiful gradient colors
const gradient = {
  purple: chalk.hex('#a855f7'),
  pink: chalk.hex('#ec4899'),
  cyan: chalk.hex('#06b6d4'),
  green: chalk.hex('#10b981'),
  yellow: chalk.hex('#f59e0b'),
  orange: chalk.hex('#f97316'),
  dim: chalk.hex('#71717a'),
  white: chalk.hex('#fafafa'),
};

// Gradient text logo
const logoText = chalk.bold(
  chalk.hex('#a855f7')('Your') + chalk.hex('#ec4899')('TM')
) + '  ' + gradient.white.bold('Create Project');

// Icons
const icons = {
  success: gradient.green('✓'),
  error: chalk.red('✗'),
  warning: gradient.yellow('⚠'),
  info: gradient.cyan('ℹ'),
  arrow: gradient.purple('→'),
  sparkle: gradient.pink('✨'),
  folder: gradient.yellow('📁'),
  file: gradient.cyan('📄'),
  tag: gradient.purple('🏷️'),
};

// Box drawing
function box(content: string, title?: string): string {
  const lines = content.split('\n');
  const maxLength = Math.max(...lines.map(l => stripAnsi(l).length), title ? stripAnsi(title).length + 4 : 0);
  const width = Math.min(maxLength + 4, 70);

  const top = title
    ? `╭─ ${title} ${'─'.repeat(Math.max(0, width - stripAnsi(title).length - 5))}╮`
    : `╭${'─'.repeat(width - 2)}╮`;
  const bottom = `╰${'─'.repeat(width - 2)}╯`;

  const paddedLines = lines.map(line => {
    const stripped = stripAnsi(line);
    const padding = width - stripped.length - 4;
    return `│ ${line}${' '.repeat(Math.max(0, padding))} │`;
  });

  return [top, ...paddedLines, bottom].join('\n');
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// Paths
const YOURTM_HOME = join(homedir(), '.yourtm');
const CONFIG_PATH = join(YOURTM_HOME, 'config.json');

// Platform templates with icons
const platforms = [
  { title: `${gradient.orange('●')} Google Analytics 4`, value: 'ga4', description: 'Pageviews, events, e-commerce' },
  { title: `${gradient.cyan('●')} Meta Pixel`, value: 'meta', description: 'Facebook & Instagram tracking' },
  { title: `${chalk.white('●')} TikTok Pixel`, value: 'tiktok', description: 'TikTok ads conversion tracking' },
  { title: `${gradient.cyan('●')} LinkedIn Insight`, value: 'linkedin', description: 'LinkedIn ads tracking' },
  { title: `${gradient.yellow('●')} Google Ads`, value: 'google-ads', description: 'Conversion tracking & remarketing' },
  { title: `${gradient.green('●')} Custom Tags Only`, value: 'custom', description: 'Start with empty structure' },
];

interface InitOptions {
  force?: boolean;
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  console.clear();
  console.log('\n  ' + logoText + '\n');

  // Check if global setup has been done
  const isSetup = await quickSetupCheck();
  if (!isSetup) {
    return;
  }

  // Load global config for defaults
  let globalConfig: { defaultProjectPath?: string } = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      globalConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    } catch {
      // Ignore
    }
  }

  // Project name
  console.log('');
  const { projectName } = await prompts({
    type: 'text',
    name: 'projectName',
    message: 'Project name',
    initial: 'my-website',
    validate: (value: string) => {
      if (!value.trim()) return 'Project name is required';
      if (!/^[a-zA-Z]/.test(value.trim())) {
        return 'Project name must start with a letter';
      }
      return true;
    },
  }, {
    onCancel: () => {
      console.log(gradient.dim('\n  Cancelled.\n'));
      process.exit(0);
    },
  });

  // Generate slug from name
  const projectSlug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Project location
  const defaultPath = globalConfig.defaultProjectPath
    ? join(globalConfig.defaultProjectPath, projectSlug)
    : join(process.cwd(), projectSlug);

  const locationChoices = [];
  if (globalConfig.defaultProjectPath) {
    locationChoices.push({
      title: `~/.yourtm/projects/${projectSlug}/`,
      value: join(globalConfig.defaultProjectPath, projectSlug),
      description: 'Your default project folder'
    });
  }
  locationChoices.push(
    {
      title: `Current directory (./${projectSlug}/)`,
      value: join(process.cwd(), projectSlug),
      description: 'Create subdirectory here'
    },
    {
      title: `Current directory (.)`,
      value: process.cwd(),
      description: 'Initialize in current directory'
    },
    { title: `Custom path...`, value: 'custom' }
  );

  const { projectLocation, customPath } = await prompts([
    {
      type: 'select',
      name: 'projectLocation',
      message: 'Where should this project live?',
      choices: locationChoices,
    },
    {
      type: (prev: string) => prev === 'custom' ? 'text' : null,
      name: 'customPath',
      message: 'Enter path',
      initial: defaultPath,
    },
  ], {
    onCancel: () => {
      console.log(gradient.dim('\n  Cancelled.\n'));
      process.exit(0);
    },
  });

  const projectPath = projectLocation === 'custom' ? customPath : projectLocation;
  const resolvedPath = resolve(projectPath);

  // Check if directory exists and has files
  if (existsSync(resolvedPath)) {
    try {
      const files = readdirSync(resolvedPath);
      if (files.length > 0 && !options.force) {
        console.log(`\n  ${icons.warning} Directory is not empty: ${gradient.dim(resolvedPath)}`);
        const { overwrite } = await prompts({
          type: 'confirm',
          name: 'overwrite',
          message: 'Continue anyway?',
          initial: false,
        });
        if (!overwrite) {
          console.log(gradient.dim('\n  Cancelled.\n'));
          return;
        }
      }
    } catch {
      // Directory doesn't exist or can't be read, that's fine
    }
  }

  // Select platforms
  console.log('');
  const { selectedPlatforms } = await prompts({
    type: 'multiselect',
    name: 'selectedPlatforms',
    message: 'Which platforms will you use?',
    choices: platforms,
    instructions: gradient.dim('  Space to select, Enter to confirm'),
    min: 1,
  }, {
    onCancel: () => {
      console.log(gradient.dim('\n  Cancelled.\n'));
      process.exit(0);
    },
  });

  // If they selected platforms, ask about IDs
  let platformIds: Record<string, string> = {};
  if (!selectedPlatforms.includes('custom') && selectedPlatforms.length > 0) {
    const { idOption } = await prompts({
      type: 'select',
      name: 'idOption',
      message: 'Configure tracking IDs now?',
      choices: [
        { title: 'Yes, enter IDs now', value: 'now' },
        { title: 'No, use placeholders (fill in later)', value: 'later', description: 'IDs like G-XXXXXX' },
      ],
    }, {
      onCancel: () => {
        console.log(gradient.dim('\n  Cancelled.\n'));
        process.exit(0);
      },
    });

    if (idOption === 'now') {
      const idQuestions: prompts.PromptObject[] = [];

      if (selectedPlatforms.includes('ga4')) {
        idQuestions.push({
          type: 'text',
          name: 'ga4',
          message: 'GA4 Measurement ID',
          initial: 'G-',
        });
      }
      if (selectedPlatforms.includes('meta')) {
        idQuestions.push({
          type: 'text',
          name: 'meta',
          message: 'Meta Pixel ID',
        });
      }
      if (selectedPlatforms.includes('tiktok')) {
        idQuestions.push({
          type: 'text',
          name: 'tiktok',
          message: 'TikTok Pixel ID',
        });
      }
      if (selectedPlatforms.includes('linkedin')) {
        idQuestions.push({
          type: 'text',
          name: 'linkedin',
          message: 'LinkedIn Partner ID',
        });
      }
      if (selectedPlatforms.includes('google-ads')) {
        idQuestions.push({
          type: 'text',
          name: 'googleAds',
          message: 'Google Ads Conversion ID',
          initial: 'AW-',
        });
      }

      if (idQuestions.length > 0) {
        platformIds = await prompts(idQuestions, {
          onCancel: () => {
            console.log(gradient.dim('\n  Cancelled.\n'));
            process.exit(0);
          },
        });
      }
    }
  }

  // Generate container ID
  const containerId = `YTM-${projectSlug.toUpperCase().slice(0, 6).replace(/-/g, '')}`;

  // Create the project
  console.log('');
  console.log(gradient.white.bold('  Creating project...\n'));

  // Create directories
  const dirs = [
    resolvedPath,
    join(resolvedPath, 'yourtm'),
    join(resolvedPath, 'yourtm', 'tags'),
    join(resolvedPath, 'yourtm', 'triggers'),
    join(resolvedPath, 'yourtm', 'zones'),
    join(resolvedPath, 'yourtm', 'variables'),
  ];

  // Add platform directories
  if (selectedPlatforms.includes('ga4')) dirs.push(join(resolvedPath, 'yourtm', 'tags', 'ga4'));
  if (selectedPlatforms.includes('meta')) dirs.push(join(resolvedPath, 'yourtm', 'tags', 'meta'));
  if (selectedPlatforms.includes('tiktok')) dirs.push(join(resolvedPath, 'yourtm', 'tags', 'tiktok'));
  if (selectedPlatforms.includes('linkedin')) dirs.push(join(resolvedPath, 'yourtm', 'tags', 'linkedin'));
  if (selectedPlatforms.includes('google-ads')) dirs.push(join(resolvedPath, 'yourtm', 'tags', 'google-ads'));
  if (selectedPlatforms.includes('custom')) dirs.push(join(resolvedPath, 'yourtm', 'tags', 'custom'));

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
  console.log(`  ${icons.success} Created directories`);

  // Create config file
  const configContent = generateConfig(projectName, containerId);
  writeFileSync(join(resolvedPath, 'yourtm.config.ts'), configContent);
  console.log(`  ${icons.success} Created ${gradient.cyan('yourtm.config.ts')}`);

  // Create package.json
  const packageJson = {
    name: projectSlug,
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      build: 'ytm build',
      dev: 'ytm dev',
      check: 'ytm check',
      deploy: 'ytm deploy',
    },
    dependencies: {
      '@yourtm/core': '^0.1.0',
    },
  };
  writeFileSync(join(resolvedPath, 'package.json'), JSON.stringify(packageJson, null, 2));
  console.log(`  ${icons.success} Created ${gradient.cyan('package.json')}`);

  // Create .gitignore
  const gitignoreContent = `# YourTM
dist/
node_modules/
.yourtm-cache/

# Environment
.env
.env.local
`;
  writeFileSync(join(resolvedPath, '.gitignore'), gitignoreContent);
  console.log(`  ${icons.success} Created ${gradient.cyan('.gitignore')}`);

  // Create zone files
  writeFileSync(join(resolvedPath, 'yourtm', 'zones', 'global.ts'), generateZone('global', 'All pages', ['**']));
  console.log(`  ${icons.success} Created ${gradient.cyan('yourtm/zones/global.ts')}`);

  // Create trigger files
  writeFileSync(join(resolvedPath, 'yourtm', 'triggers', 'page-load.ts'), generateTrigger('page-load', 'Page Load', 'pageview'));
  console.log(`  ${icons.success} Created ${gradient.cyan('yourtm/triggers/page-load.ts')}`);

  // Create platform-specific tags
  if (selectedPlatforms.includes('ga4')) {
    const ga4Id = platformIds.ga4 || 'G-XXXXXXXXXX';
    writeFileSync(join(resolvedPath, 'yourtm', 'tags', 'ga4', 'pageview.ts'), generateGA4Tag(ga4Id));
    console.log(`  ${icons.success} Created ${gradient.cyan('yourtm/tags/ga4/pageview.ts')}`);
  }

  if (selectedPlatforms.includes('meta')) {
    const metaId = platformIds.meta || '1234567890';
    writeFileSync(join(resolvedPath, 'yourtm', 'tags', 'meta', 'pixel.ts'), generateMetaTag(metaId));
    console.log(`  ${icons.success} Created ${gradient.cyan('yourtm/tags/meta/pixel.ts')}`);
  }

  if (selectedPlatforms.includes('tiktok')) {
    const tiktokId = platformIds.tiktok || 'XXXXXXXXXX';
    writeFileSync(join(resolvedPath, 'yourtm', 'tags', 'tiktok', 'pixel.ts'), generateTikTokTag(tiktokId));
    console.log(`  ${icons.success} Created ${gradient.cyan('yourtm/tags/tiktok/pixel.ts')}`);
  }

  if (selectedPlatforms.includes('linkedin')) {
    const linkedinId = platformIds.linkedin || '123456';
    writeFileSync(join(resolvedPath, 'yourtm', 'tags', 'linkedin', 'insight.ts'), generateLinkedInTag(linkedinId));
    console.log(`  ${icons.success} Created ${gradient.cyan('yourtm/tags/linkedin/insight.ts')}`);
  }

  if (selectedPlatforms.includes('google-ads')) {
    const googleAdsId = platformIds.googleAds || 'AW-XXXXXXXXXX';
    writeFileSync(join(resolvedPath, 'yourtm', 'tags', 'google-ads', 'conversion.ts'), generateGoogleAdsTag(googleAdsId));
    console.log(`  ${icons.success} Created ${gradient.cyan('yourtm/tags/google-ads/conversion.ts')}`);
  }

  // Success message
  console.log('');
  const relativePath = resolvedPath.replace(homedir(), '~');

  console.log(box(
    `${icons.sparkle} ${gradient.white.bold('Project created!')}\n\n` +
    `  ${gradient.dim('Location:')} ${gradient.cyan(relativePath)}\n` +
    `  ${gradient.dim('Container:')} ${gradient.cyan(containerId)}\n\n` +
    `  Next steps:\n\n` +
    `    ${gradient.cyan(`cd ${relativePath}`)}\n` +
    `    ${gradient.cyan('npm install')}\n` +
    `    ${gradient.cyan('ytm build')}\n\n` +
    `  Or start the dev server:\n\n` +
    `    ${gradient.cyan('ytm dev')}`,
    gradient.green('Success')
  ));
  console.log('');
}

// Template generators
function generateConfig(name: string, containerId: string): string {
  return `import { defineConfig } from '@yourtm/core'

export default defineConfig({
  container: {
    id: '${containerId}',
    name: '${name}',
    description: 'Tag management for ${name}',
  },

  build: {
    outDir: 'dist/ytm',
    minify: true,
    sourcemap: false,
  },

  budgets: {
    maxBundleSize: 100_000,
    maxTagSize: 10_000,
    warnOnSlowTags: 100,
  },

  consent: {
    categories: ['necessary', 'analytics', 'marketing', 'preferences'],
    defaultState: {
      necessary: true,
      analytics: false,
      marketing: false,
      preferences: false,
    },
  },
})
`;
}

function generateZone(name: string, description: string, patterns: string[]): string {
  return `import { defineZone } from '@yourtm/core'

export default defineZone({
  name: '${name}',
  description: '${description}',
  match: {
    pathname: ${JSON.stringify(patterns)},
  },
})
`;
}

function generateTrigger(_id: string, displayName: string, type: string): string {
  return `import { defineTrigger } from '@yourtm/core'

export default defineTrigger({
  name: '${displayName}',
  type: '${type}',
  config: {
    includeVirtualPageviews: true,
  },
})
`;
}

function generateGA4Tag(measurementId: string): string {
  return `import { defineTag } from '@yourtm/core'

export default defineTag({
  name: 'GA4 Pageview',
  description: 'Google Analytics 4 page view tracking',
  triggers: ['page-load'],
  zones: ['global'],
  consent: ['analytics'],

  async setup() {
    // Load gtag.js
    const script = document.createElement('script')
    script.src = 'https://www.googletagmanager.com/gtag/js?id=${measurementId}'
    script.async = true
    document.head.appendChild(script)

    window.dataLayer = window.dataLayer || []
    window.gtag = function() { dataLayer.push(arguments) }
    window.gtag('js', new Date())
  },

  execute(ctx) {
    window.gtag('config', '${measurementId}', {
      page_title: document.title,
      page_location: ctx.url.href,
    })
  },
})
`;
}

function generateMetaTag(pixelId: string): string {
  return `import { defineTag } from '@yourtm/core'

export default defineTag({
  name: 'Meta Pixel',
  description: 'Meta (Facebook) Pixel tracking',
  triggers: ['page-load'],
  zones: ['global'],
  consent: ['marketing'],

  async setup() {
    // Initialize Meta Pixel
    !function(f,b,e,v,n,t,s) {
      if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)
    }(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');

    window.fbq('init', '${pixelId}')
  },

  execute(ctx) {
    window.fbq('track', 'PageView')
  },
})
`;
}

function generateTikTokTag(pixelId: string): string {
  return `import { defineTag } from '@yourtm/core'

export default defineTag({
  name: 'TikTok Pixel',
  description: 'TikTok Pixel tracking',
  triggers: ['page-load'],
  zones: ['global'],
  consent: ['marketing'],

  async setup() {
    // Initialize TikTok Pixel
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
      ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
      ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
      for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
      ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
      ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
      ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
      ttq._o=ttq._o||{};ttq._o[e]=n||{};
      var o=document.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;
      var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
      ttq.load('${pixelId}');
      ttq.page();
    }(window, document, 'ttq');
  },

  execute(ctx) {
    window.ttq.page()
  },
})
`;
}

function generateLinkedInTag(partnerId: string): string {
  return `import { defineTag } from '@yourtm/core'

export default defineTag({
  name: 'LinkedIn Insight',
  description: 'LinkedIn Insight Tag',
  triggers: ['page-load'],
  zones: ['global'],
  consent: ['marketing'],

  async setup() {
    // Initialize LinkedIn Insight
    window._linkedin_partner_id = "${partnerId}";
    window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
    window._linkedin_data_partner_ids.push(window._linkedin_partner_id);

    (function(l) {
      if (!l){window.lintrk = function(a,b){window.lintrk.q.push([a,b])};
      window.lintrk.q=[]}
      var s = document.getElementsByTagName("script")[0];
      var b = document.createElement("script");
      b.type = "text/javascript";b.async = true;
      b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
      s.parentNode.insertBefore(b, s);
    })(window.lintrk);
  },

  execute(ctx) {
    // LinkedIn automatically tracks page views
  },
})
`;
}

function generateGoogleAdsTag(conversionId: string): string {
  return `import { defineTag } from '@yourtm/core'

export default defineTag({
  name: 'Google Ads Remarketing',
  description: 'Google Ads remarketing tag',
  triggers: ['page-load'],
  zones: ['global'],
  consent: ['marketing'],

  async setup() {
    // Load gtag.js for Google Ads
    const script = document.createElement('script')
    script.src = 'https://www.googletagmanager.com/gtag/js?id=${conversionId}'
    script.async = true
    document.head.appendChild(script)

    window.dataLayer = window.dataLayer || []
    window.gtag = function() { dataLayer.push(arguments) }
    window.gtag('js', new Date())
  },

  execute(ctx) {
    window.gtag('config', '${conversionId}')
  },
})
`;
}
