/**
 * Capture what a tag did while it ran, for telemetry.
 *
 * Generic on purpose: most vendor tags announce themselves through the
 * dataLayer (gtag() pushes its arguments there) or by adding a script, so a
 * before/after diff of those two shows "what this tag sent" without per-vendor
 * code. Work done later in a callback (a script's onload) is not seen.
 *
 * Telemetry endpoints can be public, so values are redacted by key and by
 * shape, and the whole record is size-capped.
 */
import type { TagExecutionData } from '@yourtm/core';

const MAX_BYTES = 2048;
const MAX_DEPTH = 4;
const MAX_KEYS = 25;
const MAX_STRING = 200;

const SENSITIVE_KEY = /e-?mail|phone|tel(ephone)?$|first.?name|last.?name|full.?name|^name$|address|street|city|postal|zip|user_data|user_provided|sha256|hashed|password|passwd|ssn|birth|dob|card|iban/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
// Phone numbers anywhere in a string: international (+…), (555) 123-4567,
// or 555-123-4567. Shaped so ISO dates and IDs (2026-11-11, G-2JQ…) pass.
const PHONE = /\+\d[\d\s().-]{7,}\d|\(\d{3}\)\s*\d{3}[-.\s]\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g;

export interface TagDataSnapshot {
  dataLayerLength: number;
  scripts: Set<string>;
}

export function snapshot(): TagDataSnapshot {
  const dl = (window as unknown as { dataLayer?: unknown[] }).dataLayer;
  return {
    dataLayerLength: Array.isArray(dl) ? dl.length : 0,
    scripts: new Set(Array.from(document.scripts, s => s.src).filter(Boolean)),
  };
}

export function diff(before: TagDataSnapshot): TagExecutionData | undefined {
  const dl = (window as unknown as { dataLayer?: unknown[] }).dataLayer;
  const pushes = Array.isArray(dl) ? dl.slice(before.dataLayerLength).map(v => clean(v, 0)) : [];
  const scripts = Array.from(document.scripts, s => s.src)
    .filter(src => src && !before.scripts.has(src))
    .map(scriptLabel)
    .slice(0, 5);
  if (pushes.length === 0 && scripts.length === 0) return undefined;

  const data: TagExecutionData = {};
  if (pushes.length) data.pushes = pushes;
  if (scripts.length) data.scripts = scripts;
  // Keep under the cap by dropping the oldest pushes first.
  while (data.pushes?.length && JSON.stringify(data).length > MAX_BYTES) {
    data.pushes.shift();
    data.truncated = true;
  }
  if (data.pushes && data.pushes.length === 0) delete data.pushes;
  return JSON.stringify(data).length > MAX_BYTES ? { truncated: true } : data;
}

function scriptLabel(src: string): string {
  try {
    const u = new URL(src, location.href);
    // Query strings carry IDs worth seeing (gtag/js?id=G-...) but can also
    // carry anything; keep only an `id` parameter.
    const id = u.searchParams.get('id');
    return `${u.host}${u.pathname}${id ? `?id=${id}` : ''}`.slice(0, MAX_STRING);
  } catch {
    return src.slice(0, MAX_STRING);
  }
}

function clean(value: unknown, depth: number, key = ''): unknown {
  if (key && SENSITIVE_KEY.test(key)) return '[redacted]';
  if (value === null || value === undefined) return value ?? null;
  switch (typeof value) {
    case 'string':
      if (EMAIL.test(value)) return '[redacted]';
      {
        const v = value.replace(PHONE, '[redacted]');
        return v.length > MAX_STRING ? v.slice(0, MAX_STRING) + '…' : v;
      }
    case 'number':
    case 'boolean':
      return value;
    case 'function':
      return '[function]';
    case 'object':
      break;
    default:
      return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof Element !== 'undefined' && value instanceof Element) return `[${value.tagName.toLowerCase()}]`;
  if (depth >= MAX_DEPTH) return '[…]';
  // gtag() pushes an Arguments object; show it as the call's argument list.
  const isArgs = Object.prototype.toString.call(value) === '[object Arguments]';
  if (Array.isArray(value) || isArgs) {
    return Array.from(value as ArrayLike<unknown>).slice(0, MAX_KEYS).map(v => clean(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as object).slice(0, MAX_KEYS)) {
    out[k] = clean((value as Record<string, unknown>)[k], depth + 1, k);
  }
  return out;
}
