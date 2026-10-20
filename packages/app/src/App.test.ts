import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, RouterView } from 'vue-router'
import { createFixedResolver, experimental_createRouter as createRouter, MatcherPatternPathDynamic, normalizeRouteRecord } from 'vue-router/experimental'
import App from './App.vue'

describe('app', () => {
  it('remounts the routed page when only a route param changes', async () => {
    let mounts = 0
    const Page = defineComponent({
      setup() {
        mounts++
        return () => h('div')
      },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      resolver: createFixedResolver([normalizeRouteRecord({
        name: 'page',
        path: new MatcherPatternPathDynamic(/^\/gh\/([^/]+)\/([^/]+)\/([^/]+)\/?$/, { owner: [], repo: [], number: [] }, ['/gh/', 1, '/', 1, '/', 1]),
        components: { default: Page },
      })]),
    })
    await router.push('/gh/a/b/1')
    mount(App, { global: { plugins: [router], components: { RouterView } } })
    await router.isReady()

    await router.push('/gh/a/b/2')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(mounts).toBe(2)
  })
})
