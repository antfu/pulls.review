import { mount } from '@vue/test-utils'
import { afterEach, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { i18n } from '../i18n'
import { isDarkKey } from '../state/dark'
import AppModal from './AppModal.vue'

let wrapper: ReturnType<typeof mount> | undefined
let host: HTMLElement | undefined

afterEach(() => {
  wrapper?.unmount()
  host?.remove()
})

it('preserves the scoped theme when teleported outside the embed root', async () => {
  host = document.createElement('div')
  document.body.append(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const appRoot = document.createElement('div')
  appRoot.className = 'dark'
  shadow.append(appRoot)
  const dark = ref(true)
  wrapper = mount(AppModal, {
    props: { open: true, title: 'Settings', document: shadow },
    slots: { default: '<span>Wrap lines</span>' },
    attachTo: appRoot,
    global: { plugins: [i18n], provide: { [isDarkKey]: dark } },
  })

  const dialog = shadow.querySelector('[role="dialog"]')!
  expect(appRoot.contains(dialog)).toBe(false)
  expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  expect(dialog.closest('.dark')).not.toBeNull()
  // The global .dark background must not paint the full-screen overlay.
  expect(dialog.closest('.dark')).not.toBe(dialog.parentElement)
  expect(dialog.closest('.dark')?.classList.contains('contents')).toBe(true)
  expect(dialog.classList.contains('color-base')).toBe(true)

  dark.value = false
  await nextTick()
  expect(dialog.closest('.dark')).toBeNull()
})

it('keeps the standalone dialog in the document body', () => {
  wrapper = mount(AppModal, {
    props: { open: true, title: 'Settings' },
    global: { plugins: [i18n] },
  })
  expect(document.body.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Settings')
})
