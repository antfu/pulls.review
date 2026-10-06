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

## Pull request visual evidence

When preparing or creating a pull request, invoke `$antfu-create-pr`. Its
title, body, and verification contract is authoritative; the rules below add
repository-specific visual evidence requirements without replacing that
contract.

When `$antfu-create-pr` handles a user-visible UI change, it **MUST** invoke
`$use-vishot` for before/after evidence. Let `$use-vishot` select the matching
runtime skill; pulls.review browser and Storybook surfaces normally use
`$use-vishot-with-web`.

- Prefer an existing Storybook story or product-owned scenario over an ad hoc
  capture route.
- Capture the same state from the merge base and proposed HEAD with identical
  viewport, fixture data, locale, theme, readiness condition, and stable ID.
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
