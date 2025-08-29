# Repository Guidelines

This repository is a lightweight prototype scaffold. Keep contributions small, consistent, and easy to review. When in doubt, prefer clarity over cleverness.

## Project Structure & Module Organization
- Root: project config (`README.md`, `AGENTS.md`, `LICENSE`, `.gitignore`).
- Source code in `src/` (use subfolders per feature/module).
- Tests mirror `src/` in `tests/` (e.g., `tests/feature_x/`).
- Tooling/scripts in `scripts/`, docs in `docs/`, assets in `assets/`.

Example layout:
```
src/
  feature_x/
tests/
  feature_x/
scripts/
docs/
assets/
```

## Build, Test, and Development Commands
Prefer a `Makefile` to standardize tasks:
- `make setup`: install dependencies and pre-commit hooks.
- `make build`: compile/validate project.
- `make test`: run full test suite.
- `make lint`: run linters/formatters and fix issues where possible.
- `make dev`: start local dev server or watcher.

If no Makefile exists, use project-language defaults (e.g., Node: `npm run build | test | lint | dev`; Python: `pytest`, `ruff`, `black`).

## Coding Style & Naming Conventions
- Formatting: JS/TS use Prettier + ESLint; Python uses Black + Ruff.
- Indentation: 2 spaces (JS/TS), 4 spaces (Python).
- Naming: kebab-case for files (`user-profile.ts`); PascalCase for classes; camelCase for functions/variables; snake_case for Python modules.
- Keep functions small; document non-obvious behavior with brief comments.

## Testing Guidelines
- Frameworks: Jest/Vitest (JS/TS) or Pytest (Python).
- Structure: tests mirror `src/`; name as `*.test.*` (JS/TS) or `_test.py` (Python).
- Coverage: target ≥80% for changed code; include edge cases and error paths.
- Run tests via `make test` (or `npm test` / `pytest`).

## Commit & Pull Request Guidelines
- Commits: follow Conventional Commits (e.g., `feat: add user lookup`, `fix(auth): handle expired token`).
- PRs: clear summary, linked issues, screenshots for UI changes, checklist of tests/linters passing, and focused scope.

## Security & Configuration Tips
- Do not commit secrets; use `.env.local` and document required env vars in `README.md`.
- Pin critical dependencies; review third-party code.
- Keep the main branch green; run `make lint && make test` before pushing.
