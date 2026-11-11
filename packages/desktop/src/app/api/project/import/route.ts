import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { getProjectPath } from '@/lib/project-config';

/**
 * Slugify a string to create valid file/identifier names
 */
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Sanitize identifier for JS variable names
 */
function sanitizeIdentifier(name: string): string {
  let id = name.replace(/-/g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^[0-9]/.test(id)) {
    id = '_' + id;
  }
  return id;
}

/**
 * GTM built-in trigger IDs
 */
const GTM_BUILTIN_TRIGGERS: Record<string, { name: string; type: string }> = {
  '2147479553': { name: 'All Pages', type: 'PAGEVIEW' },
  '2147479572': { name: 'Consent Initialization', type: 'CONSENT_INIT' },
  '2147479573': { name: 'Initialization', type: 'INIT' },
};

interface ImportResult {
  success: boolean;
  imported: {
    tags: number;
    triggers: number;
    variables: number;
    zones: number;
  };
  skipped: {
    tags: number;
    triggers: number;
    variables: number;
  };
  errors: string[];
  warnings: string[];
}

/**
 * POST /api/project/import - Import GTM container
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { gtmJson } = body;

    if (!gtmJson) {
      return NextResponse.json(
        { error: 'Missing gtmJson parameter' },
        { status: 400 }
      );
    }

    const gtm = typeof gtmJson === 'string' ? JSON.parse(gtmJson) : gtmJson;
    const containerVersion = gtm.containerVersion;

    if (!containerVersion) {
      return NextResponse.json(
        { error: 'Invalid GTM export: missing containerVersion' },
        { status: 400 }
      );
    }

    const result: ImportResult = {
      success: true,
      imported: { tags: 0, triggers: 0, variables: 0, zones: 0 },
      skipped: { tags: 0, triggers: 0, variables: 0 },
      errors: [],
      warnings: [],
    };

    const triggerMap = new Map<string, string>(); // GTM trigger ID -> slugified name
    const variableMap = new Map<string, string>(); // GTM var name -> slugified name
    const createdBuiltinTriggers = new Set<string>();

    // Pre-populate with built-in triggers
    for (const [id, info] of Object.entries(GTM_BUILTIN_TRIGGERS)) {
      triggerMap.set(id, slugify(info.name));
    }

    // 1. Import Variables
    if (containerVersion.variable) {
      for (const v of containerVersion.variable) {
        try {
          const content = generateVariable(v);
          const id = slugify(v.name);
          variableMap.set(v.name, id);
          await writeToProject('variables', `${id}.ts`, content);
          result.imported.variables++;
        } catch (err) {
          result.warnings.push(`Variable "${v.name}": ${err instanceof Error ? err.message : 'Unknown error'}`);
          result.skipped.variables++;
        }
      }
    }

    // 2. Import Triggers
    if (containerVersion.trigger) {
      for (const t of containerVersion.trigger) {
        try {
          const content = generateTrigger(t);
          const id = slugify(t.name);
          triggerMap.set(t.triggerId, id);
          await writeToProject('triggers', `${id}.ts`, content);
          result.imported.triggers++;
        } catch (err) {
          result.warnings.push(`Trigger "${t.name}": ${err instanceof Error ? err.message : 'Unknown error'}`);
          result.skipped.triggers++;
        }
      }
    }

    // 3. Import Tags
    if (containerVersion.tag) {
      for (const tag of containerVersion.tag) {
        try {
          // Create any needed built-in triggers
          const triggerIds = tag.firingTriggerId || [];
          for (const tid of triggerIds) {
            if (GTM_BUILTIN_TRIGGERS[tid] && !createdBuiltinTriggers.has(tid)) {
              const info = GTM_BUILTIN_TRIGGERS[tid];
              const content = generateBuiltinTrigger(info);
              await writeToProject('triggers', `${slugify(info.name)}.ts`, content);
              createdBuiltinTriggers.add(tid);
            }
          }

          const content = await generateTag(tag, triggerMap);
          const id = slugify(tag.name);
          await writeToProject('tags', `${id}.ts`, content);
          result.imported.tags++;
        } catch (err) {
          result.warnings.push(`Tag "${tag.name}": ${err instanceof Error ? err.message : 'Unknown error'}`);
          result.skipped.tags++;
        }
      }
    }

    // Create a default global zone
    const globalZone = `import { defineZone } from '@yourtm/core'

export default defineZone({
  name: 'global',
  description: 'Global zone - matches all pages',
  patterns: ['*'],
})
`;
    await writeToProject('zones', 'global.ts', globalZone);
    result.imported.zones = 1;

    return NextResponse.json(result);
  } catch (error) {
    console.error('Import failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    );
  }
}

/**
 * Write a file to the project directory
 */
async function writeToProject(type: string, filename: string, content: string): Promise<void> {
  const projectPath = await getProjectPath();
  const baseDir = join(projectPath, `yourtm/${type}`);
  const fullPath = join(baseDir, filename);

  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content);
}

/**
 * Generate a YourTM variable from GTM variable
 */
function generateVariable(gtmVar: any): string {
  const id = slugify(gtmVar.name);
  const safeId = sanitizeIdentifier(id);

  let type = 'defineVariable';
  let configStr = '';
  let imports = ['defineVariable'];

  switch (gtmVar.type) {
    case 'v': // Data Layer Variable
      type = 'defineDataLayerVariable';
      imports = ['defineDataLayerVariable'];
      const path = gtmVar.parameter?.find((p: any) => p.key === 'name')?.value || '';
      configStr = `path: '${path}'`;
      break;

    case 'c': // Constant
      type = 'defineConstantVariable';
      imports = ['defineConstantVariable'];
      const constValue = gtmVar.parameter?.find((p: any) => p.key === 'value')?.value || '';
      configStr = `value: '${constValue.replace(/'/g, "\\'")}'`;
      break;

    case 'k': // Cookie
      type = 'defineCookieVariable';
      imports = ['defineCookieVariable'];
      const cookieName = gtmVar.parameter?.find((p: any) => p.key === 'name')?.value || '';
      configStr = `cookieName: '${cookieName}'`;
      break;

    case 'jsm': // Custom JavaScript
      type = 'defineJavaScriptVariable';
      imports = ['defineJavaScriptVariable'];
      const jsCode = gtmVar.parameter?.find((p: any) => p.key === 'javascript')?.value || '';
      configStr = `resolve: (ctx) => {\n    ${convertGTMRefs(extractFunctionBody(jsCode))}\n  }`;
      break;

    default:
      type = 'defineVariable';
      imports = ['defineVariable'];
      configStr = `type: '${gtmVar.type}',\n  resolve: (ctx) => {\n    // TODO: Implement\n    return undefined;\n  }`;
  }

  return `import { ${imports.join(', ')} } from '@yourtm/core'

export const ${safeId} = ${type}({
  name: '${gtmVar.name.replace(/'/g, "\\'")}',
  ${configStr}
})

export default ${safeId}
`;
}

/**
 * Generate a YourTM trigger from GTM trigger
 */
function generateTrigger(gtmTrigger: any): string {
  const id = slugify(gtmTrigger.name);

  let type = 'defineTrigger';
  let configLines: string[] = [];
  let imports = ['defineTrigger'];

  switch (gtmTrigger.type) {
    case 'PAGEVIEW':
      type = 'definePageviewTrigger';
      imports = ['definePageviewTrigger'];
      break;

    case 'DOM_READY':
      type = 'defineDOMReadyTrigger';
      imports = ['defineDOMReadyTrigger'];
      break;

    case 'CLICK':
    case 'LINK_CLICK':
      type = 'defineClickTrigger';
      imports = ['defineClickTrigger'];
      break;

    case 'CUSTOM_EVENT':
      type = 'defineCustomEventTrigger';
      imports = ['defineCustomEventTrigger'];
      const eventName = gtmTrigger.parameter?.find((p: any) => p.key === 'eventName')?.value;
      if (eventName) {
        configLines.push(`eventName: '${eventName}'`);
      }
      break;

    default:
      type = 'defineTrigger';
      imports = ['defineTrigger'];
      configLines.push(`type: '${gtmTrigger.type}'`);
  }

  const configStr = configLines.length > 0 ? `\n  ${configLines.join(',\n  ')},` : '';

  return `import { ${imports.join(', ')} } from '@yourtm/core'

export default ${type}({
  id: '${id}',
  name: '${gtmTrigger.name.replace(/'/g, "\\'")}',${configStr}
})
`;
}

/**
 * Generate a built-in trigger
 */
function generateBuiltinTrigger(info: { name: string; type: string }): string {
  const id = slugify(info.name);
  let type = 'defineTrigger';
  let imports = ['defineTrigger'];

  switch (info.type) {
    case 'PAGEVIEW':
      type = 'definePageviewTrigger';
      imports = ['definePageviewTrigger'];
      break;
    case 'CONSENT_INIT':
      type = 'defineConsentInitTrigger';
      imports = ['defineConsentInitTrigger'];
      break;
    case 'INIT':
      type = 'defineInitTrigger';
      imports = ['defineInitTrigger'];
      break;
  }

  return `import { ${imports.join(', ')} } from '@yourtm/core'

// GTM Built-in Trigger
export default ${type}({
  id: '${id}',
  name: '${info.name}',
})
`;
}

/**
 * Generate a YourTM tag from GTM tag
 */
async function generateTag(gtmTag: any, triggerMap: Map<string, string>): Promise<string> {
  const triggerIds = gtmTag.firingTriggerId || [];
  const triggers = triggerIds.map((tid: string) => triggerMap.get(tid) || tid);

  let executeBody: string;

  /*
   * Ask the shared vendor library first for anything the branches below do not
   * cover.
   *
   * This importer only ever handled html, gaawc and gaawe directly, while
   * packages/cli/src/vendors knows sixteen GTM tag types plus custom templates
   * — Meta, LinkedIn, Microsoft UET, Google Ads, the modern googtag, HubSpot,
   * Hotjar, TikTok and more. It was simply never wired up, so a real container
   * arrived with most of its tags stubbed "Manual implementation required": 11
   * of 23 on the reference export, including both Google Tags.
   */
  let vendorBody: string | null = null;
  if (gtmTag.type !== 'html') {
    try {
      const { detectVendor } = await import('@yourtm/cli');
      const detected = detectVendor(gtmTag);
      if (detected?.code) {
        vendorBody = `// ${detected.description || detected.vendor}\n${convertGTMRefs(detected.code)}`;
      }
    } catch {
      // Library unavailable: fall through to the local branches.
    }
  }

  if (gtmTag.type === 'html') {
    const html = gtmTag.parameter?.find((p: any) => p.key === 'html')?.value || '';
    executeBody = `// Custom HTML Tag - Review and optimize manually
    const div = document.createElement('div');
    div.innerHTML = \`${convertGTMRefs(html.replace(/`/g, '\\`').replace(/\$\{/g, '\\${'), true)}\`;
    const scripts = div.querySelectorAll('script');
    scripts.forEach(script => {
      const newScript = document.createElement('script');
      if (script.src) {
        newScript.src = script.src;
        newScript.async = true;
      } else {
        newScript.textContent = script.textContent;
      }
      document.head.appendChild(newScript);
    });`;
  } else if (gtmTag.type === 'gaawc') {
    // GA4 Config tag
    const measurementId = gtmTag.parameter?.find((p: any) => p.key === 'measurementId')?.value || '';
    executeBody = `// GA4 Configuration
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }

    const script = document.createElement('script');
    script.src = 'https://www.googletagmanager.com/gtag/js?id=${measurementId}';
    script.async = true;
    document.head.appendChild(script);

    gtag('js', new Date());
    gtag('config', '${measurementId}');`;
  } else if (gtmTag.type === 'gaawe') {
    // GA4 Event tag
    const eventName = gtmTag.parameter?.find((p: any) => p.key === 'eventName')?.value || '';
    executeBody = `// GA4 Event
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    gtag('event', '${eventName}', {
      // TODO: Add event parameters
    });`;
  } else if (vendorBody) {
    executeBody = vendorBody;
  } else {
    executeBody = `// Unrecognized GTM tag type: ${gtmTag.type}
// No vendor implementation matched. Add the code by hand, or add a detector
// for this type in packages/cli/src/vendors/index.ts.`;
  }

  return `import { defineTag } from '@yourtm/core'

/**
 * ${gtmTag.name}
 * Imported from GTM tag type: ${gtmTag.type}
 */
export default defineTag({
  name: '${gtmTag.name.replace(/'/g, "\\'")}',
  type: 'script',
  triggers: ${JSON.stringify(triggers)},
  zones: ['global'],
  code: \`
${indentBody(executeBody)}
  \`
})
`;
}

/**
 * Extract function body from GTM Custom JS
 */
/**
 * Prepare a tag body for embedding in a template literal.
 *
 * Tags are emitted as `code:` strings rather than `execute(ctx) {}` methods.
 * A method looks natural but is invisible to the app: the project reader drops
 * function values, so every imported tag showed an empty code editor — and
 * worse, typing into it wrote a `code:` property that the compiler ignores,
 * because it resolves `tag.execute || tag.code` and the method wins. The edit
 * silently did nothing. A string is what the editor reads and writes, and what
 * hand-authored tags have always used.
 */
function indentBody(body: string): string {
  const escaped = body
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
  return reindent(escaped)
    .split('\n')
    .map(line => (line.trim() ? `    ${line}` : line))
    .join('\n');
}

/**
 * Strip the accidental indentation these bodies are authored with.
 *
 * Each body is written as a TypeScript template literal whose first line sits
 * flush against the backtick while the rest inherit the source file's
 * indentation. Emitted verbatim that produces a first line at column 0 and
 * every following line indented — and because the editor dedents by the
 * *smallest* indent present, that zero-indent first line means nothing is
 * stripped and the whole block renders ragged.
 *
 * Measuring the common indent while ignoring the first line, then removing it,
 * gives a body that is uniform before the caller applies its own indentation.
 */
function reindent(body: string): string {
  const lines = body.split('\n');
  if (lines.length < 2) return body.trim();

  const rest = lines.slice(1).filter(l => l.trim());
  if (rest.length === 0) return body.trim();

  const common = Math.min(...rest.map(l => l.match(/^[ \t]*/)?.[0].length ?? 0));
  if (common === 0) return lines.map(l => l.trimEnd()).join('\n').trim();

  return [lines[0].trim(), ...lines.slice(1).map(l => l.slice(common).trimEnd())]
    .join('\n')
    .trim();
}

/**
 * Convert GTM `{{Variable Name}}` references into runtime lookups.
 *
 * Left unconverted these are a syntax error inside a JS body, and dead
 * placeholder text inside tag HTML — the exact failure mode that left the
 * hand-written vital-tag container shipping literal `{{ga4-stream}}` strings.
 *
 * @param inTemplate true when the result is embedded in a template literal
 *                   (tag HTML) and must interpolate with ${...}.
 */
function convertGTMRefs(code: string, inTemplate = false): string {
  const lookup = (rawName: string) => `ctx.variables['${slugify(rawName.trim())}']`;

  if (inTemplate) {
    // Inside a template literal the interpolation supplies the value; any
    // surrounding quotes in the original HTML/JS stay as-is and remain correct.
    return code.replace(/\{\{([^}]+)\}\}/g, (_m, name: string) => '${' + lookup(name) + '}');
  }

  // In a plain JS body, a quoted reference — var u = '{{Page URL}}' — must
  // consume its own quotes, or we emit 'ctx.variables['page-url']' and break
  // the file with nested quotes.
  return code
    .replace(/'\{\{([^}]+)\}\}'/g, (_m, name: string) => lookup(name))
    .replace(/"\{\{([^}]+)\}\}"/g, (_m, name: string) => lookup(name))
    .replace(/\{\{([^}]+)\}\}/g, (_m, name: string) => lookup(name));
}

/**
 * Unwrap a GTM Custom JavaScript variable, which is always a complete
 * `function () { ... return value }` expression.
 *
 * The previous regex anchored on `^function`, so any leading comment — which
 * GTM authors write constantly — stopped it matching and the whole expression
 * was pasted verbatim into an arrow body. That produced an anonymous function
 * *declaration*, which is a syntax error, and the file failed to compile.
 * Leading comments are now skipped before matching, and preserved above the
 * unwrapped body so the author's notes are not lost.
 */
function extractFunctionBody(jsCode: string): string {
  const source = jsCode.trim();

  // Consume leading line and block comments plus blank lines.
  let i = 0;
  const leading: string[] = [];
  while (i < source.length) {
    const rest = source.slice(i);
    const line = rest.match(/^[ \t]*\/\/[^\n]*\n?/);
    if (line) { leading.push(line[0].trimEnd()); i += line[0].length; continue; }
    const block = rest.match(/^[ \t]*\/\*[\s\S]*?\*\/\s*/);
    if (block) { leading.push(block[0].trimEnd()); i += block[0].length; continue; }
    const blank = rest.match(/^\s+/);
    if (blank) { i += blank[0].length; continue; }
    break;
  }

  const body = source.slice(i);
  const funcMatch = body.match(/^function\s*\w*\s*\([^)]*\)\s*\{([\s\S]*)\}$/);
  if (!funcMatch) return source;

  const comments = leading.filter(Boolean).join('\n');
  const inner = funcMatch[1].trim();
  return comments ? `${comments}\n${inner}` : inner;
}
