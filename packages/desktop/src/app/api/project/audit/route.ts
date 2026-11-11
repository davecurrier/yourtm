import { NextRequest, NextResponse } from 'next/server';
import { getService } from '@/lib/service-manager';

export async function POST(request: NextRequest) {
  try {
    const srv = await getService();
    const body = await request.json().catch(() => ({}));

    const apiKey = body.apiKey || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    const provider = body.provider || (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY ? 'openai' : 'anthropic');

    if (!apiKey) {
      return NextResponse.json({
        error: 'No API key provided. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable, or pass apiKey in request body.',
        requiresApiKey: true
      }, { status: 400 });
    }

    const result = await srv.runAnalysis(apiKey, provider);

    // Calculate summary stats
    const zoneChanges = result.zoneChanges?.length || 0;
    const consolidations = result.consolidation?.length || 0;
    const dependencyFixes = result.dependencyFixes?.length || 0;
    const consentFixes = result.consentFixes?.length || 0;
    const triggerFixes = result.triggerFixes?.length || 0;

    const totalRecommendations = zoneChanges + consolidations + dependencyFixes + consentFixes + triggerFixes;

    // Transform to UI-friendly format
    const recommendations = [];

    // Zone changes
    if (result.zoneChanges) {
      for (const change of result.zoneChanges) {
        recommendations.push({
          id: `zone-${change.file}`,
          type: 'performance',
          title: `Move to ${change.to} zone`,
          description: `${change.file} is in '${change.from}' zone. Move to '${change.to}' to reduce loading on non-relevant pages.`,
          category: 'Performance',
          actionLabel: 'Move Zone',
          file: change.file,
          change
        });
      }
    }

    // Consolidation
    if (result.consolidation) {
      for (const rec of result.consolidation) {
        recommendations.push({
          id: `consolidate-${rec.platform}-${rec.event || 'multiple'}`,
          type: 'consolidation',
          title: `Consolidate ${rec.platform} ${rec.event || ''} tags`,
          description: `Found ${rec.tags.length} ${rec.platform} tags that can be merged. Consolidating saves ${rec.savesCount || 1} tag(s) and reduces network requests.`,
          category: 'Consolidation',
          actionLabel: 'Apply Merge',
          tags: rec.tags
        });
      }
    }

    // Dependency fixes
    if (result.dependencyFixes) {
      for (const fix of result.dependencyFixes) {
        recommendations.push({
          id: `dep-${fix.file}`,
          type: 'dependency',
          title: `Add dependency: ${fix.add.match(/dependsOn:\s*\['([^']+)'\]/)?.[1] || 'base pixel'}`,
          description: `${fix.file} should depend on its base pixel to ensure proper load order.`,
          category: 'Dependencies',
          actionLabel: 'Add Dependency',
          file: fix.file,
          fix
        });
      }
    }

    // Consent fixes
    if (result.consentFixes) {
      for (const fix of result.consentFixes) {
        recommendations.push({
          id: `consent-${fix.file}`,
          type: 'compliance',
          title: `Missing Consent: ${fix.file.split('/').pop()?.replace('.ts', '')}`,
          description: `${fix.file} is firing without consent requirements. Add ${fix.add} for GDPR/CCPA compliance.`,
          category: 'Compliance',
          actionLabel: 'Add Consent',
          file: fix.file,
          fix
        });
      }
    }

    // Trigger fixes
    if (result.triggerFixes) {
      for (const fix of result.triggerFixes) {
        recommendations.push({
          id: `trigger-${fix.file}`,
          type: 'error',
          title: `Trigger Issue: ${fix.file.split('/').pop()?.replace('.ts', '')}`,
          description: `${fix.issue}. ${fix.fix}`,
          category: 'Errors',
          actionLabel: 'Fix Trigger',
          file: fix.file,
          fix
        });
      }
    }

    return NextResponse.json({
      summary: {
        totalRecommendations,
        savingsPercent: result.performance?.reduction || 0,
        currentSize: result.performance?.current || 0,
        optimizedSize: result.performance?.optimized || 0,
      },
      recommendations,
      raw: result
    });
  } catch (error) {
    console.error('[Audit API] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
