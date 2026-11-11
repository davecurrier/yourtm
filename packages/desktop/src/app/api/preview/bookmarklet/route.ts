import { NextResponse } from 'next/server';

/**
 * GET /api/preview/bookmarklet - Generate preview mode bookmarklet
 *
 * This returns a bookmarklet script that can be dragged to the bookmarks bar.
 * When clicked on a page with YourTM, it hooks into the runtime and sends
 * telemetry to the desktop app.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const endpoint = url.searchParams.get('endpoint') || 'http://localhost:3344/api/preview/telemetry';

  // The bookmarklet script - minified and URL-encoded
  const script = `
(function() {
  if (window.__YTM_PREVIEW_ACTIVE__) {
    alert('YourTM Preview already active!');
    return;
  }
  window.__YTM_PREVIEW_ACTIVE__ = true;

  var endpoint = '${endpoint}';
  var originalRegisterTag = window.YTM && window.YTM.registerTag;
  var containerId = 'unknown';

  // Send telemetry event
  function sendEvent(event) {
    try {
      var data = JSON.stringify(event);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, data);
      } else {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: data,
          keepalive: true
        });
      }
    } catch (e) {
      console.warn('[YTM Preview] Failed to send:', e);
    }
  }

  // Wrap tag execution
  function wrapTag(tag) {
    var originalCode = tag.code;
    if (typeof originalCode !== 'function') return tag;

    tag.code = function(context) {
      var start = performance.now();
      var success = true;
      var error = null;

      try {
        var result = originalCode.call(this, context);

        // Handle async tags
        if (result && typeof result.then === 'function') {
          return result.then(function(r) {
            sendEvent({
              type: 'tag_execution',
              containerId: containerId,
              tagId: tag.id,
              tagName: tag.name || tag.id,
              timestamp: Date.now(),
              latency: performance.now() - start,
              success: true,
              pageUrl: window.location.href
            });
            return r;
          }).catch(function(e) {
            sendEvent({
              type: 'tag_execution',
              containerId: containerId,
              tagId: tag.id,
              tagName: tag.name || tag.id,
              timestamp: Date.now(),
              latency: performance.now() - start,
              success: false,
              error: e.message || String(e),
              pageUrl: window.location.href
            });
            throw e;
          });
        }

        return result;
      } catch (e) {
        success = false;
        error = e.message || String(e);
        throw e;
      } finally {
        if (success || error) {
          sendEvent({
            type: 'tag_execution',
            containerId: containerId,
            tagId: tag.id,
            tagName: tag.name || tag.id,
            timestamp: Date.now(),
            latency: performance.now() - start,
            success: success,
            error: error,
            pageUrl: window.location.href
          });
        }
      }
    };

    return tag;
  }

  // Hook into YTM
  if (window.YTM) {
    // Try to get container ID from runtime state
    if (window.YTM._state && window.YTM._state.containerId) {
      containerId = window.YTM._state.containerId;
    }

    // Wrap existing tags
    if (window.YTM._state && window.YTM._state.tags) {
      window.YTM._state.tags.forEach(function(tag, id) {
        wrapTag(tag);
      });
    }

    // Hook registerTag for new tags
    window.YTM.registerTag = function(tag) {
      wrapTag(tag);
      if (originalRegisterTag) {
        return originalRegisterTag.call(this, tag);
      }
    };

    // Notify connection
    sendEvent({
      type: 'preview_connected',
      containerId: containerId,
      timestamp: Date.now(),
      pageUrl: window.location.href,
      success: true,
      latency: 0
    });

    // Visual indicator
    var indicator = document.createElement('div');
    indicator.id = 'ytm-preview-indicator';
    indicator.innerHTML = '<span style="margin-right:8px">●</span> YourTM Preview Active';
    indicator.style.cssText = 'position:fixed;bottom:20px;right:20px;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:white;padding:10px 16px;border-radius:8px;font-family:system-ui,sans-serif;font-size:13px;font-weight:600;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.15);cursor:pointer;';
    indicator.onclick = function() {
      window.__YTM_PREVIEW_ACTIVE__ = false;
      indicator.remove();
      if (originalRegisterTag) {
        window.YTM.registerTag = originalRegisterTag;
      }
      alert('YourTM Preview disconnected');
    };
    document.body.appendChild(indicator);

  } else {
    alert('YourTM not found on this page. Make sure the container is loaded.');
    window.__YTM_PREVIEW_ACTIVE__ = false;
  }
})();
  `.trim();

  // Create bookmarklet URL
  const bookmarklet = 'javascript:' + encodeURIComponent(script.replace(/\s+/g, ' '));

  return NextResponse.json({
    bookmarklet,
    script,
    instructions: 'Drag this link to your bookmarks bar, then click it on any page with YourTM to enable preview mode.',
  });
}
