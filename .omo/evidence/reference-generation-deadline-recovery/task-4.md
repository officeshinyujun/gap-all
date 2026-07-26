# Reference Generation Deadline Recovery: Task 4 Evidence

## Scope

- Added typed downstream-reserve admission to the job-local deadline helper.
- Preserved the independent absolute-deadline race for providers that ignore abort.
- Treated proactive admission as a candidate-local outcome while leaving actual expiry as the existing timeout error.
- Preserved serial candidate order, task-3 caps/accounting, cache use, prompts, models, schemas, validators, receipts, and persistence.

## TDD Evidence

1. Baseline: `npm --prefix backend test -- --runInBand src/exams/reference-job-deadline.spec.ts src/exams/reference-frame-generation.service.spec.ts src/exams/exam-regenerator.reference-variant.spec.ts`
   - Passed before the task-4 tests were added.
2. Red: added equal-reserve, one-ms-short, retry-suppression, cache-path, and no-viable-path cases.
   - Failed as expected: one-ms-short started a provider call, retry recursion made three provider calls, and candidate admission did not yet distinguish the cached path.
3. Green: added downstream reserves and focused candidate/retry integration.
   - Passed: 3 suites, 99 tests.

## Final Verification

- `npm --prefix backend test -- --runInBand src/exams/reference-job-deadline.spec.ts src/exams/reference-frame-generation.service.spec.ts src/exams/exam-regenerator.reference-variant.spec.ts`
  - Passed: 3 suites, 99 tests.
- `npm --prefix backend run typecheck`
  - Passed.
- Import-level driver with `node -r ts-node/register`
  - Passed: exact planner reserve admitted once; one millisecond short threw `ReferenceJobDeadlineAdmissionError` before invoking its provider.

## Contract Assertions

- Default useful minimums are 30 seconds for planner, final generation, and semantic verification. Provider admission reserves the current stage plus every downstream stage; equality admits.
- An uncached candidate reserves a second planner minimum for its frame-plus-payload path. A cached frame reserves the cheaper one-planner-call path, preserving deterministic recovery to a later viable cache hit.
- Planner retry waits and final/semantic retry calls stop before they consume downstream reserve. Admission is terminal for that candidate, while real `ReferenceJobDeadlineExceededError` still escapes as timeout.
- The helper still races deadline expiry against provider completion and aborts the signal; the existing abort-ignoring regression remains covered.

## Planner Retry Reserve Repair

- Frame-stage retries now reserve one additional planner minimum for the required later payload request, in addition to the retried frame, final generator, and semantic verifier reserves.
- Payload-stage retries retain the normal single planner reserve because no further planner stage follows them.
- Added a focused regression with a 70ms deadline and `10/20/30` stage minimums: after a malformed frame response consumes 5ms, the 65ms remainder cannot fund retry-frame plus payload plus final plus semantic work. The retry throws typed admission before a second provider invocation.
- `npm --prefix backend test -- --runInBand src/exams/reference-job-deadline.spec.ts src/exams/reference-frame-planner.service.spec.ts src/exams/reference-frame-generation.service.spec.ts`
  - Passed: 3 suites, 49 tests.
- `npm --prefix backend run typecheck`
  - Passed.
- `git diff --check`
  - Passed.
