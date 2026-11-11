/**
 * ytm monitor — live tag telemetry in the terminal.
 *
 *   ytm monitor https://yourtm.dev           live: a deployed site's worker
 *   ytm monitor --mode preview               preview: a running `ytm dev`,
 *                                            or the YourTM app's receiver
 *
 * In a terminal it is a full-screen dashboard redrawn in place; piped, logged
 * or with --plain it prints one line per new event; --once prints a single
 * snapshot and exits.
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
    console.log(render(source.label, mode, events, { width: process.stdout.columns || 100, height: Infinity, status: 'snapshot', intervalS }));
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

function eventLine(e: TagEvent, width: number): string {
  const icon = e.status === 'fired' ? chalk.green('✓') : e.status === 'blocked' ? chalk.yellow('○') : chalk.red('✗');
  const detail = e.status === 'error' ? chalk.red(e.error || 'error')
    : e.status === 'blocked' ? chalk.yellow('blocked')
    : chalk.gray(ms(e.latency));
  let page = '';
  if (e.pageUrl) {
    try { page = new URL(e.pageUrl).pathname; } catch { page = e.pageUrl; }
  }
  const where = [page, e.region].filter(Boolean).join('  ');
  return fit(`${chalk.gray(time(e.timestamp))} ${icon} ${e.tagName}  ${detail}${where ? '  ' + chalk.gray(where) : ''}`, width);
}

interface RenderOptions { width: number; height: number; status: string; intervalS: number }

function render(label: string, mode: string, events: TagEvent[], o: RenderOptions): string {
  const w = Math.max(60, o.width);
  const lines: string[] = [];
  const s = summarize(events);

  const title = `${chalk.bold.magenta('YourTM monitor')} ${chalk.gray('·')} ${mode} ${chalk.gray('·')} ${label}`;
  lines.push(fit(`${title}   ${chalk.gray(o.status)}`, w));
  lines.push(chalk.gray('─'.repeat(w)));
  lines.push(fit([
    `Executions ${chalk.bold(String(s.executed))}`,
    `Success ${chalk.bold(s.failed ? chalk.red(pct(s.executed - s.failed, s.executed)) : chalk.green(pct(s.executed, s.executed)))}`,
    `Blocked ${chalk.bold(s.blocked ? chalk.yellow(String(s.blocked)) : '0')}`,
    `Avg ${chalk.bold(ms(s.avg))}`,
    `P95 ${chalk.bold(s.p95 !== undefined && s.p95 > 100 ? chalk.yellow(ms(s.p95)) : ms(s.p95))}`,
    `${chalk.bold(s.perMin.toFixed(1))}/min`,
  ].join('   '), w));
  lines.push('');

  const rows = byTag(events);
  const nameW = Math.max(16, Math.min(44, w - 46));
  lines.push(chalk.gray(pad('TAG', nameW) + pad('FIRES', 7, true) + pad('OK', 6, true) + pad('BLOCKED', 9, true) +
    pad('AVG', 9, true) + pad('P95', 9, true) + '  LAST'));
  const maxTagRows = Number.isFinite(o.height) ? Math.max(3, Math.floor((o.height - 12) / 2)) : rows.length;
  for (const r of rows.slice(0, maxTagRows)) {
    const ok = r.failed ? chalk.red(pct(r.fires - r.failed, r.fires)) : pct(r.fires, r.fires);
    lines.push(fit(pad(r.name, nameW) + pad(String(r.fires), 7, true) + pad(ok, 6, true) +
      pad(r.blocked ? chalk.yellow(String(r.blocked)) : '0', 9, true) + pad(ms(r.avg), 9, true) +
      pad(ms(r.p95), 9, true) + '  ' + chalk.gray(time(r.last)), w));
  }
  if (rows.length > maxTagRows) lines.push(chalk.gray(`… ${rows.length - maxTagRows} more tags`));
  if (rows.length === 0) lines.push(chalk.gray('No tag events yet. Load a page that runs this container.'));
  lines.push('');

  lines.push(chalk.gray('RECENT'));
  const room = Number.isFinite(o.height) ? Math.max(1, o.height - lines.length - 2) : 15;
  for (const e of events.slice(-room).reverse()) lines.push(eventLine(e, w));
  if (Number.isFinite(o.height)) {
    while (lines.length < o.height - 1) lines.push('');
    lines.push(chalk.gray(fit(`q quit · refreshing every ${o.intervalS}s · window: last ${events.length} events`, w)));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------

async function runDashboard(source: Source, mode: string, intervalS: number, keep: (e: TagEvent) => boolean): Promise<void> {
  const out = process.stdout;
  let events: TagEvent[] = [];
  let status = 'connecting…';
  let timer: NodeJS.Timeout | undefined;

  const draw = () => {
    const frame = render(source.label, mode, events, {
      width: out.columns || 100, height: out.rows || 30, status, intervalS,
    });
    out.write('\x1b[H\x1b[2J' + frame);
  };

  const restore = () => {
    if (timer) clearTimeout(timer);
    out.write('\x1b[?25h\x1b[?1049l');
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.exit(0);
  };

  out.write('\x1b[?1049h\x1b[?25l');           // alternate screen, hide cursor
  process.on('SIGINT', restore);
  process.on('SIGTERM', restore);
  out.on('resize', draw);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (key: Buffer) => {
      const k = key.toString();
      if (k === 'q' || k === 'Q' || k === '\u0003') restore();
    });
  }

  const tick = async () => {
    try {
      events = (await source.fetchEvents()).filter(keep);
      status = `${chalk.green('●')} updated ${time(Date.now())}`;
    } catch (error) {
      status = `${chalk.red('●')} ${error instanceof Error ? error.message : String(error)}`;
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

