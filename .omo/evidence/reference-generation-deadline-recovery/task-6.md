# Task 6 Evidence

- `npm --prefix backend test -- --runInBand src/exams/reference-generation-contract.characterization.spec.ts src/exams/reference-frame-generation.service.spec.ts src/exams/exam-regenerator.reference-variant.spec.ts src/exams/exams.service.spec.ts`
  - Passed: 4 suites, 101 tests.
- `npm --prefix backend run typecheck`
  - Passed.
- `git diff --check`
  - Passed.

The characterization matrix preserves the reference-generation contract while covering bounded recovery and receipt behavior. Test warnings are expected rejection-path logging from the exercised fidelity cases.
