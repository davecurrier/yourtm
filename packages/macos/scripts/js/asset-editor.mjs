import { Project, SyntaxKind } from 'ts-morph';

/**
 * TypeScript source editing for the Mac app, run inside JavaScriptCore.
 *
 * This is a faithful port of `updateAssetProperties()` in
 * packages/desktop/src/lib/project-service.ts. Keep the two in step until the
 * engine is deleted — the differences that matter are subtle and produce files
 * that look plausible while being wrong:
 *
 *  - Keys NOT in the standard set for an asset kind get nested under `config`
 *    (triggers) or `settings` (everything else). Writing them at the top level
 *    instead silently changes the asset's shape.
 *  - `formatText()` runs before the text is returned, so output matches what
 *    ts-morph would have saved.
 *  - Multi-line strings become escaped template literals; anything else uses
 *    JSON form. Emitting a raw quoted string here is what corrupted
 *    beacon-analytics.ts once already (22 tags -> 21).
 *  - `id` is never written.
 *
 * Strings in, strings out: no filesystem access, so the host stays in Swift.
 */

const DEFINE_FN = {
  tags: 'defineTag',
  triggers: 'defineTrigger',
  variables: 'defineVariable',
  zones: 'defineZone',
};

/**
 * Properties that stay at the top level of the define*() object. Anything else
 * is nested under `config`/`settings`.
 *
 * `conditions` is added to triggers and zones, which the engine's list omits.
 * It is top-level in 13 of 19 triggers and 1 of 2 zones in the reference
 * container, so without it here an edit would move a live property into
 * `config`, changing the asset's shape while looking like a successful save.
 * (Note the drift it reflects: TriggerDefinition in @yourtm/core declares
 * `config`/`condition`/`extract` and no `conditions`, `event` or `selector` —
 * the sources the GTM importer produced and the core types disagree. Reconciling
 * that is separate work; this list follows the sources, which are what ships.)
 */
const STANDARD_PROPS = {
  tags: ['name', 'description', 'triggers', 'blocking', 'zones', 'consent', 'priority', 'status', 'vendor', 'code'],
  triggers: ['name', 'description', 'type', 'priority', 'enabled', 'event', 'selector', 'conditions'],
  zones: ['name', 'description', 'patterns', 'priority', 'enabled', 'conditions'],
  variables: ['name', 'description', 'type', 'default', 'format', 'value', 'key', 'code'],
};

/** Serialise a JS value to a valid TypeScript initializer. */
function initializerFor(value) {
  if (typeof value === 'string' && value.includes('\n')) {
    return '`' + value
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$\{/g, '\\${') + '`';
  }
  return JSON.stringify(value);
}

/**
 * @param {string} source      current file contents
 * @param {string} kind        'tags' | 'triggers' | 'variables' | 'zones'
 * @param {string} updatesJson JSON object of property -> new value
 * @returns {string} JSON: { code } on success, { error } otherwise
 */
globalThis.ytmEditAsset = function (source, kind, updatesJson) {
  try {
    const updates = JSON.parse(updatesJson);
    const defineFn = DEFINE_FN[kind];
    if (!defineFn) return JSON.stringify({ error: `unknown asset kind: ${kind}` });

    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile('asset.ts', source);

    const call = file
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((c) => c.getExpression().getText() === defineFn);
    if (!call) return JSON.stringify({ error: `no ${defineFn}() call found` });

    const arg = call.getArguments()[0];
    if (!arg || arg.getKind() !== SyntaxKind.ObjectLiteralExpression) {
      return JSON.stringify({ error: `${defineFn}() argument is not an object literal` });
    }

    const standards = STANDARD_PROPS[kind] || [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id') continue;

      let target = arg;
      if (!standards.includes(key)) {
        const nestKey = kind === 'triggers' ? 'config' : 'settings';
        let nestProp = arg.getProperty(nestKey);
        if (!nestProp) {
          arg.addPropertyAssignment({ name: nestKey, initializer: '{}' });
          nestProp = arg.getProperty(nestKey);
        }
        const nestObj = nestProp
          ?.asKind(SyntaxKind.PropertyAssignment)
          ?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
        if (nestObj) target = nestObj;
      }

      const initializer = initializerFor(value);
      const existing = target.getProperty(key);
      if (existing) existing.set({ initializer });
      else target.addPropertyAssignment({ name: key, initializer });
    }

    file.formatText();
    return JSON.stringify({ code: file.getFullText() });
  } catch (error) {
    return JSON.stringify({ error: String((error && error.message) || error) });
  }
};
