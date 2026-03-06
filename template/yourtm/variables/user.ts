import { defineDataLayerVariable, defineComputedVariable } from '@yourtm/core'

export const userId = defineDataLayerVariable({
  id: 'user-id',
  name: 'User ID',
  path: 'user.id',
  defaultValue: null,
})

export const userEmail = defineDataLayerVariable({
  id: 'user-email',
  name: 'User Email',
  path: 'user.email',
  transform: (value: string) => value?.toLowerCase(),
})

export const userType = defineComputedVariable({
  id: 'user-type',
  name: 'User Type',
  compute: (ctx) => {
    const orders = ctx.dataLayer.get('user.orderCount') || 0
    if (orders === 0) return 'new'
    if (orders < 5) return 'returning'
    return 'loyal'
  },
})
