"use client";

import { useEffect, useState } from 'react';
import { Rocket, Server, History, RotateCcw, Check, AlertCircle, Loader2, Clock, GitBranch, Cloud, ChevronDown } from 'lucide-react';

interface DeployStatus {
  containerId: string;
  branch: string;
  localVersion: string;
  latestPushed: string;
  workerUrl?: string;
  environments: {
    staging?: { version: string; deployedAt: string };
    production?: { version: string; deployedAt: string };
  };
}

interface Version {
  id: string;
  message: string;
  author: string;
  timestamp: string;
  isStaging: boolean;
  isProduction: boolean;
}

interface Toast {
  type: 'success' | 'error' | 'info';
  message: string;
  details?: string;
}

export default function DeployPage() {
  const [status, setStatus] = useState<DeployStatus | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [showVersionSelect, setShowVersionSelect] = useState(false);
  const [lastDeployedUrl, setLastDeployedUrl] = useState<string | null>(null);

  useEffect(() => {
    loadDeployStatus();
    loadVersions();
  }, []);

  const loadDeployStatus = async () => {
    try {
      const res = await fetch('/api/project/deploy/status');
      const data = await res.json();
      setStatus(data);
      if (data.workerUrl) {
        setLastDeployedUrl(data.workerUrl);
      }
    } catch (error) {
      console.error('Failed to load deploy status:', error);
    }
  };

  const loadVersions = async () => {
    try {
      const res = await fetch('/api/project/deploy/versions');
      const data = await res.json();
      setVersions(data.versions || []);
    } catch (error) {
      console.error('Failed to load versions:', error);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (toast: Toast) => {
    setToast(toast);
    setTimeout(() => setToast(null), 5000);
  };

  const handleDeploy = async (environment: 'staging' | 'production') => {
    setDeploying(environment);
    try {
      const res = await fetch('/api/project/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment }),
      });

      const data = await res.json();

      if (data.success) {
        if (data.workerUrl) {
          setLastDeployedUrl(data.workerUrl);
        }
        showToast({
          type: 'success',
          message: `Deployed to ${environment}!`,
          details: data.workerUrl
            ? `Version ${data.version} is now live at ${data.workerUrl}`
            : `Version ${data.version} is now live`,
        });
        loadDeployStatus();
        loadVersions();
      } else {
        showToast({
          type: 'error',
          message: `Deploy to ${environment} failed`,
          details: data.error,
        });
      }
    } catch (error) {
      showToast({
        type: 'error',
        message: 'Deploy failed',
        details: error instanceof Error ? error.message : 'Network error',
      });
    } finally {
      setDeploying(null);
    }
  };

  const handleRollback = async () => {
    if (!selectedVersion) {
      showToast({
        type: 'error',
        message: 'Select a version to rollback to',
      });
      return;
    }

    setRolling(true);
    try {
      const res = await fetch('/api/project/deploy/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: selectedVersion, environment: 'production' }),
      });

      const data = await res.json();

      if (data.success) {
        showToast({
          type: 'success',
          message: `Rolled back to ${selectedVersion}`,
          details: 'Production is now running the previous version',
        });
        setSelectedVersion('');
        loadDeployStatus();
        loadVersions();
      } else {
        showToast({
          type: 'error',
          message: 'Rollback failed',
          details: data.error,
        });
      }
    } catch (error) {
      showToast({
        type: 'error',
        message: 'Rollback failed',
        details: error instanceof Error ? error.message : 'Network error',
      });
    } finally {
      setRolling(false);
    }
  };

  const formatAge = (timestamp: string): string => {
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

  const formatDate = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-start mb-10">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
            <Rocket className="text-sky-400" size={32} /> Deploy
          </h1>
          <p className="text-slate-400 mt-2 max-w-xl">
            Deploy your container to staging or production environments. Roll back to previous versions if needed.
          </p>
        </div>
      </div>

      {/* Current Status */}
      {status && (
        <div className="grid grid-cols-3 gap-6 mb-10">
          <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              <GitBranch size={14} /> Branch
            </div>
            <div className="text-xl font-bold text-slate-100">{status.branch}</div>
            <div className="text-sm mt-2 text-slate-400">
              Latest: <span className="text-sky-400">{status.latestPushed}</span>
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              <Server size={14} /> Staging
            </div>
            {status.environments.staging ? (
              <>
                <div className="text-xl font-bold text-yellow-400">{status.environments.staging.version}</div>
                <div className="text-sm mt-2 text-slate-400">
                  {formatAge(status.environments.staging.deployedAt)}
                </div>
              </>
            ) : (
              <div className="text-slate-500">Not deployed</div>
            )}
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              <Cloud size={14} /> Production
            </div>
            {status.environments.production ? (
              <>
                <div className="text-xl font-bold text-emerald-400">{status.environments.production.version}</div>
                <div className="text-sm mt-2 text-slate-400">
                  {formatAge(status.environments.production.deployedAt)}
                </div>
              </>
            ) : (
              <div className="text-slate-500">Not deployed</div>
            )}
          </div>
        </div>
      )}

      {/* Worker URL Display */}
      {lastDeployedUrl && (
        <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-6 mb-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold mb-2">
                <Cloud size={16} />
                Worker URL
              </div>
              <code className="text-emerald-300 text-sm font-mono">{lastDeployedUrl}</code>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigator.clipboard.writeText(lastDeployedUrl)}
                className="px-3 py-1.5 text-sm bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
              >
                Copy URL
              </button>
              <button
                onClick={() => window.open(lastDeployedUrl, '_blank')}
                className="px-3 py-1.5 text-sm bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
              >
                Open
              </button>
            </div>
          </div>
          <p className="text-slate-400 text-xs mt-3">
            Use this URL in the Preview Mode to connect to real user monitoring data.
          </p>
        </div>
      )}

      {/* Deploy Actions */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 mb-10">
        <h2 className="text-xl font-bold text-slate-100 mb-6">Deploy Actions</h2>
        <div className="grid grid-cols-3 gap-6">
          {/* Deploy to Staging */}
          <div className="p-6 border border-slate-700/50 rounded-xl bg-slate-900/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                <Server size={20} className="text-yellow-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100">Staging</h3>
                <p className="text-xs text-slate-500">Test before production</p>
              </div>
            </div>
            <button
              onClick={() => handleDeploy('staging')}
              disabled={deploying !== null}
              className="w-full px-4 py-3 rounded-lg font-bold text-sm bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 hover:bg-yellow-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {deploying === 'staging' ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket size={16} />
                  Deploy to Staging
                </>
              )}
            </button>
          </div>

          {/* Deploy to Production */}
          <div className="p-6 border border-slate-700/50 rounded-xl bg-slate-900/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Cloud size={20} className="text-emerald-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100">Production</h3>
                <p className="text-xs text-slate-500">Live to all users</p>
              </div>
            </div>
            <button
              onClick={() => handleDeploy('production')}
              disabled={deploying !== null}
              className="w-full px-4 py-3 rounded-lg font-bold text-sm bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {deploying === 'production' ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket size={16} />
                  Deploy to Production
                </>
              )}
            </button>
          </div>

          {/* Rollback */}
          <div className="p-6 border border-slate-700/50 rounded-xl bg-slate-900/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <RotateCcw size={20} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100">Rollback</h3>
                <p className="text-xs text-slate-500">Revert to previous</p>
              </div>
            </div>
            <div className="relative mb-3">
              <button
                onClick={() => setShowVersionSelect(!showVersionSelect)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm text-left flex items-center justify-between"
              >
                <span>{selectedVersion || 'Select version...'}</span>
                <ChevronDown size={16} className="text-slate-500" />
              </button>
              {showVersionSelect && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                  {versions.filter(v => !v.isProduction).map(v => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setSelectedVersion(v.id);
                        setShowVersionSelect(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-700 transition-colors flex items-center justify-between"
                    >
                      <span className="text-slate-300">{v.id}</span>
                      <span className="text-slate-500 text-xs">{formatAge(v.timestamp)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleRollback}
              disabled={!selectedVersion || rolling || deploying !== null}
              className="w-full px-4 py-3 rounded-lg font-bold text-sm border border-red-500/30 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {rolling ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Rolling back...
                </>
              ) : (
                <>
                  <RotateCcw size={16} />
                  Rollback
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Deployment History */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-700/50 flex items-center gap-3">
          <History size={20} className="text-sky-400" />
          <h2 className="text-xl font-bold text-slate-100">Version History</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading versions...</div>
        ) : versions.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <GitBranch size={24} className="text-slate-600" />
            </div>
            <p>No versions found.</p>
            <p className="text-sm mt-1">Run <code className="text-sky-400">ytm push</code> to create your first version.</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-800/80">
              <tr>
                <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">VERSION</th>
                <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">MESSAGE</th>
                <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">AUTHOR</th>
                <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">TIME</th>
                <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {versions.map(version => (
                <tr key={version.id} className="hover:bg-slate-700/20 transition-colors">
                  <td className="p-4">
                    <code className="text-sky-400 font-mono text-sm">{version.id}</code>
                  </td>
                  <td className="p-4 text-slate-300 max-w-xs truncate">{version.message}</td>
                  <td className="p-4 text-slate-400">{version.author}</td>
                  <td className="p-4 text-slate-400" title={formatDate(version.timestamp)}>
                    <div className="flex items-center gap-1">
                      <Clock size={14} />
                      {formatAge(version.timestamp)}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      {version.isProduction && (
                        <span className="bg-emerald-400/10 text-emerald-400 px-2.5 py-0.5 rounded-full text-xs font-medium border border-emerald-400/20">
                          Production
                        </span>
                      )}
                      {version.isStaging && (
                        <span className="bg-yellow-400/10 text-yellow-400 px-2.5 py-0.5 rounded-full text-xs font-medium border border-yellow-400/20">
                          Staging
                        </span>
                      )}
                      {!version.isProduction && !version.isStaging && (
                        <span className="text-slate-500 text-xs">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-8 right-8 z-50 flex items-start gap-3 p-4 rounded-lg shadow-lg border ${
          toast.type === 'success'
            ? 'bg-emerald-950/90 border-emerald-700/50 text-emerald-100'
            : toast.type === 'error'
            ? 'bg-red-950/90 border-red-700/50 text-red-100'
            : 'bg-sky-950/90 border-sky-700/50 text-sky-100'
        }`}>
          {toast.type === 'success' ? (
            <Check size={20} className="text-emerald-400 shrink-0 mt-0.5" />
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
