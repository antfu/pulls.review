import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import GithubAvatar from './GithubAvatar.vue'

describe('github avatar source', () => {
  it('uses the avatar URL returned by GitHub for bot accounts', () => {
    const avatarUrl = 'https://avatars.githubusercontent.com/in/1144995?v=4'
    const wrapper = mount(GithubAvatar, {
      props: { login: 'chatgpt-codex-connector[bot]', avatarUrl, size: 18 },
    })

    expect(wrapper.find('img').attributes('src')).toBe(avatarUrl)
  })

  it('removes the bot suffix when only a login is available', () => {
    const wrapper = mount(GithubAvatar, {
      props: { login: 'chatgpt-codex-connector[bot]', size: 18 },
    })

    expect(wrapper.find('img').attributes('src')).toBe('https://github.com/chatgpt-codex-connector.png?size=36')
  })

  it('keeps a fixed-size accessible placeholder when the image fails', async () => {
    const wrapper = mount(GithubAvatar, {
      props: { login: 'chatgpt-codex-connector[bot]', size: 18 },
    })

    await wrapper.find('img').trigger('error')

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.attributes('role')).toBe('img')
    expect(wrapper.attributes('aria-label')).toContain('chatgpt-codex-connector[bot]')
    expect(wrapper.attributes('style')).toContain('width: 18px')
    expect(wrapper.attributes('style')).toContain('height: 18px')
    expect(wrapper.text()).toBe('C')

    await wrapper.setProps({ avatarUrl: 'https://avatars.githubusercontent.com/in/1144995?v=4' })
    expect(wrapper.find('img').exists()).toBe(true)
  })
})
