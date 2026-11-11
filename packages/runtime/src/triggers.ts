/**
 * YourTM Trigger System
 * High-performance trigger handlers using modern browser APIs
 */

import { executeTrigger } from './core';
import { onEvent as onDL, push, get as dlGet } from './dataLayer';
import { builtinVar } from './builtins';

export type TriggerType = 'pageview' | 'click' | 'scroll' | 'timer' | 'visibility' | 'custom' | 'domReady' | 'windowLoad' | 'formSubmit' | 'init' | 'consentInit';

export interface TriggerConfig {
  id: string;
  type: TriggerType;
  conditions?: TriggerCondition[];
  selector?: string;
  threshold?: number;
  interval?: number;
  limit?: number;
  eventName?: string;
  once?: boolean;
}

export interface TriggerCondition {
  variable: string;
  operator: 'equals' | 'contains' | 'matches' | 'exists' | 'gt' | 'lt'
          | 'startsWith' | 'endsWith' | 'selector';
  value?: string | number | boolean;
}

const cleanups = new Map<string, () => void>();
let inited = false;

export function initTriggers(triggers: TriggerConfig[]): void {
  if (inited) return;
  inited = true;
  // GTM ordering, and it matters: consent initialisation runs before
  // initialisation, which runs before everything else. Consent defaults have to
  // be in place before the first tag gets to ask whether it may fire — a
  // Consent Mode default that lands second is the same as no default at all.
  const rank = (t: TriggerConfig) =>
    t.type === 'consentInit' ? 0 : t.type === 'init' ? 1 : 2;
  for (const t of [...triggers].sort((a, b) => rank(a) - rank(b))) registerTrigger(t);
}

export function registerTrigger(t: TriggerConfig): () => void {
  const handlers: Record<TriggerType, (t: TriggerConfig) => (() => void) | null> = {
    pageview: setupPageview,
    click: setupClick,
    scroll: setupScroll,
    timer: setupTimer,
    visibility: setupVisibility,
    custom: setupCustom,
    domReady: setupDomReady,
    windowLoad: setupWindowLoad,
    formSubmit: setupFormSubmit,
    init: setupImmediate,
    consentInit: setupImmediate
  };
  const cleanup = handlers[t.type]?.(t);
  if (cleanup) cleanups.set(t.id, cleanup);
  return () => removeTrigger(t.id);
}

export function removeTrigger(id: string): void {
  cleanups.get(id)?.();
  cleanups.delete(id);
}

export function removeAllTriggers(): void {
  for (const c of cleanups.values()) c();
  cleanups.clear();
  inited = false;
}

async function fire(t: TriggerConfig, ctx: { element?: Element; event?: string } = {}): Promise<void> {
  if (t.conditions && !checkConds(t.conditions, ctx)) return;
  push({ event: `ytm.trigger.${t.id}`, 'ytm.triggerId': t.id, 'ytm.triggerType': t.type });
  await executeTrigger(t.id, ctx);
}

function checkConds(conds: TriggerCondition[], ctx: { element?: Element } = {}): boolean {
  for (const c of conds) {
    // Built-ins win; anything else stays a dataLayer path, as before.
    const builtin = builtinVar(c.variable, ctx);
    const v = builtin !== undefined ? builtin : dlGet(c.variable);
    switch (c.operator) {
      case 'equals': if (v !== c.value) return false; break;
      case 'contains': if (typeof v !== 'string' || !v.includes(String(c.value))) return false; break;
      case 'matches': if (typeof v !== 'string' || !new RegExp(String(c.value)).test(v)) return false; break;
      case 'exists': if (v == null) return false; break;
      case 'gt': if (typeof v !== 'number' || v <= Number(c.value)) return false; break;
      case 'lt': if (typeof v !== 'number' || v >= Number(c.value)) return false; break;
      case 'startsWith': if (typeof v !== 'string' || !v.startsWith(String(c.value))) return false; break;
      case 'endsWith': if (typeof v !== 'string' || !v.endsWith(String(c.value))) return false; break;
      // GTM's CSS_SELECTOR filter, which tests the event's element rather than
      // a string — the only operator whose left side is not text.
      case 'selector':
        if (!(v instanceof Element) || !v.matches(String(c.value))) return false;
        break;
    }
  }
  return true;
}

/**
 * Run `cb` once the container's tags are all registered.
 *
 * A container ships as core.js plus one bundle per zone, and only core.js holds
 * the runtime; the zone bundles call registerTag afterwards. Anything that
 * wants to fire "immediately" therefore has to wait for DOMContentLoaded, which
 * lands after every parser-inserted script has run — firing sooner means firing
 * against an empty registry. If the runtime was injected after that point there
 * is nothing left to wait for.
 */
function onContainerReady(cb: () => void): () => void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cb, { once: true });
    return () => document.removeEventListener('DOMContentLoaded', cb);
  }
  const id = setTimeout(cb, 0);
  return () => clearTimeout(id);
}

/**
 * Fire as early as the container allows.
 *
 * Backs GTM's Initialization and Consent Initialization triggers, which have no
 * event to wait for — being first *is* the semantics. initTriggers() registers
 * them ahead of everything else, and listeners run in the order they were
 * added, so they still reach their tags before any pageview does.
 */
function setupImmediate(t: TriggerConfig): () => void {
  return onContainerReady(() => fire(t));
}

function setupPageview(t: TriggerConfig): () => void {
  return onContainerReady(() => fire(t));
}

function setupClick(t: TriggerConfig): () => void {
  let fired = false;
  const h = (e: MouseEvent) => {
    if (t.once && fired) return;
    const el = e.target as Element;
    if (!el) return;
    const m = t.selector ? el.closest(t.selector) : el;
    if (!m) return;
    fired = true;
    fire(t, { element: m });
  };
  document.addEventListener('click', h, { capture: true, passive: true });
  return () => document.removeEventListener('click', h, { capture: true });
}

function setupScroll(t: TriggerConfig): () => void {
  const th = (t.threshold || 50) / 100;
  let fired = false;
  const marker = document.createElement('div');
  marker.style.cssText = `position:absolute;top:${th * 100}%;left:0;width:1px;height:1px;pointer-events:none;`;

  const add = () => { document.body.style.position = 'relative'; document.body.appendChild(marker); };
  document.body ? add() : document.addEventListener('DOMContentLoaded', add, { once: true });

  const io = new IntersectionObserver(e => {
    if (e[0]?.isIntersecting && !fired) { fired = true; fire(t); if (t.once !== false) io.disconnect(); }
  }, { threshold: 0 });

  const mo = new MutationObserver(() => { if (marker.parentNode) { io.observe(marker); mo.disconnect(); } });
  marker.parentNode ? io.observe(marker) : mo.observe(document.documentElement, { childList: true, subtree: true });

  return () => { io.disconnect(); mo.disconnect(); marker.remove(); };
}

function setupTimer(t: TriggerConfig): () => void {
  const int = t.interval || 1000, lim = t.limit || Infinity;
  let cnt = 0, last = 0, raf: number, run = true;
  const tick = (ts: number) => {
    if (!run) return;
    if (ts - last >= int && cnt < lim) { fire(t); cnt++; last = ts; }
    if (cnt < lim) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { run = false; cancelAnimationFrame(raf); };
}

function setupVisibility(t: TriggerConfig): () => void {
  if (!t.selector) return () => {};
  const th = t.threshold || 0.5;
  let fired = false;
  const io = new IntersectionObserver(e => {
    for (const en of e) {
      if (en.isIntersecting && en.intersectionRatio >= th) {
        if (t.once && fired) continue;
        fired = true;
        fire(t, { element: en.target });
      }
    }
  }, { threshold: th });

  const obs = () => document.querySelectorAll(t.selector!).forEach(el => io.observe(el));
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', obs, { once: true }) : obs();
  return () => io.disconnect();
}

function setupCustom(t: TriggerConfig): () => void {
  const name = t.eventName || t.id;
  let fired = false;
  return onDL(e => {
    if (e.event === name) {
      if (t.once && fired) return;
      fired = true;
      fire(t, { event: name });
    }
  });
}

function setupDomReady(t: TriggerConfig): () => void {
  if (document.readyState !== 'loading') { setTimeout(() => fire(t), 0); return () => {}; }
  const h = () => fire(t);
  document.addEventListener('DOMContentLoaded', h, { once: true });
  return () => document.removeEventListener('DOMContentLoaded', h);
}

function setupWindowLoad(t: TriggerConfig): () => void {
  if (document.readyState === 'complete') { setTimeout(() => fire(t), 0); return () => {}; }
  const h = () => fire(t);
  window.addEventListener('load', h, { once: true });
  return () => window.removeEventListener('load', h);
}

function setupFormSubmit(t: TriggerConfig): () => void {
  let fired = false;
  const h = (e: SubmitEvent) => {
    if (t.once && fired) return;
    const f = e.target as HTMLFormElement;
    if (!f || (t.selector && !f.matches(t.selector))) return;
    fired = true;
    fire(t, { element: f, event: 'formSubmit' });
  };
  document.addEventListener('submit', h, { capture: true });
  return () => document.removeEventListener('submit', h, { capture: true });
}

export function fireEvent(name: string, data: Record<string, unknown> = {}): void {
  push({ event: name, ...data });
}
