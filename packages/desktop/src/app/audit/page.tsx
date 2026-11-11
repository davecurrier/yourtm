"use client";

import { useState } from 'react';
import { Bot, Sparkles, AlertCircle, CheckCircle2, Zap, Shield, Settings, Layers, X, Key } from 'lucide-react';

interface Recommendation {
  id: string;
  type: string;
  title: string;
  description: string;
  category: string;
  actionLabel: string;
  file?: string;
}

interface AuditResult {
  summary: {
    totalRecommendations: number;
    savingsPercent: number;
    currentSize: number;
    optimizedSize: number;
  };
  recommendations: Recommendation[];
  error?: string;
  requiresApiKey?: boolean;
}

const categoryIcons: Record<string, React.ReactNode> = {
  'Performance': <Zap className="text-sky-400" size={20} />,
  'Consolidation': <Layers className="text-indigo-400" size={20} />,
  'Compliance': <Shield className="text-amber-400" size={20} />,
  'Dependencies': <Settings className="text-emerald-400" size={20} />,
  'Errors': <AlertCircle className="text-red-400" size={20} />,
};

const categoryColors: Record<string, string> = {
  'Performance': 'bg-sky-500/20 text-sky-400',
  'Consolidation': 'bg-indigo-500/20 text-indigo-400',
  'Compliance': 'bg-amber-500/20 text-amber-400',
  'Dependencies': 'bg-emerald-500/20 text-emerald-400',
  'Errors': 'bg-red-500/20 text-red-400',
};

export default function AuditPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic');

  const runAudit = async (key?: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/project/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: key || apiKey || undefined,
          provider,
        }),
      });

      const data = await response.json();

      if (data.requiresApiKey) {
        setShowApiKeyModal(true);
        setLoading(false);
        return;
      }

      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run audit');
    }

    setLoading(false);
  };

  const handleApiKeySubmit = () => {
    if (apiKey.trim()) {
      setShowApiKeyModal(false);
      runAudit(apiKey);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Key className="text-sky-400" size={24} /> API Key Required
              </h2>
              <button onClick={() => setShowApiKeyModal(false)} className="text-slate-500 hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              Enter your AI provider API key to run the analysis. Your key is only used for this session.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as 'anthropic' | 'openai')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm"
                >
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm"
                />
              </div>
              <button
                onClick={handleApiKeySubmit}
                disabled={!apiKey.trim()}
                className="w-full py-3 rounded-lg font-bold text-sm bg-sky-500 text-white hover:bg-sky-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Run Analysis
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-start mb-10">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
            <Bot className="text-sky-400" size={32} /> AI Audit Engine
          </h1>
          <p className="text-slate-400 mt-2 max-w-xl">
            Analyze your container for performance bottlenecks, redundant tags, and missing security consent logic.
          </p>
        </div>
        <button
          onClick={() => runAudit()}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm bg-gradient-to-r from-sky-400 to-indigo-500 text-white hover:from-sky-500 hover:to-indigo-600 transition-all shadow-lg shadow-sky-500/20 disabled:opacity-50"
        >
          {loading ? 'Analyzing...' : <><Sparkles size={18} /> Run Deep Scan</>}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 mb-8 flex items-start gap-4">
          <AlertCircle className="text-red-400 shrink-0" size={24} />
          <div>
            <h3 className="font-bold text-red-400 mb-1">Analysis Failed</h3>
            <p className="text-sm text-red-300/80">{error}</p>
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="bg-slate-800/30 border border-dashed border-slate-700 rounded-2xl p-20 text-center">
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-500">
            <Bot size={32} />
          </div>
          <h2 className="text-xl font-semibold text-slate-300 mb-2">No active analysis</h2>
          <p className="text-slate-500 mb-8">Run a scan to discover optimization opportunities.</p>
          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto text-left">
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
              <div className="text-sky-400 font-bold text-xs uppercase mb-1">Performance</div>
              <div className="text-sm text-slate-400">Discover tags that slow down your initial page load.</div>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
              <div className="text-indigo-400 font-bold text-xs uppercase mb-1">Consolidation</div>
              <div className="text-sm text-slate-400">Merge duplicate pixels into single platform-specific tags.</div>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
              <div className="text-emerald-400 font-bold text-xs uppercase mb-1">Compliance</div>
              <div className="text-sm text-slate-400">Ensure all tracking scripts respect user consent.</div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="text-center text-slate-400 mb-6">
            <div className="inline-flex items-center gap-2 bg-slate-800/50 px-6 py-3 rounded-full">
              <div className="w-2 h-2 bg-sky-400 rounded-full animate-pulse"></div>
              Analyzing your container with AI...
            </div>
          </div>
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 animate-pulse">
              <div className="h-4 bg-slate-700 rounded w-1/4 mb-4"></div>
              <div className="h-3 bg-slate-700 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-slate-700 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Performance Summary */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 flex items-center justify-between">
            <div className="flex gap-10">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase mb-1">Recommendations</div>
                <div className="text-3xl font-bold text-slate-100">{result.summary.totalRecommendations}</div>
              </div>
              {result.summary.savingsPercent > 0 && (
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase mb-1">Potential Savings</div>
                  <div className="text-3xl font-bold text-emerald-400">{result.summary.savingsPercent}%</div>
                </div>
              )}
              {result.summary.currentSize > 0 && (
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase mb-1">Size Reduction</div>
                  <div className="text-3xl font-bold text-slate-100">
                    {formatBytes(result.summary.currentSize)} <span className="text-slate-500 text-lg">→</span> {formatBytes(result.summary.optimizedSize)}
                  </div>
                </div>
              )}
            </div>
            {result.recommendations.length > 0 && (
              <div className="flex gap-2">
                <button className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 font-bold text-sm hover:bg-emerald-400 transition-colors">
                  Apply All Fixes
                </button>
              </div>
            )}
          </div>

          {/* Recommendations List */}
          {result.recommendations.length === 0 ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-8 text-center">
              <CheckCircle2 className="text-emerald-400 mx-auto mb-4" size={48} />
              <h3 className="text-xl font-bold text-emerald-400 mb-2">Container is Optimized!</h3>
              <p className="text-slate-400">No recommendations found. Your container is following best practices.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {result.recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 flex gap-6 items-start hover:border-slate-600 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0">
                    {categoryIcons[rec.category] || <Zap className="text-slate-400" size={20} />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-bold text-slate-100">{rec.title}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tight ${categoryColors[rec.category] || 'bg-slate-700 text-slate-400'}`}>
                        {rec.category}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">{rec.description}</p>
                    {rec.file && (
                      <p className="text-xs text-slate-500 mt-2 font-mono">{rec.file}</p>
                    )}
                  </div>
                  <button className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors">
                    {rec.actionLabel}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
