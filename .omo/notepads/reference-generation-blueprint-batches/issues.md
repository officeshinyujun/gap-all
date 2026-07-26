# Issues

## 2026-07-21 Execution initialization
- A separate active Boulder work exists for `question-art-layer`; do not modify or rely on its changes.

## 2026-07-21 Todos 18-20 blocked
- The configured database is not an approved disposable fixture database (`*_generation_test`), so real corpus import, re-import integrity, and the bounded real job must not run. No destructive import or provider job was attempted.

## 2026-07-21 Final wave blocked
- Scoped lint for the added generation/reference modules and backend typecheck pass. Full backend lint fails on many pre-existing dirty-worktree formatting/errors outside this plan's scope, so F2 cannot approve.
- F1/F3/F4 cannot approve while Todos 18-20 remain blocked by the missing approved fixture DB and real-job environment.

## 2026-07-21 Todo 18 guarded execution blocked
- Observed non-secret local configuration: `NODE_ENV=development`, `DATABASE_URL` host `localhost`, database `gap`. The database name does not end in the required `_generation_test` suffix, so the reset/import preflight is not approved. No reset, database connection, corpus import, catalog query, or manifest write was attempted.
- No backup-manifest artifact was present under `.omo` (`backup_manifest_artifact_count=0`). No explicit `RESET_GENERATION_DATA` confirmation was supplied because the disallowed database target already prevented authorization.
- Safe remediation: provision a disposable non-production fixture database whose name ends in `_generation_test`, retain an existing non-empty backup manifest identifier for that fixture, and invoke an existing supported transaction-backed importer with the exact confirmation. Rerun Todo 18 from checksum preflight; Todo 19 remains blocked until that succeeds.

## 2026-07-21 Final Wave F2 blocked
- Full backend Jest passed (33 suites, 152 tests), backend typecheck/build passed, and `git diff --check` passed.
- Full backend lint still fails on pre-existing dirty-worktree formatting/type errors across multiple unrelated backend files. F2 cannot approve until those baseline lint errors are resolved or isolated.

## 2026-07-21 Todo 18 import boundary correction
- TypeScript LSP is unavailable in this workspace because installation was previously declined; the required backend `tsc --noEmit` typecheck completed successfully instead.

## 2026-07-21 Reference-generation lint correction
- Full backend lint now exits 0 after resolving the remaining 10 scoped errors. It retains 70 warning-only diagnostics outside this lint-only correction.
- This records lint remediation only and does not mark Final Wave F2 complete; the existing guarded-execution blockers remain in effect.
