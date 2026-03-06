import { defineTag, type TagExecuteContext } from '@yourtm/core'

export default defineTag({
  name: 'scroll-depth-tracking',
  description: 'Track scroll depth events',
  triggers: ['scroll-75'],
  zones: ['global'],
  consent: ['analytics'],

  execute(ctx: TagExecuteContext) {
    // Send scroll depth event to GA4
    const gtag = (window as any).gtag
    if (gtag) {
      gtag('event', 'scroll', {
        percent_scrolled: 75,
        page_path: ctx.url.pathname,
      })
    }

    // Also send to custom endpoint
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics', JSON.stringify({
        event: 'scroll_depth',
        depth: 75,
        url: ctx.url.href,
        timestamp: Date.now(),
      }))
    }
  },
})
