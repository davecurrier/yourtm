"use client";

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, Shield, Zap, Info, Loader2 } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/themes/prism-tomorrow.css'; // Dark theme

export default function TagEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tag, setTag] = useState<any>(null);
  const [source, setSource] = useState<string>('');
  const [template, setTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});

  useEffect(() => {
    fetch(`/api/project/tags/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.tag) {
          setTag(data.tag);
          setSource(data.source || '');
          setTemplate(data.template);
          setFormData({
            name: data.tag.name,
            ...data.tag
          });
        }
        setLoading(false);
      })
      .catch(console.error);
  }, [id]);

  // Trigger Prism highlighting whenever source changes
  useEffect(() => {
    if (!loading && source) {
      Prism.highlightAll();
    }
  }, [source, loading]);

  const handleUpdate = async (updates: Record<string, any>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/project/tags/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
      const result = await res.json();
      if (result.success) {
        setSource(result.source);
        setTag(result.tag);
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
  
  if (!tag) return <div className="p-8 text-red-400">Tag not found.</div>;

  return (
    <div className="h-full flex flex-col -m-8">
      <div className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-950/30">
        <div className="flex items-center gap-4">
          <Link href="/tags" className="p-2 hover:bg-slate-800 rounded-md transition-colors text-slate-400 hover:text-slate-100">
            <ArrowLeft size={20} />
          </Link>
          <h2 className="text-lg font-bold text-slate-100">{tag.name} <span className="text-xs font-normal text-slate-500 ml-2">({tag.id}.ts)</span></h2>
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
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Tag Name</label>
                  <input type="text" value={formData.name || ''} onChange={(e) => onFieldChange('name', e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm focus:ring-1 focus:ring-sky-400 outline-none" />
                </div>
                {template?.questions.map((q: any) => (
                  <div key={q.name}>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">{q.message.replace(/\?$/, '')}</label>
                    {q.type === 'select' ? (
                      <select value={formData[q.name] ?? q.initial} onChange={(e) => onFieldChange(q.name, e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm">
                        {q.choices.map((c: any) => <option key={c.value} value={c.value}>{c.title}</option>)}
                      </select>
                    ) : q.type === 'confirm' ? (
                      <button onClick={() => onFieldChange(q.name, !formData[q.name])} className={`w-12 h-6 rounded-full p-1 transition-colors ${formData[q.name] ? 'bg-sky-500' : 'bg-slate-700'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${formData[q.name] ? 'translate-x-6' : ''}`} />
                      </button>
                    ) : (
                      <input type="text" value={formData[q.name] || ''} onChange={(e) => onFieldChange(q.name, e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm" />
                    )}
                  </div>
                ))}
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
