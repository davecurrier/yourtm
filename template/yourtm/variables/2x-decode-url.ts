import { defineJavaScriptVariable } from '@yourtm/core'

export const _2x_decode_url = defineJavaScriptVariable({
  name: '2x Decode URL',
  resolve: (ctx) => {
    var path = ctx.variables['page-path'];
  return decodeURIComponent(decodeURIComponent(path));
  }
})

export default _2x_decode_url
