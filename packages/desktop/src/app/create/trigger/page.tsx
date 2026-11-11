"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2, Zap } from 'lucide-react';

type TriggerType = 'pageview' | 'click' | 'scroll' | 'timer' | 'form' | 'visibility' | 'custom';

interface TriggerConfig {
  name: string;
  type: TriggerType;
  description: string;
  // Type-specific config
  selector?: string;
  threshold?: number;
  scrollType?: 'percentage' | 'pixels';
  interval?: number;
  repeat?: boolean;
  maxCount?: number;
  eventName?: string;
  waitForTags?: boolean;
}

const triggerTypes: Array<{ value: TriggerType; label: string; description: string }> = [
  { value: 'pageview', label: 'Page View', description: 'Fires when a page loads' },
  { value: 'click', label: 'Click', description: 'Fires when an element is clicked' },
  { value: 'scroll', label: 'Scroll Depth', description: 'Fires at specific scroll positions' },
  { value: 'timer', label: 'Timer', description: 'Fires after a time delay' },
  { value: 'form', label: 'Form Submit', description: 'Fires when a form is submitted' },
  { value: 'visibility', label: 'Element Visibility', description: 'Fires when element becomes visible' },
  { value: 'custom', label: 'Custom Event', description: 'Fires on dataLayer or custom events' },
];

export default function CreateTriggerPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<TriggerConfig>({
    name: '',
    type: 'pageview',
    description: '',
    threshold: 50,
    scrollType: 'percentage',
    interval: 5000,
    repeat: false,
    maxCount: 1,
    waitForTags: true,
  });

  const handleChange = (name: keyof TriggerConfig, value: unknown) => {
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

    if (config.type === 'click' && !config.selector?.trim()) {
      newErrors.selector = 'CSS selector is required for click triggers';
    }

    if (config.type === 'visibility' && !config.selector?.trim()) {
      newErrors.selector = 'CSS selector is required for visibility triggers';
    }

    if (config.type === 'form' && !config.selector?.trim()) {
      newErrors.selector = 'Form selector is required (or use "form" for all forms)';
    }

    if (config.type === 'custom' && !config.eventName?.trim()) {
      newErrors.eventName = 'Event name is required';
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
          type: 'trigger',
          config,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create trigger');
      }

      router.push(`/triggers/${result.id || result.name}`);
    } catch (err) {
      console.error('Failed to create trigger:', err);
      setSubmitting(false);
    }
  };

  const renderTypeSpecificFields = () => {
    switch (config.type) {
      case 'click':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                CSS Selector
              </label>
              <input
                type="text"
                value={config.selector || ''}
                onChange={(e) => handleChange('selector', e.target.value)}
                placeholder=".button, [data-track-click], #submit-btn"
                className={`
                  w-full px-4 py-3 bg-slate-800/50 border rounded-lg text-slate-100
                  placeholder-slate-500 focus:outline-none focus:ring-1
                  ${errors.selector
                    ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/50'
                    : 'border-slate-700 focus:border-sky-400/50 focus:ring-sky-400/50'
                  }
                `}
              />
              {errors.selector && <p className="mt-2 text-sm text-red-400">{errors.selector}</p>}
              <p className="mt-2 text-xs text-slate-500">Elements matching this selector will trigger the event when clicked.</p>
            </div>
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  onClick={() => handleChange('waitForTags', !config.waitForTags)}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                    ${config.waitForTags ? 'bg-sky-400' : 'bg-slate-700'}
                  `}
                >
                  <span
                    className={`
                      inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                      ${config.waitForTags ? 'translate-x-6' : 'translate-x-1'}
                    `}
                  />
                </button>
                <span className="text-sm text-slate-300">Wait for tags before navigation</span>
              </label>
              <p className="mt-2 text-xs text-slate-500 ml-14">If enabled, delays link navigation until all tags have fired.</p>
            </div>
          </>
        );

      case 'scroll':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Scroll Measurement
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={config.scrollType === 'percentage'}
                    onChange={() => handleChange('scrollType', 'percentage')}
                    className="text-sky-400 focus:ring-sky-400/50"
                  />
                  <span className="text-slate-300">Percentage</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={config.scrollType === 'pixels'}
                    onChange={() => handleChange('scrollType', 'pixels')}
                    className="text-sky-400 focus:ring-sky-400/50"
                  />
                  <span className="text-slate-300">Pixels</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Threshold ({config.scrollType === 'percentage' ? '%' : 'px'})
              </label>
              <input
                type="number"
                value={config.threshold ?? 50}
                onChange={(e) => handleChange('threshold', parseInt(e.target.value) || 0)}
                min={0}
                max={config.scrollType === 'percentage' ? 100 : undefined}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/50"
              />
            </div>
          </>
        );

      case 'timer':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Interval (milliseconds)
              </label>
              <input
                type="number"
                value={config.interval ?? 5000}
                onChange={(e) => handleChange('interval', parseInt(e.target.value) || 0)}
                min={100}
                step={100}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/50"
              />
              <p className="mt-2 text-xs text-slate-500">Time to wait before firing (5000 = 5 seconds).</p>
            </div>
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  onClick={() => handleChange('repeat', !config.repeat)}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                    ${config.repeat ? 'bg-sky-400' : 'bg-slate-700'}
                  `}
                >
                  <span
                    className={`
                      inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                      ${config.repeat ? 'translate-x-6' : 'translate-x-1'}
                    `}
                  />
                </button>
                <span className="text-sm text-slate-300">Repeat</span>
              </label>
            </div>
            {config.repeat && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Maximum fires (0 for unlimited)
                </label>
                <input
                  type="number"
                  value={config.maxCount ?? 1}
                  onChange={(e) => handleChange('maxCount', parseInt(e.target.value) || 0)}
                  min={0}
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/50"
                />
              </div>
            )}
          </>
        );

      case 'form':
        return (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Form Selector
            </label>
            <input
              type="text"
              value={config.selector || ''}
              onChange={(e) => handleChange('selector', e.target.value)}
              placeholder="form, #contact-form, .newsletter-form"
              className={`
                w-full px-4 py-3 bg-slate-800/50 border rounded-lg text-slate-100
                placeholder-slate-500 focus:outline-none focus:ring-1
                ${errors.selector
                  ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/50'
                  : 'border-slate-700 focus:border-sky-400/50 focus:ring-sky-400/50'
                }
              `}
            />
            {errors.selector && <p className="mt-2 text-sm text-red-400">{errors.selector}</p>}
            <p className="mt-2 text-xs text-slate-500">Use "form" to match all forms, or specify a CSS selector.</p>
          </div>
        );

      case 'visibility':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Element Selector
              </label>
              <input
                type="text"
                value={config.selector || ''}
                onChange={(e) => handleChange('selector', e.target.value)}
                placeholder="#hero-section, .product-card, [data-track-view]"
                className={`
                  w-full px-4 py-3 bg-slate-800/50 border rounded-lg text-slate-100
                  placeholder-slate-500 focus:outline-none focus:ring-1
                  ${errors.selector
                    ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/50'
                    : 'border-slate-700 focus:border-sky-400/50 focus:ring-sky-400/50'
                  }
                `}
              />
              {errors.selector && <p className="mt-2 text-sm text-red-400">{errors.selector}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Visibility Threshold (%)
              </label>
              <input
                type="number"
                value={config.threshold ?? 50}
                onChange={(e) => handleChange('threshold', parseInt(e.target.value) || 0)}
                min={0}
                max={100}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/50"
              />
              <p className="mt-2 text-xs text-slate-500">Percentage of element that must be visible to trigger (0-100).</p>
            </div>
          </>
        );

      case 'custom':
        return (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Event Name
            </label>
            <input
              type="text"
              value={config.eventName || ''}
              onChange={(e) => handleChange('eventName', e.target.value)}
              placeholder="purchase, signup, add_to_cart"
              className={`
                w-full px-4 py-3 bg-slate-800/50 border rounded-lg text-slate-100
                placeholder-slate-500 focus:outline-none focus:ring-1
                ${errors.eventName
                  ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/50'
                  : 'border-slate-700 focus:border-sky-400/50 focus:ring-sky-400/50'
                }
              `}
            />
            {errors.eventName && <p className="mt-2 text-sm text-red-400">{errors.eventName}</p>}
            <p className="mt-2 text-xs text-slate-500">The event name pushed to dataLayer that triggers this.</p>
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
        <h1 className="text-3xl font-bold text-slate-100">Create New Trigger</h1>
        <p className="text-slate-400 mt-1">
          Define when your tags should fire.
        </p>
      </div>

      <div className="bg-slate-800/20 border border-slate-700/50 rounded-xl p-6">
        <div className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Trigger Name
            </label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="All Pages - Page View"
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
              Trigger Type
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {triggerTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => handleChange('type', type.value)}
                  className={`
                    p-3 rounded-lg border text-left transition-all
                    ${config.type === type.value
                      ? 'bg-amber-400/10 border-amber-400/40 text-amber-400'
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
              placeholder="Describe what this trigger does..."
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
          className="px-6 py-2 rounded-lg font-semibold text-sm bg-amber-400 text-slate-950 hover:bg-amber-500 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" size={16} />
              Creating...
            </>
          ) : (
            <>
              <Check size={16} />
              Create Trigger
            </>
          )}
        </button>
      </div>
    </div>
  );
}
