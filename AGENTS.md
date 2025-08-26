# Repository Guidelines

This repository is currently a lightweight prototype scaffold. Use the conventions below to keep contributions consistent as the codebase grows.

## Project Structure & Module Organization
- Root: project config (`README.md`, `AGENTS.md`, `LICENSE`, `.gitignore`).
- Source: place implementation in `src/` (subfolders by feature or module).
- Tests: mirror structure in `tests/` (e.g., `tests/feature_x/`).
- Scripts & tooling: helper scripts in `scripts/`; docs in `docs/`; assets in `assets/`.

Example layout:
```
src/
tests/
scripts/
docs/
assets/
```

## Build, Test, and Development Commands
Prefer a `Makefile` (or package scripts) to standardize tasks:
- `make setup`: install dependencies and pre-commit hooks.
- `make build`: compile or validate the project.
- `make test`: run the full test suite.
- `make lint`: run linters/formatters.
- `make dev`: start a local dev server or watcher.

If using Node: `npm run build | test | lint | dev`. If using Python: `pytest` for tests, `ruff`/`black` for lint/format; wire these into `make` or `pyproject.toml`.

## Coding Style & Naming Conventions
- Style: keep code auto-formatted. For JS/TS use Prettier + ESLint; for Python use Black + Ruff.
- Indentation: 2 spaces (JS/TS), 4 spaces (Python).
- Naming: kebab-case for files (`user-profile.ts`), PascalCase for classes, camelCase for variables/functions, snake_case for Python modules.
- Keep functions small and typed where possible; document non-obvious behavior with concise comments.

## Testing Guidelines
- Frameworks: Jest/Vitest (JS/TS) or Pytest (Python).
- Structure: test files mirror `src/` and end with `.test.*` or `_test.py`.
- Coverage: target ≥80% for changed code; include edge cases and error paths.
- Run: `make test` (or `npm test` / `pytest`).

## Commit & Pull Request Guidelines
- Commits: follow Conventional Commits, e.g., `feat: add user lookup`, `fix(auth): handle expired token`.
- PRs: include a clear summary, linked issues, screenshots for UI changes, and a checklist of tests/linters passing. Keep PRs focused and small.

## Security & Configuration Tips
- Never commit secrets. Use `.env.local` and document required env vars in `README.md`.
- Pin critical dependencies and review third-party code.
