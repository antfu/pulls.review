import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import MarkdownMermaid from './MarkdownMermaid.vue'

it('renders a diagram as SVG', () => {
  const wrapper = mount(MarkdownMermaid, { props: { content: 'graph LR\n  A --> B' } })

  expect(wrapper.find('svg').exists()).toBe(true)
  expect(wrapper.find('pre').exists()).toBe(false)
})

it('keeps the source as a code block when the diagram cannot be rendered', () => {
  const content = 'not a diagram'
  const wrapper = mount(MarkdownMermaid, { props: { content } })

  expect(wrapper.find('svg').exists()).toBe(false)
  expect(wrapper.find('pre').text()).toBe(content)
})

it('does not turn markup in labels into elements', () => {
  const wrapper = mount(MarkdownMermaid, {
    props: { content: 'graph LR\n  A["<img src=x onerror=alert(1)><script>alert(1)</script>"] --> B' },
  })

  expect(wrapper.find('svg').exists()).toBe(true)
  expect(wrapper.find('img, script, foreignObject').exists()).toBe(false)
  expect(wrapper.html()).not.toContain('onerror=alert(1)>')
})
