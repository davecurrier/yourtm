"use client";

import { useEffect, useState } from 'react';
import {
  Globe, Plus, RefreshCw, Upload, Trash2, CheckCircle, XCircle,
  Loader2, ExternalLink, Wifi, WifiOff, Clock,
  Hash, Layers, AlertCircle, MoreVertical, Eye, EyeOff
} from 'lucide-react';

interface WordPressSite {
  id: string;
  name: string;
  url: string;
  containerId: string;
  environment: 'staging' | 'production';
  bundleVersion: string;
  lastSynced: string;
  status: 'connected' | 'disconnected' | 'error';
  apiKey: string;
}

interface Toast {
  type: 'success' | 'error' | 'info';
  message: string;
  details?: string;
}

interface ConnectionTestResult {
  status: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
}

export default function WordPressPage() {
  const [sites, setSites] = useState<WordPressSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showConnectPanel, setShowConnectPanel] = useState(false);
  const [pushingSiteId, setPushingSiteId] = useState<string | null>(null);
  const [refreshingSiteId, setRefreshingSiteId] = useState<string | null>(null);
  const [removingSiteId, setRemovingSiteId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [generatingZonesId, setGeneratingZonesId] = useState<string | null>(null);
  const [zonesResult, setZonesResult] = useState<{ siteId: string; zones: string[] } | null>(null);

  // Connect form state
  const [formUrl, setFormUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formEnvironment, setFormEnvironment] = useState<'staging' | 'production'>('production');
  const [showApiKey, setShowApiKey] = useState(false);
  const [connectionTest, setConnectionTest] = useState<ConnectionTestResult>({ status: 'idle' });
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    loadSites();
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleClick = () => {
      setOpenMenuId(null);
      setConfirmRemoveId(null);
    };
    if (openMenuId || confirmRemoveId) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [openMenuId, confirmRemoveId]);

  const loadSites = async () => {
    try {
      const res = await fetch('/api/wordpress');
      if (!res.ok) throw new Error('Failed to load sites');
      const data = await res.json();
      setSites(data.sites || []);
    } catch (error) {
      console.error('Failed to load WordPress sites:', error);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (t: Toast) => {
    setToast(t);
    setTimeout(() => setToast(null), 5000);
  };

  const formatAge = (timestamp: string): string => {
    if (!timestamp) return 'Never';
    const now = Date.now();
    const ts = new Date(timestamp).getTime();
    const diff = now - ts;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  };

  const truncateHash = (hash: string): string => {
    if (!hash) return '-';
    return hash.length > 8 ? hash.slice(0, 8) : hash;
  };

  // --- Actions ---

  const handleTestConnection = async () => {
    if (!formUrl || !formApiKey) {
      setConnectionTest({ status: 'error', message: 'Please enter both a site URL and API key' });
      return;
    }
    setConnectionTest({ status: 'testing' });
    try {
      const res = await fetch('/api/wordpress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', url: formUrl, apiKey: formApiKey }),
      });
      const data = await res.json();
      if (data.success) {
        setConnectionTest({ status: 'success', message: data.message || 'Connection successful' });
      } else {
        setConnectionTest({ status: 'error', message: data.error || 'Connection failed' });
      }
    } catch (error) {
      setConnectionTest({
        status: 'error',
        message: error instanceof Error ? error.message : 'Network error',
      });
    }
  };

  const handleConnect = async () => {
    if (!formUrl || !formApiKey) {
      showToast({ type: 'error', message: 'Please fill in all required fields' });
      return;
    }
    if (connectionTest.status !== 'success') {
      showToast({ type: 'error', message: 'Please test the connection first' });
      return;
    }

    setConnecting(true);
    try {
      const res = await fetch('/api/wordpress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          url: formUrl,
          apiKey: formApiKey,
          environment: formEnvironment,
        }),
      });
      const data = await res.json();

      if (data.site || data.success) {
        showToast({ type: 'success', message: 'Site connected successfully', details: formUrl });
        resetForm();
        setShowConnectPanel(false);
        loadSites();
      } else {
        showToast({ type: 'error', message: 'Failed to connect site', details: data.error });
      }
    } catch (error) {
      showToast({
        type: 'error',
        message: 'Failed to connect site',
        details: error instanceof Error ? error.message : 'Network error',
      });
    } finally {
      setConnecting(false);
    }
  };

  const handlePushBundle = async (siteId: string) => {
    setPushingSiteId(siteId);
    try {
      const res = await fetch('/api/wordpress/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: siteId }),
      });
      const data = await res.json();

      if (data.success) {
        showToast({
          type: 'success',
          message: 'Bundle pushed successfully',
          details: data.version ? `Version ${data.version} deployed` : undefined,
        });
        loadSites();
      } else {
        showToast({ type: 'error', message: 'Push failed', details: data.error });
      }
    } catch (error) {
      showToast({
        type: 'error',
        message: 'Push failed',
        details: error instanceof Error ? error.message : 'Network error',
      });
    } finally {
      setPushingSiteId(null);
    }
  };

  const handleRefresh = async (siteId: string) => {
    setRefreshingSiteId(siteId);
    try {
      const res = await fetch(`/api/wordpress/sites/${siteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' }),
      });
      const data = await res.json();

      if (data.success) {
        showToast({ type: 'success', message: 'Site info refreshed' });
        loadSites();
      } else {
        showToast({ type: 'error', message: 'Refresh failed', details: data.error });
      }
    } catch (error) {
      showToast({
        type: 'error',
        message: 'Refresh failed',
        details: error instanceof Error ? error.message : 'Network error',
      });
    } finally {
      setRefreshingSiteId(null);
    }
  };

  const handleGenerateZones = async (siteId: string) => {
    setGeneratingZonesId(siteId);
    setZonesResult(null);
    try {
      const res = await fetch('/api/wordpress/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: siteId }),
      });
      const data = await res.json();

      if (data.success) {
        setZonesResult({ siteId, zones: data.zones || [] });
        showToast({ type: 'success', message: 'Zones generated', details: `${(data.zones || []).length} zones created` });
      } else {
        showToast({ type: 'error', message: 'Zone generation failed', details: data.error });
      }
    } catch (error) {
      showToast({
        type: 'error',
        message: 'Zone generation failed',
        details: error instanceof Error ? error.message : 'Network error',
      });
    } finally {
      setGeneratingZonesId(null);
    }
  };

  const handleRemoveSite = async (siteId: string) => {
    setRemovingSiteId(siteId);
    try {
      const res = await fetch('/api/wordpress', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: siteId }),
      });
      const data = await res.json();

      if (data.success) {
        showToast({ type: 'success', message: 'Site removed' });
        setConfirmRemoveId(null);
        loadSites();
      } else {
        showToast({ type: 'error', message: 'Failed to remove site', details: data.error });
      }
    } catch (error) {
      showToast({
        type: 'error',
        message: 'Failed to remove site',
        details: error instanceof Error ? error.message : 'Network error',
      });
    } finally {
      setRemovingSiteId(null);
    }
  };

  const resetForm = () => {
    setFormUrl('');
    setFormApiKey('');
    setFormEnvironment('production');
    setShowApiKey(false);
    setConnectionTest({ status: 'idle' });
  };

  // --- Computed stats ---

  const connectedCount = sites.filter(s => s.status === 'connected').length;
  const lastSyncedSite = sites
    .filter(s => s.lastSynced)
    .sort((a, b) => new Date(b.lastSynced).getTime() - new Date(a.lastSynced).getTime())[0];
  const latestBundle = sites.find(s => s.bundleVersion)?.bundleVersion || null;
  const hasErrors = sites.some(s => s.status === 'error');

  // --- Render ---

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-slate-400" />
        <span className="ml-3 text-slate-400">Loading WordPress sites...</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-10">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
            <Globe className="text-purple-400" size={32} /> WordPress
          </h1>
          <p className="text-slate-400 mt-2 max-w-xl">
            Manage WordPress site connections and push tag bundles directly to your servers.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowConnectPanel(!showConnectPanel);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-md font-semibold text-sm bg-sky-400 text-slate-950 hover:bg-sky-500 transition-colors"
        >
          <Plus size={16} /> Connect Site
        </button>
      </div>

      {/* Connect Site Panel */}
      {showConnectPanel && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Globe size={20} className="text-purple-400" />
            Connect WordPress Site
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            Enter your WordPress site URL and the API key from the YourTM WordPress plugin.
          </p>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-slate-300 mb-2">Site URL</label>
              <input
                type="url"
                value={formUrl}
                onChange={(e) => {
                  setFormUrl(e.target.value);
                  setConnectionTest({ status: 'idle' });
                }}
                placeholder="https://www.example.com"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-slate-100 text-sm focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-slate-300 mb-2">Environment</label>
              <select
                value={formEnvironment}
                onChange={(e) => setFormEnvironment(e.target.value as 'staging' | 'production')}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-slate-100 text-sm focus:outline-none focus:border-sky-500"
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-2">API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={formApiKey}
                  onChange={(e) => {
                    setFormApiKey(e.target.value);
                    setConnectionTest({ status: 'idle' });
                  }}
                  placeholder="Enter your YourTM WordPress plugin API key"
                  className="w-full px-3 py-2 pr-10 bg-slate-900/50 border border-slate-700 rounded-md text-slate-100 text-sm focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Find this in your WordPress admin under YourTM &rarr; Settings &rarr; API Key
              </p>
            </div>
          </div>

          {/* Connection Test Result */}
          {connectionTest.status !== 'idle' && (
            <div className={`flex items-center gap-2 p-3 rounded-lg mb-6 text-sm ${
              connectionTest.status === 'testing'
                ? 'bg-sky-900/20 border border-sky-500/30 text-sky-300'
                : connectionTest.status === 'success'
                ? 'bg-emerald-900/20 border border-emerald-500/30 text-emerald-300'
                : 'bg-red-900/20 border border-red-500/30 text-red-300'
            }`}>
              {connectionTest.status === 'testing' && <Loader2 size={16} className="animate-spin" />}
              {connectionTest.status === 'success' && <CheckCircle size={16} />}
              {connectionTest.status === 'error' && <XCircle size={16} />}
              <span>{connectionTest.message || 'Testing connection...'}</span>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestConnection}
              disabled={connectionTest.status === 'testing' || !formUrl || !formApiKey}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-slate-700 text-slate-300 hover:bg-slate-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connectionTest.status === 'testing' ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Wifi size={16} />
                  Test Connection
                </>
              )}
            </button>
            <button
              onClick={handleConnect}
              disabled={connecting || connectionTest.status !== 'success'}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-sky-400 text-slate-950 hover:bg-sky-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connecting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Connect
                </>
              )}
            </button>
            <button
              onClick={() => {
                setShowConnectPanel(false);
                resetForm();
              }}
              className="px-4 py-2 rounded-md text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stats Row */}
      {sites.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              <Globe size={14} /> Connected Sites
            </div>
            <div className="text-xl font-bold text-slate-100">{connectedCount}</div>
            <div className="text-sm mt-2 text-slate-400">
              {sites.length} total
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              <Clock size={14} /> Last Sync
            </div>
            <div className="text-xl font-bold text-slate-100">
              {lastSyncedSite ? formatAge(lastSyncedSite.lastSynced) : 'Never'}
            </div>
            <div className="text-sm mt-2 text-slate-400">
              {lastSyncedSite?.name || 'No syncs yet'}
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              <Hash size={14} /> Bundle Version
            </div>
            <div className="text-xl font-bold text-slate-100">
              {latestBundle ? (
                <code className="text-sky-400 font-mono">{truncateHash(latestBundle)}</code>
              ) : (
                '-'
              )}
            </div>
            <div className="text-sm mt-2 text-slate-400">Latest deployed</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              <Layers size={14} /> Sync Status
            </div>
            <div className="text-xl font-bold">
              {hasErrors ? (
                <span className="text-red-400 flex items-center gap-2">
                  <XCircle size={20} /> Errors
                </span>
              ) : connectedCount > 0 ? (
                <span className="text-emerald-400 flex items-center gap-2">
                  <CheckCircle size={20} /> Healthy
                </span>
              ) : (
                <span className="text-slate-500">-</span>
              )}
            </div>
            <div className="text-sm mt-2 text-slate-400">
              {hasErrors ? 'Check site status' : 'All sites operational'}
            </div>
          </div>
        </div>
      )}

      {/* Sites Table or Empty State */}
      {sites.length === 0 && !showConnectPanel ? (
        /* Empty State */
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-12 text-center">
          <div className="w-16 h-16 bg-purple-400/10 border border-purple-400/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Globe size={32} className="text-purple-400/60" />
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">No WordPress Sites Connected</h2>
          <p className="text-slate-400 mb-6 max-w-md mx-auto">
            Connect your first WordPress site to serve tag bundles directly from your server. Install the YourTM plugin on your WordPress site to get started.
          </p>
          <button
            onClick={() => {
              resetForm();
              setShowConnectPanel(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-semibold text-sm bg-sky-400 text-slate-950 hover:bg-sky-500 transition-colors"
          >
            <Plus size={16} /> Connect Site
          </button>
          <div className="mt-8 text-left max-w-sm mx-auto">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">How it works</h3>
            <ol className="space-y-2 text-sm text-slate-400">
              <li className="flex gap-2">
                <span className="text-purple-400 font-bold">1.</span>
                Install the YourTM plugin on your WordPress site
              </li>
              <li className="flex gap-2">
                <span className="text-purple-400 font-bold">2.</span>
                Copy the API key from your WordPress admin panel
              </li>
              <li className="flex gap-2">
                <span className="text-purple-400 font-bold">3.</span>
                Connect your site here and push your tag bundle
              </li>
            </ol>
          </div>
        </div>
      ) : sites.length > 0 ? (
        /* Sites Table */
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-700/50 flex items-center gap-3">
            <Globe size={20} className="text-purple-400" />
            <h2 className="text-lg font-semibold text-slate-100">Connected Sites</h2>
            <span className="bg-purple-400/10 text-purple-400 px-2.5 py-0.5 rounded-full text-xs font-medium border border-purple-400/20 ml-2">
              {sites.length}
            </span>
          </div>
          <table className="w-full text-left">
            <thead className="bg-slate-800/80">
              <tr>
                <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">SITE</th>
                <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">CONTAINER</th>
                <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">ENVIRONMENT</th>
                <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">BUNDLE</th>
                <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">LAST SYNCED</th>
                <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">STATUS</th>
                <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {sites.map(site => (
                <tr key={site.id} className="hover:bg-slate-700/20 transition-colors group">
                  <td className="p-4">
                    <div className="text-sm font-medium text-slate-100">{site.name || new URL(site.url).hostname}</div>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-500 hover:text-sky-400 flex items-center gap-1 mt-0.5 transition-colors"
                    >
                      {site.url} <ExternalLink size={10} />
                    </a>
                  </td>
                  <td className="p-4">
                    <code className="text-sky-400 font-mono text-sm">{site.containerId || '-'}</code>
                  </td>
                  <td className="p-4">
                    {site.environment === 'production' ? (
                      <span className="bg-emerald-400/10 text-emerald-400 px-2.5 py-0.5 rounded-full text-xs font-medium border border-emerald-400/20">
                        Production
                      </span>
                    ) : (
                      <span className="bg-yellow-400/10 text-yellow-400 px-2.5 py-0.5 rounded-full text-xs font-medium border border-yellow-400/20">
                        Staging
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    {site.bundleVersion ? (
                      <code className="text-slate-300 font-mono text-sm">{truncateHash(site.bundleVersion)}</code>
                    ) : (
                      <span className="text-slate-500 text-sm">-</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1 text-slate-400 text-sm">
                      <Clock size={14} />
                      {site.lastSynced ? formatAge(site.lastSynced) : 'Never'}
                    </div>
                  </td>
                  <td className="p-4">
                    {site.status === 'connected' ? (
                      <span className="bg-emerald-400/10 text-emerald-400 px-2.5 py-0.5 rounded-full text-xs font-medium border border-emerald-400/20 inline-flex items-center gap-1">
                        <Wifi size={12} /> Connected
                      </span>
                    ) : site.status === 'error' ? (
                      <span className="bg-yellow-400/10 text-yellow-400 px-2.5 py-0.5 rounded-full text-xs font-medium border border-yellow-400/20 inline-flex items-center gap-1">
                        <AlertCircle size={12} /> Error
                      </span>
                    ) : (
                      <span className="bg-red-400/10 text-red-400 px-2.5 py-0.5 rounded-full text-xs font-medium border border-red-400/20 inline-flex items-center gap-1">
                        <WifiOff size={12} /> Disconnected
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      {/* Push Bundle */}
                      <button
                        onClick={() => handlePushBundle(site.id)}
                        disabled={pushingSiteId === site.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-sky-400/10 text-sky-400 border border-sky-400/20 hover:bg-sky-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Push bundle to this site"
                      >
                        {pushingSiteId === site.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Upload size={14} />
                        )}
                        Push
                      </button>

                      {/* Refresh */}
                      <button
                        onClick={() => handleRefresh(site.id)}
                        disabled={refreshingSiteId === site.id}
                        className="flex items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                        title="Refresh site info"
                      >
                        <RefreshCw size={14} className={refreshingSiteId === site.id ? 'animate-spin' : ''} />
                      </button>

                      {/* Kebab Menu */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === site.id ? null : site.id);
                            setConfirmRemoveId(null);
                          }}
                          className="flex items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
                        >
                          <MoreVertical size={14} />
                        </button>

                        {openMenuId === site.id && (
                          <div
                            className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 py-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                handleGenerateZones(site.id);
                              }}
                              disabled={generatingZonesId === site.id}
                              className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                              {generatingZonesId === site.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Layers size={14} />
                              )}
                              Generate Zones
                            </button>
                            <button
                              onClick={() => {
                                window.open(site.url, '_blank');
                                setOpenMenuId(null);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-2"
                            >
                              <ExternalLink size={14} />
                              Visit Site
                            </button>
                            <div className="border-t border-slate-700 my-1" />
                            {confirmRemoveId === site.id ? (
                              <div className="px-3 py-2">
                                <p className="text-xs text-red-400 mb-2">Remove this site?</p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleRemoveSite(site.id)}
                                    disabled={removingSiteId === site.id}
                                    className="flex-1 px-2 py-1 text-xs font-medium bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                                  >
                                    {removingSiteId === site.id ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                      'Confirm'
                                    )}
                                  </button>
                                  <button
                                    onClick={() => setConfirmRemoveId(null)}
                                    className="flex-1 px-2 py-1 text-xs text-slate-400 rounded hover:bg-slate-700 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmRemoveId(site.id)}
                                className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700 transition-colors flex items-center gap-2"
                              >
                                <Trash2 size={14} />
                                Remove Site
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Zones Result Sub-panel */}
          {zonesResult && (
            <div className="border-t border-slate-700/50 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Layers size={16} className="text-purple-400" />
                  Generated Zones for {sites.find(s => s.id === zonesResult.siteId)?.name || 'site'}
                </h3>
                <button
                  onClick={() => setZonesResult(null)}
                  className="text-slate-400 hover:text-slate-200 text-sm"
                >
                  Dismiss
                </button>
              </div>
              {zonesResult.zones.length > 0 ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {zonesResult.zones.map((zone, i) => (
                    <div key={i} className="bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 font-mono">
                      {zone}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No zones were generated.</p>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-8 right-8 z-50 flex items-start gap-3 p-4 rounded-lg shadow-lg border max-w-sm ${
          toast.type === 'success'
            ? 'bg-emerald-950/90 border-emerald-700/50 text-emerald-100'
            : toast.type === 'error'
            ? 'bg-red-950/90 border-red-700/50 text-red-100'
            : 'bg-sky-950/90 border-sky-700/50 text-sky-100'
        }`}>
          {toast.type === 'success' ? (
            <CheckCircle size={20} className="text-emerald-400 shrink-0 mt-0.5" />
          ) : toast.type === 'error' ? (
            <AlertCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={20} className="text-sky-400 shrink-0 mt-0.5" />
          )}
          <div>
            <div className="font-semibold">{toast.message}</div>
            {toast.details && (
              <div className="text-sm opacity-80 mt-1">{toast.details}</div>
            )}
          </div>
          <button
            onClick={() => setToast(null)}
            className="ml-4 text-slate-400 hover:text-slate-200"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
