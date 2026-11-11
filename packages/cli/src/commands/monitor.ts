/**
 * ytm monitor — live tag telemetry in the terminal.
 *
 *   ytm monitor https://yourtm.dev           live: a deployed site's worker
 *   ytm monitor --mode preview               preview: a running `ytm dev`,
 *                                            or the YourTM app's receiver
 *
 * In a terminal it is a full-screen dashboard redrawn in place: an overview of
 * every tag, and a detail view per tag (↑/↓ to select, Enter to open) showing
 * its pages, countries and the data it sent. Piped, logged or with --plain it
 * prints one line per new event; --once prints a single snapshot and exits.
 *
 * Live mode polls the worker's /_ytm/telemetry/events. Every poll is a
 * billable Worker request, so the interval is never below 5 s (the worker's
 * read cache window).
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { logger } from '../utils/logger.js';

const chalk = logger.chalk;

interface MonitorOptions {
  mode?: string;
  filter?: string;
  interval?: string;
  port?: string;
  once?: boolean;
  plain?: boolean;
}

interface TagEvent {
  id: string;
  tagId: string;
  tagName: string;
  status: 'fired' | 'blocked' | 'error';
  latency?: number;
  timestamp: number;
  pageUrl?: string;
  region?: string;
  error?: string;
  trigger?: string;
  zone?: string;
  data?: TagData;
}

/** What a tag did while it ran (see runtime/src/tagData.ts). */
interface TagData {
  pushes?: unknown[];
  scripts?: string[];
  truncated?: boolean;
}

interface Source {
  label: string;
  fetchEvents(): Promise<TagEvent[]>;
}

const MIN_LIVE_INTERVAL_S = 5;
const LIVE_EVENT_LIMIT = 1000;

export async function monitorCommand(url: string | undefined, options: MonitorOptions = {}): Promise<void> {
  const mode = (options.mode || (url ? 'live' : 'preview')).toLowerCase();
  if (mode !== 'live' && mode !== 'preview') {
    logger.error(`Unknown mode "${options.mode}". Use --mode live or --mode preview.`);
    process.exit(1);
  }

  let source: Source;
  let intervalS: number;
  try {
    if (mode === 'live') {
      source = await liveSource(url);
      intervalS = Math.max(MIN_LIVE_INTERVAL_S, Number(options.interval) || MIN_LIVE_INTERVAL_S);
    } else {
      source = await previewSource(Number(options.port) || 3456);
      intervalS = Math.max(1, Number(options.interval) || 2);
    }
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const filter = options.filter?.toLowerCase();
  const keep = (e: TagEvent) => !filter || e.tagName.toLowerCase().includes(filter) || e.tagId.toLowerCase().includes(filter);

  if (options.once) {
    const events = (await source.fetchEvents()).filter(keep);
    console.log(renderOverview(source.label, mode, events, { width: process.stdout.columns || 100, height: Infinity, status: 'snapshot', intervalS }));
    return;
  }

  const interactive = process.stdout.isTTY && !options.plain;
  if (interactive) await runDashboard(source, mode, intervalS, keep);
  else await runPlain(source, intervalS, keep);
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

async function liveSource(urlArg: string | undefined): Promise<Source> {
  const base = normalizeBase(urlArg || deployedWorkerUrl());
  if (!base) {
    throw new Error('Which site? Run `ytm monitor https://your-site.com` (a site whose worker collects YourTM telemetry).');
  }

  // Deployments differ in prefix: /_ytm on custom domains, /ytm on some routes.
  let prefix: string | null = null;
  for (const p of ['/_ytm', '/ytm']) {
    if ((await getJSON(`${base}${p}/health`).catch(() => null)) !== null) { prefix = p; break; }
  }
  if (!prefix) {
    throw new Error(`${base} has no YourTM telemetry worker (no /_ytm/health). ` +
      'Telemetry needs the site to run through a YourTM worker with telemetry enabled.');
  }

  return {
    label: base,
    async fetchEvents() {
      const data = await getJSON(`${base}${prefix}/telemetry/events?limit=${LIVE_EVENT_LIMIT}`);
      return normalize(data?.events);
    },
  };
}

async function previewSource(port: number): Promise<Source> {
  const candidates = [
    { label: `ytm dev (localhost:${port})`, url: `http://localhost:${port}/_ytm/telemetry?limit=500` },
    { label: 'YourTM app (localhost:3344)', url: 'http://localhost:3344/api/preview/telemetry?limit=500' },
  ];
  for (const c of candidates) {
    const data = await getJSON(c.url).catch(() => null);
    if (data && Array.isArray(data.events)) {
      return { label: c.label, fetchEvents: async () => normalize((await getJSON(c.url))?.events) };
    }
  }
  throw new Error('Nothing to monitor: start `ytm dev --preview` (or open the YourTM app), then load a page with the preview snippet.');
}

/** The current project's deployed worker, as recorded in ~/.yourtm/config.json. */
function deployedWorkerUrl(): string | undefined {
  try {
    const file = join(homedir(), '.yourtm', 'config.json');
    if (!existsSync(file)) return undefined;
    const config = JSON.parse(readFileSync(file, 'utf8'));
    return config?.deployments?.[resolve(process.cwd())]?.workerUrl;
  } catch {
    return undefined;
  }
}

function normalizeBase(url: string | undefined): string {
  if (!url) return '';
  let s = url.trim();
  if (!/^https?:\/\//.test(s)) s = 'https://' + s;
  return s.replace(/\/+$/, '');
}

async function getJSON(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

function normalize(raw: unknown): TagEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e: any): TagEvent => {
    const blocked = e.status === 'blocked' || (e.success === false && /consent/i.test(e.error || ''));
    const status: TagEvent['status'] = blocked ? 'blocked' : (e.status === 'error' || e.success === false ? 'error' : 'fired');
    const timestamp = Number(e.timestamp) || Number(e.receivedAt) || Date.now();
    return {
      id: String(e.id ?? `${e.tagId}-${timestamp}-${e.latency}`),
      tagId: String(e.tagId ?? 'unknown'),
      tagName: String(e.tagName || e.tagId || 'unknown'),
      status,
      latency: typeof e.latency === 'number' ? e.latency : undefined,
      timestamp,
      pageUrl: e.pageUrl,
      region: e.region,
      error: e.error,
      trigger: e.triggerName || e.trigger || e.triggerId,
      zone: e.zone,
      data: e.data && typeof e.data === 'object' ? e.data : undefined,
    };
  }).sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** Nearest-rank percentile, the same definition the app and worker use. */
function percentile(sorted: number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank - 1, 0), sorted.length - 1)];
}

interface Summary { executed: number; failed: number; blocked: number; avg?: number; p95?: number; perMin: number }
interface TagRow { name: string; fires: number; failed: number; blocked: number; avg?: number; p95?: number; last: number }

function summarize(events: TagEvent[]): Summary {
  const executed = events.filter(e => e.status !== 'blocked');
  const lats = executed.map(e => e.latency).filter((l): l is number => typeof l === 'number').sort((a, b) => a - b);
  const fiveMin = Date.now() - 5 * 60_000;
  return {
    executed: executed.length,
    failed: executed.filter(e => e.status === 'error').length,
    blocked: events.length - executed.length,
    avg: lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : undefined,
    p95: percentile(lats, 95),
    perMin: events.filter(e => e.timestamp > fiveMin).length / 5,
  };
}

function byTag(events: TagEvent[]): TagRow[] {
  const groups = new Map<string, TagEvent[]>();
  for (const e of events) {
    const list = groups.get(e.tagId) ?? [];
    list.push(e);
    groups.set(e.tagId, list);
  }
  return [...groups.values()].map(list => {
    const s = summarize(list);
    return { name: list[list.length - 1].tagName, fires: s.executed, failed: s.failed, blocked: s.blocked,
             avg: s.avg, p95: s.p95, last: list[list.length - 1].timestamp };
  }).sort((a, b) => b.fires + b.blocked - (a.fires + a.blocked));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const ms = (v?: number) => (v === undefined ? '—' : v < 10 ? `${v.toFixed(1)}ms` : `${Math.round(v)}ms`);
const time = (t: number) => new Date(t).toLocaleTimeString();
const pct = (ok: number, n: number) => (n === 0 ? '—' : `${Math.round((ok / n) * 100)}%`);
const ANSI = /\x1b\[[0-9;]*m/g;
const visible = (s: string) => s.replace(ANSI, '').length;

function fit(s: string, width: number): string {
  if (visible(s) <= width) return s;
  // Truncate on plain text to avoid cutting an escape sequence in half.
  return s.replace(ANSI, '').slice(0, Math.max(0, width - 1)) + '…';
}

function pad(s: string, n: number, right = false): string {
  const len = visible(s);
  if (len >= n) return fit(s, n);
  return right ? ' '.repeat(n - len) + s : s + ' '.repeat(n - len);
}

function statusIcon(e: TagEvent): string {
  return e.status === 'fired' ? chalk.green('✓') : e.status === 'blocked' ? chalk.yellow('○') : chalk.red('✗');
}

function pagePath(e: TagEvent): string {
  if (!e.pageUrl) return '';
  try { return new URL(e.pageUrl).pathname; } catch { return e.pageUrl; }
}

function eventLine(e: TagEvent, width: number, withName = true): string {
  const detail = e.status === 'error' ? chalk.red(e.error || 'error')
    : e.status === 'blocked' ? chalk.yellow('blocked')
    : chalk.gray(ms(e.latency));
  const where = [pagePath(e), e.region].filter(Boolean).join('  ');
  const data = compactData(e.data);
  return fit(`${chalk.gray(time(e.timestamp))} ${statusIcon(e)} ${withName ? e.tagName + '  ' : ''}${detail}` +
    `${where ? '  ' + chalk.gray(where) : ''}${data ? '  ' + chalk.cyan(data) : ''}`, width);
}

/** One line: gtag('config','G-…') → config("G-…"); {event:'x'} → event x; +script. */
function compactData(data?: TagData): string {
  if (!data) return '';
  const parts: string[] = [];
  for (const p of data.pushes ?? []) {
    if (Array.isArray(p) && typeof p[0] === 'string') {
      const args = p.slice(1).map(a => (typeof a === 'string' ? JSON.stringify(a) : JSON.stringify(a) ?? String(a)));
      parts.push(`${p[0]}(${args.join(', ')})`);
    } else if (p && typeof p === 'object' && 'event' in (p as object)) {
      const { event, ...rest } = p as Record<string, unknown>;
      const keys = Object.keys(rest);
      parts.push(`event ${String(event)}${keys.length ? ` {${keys.slice(0, 4).join(', ')}${keys.length > 4 ? ', …' : ''}}` : ''}`);
    } else {
      parts.push(JSON.stringify(p));
    }
  }
  for (const src of data.scripts ?? []) parts.push(`+${src.replace(/^www\./, '')}`);
  if (data.truncated) parts.push('…');
  return parts.join(' · ');
}

/** A value on one line, for the readable card. */
function inline(v: unknown): string {
  if (v === '') return chalk.gray('(empty)');
  if (typeof v === 'string') {
    // ISO timestamps read better without the T/Z noise.
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) ? v.replace('T', ' ').replace(/\.\d+Z$|Z$/, '') : v;
  }
  if (v === null || v === undefined) return chalk.gray(String(v));
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Flatten an object to aligned "key  value" rows (nested keys dotted). */
function keyValues(obj: Record<string, unknown>, prefix = '', depth = 0): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) rows.push(...keyValues(v as Record<string, unknown>, key, depth + 1));
    else rows.push([key, inline(v)]);
  }
  return rows;
}

/** What a tag sent, as readable lines rather than raw JSON. */
function readableData(data: TagData | undefined): string[] {
  if (!data || (!data.pushes?.length && !data.scripts?.length)) {
    return [chalk.gray('nothing pushed to the dataLayer and no scripts loaded')];
  }
  const out: string[] = [];
  const kv = (rows: Array<[string, string]>, indent: string) => {
    const w = Math.min(28, Math.max(...rows.map(([k]) => k.length)));
    for (const [k, v] of rows) out.push(`${indent}${chalk.gray(k.padEnd(w))}  ${v}`);
  };
  for (const p of data.pushes ?? []) {
    if (Array.isArray(p) && typeof p[0] === 'string') {
      // gtag('cmd', arg, {params})
      const [cmd, ...args] = p as unknown[];
      const params = args.length && args[args.length - 1] && typeof args[args.length - 1] === 'object' && !Array.isArray(args[args.length - 1])
        ? (args.pop() as Record<string, unknown>) : undefined;
      out.push(`${chalk.cyan('gtag')}  ${chalk.bold(String(cmd).padEnd(7))} ${args.map(inline).join('  ')}`);
      if (params) kv(keyValues(params), '         ');
    } else if (p && typeof p === 'object' && !Array.isArray(p)) {
      const { event, ...rest } = p as Record<string, unknown>;
      out.push(`${chalk.cyan('push')}  ${event !== undefined ? chalk.bold(`event ${inline(event)}`) : chalk.bold('data')}`);
      if (Object.keys(rest).length) kv(keyValues(rest), '         ');
    } else {
      out.push(`${chalk.cyan('push')}  ${inline(p)}`);
    }
  }
  for (const src of data.scripts ?? []) out.push(`${chalk.cyan('load')}  ${src}`);
  if (data.truncated) out.push(chalk.gray('(more was sent; truncated at the 2 KB cap)'));
  return out;
}

interface RenderOptions { width: number; height: number; status: string; intervalS: number; paused?: boolean }

function header(label: string, mode: string, o: RenderOptions, w: number): string[] {
  const title = `${chalk.bold.magenta('YourTM monitor')} ${chalk.gray('·')} ${mode} ${chalk.gray('·')} ${label}`;
  return [fit(`${title}   ${chalk.gray(o.status)}`, w), chalk.gray('─'.repeat(w))];
}

function summaryLine(s: Summary, w: number): string {
  return fit([
    `Executions ${chalk.bold(String(s.executed))}`,
    `Success ${chalk.bold(s.failed ? chalk.red(pct(s.executed - s.failed, s.executed)) : chalk.green(pct(s.executed, s.executed)))}`,
    `Blocked ${chalk.bold(s.blocked ? chalk.yellow(String(s.blocked)) : '0')}`,
    `Avg ${chalk.bold(ms(s.avg))}`,
    `P95 ${chalk.bold(s.p95 !== undefined && s.p95 > 100 ? chalk.yellow(ms(s.p95)) : ms(s.p95))}`,
    `${chalk.bold(s.perMin.toFixed(1))}/min`,
  ].join('   '), w);
}

function renderOverview(label: string, mode: string, events: TagEvent[], o: RenderOptions, selected = -1): string {
  const w = Math.max(60, o.width);
  const lines: string[] = [];
  const s = summarize(events);

  lines.push(...header(label, mode, o, w));
  lines.push(summaryLine(s, w));
  lines.push('');

  const rows = byTag(events);
  const nameW = Math.max(16, Math.min(44, w - 46));
  lines.push(chalk.gray('  ' + pad('TAG', nameW) + pad('FIRES', 7, true) + pad('OK', 6, true) + pad('BLOCKED', 9, true) +
    pad('AVG', 9, true) + pad('P95', 9, true) + '  LAST'));
  const maxTagRows = Number.isFinite(o.height) ? Math.max(3, Math.floor((o.height - 12) / 2)) : rows.length;
  // Keep the selection on screen when there are more tags than rows.
  const first = selected >= maxTagRows ? selected - maxTagRows + 1 : 0;
  rows.slice(first, first + maxTagRows).forEach((r, i) => {
    const ok = r.failed ? chalk.red(pct(r.fires - r.failed, r.fires)) : pct(r.fires, r.fires);
    const isSel = first + i === selected;
    const row = pad(r.name, nameW) + pad(String(r.fires), 7, true) + pad(ok, 6, true) +
      pad(r.blocked ? chalk.yellow(String(r.blocked)) : '0', 9, true) + pad(ms(r.avg), 9, true) +
      pad(ms(r.p95), 9, true) + '  ' + chalk.gray(time(r.last));
    lines.push(fit((isSel ? chalk.magenta('▶ ') + chalk.bold(row) : '  ' + row), w));
  });
  if (rows.length > maxTagRows) lines.push(chalk.gray(`  … ${rows.length - maxTagRows} more tags (↑/↓ to scroll)`));
  if (rows.length === 0) lines.push(chalk.gray('No tag events yet. Load a page that runs this container.'));
  lines.push('');

  lines.push(chalk.gray('RECENT'));
  const room = Number.isFinite(o.height) ? Math.max(1, o.height - lines.length - 2) : 15;
  for (const e of events.slice(-room).reverse()) lines.push(eventLine(e, w));
  if (Number.isFinite(o.height)) {
    while (lines.length < o.height - 1) lines.push('');
    lines.push(chalk.gray(fit(`↑/↓ select · enter details · p ${o.paused ? 'resume' : 'pause'} · q quit · ` +
      `every ${o.intervalS}s · last ${events.length} events`, w)));
  }
  return lines.join('\n');
}

function topCounts(values: string[], n: number): string {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, c]) => `${k} ${chalk.gray('×' + c)}`).join('   ') || chalk.gray('—');
}

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------

/** The expandable card under a tag row. */
function tagCard(events: TagEvent[], tagName: string, width: number): string[] {
  const mine = events.filter(e => e.tagName === tagName);
  const s = summarize(mine);
  const last = mine[mine.length - 1];
  const inner = width - 6;
  const body: string[] = [];
  body.push(`${chalk.bold(String(s.executed))} fires   OK ${s.failed ? chalk.red(pct(s.executed - s.failed, s.executed)) : chalk.green(pct(s.executed, s.executed))}` +
    `   blocked ${s.blocked}   avg ${ms(s.avg)}   p95 ${ms(s.p95)}   last ${last ? time(last.timestamp) : '—'}`);
  body.push(`${chalk.gray('id       ')} ${last?.tagId ?? ''}${last?.zone ? chalk.gray('   zone ') + last.zone : ''}`);
  body.push(`${chalk.gray('triggers ')} ${topCounts(mine.map(e => e.trigger ?? ''), 4)}`);
  body.push(`${chalk.gray('pages    ')} ${topCounts(mine.map(pagePath), 5)}`);
  body.push(`${chalk.gray('countries')} ${topCounts(mine.map(e => e.region ?? ''), 6)}`);
  const errors = mine.filter(e => e.status === 'error').slice(-3);
  for (const e of errors) body.push(chalk.red(`error ${time(e.timestamp)}  ${e.error ?? ''}`));
  body.push('');
  const withData = [...mine].reverse().find(e => e.data);
  body.push(chalk.bold('Sent on last fire') + (withData ? chalk.gray(`  ${time(withData.timestamp)}  ${pagePath(withData)}`) : ''));
  for (const l of readableData(withData?.data)) body.push('  ' + l);
  body.push('');
  body.push(chalk.bold('Recent fires'));
  for (const e of mine.slice(-5).reverse()) {
    const detail = e.status === 'error' ? chalk.red(e.error || 'error') : e.status === 'blocked' ? chalk.yellow('blocked') : chalk.gray(ms(e.latency));
    body.push(`  ${chalk.gray(time(e.timestamp))}  ${statusIcon(e)} ${detail}  ${pagePath(e)}${e.region ? chalk.gray('  ' + e.region) : ''}${e.trigger ? chalk.gray('  ⟵ ' + e.trigger) : ''}`);
  }
  return [
    chalk.gray('  ╭' + '─'.repeat(Math.max(0, width - 4))),
    ...body.map(l => chalk.gray('  │ ') + fit(l, inner)),
    chalk.gray('  ╰' + '─'.repeat(Math.max(0, width - 4))),
  ];
}

interface Screen { text: string; rowTags: Array<string | undefined>; bodyStart: number; bodyLines: number; scroll: number }

interface DashState {
  selected: number;
  expanded: Set<string>;
  scroll: number;
  paused: boolean;
  /** Just expanded: scroll so its card is visible, once. */
  reveal?: string;
}

/** Header + scrollable body (tag rows, open cards, recent feed) + footer. */
function renderInteractive(label: string, mode: string, events: TagEvent[], o: RenderOptions, st: DashState, follow: boolean): Screen {
  const w = Math.max(60, o.width);
  const top: string[] = [...header(label, mode, o, w), summaryLine(summarize(events), w), ''];
  const rows = byTag(events);
  const nameW = Math.max(16, Math.min(44, w - 48));
  top.push(chalk.gray('    ' + pad('TAG', nameW) + pad('FIRES', 7, true) + pad('OK', 6, true) + pad('BLOCKED', 9, true) +
    pad('AVG', 9, true) + pad('P95', 9, true) + '  LAST'));

  // Body lines, each remembering which tag (if any) a click on it means.
  const body: string[] = [];
  const bodyTags: Array<string | undefined> = [];
  let selectedLine = 0;
  let revealFrom = -1;
  let revealTo = -1;
  rows.forEach((r, i) => {
    const open = st.expanded.has(r.name);
    const isSel = i === st.selected;
    const ok = r.failed ? chalk.red(pct(r.fires - r.failed, r.fires)) : pct(r.fires, r.fires);
    const row = pad(r.name, nameW) + pad(String(r.fires), 7, true) + pad(ok, 6, true) +
      pad(r.blocked ? chalk.yellow(String(r.blocked)) : '0', 9, true) + pad(ms(r.avg), 9, true) +
      pad(ms(r.p95), 9, true) + '  ' + chalk.gray(time(r.last));
    if (isSel) selectedLine = body.length;
    body.push(fit(`${isSel ? chalk.magenta('▶') : ' '} ${open ? '▾' : '▸'} ${isSel ? chalk.bold(row) : row}`, w));
    bodyTags.push(r.name);
    if (r.name === st.reveal) revealFrom = body.length - 1;
    if (open) {
      for (const l of tagCard(events, r.name, w)) { body.push(l); bodyTags.push(r.name); }
    }
    if (r.name === st.reveal) revealTo = body.length - 1;
  });
  if (rows.length === 0) { body.push(chalk.gray('  No tag events yet. Load a page that runs this container.')); bodyTags.push(undefined); }
  body.push(''); bodyTags.push(undefined);
  body.push(chalk.gray('  RECENT')); bodyTags.push(undefined);
  for (const e of events.slice(-15).reverse()) { body.push('  ' + eventLine(e, w - 2)); bodyTags.push(e.tagName); }

  const footer = chalk.gray(fit(`click a tag to expand · ↑/↓ select · enter/space toggle · a all · esc collapse · ` +
    `wheel/PgUp/PgDn scroll · p ${st.paused ? 'resume' : 'pause'} · q quit · every ${o.intervalS}s`, w));
  const bodyLines = Math.max(3, o.height - top.length - 1);

  // After keyboard selection, bring the selected row into view; after a click
  // or the wheel, leave the viewport where the user put it. Always clamp.
  let scroll = st.scroll;
  if (follow) {
    if (selectedLine < scroll) scroll = selectedLine;
    if (selectedLine >= scroll + bodyLines) scroll = selectedLine - bodyLines + 1;
  }
  if (revealFrom >= 0) {
    // Show the whole card if it fits, never pushing its tag row off the top.
    if (revealTo >= scroll + bodyLines) scroll = Math.min(revealFrom, revealTo - bodyLines + 1);
    if (revealFrom < scroll) scroll = revealFrom;
  }
  scroll = Math.max(0, Math.min(scroll, Math.max(0, body.length - bodyLines)));

  const visibleBody = body.slice(scroll, scroll + bodyLines);
  while (visibleBody.length < bodyLines) visibleBody.push('');
  return {
    text: [...top, ...visibleBody, footer].join('\n'),
    rowTags: bodyTags.slice(scroll, scroll + bodyLines),
    bodyStart: top.length,           // 0-based screen row of the first body line
    bodyLines,
    scroll,
  };
}

async function runDashboard(source: Source, mode: string, intervalS: number, keep: (e: TagEvent) => boolean): Promise<void> {
  const out = process.stdout;
  let events: TagEvent[] = [];
  let status = 'connecting…';
  let timer: NodeJS.Timeout | undefined;
  const st: DashState = { selected: 0, expanded: new Set(), scroll: 0, paused: false };
  let screen: Screen | undefined;
  // Mouse wheel moves the viewport; only selection changes may pull it back.
  let followSelection = true;

  const names = () => byTag(events).map(r => r.name);

  const draw = () => {
    const n = names();
    st.selected = Math.min(Math.max(0, st.selected), Math.max(0, n.length - 1));
    const o = { width: out.columns || 100, height: out.rows || 30, status: st.paused ? chalk.yellow('paused') : status, intervalS, paused: st.paused };
    screen = renderInteractive(source.label, mode, events, o, st, followSelection);
    st.scroll = screen.scroll;
    st.reveal = undefined;
    out.write('\x1b[H\x1b[2J' + screen.text);
  };

  const toggle = (name: string | undefined) => {
    if (!name) return;
    if (st.expanded.has(name)) st.expanded.delete(name);
    else { st.expanded.add(name); st.reveal = name; }
  };

  const restore = () => {
    if (timer) clearTimeout(timer);
    out.write('\x1b[?1000l\x1b[?1006l\x1b[?25h\x1b[?1049l');
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.exit(0);
  };

  // Alternate screen, hide cursor, report mouse clicks and wheel (SGR encoding).
  out.write('\x1b[?1049h\x1b[?25l\x1b[?1000h\x1b[?1006h');
  process.on('SIGINT', restore);
  process.on('SIGTERM', restore);
  out.on('resize', draw);

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (buf: Buffer) => {
      let input = buf.toString();

      // Mouse: ESC [ < button ; col ; row (M = press, m = release)
      const mouse = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
      let m: RegExpExecArray | null;
      let handled = false;
      while ((m = mouse.exec(input))) {
        handled = true;
        const button = Number(m[1]);
        const row = Number(m[3]) - 1;
        if (m[4] !== 'M') continue;
        if (button === 64) { st.scroll = Math.max(0, st.scroll - 3); followSelection = false; }
        else if (button === 65) { st.scroll += 3; followSelection = false; }
        else if (button === 0 && screen) {
          const i = row - screen.bodyStart;
          const name = i >= 0 && i < screen.bodyLines ? screen.rowTags[i] : undefined;
          if (name) {
            const idx = names().indexOf(name);
            if (idx >= 0) st.selected = idx;
            toggle(name);
            followSelection = false;   // keep the clicked row where it is
          }
        }
      }
      input = input.replace(mouse, '');
      if (handled && !input) return draw();

      const sel = () => names()[st.selected];
      const k = input;
      if (k === 'q' || k === 'Q' || k === '\u0003') return restore();
      if (k === '\x1b[A' || k === 'k') { st.selected--; followSelection = true; }
      else if (k === '\x1b[B' || k === 'j') { st.selected++; followSelection = true; }
      else if (k === '\r' || k === ' ' || k === '\x1b[C' || k === 'l') { toggle(sel()); followSelection = true; }
      else if (k === '\x1b[D' || k === 'h') { if (sel()) st.expanded.delete(sel()); followSelection = true; }
      else if (k === '\x1b') { st.expanded.clear(); followSelection = true; }
      else if (k === 'a' || k === 'A') {
        const all = names();
        if (all.every(n => st.expanded.has(n))) st.expanded.clear(); else all.forEach(n => st.expanded.add(n));
        followSelection = true;
      }
      else if (k === '\x1b[5~') { st.scroll = Math.max(0, st.scroll - ((screen?.bodyLines ?? 10) - 2)); followSelection = false; }
      else if (k === '\x1b[6~') { st.scroll += (screen?.bodyLines ?? 10) - 2; followSelection = false; }
      else if (k === 'p' || k === 'P') st.paused = !st.paused;
      else return;
      draw();
    });
  }

  const tick = async () => {
    if (!st.paused) {
      try {
        events = (await source.fetchEvents()).filter(keep);
        status = `${chalk.green('●')} updated ${time(Date.now())}`;
      } catch (error) {
        status = `${chalk.red('●')} ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    draw();
    timer = setTimeout(tick, intervalS * 1000);
  };
  draw();
  await tick();
}

async function runPlain(source: Source, intervalS: number, keep: (e: TagEvent) => boolean): Promise<void> {
  const width = process.stdout.columns || 160;
  const seen = new Set<string>();
  let first = true;
  console.log(chalk.gray(`Monitoring ${source.label} every ${intervalS}s. Ctrl+C to stop.`));

  for (;;) {
    try {
      const events = (await source.fetchEvents()).filter(keep);
      // On the first poll show only the last few, not the whole window.
      const fresh = events.filter(e => !seen.has(e.id));
      for (const e of fresh) seen.add(e.id);
      for (const e of first ? fresh.slice(-10) : fresh) console.log(eventLine(e, width));
      first = false;
    } catch (error) {
      console.log(chalk.red(`! ${error instanceof Error ? error.message : String(error)}`));
    }
    await new Promise(r => setTimeout(r, intervalS * 1000));
  }
}

