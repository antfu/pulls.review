import type { Env } from './env'
import { sql } from 'drizzle-orm'

/** One GitHub App installation as recorded from webhook / setup events. */
export interface InstallationRecord {
  id: number
  accountLogin?: string
  accountType?: string
  repositorySelection?: string
  suspended?: boolean
  updatedAt: number
}

interface InstallationRow {
  id: number
  account_login: string | null
  account_type: string | null
  repository_selection: string | null
  suspended: number
  updated_at: number
}

const installationColumns = sql`id, account_login, account_type, repository_selection, suspended, updated_at`

function parseInstallation(row: InstallationRow): InstallationRecord {
  return {
    id: row.id,
    accountLogin: row.account_login ?? undefined,
    accountType: row.account_type ?? undefined,
    repositorySelection: row.repository_selection ?? undefined,
    suspended: row.suspended === 1,
    updatedAt: row.updated_at,
  }
}

export async function getInstallation(env: Pick<Env, 'DB'>, id: number): Promise<InstallationRecord | null> {
  const row = env.DB?.get<InstallationRow>(sql`SELECT ${installationColumns}
    FROM github_installation WHERE id = ${id} AND deleted_at IS NULL`)
  return row ? parseInstallation(row) : null
}

export interface GithubRepositoryPayload {
  id?: number
  name?: string
  full_name?: string
  owner?: { login?: string }
  private?: boolean
  archived?: boolean
  default_branch?: string
}

function repositoryOwner(repo: GithubRepositoryPayload): string | undefined {
  return repo.owner?.login ?? repo.full_name?.split('/')[0]
}

/** Merge webhook or setup metadata without clearing omitted fields. */
export async function syncInstallationRecord(env: Pick<Env, 'DB'>, record: Omit<InstallationRecord, 'updatedAt'>, now = Date.now()): Promise<void> {
  if (!env.DB)
    return
  env.DB.run(sql`INSERT INTO github_installation (
      id, account_login, account_type, repository_selection, suspended, created_at, updated_at, deleted_at
    ) VALUES (${record.id}, ${record.accountLogin ?? null}, ${record.accountType ?? null}, ${record.repositorySelection ?? null}, ${record.suspended ? 1 : 0}, ${now}, ${now}, NULL)
    ON CONFLICT(id) DO UPDATE SET
      account_login = COALESCE(excluded.account_login, github_installation.account_login),
      account_type = COALESCE(excluded.account_type, github_installation.account_type),
      repository_selection = COALESCE(excluded.repository_selection, github_installation.repository_selection),
      suspended = COALESCE(${record.suspended === undefined ? null : Number(record.suspended)}, github_installation.suspended),
      updated_at = excluded.updated_at,
      deleted_at = NULL`)
}

/** Mark an installation deleted in SQLite and retire its repository inventory. */
export async function deleteInstallationRecord(env: Pick<Env, 'DB'>, id: number, now = Date.now()): Promise<void> {
  if (!env.DB)
    return
  env.DB.transaction((db) => {
    db.run(sql`UPDATE github_installation SET deleted_at = ${now}, updated_at = ${now} WHERE id = ${id}`)
    db.run(sql`UPDATE github_repository SET removed_at = ${now}, updated_at = ${now} WHERE installation_id = ${id}`)
  })
}

/** Upsert one repository seen through an installation or PR webhook. */
export async function upsertGithubRepository(env: Pick<Env, 'DB'>, repo: GithubRepositoryPayload, installationId?: number, now = Date.now()): Promise<void> {
  const owner = repositoryOwner(repo)
  if (!env.DB || !repo.id || !repo.name || !owner)
    return
  env.DB.run(sql`INSERT INTO github_repository (
      id, installation_id, owner, name, private, archived, default_branch, created_at, updated_at, removed_at
    ) VALUES (${repo.id}, ${installationId ?? null}, ${owner}, ${repo.name}, ${repo.private === undefined ? null : repo.private ? 1 : 0}, ${repo.archived === undefined ? null : repo.archived ? 1 : 0}, ${repo.default_branch ?? null}, ${now}, ${now}, NULL)
    ON CONFLICT(id) DO UPDATE SET
      installation_id = COALESCE(excluded.installation_id, github_repository.installation_id),
      owner = excluded.owner,
      name = excluded.name,
      private = COALESCE(excluded.private, github_repository.private),
      archived = COALESCE(excluded.archived, github_repository.archived),
      default_branch = COALESCE(excluded.default_branch, github_repository.default_branch),
      updated_at = excluded.updated_at,
      removed_at = NULL`)
}

/** Apply added/removed repository lists from installation webhooks. */
export async function syncInstallationRepositories(
  env: Pick<Env, 'DB'>,
  installationId: number,
  added: GithubRepositoryPayload[] = [],
  removed: GithubRepositoryPayload[] = [],
  now = Date.now(),
): Promise<void> {
  for (const repo of added)
    await upsertGithubRepository(env, repo, installationId, now)
  if (!env.DB)
    return
  for (const repo of removed) {
    if (repo.id)
      env.DB.run(sql`UPDATE github_repository SET removed_at = ${now}, updated_at = ${now} WHERE id = ${repo.id}`)
  }
}

export async function listInstallations(env: Pick<Env, 'DB'>): Promise<InstallationRecord[]> {
  if (!env.DB)
    return []
  return env.DB.all<InstallationRow>(sql`SELECT ${installationColumns}
    FROM github_installation WHERE deleted_at IS NULL ORDER BY id
  `).map(parseInstallation)
}
