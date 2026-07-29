import { Project, SyntaxKind } from 'ts-morph';

/**
 * Edit one property of the object literal passed to a define*() call.
 * Pure string in -> string out, so the host needs no filesystem.
 */
globalThis.ytmEditAsset = function (source, assetId, updatesJson) {
  const updates = JSON.parse(updatesJson);
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile('asset.ts', source);

  const call = file.getFirstDescendant(
    (n) => n.getKind() === SyntaxKind.CallExpression &&
           /^define/.test(n.getExpression?.().getText?.() ?? '')
  );
  if (!call) return JSON.stringify({ error: 'no define*() call found' });

  const obj = call.getArguments()[0];
  if (!obj || obj.getKind() !== SyntaxKind.ObjectLiteralExpression) {
    return JSON.stringify({ error: 'first argument is not an object literal' });
  }

  for (const [key, value] of Object.entries(updates)) {
    const literal = typeof value === 'string' && value.includes('\n')
      ? '`' + value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`'
      : JSON.stringify(value);
    const existing = obj.getProperty(key);
    if (existing) existing.setInitializer(literal);
    else obj.addPropertyAssignment({ name: key, initializer: literal });
  }
  return JSON.stringify({ code: file.getFullText() });
};
