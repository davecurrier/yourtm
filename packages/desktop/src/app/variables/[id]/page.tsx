"use client";

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Variable } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/themes/prism-tomorrow.css';

const VARIABLE_TYPES = [
  { value: 'dataLayer', title: 'Data Layer', sourceLabel: 'Path', sourcePlaceholder: 'e.g., user.id, ecommerce.value' },
  { value: 'cookie', title: 'Cookie', sourceLabel: 'Cookie Name', sourcePlaceholder: 'e.g., _ga, session_id' },
  { value: 'localStorage', title: 'Local Storage', sourceLabel: 'Key', sourcePlaceholder: 'e.g., user_preferences' },
  { value: 'javascript', title: 'JavaScript', sourceLabel: 'JS Expression', sourcePlaceholder: 'e.g., window.userId' },
  { value: 'url', title: 'URL', sourceLabel: 'URL Part', sourcePlaceholder: 'path, hostname, query, hash' },
];

export default function VariableEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [asset, setAsset] = useState<any>(null);
  const [source, setSource] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});

  useEffect(() => {
    fetch(`/api/project/variables/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.asset) {
          setAsset(data.asset);
          setSource(data.source || '');

          // Determine the source value based on type
          let sourceValue = '';
          const varType = data.asset.type || 'dataLayer';
          switch (varType) {
            case 'dataLayer':
              sourceValue = data.asset.path || '';
              break;
            case 'cookie':
              sourceValue = data.asset.cookieName || '';
              break;
            case 'localStorage':
              sourceValue = data.asset.key || '';
              break;
            case 'javascript':
              sourceValue = data.asset.jsPath || data.asset.expression || '';
              break;
            case 'url':
              sourceValue = data.asset.part || 'path';
              break;
          }

          setFormData({
            name: data.asset.name,
            type: varType,
            source: sourceValue,
            defaultValue: data.asset.defaultValue || '',
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
      // Map the source field to the appropriate property based on type
      const processedUpdates = { ...updates };
      if (updates.source !== undefined) {
        const currentType = formData.type || 'dataLayer';
        switch (currentType) {
          case 'dataLayer':
            processedUpdates.path = updates.source;
            break;
          case 'cookie':
            processedUpdates.cookieName = updates.source;
            break;
          case 'localStorage':
            processedUpdates.key = updates.source;
            break;
          case 'javascript':
            processedUpdates.jsPath = updates.source;
            break;
          case 'url':
            processedUpdates.part = updates.source;
            break;
        }
        delete processedUpdates.source;
      }

      const res = await fetch(`/api/project/variables/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: processedUpdates })
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

    // When type changes, clear the source field
    if (name === 'type' && value !== formData.type) {
      newFormData.source = '';
    }

    setFormData(newFormData);
    handleUpdate({ [name]: value });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full text-slate-500 gap-3">
      <Loader2 className="animate-spin" /> Initializing Live Sync...
    </div>
  );

  if (!asset) return <div className="p-8 text-red-400">Variable not found.</div>;

  const currentTypeConfig = VARIABLE_TYPES.find(t => t.value === formData.type) || VARIABLE_TYPES[0];

  const renderUrlPartOptions = () => (
    <select
      value={formData.source || 'path'}
      onChange={(e) => onFieldChange('source', e.target.value)}
      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm focus:ring-1 focus:ring-sky-400 outline-none"
    >
      <option value="path">Path (e.g., /products/123)</option>
      <option value="hostname">Hostname (e.g., www.example.com)</option>
      <option value="query">Query String (e.g., ?id=123)</option>
      <option value="hash">Hash (e.g., #section)</option>
      <option value="protocol">Protocol (e.g., https:)</option>
      <option value="port">Port (e.g., 8080)</option>
      <option value="href">Full URL</option>
    </select>
  );

  return (
    <div className="h-full flex flex-col -m-8">
      <div className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-950/30">
        <div className="flex items-center gap-4">
          <Link href="/variables" className="p-2 hover:bg-slate-800 rounded-md transition-colors text-slate-400 hover:text-slate-100">
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
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2"><Variable size={14} className="text-sky-400" /> Configuration</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Variable Name</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => onFieldChange('name', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm focus:ring-1 focus:ring-sky-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Variable Type</label>
                  <select
                    value={formData.type || 'dataLayer'}
                    onChange={(e) => onFieldChange('type', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm focus:ring-1 focus:ring-sky-400 outline-none"
                  >
                    {VARIABLE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{currentTypeConfig.sourceLabel}</label>
                  {formData.type === 'url' ? (
                    renderUrlPartOptions()
                  ) : (
                    <input
                      type="text"
                      value={formData.source || ''}
                      onChange={(e) => onFieldChange('source', e.target.value)}
                      placeholder={currentTypeConfig.sourcePlaceholder}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm focus:ring-1 focus:ring-sky-400 outline-none"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Default Value</label>
                  <input
                    type="text"
                    value={formData.defaultValue || ''}
                    onChange={(e) => onFieldChange('defaultValue', e.target.value)}
                    placeholder="Value if source is undefined"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm focus:ring-1 focus:ring-sky-400 outline-none"
                  />
                  <p className="text-xs text-slate-500 mt-1">Returned when the source value is not found</p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Variable Type Reference</h3>
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-700">
                  <div className="text-sky-400 font-bold mb-1">Data Layer</div>
                  <div className="text-slate-400">Read values from the dataLayer using dot notation (e.g., <code className="text-slate-300">user.id</code>)</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-700">
                  <div className="text-sky-400 font-bold mb-1">Cookie</div>
                  <div className="text-slate-400">Read browser cookie values by name (e.g., <code className="text-slate-300">_ga</code>)</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-700">
                  <div className="text-sky-400 font-bold mb-1">Local Storage</div>
                  <div className="text-slate-400">Read from browser localStorage by key</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-700">
                  <div className="text-sky-400 font-bold mb-1">JavaScript</div>
                  <div className="text-slate-400">Evaluate any JS expression (e.g., <code className="text-slate-300">window.userId</code>)</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-700">
                  <div className="text-sky-400 font-bold mb-1">URL</div>
                  <div className="text-slate-400">Extract parts of the current URL (path, hostname, query, etc.)</div>
                </div>
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
