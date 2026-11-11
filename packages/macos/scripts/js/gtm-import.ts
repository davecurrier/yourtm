import { detectVendor } from '@yourtm/cli';

/**
 * GTM import, run inside JavaScriptCore.
 *
 * The generators are lifted verbatim from the engine's import route rather than
 * retranscribed: they are several hundred lines of string templating where a
 * quietly dropped escape produces a file that looks right and fails to compile.
 * Swift keeps the filesystem; this keeps the string work, exactly as ts-morph
 * keeps the TypeScript editing.
 *
 * Returns files to write rather than writing them, so the host decides where
 * they land and nothing here needs a filesystem.
 */
/**
 * GTM built-in trigger IDs
 */
const GTM_BUILTIN_TRIGGERS: Record<string, { name: string; type: string }> = {
  '2147479553': { name: 'All Pages', type: 'PAGEVIEW' },
  '2147479572': { name: 'Consent Initialization', type: 'CONSENT_INIT' },
  '2147479573': { name: 'Initialization', type: 'INIT' },
};

/**
 * GTM built-in variable references, as they appear on the left of a filter,
 * mapped to the names the runtime's builtinVar() answers to.
 */
const GTM_BUILTIN_VARS: Record<string, string> = {
  'Page URL': 'page-url',
  'Page Hostname': 'page-hostname',
  'Page Path': 'page-path',
  'Referrer': 'referrer',
  'Click Element': 'click-element',
  'Click Classes': 'click-classes',
  'Click ID': 'click-id',
  'Click Text': 'click-text',
  'Click URL': 'click-url',
  'Form Element': 'form-element',
  'Form Classes': 'form-classes',
  'Form ID': 'form-id',
};

/** GTM filter operators the runtime's checkConds() can evaluate. */
const GTM_OPERATORS: Record<string, string> = {
  EQUALS: 'equals',
  CONTAINS: 'contains',
  MATCH_REGEX: 'matches',
  STARTS_WITH: 'startsWith',
  ENDS_WITH: 'endsWith',
  CSS_SELECTOR: 'selector',
  GREATER: 'gt',
  LESS: 'lt',
};

/**
 * GTM trigger type -> the core helper that stamps the right runtime type.
 *
 * Only types the runtime actually dispatches on appear here. Anything missing
 * is reported as a warning rather than emitted, because a trigger carrying a
 * type no handler recognises is not a partial import — it is a file that looks
 * imported, shows up in the UI, and never fires.
 */
const GTM_TRIGGER_HELPERS: Record<string, string> = {
  PAGEVIEW: 'definePageviewTrigger',
  DOM_READY: 'defineDOMReadyTrigger',
  WINDOW_LOADED: 'defineWindowLoadTrigger',
  CLICK: 'defineClickTrigger',
  LINK_CLICK: 'defineClickTrigger',
  CUSTOM_EVENT: 'defineCustomEventTrigger',
  FORM_SUBMISSION: 'defineFormSubmitTrigger',
  SCROLL_DEPTH: 'defineScrollTrigger',
  TIMER: 'defineTimerTrigger',
  ELEMENT_VISIBILITY: 'defineVisibilityTrigger',
  CONSENT_INIT: 'defineConsentInitTrigger',
  INIT: 'defineInitTrigger',
};

function filterParam(f: any, key: string): string | undefined {
  return f?.parameter?.find((p: any) => p.key === key)?.value;
}

/**
 * Turn GTM filters into runtime conditions.
 *
 * Dropping these is not a cosmetic loss. GTM expresses "fires on university
 * pages" purely as a filter on an otherwise ordinary pageview trigger, so a
 * condition-less import turns eighteen targeted triggers into eighteen triggers
 * that fire on every page — every tag firing everywhere, silently.
 *
 * @param resolveVar maps a `{{Reference}}` to a name the runtime can resolve,
 *                   or null when it cannot be resolved at all.
 */
function conditionsFrom(
  filters: any[],
  resolveVar: (ref: string) => string | null,
  warn: (msg: string) => void,
  label: string
): string[] {
  const out: string[] = [];
  for (const f of filters || []) {
    const arg0 = filterParam(f, 'arg0');
    const arg1 = filterParam(f, 'arg1');
    if (!arg0) continue;
    // {{_event}} is GTM's way of naming the dataLayer event; the runtime
    // matches that through eventName, not through a condition.
    if (arg0.trim() === '{{_event}}') continue;

    const operator = GTM_OPERATORS[f.type];
    if (!operator) {
      warn(`${label}: filter operator "${f.type}" is not supported — condition dropped`);
      continue;
    }
    const variable = resolveVar(arg0);
    if (!variable) {
      warn(`${label}: cannot evaluate "${arg0}" in a condition — condition dropped`);
      continue;
    }
    out.push(`{ variable: ${JSON.stringify(variable)}, operator: '${operator}', value: ${JSON.stringify(arg1 ?? '')} }`);
  }
  return out;
}

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
      // GTM defaults to version 2, which reads the most recent push rather
      // than the merged state. Carry it through so the two agree.
      const dlVersion = gtmVar.parameter?.find((p: any) => p.key === 'dataLayerVersion')?.value;
      configStr = `path: '${path}'`
        + (dlVersion ? `,\n  version: ${Number(dlVersion)}` : '');
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
  id: '${id}',
  name: '${gtmVar.name.replace(/'/g, "\\'")}',
  ${configStr}
})

export default ${safeId}
`;
}

/**
 * Generate a YourTM trigger from GTM trigger
 */
function generateTrigger(
  gtmTrigger: any,
  resolveVar: (ref: string) => string | null,
  warn: (msg: string) => void
): string {
  const id = slugify(gtmTrigger.name);
  const label = `Trigger "${gtmTrigger.name}"`;

  const helper = GTM_TRIGGER_HELPERS[gtmTrigger.type];
  if (!helper) {
    throw new Error(`trigger type "${gtmTrigger.type}" has no runtime equivalent`);
  }

  const configLines: string[] = [];

  if (gtmTrigger.type === 'CUSTOM_EVENT') {
    // GTM keeps the event name in customEventFilter, as an EQUALS against
    // {{_event}} — never in `parameter`. Reading `parameter.eventName` always
    // came back undefined, so setupCustom fell through to `t.eventName || t.id`
    // and every imported trigger listened for its own slug: "gravity-form-
    // submission" instead of the "gform-submit" the site actually pushes.
    const eventName = (gtmTrigger.customEventFilter || [])
      .map((f: any) => filterParam(f, 'arg1'))
      .find((v: string | undefined) => !!v);
    if (eventName) {
      configLines.push(`eventName: ${JSON.stringify(eventName)}`);
    } else {
      warn(`${label}: no dataLayer event name found — it will listen for "${id}"`);
    }
  }

  // autoEventFilter carries the element-scoped conditions for click and form
  // triggers; filter carries everything else. Both become plain conditions.
  const conditions = conditionsFrom(
    [...(gtmTrigger.filter || []), ...(gtmTrigger.autoEventFilter || [])],
    resolveVar, warn, label
  );
  if (conditions.length > 0) {
    configLines.push(`conditions: [\n    ${conditions.join(',\n    ')}\n  ]`);
  }

  const configStr = configLines.length > 0 ? `\n  ${configLines.join(',\n  ')},` : '';

  return `import { ${helper} } from '@yourtm/core'

export default ${helper}({
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
  const helper = GTM_TRIGGER_HELPERS[info.type] ?? 'definePageviewTrigger';

  return `import { ${helper} } from '@yourtm/core'

// GTM Built-in Trigger
export default ${helper}({
  id: '${id}',
  name: '${info.name}',
})
`;
}

/**
 * Generate a YourTM tag from GTM tag
 */
function generateTag(gtmTag: any, triggerMap: Map<string, string>): string {
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
      // Statically imported here; the engine used a dynamic import, which is
      // the only reason this function was async.
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
    // Written flush-left on purpose. The pasted HTML brings its own
    // indentation, usually starting at column 0, so reindent() finds a common
    // indent of zero and leaves every line exactly as written — which would
    // push an indented scaffold four spaces deeper than the HTML beside it.
    executeBody = `// Custom HTML Tag - Review and optimize manually
const div = document.createElement('div');
div.innerHTML = \`${convertGTMRefs(html.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${'), true)}\`;
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
  id: '${slugify(gtmTag.name)}',
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

declare const globalThis: any;

globalThis.ytmImportGTM = function (gtmJson: string): string {
  try {
    const gtm = typeof gtmJson === 'string' ? JSON.parse(gtmJson) : gtmJson;
    const cv = gtm.containerVersion;
    if (!cv) return JSON.stringify({ error: 'Invalid GTM export: missing containerVersion' });

    const files: Array<{ kind: string; filename: string; content: string }> = [];
    const warnings: string[] = [];
    const skipped = { tags: 0, triggers: 0, variables: 0 };

    const triggerMap = new Map<string, string>();
    const createdBuiltins = new Set<string>();
    for (const [id, info] of Object.entries(GTM_BUILTIN_TRIGGERS)) {
      triggerMap.set(id, slugify((info as any).name));
    }

    for (const v of cv.variable || []) {
      try {
        files.push({ kind: 'variables', filename: `${slugify(v.name)}.ts`, content: generateVariable(v) });
      } catch (e: any) { warnings.push(`Variable "${v.name}": ${e?.message || e}`); skipped.variables++; }
    }

    /**
     * Resolve a filter's left-hand `{{Reference}}` to something checkConds()
     * can actually look up.
     *
     * Conditions are evaluated by the runtime against built-ins first and the
     * dataLayer second — there is no access to the compiled variable registry
     * at that point. So a GTM dataLayer variable has to be reduced to the
     * dataLayer key it reads ("Data Layer - Sales Cycle" -> `sales_cycle`), and
     * a computed variable cannot be reduced at all. Returning null for those is
     * deliberate: the condition is dropped with a warning rather than emitted
     * as a lookup that silently resolves to undefined.
     */
    const gtmVariables = new Map<string, any>(
      (cv.variable || []).map((v: any) => [v.name, v])
    );
    const resolveConditionVar = (ref: string): string | null => {
      const name = ref.trim().replace(/^\{\{/, '').replace(/\}\}$/, '').trim();
      if (GTM_BUILTIN_VARS[name]) return GTM_BUILTIN_VARS[name];
      const v = gtmVariables.get(name);
      if (v?.type === 'v') {
        const key = v.parameter?.find((p: any) => p.key === 'name')?.value;
        if (key) return key;
      }
      return null;
    };

    for (const t of cv.trigger || []) {
      try {
        const id = slugify(t.name);
        triggerMap.set(t.triggerId, id);
        files.push({
          kind: 'triggers', filename: `${id}.ts`,
          content: generateTrigger(t, resolveConditionVar, m => warnings.push(m)),
        });
      } catch (e: any) { warnings.push(`Trigger "${t.name}": ${e?.message || e}`); skipped.triggers++; }
    }

    for (const tag of cv.tag || []) {
      try {
        // Built-in triggers are referenced by id and never appear in the
        // export's trigger list, so they are materialised on first use.
        for (const tid of tag.firingTriggerId || []) {
          const info = (GTM_BUILTIN_TRIGGERS as any)[tid];
          if (info && !createdBuiltins.has(tid)) {
            createdBuiltins.add(tid);
            files.push({ kind: 'triggers', filename: `${slugify(info.name)}.ts`,
                         content: generateBuiltinTrigger(info) });
          }
        }
        files.push({ kind: 'tags', filename: `${slugify(tag.name)}.ts`,
                     content: generateTag(tag, triggerMap) });
      } catch (e: any) { warnings.push(`Tag "${tag.name}": ${e?.message || e}`); skipped.tags++; }
    }

    return JSON.stringify({
      files, warnings, skipped,
      containerId: cv.container?.publicId || gtm.publicId || '',
      containerName: cv.container?.name || '',
    });
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message || e) });
  }
};
