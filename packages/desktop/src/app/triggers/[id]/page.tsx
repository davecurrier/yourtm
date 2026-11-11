"use client";

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Zap } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/themes/prism-tomorrow.css';

const TRIGGER_TYPES = [
  { value: 'pageview', title: 'Page View' },
  { value: 'click', title: 'Click' },
  { value: 'scroll', title: 'Scroll' },
  { value: 'timer', title: 'Timer' },
  { value: 'custom', title: 'Custom Event' },
];

export default function TriggerEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [asset, setAsset] = useState<any>(null);
  const [source, setSource] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});

  useEffect(() => {
    fetch(`/api/project/triggers/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.asset) {
          setAsset(data.asset);
          setSource(data.source || '');
          setFormData({
            name: data.asset.name,
            type: data.asset.type || 'pageview',
            enabled: data.asset.enabled !== false,
            selector: data.asset.selector || '',
            threshold: data.asset.threshold || 50,
            delay: data.asset.delay || 1000,
            eventName: data.asset.eventName || '',
            description: data.asset.description || '',
            fireOnce: data.asset.fireOnce || false,
            waitForTags: data.asset.waitForTags || false,
          });
        }
        setLoading(false);
      })
      .catch(console.error);
  }, [id]);

  useEffect(() => {
    if (!loading && source) {
      Prism.highlightAll();
    }
  }, [source, loading]);

  const handleUpdate = async (updates: Record<string, any>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/project/triggers/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
      const result = await res.json();
      if (result.success) {
        setSource(result.source);
      }
    } catch (e) {
      console.error('Failed to sync:', e);
    }
    setSaving(false);
  };

  const onFieldChange = (name: string, value: any) => {
    const newFormData = { ...formData, [name]: value };
    setFormData(newFormData);
    handleUpdate({ [name]: value });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full text-slate-500 gap-3">
      <Loader2 className="animate-spin" /> Initializing Live Sync...
    </div>
  );

  if (!asset) return <div className="p-8 text-red-400">Trigger not found.</div>;

  const renderTypeSpecificFields = () => {
    switch (formData.type) {
      case 'click':
        return (
          <>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">CSS Selector</label>
              <input
                type="text"
                value={formData.selector || ''}
                onChange={(e) => onFieldChange('selector', e.target.value)}
                placeholder="e.g., .btn-primary, [data-action='submit']"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm focus:ring-1 focus:ring-sky-400 outline-none"
              />
              <p className="text-xs text-slate-500 mt-1">Elements matching this selector will trigger the event</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Wait for Tags</label>
              <button
                onClick={() => onFieldChange('waitForTags', !formData.waitForTags)}
                className={`w-12 h-6 rounded-full p-1 transition-colors ${formData.waitForTags ? 'bg-sky-500' : 'bg-slate-700'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${formData.waitForTags ? 'translate-x-6' : ''}`} />
              </button>
              <p className="text-xs text-slate-500 mt-1">Delay navigation until tags finish firing</p>
            </div>
          </>
        );
      case 'scroll':
        return (
          <>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Scroll Threshold (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.threshold || 50}
                onChange={(e) => onFieldChange('threshold', parseInt(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm focus:ring-1 focus:ring-sky-400 outline-none"
              />
              <p className="text-xs text-slate-500 mt-1">Fire when user scrolls past this percentage of the page</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Fire Once</label>
              <button
                onClick={() => onFieldChange('fireOnce', !formData.fireOnce)}
                className={`w-12 h-6 rounded-full p-1 transition-colors ${formData.fireOnce ? 'bg-sky-500' : 'bg-slate-700'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${formData.fireOnce ? 'translate-x-6' : ''}`} />
              </button>
              <p className="text-xs text-slate-500 mt-1">Only fire once per page load</p>
            </div>
          </>
        );
      case 'timer':
        return (
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Delay (ms)</label>
            <input
              type="number"
              min="0"
              step="100"
              value={formData.delay || 1000}
              onChange={(e) => onFieldChange('delay', parseInt(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm focus:ring-1 focus:ring-sky-400 outline-none"
            />
            <p className="text-xs text-slate-500 mt-1">Time in milliseconds before the trigger fires</p>
          </div>
        );
      case 'custom':
        return (
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Event Name</label>
            <input
              type="text"
              value={formData.eventName || ''}
              onChange={(e) => onFieldChange('eventName', e.target.value)}
              placeholder="e.g., purchase, signup_complete"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm focus:ring-1 focus:ring-sky-400 outline-none"
            />
            <p className="text-xs text-slate-500 mt-1">Custom dataLayer event name to listen for</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col -m-8">
      <div className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-950/30">
        <div className="flex items-center gap-4">
          <Link href="/triggers" className="p-2 hover:bg-slate-800 rounded-md transition-colors text-slate-400 hover:text-slate-100">
            <ArrowLeft size={20} />
          </Link>
          <h2 className="text-lg font-bold text-slate-100">{asset.name} <span className="text-xs font-normal text-slate-500 ml-2">({asset.id}.ts)</span></h2>
        </div>
        <div className="flex items-center gap-4">
          {saving ? (
            <span className="text-xs text-sky-400 animate-pulse flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> Syncing...
            </span>
          ) : (
            <span className="text-xs text-slate-500 italic">Saved to Disk</span>
          )}
          <button onClick={() => handleUpdate(formData)} className="px-4 py-2 rounded-md font-semibold text-sm bg-sky-400 text-slate-950 hover:bg-sky-500 transition-colors">
            Force Build
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[450px] border-r border-slate-800 p-8 overflow-y-auto bg-slate-900/50">
          <div className="space-y-8">
            <section>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2"><Zap size={14} className="text-sky-400" /> Configuration</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Trigger Name</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => onFieldChange('name', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm focus:ring-1 focus:ring-sky-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Trigger Type</label>
                  <select
                    value={formData.type || 'pageview'}
                    onChange={(e) => onFieldChange('type', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm focus:ring-1 focus:ring-sky-400 outline-none"
                  >
                    {TRIGGER_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Description</label>
                  <input
                    type="text"
                    value={formData.description || ''}
                    onChange={(e) => onFieldChange('description', e.target.value)}
                    placeholder="Optional description"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm focus:ring-1 focus:ring-sky-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Enabled</label>
                  <button
                    onClick={() => onFieldChange('enabled', !formData.enabled)}
                    className={`w-12 h-6 rounded-full p-1 transition-colors ${formData.enabled ? 'bg-sky-500' : 'bg-slate-700'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${formData.enabled ? 'translate-x-6' : ''}`} />
                  </button>
                </div>
                {renderTypeSpecificFields()}
              </div>
            </section>
          </div>
        </div>

        <div className="flex-1 bg-[#1d1f21] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-2 border-b border-white/5 bg-black/20">
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest font-bold">TypeScript Source</span>
          </div>
          <div className="flex-1 overflow-auto p-0 relative">
            <pre className="m-0 h-full !bg-transparent">
              <code className="language-typescript !bg-transparent text-sm">
                {source}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
