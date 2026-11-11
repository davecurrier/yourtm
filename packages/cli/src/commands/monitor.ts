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
    // A snapshot: every tag expanded, nothing interactive.
    const all = new Set(byTag(events).map(r => r.name));
    console.log(renderList(source.label, events, { selected: -1, expanded: all, scroll: 0, paused: false },
      { width: process.stdout.columns || 100, height: Infinity, status: chalk.gray('snapshot ' + time(Date.now())), interactive: false, follow: false }).text);
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
    // Ties by name, so rows do not swap places between refreshes.
  }).sort((a, b) => (b.fires + b.blocked) - (a.fires + a.blocked) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const ms = (v?: number) => (v === undefined ? '—' : v < 10 ? `${v.toFixed(1)} ms` : `${Math.round(v)} ms`);
const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const ANSI = /\x1b\[[0-9;]*m/g;
const visible = (s: string) => s.replace(ANSI, '').length;

function fit(s: string, width: number): string {
  if (visible(s) <= width) return s;
  // Truncate on plain text so an escape sequence is never cut in half.
  return s.replace(ANSI, '').slice(0, Math.max(0, width - 1)) + '…';
}

function statusIcon(e: TagEvent): string {
  return e.status === 'fired' ? chalk.green('✓') : e.status === 'blocked' ? chalk.yellow('○') : chalk.red('✗');
}

function pagePath(e: TagEvent): string {
  if (!e.pageUrl) return '';
  try { return new URL(e.pageUrl).pathname; } catch { return e.pageUrl; }
}

/** One event on one line, for --plain output. */
function eventLine(e: TagEvent, width: number): string {
  const detail = e.status === 'error' ? chalk.red(e.error || 'error')
    : e.status === 'blocked' ? chalk.yellow('blocked')
    : chalk.gray(ms(e.latency));
  const where = [pagePath(e), e.region].filter(Boolean).join('  ');
  const data = compactData(e.data);
  return fit(`${chalk.gray(time(e.timestamp))} ${statusIcon(e)} ${e.tagName}  ${detail}` +
    `${where ? '  ' + chalk.gray(where) : ''}${data ? '  ' + chalk.cyan(data) : ''}`, width);
}

/** Commands that are bookkeeping, not something a tag "sent". */
const QUIET_GTAG = new Set(['js']);

/** One-line data summary for --plain: config("G-…") · +gtag/js… */
function compactData(data?: TagData): string {
  if (!data) return '';
  const parts: string[] = [];
  for (const p of data.pushes ?? []) {
    if (Array.isArray(p) && typeof p[0] === 'string') {
      if (QUIET_GTAG.has(p[0])) continue;
      parts.push(`${p[0]}(${p.slice(1).map(a => JSON.stringify(a)).join(', ')})`);
    } else if (p && typeof p === 'object' && 'event' in (p as object)) {
      parts.push(`event ${String((p as Record<string, unknown>).event)}`);
    }
  }
  for (const src of data.scripts ?? []) parts.push(`+${shortSrc(src)}`);
  return parts.join(' · ');
}

function shortSrc(src: string): string {
  return src.replace(/^www\./, '');
}

function inline(v: unknown): string {
  if (v === '') return chalk.gray('(empty)');
  if (v === null || v === undefined) return chalk.gray('—');
  if (typeof v === 'string') {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? v.replace('T', ' ').replace(/\.\d+Z$|Z$/, '') : v;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Flatten an object to [key, value] pairs, nested keys dotted. */
function keyValues(obj: Record<string, unknown>, prefix = '', depth = 0): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) rows.push(...keyValues(v as Record<string, unknown>, key, depth + 1));
    else rows.push([key, inline(v)]);
  }
  return rows;
}

const LABEL = 9;
const MAX_PARAMS = 6;

/** The quiet card under an expanded tag: what it sent, what it loaded, where. */
function detailLines(events: TagEvent[], tagName: string): string[] {
  const mine = events.filter(e => e.tagName === tagName);
  const lines: string[] = [];
  const row = (label: string, value: string) => lines.push(`${chalk.gray(label.padEnd(LABEL))}${value}`);

  const withData = [...mine].reverse().find(e => e.data);
  for (const p of withData?.data?.pushes ?? []) {
    if (Array.isArray(p) && typeof p[0] === 'string') {
      if (QUIET_GTAG.has(p[0])) continue;
      const args = p.slice(1);
      const params = args.length && args[args.length - 1] && typeof args[args.length - 1] === 'object' && !Array.isArray(args[args.length - 1])
        ? (args.pop() as Record<string, unknown>) : undefined;
      row(String(p[0]), args.map(inline).join('  '));
      if (params) paramLines(params);
    } else if (p && typeof p === 'object' && !Array.isArray(p)) {
      const { event, ...rest } = p as Record<string, unknown>;
      row(event !== undefined ? 'event' : 'data', event !== undefined ? inline(event) : '');
      paramLines(rest);
    }
  }
  for (const src of withData?.data?.scripts ?? []) row('loads', shortSrc(src));
  if (!withData) row('sent', chalk.gray('nothing captured'));

  const pages = new Map<string, number>();
  for (const e of mine) { const p = pagePath(e); if (p) pages.set(p, (pages.get(p) ?? 0) + 1); }
  const topPages = [...pages.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  if (topPages.length) row('pages', topPages.slice(0, 3).join(chalk.gray('  ·  ')) + (topPages.length > 3 ? chalk.gray(`  +${topPages.length - 3}`) : ''));

  const lastError = [...mine].reverse().find(e => e.status === 'error');
  if (lastError) row('error', chalk.red(lastError.error || 'failed'));
  if (mine.some(e => e.status === 'blocked')) row('blocked', chalk.yellow('waiting for consent'));
  return lines;

  function paramLines(params: Record<string, unknown>) {
    const kv = keyValues(params);
    if (!kv.length) return;
    const w = Math.min(22, Math.max(...kv.map(([k]) => k.length)));
    for (const [k, v] of kv.slice(0, MAX_PARAMS)) lines.push(`${' '.repeat(LABEL)}${chalk.gray(k.padEnd(w))}  ${v}`);
    if (kv.length > MAX_PARAMS) lines.push(`${' '.repeat(LABEL)}${chalk.gray(`+${kv.length - MAX_PARAMS} more`)}`);
  }
}

interface ListState {
  selected: number;
  expanded: Set<string>;
  scroll: number;
  paused: boolean;
  /** Just expanded: scroll so its details are visible, once. */
  reveal?: string;
}

interface Screen { text: string; rowTags: Array<string | undefined>; bodyStart: number; bodyLines: number; scroll: number }

interface ListOptions {
  width: number;
  height: number;            // Infinity: print everything, no footer
  status: string;
  interactive: boolean;
  follow: boolean;           // keep the selected row in view
}

function renderList(label: string, events: TagEvent[], st: ListState, o: ListOptions): Screen {
  // Narrow on purpose: counts stay close to the names they belong to.
  const w = Math.max(50, Math.min(o.width, 84));
  const title = `${chalk.bold('YourTM')} ${chalk.gray('·')} ${label.replace(/^https?:\/\//, '')}`;
  const right = o.status;
  const top = [title + ' '.repeat(Math.max(2, w - visible(title) - visible(right))) + right, ''];

  const body: string[] = [];
  const tags: Array<string | undefined> = [];
  const rows = byTag(events);
  let selectedLine = 0;
  let revealFrom = -1;
  let revealTo = -1;

  rows.forEach((r, i) => {
    const open = st.expanded.has(r.name);
    const isSel = o.interactive && i === st.selected;
    const counts = [
      `${r.fires} ${r.fires === 1 ? 'fire' : 'fires'}`,
      r.failed ? chalk.red(`${r.failed} failed`) : '',
      r.blocked ? chalk.yellow(`${r.blocked} blocked`) : '',
    ].filter(Boolean).join(chalk.gray(' · '));
    const arrow = open ? '▾' : '▸';
    const name = fit(r.name, w - visible(counts) - 4);
    const line = `${isSel ? chalk.magenta(arrow) : chalk.gray(arrow)} ${isSel ? chalk.bold(name) : name}`;
    if (isSel) selectedLine = body.length;
    if (r.name === st.reveal) revealFrom = body.length;
    body.push(line + ' '.repeat(Math.max(2, w - visible(line) - visible(counts))) + chalk.gray(counts));
    tags.push(r.name);
    if (open) {
      for (const l of detailLines(events, r.name)) { body.push(fit('    ' + l, w)); tags.push(r.name); }
      body.push(''); tags.push(r.name);
    }
    if (r.name === st.reveal) revealTo = body.length - 1;
  });
  if (rows.length === 0) { body.push(chalk.gray('No tags have fired yet. Load a page that runs this container.')); tags.push(undefined); }

  if (!Number.isFinite(o.height)) {
    return { text: [...top, ...body].join('\n'), rowTags: tags, bodyStart: top.length, bodyLines: body.length, scroll: 0 };
  }

  const footer = chalk.gray('click a tag to expand · q quit');
  const bodyLines = Math.max(3, o.height - top.length - 2);
  let scroll = st.scroll;
  if (o.follow) {
    if (selectedLine < scroll) scroll = selectedLine;
    if (selectedLine >= scroll + bodyLines) scroll = selectedLine - bodyLines + 1;
  }
  if (revealFrom >= 0) {
    if (revealTo >= scroll + bodyLines) scroll = Math.min(revealFrom, revealTo - bodyLines + 1);
    if (revealFrom < scroll) scroll = revealFrom;
  }
  scroll = Math.max(0, Math.min(scroll, Math.max(0, body.length - bodyLines)));
  const shown = body.slice(scroll, scroll + bodyLines);
  while (shown.length < bodyLines) shown.push('');
  return {
    text: [...top, ...shown, '', footer].join('\n'),
    rowTags: tags.slice(scroll, scroll + bodyLines),
    bodyStart: top.length,
    bodyLines,
    scroll,
  };
}

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------

async function runDashboard(source: Source, mode: string, intervalS: number, keep: (e: TagEvent) => boolean): Promise<void> {
  const out = process.stdout;
  let events: TagEvent[] = [];
  let status = chalk.gray('connecting…');
  let timer: NodeJS.Timeout | undefined;
  const st: ListState = { selected: 0, expanded: new Set(), scroll: 0, paused: false };
  let screen: Screen | undefined;
  let follow = true;

  const names = () => byTag(events).map(r => r.name);

  const draw = () => {
    st.selected = Math.min(Math.max(0, st.selected), Math.max(0, names().length - 1));
    screen = renderList(source.label, events, st, {
      width: out.columns || 100, height: out.rows || 30, interactive: true, follow,
      status: st.paused ? chalk.yellow('paused') : status,
    });
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
      const mouse = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
      let m: RegExpExecArray | null;
      let sawMouse = false;
      while ((m = mouse.exec(input))) {
        sawMouse = true;
        if (m[4] !== 'M') continue;
        const button = Number(m[1]);
        if (button === 64) { st.scroll = Math.max(0, st.scroll - 3); follow = false; }
        else if (button === 65) { st.scroll += 3; follow = false; }
        else if (button === 0 && screen) {
          const i = Number(m[3]) - 1 - screen.bodyStart;
          const name = i >= 0 && i < screen.bodyLines ? screen.rowTags[i] : undefined;
          if (name) {
            st.selected = Math.max(0, names().indexOf(name));
            toggle(name);
            follow = false;
          }
        }
      }
      input = input.replace(mouse, '');
      if (sawMouse && !input) return draw();

      const sel = names()[st.selected];
      switch (input) {
        case 'q': case 'Q': case '\u0003': return restore();
        case '\x1b[A': case 'k': st.selected--; follow = true; break;
        case '\x1b[B': case 'j': st.selected++; follow = true; break;
        case '\r': case ' ': case '\x1b[C': case 'l': toggle(sel); follow = true; break;
        case '\x1b[D': case 'h': if (sel) st.expanded.delete(sel); follow = true; break;
        case '\x1b': st.expanded.clear(); follow = true; break;
        case 'a': case 'A': {
          const all = names();
          if (all.every(n => st.expanded.has(n))) st.expanded.clear(); else all.forEach(n => st.expanded.add(n));
          follow = true;
          break;
        }
        case '\x1b[5~': st.scroll = Math.max(0, st.scroll - ((screen?.bodyLines ?? 10) - 2)); follow = false; break;
        case '\x1b[6~': st.scroll += (screen?.bodyLines ?? 10) - 2; follow = false; break;
        case 'p': case 'P': st.paused = !st.paused; break;
        default: return;
      }
      draw();
    });
  }

  const tick = async () => {
    if (!st.paused) {
      try {
        events = (await source.fetchEvents()).filter(keep);
        status = `${chalk.green('●')} ${chalk.gray(mode + ' ' + time(Date.now()))}`;
      } catch (error) {
        status = `${chalk.red('●')} ${chalk.red(error instanceof Error ? error.message : String(error))}`;
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

