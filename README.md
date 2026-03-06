# YourTM CLI

**Tags as Code** — Modern tag management for developers.

TypeScript-first, Git-native, and blazingly fast. No web UI required.

```bash
curl -fsSL https://yourtm.dev/install | bash
```

## What You Create

When you use YourTM, your project looks like this:

```
your-project/
├── yourtm.config.ts           # Configuration
└── yourtm/
    ├── tags/                   # Your tracking tags
    │   ├── ga4/
    │   │   └── pageview.ts
    │   ├── meta/
    │   │   └── pixel.ts
    │   └── custom/
    │       └── my-tracker.ts
    ├── triggers/               # When tags fire
    │   ├── page-load.ts
    │   └── add-to-cart.ts
    ├── zones/                  # Where tags load
    │   ├── global.ts
    │   └── checkout.ts
    └── variables/              # Reusable data
        └── user.ts
```

**See [`/template`](./template) for a complete working example.**

## Quick Start

```bash
# Install
curl -fsSL https://yourtm.dev/install | bash

# Create a project
ytm init

# Add a tag from 50+ templates
ytm create tag

# Build (compiles to optimized JS)
ytm build

# Deploy to Cloudflare edge
ytm deploy -e production
```

## Write Tags in TypeScript

```typescript
// yourtm/tags/ga4/pageview.ts
import { defineTag } from '@yourtm/core'

export default defineTag({
  name: 'GA4 Pageview',
  triggers: ['page-load'],
  zones: ['global'],
  consent: ['analytics'],

  execute(ctx) {
    gtag('config', 'G-XXXXXX', {
      page_title: document.title,
      page_location: ctx.url.href,
    })
  },
})
```

## Commands

| Command | Description |
|---------|-------------|
| `ytm init` | Create a new project |
| `ytm create` | Create tag/trigger/zone from template |
| `ytm build` | Compile to optimized bundles |
| `ytm dev` | Local dev server with hot reload |
| `ytm deploy` | Deploy to Cloudflare edge |
| `ytm rollback` | Rollback to previous version |

[Full command reference →](./docs/commands.html)

## Why YourTM?

- **~5KB runtime** vs GTM's 50-80KB
- **TypeScript** with full type safety
- **Git-native** — branches, PRs, CI/CD
- **Edge deployed** — Cloudflare Workers, global CDN
- **50+ templates** — GA4, Meta, TikTok, LinkedIn, etc.
- **Built-in consent** — GDPR/CCPA compliant

## Documentation

- [Getting Started](./docs/getting-started.html)
- [Concepts](./docs/concepts.html) — Tags, Triggers, Zones
- [Cloudflare Setup](./docs/cloudflare.html)
- [Commands Reference](./docs/commands.html)

## Repository Structure

```
yourtm-cli/
├── template/      # ⭐ Example project (what you create)
├── packages/      # CLI and runtime source code
├── docs/          # HTML documentation
└── scripts/       # Build and release scripts
```

## License

MIT
