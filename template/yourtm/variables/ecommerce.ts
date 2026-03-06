import { defineDataLayerVariable, defineComputedVariable } from '@yourtm/core'

export const cartTotal = defineDataLayerVariable({
  id: 'cart-total',
  name: 'Cart Total',
  path: 'ecommerce.cart.total',
  defaultValue: 0,
})

export const cartItemCount = defineDataLayerVariable({
  id: 'cart-item-count',
  name: 'Cart Item Count',
  path: 'ecommerce.cart.items.length',
  defaultValue: 0,
})

export const currencyCode = defineDataLayerVariable({
  id: 'currency-code',
  name: 'Currency Code',
  path: 'ecommerce.currency',
  defaultValue: 'USD',
})

export const orderValue = defineComputedVariable({
  id: 'order-value',
  name: 'Order Value',
  compute: (ctx) => {
    const cart = ctx.dataLayer.get('ecommerce.cart')
    if (!cart?.items) return 0
    return cart.items.reduce((sum: number, item: any) => {
      return sum + (item.price * item.quantity)
    }, 0)
  },
})
