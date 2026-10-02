import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
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
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/gh/:owner/:repo/:number', component: Page }] })
    await router.push('/gh/a/b/1')
    mount(App, { global: { plugins: [router] } })
    await router.isReady()

    await router.push('/gh/a/b/2')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(mounts).toBe(2)
  })
})
