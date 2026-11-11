import { NextRequest, NextResponse } from 'next/server';
import { getService } from '@/lib/service-manager';
import { getProjectPath } from '@/lib/project-config';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Delete an asset's source file.
 * Shared by this route and /api/project/tags/[id].
 * Confines the unlink to the project directory — sourcePath comes from parsed
 * project data, but never trust a path blindly.
 */
export async function deleteAssetFile(assetType: string, id: string) {
  const srv = await getService();
  const projectData = await srv.refresh();
  const assets = (projectData as any)[assetType] || [];
  const asset = assets.find((a: any) => a.id === id || a.name === id);

  if (!asset) {
    return { ok: false as const, status: 404, error: 'Asset not found' };
  }
  if (!asset.sourcePath) {
    return { ok: false as const, status: 400, error: 'Asset has no source file' };
  }

  const projectPath = await getProjectPath();
  const root = path.resolve(projectPath);
  const target = path.resolve(root, asset.sourcePath);

  if (target !== root && !target.startsWith(root + path.sep)) {
    return { ok: false as const, status: 400, error: 'Refusing to delete outside the project' };
  }

  await fs.unlink(target);
  return { ok: true as const, deleted: asset.sourcePath };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string, id: string }> }
) {
  try {
    const srv = await getService();
    const { type, id } = await params;
    const assetType = type as any; // triggers | variables | zones

    const projectData = await srv.refresh();
    const assets = (projectData as any)[assetType] || [];
    const asset = assets.find((a: any) => a.id === id || a.name === id);

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const source = await srv.getAssetSource(assetType, id);

    return NextResponse.json({
      asset,
      source
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ type: string, id: string }> }
) {
  try {
    const { type, id } = await params;
    const result = await deleteAssetFile(type, id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, deleted: result.deleted });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string, id: string }> }
) {
  try {
    const srv = await getService();
    const { type, id } = await params;
    const assetType = type as any;
    const body = await request.json();

    const success = await srv.updateAssetProperties(assetType, id, body.updates);

    if (!success) {
      return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 });
    }

    const source = await srv.getAssetSource(assetType, id);

    return NextResponse.json({ success: true, source });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
