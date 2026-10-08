import type { DiffsPayload, FileChange, FileChangeStatus, PullRequestState } from '../../types/diff'
import type { GitlabCommitJson, GitlabDiffJson, GitlabMergeRequestJson, MergeRequestRef } from './api'
import { computeContentHash, countChanges, parseHunks, parsePatch } from '../../patch-parser'

function resolveStatus(diff: GitlabDiffJson): FileChangeStatus {
  if (diff.new_file)
    return 'added'
  if (diff.deleted_file)
    return 'removed'
  return diff.renamed_file ? 'renamed' : 'modified'
}

/**
 * One listing entry as a `FileChange`. The listing is the source of truth for which
 * files changed and how; `raw` (the same file from the raw diff, when there is one)
 * supplies the blob sha, the binary marker and a patch the listing left out.
 */
async function normalizeFile(diff: GitlabDiffJson, raw: FileChange | undefined, headSha: string): Promise<FileChange> {
  const listed = parseHunks(diff.diff.split('\n'))
  const hunks = listed.length > 0 ? listed : raw?.hunks ?? []
  const patchOmitted = hunks.length === 0 && !raw && (diff.collapsed || diff.too_large)
  return {
    path: diff.new_path,
    previousPath: diff.renamed_file ? diff.old_path : undefined,
    status: resolveStatus(diff),
    ...countChanges(hunks),
    isBinary: raw?.isBinary ?? diff.diff.startsWith('Binary files '),
    // Without a blob sha: a patch hashes to a key that holds while the patch does, and a
    // file with no patch (binary, pure rename, left out) gets one that lasts until the next push.
    sha: raw?.sha ?? (hunks.length > 0
      ? await computeContentHash(`${diff.old_path}\n${diff.new_path}\n${diff.diff}`)
      : `${headSha}:${diff.new_path}`),
    hunks,
    truncated: patchOmitted ? true : undefined,
  }
}

function resolveState(mr: GitlabMergeRequestJson): PullRequestState {
  if (mr.state === 'merged')
    return 'merged'
  if (mr.state !== 'opened')
    return 'closed'
  return mr.draft ? 'draft' : 'open'
}

/** `true` when GitLab reports more changed files than the listing returned. */
function isIncomplete(changesCount: string | null, listed: number): boolean {
  return changesCount !== null && (changesCount.endsWith('+') || Number(changesCount) > listed)
}

/** `rawDiff` is the merge request's raw git diff, or `undefined` when the instance can't serve one. */
export async function normalizeMergeRequest(
  host: string,
  ref: MergeRequestRef,
  mr: GitlabMergeRequestJson,
  diffs: GitlabDiffJson[],
  commits: GitlabCommitJson[],
  rawDiff: string | undefined,
): Promise<DiffsPayload> {
  const headSha = mr.diff_refs?.head_sha ?? mr.sha ?? ''
  const rawByPath = new Map((rawDiff === undefined ? [] : await parsePatch(rawDiff)).map(file => [file.path, file]))
  return {
    ref: { kind: 'gitlab-mr', host, ...ref },
    title: mr.title,
    label: `!${ref.iid}`,
    author: mr.author ? { name: mr.author.username, avatarUrl: mr.author.avatar_url ?? undefined } : undefined,
    description: mr.description ?? '',
    url: mr.web_url,
    base: mr.diff_refs ? { sha: mr.diff_refs.base_sha, ref: mr.target_branch } : undefined,
    head: { sha: headSha, ref: mr.source_branch },
    createdAt: mr.created_at,
    updatedAt: mr.updated_at,
    pullRequest: { state: resolveState(mr) },
    commits: commits.map(({ id, message }) => ({ sha: id, message })).reverse(),
    files: await Promise.all(diffs.map(diff => normalizeFile(diff, rawByPath.get(diff.new_path), headSha))),
    incomplete: isIncomplete(mr.changes_count, diffs.length) ? true : undefined,
  }
}
