# pulls.review

Review local git changes in the browser, grouped and summarized like a pull request on [pulls.review](https://pulls.review).

```sh
npx pulls.review              # the working tree against HEAD, untracked files included
npx pulls.review HEAD         # one commit against its parent
npx pulls.review main...feat  # what feat adds since it forked from main
npx pulls.review v1..v2       # the tree diff between two revisions
```

Run it inside a git repository. It serves the review on `localhost` through [devframe](https://github.com/devframes/devframe) and opens your browser. The tab is trusted with a one-time code printed in the terminal. Reviewed marks and AI results are cached in `.git/pulls-review`.

To analyze a GitHub pull request in CI, use [`@pulls.review/actions`](../actions).
