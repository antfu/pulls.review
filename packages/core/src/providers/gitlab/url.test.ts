import { describe, expect, it } from 'vitest'
import { serializeRef } from '../../types/source'
import { parseGithubUrl } from '../github/url'
import { parseGitlabUrl } from './url'

describe('parseGitlabUrl', () => {
  it('reads a merge request under any depth of namespaces', () => {
    expect(parseGitlabUrl('https://gitlab.com/group/project/-/merge_requests/123'))
      .toEqual({ kind: 'gitlab-mr', host: 'gitlab.com', project: 'group/project', iid: '123' })
    expect(parseGitlabUrl('https://gitlab.com/group/subgroup/deeper/project/-/merge_requests/7/diffs?tab=1#note_2'))
      .toEqual({ kind: 'gitlab-mr', host: 'gitlab.com', project: 'group/subgroup/deeper/project', iid: '7' })
    expect(parseGitlabUrl('gitlab.com/my-group/my.project_x/-/merge_requests/1'))
      .toEqual({ kind: 'gitlab-mr', host: 'gitlab.com', project: 'my-group/my.project_x', iid: '1' })
  })

  it('reads the `group/project!123` shorthand', () => {
    expect(parseGitlabUrl(' group/subgroup/project!42 '))
      .toEqual({ kind: 'gitlab-mr', host: 'gitlab.com', project: 'group/subgroup/project', iid: '42' })
  })

  it('reads a project, its merge request list and its other pages as the project', () => {
    const project = { kind: 'gitlab-project', host: 'gitlab.com', project: 'group/subgroup/project' }
    expect(parseGitlabUrl('https://gitlab.com/group/subgroup/project')).toEqual(project)
    expect(parseGitlabUrl('https://gitlab.com/group/subgroup/project/')).toEqual(project)
    expect(parseGitlabUrl('https://gitlab.com/group/subgroup/project/-/merge_requests')).toEqual(project)
    expect(parseGitlabUrl('https://gitlab.com/group/subgroup/project/-/merge_requests?state=opened')).toEqual(project)
    expect(parseGitlabUrl('https://gitlab.com/group/subgroup/project/-/issues/3')).toEqual(project)
  })

  it('rejects other hosts, a bare namespace and GitHub\'s own forms', () => {
    expect(parseGitlabUrl('https://gitlab.example.com/group/project/-/merge_requests/1')).toBeUndefined()
    expect(parseGitlabUrl('https://notgitlab.com/group/project/-/merge_requests/1')).toBeUndefined()
    expect(parseGitlabUrl('https://gitlab.com/group')).toBeUndefined()
    expect(parseGitlabUrl('https://github.com/owner/repo/pull/1')).toBeUndefined()
    expect(parseGitlabUrl('owner/repo#1')).toBeUndefined()
  })

  it('reads the URLs of the instance it is given, and only those', () => {
    const host = 'gitlab.example.com:8443'
    expect(parseGitlabUrl('https://gitlab.example.com:8443/group/sub/project/-/merge_requests/9', host))
      .toEqual({ kind: 'gitlab-mr', host, project: 'group/sub/project', iid: '9' })
    expect(parseGitlabUrl('group/project!9', host)).toEqual({ kind: 'gitlab-mr', host, project: 'group/project', iid: '9' })
    expect(parseGitlabUrl('https://gitlab.example.com:8443/group/project', host)).toEqual({ kind: 'gitlab-project', host, project: 'group/project' })
    expect(parseGitlabUrl('https://gitlab.com/group/project/-/merge_requests/9', host)).toBeUndefined()
    // The dots of a host are literal: no other host passes for it.
    expect(parseGitlabUrl('https://gitlabxexample.com:8443/group/project/-/merge_requests/9', host)).toBeUndefined()
  })

  it('shares no input with the GitHub parser', () => {
    expect(parseGithubUrl('https://gitlab.com/group/project/-/merge_requests/123')).toBeUndefined()
    expect(parseGithubUrl('group/project!123')).toBeUndefined()
  })
})

describe('a gitlab-mr cache key', () => {
  it('is the same for the same merge request and differs by host, project and number', () => {
    const ref = { kind: 'gitlab-mr', host: 'gitlab.com', project: 'group/sub/project', iid: '12' } as const
    expect(serializeRef(ref)).toBe('gitlab:gitlab.com/group/sub/project!12')
    expect(serializeRef({ ...ref })).toBe(serializeRef(ref))

    const keys = [
      ref,
      { ...ref, host: 'gitlab.example.com' },
      { ...ref, project: 'group/sub' },
      { ...ref, project: 'group/sub/project1', iid: '2' },
      { ...ref, iid: '1' },
    ].map(serializeRef)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('never equals the key of a GitHub pull request at the same path', () => {
    expect(serializeRef({ kind: 'gitlab-mr', host: 'gitlab.com', project: 'o/r', iid: '1' }))
      .not
      .toBe(serializeRef({ kind: 'github-pr', owner: 'o', repo: 'r', number: '1' }))
  })
})
