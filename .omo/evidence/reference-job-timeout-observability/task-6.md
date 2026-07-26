# Todo 6 Evidence: Backend-Only Regression QA

Date: 2026-07-24

## Scope

Todo 6 was revised to prohibit authenticated/live HTTP QA and credentials. The verification surface is backend-only and deterministic. No live job, user, token, provider request, database mutation, or cleanup operation was run.

Changed paths:

- `backend/src/exams/reference-generation-contract.fixtures.ts`
- `backend/src/exams/reference-generation-contract.characterization.spec.ts`
- `backend/src/exams/exam-regenerator.reference-variant.spec.ts`

No frontend, migration, corpus, prompt/model, selection/fidelity implementation, or queue-infrastructure path was changed. The temporary credential-dependent QA script and package entry were removed as redundant under the revised scope.

## Verification

| Command | Exit | Result |
| --- | ---: | --- |
| `npm test -w backend -- --runInBand src/exams/reference-frame-generation.service.spec.ts src/exams/reference-frame-planner.service.spec.ts src/exams/reference-frame-planner.validation.spec.ts src/exams/exam-regenerator.reference-variant.spec.ts src/exams/exams.persistence.spec.ts src/exams/exam-generation-jobs.service.spec.ts src/exams/exams.service.spec.ts src/exams/reference-generation-contract.characterization.spec.ts` | 0 | 8 suites passed; 116 tests passed. |
| `npm run typecheck -w backend` | 0 | Backend TypeScript typecheck passed. |
| `npm run build -w backend` | 0 | Nest backend build passed. |
| `npm run preflight:reference-catalog:markdown -w backend` | 1 | Existing catalog preflight failure: 1,280 rows, 924 failures, including `INVALID_LOGICAL_SOURCE_ID` and `INVALID_SOURCE_PAYLOAD`; no mutation occurred. |
| `git diff --check` | 0 | No whitespace errors. |

The characterization fixture preserves the current planner model, system message, strict schema mode/names, temperature, source-target and unit-range inputs, distractor-axis preservation, final model/temperature/schema/exact-count, semantic-verifier model/temperature/format, and existing bounded correction behavior. Persistence and job receipt suites cover exact-count transactional writes, zero-write failure paths, cleanup-safe state, redaction, monotonic progress, and terminal receipt behavior.

## Verdict

Backend regression QA, typecheck, and build passed. Catalog preflight remains a pre-existing failing gate and is recorded without changing catalog data. No authenticated/live HTTP QA or credentials were required or used.
