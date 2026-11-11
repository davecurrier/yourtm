"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, CheckCircle2, XCircle, Terminal, Package, ChevronDown, FolderOpen, Clock, Check, RefreshCw, Eye } from 'lucide-react';
import { useFileWatcher } from '@/hooks/useFileWatcher';

interface BuildResult {
  success: boolean;
  error?: string;
  containerId?: string;
  stats?: {
    tags: number;
    triggers: number;
    zones: number;
    variables: number;
  };
  totalSizeFormatted?: string;
}

interface ProjectInfo {
  currentPath: string;
  isValid: boolean;
  recentProjects: Array<{
    path: string;
    name: string;
    isValid: boolean;
  }>;
}

export function Header() {
  const [building, setBuilding] = useState(false);
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [hasExternalChanges, setHasExternalChanges] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // File watcher for external changes
  const { connected: watcherConnected, lastChange, refresh } = useFileWatcher({
    onFileChange: useCallback((filename: string) => {
      console.log('[Header] File changed externally:', filename);
      setHasExternalChanges(true);
    }, []),
  });

  // Load project info on mount
  useEffect(() => {
    loadProjectInfo();
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowProjectMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadProjectInfo = async () => {
    try {
      const res = await fetch('/api/settings/project');
      if (res.ok) {
        const data = await res.json();
        setProjectInfo(data);
      }
    } catch (error) {
      console.error('Failed to load project info:', error);
    }
  };

  const switchProject = async (path: string) => {
    setSwitching(true);
    try {
      const res = await fetch('/api/settings/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });

      if (res.ok) {
        await loadProjectInfo();
        setShowProjectMenu(false);
        // Reload the page to reinitialize with new project
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to switch project:', error);
    } finally {
      setSwitching(false);
    }
  };

  const handleOpenProject = async () => {
    // In Electron, we'd use dialog.showOpenDialog
    // For web, prompt for path
    const path = prompt('Enter the project path (folder containing yourtm.config.ts):');
    if (path) {
      await switchProject(path);
    }
  };

  const handleBuild = async () => {
    setBuilding(true);
    setBuildResult(null);
    setShowResult(true);

    try {
      const response = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clean: false }),
      });

      const result = await response.json();
      setBuildResult(result);

      // Auto-hide success after 5 seconds
      if (result.success) {
        setTimeout(() => setShowResult(false), 5000);
      }
    } catch (error) {
      setBuildResult({
        success: false,
        error: error instanceof Error ? error.message : 'Build failed',
      });
    }

    setBuilding(false);
  };

  const handleOpenTerminal = () => {
    // For Electron, we'd use IPC to open terminal
    alert('This feature requires Electron IPC integration. Run "ytm dev" in your terminal instead.');
  };

  const currentProjectName = projectInfo?.currentPath?.split('/').pop() || 'No Project';

  return (
    <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-950/50">
      <div className="flex items-center gap-2 text-sm text-slate-400 relative" ref={menuRef}>
        <div className={`w-2 h-2 rounded-full ${projectInfo?.isValid ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>

        {/* Project Selector */}
        <button
          onClick={() => setShowProjectMenu(!showProjectMenu)}
          className="flex items-center gap-1 hover:text-slate-200 transition-colors"
          disabled={switching}
        >
          Project: <strong className="text-slate-200">{currentProjectName}</strong>
          <ChevronDown size={14} className={`transition-transform ${showProjectMenu ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown Menu */}
        {showProjectMenu && (
          <div className="absolute top-full left-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
            {/* Current Project */}
            <div className="px-4 py-3 border-b border-slate-700">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Current Project</div>
              <div className="text-sm text-slate-200 truncate" title={projectInfo?.currentPath}>
                {projectInfo?.currentPath}
              </div>
            </div>

            {/* Recent Projects */}
            {projectInfo?.recentProjects && projectInfo.recentProjects.length > 0 && (
              <div className="border-b border-slate-700">
                <div className="px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Clock size={12} /> Recent Projects
                </div>
                {projectInfo.recentProjects.map((project) => (
                  <button
                    key={project.path}
                    onClick={() => switchProject(project.path)}
                    disabled={project.path === projectInfo.currentPath || !project.isValid}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-800 transition-colors flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="truncate flex-1" title={project.path}>
                      {project.name}
                    </span>
                    {project.path === projectInfo.currentPath && (
                      <Check size={14} className="text-emerald-400 ml-2 flex-shrink-0" />
                    )}
                    {!project.isValid && (
                      <span className="text-xs text-red-400 ml-2 flex-shrink-0">Invalid</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Open Project */}
            <button
              onClick={handleOpenProject}
              className="w-full px-4 py-3 text-left text-sm hover:bg-slate-800 transition-colors flex items-center gap-2 text-sky-400"
            >
              <FolderOpen size={16} /> Open Project...
            </button>
          </div>
        )}

        <span className="mx-2 text-slate-700">|</span>

        {/* Watcher Status */}
        <div className="flex items-center gap-1.5" title={watcherConnected ? 'Watching for file changes' : 'Not watching'}>
          <Eye size={14} className={watcherConnected ? 'text-emerald-500' : 'text-slate-600'} />
          <span className={watcherConnected ? 'text-emerald-500' : 'text-slate-500'}>
            {watcherConnected ? 'Watching' : 'Offline'}
          </span>
        </div>

        {/* External Changes Indicator */}
        {hasExternalChanges && (
          <>
            <span className="mx-2 text-slate-700">|</span>
            <button
              onClick={() => {
                refresh();
                setHasExternalChanges(false);
                window.location.reload();
              }}
              className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors"
            >
              <RefreshCw size={14} className="animate-pulse" />
              <span>Files changed - Refresh</span>
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Build Result Toast */}
        {showResult && buildResult && (
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium animate-in slide-in-from-right ${
              buildResult.success
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}
          >
            {buildResult.success ? (
              <>
                <CheckCircle2 size={16} />
                Built successfully
                {buildResult.stats && (
                  <span className="text-slate-400 ml-2">
                    {buildResult.stats.tags} tags | {buildResult.totalSizeFormatted}
                  </span>
                )}
              </>
            ) : (
              <>
                <XCircle size={16} />
                {buildResult.error || 'Build failed'}
              </>
            )}
            <button
              onClick={() => setShowResult(false)}
              className="ml-2 text-slate-500 hover:text-slate-300"
            >
              &times;
            </button>
          </div>
        )}

        <button
          onClick={handleOpenTerminal}
          className="px-4 py-2 rounded-md font-semibold text-sm border border-slate-700 hover:bg-slate-800 transition-colors flex items-center gap-2"
        >
          <Terminal size={16} /> Open in Terminal
        </button>

        <button
          onClick={handleBuild}
          disabled={building}
          className="px-4 py-2 rounded-md font-semibold text-sm bg-sky-400 text-slate-950 hover:bg-sky-500 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {building ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Building...
            </>
          ) : (
            <>
              <Package size={16} /> Build Container
            </>
          )}
        </button>
      </div>
    </header>
  );
}
