# Reference-Faithful Regeneration Candidate Allowlist

Base revision: `29d7e2d134e2a36946e824dd5b29a945c423c27d` (detached worktree).

This candidate contains only the reference-faithful regeneration surface from
the active plan. It deliberately excludes frontend code, migrations, catalog
import/reset paths, general AI QA, and non-reference API changes.

## Added File Allowlist

- `backend/scripts/reference-live-qa.ts`
- `backend/scripts/reference-live-qa-artifact.ts`
- `backend/tsconfig.eslint.json` (test/typecheck harness configuration only)
- `backend/src/exams/fixtures/reference-planner-failures/manifest.json`
- `backend/src/exams/exam-regenerator.reference-variant.spec.ts`
- `backend/src/exams/exam-regenerator.service.spec.ts`
- `backend/src/exams/exams.persistence.spec.ts`
- `backend/src/exams/exams.service.spec.ts`
- `backend/src/exams/interview-scene.ts` (a direct reference-variant
  conversational-template dependency; it is not a general AI execution path)
- `backend/src/exams/stimulus-normalizer.spec.ts`
- `backend/src/exams/tpl-schemas.spec.ts`
- `backend/src/exams/tpl-schemas.ts` (structured-template export required by
  the reference selector and final generator)
- `backend/src/exams/reference-archetype*`
- `backend/src/exams/reference-batch-chunker*`
- `backend/src/exams/reference-concept-catalog-resolver.ts`
- `backend/src/exams/reference-contract-invariants.ts`
- `backend/src/exams/reference-fidelity-spec*`
- `backend/src/exams/reference-fidelity-validator*`
- `backend/src/exams/reference-final-batch-chunker.spec.ts`
- `backend/src/exams/reference-final-output-schema*`
- `backend/src/exams/reference-frame-*`
- `backend/src/exams/reference-generation-batch-builder*`
- `backend/src/exams/reference-generation-budget*`
- `backend/src/exams/reference-generation-metrics*`
- `backend/src/exams/reference-generation-model*`
- `backend/src/exams/reference-generation-output-validator*`
- `backend/src/exams/reference-generation-persistence*`
- `backend/src/exams/reference-generation-usage*`
- `backend/src/exams/reference-live-qa-artifact.spec.ts`
- `backend/src/exams/reference-question-catalog*`
- `backend/src/exams/reference-selector*`
- `backend/src/exams/reference-slot-allocator*`
- `backend/src/exams/reference-structure-blueprint.validator.ts`
- `backend/src/exams/reference-tpl-selector*`
- `backend/src/exams/reference-variant-repair*`
- `backend/src/exams/reference-variant-semantic-verifier*`

`reference-blueprint*`, `reference-contract-parity.spec.ts`, and
`reference-generation-blueprint.integration.spec.ts` are excluded: they are
not named by the active faithful-regeneration plan and are not dependencies of
its focused suites.

## Shared-File Hunk Allowlist

Only hunks whose additions or removals contain `reference`, `Reference`,
`fidelity`, `Fidelity`, `generationLineage`, or `REFERENCE_` are transferred
from the following tracked files. The candidate retains the non-mutating
`typecheck`/`lint` scripts needed for attribution, but excludes
`import:reference-catalog`.

- `backend/package.json`
- `backend/src/entities/question.entity.ts`
- `backend/src/exams/exam-generation-jobs.service.ts`
- `backend/src/exams/exam-question-validator.ts`
- `backend/src/exams/exam-regenerator.service.ts`
- `backend/src/exams/exams.module.ts`
- `backend/src/exams/exams.service.ts`
- `backend/src/exams/stimulus-normalizer.ts`
- `backend/src/exams/tpl-schemas.ts`

The hunk predicate intentionally prevents transfer of the mixed general AI
behavior, frontend, migration, import, reset, and catalog changes in the
primary worktree.
