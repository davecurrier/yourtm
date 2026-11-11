"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2, Database } from 'lucide-react';

type VariableType = 'dataLayer' | 'cookie' | 'localStorage' | 'javascript' | 'url' | 'constant';

interface VariableConfig {
  name: string;
  type: VariableType;
  description: string;
  // Type-specific config
  dataLayerKey?: string;
  cookieName?: string;
  localStorageKey?: string;
  jsExpression?: string;
  urlPart?: 'href' | 'pathname' | 'hostname' | 'search' | 'hash' | 'param';
  urlParam?: string;
  constantValue?: string;
  defaultValue?: string;
}

const variableTypes: Array<{ value: VariableType; label: string; description: string }> = [
  { value: 'dataLayer', label: 'DataLayer', description: 'Read from window.dataLayer' },
  { value: 'cookie', label: 'Cookie', description: 'Read a cookie value' },
  { value: 'localStorage', label: 'Local Storage', description: 'Read from localStorage' },
  { value: 'javascript', label: 'JavaScript', description: 'Execute custom JavaScript' },
  { value: 'url', label: 'URL', description: 'Extract from current URL' },
  { value: 'constant', label: 'Constant', description: 'A fixed value' },
];

const urlParts: Array<{ value: string; label: string; example: string }> = [
  { value: 'href', label: 'Full URL', example: 'https://example.com/path?q=1' },
  { value: 'pathname', label: 'Path', example: '/products/shoes' },
  { value: 'hostname', label: 'Hostname', example: 'example.com' },
  { value: 'search', label: 'Query String', example: '?q=search&page=1' },
  { value: 'hash', label: 'Hash', example: '#section' },
  { value: 'param', label: 'Query Parameter', example: 'utm_source value' },
];

export default function CreateVariablePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<VariableConfig>({
    name: '',
    type: 'dataLayer',
    description: '',
    urlPart: 'pathname',
  });

  const handleChange = (name: keyof VariableConfig, value: unknown) => {
    setConfig(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!config.name.trim()) {
      newErrors.name = 'Name is required';
    }

    switch (config.type) {
      case 'dataLayer':
        if (!config.dataLayerKey?.trim()) {
          newErrors.dataLayerKey = 'DataLayer key is required';
        }
        break;
      case 'cookie':
        if (!config.cookieName?.trim()) {
          newErrors.cookieName = 'Cookie name is required';
        }
        break;
      case 'localStorage':
        if (!config.localStorageKey?.trim()) {
          newErrors.localStorageKey = 'LocalStorage key is required';
        }
        break;
      case 'javascript':
        if (!config.jsExpression?.trim()) {
          newErrors.jsExpression = 'JavaScript expression is required';
        }
        break;
      case 'url':
        if (config.urlPart === 'param' && !config.urlParam?.trim()) {
          newErrors.urlParam = 'Parameter name is required';
        }
        break;
      case 'constant':
        if (config.constantValue === undefined || config.constantValue === '') {
          newErrors.constantValue = 'Value is required';
        }
        break;
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
          type: 'variable',
          config,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create variable');
      }

      router.push(`/variables/${result.id || result.name}`);
    } catch (err) {
      console.error('Failed to create variable:', err);
      setSubmitting(false);
    }
  };

  const renderTypeSpecificFields = () => {
    switch (config.type) {
      case 'dataLayer':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                DataLayer Key
              </label>
              <input
                type="text"
                value={config.dataLayerKey || ''}
                onChange={(e) => handleChange('dataLayerKey', e.target.value)}
                placeholder="user.email, ecommerce.purchase.value"
                className={`
                  w-full px-4 py-3 bg-slate-800/50 border rounded-lg text-slate-100 font-mono
                  placeholder-slate-500 focus:outline-none focus:ring-1
                  ${errors.dataLayerKey
                    ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/50'
                    : 'border-slate-700 focus:border-sky-400/50 focus:ring-sky-400/50'
                  }
                `}
              />
              {errors.dataLayerKey && <p className="mt-2 text-sm text-red-400">{errors.dataLayerKey}</p>}
              <p className="mt-2 text-xs text-slate-500">Use dot notation for nested values: user.profile.name</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Default Value (optional)
              </label>
              <input
                type="text"
                value={config.defaultValue || ''}
                onChange={(e) => handleChange('defaultValue', e.target.value)}
                placeholder="Value to use if key not found"
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/50"
              />
            </div>
          </>
        );

      case 'cookie':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Cookie Name
              </label>
              <input
                type="text"
                value={config.cookieName || ''}
                onChange={(e) => handleChange('cookieName', e.target.value)}
                placeholder="_ga, user_session, consent_status"
                className={`
                  w-full px-4 py-3 bg-slate-800/50 border rounded-lg text-slate-100 font-mono
                  placeholder-slate-500 focus:outline-none focus:ring-1
                  ${errors.cookieName
                    ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/50'
                    : 'border-slate-700 focus:border-sky-400/50 focus:ring-sky-400/50'
                  }
                `}
              />
              {errors.cookieName && <p className="mt-2 text-sm text-red-400">{errors.cookieName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Default Value (optional)
              </label>
              <input
                type="text"
                value={config.defaultValue || ''}
                onChange={(e) => handleChange('defaultValue', e.target.value)}
                placeholder="Value to use if cookie not found"
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/50"
              />
            </div>
          </>
        );

      case 'localStorage':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                LocalStorage Key
              </label>
              <input
                type="text"
                value={config.localStorageKey || ''}
                onChange={(e) => handleChange('localStorageKey', e.target.value)}
                placeholder="user_preferences, cart_items"
                className={`
                  w-full px-4 py-3 bg-slate-800/50 border rounded-lg text-slate-100 font-mono
                  placeholder-slate-500 focus:outline-none focus:ring-1
                  ${errors.localStorageKey
                    ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/50'
                    : 'border-slate-700 focus:border-sky-400/50 focus:ring-sky-400/50'
                  }
                `}
              />
              {errors.localStorageKey && <p className="mt-2 text-sm text-red-400">{errors.localStorageKey}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Default Value (optional)
              </label>
              <input
                type="text"
                value={config.defaultValue || ''}
                onChange={(e) => handleChange('defaultValue', e.target.value)}
                placeholder="Value to use if key not found"
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/50"
              />
            </div>
          </>
        );

      case 'javascript':
        return (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              JavaScript Expression
            </label>
            <textarea
              value={config.jsExpression || ''}
              onChange={(e) => handleChange('jsExpression', e.target.value)}
              placeholder="window.location.pathname
document.title
window.screen.width + 'x' + window.screen.height"
              rows={4}
              className={`
                w-full px-4 py-3 bg-slate-800/50 border rounded-lg text-slate-100 font-mono text-sm
                placeholder-slate-500 focus:outline-none focus:ring-1 resize-none
                ${errors.jsExpression
                  ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/50'
                  : 'border-slate-700 focus:border-sky-400/50 focus:ring-sky-400/50'
                }
              `}
            />
            {errors.jsExpression && <p className="mt-2 text-sm text-red-400">{errors.jsExpression}</p>}
            <p className="mt-2 text-xs text-slate-500">
              The expression is evaluated and its result is used as the variable value.
            </p>
          </div>
        );

      case 'url':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                URL Part
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {urlParts.map((part) => (
                  <button
                    key={part.value}
                    type="button"
                    onClick={() => handleChange('urlPart', part.value)}
                    className={`
                      p-3 rounded-lg border text-left transition-all
                      ${config.urlPart === part.value
                        ? 'bg-purple-400/10 border-purple-400/40 text-purple-400'
                        : 'bg-slate-800/30 border-slate-700/50 text-slate-400 hover:border-slate-600'
                      }
                    `}
                  >
                    <div className="font-medium text-sm">{part.label}</div>
                    <div className="text-xs opacity-70 mt-0.5 font-mono">{part.example}</div>
                  </button>
                ))}
              </div>
            </div>
            {config.urlPart === 'param' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Query Parameter Name
                </label>
                <input
                  type="text"
                  value={config.urlParam || ''}
                  onChange={(e) => handleChange('urlParam', e.target.value)}
                  placeholder="utm_source, ref, page"
                  className={`
                    w-full px-4 py-3 bg-slate-800/50 border rounded-lg text-slate-100 font-mono
                    placeholder-slate-500 focus:outline-none focus:ring-1
                    ${errors.urlParam
                      ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/50'
                      : 'border-slate-700 focus:border-sky-400/50 focus:ring-sky-400/50'
                    }
                  `}
                />
                {errors.urlParam && <p className="mt-2 text-sm text-red-400">{errors.urlParam}</p>}
              </div>
            )}
          </>
        );

      case 'constant':
        return (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Constant Value
            </label>
            <input
              type="text"
              value={config.constantValue || ''}
              onChange={(e) => handleChange('constantValue', e.target.value)}
              placeholder="Enter a fixed value"
              className={`
                w-full px-4 py-3 bg-slate-800/50 border rounded-lg text-slate-100
                placeholder-slate-500 focus:outline-none focus:ring-1
                ${errors.constantValue
                  ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/50'
                  : 'border-slate-700 focus:border-sky-400/50 focus:ring-sky-400/50'
                }
              `}
            />
            {errors.constantValue && <p className="mt-2 text-sm text-red-400">{errors.constantValue}</p>}
            <p className="mt-2 text-xs text-slate-500">
              This value will be the same every time the variable is accessed.
            </p>
          </div>
        );

      default:
        return null;
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
        <h1 className="text-3xl font-bold text-slate-100">Create New Variable</h1>
        <p className="text-slate-400 mt-1">
          Define reusable values that can be accessed in your tags.
        </p>
      </div>

      <div className="bg-slate-800/20 border border-slate-700/50 rounded-xl p-6">
        <div className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Variable Name
            </label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="User ID, Page Category, UTM Source, etc."
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

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Variable Type
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {variableTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => handleChange('type', type.value)}
                  className={`
                    p-3 rounded-lg border text-left transition-all
                    ${config.type === type.value
                      ? 'bg-purple-400/10 border-purple-400/40 text-purple-400'
                      : 'bg-slate-800/30 border-slate-700/50 text-slate-400 hover:border-slate-600'
                    }
                  `}
                >
                  <div className="font-medium text-sm">{type.label}</div>
                  <div className="text-xs opacity-70 mt-0.5">{type.description}</div>
                </button>
              ))}
            </div>
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
              placeholder="Describe what this variable contains..."
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/50"
            />
          </div>

          {/* Type-specific fields */}
          {renderTypeSpecificFields()}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-6 py-2 rounded-lg font-semibold text-sm bg-purple-400 text-slate-950 hover:bg-purple-500 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" size={16} />
              Creating...
            </>
          ) : (
            <>
              <Check size={16} />
              Create Variable
            </>
          )}
        </button>
      </div>
    </div>
  );
}
