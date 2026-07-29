/**
 * YourTM RUM (Real User Monitoring) Durable Object
 *
 * This Durable Object maintains real-time telemetry state for a container:
 * - Keeps a buffer of recent events (last 1000)
 * - Calculates rolling aggregates (avg latency, P95, success rate)
 * - Maintains WebSocket connections for live streaming
 * - Handles multiple concurrent viewers (desktop apps, dashboards)
 */

export interface TelemetryEvent {
  id: string;
  type: 'tag_execution';
  containerId: string;
  tagId: string;
  tagName: string;
  timestamp: number;
  latency: number;
  success: boolean;
  error?: string;
  zone?: string;
  trigger?: string;
  pageUrl?: string;
  userAgent?: string;
  region?: string;
  receivedAt: number;
}

interface TagStats {
  tagId: string;
  tagName: string;
  fireCount: number;
  successCount: number;
  errorCount: number;
  totalLatency: number;
  latencies: number[];  // For percentile calculations
  lastFired: number;
}

interface AggregateStats {
  totalEvents: number;
  successRate: number;
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  eventsPerMinute: number;
  tags: TagStats[];
  lastUpdated: number;
}

// Maximum events to keep in memory
const MAX_EVENTS = 1000;
const MAX_LATENCIES_PER_TAG = 500;

/**
 * RUM Durable Object - one instance per container
 */
export class RUMDurableObject {
  private state: DurableObjectState;
  private sessions: Set<WebSocket> = new Set();
  private events: TelemetryEvent[] = [];
  private tagStats: Map<string, TagStats> = new Map();
  private eventTimestamps: number[] = []; // For events/minute calculation
  private containerId: string = '';

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;

    // Restore state from storage on startup
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<{
        events: TelemetryEvent[];
        tagStats: [string, TagStats][];
        containerId: string;
      }>('rum_state');

      if (stored) {
        this.events = stored.events || [];
        this.tagStats = new Map(stored.tagStats || []);
        this.containerId = stored.containerId || '';
      }
    });
  }

  /**
   * Handle incoming requests
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade for streaming
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    // POST: Receive telemetry events
    if (request.method === 'POST' && url.pathname === '/events') {
      return this.handleEvents(request);
    }

    // GET: Return current stats
    if (request.method === 'GET' && url.pathname === '/stats') {
      return this.handleGetStats();
    }

    // GET: Return recent events
    if (request.method === 'GET' && url.pathname === '/events') {
      const limit = parseInt(url.searchParams.get('limit') || '100');
      return new Response(JSON.stringify({
        events: this.events.slice(-limit),
        total: this.events.length,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // DELETE: Clear all data
    if (request.method === 'DELETE') {
      this.events = [];
      this.tagStats.clear();
      this.eventTimestamps = [];
      await this.persistState();
      return new Response(JSON.stringify({ status: 'cleared' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle WebSocket connection for live streaming
   */
  private handleWebSocket(_request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket
    this.state.acceptWebSocket(server);
    this.sessions.add(server);

    // Send initial state
    const initMessage = JSON.stringify({
      type: 'init',
      stats: this.calculateStats(),
      recentEvents: this.events.slice(-50),
    });
    server.send(initMessage);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const data = JSON.parse(message as string);

      // Handle ping
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }

      // Handle request for stats
      if (data.type === 'get_stats') {
        ws.send(JSON.stringify({
          type: 'stats',
          stats: this.calculateStats(),
        }));
      }
    } catch {
      // Ignore invalid messages
    }
  }

  /**
   * Handle WebSocket close
   */
  async webSocketClose(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
  }

  /**
   * Handle WebSocket error
   */
  async webSocketError(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
  }

  /**
   * Handle incoming telemetry events
   */
  private async handleEvents(request: Request): Promise<Response> {
    try {
      const body = await request.json() as TelemetryEvent | TelemetryEvent[];
      const incoming = Array.isArray(body) ? body : [body];
      const now = Date.now();

      for (const event of incoming) {
        // Generate ID if not present
        if (!event.id) {
          event.id = `${event.tagId}-${event.timestamp}-${Math.random().toString(36).slice(2, 8)}`;
        }

        // Set container ID from first event
        if (!this.containerId && event.containerId) {
          this.containerId = event.containerId;
        }

        // Add to event buffer
        this.events.push(event);
        if (this.events.length > MAX_EVENTS) {
          this.events.shift();
        }

        // Track timestamp for events/minute
        this.eventTimestamps.push(now);
        // Keep only last 5 minutes of timestamps
        const fiveMinutesAgo = now - 5 * 60 * 1000;
        this.eventTimestamps = this.eventTimestamps.filter(t => t > fiveMinutesAgo);

        // Update tag stats
        this.updateTagStats(event);

        // Broadcast to connected WebSockets
        this.broadcast({
          type: 'event',
          event,
        });
      }

      // Persist state periodically (every 10 events)
      if (this.events.length % 10 === 0) {
        await this.persistState();
      }

      // Broadcast updated stats
      this.broadcast({
        type: 'stats',
        stats: this.calculateStats(),
      });

      return new Response(JSON.stringify({
        status: 'ok',
        received: incoming.length,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: String(error),
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * Update tag-level statistics
   */
  private updateTagStats(event: TelemetryEvent): void {
    const key = event.tagId;
    let stats = this.tagStats.get(key);

    if (!stats) {
      stats = {
        tagId: event.tagId,
        tagName: event.tagName || event.tagId,
        fireCount: 0,
        successCount: 0,
        errorCount: 0,
        totalLatency: 0,
        latencies: [],
        lastFired: 0,
      };
      this.tagStats.set(key, stats);
    }

    stats.fireCount++;
    if (event.success) {
      stats.successCount++;
    } else {
      stats.errorCount++;
    }
    stats.totalLatency += event.latency;
    stats.latencies.push(event.latency);
    stats.lastFired = event.timestamp;

    // Trim latencies array to prevent unbounded growth
    if (stats.latencies.length > MAX_LATENCIES_PER_TAG) {
      stats.latencies = stats.latencies.slice(-MAX_LATENCIES_PER_TAG);
    }
  }

  /**
   * Calculate aggregate statistics
   */
  private calculateStats(): AggregateStats {
    const now = Date.now();
    const allLatencies: number[] = [];
    let totalEvents = 0;
    let successCount = 0;

    const tags: TagStats[] = [];

    for (const [, stats] of this.tagStats) {
      totalEvents += stats.fireCount;
      successCount += stats.successCount;
      allLatencies.push(...stats.latencies);
      tags.push({ ...stats });
    }

    // Sort tags by fire count descending
    tags.sort((a, b) => b.fireCount - a.fireCount);

    // Calculate percentiles
    const sortedLatencies = [...allLatencies].sort((a, b) => a - b);
    const p50 = this.percentile(sortedLatencies, 50);
    const p95 = this.percentile(sortedLatencies, 95);
    const p99 = this.percentile(sortedLatencies, 99);
    const avg = allLatencies.length > 0
      ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length
      : 0;

    // Events per minute (based on last 5 minutes)
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const recentTimestamps = this.eventTimestamps.filter(t => t > fiveMinutesAgo);
    const eventsPerMinute = recentTimestamps.length / 5;

    return {
      totalEvents,
      // null, not 100 — "no data" is not "perfectly healthy".
      successRate: totalEvents > 0 ? (successCount / totalEvents) * 100 : null,
      avgLatency: avg,
      p50Latency: p50,
      p95Latency: p95,
      p99Latency: p99,
      eventsPerMinute,
      tags,
      lastUpdated: now,
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Return current stats
   */
  private handleGetStats(): Response {
    return new Response(JSON.stringify(this.calculateStats()), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Broadcast message to all connected WebSockets
   */
  private broadcast(message: object): void {
    const json = JSON.stringify(message);
    for (const ws of this.sessions) {
      try {
        ws.send(json);
      } catch {
        // Remove dead connections
        this.sessions.delete(ws);
      }
    }
  }

  /**
   * Persist state to durable storage
   */
  private async persistState(): Promise<void> {
    await this.state.storage.put('rum_state', {
      events: this.events.slice(-MAX_EVENTS),
      tagStats: Array.from(this.tagStats.entries()),
      containerId: this.containerId,
    });
  }
}

export default RUMDurableObject;
