# Task 4 Safe Terminal Receipt Evidence

Date: 2026-07-24

## Focused Verification

```sh
npm --prefix backend test -- --runInBand src/exams/exams.service.spec.ts src/exams/exam-generation-jobs.service.spec.ts
```

Observed result: 2 suites and 14 tests passed.

```sh
npm --prefix backend run typecheck
```

Observed result: `tsc --noEmit --project tsconfig.eslint.json` exited 0.

```sh
git diff --check -- backend/src/exams/exams.service.ts backend/src/exams/exams.service.spec.ts
```

Observed result: exited 0.

## Safe Deadline Receipts

The service spec injects typed deadline expiry at `planner`, `final_generator`, and
`semantic_verifier` stages after a safe progress update. Each failure becomes the
stable public code `REFERENCE_GENERATION_TIMEOUT`; the existing receipt projection
retains the truthful public stage and counters (`progress: 65`, `completed: 2`,
`total: 3`, `attempt: 2`, `maxAttempts: 3`). The receipt does not contain source
IDs, provider response text, or raw error text.

Synchronous reference deadline failures use the same stable timeout code.

## Notification Isolation

Both notification-row creation failure and push-delivery failure are injected after
`complete()`. In both cases the receipt remains `status: completed`,
`progress: 100`, and `examId: exam-1`; the failure is emitted through the
operational logger and does not reach the outer job failure transition.

## Scope Preservation

Only `exams.service.ts`, its focused spec, and this evidence file were changed for
Todo 4. Receipt redaction/projection, cache, persistence, frontend, migrations, and
reference quality paths were left untouched.

`lsp_diagnostics` was unavailable because the TypeScript language server is not
installed and installation was previously declined.
