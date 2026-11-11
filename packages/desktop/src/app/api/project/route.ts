import { NextResponse } from 'next/server';
import { getService } from '@/lib/service-manager';

export async function GET() {
  try {
    const srv = await getService();
    const data = await srv.refresh();
    return NextResponse.json({
      tags: data.tags || [],
      triggers: data.triggers || [],
      zones: data.zones || [],
      variables: data.variables || [],
      errors: data.errors || [],
      warnings: data.warnings || []
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
