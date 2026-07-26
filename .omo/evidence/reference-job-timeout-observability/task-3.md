# Task 3 Reference Job Progress and Deadline Evidence

Date: 2026-07-24

## Focused Verification

```sh
npm --prefix backend test -- --runInBand src/exams/reference-frame-generation.service.spec.ts src/exams/exam-regenerator.reference-variant.spec.ts src/exams/reference-frame-planner.service.spec.ts src/exams/reference-job-deadline.spec.ts src/exams/exam-generation-jobs.service.spec.ts src/exams/exams.service.spec.ts src/exams/exams.persistence.spec.ts
```

Observed result: 7 suites and 98 tests passed.

```sh
npm --prefix backend run typecheck
```

Observed result: `tsc --noEmit --project tsconfig.eslint.json` exited 0.

`git diff --check` exited 0.

## Controlled In-Process QA

The focused `ExamRegeneratorService` deadline test used Jest fake time with an actual `ReferenceJobDeadline` and a provider that ignored cancellation during semantic verification.

- Final generation settled first and produced the safe `fidelity` milestone at 60%.
- Advancing the deadline to 100 ms rejected with `ReferenceJobDeadlineExceededError` at `semantic_verifier`.
- The observed milestones stayed `['fidelity']`; no `final` milestone and no accepted result appeared after expiry.

The reference-frame generation flow separately verified `selection` at 15% and `planner` at 35% only after their work settled, and propagated a final-stage deadline error without starting the later replacement candidate.

## Contract Preservation

- Characterization coverage confirms final and verifier provider model IDs, message positions, response formats, strict final schema, temperatures, and accepted result path remain unchanged.
- Existing final-request chunking, retry limits, selection order, validators, and exact-count behavior remain covered by the focused suites.
- No cache, persistence, notification, frontend, migration, prompt, model, schema, or validator behavior was changed by this task.

## Diagnostics

`lsp_diagnostics` is unavailable because the TypeScript language server is not installed and installation was previously declined.
