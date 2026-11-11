/**
 * GTM's built-in variables.
 *
 * These have no definition in the container — GTM supplies them, so an import
 * has nothing to emit a file for. But imported code references them exactly
 * like user variables (`ctx.variables['page-url']`, and conditions on
 * `page-url`), so both lookup paths resolve through here.
 *
 * Its own module because triggers.ts and core.ts both need it and importing
 * across those two would close a cycle.
 */

export interface BuiltinContext {
  element?: Element;
}

/** Names resolved here; anything else falls through to the container. */
export function isBuiltinVar(name: string): boolean {
  return BUILTIN_NAMES.has(name);
}

const BUILTIN_NAMES = new Set([
  'page-url', 'page-hostname', 'page-path', 'page-title', 'referrer',
  'click-element', 'click-classes', 'click-id', 'click-text', 'click-url',
  'form-element', 'form-classes', 'form-id',
]);

export function builtinVar(name: string, ctx: BuiltinContext = {}): unknown {
  const el = ctx.element as HTMLElement | undefined;
  switch (name) {
    case 'page-url': return location.href;
    case 'page-hostname': return location.hostname;
    case 'page-path': return location.pathname;
    case 'page-title': return document.title;
    case 'referrer': return document.referrer;
    case 'click-element':
    case 'form-element': return el;
    case 'click-classes':
    case 'form-classes': return el?.className ?? '';
    case 'click-id':
    case 'form-id': return el?.id ?? '';
    case 'click-text': return el?.textContent?.trim().slice(0, 100) ?? '';
    case 'click-url': return (el?.closest('a') as HTMLAnchorElement | null)?.href ?? '';
    default: return undefined;
  }
}

/**
 * Expose the built-ins through a container's resolved variables.
 *
 * Container variables win, so a user variable named `page-url` still shadows
 * the built-in — the import never creates one, but a hand-authored container
 * might, and its author meant it.
 */
export function withBuiltins<T extends object>(
  resolved: T,
  ctx: BuiltinContext = {}
): T & Record<string, unknown> {
  return new Proxy(resolved, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && !(prop in target) && isBuiltinVar(prop)) {
        return builtinVar(prop, ctx);
      }
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      return Reflect.has(target, prop)
        || (typeof prop === 'string' && isBuiltinVar(prop));
    },
  }) as T & Record<string, unknown>;
}
