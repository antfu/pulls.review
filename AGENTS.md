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

## Find the contract

| Task                                                                                                                   | Read                                            |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Understand what this project is, why it exists, and its longer-term direction                                          | [00 Goal](./.agents/00-goal.md)                 |
| Understand the overall design: provider/analyze-adapter boundaries, canonical data structures, caching, deferred scope | [01 Architecture](./.agents/01-architecture.md) |
| Understand a specific implementation phase's task breakdown                                                            | [plans/](./plans/)                              |
