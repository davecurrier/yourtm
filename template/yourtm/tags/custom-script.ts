import { defineTag } from '@yourtm/core'

export default defineTag({
  name: 'Custom Script',
  triggers: ["all-pages"],
  zones: ['global'],
  execute(ctx) {
    // Custom HTML Tag
    const script = document.createElement('script');
    script.text = `<script>console.log('Hello from GTM');</script>`;
    document.head.appendChild(script);
  }
})
