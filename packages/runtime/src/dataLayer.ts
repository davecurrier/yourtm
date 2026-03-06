/**
 * YourTM DataLayer Management
 * GTM-compatible push/get API with event queue and variable resolution
 */

export type DataLayerValue = string | number | boolean | null | undefined | object | DataLayerValue[];
export interface DataLayerEvent { event?: string; [key: string]: DataLayerValue; }
export type DataLayerCallback = (event: DataLayerEvent) => void;

// Internal state
const listeners: DataLayerCallback[] = [];
let store: Record<string, DataLayerValue> = {};

/**
 * Initialize the dataLayer on window
 */
export function initDataLayer(): void {
  const w = window as unknown as { dataLayer: DataLayerEvent[] };
  const existing = w.dataLayer ? [...w.dataLayer] : [];
  const arr: DataLayerEvent[] = [];

  // Override push to intercept events
  arr.push = function (...items: DataLayerEvent[]): number {
    for (const item of items) {
      for (const [k, v] of Object.entries(item)) {
        if (k !== 'event') setNested(store, k, v);
      }
      for (const l of listeners) { try { l(item); } catch {} }
    }
    return Array.prototype.push.apply(this, items);
  };

  w.dataLayer = arr;
  for (const e of existing) arr.push(e);
}

/**
 * Push an event to the dataLayer
 */
export function push(event: DataLayerEvent): void {
  (window as unknown as { dataLayer: DataLayerEvent[] }).dataLayer?.push(event);
}

/**
 * Get a value from the dataLayer using dot notation
 */
export function get(path: string): DataLayerValue {
  const parts = path.split('.');
  let cur: DataLayerValue = store;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = typeof cur === 'object' && !Array.isArray(cur)
      ? (cur as Record<string, DataLayerValue>)[p]
      : Array.isArray(cur) ? cur[parseInt(p, 10)] : undefined;
  }
  return cur;
}

/**
 * Get all data
 */
export function getAll(): Record<string, DataLayerValue> {
  return { ...store };
}

/**
 * Add a listener for dataLayer events
 */
export function onEvent(cb: DataLayerCallback): () => void {
  listeners.push(cb);
  return () => { const i = listeners.indexOf(cb); if (i > -1) listeners.splice(i, 1); };
}

/**
 * Add a listener for a specific event type
 */
export function on(name: string, cb: DataLayerCallback): () => void {
  return onEvent(e => { if (e.event === name) cb(e); });
}

/**
 * Set nested value using dot notation
 */
function setNested(obj: Record<string, DataLayerValue>, path: string, value: DataLayerValue): void {
  const parts = path.split('.');
  if (parts.length === 1) { obj[path] = value; return; }
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!(p in cur) || typeof cur[p] !== 'object' || cur[p] === null) {
      cur[p] = isNaN(parseInt(parts[i + 1], 10)) ? {} : [];
    }
    cur = cur[p] as Record<string, DataLayerValue>;
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * Clear all data (for testing)
 */
export function clear(): void {
  store = {};
  listeners.length = 0;
}

/**
 * Resolve variables in a string template
 */
export function resolve(template: string): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, p) => {
    const v = get(p.trim());
    return v === undefined ? '' : String(v);
  });
}

/**
 * Check if a variable exists
 */
export function has(path: string): boolean {
  return get(path) !== undefined;
}

/**
 * Wait for a variable to be set
 */
export function waitFor(path: string, timeout = 5000): Promise<DataLayerValue> {
  return new Promise((res, rej) => {
    const cur = get(path);
    if (cur !== undefined) { res(cur); return; }
    const timer = setTimeout(() => { unsub(); rej(new Error(`Timeout: ${path}`)); }, timeout);
    const unsub = onEvent(() => {
      const v = get(path);
      if (v !== undefined) { clearTimeout(timer); unsub(); res(v); }
    });
  });
}
