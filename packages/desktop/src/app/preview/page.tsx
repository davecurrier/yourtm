"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Trash2, Activity, CheckCircle, XCircle, Clock, Zap, AlertTriangle, Filter, ArrowDown, Square, Loader2, Globe, Wifi, WifiOff, Radio, RadioTower, List, Variable, Gauge, ChevronRight, Timer } from 'lucide-react';

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
  triggerType?: string;
  receivedAt: number;
  pageUrl?: string;
  // Enhanced telemetry fields
  triggerEvalTime?: number;
  variableResolveTime?: number;
  totalTime?: number;
  // Variables can be either direct values or {value, resolveTime} objects
  variables?: Record<string, unknown>;
  variableCount?: number;
}

interface TagStats {
  tagId: string;
  tagName: string;
  fireCount: number;
  successCount: number;
  errorCount: number;
  totalLatency: number;
  latencies: number[];
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

interface DevServerStatus {
  running: boolean;
  port: number;
  projectPath: string;
  isValidProject: boolean;
  startTime: number | null;
}

interface DeploymentInfo {
  deployed: boolean;
  workerUrl?: string;
  workerName?: string;
  environment?: string;
  deployedAt?: string;
  version?: string;
  mode?: string;
  rumEnabled?: boolean;
  rumSampleRate?: number;
}

export default function PreviewPage() {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [devServer, setDevServer] = useState<DevServerStatus | null>(null);
  const [devServerLoading, setDevServerLoading] = useState(false);
  const [workerUrl, setWorkerUrl] = useState('');
  const [savedWorkerUrl, setSavedWorkerUrl] = useState('');
  const [connectionMode, setConnectionMode] = useState<'local' | 'production'>('local');
  const [serverStats, setServerStats] = useState<AggregateStats | null>(null);
  const [deployment, setDeployment] = useState<DeploymentInfo | null>(null);
  const [autoConnecting, setAutoConnecting] = useState(false);
  const [rumEnabled, setRumEnabled] = useState(false);
  const [rumSampleRate, setRumSampleRate] = useState(0.05);
  const [rumLoading, setRumLoading] = useState(false);
  const [rumError, setRumError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'timeline' | 'variables' | 'performance'>('timeline');
  const [selectedEvent, setSelectedEvent] = useState<TelemetryEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const eventsContainerRef = useRef<HTMLDivElement>(null);
  const pausedEventsRef = useRef<TelemetryEvent[]>([]);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const [usePolling, setUsePolling] = useState(false);
  const connectionStartTime = useRef<number>(0);
  const telemetryPathRef = useRef<string>('/ytm');

  // Fetch deployment info and auto-connect if available
  useEffect(() => {
    async function fetchDeployment() {
      try {
        const res = await fetch('/api/project/deployment');
        const data = await res.json();
        setDeployment(data);

        // Set RUM state from deployment
        if (data.rumEnabled !== undefined) {
          setRumEnabled(data.rumEnabled);
        }
        if (data.rumSampleRate !== undefined) {
          setRumSampleRate(data.rumSampleRate);
        }

        if (data.deployed && data.workerUrl) {
          // Use deployed worker URL
          setWorkerUrl(data.workerUrl);
          setSavedWorkerUrl(data.workerUrl);

          // Auto-connect if RUM is enabled
          if (data.rumEnabled) {
            setAutoConnecting(true);
          }
        } else {
          // Fall back to localStorage
          const saved = localStorage.getItem('ytm_worker_url');
          if (saved) {
            setSavedWorkerUrl(saved);
            setWorkerUrl(saved);
          }
        }
      } catch (err) {
        console.error('Failed to fetch deployment info:', err);
        // Fall back to localStorage
        const saved = localStorage.getItem('ytm_worker_url');
        if (saved) {
          setSavedWorkerUrl(saved);
          setWorkerUrl(saved);
        }
      }
    }
    fetchDeployment();
  }, []);

  // Start HTTP polling for telemetry (fallback when WebSocket not available)
  const startPolling = useCallback((baseUrl: string, apiPath: string = '/ytm') => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    const poll = async () => {
      if (paused) return;

      try {
        // Fetch stats
        const statsRes = await fetch(`${baseUrl}${apiPath}/telemetry/stats`);
        if (statsRes.ok) {
          const stats = await statsRes.json();
          setServerStats(stats);
        }

        // Fetch recent events
        const eventsRes = await fetch(`${baseUrl}${apiPath}/telemetry/events?limit=100`);
        if (eventsRes.ok) {
          const data = await eventsRes.json();
          if (data.events && data.events.length > 0) {
            setEvents(prev => {
              // Only include events that happened after we connected
              const sessionStart = connectionStartTime.current;
              const existingIds = new Set(prev.map(e => `${e.receivedAt || e.timestamp}-${e.tagId}`));

              const newEvents = data.events.filter((e: TelemetryEvent) => {
                const eventTime = e.receivedAt || e.timestamp;
                // Filter: must be after session start AND not already in our list
                return eventTime >= sessionStart &&
                       !existingIds.has(`${eventTime}-${e.tagId}`);
              });

              if (newEvents.length === 0) return prev;
              return [...prev.slice(-450), ...newEvents];
            });
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    // Initial poll
    poll();
    // Poll every 2 seconds
    pollingRef.current = setInterval(poll, 2000);
  }, [paused]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Connect to production worker - try WebSocket first, fall back to polling
  const connectToWorker = useCallback(async (url: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    stopPolling();

    setConnecting(true);
    setConnected(false);
    setUsePolling(false);
    setEvents([]); // Clear previous events

    // Record when this session started - only show events after this time
    connectionStartTime.current = Date.now();

    const baseUrl = new URL(url).origin;

    // First, check if the worker is reachable via health endpoint
    // Try /ytm/health first (custom workers), fall back to /_ytm/health (template workers)
    let healthPath = '/ytm/health';
    try {
      console.log('Checking worker health at:', `${baseUrl}${healthPath}`);
      let healthRes = await fetch(`${baseUrl}${healthPath}`, {
        mode: 'cors',
        headers: { 'Accept': 'application/json' },
      });

      // If /ytm/health fails, try /_ytm/health
      if (!healthRes.ok) {
        healthPath = '/_ytm/health';
        console.log('Trying alternate health path:', `${baseUrl}${healthPath}`);
        healthRes = await fetch(`${baseUrl}${healthPath}`, {
          mode: 'cors',
          headers: { 'Accept': 'application/json' },
        });
      }

      if (!healthRes.ok) {
        throw new Error(`Worker health check failed: ${healthRes.status}`);
      }
      const healthData = await healthRes.json();
      console.log('Worker health:', healthData);
    } catch (err) {
      console.error('Worker not reachable:', err);
      alert(`Cannot connect to worker at ${baseUrl}\n\nMake sure:\n1. The worker is deployed\n2. workers.dev subdomain is enabled\n3. The URL is correct\n\nError: ${err instanceof Error ? err.message : String(err)}`);
      setConnecting(false);
      return;
    }

    // Determine telemetry base path based on which health endpoint worked
    telemetryPathRef.current = healthPath.replace('/health', '');

    // Try WebSocket connection first
    try {
      const wsUrl = baseUrl.replace(/^http/, 'ws') + '/_ytm/preview/stream';
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Set a timeout for WebSocket connection
      const wsTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.log('WebSocket timeout, falling back to polling');
          ws.close();
          setUsePolling(true);
          setConnected(true);
          setConnecting(false);
          setSavedWorkerUrl(url);
          localStorage.setItem('ytm_worker_url', url);
          setConnectionMode('production');
          startPolling(baseUrl, telemetryPathRef.current);
        }
      }, 3000);

      ws.onopen = () => {
        clearTimeout(wsTimeout);
        setConnected(true);
        setConnecting(false);
        setSavedWorkerUrl(url);
        localStorage.setItem('ytm_worker_url', url);
        setConnectionMode('production');
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);

          if (data.type === 'init') {
            setEvents(data.recentEvents || data.events || []);
            if (data.stats) setServerStats(data.stats);
          } else if (data.type === 'telemetry' || data.type === 'event') {
            const event = data.event || data;
            const uiEvent = {
              ...event,
              success: event.success !== false,
              latency: event.latency || 0,
              tagName: event.tagName || event.tagId || 'Unknown Tag'
            };

            if (paused) {
              pausedEventsRef.current.push(uiEvent);
            } else {
              setEvents(prev => [...prev.slice(-499), uiEvent]);
            }
          } else if (data.type === 'stats') {
            setServerStats(data.stats);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = () => {
        clearTimeout(wsTimeout);
        // Fall back to polling
        console.log('WebSocket error, falling back to polling');
        setUsePolling(true);
        setConnected(true);
        setConnecting(false);
        setSavedWorkerUrl(url);
        localStorage.setItem('ytm_worker_url', url);
        setConnectionMode('production');
        startPolling(baseUrl, telemetryPathRef.current);
      };

      ws.onclose = () => {
        if (!usePolling) {
          setConnected(false);
        }
        wsRef.current = null;
      };
    } catch (err) {
      // WebSocket not supported, use polling
      console.log('WebSocket failed, using polling:', err);
      setUsePolling(true);
      setConnected(true);
      setConnecting(false);
      setSavedWorkerUrl(url);
      localStorage.setItem('ytm_worker_url', url);
      setConnectionMode('production');
      startPolling(baseUrl, telemetryPathRef.current);
    }
  }, [paused, startPolling, stopPolling, usePolling]);

  const disconnectFromWorker = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopPolling();
    setConnected(false);
    setConnectionMode('local');
    setUsePolling(false);
  }, [stopPolling]);

  // Toggle RUM on/off
  const toggleRUM = useCallback(async (enable: boolean) => {
    if (!deployment?.deployed || !deployment.workerUrl) {
      setRumError('Deploy the worker first before enabling RUM');
      return;
    }

    setRumLoading(true);
    setRumError(null);

    try {
      const res = await fetch('/api/project/rum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: enable,
          sampleRate: rumSampleRate,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setRumError(data.error || 'Failed to toggle RUM');
        return;
      }

      setRumEnabled(enable);

      // Update deployment info
      setDeployment(prev => prev ? {
        ...prev,
        rumEnabled: enable,
        rumSampleRate: enable ? rumSampleRate : 0,
      } : null);

      // If enabling, auto-connect to telemetry
      if (enable && deployment.workerUrl) {
        await connectToWorker(deployment.workerUrl);
      } else if (!enable) {
        disconnectFromWorker();
      }
    } catch (err) {
      setRumError(err instanceof Error ? err.message : 'Failed to toggle RUM');
    } finally {
      setRumLoading(false);
    }
  }, [deployment, rumSampleRate, connectToWorker, disconnectFromWorker]);

  // Auto-connect when deployment info is loaded
  useEffect(() => {
    if (autoConnecting && workerUrl && !connected && !connecting) {
      setAutoConnecting(false);
      connectToWorker(workerUrl);
    }
  }, [autoConnecting, workerUrl, connected, connecting, connectToWorker]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [stopPolling]);

  // Fetch dev server status
  const fetchDevServerStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/preview/dev-server');
      const data = await res.json();
      setDevServer(data);
    } catch (err) {
      console.error('Failed to fetch dev server status:', err);
    }
  }, []);

  // Start dev server
  const startDevServer = async () => {
    setDevServerLoading(true);
    try {
      const res = await fetch('/api/preview/dev-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        await fetchDevServerStatus();
      }
    } catch (err) {
      console.error('Failed to start dev server:', err);
    } finally {
      setDevServerLoading(false);
    }
  };

  // Stop dev server
  const stopDevServer = async () => {
    setDevServerLoading(true);
    try {
      await fetch('/api/preview/dev-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      await fetchDevServerStatus();
    } catch (err) {
      console.error('Failed to stop dev server:', err);
    } finally {
      setDevServerLoading(false);
    }
  };

  // Poll dev server status
  useEffect(() => {
    fetchDevServerStatus();
    const interval = setInterval(fetchDevServerStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchDevServerStatus]);

  // Calculate stats from events
  const stats = useCallback((): { tags: TagStats[]; summary: { total: number; success: number; errors: number; avgLatency: number; p95: number } } => {
    const tagMap = new Map<string, TagStats>();

    events.forEach(event => {
      const existing = tagMap.get(event.tagId);
      if (existing) {
        existing.fireCount++;
        if (event.success) existing.successCount++;
        else existing.errorCount++;
        existing.totalLatency += event.latency;
        existing.latencies.push(event.latency);
      } else {
        tagMap.set(event.tagId, {
          tagId: event.tagId,
          tagName: event.tagName || event.tagId,
          fireCount: 1,
          successCount: event.success ? 1 : 0,
          errorCount: event.success ? 0 : 1,
          totalLatency: event.latency,
          latencies: [event.latency],
        });
      }
    });

    const tags = Array.from(tagMap.values()).sort((a, b) => b.fireCount - a.fireCount);

    // Calculate summary
    const allLatencies = events.map(e => e.latency).sort((a, b) => a - b);
    const p95Index = Math.floor(allLatencies.length * 0.95);

    return {
      tags,
      summary: {
        total: events.length,
        success: events.filter(e => e.success).length,
        errors: events.filter(e => !e.success).length,
        avgLatency: events.length > 0
          ? events.reduce((sum, e) => sum + e.latency, 0) / events.length
          : 0,
        p95: allLatencies[p95Index] || 0,
      }
    };
  }, [events]);

  // Connect to SSE stream for local dev server events
  // Note: This is separate from production connection - doesn't affect `connected` state
  useEffect(() => {
    const eventSource = new EventSource('/api/preview/telemetry?stream=true');
    eventSourceRef.current = eventSource;

    // SSE is just for local dev events, don't set connected state here
    // connected state is only for production WebSocket connection

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        if (data.type === 'init') {
          // Only update events if we're in local mode (not connected to production)
          if (connectionMode === 'local') {
            setEvents(data.events || []);
          }
        } else if (data.type === 'event') {
          // Only process local events if in local mode
          if (connectionMode === 'local') {
            if (paused) {
              pausedEventsRef.current.push(data.event);
            } else {
              setEvents(prev => [...prev.slice(-499), data.event]);
            }
          }
        }
      } catch (err) {
        console.error('Failed to parse event:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [paused, connectionMode]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && eventsContainerRef.current) {
      eventsContainerRef.current.scrollTop = eventsContainerRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // Resume from pause
  const handleResume = () => {
    setPaused(false);
    setEvents(prev => [...prev, ...pausedEventsRef.current]);
    pausedEventsRef.current = [];
  };

  // Clear events
  const handleClear = async () => {
    await fetch('/api/preview/telemetry', { method: 'DELETE' });
    setEvents([]);
  };

  // Filter events
  const filteredEvents = events.filter(event => {
    if (showErrors && event.success) return false;
    if (filter) {
      const searchLower = filter.toLowerCase();
      return (
        event.tagId.toLowerCase().includes(searchLower) ||
        (event.tagName?.toLowerCase().includes(searchLower)) ||
        (event.zone?.toLowerCase().includes(searchLower)) ||
        (event.trigger?.toLowerCase().includes(searchLower))
      );
    }
    return true;
  });

  const { tags, summary } = stats();

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  const formatLatency = (ms: number) => {
    if (ms === 0) return '0ms';
    if (ms < 0.01) return `${ms.toFixed(3)}ms`;  // 0.005ms
    if (ms < 1) return `${ms.toFixed(2)}ms`;     // 0.20ms
    if (ms < 10) return `${ms.toFixed(1)}ms`;    // 5.2ms
    return `${Math.round(ms)}ms`;                // 150ms
  };

  const getLatencyColor = (ms: number) => {
    if (ms < 20) return 'text-emerald-400';
    if (ms < 100) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div className="h-full flex flex-col -m-8">
      {/* Header */}
      <div className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-950/30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity className={connected ? 'text-emerald-400' : 'text-slate-600'} size={20} />
            <h1 className="text-lg font-bold text-slate-100">Preview Mode</h1>
          </div>

          {/* Production Connection Status */}
          {connectionMode === 'production' && connected ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
                <Globe size={14} className="text-emerald-400" />
                <span className="text-emerald-400 text-sm font-medium max-w-[200px] truncate" title={savedWorkerUrl}>
                  {savedWorkerUrl.replace(/^https?:\/\//, '')}
                </span>
                {usePolling ? (
                  <span className="text-xs text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded">polling</span>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </div>
              <button
                onClick={disconnectFromWorker}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-700 text-slate-400 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 border border-slate-600 transition-colors text-sm font-medium"
              >
                <WifiOff size={14} />
                Disconnect
              </button>
            </div>
          ) : connectionMode === 'local' && devServer?.running ? (
            <div className="flex items-center gap-2">
              <button
                onClick={stopDevServer}
                disabled={devServerLoading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-colors text-sm font-medium group"
              >
                {devServerLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse group-hover:bg-red-400" />
                    <span className="group-hover:hidden">Dev Server :{ devServer.port}</span>
                    <span className="hidden group-hover:inline">
                      <Square size={12} className="inline mr-1" />
                      Stop
                    </span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
              connecting ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'
            }`}>
              {connecting ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-slate-500" />
                  Not Connected
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Filter */}
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter tags..."
              className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 w-48"
            />
          </div>

          {/* Show Errors Only */}
          <button
            onClick={() => setShowErrors(!showErrors)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showErrors
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle size={14} />
            Errors Only
          </button>

          {/* Auto-scroll */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              autoScroll
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowDown size={14} />
            Auto-scroll
          </button>

          {/* Pause/Resume */}
          <button
            onClick={paused ? handleResume : () => setPaused(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              paused
                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
            }`}
          >
            {paused ? (
              <>
                <Play size={14} />
                Resume {pausedEventsRef.current.length > 0 && `(${pausedEventsRef.current.length})`}
              </>
            ) : (
              <>
                <Pause size={14} />
                Pause
              </>
            )}
          </button>

          {/* Clear */}
          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Trash2 size={14} />
            Clear
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Events Timeline */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab Bar */}
          <div className="h-12 border-b border-slate-800 flex items-center px-6 bg-slate-900/50 gap-1">
            <button
              onClick={() => setActiveTab('timeline')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'timeline'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <List size={16} />
              Timeline
            </button>
            <button
              onClick={() => setActiveTab('variables')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'variables'
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Variable size={16} />
              Variables
            </button>
            <button
              onClick={() => setActiveTab('performance')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'performance'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Gauge size={16} />
              Performance
            </button>
          </div>

          {/* Summary Stats Bar */}
          <div className="h-14 border-b border-slate-800 flex items-center gap-8 px-6 bg-slate-900/50">
            {connectionMode === 'production' && serverStats ? (
              // Production RUM stats from Durable Object
              <>
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-emerald-400" />
                  <span className="text-slate-400 text-sm">Events:</span>
                  <span className="text-slate-100 font-semibold">{serverStats.totalEvents.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-sky-400" />
                  <span className="text-slate-400 text-sm">/min:</span>
                  <span className="text-sky-400 font-semibold">{serverStats.eventsPerMinute.toFixed(1)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-400" />
                  <span className="text-slate-400 text-sm">Success:</span>
                  <span className="text-emerald-400 font-semibold">{serverStats.successRate.toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-amber-400" />
                  <span className="text-slate-400 text-sm">P50:</span>
                  <span className={`font-semibold ${getLatencyColor(serverStats.p50Latency)}`}>
                    {formatLatency(serverStats.p50Latency)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-sm">P95:</span>
                  <span className={`font-semibold ${getLatencyColor(serverStats.p95Latency)}`}>
                    {formatLatency(serverStats.p95Latency)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-sm">P99:</span>
                  <span className={`font-semibold ${getLatencyColor(serverStats.p99Latency)}`}>
                    {formatLatency(serverStats.p99Latency)}
                  </span>
                </div>
              </>
            ) : (
              // Local stats from client-side events
              <>
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-sky-400" />
                  <span className="text-slate-400 text-sm">Tags Fired:</span>
                  <span className="text-slate-100 font-semibold">{summary.total}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-400" />
                  <span className="text-slate-400 text-sm">Success:</span>
                  <span className="text-emerald-400 font-semibold">
                    {summary.total > 0 ? ((summary.success / summary.total) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle size={14} className="text-red-400" />
                  <span className="text-slate-400 text-sm">Errors:</span>
                  <span className="text-red-400 font-semibold">{summary.errors}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-amber-400" />
                  <span className="text-slate-400 text-sm">Avg:</span>
                  <span className={`font-semibold ${getLatencyColor(summary.avgLatency)}`}>
                    {formatLatency(summary.avgLatency)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-sm">P95:</span>
                  <span className={`font-semibold ${getLatencyColor(summary.p95)}`}>
                    {formatLatency(summary.p95)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Events List */}
          <div
            ref={eventsContainerRef}
            className="flex-1 overflow-y-auto bg-slate-950/50"
          >
            {filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8">
                <Activity size={48} className="mb-4 opacity-50" />
                <p className="text-lg font-medium text-slate-300">
                  {connected ? 'Waiting for tag events...' : 'Connect to Real User Monitoring'}
                </p>
                <p className="text-sm mt-1 text-center max-w-lg text-slate-500">
                  {connected
                    ? 'Real user data will stream here as tags fire on your production site'
                    : 'Connect to your Cloudflare Worker to see real-time tag execution from all users'
                  }
                </p>

                {!connected && (
                  <div className="mt-8 max-w-xl w-full space-y-6">
                    {/* Production RUM Connection */}
                    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                      <div className="flex items-center gap-2 text-emerald-400 mb-3">
                        <RadioTower size={18} />
                        <h3 className="font-semibold">Real User Monitoring</h3>
                        {rumEnabled && (
                          <span className="ml-auto text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded flex items-center gap-1">
                            <Radio size={10} className="animate-pulse" />
                            Active ({(rumSampleRate * 100).toFixed(0)}% sampling)
                          </span>
                        )}
                        {!rumEnabled && deployment?.deployed && (
                          <span className="ml-auto text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded">
                            Disabled
                          </span>
                        )}
                      </div>

                      {deployment?.deployed && deployment.workerUrl ? (
                        // Show deployed worker with RUM controls
                        <div className="space-y-4">
                          <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                            <div className="text-xs text-slate-500 mb-1">Deployed Worker</div>
                            <div className="text-emerald-400 font-mono text-sm break-all">
                              {deployment.workerUrl}
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                              <span>{deployment.workerName}</span>
                              <span>•</span>
                              <span>{deployment.version}</span>
                              <span>•</span>
                              <span>{deployment.deployedAt ? new Date(deployment.deployedAt).toLocaleDateString() : ''}</span>
                            </div>
                          </div>

                          {/* RUM Error Message */}
                          {rumError && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                              {rumError}
                            </div>
                          )}

                          {/* Sample Rate Selector (only when RUM is off) */}
                          {!rumEnabled && (
                            <div className="flex items-center gap-3">
                              <span className="text-slate-400 text-sm">Sample rate:</span>
                              <select
                                value={rumSampleRate}
                                onChange={(e) => setRumSampleRate(parseFloat(e.target.value))}
                                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
                              >
                                <option value={0.01}>1%</option>
                                <option value={0.05}>5%</option>
                                <option value={0.1}>10%</option>
                                <option value={0.25}>25%</option>
                                <option value={0.5}>50%</option>
                                <option value={1}>100%</option>
                              </select>
                              <span className="text-slate-500 text-xs">of production traffic</span>
                            </div>
                          )}

                          {/* One-Click RUM Toggle */}
                          <button
                            onClick={() => toggleRUM(!rumEnabled)}
                            disabled={rumLoading}
                            className={`flex items-center justify-center gap-2 w-full px-5 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              rumEnabled
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30'
                                : 'bg-emerald-500 text-white hover:bg-emerald-600'
                            }`}
                          >
                            {rumLoading ? (
                              <>
                                <Loader2 size={18} className="animate-spin" />
                                {rumEnabled ? 'Stopping RUM...' : 'Starting RUM...'}
                              </>
                            ) : rumEnabled ? (
                              <>
                                <Radio size={18} />
                                Stop Monitoring
                              </>
                            ) : (
                              <>
                                <RadioTower size={18} />
                                Start Real User Monitoring
                              </>
                            )}
                          </button>

                          <p className="text-slate-500 text-xs text-center">
                            {rumEnabled
                              ? 'Collecting telemetry from sampled production users'
                              : 'One click to deploy and start monitoring real users'}
                          </p>

                          {/* If RUM is active but not connected, show connect button */}
                          {rumEnabled && !connected && !connecting && (
                            <button
                              onClick={() => connectToWorker(deployment.workerUrl!)}
                              className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 font-medium hover:bg-sky-500/30 transition-colors text-sm"
                            >
                              <Wifi size={16} />
                              View Live Data
                            </button>
                          )}
                        </div>
                      ) : (
                        // No deployment found - show message
                        <div className="space-y-3">
                          <p className="text-slate-400 text-sm mb-4">
                            Deploy your worker first to enable Real User Monitoring.
                          </p>
                          <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50 text-center">
                            <p className="text-slate-500 text-sm">
                              Go to <span className="text-sky-400">Build</span> → Deploy to Production
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-px bg-slate-700" />
                      <span className="text-slate-500 text-xs uppercase tracking-wider">or</span>
                      <div className="flex-1 h-px bg-slate-700" />
                    </div>

                    {/* Local Dev Server */}
                    <div className="bg-slate-800/30 rounded-xl p-6 border border-slate-700/50">
                      <div className="flex items-center gap-2 text-sky-400 mb-3">
                        <Play size={18} />
                        <h3 className="font-semibold">Local Development</h3>
                      </div>
                      <p className="text-slate-400 text-sm mb-4">
                        Run the dev server for local testing with hot reload
                      </p>
                      {devServer?.isValidProject ? (
                        <button
                          onClick={startDevServer}
                          disabled={devServerLoading}
                          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 font-semibold hover:bg-sky-500/30 transition-colors disabled:opacity-50 text-sm"
                        >
                          {devServerLoading ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Play size={16} />
                          )}
                          Start Dev Server
                        </button>
                      ) : (
                        <div className="text-amber-400/70 text-sm text-center">
                          Link a project in Settings first
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {devServer?.running && (
                  <div className="mt-6 p-4 bg-slate-800/50 rounded-lg text-sm max-w-md">
                    <div className="flex items-center gap-2 text-emerald-400 mb-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Dev server running on port {devServer.port}
                    </div>
                    <p className="text-slate-400 text-xs">
                      Add these scripts to your test page:
                    </p>
                    <code className="block mt-2 text-xs text-sky-400 font-mono">
                      &lt;script src="http://localhost:{devServer.port}/core.js"&gt;&lt;/script&gt;
                    </code>
                    <code className="block mt-1 text-xs text-sky-400 font-mono">
                      &lt;script src="http://localhost:{devServer.port}/tags.js"&gt;&lt;/script&gt;
                    </code>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Timeline Tab */}
                {activeTab === 'timeline' && (
                  <div className="divide-y divide-slate-800/50">
                    {filteredEvents.map((event) => (
                      <div
                        key={event.id}
                        onClick={() => setSelectedEvent(selectedEvent?.id === event.id ? null : event)}
                        className={`px-6 py-4 hover:bg-slate-800/40 transition-all cursor-pointer group border-b border-slate-800/50 last:border-0 ${
                          !event.success ? 'bg-red-500/5' : ''
                        } ${selectedEvent?.id === event.id ? 'bg-slate-800/60' : ''}`}
                      >
                        <div className="flex items-center gap-6">
                          {/* Timestamp */}
                          <div className="flex items-center gap-3 min-w-[100px]">
                            <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                              {formatTime(event.timestamp)}
                            </span>
                          </div>

                          {/* Status Icon */}
                          <div className="flex-shrink-0 w-5 text-center">
                            {event.success ? (
                              <CheckCircle size={18} className="text-emerald-500/80 inline" />
                            ) : (
                              <XCircle size={18} className="text-red-500/80 inline" />
                            )}
                          </div>

                          {/* Tag Name & Error */}
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className={`font-semibold text-sm transition-colors ${selectedEvent?.id === event.id ? 'text-sky-400' : 'text-slate-200 group-hover:text-slate-100'}`}>
                              {event.tagName || event.tagId}
                            </span>
                            {event.error && (
                              <span className="text-xs text-red-400/80 mt-0.5 truncate max-w-md italic" title={event.error}>
                                {event.error}
                              </span>
                            )}
                          </div>

                          {/* Data Points Section */}
                          <div className="flex items-center gap-6 flex-shrink-0">
                            {/* Latency */}
                            <div className="flex flex-col items-end w-20">
                              <span className={`text-xs font-mono font-medium ${getLatencyColor(event.latency)}`}>
                                {formatLatency(event.latency)}
                              </span>
                              <span className="text-[10px] text-slate-600 uppercase tracking-tighter">Latency</span>
                            </div>

                            {/* Performance indicator */}
                            {event.triggerEvalTime !== undefined && (
                              <div className="flex flex-col items-end w-20 border-l border-slate-800/50 pl-4">
                                <span className="text-xs font-mono text-slate-400">
                                  {formatLatency(event.triggerEvalTime)}
                                </span>
                                <span className="text-[10px] text-slate-600 uppercase tracking-tighter">Eval</span>
                              </div>
                            )}

                            {/* Badges */}
                            <div className="flex items-center gap-2 min-w-[140px] justify-end border-l border-slate-800/50 pl-4">
                              {event.variableCount && event.variableCount > 0 && (
                                <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded text-[10px] font-bold uppercase tracking-tight">
                                  {event.variableCount} Vars
                                </span>
                              )}
                              {event.trigger && (
                                <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded text-[10px] font-bold uppercase tracking-tight">
                                  {event.trigger}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Expand indicator */}
                          <div className="w-6 flex justify-end">
                            <ChevronRight size={16} className={`text-slate-600 transition-all group-hover:text-slate-400 ${selectedEvent?.id === event.id ? 'rotate-90 text-sky-500' : ''}`} />
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {selectedEvent?.id === event.id && (
                          <div className="mt-6 ml-[162px] pb-2 space-y-4 border-l border-slate-700/50 pl-6">
                            {/* Page URL */}
                            {event.pageUrl && (
                              <div className="text-xs">
                                <span className="text-slate-500">Page: </span>
                                <span className="text-slate-300 font-mono">{event.pageUrl}</span>
                              </div>
                            )}

                            {/* Timing Breakdown */}
                            {(event.triggerEvalTime !== undefined || event.variableResolveTime !== undefined) && (
                              <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4">
                                <div className="text-xs text-slate-500 mb-2">Timing Breakdown</div>
                                <div className="flex gap-4 text-sm">
                                  {event.triggerEvalTime !== undefined && (
                                    <div>
                                      <span className="text-slate-400">Trigger: </span>
                                      <span className={getLatencyColor(event.triggerEvalTime)}>{formatLatency(event.triggerEvalTime)}</span>
                                    </div>
                                  )}
                                  {event.variableResolveTime !== undefined && (
                                    <div>
                                      <span className="text-slate-400">Variables: </span>
                                      <span className={getLatencyColor(event.variableResolveTime)}>{formatLatency(event.variableResolveTime)}</span>
                                    </div>
                                  )}
                                  <div>
                                    <span className="text-slate-400">Tag: </span>
                                    <span className={getLatencyColor(event.latency)}>{formatLatency(event.latency)}</span>
                                  </div>
                                  {event.totalTime !== undefined && (
                                    <div>
                                      <span className="text-slate-400">Total: </span>
                                      <span className={getLatencyColor(event.totalTime)}>{formatLatency(event.totalTime)}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Variables */}
                            {event.variables && Object.keys(event.variables).length > 0 && (
                              <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4">
                                <div className="text-xs text-slate-500 mb-2">Variables ({Object.keys(event.variables).length})</div>
                                <div className="space-y-1">
                                  {Object.entries(event.variables).map(([name, data]) => {
                                    // Handle both formats: direct value or {value, resolveTime} object
                                    const isObjectFormat = data && typeof data === 'object' && 'value' in data;
                                    const value = isObjectFormat ? data.value : data;
                                    const resolveTime = isObjectFormat ? data.resolveTime : undefined;
                                    const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');

                                    return (
                                      <div key={name} className="flex items-center gap-2 text-sm">
                                        <span className="text-purple-400 font-mono">{name}</span>
                                        <span className="text-slate-600">=</span>
                                        <span className="text-slate-200 font-mono truncate max-w-[300px]" title={displayValue}>
                                          {displayValue}
                                        </span>
                                        {resolveTime !== undefined && (
                                          <span className="text-xs text-slate-500 ml-auto">
                                            {formatLatency(resolveTime)}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Variables Tab */}
                {activeTab === 'variables' && (
                  <div className="p-6 space-y-4">
                    <div className="text-sm text-slate-400 mb-4">
                      Variables resolved across all tag executions
                    </div>
                    {(() => {
                      // Aggregate all variables across events
                      const variableMap = new Map<string, { values: unknown[]; totalResolveTime: number; count: number }>();
                      filteredEvents.forEach(event => {
                        if (event.variables) {
                          Object.entries(event.variables).forEach(([name, data]) => {
                            // Handle both formats: direct value or {value, resolveTime} object
                            const isObjectFormat = data && typeof data === 'object' && 'value' in data;
                            const value = isObjectFormat ? data.value : data;
                            const resolveTime = isObjectFormat ? (data.resolveTime || 0) : 0;

                            const existing = variableMap.get(name);
                            if (existing) {
                              existing.values.push(value);
                              existing.totalResolveTime += resolveTime;
                              existing.count++;
                            } else {
                              variableMap.set(name, {
                                values: [value],
                                totalResolveTime: resolveTime,
                                count: 1,
                              });
                            }
                          });
                        }
                      });

                      if (variableMap.size === 0) {
                        return (
                          <div className="text-center text-slate-500 py-12">
                            <Variable size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No variable data available yet</p>
                            <p className="text-sm mt-2">Variables will appear as tags fire with the enhanced runtime</p>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2">
                          {Array.from(variableMap.entries())
                            .sort((a, b) => b[1].count - a[1].count)
                            .map(([name, data]) => {
                              const avgResolveTime = data.totalResolveTime / data.count;
                              const uniqueValues = [...new Set(data.values.map(v => JSON.stringify(v)))];
                              return (
                                <div key={name} className="bg-slate-800/50 rounded-lg p-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-mono text-purple-400">{name}</span>
                                    <div className="flex items-center gap-3 text-xs">
                                      <span className="text-slate-500">{data.count}x resolved</span>
                                      <span className={getLatencyColor(avgResolveTime)}>
                                        avg {formatLatency(avgResolveTime)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-sm">
                                    {uniqueValues.length === 1 ? (
                                      <span className="text-slate-200 font-mono">{uniqueValues[0]}</span>
                                    ) : (
                                      <div className="space-y-1">
                                        <span className="text-slate-500 text-xs">{uniqueValues.length} unique values:</span>
                                        {uniqueValues.slice(0, 5).map((val, i) => (
                                          <div key={i} className="text-slate-200 font-mono text-xs truncate">{val}</div>
                                        ))}
                                        {uniqueValues.length > 5 && (
                                          <div className="text-slate-500 text-xs">...and {uniqueValues.length - 5} more</div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Performance Tab */}
                {activeTab === 'performance' && (
                  <div className="p-6 space-y-6">
                    {/* Overall Performance Stats */}
                    <div className="grid grid-cols-4 gap-4">
                      {(() => {
                        const eventsWithTiming = filteredEvents.filter(e => e.triggerEvalTime !== undefined);
                        const avgTriggerEval = eventsWithTiming.length > 0
                          ? eventsWithTiming.reduce((sum, e) => sum + (e.triggerEvalTime || 0), 0) / eventsWithTiming.length
                          : 0;
                        const avgVarResolve = eventsWithTiming.length > 0
                          ? eventsWithTiming.reduce((sum, e) => sum + (e.variableResolveTime || 0), 0) / eventsWithTiming.length
                          : 0;
                        const avgTagExec = eventsWithTiming.length > 0
                          ? eventsWithTiming.reduce((sum, e) => sum + e.latency, 0) / eventsWithTiming.length
                          : 0;
                        const avgTotal = eventsWithTiming.length > 0
                          ? eventsWithTiming.reduce((sum, e) => sum + (e.totalTime || 0), 0) / eventsWithTiming.length
                          : 0;

                        return (
                          <>
                            <div className="bg-slate-800/50 rounded-lg p-4">
                              <div className="text-xs text-slate-500 mb-1">Avg Trigger Eval</div>
                              <div className={`text-2xl font-bold ${getLatencyColor(avgTriggerEval)}`}>
                                {formatLatency(avgTriggerEval)}
                              </div>
                            </div>
                            <div className="bg-slate-800/50 rounded-lg p-4">
                              <div className="text-xs text-slate-500 mb-1">Avg Variable Resolve</div>
                              <div className={`text-2xl font-bold ${getLatencyColor(avgVarResolve)}`}>
                                {formatLatency(avgVarResolve)}
                              </div>
                            </div>
                            <div className="bg-slate-800/50 rounded-lg p-4">
                              <div className="text-xs text-slate-500 mb-1">Avg Tag Execution</div>
                              <div className={`text-2xl font-bold ${getLatencyColor(avgTagExec)}`}>
                                {formatLatency(avgTagExec)}
                              </div>
                            </div>
                            <div className="bg-slate-800/50 rounded-lg p-4">
                              <div className="text-xs text-slate-500 mb-1">Avg Total Time</div>
                              <div className={`text-2xl font-bold ${getLatencyColor(avgTotal)}`}>
                                {formatLatency(avgTotal)}
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Per-Event Performance Table */}
                    <div>
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">
                        Execution Timeline
                      </h3>
                      <div className="bg-slate-800/30 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-700">
                              <th className="text-left px-4 py-3 text-slate-500 font-medium">Time</th>
                              <th className="text-left px-4 py-3 text-slate-500 font-medium">Tag</th>
                              <th className="text-right px-4 py-3 text-slate-500 font-medium">Trigger</th>
                              <th className="text-right px-4 py-3 text-slate-500 font-medium">Variables</th>
                              <th className="text-right px-4 py-3 text-slate-500 font-medium">Execution</th>
                              <th className="text-right px-4 py-3 text-slate-500 font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {filteredEvents.slice(-50).reverse().map((event) => (
                              <tr key={event.id} className="hover:bg-slate-800/50">
                                <td className="px-4 py-2 text-slate-500 font-mono text-xs">
                                  {formatTime(event.timestamp)}
                                </td>
                                <td className="px-4 py-2 text-slate-200">
                                  {event.tagName || event.tagId}
                                </td>
                                <td className={`px-4 py-2 text-right font-mono ${getLatencyColor(event.triggerEvalTime || 0)}`}>
                                  {event.triggerEvalTime !== undefined ? formatLatency(event.triggerEvalTime) : '-'}
                                </td>
                                <td className={`px-4 py-2 text-right font-mono ${getLatencyColor(event.variableResolveTime || 0)}`}>
                                  {event.variableResolveTime !== undefined ? formatLatency(event.variableResolveTime) : '-'}
                                </td>
                                <td className={`px-4 py-2 text-right font-mono ${getLatencyColor(event.latency)}`}>
                                  {formatLatency(event.latency)}
                                </td>
                                <td className={`px-4 py-2 text-right font-mono ${getLatencyColor(event.totalTime || 0)}`}>
                                  {event.totalTime !== undefined ? formatLatency(event.totalTime) : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {filteredEvents.length === 0 && (
                          <div className="text-center text-slate-500 py-12">
                            <Gauge size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No performance data yet</p>
                            <p className="text-sm mt-2">Performance timing will appear as tags fire</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Panel - Tag Stats */}
        <div className="w-80 border-l border-slate-800 flex flex-col bg-slate-900/30">
          <div className="h-14 border-b border-slate-800 flex items-center px-6">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Tag Performance</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {tags.length === 0 ? (
              <div className="text-slate-500 text-sm text-center py-8">
                No tags fired yet
              </div>
            ) : (
              <div className="space-y-3">
                {tags.map((tag) => {
                  const avgLatency = tag.fireCount > 0 ? tag.totalLatency / tag.fireCount : 0;
                  const successRate = tag.fireCount > 0 ? (tag.successCount / tag.fireCount) * 100 : 0;
                  const sortedLatencies = [...tag.latencies].sort((a, b) => a - b);
                  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;

                  return (
                    <div
                      key={tag.tagId}
                      className="bg-slate-800/40 border border-slate-800/60 rounded-xl p-4 transition-all hover:bg-slate-800/60"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-slate-200 text-sm truncate" title={tag.tagName}>
                            {tag.tagName}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono mt-0.5 truncate uppercase tracking-widest">
                            {tag.tagId}
                          </span>
                        </div>
                        <div className="flex-shrink-0 ml-2">
                          <span className="px-2 py-0.5 bg-slate-900 text-slate-400 rounded text-[10px] font-bold border border-slate-800">
                            {tag.fireCount}x
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 border-t border-slate-800/50 pt-3">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-slate-600 uppercase font-bold tracking-tighter mb-1">Success</span>
                          <span className={`text-xs font-mono font-semibold ${successRate === 100 ? 'text-emerald-400' : successRate > 90 ? 'text-amber-400' : 'text-red-400'}`}>
                            {successRate.toFixed(0)}%
                          </span>
                        </div>
                        <div className="flex flex-col border-l border-slate-800/50 pl-3">
                          <span className="text-[9px] text-slate-600 uppercase font-bold tracking-tighter mb-1">Avg</span>
                          <span className={`text-xs font-mono font-semibold ${getLatencyColor(avgLatency)}`}>
                            {formatLatency(avgLatency)}
                          </span>
                        </div>
                        <div className="flex flex-col border-l border-slate-800/50 pl-3">
                          <span className="text-[9px] text-slate-600 uppercase font-bold tracking-tighter mb-1">P95</span>
                          <span className={`text-xs font-mono font-semibold ${getLatencyColor(p95)}`}>
                            {formatLatency(p95)}
                          </span>
                        </div>
                      </div>

                      {/* Latency bar visualization */}
                      <div className="mt-4 h-1 bg-slate-900 rounded-full overflow-hidden border border-slate-800/50">
                        <div
                          className={`h-full rounded-full ${
                            avgLatency < 20 ? 'bg-emerald-500' :
                            avgLatency < 100 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(100, (avgLatency / 200) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
