import { defineZone } from '@yourtm/core'

export default defineZone({
  name: 'product',
  description: 'Product detail pages',
  patterns: ['/product/*', '/products/*', '/p/*'],
})
