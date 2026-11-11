import { watch, FSWatcher } from 'fs';
import { join } from 'path';
import { getProjectPath } from './project-config';

type WatchCallback = (event: 'change' | 'rename', filename: string) => void;

let watcher: FSWatcher | null = null;
let currentProjectPath: string | null = null;
const callbacks: Set<WatchCallback> = new Set();

/**
 * Start watching the current project's yourtm directory
 */
export async function startWatching(): Promise<void> {
  const projectPath = await getProjectPath();
  const yourtmPath = join(projectPath, 'yourtm');

  // If already watching the same project, return
  if (watcher && currentProjectPath === projectPath) {
    return;
  }

  // Stop existing watcher
  stopWatching();

  currentProjectPath = projectPath;

  try {
    watcher = watch(yourtmPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      // Only watch .ts files
      if (!filename.endsWith('.ts')) return;

      // Notify all callbacks
      callbacks.forEach(cb => {
        try {
          cb(eventType as 'change' | 'rename', filename);
        } catch (err) {
          console.error('[FileWatcher] Callback error:', err);
        }
      });
    });

    console.log('[FileWatcher] Started watching:', yourtmPath);
  } catch (error) {
    console.error('[FileWatcher] Failed to start:', error);
  }
}

/**
 * Stop watching
 */
export function stopWatching(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
    currentProjectPath = null;
    console.log('[FileWatcher] Stopped watching');
  }
}

/**
 * Subscribe to file changes
 */
export function onFileChange(callback: WatchCallback): () => void {
  callbacks.add(callback);
  return () => callbacks.delete(callback);
}

/**
 * Get current watch status
 */
export function getWatchStatus(): { watching: boolean; path: string | null } {
  return {
    watching: watcher !== null,
    path: currentProjectPath,
  };
}
