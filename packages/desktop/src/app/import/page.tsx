"use client";

import { useState, useCallback } from 'react';
import { Upload, FileJson, AlertCircle, CheckCircle, Loader2, Tag, Zap, Database, Map } from 'lucide-react';

interface ImportPreview {
  containerName: string;
  containerId: string;
  tags: number;
  triggers: number;
  variables: number;
  folders: number;
  customTemplates: number;
}

interface ImportResult {
  success: boolean;
  imported: {
    tags: number;
    triggers: number;
    variables: number;
    zones: number;
  };
  skipped: {
    tags: number;
    triggers: number;
    variables: number;
  };
  errors: string[];
  warnings: string[];
}

export default function ImportPage() {
  const [gtmJson, setGtmJson] = useState<string>('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const parseGtmExport = (json: string): ImportPreview | null => {
    try {
      const data = JSON.parse(json);
      const containerVersion = data.containerVersion;

      if (!containerVersion) {
        throw new Error('Invalid GTM export: missing containerVersion');
      }

      return {
        containerName: data.containerVersion?.container?.name || 'Unknown Container',
        containerId: data.containerVersion?.container?.containerId || 'Unknown',
        tags: containerVersion.tag?.length || 0,
        triggers: containerVersion.trigger?.length || 0,
        variables: containerVersion.variable?.length || 0,
        folders: containerVersion.folder?.length || 0,
        customTemplates: containerVersion.customTemplate?.length || 0,
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse GTM JSON');
      return null;
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    setError(null);
    setResult(null);

    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setGtmJson(content);
        setPreview(parseGtmExport(content));
      };
      reader.readAsText(file);
    } else {
      setError('Please drop a valid JSON file');
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setResult(null);

    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setGtmJson(content);
        setPreview(parseGtmExport(content));
      };
      reader.readAsText(file);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setGtmJson(value);
    setError(null);
    setResult(null);

    if (value.trim()) {
      setPreview(parseGtmExport(value));
    } else {
      setPreview(null);
    }
  };

  const handleImport = async () => {
    if (!gtmJson.trim()) {
      setError('Please provide GTM export JSON');
      return;
    }

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/project/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gtmJson }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setGtmJson('');
    setPreview(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
          <FileJson className="text-slate-400" size={28} />
          Import from GTM
        </h1>
        <p className="text-slate-400 mt-1">
          Import your existing Google Tag Manager container to YourTM.
        </p>
      </div>

      {/* Result Banner */}
      {result && (
        <div className={`mb-6 p-4 rounded-xl border ${result.success ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          <div className="flex items-start gap-3">
            {result.success ? (
              <CheckCircle className="text-emerald-400 mt-0.5" size={20} />
            ) : (
              <AlertCircle className="text-red-400 mt-0.5" size={20} />
            )}
            <div className="flex-1">
              <h3 className={`font-semibold ${result.success ? 'text-emerald-300' : 'text-red-300'}`}>
                {result.success ? 'Import Complete' : 'Import Failed'}
              </h3>

              {result.success && (
                <div className="mt-3 grid grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-400">{result.imported.tags}</div>
                    <div className="text-xs text-slate-400">Tags Imported</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-400">{result.imported.triggers}</div>
                    <div className="text-xs text-slate-400">Triggers</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-400">{result.imported.variables}</div>
                    <div className="text-xs text-slate-400">Variables</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-400">{result.imported.zones}</div>
                    <div className="text-xs text-slate-400">Zones Created</div>
                  </div>
                </div>
              )}

              {result.warnings && result.warnings.length > 0 && (
                <div className="mt-3">
                  <div className="text-sm text-amber-400 font-medium mb-1">Warnings:</div>
                  <ul className="text-sm text-amber-300/80 list-disc list-inside">
                    {result.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.errors && result.errors.length > 0 && (
                <div className="mt-3">
                  <div className="text-sm text-red-400 font-medium mb-1">Errors:</div>
                  <ul className="text-sm text-red-300/80 list-disc list-inside">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={handleReset}
                className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-sm font-medium transition-colors"
              >
                Import Another Container
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && !result && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {!result && (
        <div className="space-y-6">
          {/* Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              border-2 border-dashed rounded-xl p-8 text-center transition-colors
              ${dragActive
                ? 'border-sky-400 bg-sky-400/10'
                : 'border-slate-700 hover:border-slate-600'
              }
            `}
          >
            <Upload className="mx-auto mb-4 text-slate-400" size={40} />
            <p className="text-slate-300 mb-2">
              Drag and drop your GTM export JSON file here
            </p>
            <p className="text-sm text-slate-500 mb-4">or</p>
            <label className="inline-block">
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileSelect}
                className="hidden"
              />
              <span className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-sm font-medium cursor-pointer transition-colors">
                Browse Files
              </span>
            </label>
            <p className="text-xs text-slate-500 mt-4">
              Export from GTM: Admin &rarr; Container &rarr; Export Container
            </p>
          </div>

          {/* Or Paste JSON */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Or paste GTM export JSON directly:
            </label>
            <textarea
              value={gtmJson}
              onChange={handleTextChange}
              placeholder='{"exportFormatVersion": 2, "containerVersion": {...}}'
              className="w-full h-48 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-slate-100 text-sm font-mono focus:outline-none focus:border-sky-500 resize-none"
            />
          </div>

          {/* Preview */}
          {preview && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-slate-100 mb-4">
                Preview: {preview.containerName}
              </h3>
              <p className="text-sm text-slate-400 mb-4">
                Container ID: {preview.containerId}
              </p>

              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                  <Tag className="mx-auto mb-2 text-sky-400" size={24} />
                  <div className="text-2xl font-bold text-slate-100">{preview.tags}</div>
                  <div className="text-xs text-slate-400">Tags</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                  <Zap className="mx-auto mb-2 text-amber-400" size={24} />
                  <div className="text-2xl font-bold text-slate-100">{preview.triggers}</div>
                  <div className="text-xs text-slate-400">Triggers</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                  <Database className="mx-auto mb-2 text-purple-400" size={24} />
                  <div className="text-2xl font-bold text-slate-100">{preview.variables}</div>
                  <div className="text-xs text-slate-400">Variables</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                  <Map className="mx-auto mb-2 text-emerald-400" size={24} />
                  <div className="text-2xl font-bold text-slate-100">{preview.folders}</div>
                  <div className="text-xs text-slate-400">Folders</div>
                </div>
              </div>

              {preview.customTemplates > 0 && (
                <p className="text-sm text-amber-400 mb-4">
                  Note: {preview.customTemplates} custom templates detected. These may require manual adjustment.
                </p>
              )}

              <button
                onClick={handleImport}
                disabled={importing}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md font-semibold text-sm bg-sky-400 text-slate-950 hover:bg-sky-500 transition-colors disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload size={18} />
                    Import to YourTM
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
