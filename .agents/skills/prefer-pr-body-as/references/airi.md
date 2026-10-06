# AIRI PR Body Profile

Use this profile as a decision guide. Base every claim on the exact diff,
runtime evidence, or a named assumption. Keep a small PR small.

## Context brief

Before writing the body:

1. Record the repository, target branch, head branch, merge base, and exact
   `base...head` range.
2. For stacked work, name the parent branch or PR and separate inherited changes
   from this PR's changes.
3. Separate runtime code from generated files, lockfiles, snapshots, and
   migrations.
4. Trace changed files to relevant entry points, callers, state owners,
   persistence, adapters, providers, and external boundaries.
5. Mark unproven intent as an assumption or open question. Do not expose
   secrets, tokens, full user records, or payloads.

## Section selection

Every PR has:

- `## Summary`: state the changed user or system behavior, the result, and why
  this approach belongs in the PR. Name a parent PR or branch for stacked work.
- `## Verification`: list exact commands and outcomes, then name every
  unverified condition.

Add these sections only when they improve reviewability:

| Section                        | Use when                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `## Change map`                | Several modules, responsibilities, or ownership boundaries change.                          |
| `## Architecture and behavior` | Module flow, ordering, async work, events, IPC, cleanup, or state transitions change.       |
| `## Boundaries and risks`      | The change has meaningful invariants, failure modes, migrations, or external effects.       |
| `## Visual changes`            | The change affects user-visible UI.                                                         |
| `## Rollout and follow-up`     | The change needs migration order, feature gates, monitoring, known gaps, or a follow-up PR. |

Do not add empty sections or invent content to fill the profile.

## Change map

Describe modules or domain boundaries, not a changed-file list:

```markdown
| Module                 | Before                      | After                  | Description           |
| ---------------------- | --------------------------- | ---------------------- | --------------------- |
| `<module or boundary>` | `<previous responsibility>` | `<new responsibility>` | `<reason and effect>` |
```

Use a short responsibility tree only when layout or ownership is itself part of
the change.

## Architecture and behavior

Choose the smallest evidence form that explains each changed scenario:

- prose for a local path;
- a module flow for changed ownership or dependencies;
- a sequence diagram for ordering, async work, retries, cancellation, or
  cleanup;
- a state diagram for changed transitions or terminal states.

For a fix whose fault is explained by flow or state, show structurally
comparable `Before` and `After` diagrams. Follow the pair with the exact changed
edge, step, owner, or transition. Keep nodes tied to code symbols or real module
boundaries, label arrows with calls, events, commands, or data, and match each
diagram branch to a code branch.

If reviewers could reasonably expect a diagram but none applies, state why, for
example: `Not applicable: this change only updates documentation and does not
change runtime flow.`

## Boundaries and risks

Start with inputs and side effects. Then consider failure mapping, retries,
duplicates, concurrency, ordering, authorization, cleanup, migration, rollback,
external providers, persistence, and relevant UI states.

Use a table when several invariants or edge cases matter:

```markdown
| Invariant or boundary | Failure mode        | Protection               | Evidence or gap                             |
| --------------------- | ------------------- | ------------------------ | ------------------------------------------- |
| `<required behavior>` | `<how it can fail>` | `<code or design guard>` | `<test, runtime evidence, or Not verified>` |
```

Write `Not verified` instead of turning a risk question into a claim. Do not
write "safe", "fixed", or "backward compatible" without supporting evidence.

## Verification

Keep evidence types distinct:

- Focused tests prove only the behavior they cover.
- Typecheck and lint prove static checks.
- CI proves only its configured checks.
- Runtime checks prove only the inspected environment and state.
- Manual acceptance proves only the completed scenario.

Include failed or blocked checks with the concrete reason. Do not omit a gap
because another check passed.

## Visual changes

Follow the repository's visual-evidence workflow before composing this section.
Use one pair per affected state, with the image row before its label row:

```markdown
| Before                                                  | After                                                 |
| ------------------------------------------------------- | ----------------------------------------------------- |
| ![Before: Settings / Connection](before-user-asset-url) | ![After: Settings / Connection](after-user-asset-url) |
| Settings / Connection, 1440x900, dark                   | Settings / Connection, 1440x900, dark                 |
```

Use `Absent` for a new state and `Removed` for a deleted state. A failed capture
is blocking and must be reported rather than silently omitted.

## Rollout and follow-up

Use this optional section for migrations, feature gates, staged rollout,
monitoring, known gaps, or a required follow-up PR. State whether each gap
blocks merge or belongs to separate work.

## Sources

Adapted from AIRI's `create-pr` skill and PR body reference:

- <https://github.com/moeru-ai/airi/blob/main/.agents/skills/create-pr/SKILL.md>
- <https://github.com/moeru-ai/airi/blob/main/.agents/skills/create-pr/references/pr-body.md>
