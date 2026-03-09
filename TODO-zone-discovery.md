# TODO: AI Zone Discovery Phase

## Summary
Add a two-phase AI analysis where the AI first suggests zones based on the GTM container, then assigns tags to those zones.

## Current Behavior
- Zones are hardcoded in the AI prompt (purchase, checkout, pdp, plp, etc.)
- AI assigns tags to these predefined zones based on trigger names

## Proposed Behavior

### Phase 1: Zone Discovery
1. AI analyzes all triggers in the GTM container
2. Groups triggers by semantic meaning (purchase events, product views, checkout steps, etc.)
3. Suggests zone definitions with **convention-based URL patterns**:

```typescript
// yourtm/zones/purchase.ts
export default defineZone({
  id: 'purchase',
  name: 'Purchase Confirmation',
  patterns: ['/checkout/confirm*', '/order-complete*', '/thank-you*'],
})

// yourtm/zones/pdp.ts
export default defineZone({
  id: 'pdp',
  name: 'Product Detail Page',
  patterns: ['/products/*', '/p/*', '/item/*'],
})
```

4. Developer reviews and adjusts patterns to match their actual site structure

### Phase 2: Tag Assignment (existing)
- AI assigns tags to the discovered zones based on triggers
- This already works, just needs to use dynamic zones instead of hardcoded list

## Convention-Based URL Defaults

| Zone | Event Signals | Default Patterns |
|------|---------------|------------------|
| purchase | `purchase`, `transaction`, `order_complete` | `/checkout/confirm*`, `/order*`, `/thank*` |
| checkout | `begin_checkout`, `add_shipping_info`, `add_payment_info` | `/checkout*`, `/cart/checkout*` |
| pdp | `view_item`, `product_detail` | `/products/*`, `/p/*`, `/item/*` |
| plp | `view_item_list`, `category` | `/collections/*`, `/category/*`, `/c/*` |
| search | `view_search_results`, `search` | `/search*`, `?q=*`, `?search=*` |
| homepage | `homepage`, triggers with "home" | `/`, `/home` |
| cart | `view_cart`, `add_to_cart` | `/cart*`, `/bag*` |

## Implementation Steps

1. [x] Create zone suggestion prompt for AI
2. [x] Parse GTM triggers for event names and any URL conditions
3. [x] AI outputs suggested zone definitions
4. [x] Write zone files to `yourtm/zones/`
5. [x] User prompted to review before tag assignment
6. [x] Update tag assignment phase to use discovered zones

## Implementation Notes (Completed)

The AI Zone Discovery feature has been implemented in `packages/cli/src/commands/import.ts`:

### New CLI Options
- `--skip-zones`: Skip AI zone discovery (use global zone for all tags)
- `--api-key <key>`: API key for AI zone discovery (or set ANTHROPIC_API_KEY/OPENAI_API_KEY)
- `-p, --provider <provider>`: AI provider for zone discovery: anthropic or openai (default: anthropic)

### How It Works
1. During GTM import, the CLI extracts trigger data (event names, types, filters)
2. AI analyzes triggers and suggests zones based on:
   - Event names (purchase, view_item, begin_checkout, etc.)
   - Trigger types (custom events, pageview, etc.)
   - Trigger names that indicate page types
3. AI returns zone suggestions with URL patterns and tag-to-zone assignments
4. User is prompted to review suggested zones before proceeding
5. Zone files are written to `yourtm/zones/`
6. Tags are imported with their assigned zones (instead of hardcoded 'global')

### Convention-Based Defaults
The implementation includes sensible URL pattern defaults for common zones:
- purchase: `/checkout/confirm*`, `/order-complete*`, `/thank-you*`
- checkout: `/checkout*`, `/cart/checkout*`, `/payment*`
- pdp: `/products/*`, `/product/*`, `/p/*`, `/item/*`
- plp: `/collections/*`, `/category/*`, `/c/*`, `/shop/*`
- search: `/search*`, `/s/*`
- homepage: `/`, `/home`, `/index.html`
- cart: `/cart*`, `/bag*`, `/basket*`

## Design Principles
- Developer-centric: AI suggests, developer decides
- Convention over configuration: sensible defaults that work 80% of the time
- Transparent: generated files are readable and editable
- No magic: developer understands what was generated and why
