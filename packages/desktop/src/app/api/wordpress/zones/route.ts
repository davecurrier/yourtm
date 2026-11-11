import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import {
  getWordPressSite,
  getProjectPath,
} from '@/lib/project-config';

interface ZoneDefinition {
  name: string;
  id: string;
  patterns: string[];
  description: string;
}

/**
 * Map WordPress site structure to YourTM zone definitions
 */
function generateZonesFromSiteInfo(siteInfo: {
  post_types?: Array<{ name: string; label: string; count: number }>;
  suggested_zones?: Array<{ name: string; patterns: string[] }>;
  woocommerce?: boolean;
}): ZoneDefinition[] {
  const zones: ZoneDefinition[] = [];

  // Always include homepage
  zones.push({
    name: 'Homepage',
    id: 'homepage',
    patterns: ['/'],
    description: 'Site homepage (exact match)',
  });

  // Use suggested zones from the WordPress plugin if available
  if (siteInfo.suggested_zones && siteInfo.suggested_zones.length > 0) {
    for (const suggested of siteInfo.suggested_zones) {
      const id = suggested.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      if (!zones.find(z => z.id === id)) {
        zones.push({
          name: suggested.name,
          id,
          patterns: suggested.patterns,
          description: `Auto-generated from WordPress: ${suggested.name}`,
        });
      }
    }
  }

  // Map post types to zones
  if (siteInfo.post_types) {
    for (const pt of siteInfo.post_types) {
      // Skip built-in types that are handled differently
      if (['attachment', 'revision', 'nav_menu_item', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation'].includes(pt.name)) {
        continue;
      }

      const id = pt.name.replace(/_/g, '-');

      if (pt.name === 'post') {
        if (!zones.find(z => z.id === 'blog')) {
          zones.push({
            name: 'Blog Posts',
            id: 'blog',
            patterns: ['/blog/*', '/*/feed'],
            description: `WordPress posts (${pt.count} posts)`,
          });
          zones.push({
            name: 'Blog Archive',
            id: 'blog-archive',
            patterns: ['/blog', '/category/*', '/tag/*', '/author/*'],
            description: 'Blog listing and archive pages',
          });
        }
      } else if (pt.name === 'page') {
        // Pages are too varied for a single zone; skip generic pattern
      } else if (!zones.find(z => z.id === id)) {
        zones.push({
          name: pt.label,
          id,
          patterns: [`/${pt.name}/*`],
          description: `WordPress custom post type: ${pt.label} (${pt.count} items)`,
        });
      }
    }
  }

  // WooCommerce zones
  if (siteInfo.woocommerce) {
    const wooZones: ZoneDefinition[] = [
      {
        name: 'Product Pages',
        id: 'product',
        patterns: ['/product/*'],
        description: 'WooCommerce individual product pages',
      },
      {
        name: 'Product Listings',
        id: 'shop',
        patterns: ['/shop', '/shop/*', '/product-category/*', '/product-tag/*'],
        description: 'WooCommerce shop and category pages',
      },
      {
        name: 'Cart',
        id: 'cart',
        patterns: ['/cart'],
        description: 'WooCommerce cart page',
      },
      {
        name: 'Checkout',
        id: 'checkout',
        patterns: ['/checkout', '/checkout/*'],
        description: 'WooCommerce checkout flow',
      },
      {
        name: 'My Account',
        id: 'my-account',
        patterns: ['/my-account', '/my-account/*'],
        description: 'WooCommerce customer account pages',
      },
      {
        name: 'Order Confirmation',
        id: 'order-received',
        patterns: ['/checkout/order-received/*'],
        description: 'WooCommerce order confirmation / thank you page',
      },
    ];

    for (const wz of wooZones) {
      if (!zones.find(z => z.id === wz.id)) {
        zones.push(wz);
      }
    }
  }

  // Search and 404
  zones.push({
    name: 'Search Results',
    id: 'search',
    patterns: ['/?s=*'],
    description: 'WordPress search results pages',
  });

  zones.push({
    name: '404 Not Found',
    id: '404',
    patterns: ['__404__'],
    description: 'WordPress 404 error pages',
  });

  return zones;
}

/**
 * Generate zone file content
 */
function generateZoneFileContent(zone: ZoneDefinition): string {
  const patternsStr = zone.patterns.map(p => `    ${JSON.stringify(p)}`).join(',\n');
  return `import { defineZone } from '@yourtm/sdk';

export default defineZone({
  name: ${JSON.stringify(zone.name)},
  description: ${JSON.stringify(zone.description)},
  patterns: [
${patternsStr},
  ],
});
`;
}

/**
 * POST /api/wordpress/zones - Generate YourTM zones from WordPress site structure
 *
 * Body: { site_id: string, auto_create?: boolean }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { site_id, auto_create } = body;

    if (!site_id) {
      return NextResponse.json(
        { error: 'site_id is required' },
        { status: 400 }
      );
    }

    const site = await getWordPressSite(site_id);
    if (!site) {
      return NextResponse.json(
        { error: `WordPress site not found: ${site_id}` },
        { status: 404 }
      );
    }

    // Generate zones from the site structure
    const zones = generateZonesFromSiteInfo({
      post_types: site.post_types,
      suggested_zones: site.suggested_zones,
      woocommerce: site.woocommerce,
    });

    // If auto_create, write zone files to the project
    const createdFiles: string[] = [];
    if (auto_create) {
      const projectPath = await getProjectPath();
      const zonesDir = join(projectPath, 'yourtm', 'zones');
      await mkdir(zonesDir, { recursive: true });

      for (const zone of zones) {
        const filePath = join(zonesDir, `${zone.id}.ts`);
        const content = generateZoneFileContent(zone);
        await writeFile(filePath, content, 'utf-8');
        createdFiles.push(`yourtm/zones/${zone.id}.ts`);
      }
    }

    return NextResponse.json({
      zones,
      created: auto_create ? createdFiles : [],
      site_id,
      site_name: site.name,
    });
  } catch (error) {
    console.error('[WordPress Zones API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
