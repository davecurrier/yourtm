"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Loader2, Tag, ChevronRight } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description: string;
  platform?: string;
  category?: string;
  icon?: string;
  questions: TemplateQuestion[];
}

interface TemplateQuestion {
  type: string;
  name: string;
  message?: string;
  label?: string;
  initial?: unknown;
  default?: unknown;
  choices?: Array<{ title?: string; value: string; label?: string; description?: string }>;
  validate?: (value: unknown) => boolean | string;
  when?: (answers: Record<string, unknown>) => boolean;
}

type Step = 'select' | 'configure' | 'review';

const platformColors: Record<string, { bg: string; text: string; border: string }> = {
  'google-analytics': { bg: 'bg-orange-400/10', text: 'text-orange-400', border: 'border-orange-400/20' },
  'google-ads': { bg: 'bg-blue-400/10', text: 'text-blue-400', border: 'border-blue-400/20' },
  'meta': { bg: 'bg-indigo-400/10', text: 'text-indigo-400', border: 'border-indigo-400/20' },
  'tiktok': { bg: 'bg-pink-400/10', text: 'text-pink-400', border: 'border-pink-400/20' },
  'linkedin': { bg: 'bg-sky-400/10', text: 'text-sky-400', border: 'border-sky-400/20' },
  'twitter': { bg: 'bg-slate-400/10', text: 'text-slate-400', border: 'border-slate-400/20' },
  'snapchat': { bg: 'bg-yellow-400/10', text: 'text-yellow-400', border: 'border-yellow-400/20' },
  'pinterest': { bg: 'bg-red-400/10', text: 'text-red-400', border: 'border-red-400/20' },
  'ecommerce': { bg: 'bg-emerald-400/10', text: 'text-emerald-400', border: 'border-emerald-400/20' },
  'default': { bg: 'bg-slate-400/10', text: 'text-slate-400', border: 'border-slate-400/20' },
};

function getPlatformColor(platform?: string) {
  return platformColors[platform || 'default'] || platformColors.default;
}

function groupTemplatesByPlatform(templates: Template[]) {
  const groups: Record<string, Template[]> = {};

  for (const template of templates) {
    const platform = template.platform || template.category || 'other';
    if (!groups[platform]) {
      groups[platform] = [];
    }
    groups[platform].push(template);
  }

  return groups;
}

const platformLabels: Record<string, string> = {
  'google-analytics': 'Google Analytics',
  'google-ads': 'Google Ads',
  'meta': 'Meta (Facebook)',
  'tiktok': 'TikTok',
  'linkedin': 'LinkedIn',
  'twitter': 'Twitter / X',
  'snapchat': 'Snapchat',
  'pinterest': 'Pinterest',
  'ecommerce': 'E-commerce',
  'social': 'Social Media',
  'advertising': 'Advertising',
  'analytics': 'Analytics',
  'other': 'Other',
};

export default function CreateTagPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('select');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetch('/api/project/templates?type=tag')
      .then(res => res.json())
      .then(data => {
        setTemplates(data.templates || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load templates:', err);
        setLoading(false);
      });
  }, []);

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    // Initialize config with default values
    const initialConfig: Record<string, unknown> = {};
    for (const q of template.questions) {
      const defaultVal = q.initial ?? q.default;
      if (defaultVal !== undefined) {
        initialConfig[q.name] = defaultVal;
      }
    }
    setConfig(initialConfig);
    setStep('configure');
  };

  const handleConfigChange = (name: string, value: unknown) => {
    setConfig(prev => ({ ...prev, [name]: value }));
    // Clear error when field is modified
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateConfig = (): boolean => {
    if (!selectedTemplate) return false;

    const newErrors: Record<string, string> = {};

    for (const q of selectedTemplate.questions) {
      // Check if question should be shown
      if (q.when && !q.when(config)) continue;

      const value = config[q.name];

      // Check required fields (questions without defaults that are empty)
      if (value === undefined || value === '' || value === null) {
        // Check if it has a default value
        const defaultVal = q.initial ?? q.default;
        if (defaultVal === undefined) {
          newErrors[q.name] = 'This field is required';
        }
      }

      // Run custom validation if exists
      if (q.validate && value !== undefined && value !== '') {
        const result = q.validate(value);
        if (result !== true && typeof result === 'string') {
          newErrors[q.name] = result;
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 'configure') {
      if (validateConfig()) {
        setStep('review');
      }
    }
  };

  const handleBack = () => {
    if (step === 'configure') {
      setStep('select');
      setSelectedTemplate(null);
      setConfig({});
    } else if (step === 'review') {
      setStep('configure');
    }
  };

  const handleSubmit = async () => {
    if (!selectedTemplate) return;

    setSubmitting(true);

    try {
      const response = await fetch('/api/project/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'tag',
          template: selectedTemplate.id,
          config,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create tag');
      }

      // Navigate to the new tag
      router.push(`/tags/${result.id || result.name}`);
    } catch (err) {
      console.error('Failed to create tag:', err);
      setSubmitting(false);
    }
  };

  const filteredTemplates = templates.filter(t => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      t.platform?.toLowerCase().includes(query)
    );
  });

  const groupedTemplates = groupTemplatesByPlatform(filteredTemplates);

  const renderStepIndicator = () => (
    <div className="flex items-center gap-2 text-sm mb-8">
      <div className={`flex items-center gap-2 ${step === 'select' ? 'text-sky-400' : 'text-slate-400'}`}>
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
          step === 'select' ? 'bg-sky-400 text-slate-950' :
          step !== 'select' ? 'bg-emerald-400 text-slate-950' : 'bg-slate-700'
        }`}>
          {step !== 'select' ? <Check size={14} /> : '1'}
        </span>
        Select Template
      </div>
      <ChevronRight className="text-slate-600" size={16} />
      <div className={`flex items-center gap-2 ${step === 'configure' ? 'text-sky-400' : 'text-slate-400'}`}>
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
          step === 'configure' ? 'bg-sky-400 text-slate-950' :
          step === 'review' ? 'bg-emerald-400 text-slate-950' : 'bg-slate-700'
        }`}>
          {step === 'review' ? <Check size={14} /> : '2'}
        </span>
        Configure
      </div>
      <ChevronRight className="text-slate-600" size={16} />
      <div className={`flex items-center gap-2 ${step === 'review' ? 'text-sky-400' : 'text-slate-400'}`}>
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
          step === 'review' ? 'bg-sky-400 text-slate-950' : 'bg-slate-700'
        }`}>
          3
        </span>
        Review
      </div>
    </div>
  );

  const renderSelectStep = () => (
    <div>
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/50"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-slate-400" size={32} />
        </div>
      ) : Object.keys(groupedTemplates).length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          No templates found matching your search.
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedTemplates).map(([platform, platformTemplates]) => (
            <div key={platform}>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                {platformLabels[platform] || platform}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {platformTemplates.map((template) => {
                  const colors = getPlatformColor(template.platform);
                  return (
                    <button
                      key={template.id}
                      onClick={() => handleSelectTemplate(template)}
                      className={`
                        text-left p-4 rounded-lg border transition-all duration-200
                        bg-slate-800/30 border-slate-700/50 hover:border-sky-400/50 hover:bg-slate-800/50
                      `}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${colors.bg}`}>
                          <Tag className={colors.text} size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-slate-100 truncate">
                            {template.name}
                          </h4>
                          <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                            {template.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderConfigureStep = () => {
    if (!selectedTemplate) return null;

    return (
      <div>
        <div className="mb-6 p-4 bg-slate-800/30 border border-slate-700/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${getPlatformColor(selectedTemplate.platform).bg}`}>
              <Tag className={getPlatformColor(selectedTemplate.platform).text} size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">{selectedTemplate.name}</h3>
              <p className="text-sm text-slate-400">{selectedTemplate.description}</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {selectedTemplate.questions.map((question) => {
            // Check if question should be shown
            if (question.when && !question.when(config)) {
              return null;
            }

            const label = question.message || question.label || question.name;
            const error = errors[question.name];

            return (
              <div key={question.name}>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {label}
                </label>

                {question.type === 'text' || question.type === 'input' ? (
                  <input
                    type="text"
                    value={(config[question.name] as string) || ''}
                    onChange={(e) => handleConfigChange(question.name, e.target.value)}
                    placeholder={question.initial as string || ''}
                    className={`
                      w-full px-4 py-3 bg-slate-800/50 border rounded-lg text-slate-100
                      placeholder-slate-500 focus:outline-none focus:ring-1
                      ${error
                        ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/50'
                        : 'border-slate-700 focus:border-sky-400/50 focus:ring-sky-400/50'
                      }
                    `}
                  />
                ) : question.type === 'number' ? (
                  <input
                    type="number"
                    value={(config[question.name] as number) ?? ''}
                    onChange={(e) => handleConfigChange(question.name, parseInt(e.target.value) || 0)}
                    className={`
                      w-full px-4 py-3 bg-slate-800/50 border rounded-lg text-slate-100
                      placeholder-slate-500 focus:outline-none focus:ring-1
                      ${error
                        ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/50'
                        : 'border-slate-700 focus:border-sky-400/50 focus:ring-sky-400/50'
                      }
                    `}
                  />
                ) : question.type === 'confirm' || question.type === 'boolean' ? (
                  <button
                    type="button"
                    onClick={() => handleConfigChange(question.name, !config[question.name])}
                    className={`
                      relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                      ${config[question.name] ? 'bg-sky-400' : 'bg-slate-700'}
                    `}
                  >
                    <span
                      className={`
                        inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                        ${config[question.name] ? 'translate-x-6' : 'translate-x-1'}
                      `}
                    />
                  </button>
                ) : question.type === 'select' || question.type === 'list' ? (
                  <select
                    value={(config[question.name] as string) || ''}
                    onChange={(e) => handleConfigChange(question.name, e.target.value)}
                    className={`
                      w-full px-4 py-3 bg-slate-800/50 border rounded-lg text-slate-100
                      focus:outline-none focus:ring-1
                      ${error
                        ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/50'
                        : 'border-slate-700 focus:border-sky-400/50 focus:ring-sky-400/50'
                      }
                    `}
                  >
                    <option value="">Select an option...</option>
                    {question.choices?.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.title || choice.label || choice.value}
                      </option>
                    ))}
                  </select>
                ) : question.type === 'multiselect' || question.type === 'checkbox' ? (
                  <div className="space-y-2">
                    {question.choices?.map((choice) => {
                      const selected = Array.isArray(config[question.name])
                        ? (config[question.name] as string[]).includes(choice.value)
                        : false;
                      return (
                        <label key={choice.value} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                              const current = Array.isArray(config[question.name])
                                ? config[question.name] as string[]
                                : [];
                              if (e.target.checked) {
                                handleConfigChange(question.name, [...current, choice.value]);
                              } else {
                                handleConfigChange(question.name, current.filter(v => v !== choice.value));
                              }
                            }}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-sky-400 focus:ring-sky-400/50"
                          />
                          <span className="text-slate-300">{choice.title || choice.label || choice.value}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}

                {error && (
                  <p className="mt-2 text-sm text-red-400">{error}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderReviewStep = () => {
    if (!selectedTemplate) return null;

    return (
      <div>
        <div className="mb-6 p-4 bg-slate-800/30 border border-slate-700/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${getPlatformColor(selectedTemplate.platform).bg}`}>
              <Tag className={getPlatformColor(selectedTemplate.platform).text} size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">{selectedTemplate.name}</h3>
              <p className="text-sm text-slate-400">{selectedTemplate.description}</p>
            </div>
          </div>
        </div>

        <h3 className="text-lg font-semibold text-slate-100 mb-4">Configuration Summary</h3>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
          <table className="w-full">
            <tbody className="divide-y divide-slate-700/50">
              {selectedTemplate.questions.map((question) => {
                if (question.when && !question.when(config)) {
                  return null;
                }

                const value = config[question.name];
                let displayValue: string;

                if (Array.isArray(value)) {
                  displayValue = value.join(', ');
                } else if (typeof value === 'boolean') {
                  displayValue = value ? 'Yes' : 'No';
                } else {
                  displayValue = String(value ?? '-');
                }

                return (
                  <tr key={question.name}>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {question.message || question.label || question.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 font-mono">
                      {displayValue}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 p-4 bg-sky-400/5 border border-sky-400/20 rounded-lg">
          <p className="text-sm text-sky-400">
            A new tag file will be created in your <code className="bg-slate-800 px-1 py-0.5 rounded">yourtm/tags/</code> directory.
          </p>
        </div>
      </div>
    );
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
        <h1 className="text-3xl font-bold text-slate-100">Create New Tag</h1>
        <p className="text-slate-400 mt-1">
          Choose a template and configure your new tracking tag.
        </p>
      </div>

      {renderStepIndicator()}

      <div className="bg-slate-800/20 border border-slate-700/50 rounded-xl p-6">
        {step === 'select' && renderSelectStep()}
        {step === 'configure' && renderConfigureStep()}
        {step === 'review' && renderReviewStep()}
      </div>

      {(step === 'configure' || step === 'review') && (
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          {step === 'configure' ? (
            <button
              onClick={handleNext}
              className="px-6 py-2 rounded-lg font-semibold text-sm bg-sky-400 text-slate-950 hover:bg-sky-500 transition-colors flex items-center gap-2"
            >
              Continue
              <ArrowRight size={16} />
            </button>
          ) : (
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
                  Create Tag
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
