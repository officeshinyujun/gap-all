# reference-generation-resilience - Work Plan
## TL;DR (For humans)
Keep the current source-faithful reference-question generator intact, but make all stages use one normalized canonical source target. Sparse textbook catalogs and multi-target references must become deterministic generation inputs or typed exact-count shortfalls, never uncaught job failures. No AI-path changes, migrations, corpus mutation, or partial persistence.

## Scope
IN: reference source normalization, concept reconciliation, planner/fidelity boundary checks, safe job diagnostics, corpus preflight, backend tests.
OUT: `sourceType: 'ai'`, frontend redesign, migrations, automatic source-data edits, weaker fidelity checks, partial exam persistence.

## Verification strategy
Tests-first for pure normalization. Fixture-driven service/job tests prove exact-count rollback. A deterministic offline corpus preflight reports only source IDs, canonical IDs, and machine codes. Run focused Jest, full Jest, typecheck, lint, and credentialed live QA when authorized.

## Execution strategy
Implement in dependency order: canonical source representation, shared concept key/reconciliation, planner/fidelity contract enforcement, typed job failures, corpus preflight, then broad verification. Preserve the dirty worktree and do not modify unrelated frontend, migration, AI, or import/reset work.

## Todos
- [x] 1. Normalize one canonical source target at every source entry point
  - **References:** `backend/src/exams/reference-selector.utils.ts`, `backend/src/exams/reference-selector.service.ts:137-151`, `backend/src/exams/reference-frame-generation.service.ts:174-275`.
  - **Implementation:** Add a typed normalized-source representation with one `primaryTargetConcept`; select the first parsed target as deterministic primary and retain no secondary target in the generation contract. Apply it in normal generation, `warmCachedFrames()`, cache writes, planner prompts, fidelity specs, final requests, and lineage. Prohibit re-parsing or independently selecting a target later.
  - **Acceptance:** Selector eligibility, planner request, fidelity input, final request, and lineage use the same primary target for every selected source.
  - **QA happy:** Add cases in `reference-frame-generation.service.spec.ts`; invoke `generate()` and warmup with a multi-target fixture; assert one target in planner prompt, cached frame, request, and lineage.
  - **QA failure:** Invoke the same service with missing/blank target; assert typed skip code and zero planner/final calls.
  - **Commit:** `fix(reference): normalize canonical source targets`

- [x] 2. Unify concept-key and catalog reconciliation rules
  - **References:** `backend/src/exams/reference-concept-catalog-resolver.ts`, `backend/src/exams/reference-frame-generation.service.ts:610-700`, `backend/src/exams/reference-selector.utils.ts`.
  - **Implementation:** Create one NFC/trim/collapsed-whitespace/case-normalized concept-key helper used by selection, reconciliation, and IDs. Preserve textbook display label and ID for one normalized textbook match; derive source IDs from the normalized key only when absent. Multiple distinct textbook labels sharing a normalized key are typed ambiguity; source duplicates collapse to the first display label.
  - **Acceptance:** Empty textbook units and source-only labels resolve; duplicate/Unicode-equivalent labels do not create conflicting IDs.
  - **QA happy:** Add `reference-concept-catalog-resolver.spec.ts` cases for empty `kongil` unit, whitespace/case/Unicode-equivalent source labels, and stable derived IDs.
  - **QA failure:** Assert duplicate normalized textbook labels yield typed ambiguity and no planner call.
  - **Commit:** `fix(reference): reconcile source and textbook concepts`

- [x] 3. Enforce canonical target at planner and fidelity boundaries
  - **References:** `backend/src/exams/reference-frame-planner.service.ts`, `backend/src/exams/reference-frame-generation.service.ts:255-390`, `backend/src/exams/reference-fidelity-spec.ts:87-160`.
  - **Implementation:** Require planner payload `targetConceptIds` to equal the normalized source primary ID; construct fidelity specs from normalized single-target source only; reject mismatches before final generation. Build an ordered candidate pool larger than requested and continue selection/planning/finalization after typed source/planner/fidelity rejects until exact count is reached or exhausted; aggregate redacted per-stage counts.
  - **Acceptance:** `INVALID_TARGET_CONCEPTS` cannot arise from a valid multi-target parsed source; final prompt contains exactly one canonical target.
  - **QA happy:** In `reference-frame-generation.service.spec.ts`, make an early candidate reject and a later candidate pass; assert exact requested count and stable ordering.
  - **QA failure:** Assert planner target/scope mismatch is counted, no final call occurs for it, and exhausted pool returns typed shortfall counts.
  - **Commit:** `fix(reference): enforce canonical target contracts`

- [x] 4. Replace uncaught source failures with typed exact-count outcomes
  - **References:** `backend/src/exams/reference-frame-generation.service.ts:200-430`, `backend/src/exams/exams.service.ts:458-575`, `backend/src/exams/exam-generation-jobs.service.ts`.
  - **Implementation:** Classify invalid sources before planning, continue with replacements, and return redacted `REFERENCE_GENERATION_SHORTFALL` if exact count cannot be met. Add a public job-receipt DTO for both job creation and polling that omits `request.referenceSourceIds`, raw errors, source IDs, and source prose; sanitize synchronous errors equally. Preserve no-write transaction behavior.
  - **Acceptance:** One invalid source does not crash a job; terminal shortfall creates no Question, ExamItem, or ExamRecord.
  - **QA happy:** In `exams.persistence.spec.ts` and job tests, assert replacement candidates persist only at exact count and public job receipt excludes source metadata.
  - **QA failure:** Assert all-invalid/exhausted jobs return code/counts, poll response omits source IDs, and repository transaction/question/item/exam saves remain zero.
  - **Commit:** `fix(reference): return safe source generation shortfalls`

- [x] 5. Make fixtures and mocks represent real source contract variants
  - **References:** `backend/src/exams/reference-frame-generation.service.spec.ts`, `backend/src/exams/reference-frame-planner.fixtures.ts`, `backend/src/exams/reference-frame-planner.fixtures.data.ts`.
  - **Implementation:** Split reusable planner mocks by source topology and make mocked payloads derive their target ID and answer topology from the received planner request. Add fixtures for empty catalog, multi-target, catalog collision, and malformed source target cases.
  - **Acceptance:** Tests fail only for intended contract violations, not because a generic mock returns an unrelated payload.
  - **QA happy:** All fixture families reach intended validation layer.
  - **QA failure:** Wrong primary ID, stale catalog ID, and invalid answer topology assert their specific reason codes.
  - **Commit:** `test(reference): model source contract variants`

- [x] 6. Add deterministic corpus preflight and release evidence
  - **References:** `backend/src/textbook/reference-catalog-import.service.ts`, `backend/scripts/reference-live-qa.ts`, `backend/package.json`.
  - **Implementation:** Add a read-only preflight script that scans the persisted `ReferenceQuestion` catalog used by production (not only filesystem imports), validates logical source ID/payload consistency, normalizes/reconciles primary targets, and emits sorted redacted JSON/Markdown with source ID, canonical ID, and machine result. Exit nonzero for unresolved/ambiguous rows; do not mutate data.
  - **Acceptance:** Every production reference is classified before live generation; output contains no source prose or credentials.
  - **QA happy:** Test the script/service with an in-memory persisted-catalog reader and assert sorted stable report bytes.
  - **QA failure:** Assert malformed logical ID, missing target, and collision records exit nonzero with deterministic machine lines and no writes.
  - **Commit:** `test(reference): preflight generation source contracts`

## Final verification wave
- [~] F1. Plan-compliance audit
  - Run `git diff --check`; inspect changed paths against Scope; confirm no AI-path, migration, frontend redesign, corpus mutation, or partial-persistence behavior was introduced.
- [~] F2. Code-quality and type-contract audit
  - Run `npm run typecheck && npm run lint`; inspect shared normalizer, redaction, and typed errors.
- [~] F3. Real manual QA
  - With authorized backend/database/provider credentials, run the persisted-catalog preflight, create 성직 and sparse-unit 공일 reference jobs, poll their public receipts, and inspect rendered output. Pass only when preflight is green, jobs return exact count, and receipts contain no source IDs/prose.
- [x] F4. Scope-fidelity and persistence audit
  - Run `npm test -- --runInBand exams.persistence.spec.ts exam-generation-jobs.service.spec.ts reference-frame-generation.service.spec.ts`; assert valid lineage receipt persistence and shortfall zero counts for `Question`, `ExamItem`, and `ExamRecord` repository writes.

## Commit strategy
Keep commits in todo order: normalization; reconciliation; contract boundaries; failure surface; fixtures; preflight. Never mix unrelated dirty-worktree changes or generated live artifacts.

## Success criteria
1. Every selected reference has exactly one normalized canonical target across selector, planner, fidelity, final generation, and lineage.
2. Sparse textbook catalogs resolve trusted source targets without changing existing textbook canonical IDs.
3. Multi-target source records no longer cause `INVALID_TARGET_CONCEPTS`.
4. Invalid sources produce structured exact-count shortfalls, never uncaught job failures or partial writes.
5. Corpus preflight catches unresolved/collision records before users run jobs.
