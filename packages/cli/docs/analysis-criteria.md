# AI Analysis Criteria for Tag Optimization

## Overview

The `ytm analyze` command uses AI to examine your tag management container and provide optimization recommendations. This document explains what the AI analyzes and how to interpret the results.

---

## 1. Tag Consolidation Analysis

### What It Looks For:
- **Platform prefixes**: `meta-`, `tiktok-`, `snapchat-`, `pinterest-`, `reddit-`, `bing-`, `tradedesk-`, `amazon-`, `dcm-`, `google-ads-`
- **Brand suffixes**: `-shark`, `-ninja`, or brand names in tag names
- **Duplicate events**: Same event type (ViewContent, AddToCart, Purchase) for different pixel IDs
- **Pixel ID extraction**: Identifies pixel IDs from tag code patterns

### Consolidation APIs by Platform:
| Platform | Multi-Pixel API |
|----------|-----------------|
| Meta | `fbq('trackSingle', PIXEL_ID, event, params)` |
| TikTok | `ttq.instance(PIXEL_ID).track(event, params)` |
| Snapchat | `snaptr('track', event, params, { pixel_id })` |
| Pinterest | `pintrk('load', PIXEL_ID)` then `pintrk('track', event)` |
| Reddit | `rdt('init', PIXEL_ID)` then `rdt('track', event)` |
| Amazon | `amzn('addTag', TAG_ID)` then `amzn('trackEvent', event)` |
| Bing | Multiple UET instances with different tag IDs |
| Trade Desk | Multiple `TTDUniversalPixelApi` instances |
| DCM | `gtag('event', 'conversion', { send_to: 'DC-ID/group/activity' })` |

### Example Output:
```json
{
  "platform": "meta",
  "currentTags": ["meta-shark-viewcontent", "meta-ninja-viewcontent"],
  "consolidatedCount": 1,
  "pixelIds": {
    "SHARK": "338016896534418",
    "NINJA": "1134471793289152"
  },
  "savings": { "tags": 6, "bytes": 12000 }
}
```

---

## 2. Zone Assignment Analysis

### Trigger-to-Zone Mapping:
| Trigger Pattern | Recommended Zone |
|-----------------|------------------|
| `initialization` | global |
| `consent-initialization` | global |
| `page-view`, `custom-page-view-delayed` | global |
| `ga4-view-item` (not list) | pdp |
| `ga4-view-item-list` | plp |
| `ga4-add-to-cart` | global (can fire anywhere) |
| `ga4-begin-checkout` | checkout |
| `ga4-add-payment-info` | checkout |
| `ga4-purchase` | purchase |
| `ga4-view-search-results` | search |
| `*-homepage-*` in name | homepage |
| `support-*` in trigger | support |

### What Gets Flagged:
- Tags in `global` zone with purchase/checkout triggers
- Tags in `pdp` zone with purchase triggers
- Any mismatch between zone and trigger

---

## 3. Lazy Loading Analysis

### Immediate Triggers (must load on page load):
- `initialization`
- `consent-initialization`
- `page-view`
- `custom-page-view-delayed`
- `dom-ready`
- Any tag with `-base-pixel` in name

### Lazy Triggers (can defer until interaction):
- `ga4-add-to-cart`
- `cevent-email-signup`
- `cevent-notify-me`
- `cevent-popup-*`
- `cevent-video-*`
- `click-*`
- `cevent-filter*`
- `scroll-*`
- `form-*`

### Example Output:
```json
{
  "immediateTags": {
    "tags": ["meta-base-pixel", "ga4-config"],
    "size": 63000
  },
  "lazyTags": [
    { "trigger": "ga4-add-to-cart", "tags": ["meta-add-to-cart"], "size": 16000 }
  ],
  "estimatedInitialLoad": 63000
}
```

---

## 4. Platform Detection

### Detection Patterns:
| Platform | Code Patterns |
|----------|---------------|
| Meta/Facebook | `fbq(`, `facebook.*pixel` |
| TikTok | `ttq.`, `tiktok.*pixel` |
| Snapchat | `snaptr(` |
| Pinterest | `pintrk(` |
| Reddit | `rdt(` |
| Amazon | `amzn(`, `amazon-adsystem` |
| Bing/Microsoft | `uetq`, `bat.bing.com` |
| Trade Desk | `TTDUniversalPixelApi`, `adsrvr.org` |
| DCM/Floodlight | `floodlight`, `DC-\d+`, `gtag.*conversion` |
| Google Ads | `AW-\d+`, `google.*conversion` |
| GA4 | `gtag.*G-`, `ga4` |
| ContentSquare | `contentsquare`, `_uxa` |
| Hotjar | `hotjar`, `hj(` |

---

## 5. Dependency Analysis

### What Gets Checked:
- Tags with `dependsOn` property
- Base pixel tags that others might depend on
- Initialization order (priority field)
- Circular dependencies

### Base Pixel Naming Patterns:
- `*-base-pixel`
- `*-base-tag`
- `*-config`
- `*-initialization`

---

## 6. Size & Performance Projections

### Calculations:
1. **Immediate global**: Sum of all global tags with immediate triggers
2. **Lazy global**: Sum of all global tags with lazy triggers
3. **Zone sizes**: Sum of tags per zone
4. **Page bundle**: Immediate global + zone-specific tags

### Baseline Comparison:
- If GTM export provided, compares to total size
- Otherwise, uses 200KB as typical GTM baseline

---

## 7. Common Issues Flagged

- **Dead code**: Tags with no triggers
- **Incomplete import**: Tags with `// Manual implementation required`
- **Duplicate names**: Multiple tags with same name
- **Large tags**: Tags over 5KB (might need splitting)
- **Zone mismatch**: Global tags that only fire on specific pages
- **Missing consent**: Ad platform tags without consent checks
- **Missing dependencies**: Tags that use base pixels without `dependsOn`

---

## Usage

```bash
# Basic analysis (uses ANTHROPIC_API_KEY env var)
ytm analyze

# Specify API key
ytm analyze --api-key sk-ant-...

# Use OpenAI instead of Anthropic
ytm analyze --provider openai --api-key sk-...

# Verbose output with all details
ytm analyze --verbose

# Save analysis to file
ytm analyze --output analysis.json
```

---

## Best Practices Suggested

- Use `dependsOn` for pixel dependencies
- Set `priority: 100` for base pixels
- Use brand detection variables (`hasSharkProducts`, `hasNinjaProducts`)
- Implement error handling in tag code
- Add `async setup()` for script loading
