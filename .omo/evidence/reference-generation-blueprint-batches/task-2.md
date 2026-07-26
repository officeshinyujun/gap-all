# Todo 2 Evidence

Date: 2026-07-21

## Changed Paths
- `backend/src/exams/generation-data-reset.service.ts`
- `backend/src/exams/generation-data-reset.service.spec.ts`

## Safety Contract
- Requires non-production `nodeEnv`, database suffix `_generation_test`, exact confirmation `RESET_GENERATION_DATA`, and a non-empty backup manifest id.
- Uses a transaction abstraction and a fixed allowlist only: `generation_exam_items`, `generation_exam_sessions`, `generated_questions`, `generation_runs`, and `reference_questions`.
- Uses no wildcard SQL, no schema drop, and no existing shared tables such as `exam_records`, `exam_items`, or `questions`.

## Verification
- PASS: `npm test -- --runInBand generation-data-reset.service.spec.ts`; 5 tests passed.
- PASS: `npm run typecheck` from `backend`.
- PASS: direct ts-node manual invocation emitted 5 statements, first `DELETE FROM generation_exam_items`, last `DELETE FROM reference_questions`.
- TypeScript LSP unavailable; typecheck passed.

## Adversarial Checks
- malformed input: production, wrong DB, wrong confirmation, and missing backup manifest all reject before `execute` is called.
- dirty_worktree: implementation touched only Todo 2 service/spec paths.
- stale_state: reset uses no cached/ambient state; all safety values are explicit request fields.
- misleading_success_output: tests assert query list and zero query execution on failures.
- external credentials, prompt injection, cancel/resume, generated cache, and long-running command: not applicable to the pure in-process transaction contract.

## Cleanup
- No database connection, process, server, temporary file, provider client, or destructive SQL execution was created.
