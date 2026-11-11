import { NextRequest, NextResponse } from 'next/server';

// In-memory store for telemetry events (in production, use Redis or similar)
interface TelemetryEvent {
  id: string;
  type: string;
  containerId: string;
  tagId: string;
  tagName?: string;
  timestamp: number;
  latency: number;
  success: boolean;
  error?: string;
  zone?: string;
  trigger?: string;
  receivedAt: number;
  pageUrl?: string;
  userAgent?: string;
}

// Circular buffer for recent events
const MAX_EVENTS = 500;
const events: TelemetryEvent[] = [];
const listeners: Set<(event: TelemetryEvent) => void> = new Set();

/**
 * Headers that let a page on a public HTTPS origin beacon telemetry to this
 * loopback server.
 *
 * Chrome's Private Network Access blocks public -> loopback requests unless the
 * local server answers a preflight with `Access-Control-Allow-Private-Network`.
 * Without it the browser drops the request silently — sendBeacon() still
 * returns true — and preview mode looks broken with no error anywhere.
 *
 * This only ever exposes the local preview buffer, and only while the desktop
 * app is running.
 */
const PREVIEW_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Private-Network': 'true',
  'Access-Control-Max-Age': '86400',
};

/**
 * OPTIONS /api/preview/telemetry - CORS + Private Network Access preflight.
 */
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: PREVIEW_CORS_HEADERS });
}

/**
 * POST /api/preview/telemetry - Receive telemetry from browser/worker
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle single event or array
    const incoming = Array.isArray(body) ? body : [body];

    for (const event of incoming) {
      const telemetryEvent: TelemetryEvent = {
        id: `${event.tagId}-${event.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        type: event.type || 'tag_execution',
        containerId: event.containerId || 'unknown',
        tagId: event.tagId,
        tagName: event.tagName || event.tagId,
        timestamp: event.timestamp || Date.now(),
        latency: event.latency || 0,
        success: event.success !== false,
        error: event.error,
        zone: event.zone,
        trigger: event.trigger,
        receivedAt: Date.now(),
        pageUrl: event.pageUrl || request.headers.get('referer') || undefined,
        userAgent: event.userAgent || request.headers.get('user-agent') || undefined,
      };

      // Add to circular buffer
      events.push(telemetryEvent);
      if (events.length > MAX_EVENTS) {
        events.shift();
      }

      // Notify all listeners
      listeners.forEach(listener => {
        try {
          listener(telemetryEvent);
        } catch {
          // Ignore listener errors
        }
      });
    }

    return NextResponse.json({
      status: 'ok',
      count: incoming.length,
      totalEvents: events.length
    }, { headers: PREVIEW_CORS_HEADERS });
  } catch (error) {
    console.error('[Telemetry API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process telemetry' },
      { status: 400 }
    );
  }
}

/**
 * GET /api/preview/telemetry - Get recent events or subscribe to stream
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const stream = url.searchParams.get('stream') === 'true';
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const since = parseInt(url.searchParams.get('since') || '0');

  if (stream) {
    // Server-Sent Events stream
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;

    const readable = new ReadableStream({
      start(controller) {
        // Send recent events first
        const recentEvents = events
          .filter(e => e.timestamp > since)
          .slice(-limit);

        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'init', events: recentEvents })}\n\n`
        ));

        // Subscribe to new events
        const listener = (event: TelemetryEvent) => {
          try {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'event', event })}\n\n`
            ));
          } catch {
            // Stream closed
          }
        };

        listeners.add(listener);
        unsubscribe = () => listeners.delete(listener);

        // Heartbeat every 15 seconds
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          } catch {
            clearInterval(heartbeat);
          }
        }, 15000);
      },

      cancel() {
        if (unsubscribe) {
          unsubscribe();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // Return recent events
  const recentEvents = events
    .filter(e => e.timestamp > since)
    .slice(-limit);

  return NextResponse.json({
    events: recentEvents,
    total: events.length,
  });
}

/**
 * DELETE /api/preview/telemetry - Clear all events
 */
export async function DELETE() {
  events.length = 0;
  return NextResponse.json({ status: 'cleared' });
}

// Export for use by other modules
export { events, listeners };
export type { TelemetryEvent };
