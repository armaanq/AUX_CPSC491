# Contributing

## Branching (trunk-based)

- `main` is always deployable. Nobody commits to `main` directly.
- Branch off `main` for every piece of work, using a short-lived branch:
  - `feat/<short-description>` — new functionality
  - `fix/<short-description>` — bug fix
  - `chore/<short-description>` — tooling, config, deps, docs
- Keep branches small and short-lived (ideally merged within a few days). Rebase on `main` if it drifts.

## Pull requests

- Open a PR into `main` as soon as a branch has something reviewable.
- At least **1 approval** is required before merging.
- Squash-merge (or rebase-merge) to keep `main` history linear.
- Delete the branch after merging.
- Reference the relevant week/milestone from the project plan in the PR description when applicable.

## Commits

Use short, imperative commit messages, e.g.:

```
Add album comparison endpoint
Fix ranking score rounding
```

## Code review checklist

- Does it build (`npm run build` in `mobile` and/or `server`)?
- Does it pass lint/type checks?
- Is it scoped to one concern (avoid bundling unrelated changes)?

## Local setup

See the root [README](README.md) for environment setup instructions.
