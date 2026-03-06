import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { loadConfig, findConfigFile, type YourTMConfig } from '../utils/config.js';
import { slugify } from '../templates/utils.js';

interface ImportOptions {
  output?: string;
  force?: boolean;
}

export async function importCommand(
  source: string,
  filePath: string,
  options: ImportOptions = {}
): Promise<void> {
  if (source !== 'gtm') {
    logger.error(`Unsupported import source: ${source}. Currently only 'gtm' is supported.`);
    process.exit(1);
  }

  const cwd = process.cwd();
  logger.header(`Importing from ${source.toUpperCase()}`);
  logger.newline();

  if (!existsSync(filePath)) {
    logger.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const config = await loadConfig(cwd).catch(() => null);
  const importer = new GtmImporter(config, cwd, options);
  
  try {
    await importer.import(filePath);
  } catch (error) {
    logger.error(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

class GtmImporter {
  private config: YourTMConfig | null;
  private cwd: string;
  private options: ImportOptions;
  private triggerMap = new Map<string, string>(); // GTM ID -> Slugified ID
  private variableMap = new Map<string, string>(); // GTM Name -> Slugified ID

  constructor(config: YourTMConfig | null, cwd: string, options: ImportOptions) {
    this.config = config;
    this.cwd = cwd;
    this.options = options;
  }

  async import(filePath: string): Promise<void> {
    const spinner = ora('Reading GTM export file...').start();
    const rawJson = await readFile(filePath, 'utf-8');
    const gtm = JSON.parse(rawJson);
    spinner.succeed('GTM export file loaded');

    const containerVersion = gtm.containerVersion;
    if (!containerVersion) {
      throw new Error('Invalid GTM export: missing containerVersion');
    }

    const { variable, trigger, tag } = containerVersion;

    // 1. Process Variables
    if (variable) {
      spinner.start(`Importing ${variable.length} variables...`);
      for (const v of variable) {
        await this.importVariable(v);
      }
      spinner.succeed(`Imported ${variable.length} variables`);
    }

    // 2. Process Triggers
    if (trigger) {
      spinner.start(`Importing ${trigger.length} triggers...`);
      for (const t of trigger) {
        await this.importTrigger(t);
      }
      spinner.succeed(`Imported ${trigger.length} triggers`);
    }

    // 3. Process Tags
    if (tag) {
      spinner.start(`Importing ${tag.length} tags...`);
      for (const t of tag) {
        await this.importTag(t);
      }
      spinner.succeed(`Imported ${tag.length} tags`);
    }

    logger.newline();
    logger.success('Import complete!');
    logger.info(`Generated files in ${chalk.cyan(relative(this.cwd, this.config?.tagsDir || 'yourtm/'))}`);
  }

  private async importVariable(gtmVar: any): Promise<void> {
    const id = slugify(gtmVar.name);
    this.variableMap.set(gtmVar.name, id);

    let type = 'custom';
    let configStr = '';

    switch (gtmVar.type) {
      case 'v': // Data Layer
        type = 'defineDataLayerVariable';
        const path = gtmVar.parameter.find((p: any) => p.key === 'name')?.value;
        configStr = `path: '${path}'`;
        break;
      case 'c': // Cookie
        type = 'defineCookieVariable';
        const cookieName = gtmVar.parameter.find((p: any) => p.key === 'name')?.value;
        configStr = `cookieName: '${cookieName}'`;
        break;
      case 'u': // URL
        type = 'defineURLVariable';
        const component = gtmVar.parameter.find((p: any) => p.key === 'component')?.value;
        configStr = `part: '${component.toLowerCase()}'`;
        break;
      case 'jsm': // Custom JS
        type = 'defineComputedVariable';
        const jsCode = gtmVar.parameter.find((p: any) => p.key === 'javascript')?.value;
        configStr = `compute: (ctx) => {
    ${jsCode}
  }`;
        break;
      default:
        type = 'defineVariable';
        configStr = `type: '${gtmVar.type}', // Unmapped GTM type`;
    }

    const content = `import { ${type} } from '@yourtm/core'

export const ${id.replace(/-/g, '_')} = ${type}({
  name: '${gtmVar.name}',
  ${configStr}
})
`;

    await this.writeFile('variables', `${id}.ts`, content);
  }

  private async importTrigger(gtmTrigger: any): Promise<void> {
    const id = slugify(gtmTrigger.name);
    this.triggerMap.set(gtmTrigger.triggerId, id);

    let type = 'defineTrigger';
    let typeKey = 'custom';
    let config: any = {};

    switch (gtmTrigger.type) {
      case 'PAGEVIEW':
        type = 'definePageviewTrigger';
        typeKey = 'pageview';
        break;
      case 'CLICK':
        type = 'defineClickTrigger';
        typeKey = 'click';
        config.selector = '*'; // Needs manual refinement
        break;
      case 'SCROLL_DEPTH':
        type = 'defineScrollTrigger';
        typeKey = 'scroll';
        break;
    }

    const content = `import { ${type} } from '@yourtm/core'

export default ${type}({
  name: '${gtmTrigger.name}',
  ${type !== 'defineTrigger' ? '' : `type: '${typeKey}',`}
  ${Object.keys(config).length > 0 ? `config: ${JSON.stringify(config, null, 2)},` : ''}
})
`;

    await this.writeFile('triggers', `${id}.ts`, content);
  }

  private async importTag(gtmTag: any): Promise<void> {
    const id = slugify(gtmTag.name);
    const triggers = (gtmTag.firingTriggerId || []).map((tid: string) => this.triggerMap.get(tid) || tid);
    
    let executeBody = '// Manual implementation required';
    
    if (gtmTag.type === 'html') {
      const html = gtmTag.parameter.find((p: any) => p.key === 'html')?.value || '';
      executeBody = `// Custom HTML Tag
    const script = document.createElement('script');
    script.text = `${html.replace(/`/g, '`')}`;
    document.head.appendChild(script);`;
    } else if (gtmTag.type === 'gaawe') {
      executeBody = `// GA4 Event
    // Measurement ID: ${gtmTag.parameter.find((p: any) => p.key === 'measurementId')?.value}`;
    }

    const content = `import { defineTag } from '@yourtm/core'

export default defineTag({
  name: '${gtmTag.name}',
  triggers: ${JSON.stringify(triggers)},
  zones: ['global'],
  execute(ctx) {
    ${executeBody}
  }
})
`;

    await this.writeFile('tags', `${id}.ts`, content);
  }

  private async writeFile(type: string, filename: string, content: string): Promise<void> {
    const baseDir = this.config?.[`${type}Dir` as keyof YourTMConfig] as string || join(this.cwd, `yourtm/${type}`);
    const fullPath = join(baseDir, filename);
    
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }
}
