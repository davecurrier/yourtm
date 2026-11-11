"use client";

import { useEffect, useState, useCallback, useRef } from 'react';

interface FileChangeEvent {
  type: 'change' | 'rename' | 'connected';
  filename?: string;
  status?: {
    watching: boolean;
    path: string | null;
  };
}

interface UseFileWatcherOptions {
  enabled?: boolean;
  onFileChange?: (filename: string, type: 'change' | 'rename') => void;
}

export function useFileWatcher(options: UseFileWatcherOptions = {}) {
  const { enabled = true, onFileChange } = options;
  const [connected, setConnected] = useState(false);
  const [lastChange, setLastChange] = useState<{ filename: string; type: string; time: Date } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const callbackRef = useRef(onFileChange);

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = onFileChange;
  }, [onFileChange]);

  // Connect to SSE
  useEffect(() => {
    if (!enabled) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
        setConnected(false);
      }
      return;
    }

    const eventSource = new EventSource('/api/project/watch');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as FileChangeEvent;

        if (data.type === 'connected') {
          setConnected(true);
          return;
        }

        if (data.filename && (data.type === 'change' || data.type === 'rename')) {
          setLastChange({
            filename: data.filename,
            type: data.type,
            time: new Date(),
          });

          callbackRef.current?.(data.filename, data.type);
        }
      } catch (err) {
        console.error('[useFileWatcher] Parse error:', err);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      // EventSource will auto-reconnect
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [enabled]);

  // Manual refresh trigger
  const refresh = useCallback(() => {
    // Dispatch a custom event that components can listen to
    window.dispatchEvent(new CustomEvent('yourtm:refresh'));
  }, []);

  return {
    connected,
    lastChange,
    refresh,
  };
}

/**
 * Hook to refresh data when files change
 */
export function useRefreshOnFileChange(refreshFn: () => void, debounceMs = 500) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useFileWatcher({
    onFileChange: useCallback(() => {
      // Debounce rapid changes
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        refreshFn();
      }, debounceMs);
    }, [refreshFn, debounceMs]),
  });

  // Also listen for manual refresh events
  useEffect(() => {
    const handleRefresh = () => refreshFn();
    window.addEventListener('yourtm:refresh', handleRefresh);
    return () => window.removeEventListener('yourtm:refresh', handleRefresh);
  }, [refreshFn]);
}
