import { defineTag } from '@yourtm/core'

export default defineTag({
    name: 'GA4 Config',
    triggers: ["all-pages"],
    zones: ["global"],
    execute(ctx) {
        // GA4 Event
        // Measurement ID: G-XXXXXXX
    },
    autoPageViews: true,
    debugMode: false,
    enableUserIdTracking: true,
    userIdVariable: 'userid',
    measurementId: 'G-1234567',
    cookieFlags: 'strict',
    settings: {
        autoPageViews: true,
        debugMode: false,
        enableUserIdTracking: true,
        userIdVariable: 'userid',
        measurementId: 'G-1234567',
        cookieFlags: 'strict',
        id: 'ga4-config',
        sourcePath: 'yourtm/tags/ga4-config.ts'
    }
})
