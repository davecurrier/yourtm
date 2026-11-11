import { ProjectService } from './project-service';
import { getProjectPath, clearConfigCache } from './project-config';

let cachedService: ProjectService | null = null;
let cachedPath: string | null = null;

/**
 * Get the ProjectService instance, reinitializing if the project path has changed
 */
export async function getService(): Promise<ProjectService> {
  const currentPath = await getProjectPath();

  // If path changed or no service exists, create new one
  if (!cachedService || cachedPath !== currentPath) {
    console.log('[ServiceManager] Initializing service for:', currentPath);
    cachedService = new ProjectService(currentPath);
    cachedPath = currentPath;
    await cachedService.init();
  }

  return cachedService;
}

/**
 * Force reinitialize the service (useful after project switch)
 */
export async function reinitializeService(): Promise<ProjectService> {
  cachedService = null;
  cachedPath = null;
  clearConfigCache();
  return getService();
}

/**
 * Get the current project path being used
 */
export function getCurrentServicePath(): string | null {
  return cachedPath;
}
