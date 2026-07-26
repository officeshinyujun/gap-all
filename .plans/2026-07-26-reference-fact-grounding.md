# Reference fact grounding

## Goal

Reject reference-derived comparative-matrix questions whose visible table
introduces material facts not supported by the selected reference.

## Decisions

- Keep the existing template renderer unchanged: this is a backend generation
  data-fidelity defect, not a TPL loading defect.
- Add deterministic source-fact grounding before persistence. The current
  `sourceHash` and target-concept check is necessary but insufficient.
- Derive terms from structured source tables and require model-provided
  source-evidence bindings for comparative-matrix output.
- Reject comparative matrices that fail to render at least two source table
  terms in their headers or cells.
- Use the existing retry/source-replacement behavior for rejected candidates;
  never save an ungrounded candidate.
- Leave optional LLM semantic verification out of this change; deterministic
  grounding creates the required hard gate first.

## In scope

- [x] Add source fact extraction and grounding-binding types to the fidelity
      contract.
- [x] Require and validate bindings in `ExamRegeneratorService` before an
      accepted result is persisted.
- [x] Add matrix-template compatibility checks so derived tables require
      source-backed headers and cells.
- [x] Add regression tests for the observed contract-source / A-B-cost-table
      mismatch and valid grounded variants.
- [x] Run targeted backend tests, typecheck, and lint.

## Out of scope

- Frontend TPL renderer changes.
- Reconstructing incomplete source references.
- Retrofitting/deleting historical generated questions (handled separately).

## Verification

- PASS: `npm test -- --runInBand src/exams/reference-final-output-schema.spec.ts src/exams/reference-fact-grounding.spec.ts src/exams/exam-regenerator.reference-variant.spec.ts src/exams/reference-frame-generation.service.spec.ts src/exams/simply-reference-generation.service.spec.ts` — 129 passed.
- PASS: `npm run typecheck`.
- PASS: `npm run lint` — 0 errors; 81 pre-existing warnings remain.
- PASS: `git diff --check`.
