import { defineTag, type TagExecuteContext } from '@yourtm/core'

export default defineTag({
  name: 'ga4-pageview',
  description: 'Google Analytics 4 page view tracking',
  triggers: ['page-load'],
  zones: ['global'],
  consent: ['analytics'],
  vendor: 'google',

  async setup() {
    // Load gtag.js
    if (typeof window !== 'undefined' && !(window as any).gtag) {
      const script = document.createElement('script')
      script.src = 'https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX'
      script.async = true
      document.head.appendChild(script)

      ;(window as any).dataLayer = (window as any).dataLayer || []
      ;(window as any).gtag = function() {
        ;(window as any).dataLayer.push(arguments)
      }
      ;(window as any).gtag('js', new Date())
    }
  },

  execute(ctx: TagExecuteContext) {
    const gtag = (window as any).gtag
    if (gtag) {
      gtag('config', 'G-XXXXXXXXXX', {
        page_title: ctx.dataLayer?.page?.title || document.title,
        page_location: ctx.url.href,
      })
    }
  },
})
