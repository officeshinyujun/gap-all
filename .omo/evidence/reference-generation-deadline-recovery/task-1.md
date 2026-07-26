# Reference Generation Deadline Recovery: Task 1 Evidence

## Scope

- Defined a deterministic reference-work budget with a default replacement allowance of `5`.
- Defined one effective cap for candidate scans and planner-reaching attempts, with a floor equal to `questionCount`.
- Defined redacted, mutually exclusive candidate terminal outcomes and reconciliation counts.
- Defined the fatal versus candidate-local failure contract without changing candidate-loop, receipt, provider-call, selection, model, prompt, schema, or persistence behavior.
- Added a deadline-stage minimum-useful-budget type seam for later admission integration.

## TDD Evidence

1. Baseline: `npm --prefix backend test -- --runInBand src/exams/reference-generation-budget.spec.ts`
   - Passed: 1 suite, 1 test.
2. Red: added budget/outcome contract tests before implementation.
   - Failed because `resolveReferenceGenerationWorkBudget`, `reconcileReferenceCandidateOutcomes`, and the failure-disposition function did not yet exist.
3. Green: added the minimum production contracts.
   - Passed: focused suite with 8 tests.

## Final Verification

- `npm --prefix backend test -- --runInBand src/exams/reference-generation-budget.spec.ts src/exams/reference-job-deadline.spec.ts`
  - Passed: 2 suites, 15 tests.
- `npm --prefix backend run typecheck`
  - Passed.
- `npm --prefix backend run build`
  - Passed.
- Import-level driver loaded `reference-generation-budget`, resolved a ten-question budget to both caps of `15`, and reconciled accepted/admission outcomes successfully.
- `git diff --check`
  - Passed.

## Contract Assertions

- Default ten-question scan and planner caps are both `15`.
- Negative, non-integer, and non-numeric overrides safely fall back to the default; zero retains a cap of `10` for ten requested questions.
- Candidate count output contains only `attempted`, `accepted`, `source`, `planner`, `fidelity`, and `admission`, with no source IDs, prompts, provider text, validation paths, or `deadlineAdmissionExhausted` field.
- Authentication, transport/service, and request-configuration failure kinds are marked fatal. Malformed model output and local validation are marked candidate-local. Runtime enforcement is intentionally deferred to the later candidate-loop integration task.
