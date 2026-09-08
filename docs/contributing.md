# Contributing to Lumen

Thank you for contributing to Lumen!

---

## Development Workflow

1. Fork and clone the repository.
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Run linting, typechecking, and tests:
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   ```

---

## Suggested Branch Protection Rules

For repository maintainers, we recommend configuring the following GitHub branch protection rules on `main`:

1. **Require status checks to pass before merging**:
   - `ci` (Continuous Integration workflow)
2. **Require a pull request before merging**:
   - Require at least 1 approving review.
   - Dismiss stale pull request approvals when new commits are pushed.
3. **Require linear history**: Prevent merge commits if desired.
4. **Include administrators**: Enforce restrictions on repository admins to maintain safety.
