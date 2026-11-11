"use client";

import { useEffect, useState } from 'react';
import { Settings, Cloud, Key, FolderOpen, Save, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';

interface SettingsData {
  // Project settings (from yourtm.config.ts)
  project?: {
    containerId?: string;
    containerName?: string;
    tagsDir?: string;
    triggersDir?: string;
    zonesDir?: string;
    variablesDir?: string;
    outDir?: string;
  };
  // Cloudflare settings (from ~/.yourtm/config.json)
  cloudflare?: {
    accountId?: string;
    apiToken?: string;
    zoneId?: string;
  };
  // AI settings
  ai?: {
    provider?: 'anthropic' | 'openai';
    anthropicApiKey?: string;
    openaiApiKey?: string;
  };
  // Global defaults
  defaults?: {
    environment?: 'staging' | 'production';
    minify?: boolean;
    sourcemaps?: boolean;
  };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load settings:', err);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        throw new Error('Failed to save settings');
      }

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('Failed to save:', err);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const toggleTokenVisibility = (key: string) => {
    setShowTokens(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const maskValue = (value: string | undefined, visible: boolean) => {
    if (!value) return '';
    if (visible) return value;
    return value.slice(0, 4) + '*'.repeat(Math.max(0, value.length - 8)) + value.slice(-4);
  };

  const updateSettings = (path: string, value: any) => {
    setSettings(prev => {
      const newSettings = { ...prev };
      const parts = path.split('.');
      let current: any = newSettings;

      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }

      current[parts[parts.length - 1]] = value;
      return newSettings;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
            <Settings className="text-slate-400" size={28} />
            Settings
          </h1>
          <p className="text-slate-400 mt-1">Configure your YourTM Desktop environment.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-md font-semibold text-sm bg-sky-400 text-slate-950 hover:bg-sky-500 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <>Saving...</>
          ) : saveStatus === 'success' ? (
            <>
              <CheckCircle size={16} />
              Saved
            </>
          ) : saveStatus === 'error' ? (
            <>
              <AlertCircle size={16} />
              Error
            </>
          ) : (
            <>
              <Save size={16} />
              Save Settings
            </>
          )}
        </button>
      </div>

      <div className="space-y-8">
        {/* Project Settings */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <FolderOpen size={20} className="text-sky-400" />
            Project Settings
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            These settings are read from your project's yourtm.config.ts file.
          </p>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Container ID</label>
              <input
                type="text"
                value={settings.project?.containerId || ''}
                readOnly
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-slate-300 text-sm cursor-not-allowed"
              />
              <p className="text-xs text-slate-500 mt-1">Read from yourtm.config.ts</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Container Name</label>
              <input
                type="text"
                value={settings.project?.containerName || ''}
                readOnly
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-slate-300 text-sm cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Tags Directory</label>
              <input
                type="text"
                value={settings.project?.tagsDir || ''}
                readOnly
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-slate-300 text-sm cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Output Directory</label>
              <input
                type="text"
                value={settings.project?.outDir || ''}
                readOnly
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-slate-300 text-sm cursor-not-allowed"
              />
            </div>
          </div>
        </section>

        {/* Cloudflare Settings */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Cloud size={20} className="text-orange-400" />
            Cloudflare Settings
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            Configure your Cloudflare account for edge deployment.
          </p>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Account ID</label>
              <input
                type="text"
                value={settings.cloudflare?.accountId || ''}
                onChange={(e) => updateSettings('cloudflare.accountId', e.target.value)}
                placeholder="Enter Cloudflare Account ID"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-slate-100 text-sm focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Zone ID</label>
              <input
                type="text"
                value={settings.cloudflare?.zoneId || ''}
                onChange={(e) => updateSettings('cloudflare.zoneId', e.target.value)}
                placeholder="Enter Cloudflare Zone ID (optional)"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-slate-100 text-sm focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-2">API Token</label>
              <div className="relative">
                <input
                  type={showTokens['cf-api'] ? 'text' : 'password'}
                  value={settings.cloudflare?.apiToken || ''}
                  onChange={(e) => updateSettings('cloudflare.apiToken', e.target.value)}
                  placeholder="Enter Cloudflare API Token"
                  className="w-full px-3 py-2 pr-10 bg-slate-900/50 border border-slate-700 rounded-md text-slate-100 text-sm focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={() => toggleTokenVisibility('cf-api')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showTokens['cf-api'] ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Create a token at dash.cloudflare.com with Workers permissions
              </p>
            </div>
          </div>
        </section>

        {/* AI API Keys */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Key size={20} className="text-purple-400" />
            AI Provider Settings
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            Configure AI providers for the analyze command and GTM import zone discovery.
          </p>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Default Provider</label>
              <select
                value={settings.ai?.provider || 'anthropic'}
                onChange={(e) => updateSettings('ai.provider', e.target.value)}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-slate-100 text-sm focus:outline-none focus:border-sky-500"
              >
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (GPT)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Anthropic API Key</label>
              <div className="relative">
                <input
                  type={showTokens['anthropic'] ? 'text' : 'password'}
                  value={settings.ai?.anthropicApiKey || ''}
                  onChange={(e) => updateSettings('ai.anthropicApiKey', e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full px-3 py-2 pr-10 bg-slate-900/50 border border-slate-700 rounded-md text-slate-100 text-sm focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={() => toggleTokenVisibility('anthropic')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showTokens['anthropic'] ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">OpenAI API Key</label>
              <div className="relative">
                <input
                  type={showTokens['openai'] ? 'text' : 'password'}
                  value={settings.ai?.openaiApiKey || ''}
                  onChange={(e) => updateSettings('ai.openaiApiKey', e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 pr-10 bg-slate-900/50 border border-slate-700 rounded-md text-slate-100 text-sm focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={() => toggleTokenVisibility('openai')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showTokens['openai'] ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Global Configuration */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Settings size={20} className="text-emerald-400" />
            Global Configuration
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            Default settings for build and deployment.
          </p>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Default Environment</label>
              <select
                value={settings.defaults?.environment || 'staging'}
                onChange={(e) => updateSettings('defaults.environment', e.target.value)}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-slate-100 text-sm focus:outline-none focus:border-sky-500"
              >
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.defaults?.minify ?? true}
                  onChange={(e) => updateSettings('defaults.minify', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 text-sky-500 focus:ring-sky-500 bg-slate-900"
                />
                <span className="text-sm text-slate-300">Minify Output</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.defaults?.sourcemaps ?? false}
                  onChange={(e) => updateSettings('defaults.sourcemaps', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 text-sky-500 focus:ring-sky-500 bg-slate-900"
                />
                <span className="text-sm text-slate-300">Generate Sourcemaps</span>
              </label>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
