import { defineZone } from '@yourtm/core'

export default defineZone({
  name: 'checkout',
  description: 'Checkout and cart pages',
  patterns: ['/checkout/*', '/cart', '/order/*'],
})
