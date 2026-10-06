# pulls.review

Review local git changes in the browser, grouped and summarized like a pull request on [pulls.review](https://pulls.review).

```sh
npx pulls.review               # the current branch against the default branch (or a ref picker on main)
npx pulls.review main...feat   # what feat adds since it forked from main
npx pulls.review v1..v2        # the tree diff between two revisions
npx pulls.review feat          # a branch against the default branch
npx pulls.review HEAD          # one commit against its parent
npx pulls.review --worktree    # uncommitted changes against HEAD, untracked files included
npx pulls.review owner/repo#1  # a GitHub pull request (or a github.com PR, compare, commit or repo URL)
```

Run it inside a git repository. It serves on `localhost` through [devframe](https://github.com/devframes/devframe) and opens the page for the argument; any other branch, range or commit can be picked from `/`. The tab is trusted with a one-time code printed in the terminal. Reviewed marks and AI results are cached in `.git/pulls-review`.

GitHub pull requests open on the same `/gh/{owner}/{repo}/{number}` pages as the site, with comments and reviews, using the token from `GITHUB_TOKEN` (or `PULLS_REVIEW_GITHUB_TOKEN`), else from `gh auth token`.

To analyze a GitHub pull request in CI, use [`@pulls.review/actions`](../actions).
