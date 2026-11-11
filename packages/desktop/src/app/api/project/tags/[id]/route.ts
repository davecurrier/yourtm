import { NextRequest, NextResponse } from 'next/server';
import { getService } from '@/lib/service-manager';
import { deleteAssetFile } from '../../[type]/[id]/route';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await deleteAssetFile('tags', id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, deleted: result.deleted });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const srv = await getService();
    const { id } = await params;

    const projectData = await srv.refresh();
    const tag = projectData.tags.find(t => t.id === id);

    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    const source = await srv.getAssetSource('tags', id);
    const template = srv.getTemplateForTag(tag);

    return NextResponse.json({
      tag,
      source,
      template: template ? {
        id: template.id,
        name: template.name,
        questions: (template as any).questions || []
      } : null
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const srv = await getService();
    const { id } = await params;
    const body = await request.json();

    const success = await srv.updateAssetProperties('tags', id, body.updates);

    if (!success) {
      return NextResponse.json({ error: 'Failed to update tag' }, { status: 500 });
    }

    // Refresh to get new source and data
    const projectData = await srv.refresh();
    const tag = projectData.tags.find(t => t.id === id);
    const source = await srv.getAssetSource('tags', id);

    return NextResponse.json({ success: true, tag, source });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
