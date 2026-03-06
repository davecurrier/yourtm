# YourTM Template Project

This is a complete working example of a YourTM project.

## Structure

```
├── yourtm.config.ts           # Main configuration
└── yourtm/
    ├── tags/                   # Tag definitions
    │   ├── ga4/                # Google Analytics 4
    │   │   ├── pageview.ts     # Track page views
    │   │   └── add-to-cart.ts  # Track add to cart
    │   ├── meta/               # Meta (Facebook)
    │   │   └── pixel.ts        # Meta Pixel
    │   └── custom/             # Custom tags
    │       └── scroll-tracking.ts
    │
    ├── triggers/               # When tags fire
    │   ├── page-load.ts        # On every page load
    │   ├── scroll-75.ts        # At 75% scroll depth
    │   └── add-to-cart-click.ts # On add-to-cart button click
    │
    ├── zones/                  # Where tags load (page groups)
    │   ├── global.ts           # All pages
    │   ├── checkout.ts         # Checkout flow pages
    │   └── product.ts          # Product detail pages
    │
    └── variables/              # Reusable data definitions
        ├── user.ts             # User data
        └── ecommerce.ts        # E-commerce data
```

## Usage

```bash
# Build the bundles
npm run build

# Start dev server
npm run dev

# Check for issues
npm run check
```

## Output

After building, you'll have:

```
dist/ytm/
├── core.js           # Runtime (~2KB)
├── zone-global.js    # Global zone bundle
├── zone-checkout.js  # Checkout zone bundle
└── zone-product.js   # Product zone bundle
```

## Adding Tags

Organize tags by platform:

```bash
# Create via wizard
ytm create tag

# Or manually
mkdir -p yourtm/tags/tiktok
touch yourtm/tags/tiktok/pixel.ts
```

## Learn More

- [Concepts](../docs/concepts.html) — Tags, Triggers, Zones explained
- [Commands](../docs/commands.html) — All CLI commands
