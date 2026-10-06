---
name: prefer-pr-body-as
description: Apply a named pull-request body profile on top of an existing PR creation workflow. Use when the user or repository asks for a specific PR body structure without replacing title, branch, push, creation, or attachment mechanics.
---

# Prefer PR Body As

Treat this skill as a body-format overlay. The calling PR workflow still owns
the title, branch, push, draft state, GitHub mutation, review replies, and merge
decisions.

## Select the profile

Resolve the requested profile from the user request or repository instructions.

- For the `airi` profile, read [references/airi.md](references/airi.md) before
  drafting or updating the body.
- If no profile is named, use a profile selected by the repository. When neither
  source selects one, ask for the intended profile instead of silently applying
  a house style.
- Do not combine profiles unless the repository explicitly defines how they
  compose.

## Apply the overlay

1. Preserve required headings from the repository's PR template.
2. Inspect the exact comparison and evidence required by the selected profile.
3. Add optional sections only when they reduce review cost for this diff.
4. Hand the completed body back to the calling PR workflow for publication.
5. After publication, read the PR back and verify headings, tables, diagrams,
   links, and image Markdown.

Repository instructions and explicit user requirements take precedence over the
selected profile. The profile takes precedence over generic body defaults from
the calling PR skill.

Using this skill does not authorize creating or editing a PR. It only changes
the body produced by an already-authorized workflow.
