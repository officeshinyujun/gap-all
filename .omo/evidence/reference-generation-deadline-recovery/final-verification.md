# Final Verification

- `npm --prefix backend test -- --runInBand src/exams/reference-generation-budget.spec.ts src/exams/reference-job-deadline.spec.ts`
  - Passed: 2 suites, 20 tests.
- `npm --prefix backend test -- --runInBand src/exams/exam-regenerator.reference-variant.spec.ts src/exams/exams.persistence.spec.ts src/exams/reference-frame-cache.persistence.spec.ts`
  - Passed: 3 suites, 65 tests.
- Task 6 regression matrix passed: 4 suites, 101 tests.
- Backend typecheck and `git diff --check` passed.

The test output contains expected rejection-path warning logs from fidelity fixtures. The repository also has a large pre-existing untracked working tree, so a Git-only scope-fidelity audit cannot establish a clean baseline.
