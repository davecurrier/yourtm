"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2, Map, Plus, X } from 'lucide-react';

interface ZoneConfig {
  name: string;
  description: string;
  patterns: string[];
  priority: number;
}

const commonPatterns = [
  { label: 'All Pages', value: '*' },
  { label: 'Homepage Only', value: '/' },
  { label: 'Product Pages', value: '/products/*' },
  { label: 'Category Pages', value: '/collections/*' },
  { label: 'Cart Page', value: '/cart' },
  { label: 'Checkout Pages', value: '/checkout/*' },
  { label: 'Blog Pages', value: '/blog/*' },
  { label: 'Account Pages', value: '/account/*' },
];

export default function CreateZonePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newPattern, setNewPattern] = useState('');
  const [config, setConfig] = useState<ZoneConfig>({
    name: '',
    description: '',
    patterns: [],
    priority: 0,
  });

  const handleChange = (name: keyof ZoneConfig, value: unknown) => {
    setConfig(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const addPattern = (pattern: string) => {
    const trimmed = pattern.trim();
    if (trimmed && !config.patterns.includes(trimmed)) {
      handleChange('patterns', [...config.patterns, trimmed]);
    }
    setNewPattern('');
  };

  const removePattern = (pattern: string) => {
    handleChange('patterns', config.patterns.filter(p => p !== pattern));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!config.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (config.patterns.length === 0) {
      newErrors.patterns = 'At least one URL pattern is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);

    try {
      const response = await fetch('/api/project/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'zone',
          config,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create zone');
      }

      router.push(`/zones/${result.id || result.name}`);
    } catch (err) {
      console.error('Failed to create zone:', err);
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/create"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Create
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-100">Create New Zone</h1>
        <p className="text-slate-400 mt-1">
          Define URL patterns to control where tags fire.
        </p>
      </div>

      <div className="bg-slate-800/20 border border-slate-700/50 rounded-xl p-6">
        <div className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Zone Name
            </label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Product Pages, Checkout, Blog, etc."
              className={`
                w-full px-4 py-3 bg-slate-800/50 border rounded-lg text-slate-100
                placeholder-slate-500 focus:outline-none focus:ring-1
                ${errors.name
                  ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/50'
                  : 'border-slate-700 focus:border-sky-400/50 focus:ring-sky-400/50'
                }
              `}
            />
            {errors.name && <p className="mt-2 text-sm text-red-400">{errors.name}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Description (optional)
            </label>
            <input
              type="text"
              value={config.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Describe what pages this zone covers..."
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/50"
            />
          </div>

          {/* URL Patterns */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              URL Patterns
            </label>

            {/* Quick add common patterns */}
            <div className="mb-3">
              <p className="text-xs text-slate-500 mb-2">Quick add common patterns:</p>
              <div className="flex flex-wrap gap-2">
                {commonPatterns.map((pattern) => (
                  <button
                    key={pattern.value}
                    type="button"
                    onClick={() => addPattern(pattern.value)}
                    disabled={config.patterns.includes(pattern.value)}
                    className={`
                      px-3 py-1 text-xs rounded-full border transition-colors
                      ${config.patterns.includes(pattern.value)
                        ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-400 cursor-not-allowed'
                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-emerald-400/50 hover:text-emerald-400'
                      }
                    `}
                  >
                    {pattern.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Current patterns */}
            {config.patterns.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {config.patterns.map((pattern) => (
                  <div
                    key={pattern}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-400/10 border border-emerald-400/30 rounded-lg"
                  >
                    <Map size={14} className="text-emerald-400" />
                    <code className="text-sm text-emerald-400 font-mono">{pattern}</code>
                    <button
                      type="button"
                      onClick={() => removePattern(pattern)}
                      className="text-emerald-400/70 hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add custom pattern */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPattern(newPattern);
                  }
                }}
                placeholder="/custom-path/*, /page/*"
                className={`
                  flex-1 px-4 py-3 bg-slate-800/50 border rounded-lg text-slate-100
                  placeholder-slate-500 focus:outline-none focus:ring-1
                  ${errors.patterns
                    ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/50'
                    : 'border-slate-700 focus:border-sky-400/50 focus:ring-sky-400/50'
                  }
                `}
              />
              <button
                type="button"
                onClick={() => addPattern(newPattern)}
                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-colors"
              >
                <Plus size={18} />
              </button>
            </div>
            {errors.patterns && <p className="mt-2 text-sm text-red-400">{errors.patterns}</p>}
            <p className="mt-2 text-xs text-slate-500">
              Use * as a wildcard. Examples: /products/*, /blog/*, /checkout/*
            </p>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Priority
            </label>
            <input
              type="number"
              value={config.priority}
              onChange={(e) => handleChange('priority', parseInt(e.target.value) || 0)}
              min={0}
              max={100}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/50"
            />
            <p className="mt-2 text-xs text-slate-500">
              Higher priority zones are matched first. Use for more specific patterns.
            </p>
          </div>
        </div>
      </div>

      {/* Pattern matching preview */}
      <div className="mt-6 p-4 bg-slate-800/30 border border-slate-700/50 rounded-lg">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Pattern Matching Info</h3>
        <ul className="text-xs text-slate-500 space-y-1">
          <li><code className="bg-slate-800 px-1 rounded">*</code> - Matches any path segment</li>
          <li><code className="bg-slate-800 px-1 rounded">/products/*</code> - Matches /products/anything</li>
          <li><code className="bg-slate-800 px-1 rounded">/blog/**</code> - Matches /blog/any/nested/path</li>
          <li><code className="bg-slate-800 px-1 rounded">/</code> - Matches only the homepage</li>
        </ul>
      </div>

      <div className="mt-6 flex items-center justify-end">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-6 py-2 rounded-lg font-semibold text-sm bg-emerald-400 text-slate-950 hover:bg-emerald-500 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" size={16} />
              Creating...
            </>
          ) : (
            <>
              <Check size={16} />
              Create Zone
            </>
          )}
        </button>
      </div>
    </div>
  );
}
