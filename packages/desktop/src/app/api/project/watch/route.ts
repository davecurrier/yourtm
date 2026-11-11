import { NextResponse } from 'next/server';
import { startWatching, stopWatching, onFileChange, getWatchStatus } from '@/lib/file-watcher';

/**
 * GET /api/project/watch - Server-Sent Events for file changes
 *
 * Usage:
 * const eventSource = new EventSource('/api/project/watch');
 * eventSource.onmessage = (e) => {
 *   const data = JSON.parse(e.data);
 *   console.log('File changed:', data.filename);
 * };
 */
export async function GET() {
  // Start watching if not already
  await startWatching();

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial status
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', status: getWatchStatus() })}\n\n`));

      // Subscribe to file changes
      unsubscribe = onFileChange((event, filename) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: event, filename })}\n\n`));
        } catch (error) {
          // Stream closed
        }
      });

      // Send heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);
    },

    cancel() {
      if (unsubscribe) {
        unsubscribe();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

/**
 * POST /api/project/watch - Control the watcher
 *
 * Body: { action: 'start' | 'stop' | 'status' }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'start':
        await startWatching();
        return NextResponse.json({ success: true, status: getWatchStatus() });

      case 'stop':
        stopWatching();
        return NextResponse.json({ success: true, status: getWatchStatus() });

      case 'status':
        return NextResponse.json({ success: true, status: getWatchStatus() });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Watch API] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
