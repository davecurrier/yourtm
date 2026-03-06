/**
 * YourTM Trigger System
 * High-performance trigger handlers using modern browser APIs
 */

import { executeTrigger } from './core';
import { onEvent as onDL, push, get as dlGet } from './dataLayer';

export type TriggerType = 'pageview' | 'click' | 'scroll' | 'timer' | 'visibility' | 'custom' | 'domReady' | 'windowLoad' | 'formSubmit';

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
  operator: 'equals' | 'contains' | 'matches' | 'exists' | 'gt' | 'lt';
  value?: string | number | boolean;
}

const cleanups = new Map<string, () => void>();
let inited = false;

export function initTriggers(triggers: TriggerConfig[]): void {
  if (inited) return;
  inited = true;
  for (const t of triggers) registerTrigger(t);
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
    formSubmit: setupFormSubmit
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
  if (t.conditions && !checkConds(t.conditions)) return;
  push({ event: `ytm.trigger.${t.id}`, 'ytm.triggerId': t.id, 'ytm.triggerType': t.type });
  await executeTrigger(t.id, ctx);
}

function checkConds(conds: TriggerCondition[]): boolean {
  for (const c of conds) {
    const v = dlGet(c.variable);
    switch (c.operator) {
      case 'equals': if (v !== c.value) return false; break;
      case 'contains': if (typeof v !== 'string' || !v.includes(String(c.value))) return false; break;
      case 'matches': if (typeof v !== 'string' || !new RegExp(String(c.value)).test(v)) return false; break;
      case 'exists': if (v == null) return false; break;
      case 'gt': if (typeof v !== 'number' || v <= Number(c.value)) return false; break;
      case 'lt': if (typeof v !== 'number' || v >= Number(c.value)) return false; break;
    }
  }
  return true;
}

function setupPageview(t: TriggerConfig): () => void {
  const id = setTimeout(() => fire(t), 0);
  return () => clearTimeout(id);
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
