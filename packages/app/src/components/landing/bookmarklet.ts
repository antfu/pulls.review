/**
 * A bookmarklet that toggles the current page between github.com and pulls.review,
 * for browsers where extensions (and so the userscript) can't be installed.
 *
 * Each host maps to the other one's origin and an ordered list of path rewrites:
 * a pull request, a commit, a compare range, and a repository's pull request list.
 * Keep the rewrites in sync with the routes in `source-routes.ts`.
 *
 * The code stays on one line with no `%`: browsers strip newlines from a `javascript:`
 * URL and percent-decode it before running it.
 */
export const BOOKMARKLET = `javascript:${String.raw`(()=>{const R={'github.com':['https://pulls.review',[[/^\/([^/]+)\/([^/]+)\/pull\/(\d+).*$/,'/gh/$1/$2/$3'],[/^\/([^/]+)\/([^/]+)\/(commit\/[^/]+|compare\/.+\.\.\..+)$/,'/gh/$1/$2/$3'],[/^\/([^/]+)\/([^/]+)\/pulls\/?$/,'/gh/$1/$2']]],'pulls.review':['https://github.com',[[/^\/gh\/([^/]+)\/([^/]+)\/(\d+)\/?$/,'/$1/$2/pull/$3'],[/^\/gh\/([^/]+)\/([^/]+)\/(commit\/[^/]+|compare\/.+\.\.\..+)$/,'/$1/$2/$3'],[/^\/gh\/([^/]+)\/([^/]+)\/?$/,'/$1/$2/pulls']]]};const[o,r]=R[location.hostname]||[];const p=location.pathname;const m=r&&r.find(([x])=>x.test(p));m?location.href=o+p.replace(m[0],m[1]):alert('Open a pull request, commit or compare page on github.com or pulls.review.')})();`}`
