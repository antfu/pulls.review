import { desc, sql } from 'drizzle-orm'
import { customType, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const nocase = customType<{ data: string }>({ dataType: () => 'text COLLATE NOCASE' })

export const userConfig = sqliteTable('user_config', {
  githubUserId: integer('github_user_id').primaryKey(),
  githubLogin: text('github_login').notNull(),
  ciphertext: text('ciphertext').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const analysisResult = sqliteTable('analysis_result', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  owner: nocase('owner').notNull(),
  repo: nocase('repo').notNull(),
  prNumber: integer('pr_number').notNull(),
  authorLogin: nocase('author_login').notNull(),
  resultJson: text('result_json').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [
  index('analysis_result_pr_updated_at').on(table.owner, table.repo, table.prNumber, desc(table.updatedAt)),
  uniqueIndex('analysis_result_owner_repo_pr_number_author_login_unique').on(table.owner, table.repo, table.prNumber, table.authorLogin),
])

export const githubInstallation = sqliteTable('github_installation', {
  id: integer('id').primaryKey(),
  accountLogin: text('account_login'),
  accountType: text('account_type'),
  repositorySelection: text('repository_selection'),
  suspended: integer('suspended').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
})

export const githubRepository = sqliteTable('github_repository', {
  id: integer('id').primaryKey(),
  installationId: integer('installation_id'),
  owner: nocase('owner').notNull(),
  name: nocase('name').notNull(),
  private: integer('private'),
  archived: integer('archived'),
  defaultBranch: text('default_branch'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  removedAt: integer('removed_at'),
}, table => [
  index('github_repository_installation').on(table.installationId, desc(table.updatedAt)),
  uniqueIndex('github_repository_owner_name_unique').on(table.owner, table.name),
])

export const analysisJob = sqliteTable('analysis_job', {
  availableAt: integer('available_at').notNull().default(0),
  leaseToken: text('lease_token'),
  leaseExpiresAt: integer('lease_expires_at'),
  id: text('id').primaryKey(),
  deliveryId: text('delivery_id'),
  owner: nocase('owner').notNull(),
  repo: nocase('repo').notNull(),
  prNumber: integer('pr_number').notNull(),
  installationId: integer('installation_id'),
  headSha: text('head_sha'),
  triggerType: text('trigger_type').notNull(),
  status: text('status').notNull(),
  configSourceType: text('config_source_type').notNull(),
  configSourceGithubUserId: integer('config_source_github_user_id'),
  resultId: integer('result_id'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  attempts: integer('attempts').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at'),
  checkRunId: integer('check_run_id'),
  model: text('model'),
  promptVersion: integer('prompt_version'),
}, table => [
  uniqueIndex('analysis_job_active_head').on(table.owner, table.repo, table.prNumber, table.headSha).where(sql`status IN ('queued', 'running') AND head_sha IS NOT NULL`),
  index('analysis_job_ready').on(table.status, table.availableAt, table.createdAt),
  index('analysis_job_lease').on(table.status, table.leaseExpiresAt),
  index('analysis_job_pr_status_created').on(table.owner, table.repo, table.prNumber, table.status, desc(table.createdAt)),
  uniqueIndex('analysis_job_delivery_id_unique').on(table.deliveryId),
])

export const analysisAttempt = sqliteTable('analysis_attempt', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: text('job_id').notNull(),
  attemptNumber: integer('attempt_number').notNull(),
  status: text('status').notNull(),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
}, table => [
  index('analysis_attempt_job_started').on(table.jobId, desc(table.startedAt)),
  uniqueIndex('analysis_attempt_job_id_attempt_number_unique').on(table.jobId, table.attemptNumber),
])

export const automationConfig = sqliteTable('automation_config', {
  scopeType: text('scope_type').notNull(),
  scopeKey: nocase('scope_key').notNull(),
  enabled: integer('enabled').notNull().default(0),
  includeDrafts: integer('include_drafts').notNull().default(0),
  monthlyBudgetRuns: integer('monthly_budget_runs'),
  locale: text('locale').notNull().default('en'),
  llmCiphertext: text('llm_ciphertext'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  publishCheckRun: integer('publish_check_run').notNull().default(0),
  excludePaths: text('exclude_paths').notNull().default('[]'),
}, table => [
  primaryKey({ columns: [table.scopeType, table.scopeKey] }),
])

export const automationUsage = sqliteTable('automation_usage', {
  scopeType: text('scope_type').notNull(),
  scopeKey: nocase('scope_key').notNull(),
  month: text('month').notNull(),
  runs: integer('runs').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
}, table => [
  primaryKey({ columns: [table.scopeType, table.scopeKey, table.month] }),
])

export const analysisFeedback = sqliteTable('analysis_feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  resultId: integer('result_id').notNull(),
  owner: nocase('owner').notNull(),
  repo: nocase('repo').notNull(),
  prNumber: integer('pr_number').notNull(),
  githubUserId: integer('github_user_id').notNull(),
  rating: text('rating').notNull(),
  groupKey: text('group_key').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [
  index('analysis_feedback_result').on(table.resultId, table.rating),
  uniqueIndex('analysis_feedback_result_id_github_user_id_group_key_unique').on(table.resultId, table.githubUserId, table.groupKey),
])

/** Better Auth owns these tables; application data remains keyed by GitHub's id. */
export const user = sqliteTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull(),
  image: text('image'),
  githubLogin: text('github_login').notNull(),
  githubUserId: integer('github_user_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const session = sqliteTable('auth_session', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, table => [index('auth_session_user').on(table.userId)])

export const account = sqliteTable('auth_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, table => [
  index('auth_account_user').on(table.userId),
  uniqueIndex('auth_account_provider_subject').on(table.providerId, table.accountId),
])

export const verification = sqliteTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, table => [index('auth_verification_identifier').on(table.identifier)])
