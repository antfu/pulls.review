# maintainer guide

`.agents/` describes what the code does and why. It is a map, not a standard:
where the two disagree, the packages' `src/` and test suites win, and the docs get fixed.

## Rules that apply everywhere

- **MUST**, **MUST NOT**, **SHOULD** and **MAY** use RFC 2119 meanings. They mark
  real invariants - layer boundaries, wire contracts, output shapes - not house style.
- Vue SFCs **MUST NOT** have a `<style>` block, scoped or not. Style elements with
  UnoCSS utilities in the template. For markup the template can't put classes on
  (rendered Markdown, `v-html`), add a shortcut in `packages/app/uno.config.ts`
  built from arbitrary descendant variants (`[&_pre]:p-3`).

## Pull request preparation

When preparing, creating, or updating a pull request, invoke
`$antfu-create-pr` when it is available. Its title and publication workflow
still apply. The repository contract below applies even when that skill cannot
be resolved.

### Comparison and review

- Record the target branch, head branch, merge base, and exact `base...head`
  range. For stacked work, name the parent branch or PR and separate inherited
  changes from this PR's own changes.
- Review the complete diff. Trace changed files to their entry points, callers,
  state owners, persistence, providers, and other external boundaries when
  those relationships affect the change.
- After publishing or updating the PR, reopen it and verify the title, base,
  head, body, tables, diagrams, image Markdown, review threads, and checks.

### PR body contract

Every PR **MUST** contain `## Summary` and `## Verification`. The summary starts
with the changed user or system behavior, then explains the result and why the
change belongs in this PR. Verification lists exact commands and outcomes,
keeps focused tests, static checks, CI, runtime inspection, and manual
acceptance distinct, and names each unverified condition.

Add the following sections only when they improve reviewability:

| Section                        | Use when                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `## Change map`                | Several modules, responsibilities, or ownership boundaries change.                          |
| `## Architecture and behavior` | Module flow, ordering, async work, events, IPC, cleanup, or state transitions change.       |
| `## Boundaries and risks`      | The change has meaningful invariants, failure modes, migrations, or external effects.       |
| `## Visual changes`            | The change affects user-visible UI.                                                         |
| `## Rollout and follow-up`     | The change needs migration order, feature gates, monitoring, known gaps, or a follow-up PR. |

A change map **MUST** describe modules or domain boundaries, not repeat the
changed-file list:

```markdown
| Module                 | Before                      | After                  | Description           |
| ---------------------- | --------------------------- | ---------------------- | --------------------- |
| `<module or boundary>` | `<previous responsibility>` | `<new responsibility>` | `<reason and effect>` |
```

Use a module flow for changed ownership or dependencies, a sequence diagram for
ordering, and a state diagram for transitions or terminal states. A fix whose
fault is explained by flow or state **SHOULD** show structurally comparable
`Before` and `After` diagrams, followed by the exact changed edge, step, owner,
or transition.

When several invariants or edge cases matter, map each one to its protection and
evidence:

```markdown
| Invariant or boundary | Failure mode        | Protection               | Evidence or gap                             |
| --------------------- | ------------------- | ------------------------ | ------------------------------------------- |
| `<required behavior>` | `<how it can fail>` | `<code or design guard>` | `<test, runtime evidence, or Not verified>` |
```

Do not add empty sections or invent content to fill the template. Do not claim
that a green CI run proves behavior outside its configured checks.

### Visual evidence

When `$antfu-create-pr` handles a user-visible UI change, it **MUST** invoke
`$use-vishot` for before/after evidence. Let `$use-vishot` select the matching
runtime skill; pulls.review browser and Storybook surfaces normally use
`$use-vishot-with-web`.

- Prefer an existing Storybook story or product-owned scenario over an ad hoc
  capture route.
- Capture the same state from the merge base and proposed HEAD with identical
  viewport, fixture data, locale, theme, readiness condition, and stable ID.
- Put every captured pair under `## Visual changes` in the PR body. The image
  row **MUST** appear before the component or page name row:

  ```markdown
  | Before                                                  | After                                                 |
  | ------------------------------------------------------- | ----------------------------------------------------- |
  | ![Before: Settings / Connection](before-user-asset-url) | ![After: Settings / Connection](after-user-asset-url) |
  | Settings / Connection                                   | Settings / Connection                                 |
  ```

  Use `Before: absent` for a newly added state and `After: removed` for a
  deleted state. A failed capture **MUST NOT** be silently omitted.

- Keep generated captures under `.vishot/`. If the installed GitHub CLI
  supports `gh ... --attach`, use it to upload PR-only evidence. Otherwise,
  invoke `$upload-github-attachment` and use the returned user-attachment URL.
  **MUST NOT** commit PR-only evidence to the repository.

## Find the contract

| Task                                                                                                                   | Read                                            |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Understand what this project is, why it exists, and its longer-term direction                                          | [00 Goal](./.agents/00-goal.md)                 |
| Understand the overall design: provider/analyze-adapter boundaries, canonical data structures, caching, deferred scope | [01 Architecture](./.agents/01-architecture.md) |
| Understand a specific implementation phase's task breakdown                                                            | [plans/](./plans/)                              |
