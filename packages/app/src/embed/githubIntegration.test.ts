import { afterEach, describe, expect, it, vi } from 'vitest'
import { hijackReviewLinks, keepToggleTab, PANEL_OPEN_CLASS, parseReviewLink, setPanelOpenWidth, syncToggleTab } from './githubIntegration'

const pr = { owner: 'antfu', repo: 'pulls.review', number: '38' }

afterEach(() => {
  document.body.innerHTML = ''
  setPanelOpenWidth(undefined)
})

function renderTabBar() {
  document.body.innerHTML = `<nav><a class="TabNavLink" href="/antfu/pulls.review/pull/38/files" id="prs-files-anchor-tab">Files changed</a></nav>`
}

describe('toggle tab', () => {
  it('inserts a button with the icon before "Files changed" and updates it in place', () => {
    renderTabBar()
    const onToggle = vi.fn()

    syncToggleTab({ label: 'Review Changes', hasSharedResult: false, sharedResultTitle: 'AI analysis available' }, onToggle)
    const button = document.getElementById('diffs-toggle-tab')!
    const dot = button.querySelector<HTMLElement>('.pulls-review-tab-dot')!

    expect(button.nextElementSibling?.id).toBe('prs-files-anchor-tab')
    expect(button.className).toBe('TabNavLink')
    expect(button.querySelector('svg')).not.toBeNull()
    expect(button.textContent).toBe('Review Changes')
    expect(dot.hidden).toBe(true)

    syncToggleTab({ label: 'Änderungen reviewen', hasSharedResult: true, sharedResultTitle: 'KI-Analyse verfügbar' }, onToggle)

    expect(document.querySelectorAll('#diffs-toggle-tab')).toHaveLength(1)
    expect(button.textContent).toBe('Änderungen reviewen')
    expect(dot.hidden).toBe(false)
    expect(dot.title).toBe('KI-Analyse verfügbar')

    button.click()
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('does nothing without a "Files changed" tab', () => {
    syncToggleTab({ label: 'Review Changes', hasSharedResult: false, sharedResultTitle: '' }, vi.fn())
    expect(document.getElementById('diffs-toggle-tab')).toBeNull()
  })
})

describe('keepToggleTab', () => {
  const settle = () => new Promise(resolve => setTimeout(resolve, 0))
  const sync = () => syncToggleTab({ label: 'Review Changes', hasSharedResult: false, sharedResultTitle: '' }, vi.fn())

  it('re-inserts the button when the page re-renders the tab bar, until stopped', async () => {
    renderTabBar()
    sync()
    const stop = keepToggleTab(sync)

    renderTabBar()
    await settle()
    expect(document.querySelectorAll('#diffs-toggle-tab')).toHaveLength(1)
    expect(document.getElementById('diffs-toggle-tab')!.nextElementSibling?.id).toBe('prs-files-anchor-tab')

    stop()
    renderTabBar()
    await settle()
    expect(document.getElementById('diffs-toggle-tab')).toBeNull()
  })

  it('leaves an existing button alone', async () => {
    renderTabBar()
    sync()
    const button = document.getElementById('diffs-toggle-tab')!
    const stop = keepToggleTab(sync)

    document.body.append(document.createElement('div'))
    await settle()
    expect(document.getElementById('diffs-toggle-tab')).toBe(button)
    stop()
  })
})

describe('setPanelOpenWidth', () => {
  it('shrinks <html> to the remaining space while open and restores it when closed', () => {
    setPanelOpenWidth(800)
    expect(document.body.classList.contains(PANEL_OPEN_CLASS)).toBe(true)
    expect(document.documentElement.style.width).toBe('calc(100% - 800px)')
    expect(document.documentElement.style.maxWidth).toBe('calc(100% - 800px)')

    setPanelOpenWidth(undefined)
    expect(document.body.classList.contains(PANEL_OPEN_CLASS)).toBe(false)
    expect(document.documentElement.style.width).toBe('')
    expect(document.documentElement.style.maxWidth).toBe('')
  })
})

describe('parseReviewLink', () => {
  it('reads the PR and the ?from= login, decoded', () => {
    expect(parseReviewLink('https://pulls.review/gh/antfu/pulls.review/38?from=github-actions%5Bbot%5D'))
      .toEqual({ ...pr, from: 'github-actions[bot]' })
    expect(parseReviewLink('https://pulls.review/gh/antfu/pulls.review/38')).toEqual({ ...pr, from: undefined })
  })

  it('ignores other pages and origins', () => {
    expect(parseReviewLink('https://pulls.review/gh/antfu/pulls.review')).toBeUndefined()
    expect(parseReviewLink('https://pulls.review/')).toBeUndefined()
    expect(parseReviewLink('https://example.com/gh/antfu/pulls.review/38')).toBeUndefined()
  })
})

describe('hijackReviewLinks', () => {
  function link(href: string) {
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.textContent = href
    return anchor
  }

  /** Whether the page would have followed the link: the hijack runs on the anchor itself, before this bubbles here. */
  function click(anchor: HTMLAnchorElement): boolean {
    let followed = true
    const stopNavigation = (event: Event) => {
      followed = !event.defaultPrevented
      event.preventDefault()
    }
    document.addEventListener('click', stopNavigation)
    anchor.dispatchEvent(new MouseEvent('click', { cancelable: true, bubbles: true }))
    document.removeEventListener('click', stopNavigation)
    return followed
  }

  const settle = () => new Promise(resolve => setTimeout(resolve, 0))

  it('opens same-PR links in the drawer and appends a new-tab icon, leaving other links alone', () => {
    const same = link('https://pulls.review/gh/antfu/pulls.review/38?from=github-actions[bot]')
    const other = link('https://pulls.review/gh/antfu/pulls.review/37?from=antfu')
    document.body.append(same, other)
    const onOpen = vi.fn()
    const stop = hijackReviewLinks({ pr: () => pr, onOpen, launchLabel: () => 'Open in pulls.review' })

    expect(click(same)).toBe(false)
    expect(onOpen).toHaveBeenCalledWith({ ...pr, from: 'github-actions[bot]' })

    const launch = same.nextElementSibling as HTMLAnchorElement
    expect(launch.className).toBe('pulls-review-launch')
    expect(launch.href).toBe(same.href)
    expect(launch.target).toBe('_blank')
    expect(launch.getAttribute('aria-label')).toBe('Open in pulls.review')
    expect(click(launch)).toBe(true)

    expect(click(other)).toBe(true)
    expect(other.nextElementSibling).toBeNull()
    stop()
  })

  it('picks up links rendered later, once each, until stopped', async () => {
    const onOpen = vi.fn()
    const stop = hijackReviewLinks({ pr: () => pr, onOpen, launchLabel: () => '' })

    const late = link('https://pulls.review/gh/antfu/pulls.review/38?from=antfu')
    document.body.append(late)
    await settle()
    document.body.append(document.createElement('div'))
    await settle()

    expect(document.querySelectorAll('.pulls-review-launch')).toHaveLength(1)
    click(late)
    expect(onOpen).toHaveBeenCalledOnce()

    stop()
    document.body.append(link('https://pulls.review/gh/antfu/pulls.review/38'))
    await settle()
    expect(document.querySelectorAll('.pulls-review-launch')).toHaveLength(1)
  })
})
