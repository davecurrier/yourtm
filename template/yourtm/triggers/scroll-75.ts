import { defineScrollTrigger } from '@yourtm/core'

export default defineScrollTrigger({
  name: 'scroll-75',
  description: 'Fires when user scrolls 75% of the page',
  threshold: 75,
  fireOnce: true,
})
