import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getProjectPath } from '@/lib/project-config';

const ASSET_DIRS = ['tags', 'triggers', 'variables', 'zones'];

/**
 * POST /api/project/clear
 *
 * Empties the container's asset directories. Always takes a full backup first
 * — this is destructive and the user may be mid-migration.
 * Returns the backup location so it can be surfaced/undone.
 */
export async function POST() {
  try {
    const projectPath = await getProjectPath();
    const root = path.resolve(projectPath);
    const yourtmDir = path.join(root, 'yourtm');

    try {
      await fs.access(yourtmDir);
    } catch {
      return NextResponse.json({ error: 'No yourtm/ directory in this project' }, { status: 400 });
    }

    // Count what we're about to clear
    const counts: Record<string, number> = {};
    let total = 0;
    for (const dir of ASSET_DIRS) {
      try {
        const files = (await fs.readdir(path.join(yourtmDir, dir)))
          .filter(f => f.endsWith('.ts'));
        counts[dir] = files.length;
        total += files.length;
      } catch {
        counts[dir] = 0;
      }
    }

    // Back up the whole yourtm/ tree alongside it
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(root, `.yourtm-backups`, stamp);
    await fs.mkdir(path.dirname(backupDir), { recursive: true });
    await fs.cp(yourtmDir, backupDir, { recursive: true });

    // Remove asset files (keep the directory structure)
    for (const dir of ASSET_DIRS) {
      const target = path.join(yourtmDir, dir);
      try {
        for (const file of await fs.readdir(target)) {
          if (file.endsWith('.ts')) {
            await fs.unlink(path.join(target, file));
          }
        }
      } catch {
        await fs.mkdir(target, { recursive: true });
      }
    }

    return NextResponse.json({
      success: true,
      cleared: counts,
      total,
      backupPath: path.relative(root, backupDir),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
