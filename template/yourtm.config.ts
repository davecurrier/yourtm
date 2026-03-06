import { defineConfig } from '@yourtm/core'

export default defineConfig({
  containerId: 'YTM-EXM001',

  environments: {
    development: {
      debug: true,
    },
    staging: {
      deployTo: 'cloudflare',
    },
    production: {
      deployTo: 'cloudflare',
      performanceBudget: {
        bundleSize: '15kb',
        tagExecution: '100ms',
      },
    },
  },

  consent: {
    categories: ['essential', 'analytics', 'marketing'],
    defaultState: 'deny-all',
    storageKey: 'ytm_consent',
  },

  build: {
    outDir: 'dist/ytm',
    minify: true,
    sourceMaps: true,
  },
})
