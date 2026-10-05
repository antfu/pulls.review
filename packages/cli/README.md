# pulls.review

Review local git changes in the browser, grouped and summarized like a pull request on [pulls.review](https://pulls.review).

```sh
npx pulls.review               # the current branch against the default branch (or a ref picker on main)
npx pulls.review main...feat   # what feat adds since it forked from main
npx pulls.review v1..v2        # the tree diff between two revisions
npx pulls.review feat          # a branch against the default branch
npx pulls.review HEAD          # one commit against its parent
npx pulls.review --worktree    # uncommitted changes against HEAD, untracked files included
```

Run it inside a git repository. It serves on `localhost` through [devframe](https://github.com/devframes/devframe) and opens the page for the argument; any other branch, range or commit can be picked from `/`. The tab is trusted with a one-time code printed in the terminal. Reviewed marks and AI results are cached in `.git/pulls-review`.

To analyze a GitHub pull request in CI, use [`@pulls.review/actions`](../actions).
