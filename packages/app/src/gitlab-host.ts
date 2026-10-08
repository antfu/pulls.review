/**
 * The GitLab instance this build opens merge requests from and saves a token for.
 * One per build: `/gl/...` routes and pasted URLs mean this host and no other.
 */
export const GITLAB_HOST: string = import.meta.env.PR_GITLAB_HOST
