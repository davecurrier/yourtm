# YourTM CLI

**High-Performance Tagging** — Zero Bloat.

The modern tag management platform built for speed. TypeScript-first, edge-deployed, and blazingly fast.

```bash
curl -fsSL https://yourtm.dev/install | bash
```

## Why YourTM?

| Feature | YourTM | Legacy Tag Managers |
|---------|--------|---------------------|
| Runtime Size | **~5KB** | 50-80KB |
| Language | **TypeScript** | GUI / JavaScript |
| Version Control | **Git-native** | Proprietary |
| Environments | **Multi-env built-in** | Manual setup |
| AI Analysis | **Built-in** | None |
| Migration | **One command** | N/A |
| Consent | **Built-in** | Third-party required |

## Quick Start

```bash
# Install
curl -fsSL https://yourtm.dev/install | bash

# Create a project (or import from GTM)
ytm init

# Add a tag from 50+ templates
ytm create tag

# Build & deploy
ytm build
ytm deploy production
```

## Import from Google Tag Manager

Migrate your existing GTM container with AI-powered zone discovery:

```bash
# Export your GTM container as JSON, then:
ytm import gtm container-export.json
```

The AI analyzes your triggers and automatically:
- Creates URL zones (checkout, product pages, etc.)
- Maps tags to the correct zones
- Suggests optimizations

## Project Structure

```
your-project/
├── yourtm.config.ts           # Configuration
└── yourtm/
    ├── tags/                   # Your tracking tags
    │   ├── ga4/
    │   │   └── pageview.ts
    │   └── meta/
    │       └── pixel.ts
    ├── triggers/               # When tags fire
    │   ├── page-load.ts
    │   └── add-to-cart.ts
    ├── zones/                  # Where tags load (by URL)
    │   ├── global.ts
    │   └── checkout.ts
    └── variables/              # Reusable data
        └── user.ts
```

**See [`/template`](./template) for a complete working example.**

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

### Project Setup
| Command | Description |
|---------|-------------|
| `ytm init` | Create a new project (or import from GTM) |
| `ytm setup` | Configure Cloudflare credentials |
| `ytm create` | Create tag/trigger/zone/variable from template |

### Development
| Command | Description |
|---------|-------------|
| `ytm build` | Compile to optimized bundles |
| `ytm dev` | Local dev server with hot reload |
| `ytm test <url>` | Test tag firing on a URL |
| `ytm watch <url>` | Watch mode for continuous testing |

### AI-Powered
| Command | Description |
|---------|-------------|
| `ytm analyze` | AI analysis for optimization recommendations |
| `ytm import gtm <file>` | Import GTM with AI zone discovery |
| `ytm audit` | Check for redundancy & performance issues |

### Deployment
| Command | Description |
|---------|-------------|
| `ytm deploy <env>` | Deploy to staging/production |
| `ytm deploy init` | Set up Cloudflare infrastructure |
| `ytm rollback <version>` | Rollback to a previous version |
| `ytm status` | Show deployment status |
| `ytm deploy versions` | List deployed versions |

### Source Control
| Command | Description |
|---------|-------------|
| `ytm push` | Push changes to YourTM remote |
| `ytm pull` | Pull latest from remote |
| `ytm clone <id>` | Clone a container |
| `ytm log` | Show version history |

[Full command reference →](https://yourtm.dev/docs/commands.html)

## Key Features

### Performance First
- **~5KB runtime** vs 50-80KB for legacy solutions
- Tree-shaking removes unused code
- Edge-deployed on Cloudflare Workers
- Sub-10ms trigger evaluation

### AI-Powered
- **Zone Discovery** — AI maps tags to URL patterns during GTM import
- **Optimization Analysis** — Consolidation, dependencies, consent recommendations
- **Smart Audits** — Detect redundant tags and performance issues

### Developer Experience
- **TypeScript** with full type safety and autocomplete
- **Git-native** — branches, PRs, code review
- **Hot reload** — instant feedback during development
- **50+ templates** — GA4, Meta, TikTok, LinkedIn, and more

### Production Ready
- **Multi-environment** — staging and production from day one
- **Instant rollback** — one command to revert
- **Built-in consent** — GDPR/CCPA compliant
- **Real-time monitoring** — debug tags in your terminal

## Documentation

- [Getting Started](https://yourtm.dev/docs/getting-started.html)
- [Concepts](https://yourtm.dev/docs/concepts.html) — Tags, Triggers, Zones
- [Cloudflare Setup](https://yourtm.dev/docs/cloudflare.html)
- [Commands Reference](https://yourtm.dev/docs/commands.html)

## Repository Structure

```
yourtm-cli/
├── template/      # Example project (what you create)
├── packages/
│   ├── cli/       # CLI tool source
│   ├── core/      # Core definitions (@yourtm/core)
│   ├── runtime/   # Browser runtime
│   └── vendors/   # Vendor integrations
├── docs/          # Documentation site
└── scripts/       # Build and release scripts
```

## License

MIT License. See [LICENSE](./LICENSE) for details.

Copyright (c) 2024-2026 David Currier
