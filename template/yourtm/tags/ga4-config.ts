import { defineTag } from '@yourtm/core'

export default defineTag({
  name: 'GA4 Config',
  triggers: ["all-pages"],
  zones: ['global'],
  execute(ctx) {
    // GA4 Event
    // Measurement ID: G-XXXXXXX
  }
})
