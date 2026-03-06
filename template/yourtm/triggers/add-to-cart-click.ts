import { defineClickTrigger } from '@yourtm/core'

export default defineClickTrigger({
  name: 'add-to-cart-click',
  description: 'Fires when user clicks add to cart button',
  selector: '[data-action="add-to-cart"]',
  waitForTags: true,
})
