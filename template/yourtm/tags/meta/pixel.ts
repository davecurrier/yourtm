import { defineTag, type TagExecuteContext } from '@yourtm/core'

export default defineTag({
  name: 'meta-pixel',
  description: 'Meta (Facebook) Pixel initialization and page view',
  triggers: ['page-load'],
  zones: ['global'],
  consent: ['marketing'],
  vendor: 'meta',

  async setup() {
    // Load Facebook Pixel
    if (typeof window !== 'undefined' && !(window as any).fbq) {
      const n = (window as any).fbq = function() {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
      }
      if (!(window as any)._fbq) (window as any)._fbq = n
      n.push = n
      n.loaded = true
      n.version = '2.0'
      n.queue = []

      const script = document.createElement('script')
      script.async = true
      script.src = 'https://connect.facebook.net/en_US/fbevents.js'
      document.head.appendChild(script)

      ;(window as any).fbq('init', '1234567890')
    }
  },

  execute(ctx: TagExecuteContext) {
    const fbq = (window as any).fbq
    if (fbq) {
      fbq('track', 'PageView')
    }
  },
})
