import { defineTag, type TagExecuteContext } from '@yourtm/core'

export default defineTag({
  name: 'ga4-add-to-cart',
  description: 'Google Analytics 4 add to cart event',
  triggers: ['add-to-cart-click'],
  zones: ['product'],
  consent: ['analytics'],
  vendor: 'google',

  execute(ctx: TagExecuteContext) {
    const gtag = (window as any).gtag
    if (!gtag) return

    const product = ctx.trigger?.extractedData || {}

    gtag('event', 'add_to_cart', {
      currency: 'USD',
      value: product.price || 0,
      items: [{
        item_id: product.product_id,
        item_name: product.product_name,
        price: product.price,
        quantity: 1,
      }],
    })
  },
})
