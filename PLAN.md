# YourTM CLI - Developer-First Tag Management

## Vision

**Tags as Code** - A CLI-first, file-based tag management system designed for engineering teams who want tag management to feel like the rest of their toolchain.

No web UI. No database. No SaaS dependency. Just code, git, and a powerful CLI.

---

## Core Principles

1. **Git is the database** - Container config lives in your repo alongside application code
2. **TypeScript-first** - Tags are actual `.ts` files with full IDE support, type checking, and imports
3. **Local development server** - Run tags locally, see them fire in real-time, hot-reload on changes
4. **CI/CD native** - Pre-commit validation, build-time optimization, deploy via GitHub Actions
5. **Zero runtime dependencies** - CLI compiles everything to static JS. No database, no API calls at runtime

---

## Project Structure

```
my-app/
├── yourtm/                      # Tag configuration directory
│   ├── yourtm.config.ts         # Main configuration
│   ├── tags/
│   │   ├── ga4/
│   │   │   ├── pageview.ts      # Actual TypeScript file
│   │   │   └── events.ts
│   │   ├── meta/
│   │   │   └── pixel.ts
│   │   └── custom/
│   │       └── order-tracking.ts
│   ├── triggers/
│   │   ├── page-load.ts
│   │   ├── click.ts
│   │   └── scroll-depth.ts
│   ├── variables/
│   │   ├── user.ts
│   │   └── ecommerce.ts
│   └── zones/
│       ├── global.ts
│       ├── checkout.ts
│       └── product.ts
├── dist/
│   └── ytm/                     # Compiled output
│       ├── runtime.js           # 2-3KB core
│       └── chunks/
│           ├── global.js
│           └── checkout.js
└── package.json
```

---

## Tag Definition API

### Basic Tag

```typescript
// yourtm/tags/ga4/pageview.ts
import { defineTag, type TagContext } from 'yourtm'
import { gtag, loadGtag } from 'yourtm/vendors/google'

export default defineTag({
  name: 'GA4 Pageview',
  triggers: ['page-load'],
  zones: ['global'],
  consent: ['analytics'],

  async setup() {
    await loadGtag('G-XXXXXXXX')
  },

  execute(ctx: TagContext) {
    gtag('event', 'page_view', {
      page_title: ctx.dataLayer.get('page.title'),
      page_location: ctx.url.href,
      user_id: ctx.dataLayer.get('user.id'),
    })
  },
})
```

### Custom Tag with Async Operations

```typescript
// yourtm/tags/custom/order-tracking.ts
import { defineTag } from 'yourtm'
import { sha256 } from 'yourtm/utils/crypto'

export default defineTag({
  name: 'Order Completion',
  triggers: ['order-complete'],
  zones: ['checkout'],
  consent: ['marketing'],

  execute(ctx) {
    const order = ctx.dataLayer.get('ecommerce.order')

    // Send to your analytics endpoint
    fetch('/api/track', {
      method: 'POST',
      body: JSON.stringify({
        event: 'purchase',
        order_id: order.id,
        value: order.total,
        email_hash: sha256(order.email),
      }),
    })
  },
})
```

---

## Trigger Definition API

### Scroll Trigger

```typescript
// yourtm/triggers/scroll-depth.ts
import { defineTrigger } from 'yourtm'

export default defineTrigger({
  name: 'scroll-75',
  type: 'scroll',

  config: {
    threshold: 75,
    once: true,
  },

  // Optional: custom condition
  condition(ctx) {
    return ctx.url.pathname.startsWith('/blog/')
  },
})
```

### Click Trigger with Data Extraction

```typescript
// yourtm/triggers/click.ts
import { defineTrigger } from 'yourtm'

export default defineTrigger({
  name: 'add-to-cart-click',
  type: 'click',

  config: {
    selector: '[data-action="add-to-cart"]',
  },

  // Extract data when trigger fires
  extract(element) {
    return {
      product_id: element.dataset.productId,
      product_name: element.dataset.productName,
      price: parseFloat(element.dataset.price),
    }
  },
})
```

---

## Variable Definition API

```typescript
// yourtm/variables/user.ts
import { defineVariable } from 'yourtm'

export const userId = defineVariable({
  name: 'user.id',
  type: 'dataLayer',
  path: 'user.id',
  default: null,
})

export const userEmail = defineVariable({
  name: 'user.email',
  type: 'dataLayer',
  path: 'user.email',
  transform: (value) => value?.toLowerCase(),
})

export const userType = defineVariable({
  name: 'user.type',
  type: 'computed',
  compute(ctx) {
    const orders = ctx.dataLayer.get('user.orderCount') || 0
    if (orders === 0) return 'new'
    if (orders < 5) return 'returning'
    return 'loyal'
  },
})
```

---

## Zone Definition API

```typescript
// yourtm/zones/checkout.ts
import { defineZone } from 'yourtm'

export default defineZone({
  name: 'checkout',

  // URL patterns (supports glob and regex)
  patterns: [
    '/checkout/*',
    '/cart',
    '/order/confirm',
  ],

  // Optional: additional conditions
  condition(ctx) {
    return ctx.dataLayer.get('page.type') === 'checkout'
  },
})
```

---

## Configuration File

```typescript
// yourtm.config.ts
import { defineConfig } from 'yourtm'

export default defineConfig({
  containerId: 'YTM-ABC123',

  environments: {
    development: {
      debug: true,
      consent: 'bypass', // Skip consent in dev
    },
    staging: {
      deployTo: 'cloudflare',
      kvNamespace: 'YTM_STAGING',
    },
    production: {
      deployTo: 'cloudflare',
      kvNamespace: 'YTM_PROD',
      performanceBudget: {
        bundleSize: '10kb',
        tagExecution: '50ms',
      },
    },
  },

  consent: {
    categories: ['essential', 'analytics', 'marketing'],
    defaultState: 'deny-all',
    storageKey: 'ytm_consent',
  },

  // Vendor library management
  vendors: {
    google: {
      preload: true,
      async: true,
    },
    meta: {
      defer: true,
    },
  },

  // Build options
  build: {
    outDir: 'dist/ytm',
    minify: true,
    sourceMaps: true,
    treeshake: true,
  },
})
```

---

## CLI Commands

### Initialize Project

```bash
ytm init
```

Creates `yourtm/` directory with starter config and example tags.

### Development Server

```bash
ytm dev
```

Starts local server with hot reload. Injects tags into your local dev site.

```
  ╭─────────────────────────────────────────────────────────╮
  │                                                         │
  │   YourTM Dev Server                                     │
  │   http://localhost:3456                                 │
  │                                                         │
  │   Inject into your app:                                 │
  │   <script src="http://localhost:3456/ytm.js"></script>  │
  │                                                         │
  ╰─────────────────────────────────────────────────────────╯

  Watching for changes...

  [14:23:45] ✓ GA4 Pageview                     8ms   page-load
  [14:23:45] ✓ Meta Pixel Init                 12ms   page-load
  [14:23:52] ✓ Add to Cart                      3ms   add-to-cart-click
             └─ product_id: SKU-123, price: 49.99
  [14:23:54] ⚠ Order Tracking                 156ms   SLOW (>100ms)

  ─────────────────────────────────────────────────────────
  Tags: 12 loaded | Triggers: 8 active | Bundle: 4.2KB
  Press 'q' to quit | 'd' for dataLayer | 'e' for errors
```

### Build for Production

```bash
ytm build
```

Outputs optimized bundles to `dist/ytm/`. Tree-shakes unused code, reports bundle sizes.

```
  Building for production...

  ✓ Compiled 12 tags
  ✓ Processed 8 triggers
  ✓ Generated 3 zone chunks

  Output:
    dist/ytm/runtime.js      2.1 KB (gzip: 0.9 KB)
    dist/ytm/chunks/
      global.js              3.4 KB (gzip: 1.2 KB)
      checkout.js            1.8 KB (gzip: 0.7 KB)
      product.js             2.1 KB (gzip: 0.8 KB)

  Total: 9.4 KB (gzip: 3.6 KB)

  ✓ Build complete in 340ms
```

### Validate Configuration

```bash
ytm check
```

Type checks all tags, validates trigger references, checks for issues.

```
  Checking configuration...

  ✓ yourtm.config.ts valid
  ✓ 12 tags validated
  ✓ 8 triggers validated
  ✓ 3 zones validated
  ✓ All trigger references resolved
  ✓ No circular dependencies

  ⚠ Warnings:
    tags/custom/legacy.ts:23 - Unused variable 'oldValue'

  ✓ Check complete
```

### Test Against URLs

```bash
ytm test https://staging.mysite.com/checkout
```

Runs headless browser, reports which tags fired, shows dataLayer state.

```
  Testing https://staging.mysite.com/checkout

  Page loaded in 1.2s
  Zone: checkout

  Tags Fired:
  ✓ GA4 Pageview                     12ms   success
  ✓ Meta Pixel Init                  18ms   success
  ✓ Checkout Started                  4ms   success
  ✗ TikTok Pixel                      -     blocked (no consent)

  DataLayer State:
  {
    "page.type": "checkout",
    "page.title": "Checkout - MyStore",
    "cart.items": 3,
    "cart.total": 149.99
  }

  Performance:
    Total tag overhead: 34ms
    Bundle loaded: 2.1 KB
```

### Bulk Testing

```bash
ytm test --urls urls.txt --output report.json
```

Test multiple URLs from file, output results to JSON/HTML/Excel.

### Deploy to Edge

```bash
ytm deploy --env production
```

Uploads to Cloudflare KV, atomic deployment, returns CDN URL.

```
  Deploying to production...

  ✓ Built production bundle
  ✓ Uploaded to Cloudflare KV
  ✓ Purged CDN cache

  Deployed: https://ytm.yourtm.io/YTM-ABC123/v47/runtime.js

  Version: v47
  Size: 9.4 KB (gzip: 3.6 KB)
  Deploy time: 2.3s
```

### Real-Time Monitoring

```bash
ytm monitor --env production
```

Live tag performance monitoring in terminal.

```
  ╭─────────────────────────────────────────────────────────╮
  │  YourTM Monitor - Production                            │
  │  Container: YTM-ABC123 | Active Users: 2,847            │
  ╰─────────────────────────────────────────────────────────╯

  TAG PERFORMANCE (Last 60 seconds)

  Tag Name              Fires   Avg    P95    P99   Success
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  GA4 Pageview          1,247   12ms   24ms   45ms  99.8%
  Meta Pixel            1,103   18ms   34ms   67ms  98.2%
  TikTok Pixel            892  156ms  289ms  412ms  94.1% ⚠
  LinkedIn Insight        234    8ms   15ms   28ms  99.6%

  BOTTLENECKS DETECTED

  ⚠ TikTok Pixel: P95 289ms (Target: <100ms)
    → Recommendation: Consider server-side tracking

  Press 'q' to quit | 't' to filter | 'e' for errors
```

### Compare Environments

```bash
ytm diff staging production
```

Shows differences between environments.

```
  Comparing staging → production

  Tags:
    + new-feature-tracking.ts    (staging only)
    ~ ga4/pageview.ts            (modified)
    - deprecated-pixel.ts        (production only)

  Bundle Size:
    staging:    10.2 KB
    production:  9.4 KB
    diff:       +0.8 KB (+8.5%)

  View full diff? [y/n]
```

---

## Testing Framework

### Unit Testing Tags

```typescript
// yourtm/tags/ga4/pageview.test.ts
import { testTag } from 'yourtm/testing'
import pageview from './pageview'

testTag(pageview, {
  name: 'sends page_view event',

  dataLayer: {
    'page.title': 'Product Page',
    'user.id': 'user-123',
  },

  expect: {
    calls: [
      ['gtag', 'event', 'page_view', {
        page_title: 'Product Page',
        user_id: 'user-123',
      }],
    ],
  },
})

testTag(pageview, {
  name: 'handles missing user id',

  dataLayer: {
    'page.title': 'Product Page',
    // user.id intentionally missing
  },

  expect: {
    calls: [
      ['gtag', 'event', 'page_view', {
        page_title: 'Product Page',
        user_id: undefined,
      }],
    ],
  },
})
```

### Running Tests

```bash
ytm test --unit
```

Runs all `*.test.ts` files in the yourtm directory.

---

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/tiktok-pixel

# Add new tag
# Edit yourtm/tags/tiktok/pixel.ts

# Validate
ytm check

# Test locally
ytm dev
# Open browser, verify tag fires

# Test against staging
ytm test https://staging.mysite.com

# Commit
git add .
git commit -m "Add TikTok pixel tracking"

# Push for review
git push origin feature/tiktok-pixel

# PR includes:
# - Tag code diff
# - Bundle size impact
# - Test results
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/ytm.yml
name: YourTM

on:
  push:
    paths:
      - 'yourtm/**'
  pull_request:
    paths:
      - 'yourtm/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - name: Check configuration
        run: npx ytm check

      - name: Run unit tests
        run: npx ytm test --unit

      - name: Build
        run: npx ytm build

      - name: Check bundle size
        run: npx ytm build --budget

  deploy-staging:
    needs: validate
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx ytm deploy --env staging
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

  deploy-production:
    needs: validate
    if: github.ref == 'refs/heads/release'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx ytm deploy --env production
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### Pre-commit Hook

```bash
# .husky/pre-commit
#!/bin/sh
npx ytm check
```

---

## Vendor Libraries

Built-in vendor helpers for common platforms:

```typescript
// Available imports
import { gtag, loadGtag } from 'yourtm/vendors/google'
import { fbq, loadFbq } from 'yourtm/vendors/meta'
import { ttq, loadTtq } from 'yourtm/vendors/tiktok'
import { lintrk, loadLintrk } from 'yourtm/vendors/linkedin'
import { snap, loadSnap } from 'yourtm/vendors/snapchat'
import { twq, loadTwq } from 'yourtm/vendors/twitter'
```

Benefits:
- Automatic deduplication (library loaded once even if multiple tags use it)
- Proper async loading with Promises
- Type-safe API wrappers
- Consistent error handling

---

## Consent Management

```typescript
// yourtm/tags/marketing/meta-pixel.ts
import { defineTag } from 'yourtm'
import { fbq, loadFbq } from 'yourtm/vendors/meta'

export default defineTag({
  name: 'Meta Pixel',
  triggers: ['page-load'],
  zones: ['global'],

  // This tag only fires if user consented to 'marketing'
  consent: ['marketing'],

  async setup() {
    await loadFbq('PIXEL_ID')
  },

  execute(ctx) {
    fbq('track', 'PageView')
  },
})
```

The runtime automatically:
- Blocks tags until consent is granted
- Fires queued tags when consent changes
- Persists consent state to localStorage
- Provides consent API for your consent banner

---

## Implementation Phases

### Phase 1: Core CLI (MVP)

**Goal:** Basic file-based compilation and validation

- [ ] `ytm init` - Initialize project structure
- [ ] `ytm build` - Compile tags to production bundles
- [ ] `ytm check` - Validate configuration and types
- [ ] File-based configuration (`yourtm.config.ts`)
- [ ] TypeScript tag definitions (`defineTag`, `defineTrigger`, etc.)
- [ ] Zone-based chunking (port from existing compiler)
- [ ] Minimal runtime (port from existing runtime)

**Deliverables:**
- `@yourtm/cli` npm package
- `@yourtm/core` npm package (types, defineTag, etc.)
- Documentation site

### Phase 2: Dev Server

**Goal:** Local development experience

- [ ] `ytm dev` - Local development server with hot reload
- [ ] Script injection for local sites
- [ ] Real-time terminal dashboard
- [ ] DataLayer inspector
- [ ] Tag execution logging
- [ ] Error display with stack traces

**Deliverables:**
- WebSocket-based hot reload
- Terminal UI with blessed/ink
- Proxy mode for existing sites

### Phase 3: Testing Framework

**Goal:** Automated tag testing

- [ ] `ytm test <url>` - Test tags against URLs
- [ ] `ytm test --unit` - Run unit tests
- [ ] `ytm test --urls <file>` - Bulk URL testing
- [ ] Headless browser integration (Playwright)
- [ ] Test assertions for tag behavior
- [ ] Output formats (JSON, HTML, Excel)

**Deliverables:**
- `@yourtm/testing` package
- Playwright integration
- CI/CD examples

### Phase 4: Deployment

**Goal:** Edge deployment

- [ ] `ytm deploy` - Deploy to Cloudflare KV
- [ ] Environment management (dev/staging/prod)
- [ ] Atomic deployments
- [ ] Version history
- [ ] Rollback support
- [ ] CDN cache purging

**Deliverables:**
- Cloudflare Workers integration
- AWS CloudFront alternative
- Self-hosted option

### Phase 5: Monitoring

**Goal:** Production observability

- [ ] `ytm monitor` - Real-time performance monitoring
- [ ] Tag execution metrics (P50, P95, P99)
- [ ] Error tracking and alerting
- [ ] Performance budget enforcement
- [ ] Slack/PagerDuty integration

**Deliverables:**
- Telemetry collection in runtime
- WebSocket streaming for live mode
- Historical data storage

---

## Code to Port from Existing Codebase

### Keep and Refactor

| Component | Location | Notes |
|-----------|----------|-------|
| Zone compiler | `src/lib/compiler/zone-compiler.ts` | Core chunking logic, refactor for file input |
| Runtime engine | `public/runtime/ytm-runtime.js` | Already minimal, add TypeScript types |
| Trigger compiler | `src/lib/compiler/trigger-compiler.ts` | Condition evaluation |
| CLI monitoring | `cli/bin/yourtm.js` | Terminal UI foundation |
| Cloudflare deploy | `src/lib/cloudflare-api.ts` | KV upload logic |

### Drop

| Component | Reason |
|-----------|--------|
| Next.js app | Replaced by CLI |
| PostgreSQL/Prisma | Replaced by files |
| Web UI components | No web interface |
| OAuth flow | API keys only |
| Team/permissions | Git handles this |

---

## Package Structure

```
packages/
├── cli/                 # @yourtm/cli
│   ├── src/
│   │   ├── commands/
│   │   │   ├── init.ts
│   │   │   ├── dev.ts
│   │   │   ├── build.ts
│   │   │   ├── check.ts
│   │   │   ├── test.ts
│   │   │   ├── deploy.ts
│   │   │   └── monitor.ts
│   │   ├── compiler/
│   │   ├── dev-server/
│   │   └── ui/
│   └── package.json
│
├── core/                # @yourtm/core
│   ├── src/
│   │   ├── defineTag.ts
│   │   ├── defineTrigger.ts
│   │   ├── defineVariable.ts
│   │   ├── defineZone.ts
│   │   ├── defineConfig.ts
│   │   └── types.ts
│   └── package.json
│
├── runtime/             # @yourtm/runtime (browser)
│   ├── src/
│   │   ├── core.ts
│   │   ├── triggers.ts
│   │   ├── dataLayer.ts
│   │   └── consent.ts
│   └── package.json
│
├── vendors/             # @yourtm/vendors
│   ├── src/
│   │   ├── google.ts
│   │   ├── meta.ts
│   │   ├── tiktok.ts
│   │   └── ...
│   └── package.json
│
└── testing/             # @yourtm/testing
    ├── src/
    │   ├── testTag.ts
    │   ├── mocks.ts
    │   └── assertions.ts
    └── package.json
```

---

## Competitive Positioning

### vs GTM
- **GTM:** Free, web UI, marketer-focused, slow, no git workflow
- **YourTM CLI:** Developer-focused, TypeScript, git-native, fast, local-first

### vs Segment/RudderStack
- **Segment:** Event routing focus, expensive, requires their infrastructure
- **YourTM CLI:** Tag execution focus, free/self-hosted, runs anywhere

### vs Custom Solutions
- **Custom:** Every team builds their own, no standards
- **YourTM CLI:** Standard tooling with escape hatches

### Target Users
- Engineering teams at performance-conscious companies
- Teams that have been burned by GTM performance issues
- Companies with strict security requirements (no third-party SaaS)
- Developers who want tag management in their existing workflow

---

## Success Metrics

### Adoption
- GitHub stars
- npm downloads
- Discord/community size

### Technical
- Build time < 1s for typical project
- Runtime size < 3KB gzipped
- Zero dependencies in runtime
- Works offline (local dev)

### User Satisfaction
- Compared to GTM: 10x faster builds, 5x smaller bundles
- Developer NPS > 60
- Time to first tag < 5 minutes

---

## Open Questions

1. **Monorepo support?** Should we detect Turborepo/Nx and handle multiple containers?

2. **Framework integrations?** Next.js plugin? Vite plugin? Or just script tag?

3. **Self-hosted telemetry?** Where does monitoring data go without SaaS backend?

4. **Pricing model?** Fully open source? Open core? Hosted monitoring tier?

5. **Migration tooling?** `ytm import gtm-export.json` to convert existing GTM containers?

---

## Next Steps

1. **Validate approach** - Share this plan, gather feedback
2. **Extract compiler** - Pull zone compiler into standalone module
3. **Build MVP CLI** - `init`, `build`, `check` commands
4. **Port runtime** - TypeScript rewrite with proper types
5. **Documentation** - Getting started guide
6. **Alpha release** - `@yourtm/cli@0.1.0`
