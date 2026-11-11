/**
 * Name-to-slug conversion, shared by the templates and the GTM vendor detectors.
 *
 * Split out of templates/utils.ts so the detectors can be bundled for
 * JavaScriptCore: that module also does template discovery and imports node:fs
 * and node:path, which cannot bundle for a browser-like target. This is the
 * only thing the detectors needed from it.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')      // Remove non-word chars
    .replace(/[\s_-]+/g, '-')      // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, '');      // Remove leading/trailing hyphens
}
